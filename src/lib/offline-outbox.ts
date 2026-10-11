"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { translate } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { useSyncStore } from "@/stores/sync-store";

// ============================================================
// SECTION: Offline outbox
// ------------------------------------------------------------
// How Ordix works without internet:
//
//   1. READS: the service worker caches every successful GET
//      /api/* response (network-first), so boards/catalog keep
//      rendering the last known data while offline (the UI flags
//      it stale via the polling hook).
//
//   2. WRITES: when a mutation (POST/PATCH/DELETE) fails at the
//      network level, api-client queues it HERE — in IndexedDB,
//      which survives reloads and app restarts on the tablet —
//      and the user gets a "saved offline" confirmation.
//
//   3. SYNC: as soon as connectivity returns (browser `online`
//      event, app launch, or the 30 s retry while items are
//      pending), the queue is replayed in original order. The
//      server keeps enforcing every rule at replay time: order
//      numbers are allocated then, stock is re-checked, and a
//      replay that no longer applies (e.g. stock gone) comes
//      back as a 4xx → dropped with a visible "sync failed"
//      toast instead of silently corrupting data.
//
// Single-flusher guarantee: the Web Locks API ensures only one
// tab per device replays the queue at a time (two tablets each
// have their own queue; two tabs on one tablet share it).
// ============================================================

export interface QueuedOperation {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body: unknown;
  /** Short human label for sync toasts ("New order", …). */
  label: string;
  createdAt: number;
}

const DB_NAME = "ordix-outbox";
const STORE_NAME = "requests";
const DB_VERSION = 1;
const FLUSH_LOCK = "ordix-outbox-flush";

/** Fallback when IndexedDB is unavailable (private mode): memory only. */
const memoryQueue: QueuedOperation[] = [];

// ============================================================
// SECTION: IndexedDB plumbing
// ============================================================

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      open.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
  });
}

// ============================================================
// SECTION: Queue operations
// ============================================================

export async function enqueueOperation(operation: QueuedOperation): Promise<void> {
  if (!hasIndexedDb()) {
    memoryQueue.push(operation);
  } else {
    await withStore("readwrite", (store) => store.put(operation));
  }
  await refreshPendingCount();
}

export async function getPendingOperations(): Promise<QueuedOperation[]> {
  if (!hasIndexedDb()) {
    return [...memoryQueue].sort((a, b) => a.createdAt - b.createdAt);
  }
  const all = await withStore<QueuedOperation[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

async function removeOperation(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    const index = memoryQueue.findIndex((op) => op.id === id);
    if (index >= 0) memoryQueue.splice(index, 1);
    return;
  }
  await withStore("readwrite", (store) => store.delete(id));
}

/** Push the current queue length into the UI store. */
export async function refreshPendingCount(): Promise<void> {
  const pending = (await getPendingOperations()).length;
  useSyncStore.getState().setPending(pending);
}

// ============================================================
// SECTION: Network-failure detection
// ------------------------------------------------------------
// fetch() rejects with TypeError on network failures (DNS, refuse,
// offline). HTTP error statuses are NOT failures here — the server
// answered, so the request does NOT get queued.
// ============================================================

export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError;
}

/** True when the error is "queued offline" (screens show info, not error). */
export function isOfflineQueuedError(error: unknown): boolean {
  return error instanceof OfflineQueuedError;
}

/** Thrown by api-client after a mutation was safely queued. */
export class OfflineQueuedError extends Error {
  readonly label: string;

  constructor(label: string) {
    super(translate("offline.queued"));
    this.name = "OfflineQueuedError";
    this.label = label;
  }
}

// ============================================================
// SECTION: Friendly labels for sync toasts
// ============================================================

export function describeOperation(
  method: string,
  url: string,
  body: unknown
): string {
  const path = url.split("?")[0];
  const payload = (body ?? {}) as Record<string, unknown>;

  if (method === "POST" && path === "/api/orders") {
    return typeof payload.customerName === "string" && payload.customerName
      ? `Order · ${payload.customerName}`
      : "New order";
  }
  if (path.endsWith("/items")) return "Add round";
  if (path.endsWith("/tracking")) return "Courier info";
  if (path.endsWith("/status")) {
    return typeof payload.status === "string" ? `Order → ${payload.status}` : "Status update";
  }
  if (path.includes("/items/") && payload.action === "void") return "Void item";
  if (path.includes("/items/")) return "Packing update";
  if (path === "/api/stock/adjust") return "Stock adjustment";
  if (path === "/api/settings") return "Settings";
  if (path.startsWith("/api/products")) return method === "DELETE" ? "Delete product" : "Product update";
  if (path.startsWith("/api/categories")) return "Category update";
  return "Change";
}

// ============================================================
// SECTION: Flush (replay the queue)
// ============================================================

export interface FlushResult {
  synced: number;
  failed: number;
  /** -1 = another tab is flushing / nothing attempted. */
  remaining: number;
}

/**
 * Replay queued mutations oldest-first. Safe to call from anywhere
 * (online event, mount, interval, indicator click) — concurrent
 * calls are collapsed by the Web Locks API.
 */
export async function flushOutbox(): Promise<FlushResult> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    const locks = navigator.locks as LockManager;
    // Non-async callback so LockManager.request<T> infers T = FlushResult.
    return locks.request(FLUSH_LOCK, { ifAvailable: true }, (lock) =>
      lock ? flushAll() : Promise.resolve({ synced: 0, failed: 0, remaining: -1 })
    );
  }
  return flushAll();
}

async function flushAll(): Promise<FlushResult> {
  const operations = await getPendingOperations();
  let synced = 0;
  let failed = 0;

  for (const operation of operations) {
    try {
      const response = await fetch(operation.url, {
        method: operation.method,
        headers: { "Content-Type": "application/json" },
        body: operation.body !== undefined ? JSON.stringify(operation.body) : undefined,
        cache: "no-store",
      });

      if (response.ok) {
        await removeOperation(operation.id);
        synced += 1;
        toast.success(`${translate("offline.synced", { label: operation.label })}`);
        continue;
      }

      // 4xx = the server rejected the replay (e.g. stock vanished
      // while offline). Drop it loudly rather than retry forever —
      // the user must re-do it against current reality.
      if (response.status < 500) {
        let message = `HTTP ${response.status}`;
        try {
          const data = (await response.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // keep generic
        }
        await removeOperation(operation.id);
        failed += 1;
        toast.error(`${translate("offline.syncFailed", { label: operation.label })} — ${message}`);
        continue;
      }

      // 5xx: server-side trouble — stop and retry on the next tick.
      break;
    } catch {
      // Network dropped mid-flush — stop; remaining items stay queued.
      break;
    }
  }

  await refreshPendingCount();
  const remaining = (await getPendingOperations()).length;
  return { synced, failed, remaining };
}

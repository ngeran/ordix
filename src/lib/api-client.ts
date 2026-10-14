"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import {
  OfflineQueuedError,
  describeOperation,
  enqueueOperation,
  isNetworkFailure,
  isQueueable,
} from "@/lib/offline-outbox";
import { translate } from "@/lib/i18n";
import { toast } from "@/stores/toast-store";
import { useSettingsStore } from "@/stores/settings-store";
import { uuid } from "@/lib/uuid";

// ============================================================
// SECTION: Fetch wrapper (client-side)
// ------------------------------------------------------------
// Thin typed wrapper around fetch used by every client
// component. Responsibilities:
//   - JSON encode/decode + headers
//   - throw ApiError with the server's message (routes return
//     { error: string } envelopes)
//   - OFFLINE WRITES: a mutation that fails at the network level
//     is queued in IndexedDB (offline-outbox) and surfaces as an
//     OfflineQueuedError — screens show "saved offline" instead
//     of an error; the queue replays automatically on reconnect.
//   - no-store everywhere: data must never be cached by the
//     browser because stock/status change constantly (offline
//     READ caching lives in the service worker instead)
// ============================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const method = rest.method ?? "GET";

  try {
    const response = await fetch(url, {
      ...rest,
      cache: "no-store",
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...rest.headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const data = (await response.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        // keep the generic message
      }
      throw new ApiError(message, response.status);
    }

    // 204 No Content (used by DELETE endpoints)
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    // Network-level failure on a mutating request:
    //   - queueable (order creation / round append) → IndexedDB
    //     outbox + "saved offline" confirmation to the caller
    //   - anything else (cancellations, catalog edits) → a clear
    //     needs-connection error; they must not silently replay
    if (method !== "GET" && !(error instanceof ApiError) && isNetworkFailure(error)) {
      // Settings → Features → "Offline orders" can turn queueing off.
      const offlineQueue = useSettingsStore.getState().settings.features.offlineQueue;
      if (offlineQueue && isQueueable(method, url)) {
        const label = describeOperation(url);
        await enqueueOperation({
          id: uuid(),
          url,
          method: method as "POST" | "PATCH" | "DELETE",
          body: json,
          label,
          createdAt: Date.now(),
        });
        throw new OfflineQueuedError(label);
      }
      throw new ApiError(translate("offline.needsConnection"), 0);
    }
    throw error;
  }
}

/** Typed REST helpers — `api.get<OrderSummary[]>("/api/orders?scope=active")`. */
export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "POST", json }),
  patch: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "PATCH", json }),
  put: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "PUT", json }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};

// ============================================================
// SECTION: Shared error toast helper
// ------------------------------------------------------------
// Screens call this in every mutation catch block: offline-queued
// mutations show as a friendly warning, server errors show the
// server's message, anything else the fallback text.
// ============================================================

export function showErrorToast(error: unknown, fallback: string): void {
  if (error instanceof OfflineQueuedError) {
    toast.warning(error.message);
    return;
  }
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }
  toast.error(fallback);
}

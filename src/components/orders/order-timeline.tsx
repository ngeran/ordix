"use client";

// ============================================================
// SECTION: Imports
// ============================================================

import { useState } from "react";
import {
  Ban,
  CheckCircle2,
  Factory,
  Lock,
  Minus,
  PackageCheck,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { OrderDetail } from "@/types";
import { STATUS_META } from "@/lib/order-status";
import { useLocale, useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ============================================================
// SECTION: Order timeline
// ------------------------------------------------------------
// Turns the raw audit rows into plain sentences ("Started:
// Steel bracket", "Order closed — handed over") with an icon and
// color per kind. The server stores English notes with stable
// prefixes; they're parsed here so OLD rows read just as well.
// Newest first, grouped by day. "Main steps" hides the per-item
// chatter; "Everything" shows the full audit.
// ============================================================

type OrderEventRow = OrderDetail["events"][number];

type Kind =
  | "created"
  | "orderStarted"
  | "started"
  | "done"
  | "undoStart"
  | "undoDone"
  | "removed"
  | "edited"
  | "round"
  | "orderComplete"
  | "closed"
  | "hold"
  | "resumed"
  | "cancelled"
  | "reopened"
  | "status";

const MAIN_KINDS: ReadonlySet<Kind> = new Set([
  "created",
  "orderStarted",
  "round",
  "orderComplete",
  "closed",
  "hold",
  "resumed",
  "cancelled",
  "reopened",
  "status",
]);

const KIND_STYLE: Record<Kind, { icon: LucideIcon; className: string }> = {
  created: { icon: Sparkles, className: "bg-sky-500 text-white" },
  orderStarted: { icon: Factory, className: "bg-amber-500 text-white" },
  started: { icon: Play, className: "bg-warning-soft text-warning" },
  done: { icon: CheckCircle2, className: "bg-success-soft text-success" },
  undoStart: { icon: Undo2, className: "bg-surface-container-high text-on-surface-muted" },
  undoDone: { icon: Undo2, className: "bg-surface-container-high text-on-surface-muted" },
  removed: { icon: Minus, className: "bg-error-soft text-error" },
  edited: { icon: Pencil, className: "bg-surface-container-high text-on-surface" },
  round: { icon: Plus, className: "bg-primary-soft text-primary" },
  orderComplete: { icon: PackageCheck, className: "bg-violet-500 text-white" },
  closed: { icon: Lock, className: "bg-emerald-500 text-white" },
  hold: { icon: Pause, className: "bg-orange-500 text-white" },
  resumed: { icon: Play, className: "bg-primary text-on-primary" },
  cancelled: { icon: Ban, className: "bg-error text-white" },
  reopened: { icon: RotateCcw, className: "bg-amber-500 text-white" },
  status: { icon: RotateCcw, className: "bg-surface-container-high text-on-surface" },
};

interface TimelineEntry {
  id: string;
  kind: Kind;
  title: string;
  detail: string | null;
  at: Date;
  who: string | null;
}

/** Text after a known prefix, or null when the note doesn't start with it. */
function after(note: string | null, prefix: string): string | null {
  return note && note.startsWith(prefix) ? note.slice(prefix.length) : null;
}

function describe(
  event: OrderEventRow,
  t: ReturnType<typeof useT>,
  locale: Locale
): Omit<TimelineEntry, "id" | "at" | "who"> {
  const { note, fromStatus, toStatus } = event;
  let rest: string | null;

  // -- Per-item production notes --
  if ((rest = after(note, "Sent to production: ")) !== null) {
    return fromStatus === "placed" && toStatus === "in_production"
      ? { kind: "orderStarted", title: t("timeline.orderStarted"), detail: t("timeline.started", { name: rest }) }
      : { kind: "started", title: t("timeline.started", { name: rest }), detail: null };
  }
  if ((rest = after(note, "Production completed: ")) !== null) {
    return { kind: "done", title: t("timeline.done", { name: rest }), detail: null };
  }
  if ((rest = after(note, "Undo start: ")) !== null) {
    return { kind: "undoStart", title: t("timeline.undoStart", { name: rest }), detail: null };
  }
  if ((rest = after(note, "Undo done: ")) !== null) {
    return { kind: "undoDone", title: t("timeline.undoDone", { name: rest }), detail: null };
  }
  if ((rest = after(note, "Voided: ")) !== null) {
    const [name, reason] = rest.split(" — ");
    return { kind: "removed", title: t("timeline.removed", { name }), detail: reason ?? null };
  }
  if ((rest = after(note, "Edited: ")) !== null) {
    const [name, change] = rest.split(" → ");
    return { kind: "edited", title: t("timeline.edited", { name }), detail: change ?? null };
  }
  const round = note?.match(/^Round \d+ added \((\d+) item/);
  if (round) {
    return { kind: "round", title: t("timeline.round", { count: round[1] }), detail: null };
  }

  // -- Order-level status changes --
  if (fromStatus === null) {
    const customer = after(note, "Customer: ");
    return {
      kind: "created",
      title: customer ? t("timeline.createdFor", { name: customer }) : t("timeline.created"),
      detail: customer ? null : note,
    };
  }
  if (toStatus === "production_complete" && fromStatus !== toStatus) {
    return { kind: "orderComplete", title: t("timeline.orderComplete"), detail: null };
  }
  if (toStatus === "completed" && fromStatus !== toStatus) {
    return { kind: "closed", title: t("timeline.closed"), detail: null };
  }
  if (toStatus === "on_hold" && fromStatus !== toStatus) {
    return { kind: "hold", title: t("timeline.hold"), detail: note };
  }
  if (toStatus === "cancelled") {
    return { kind: "cancelled", title: t("timeline.cancelled"), detail: note };
  }
  if (fromStatus === "on_hold" && toStatus !== "on_hold") {
    return { kind: "resumed", title: t("timeline.resumed"), detail: note };
  }
  if (fromStatus === "production_complete" && toStatus === "in_production") {
    return { kind: "reopened", title: t("timeline.reopened"), detail: note };
  }
  if (fromStatus === "placed" && toStatus === "in_production") {
    return { kind: "orderStarted", title: t("timeline.orderStarted"), detail: note };
  }
  return {
    kind: "status",
    title:
      fromStatus !== toStatus
        ? `${STATUS_META[fromStatus][locale]} → ${STATUS_META[toStatus][locale]}`
        : STATUS_META[toStatus][locale],
    detail: note,
  };
}

export function OrderTimeline({ events }: { events: OrderEventRow[] }) {
  const t = useT();
  const locale = useLocale();
  const [showAll, setShowAll] = useState(false);

  const entries: TimelineEntry[] = events
    .map((event) => ({
      id: event.id,
      at: new Date(event.createdAt),
      who: event.userName,
      ...describe(event, t, locale),
    }))
    .filter((entry) => showAll || MAIN_KINDS.has(entry.kind))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  // -- Group by calendar day (Today / Yesterday / date) --
  const intlLocale = locale === "el" ? "el-GR" : "en-GB";
  const dayLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return t("timeline.today");
    if (date.toDateString() === yesterday.toDateString()) return t("timeline.yesterday");
    return date.toLocaleDateString(intlLocale, { weekday: "short", day: "numeric", month: "short" });
  };
  const groups: Array<{ label: string; entries: TimelineEntry[] }> = [];
  for (const entry of entries) {
    const label = dayLabel(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-bold">{t("detail.timeline")}</h2>
        <div className="flex rounded-xl bg-surface-container p-1 text-xs font-semibold" role="group">
          {[false, true].map((all) => (
            <button
              key={String(all)}
              type="button"
              aria-pressed={showAll === all}
              onClick={() => setShowAll(all)}
              className={cn(
                "h-9 rounded-lg px-3 transition-colors",
                showAll === all ? "bg-surface text-on-surface shadow-card" : "text-on-surface-muted"
              )}
            >
              {all ? t("timeline.all") : t("timeline.main")}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-on-surface-muted">{t("timeline.empty")}</p>
      ) : (
        <div className="px-4 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                {group.label}
              </p>
              <ol className="relative">
                {group.entries.map((entry, index) => {
                  const style = KIND_STYLE[entry.kind];
                  const Icon = style.icon;
                  const isLast = index === group.entries.length - 1;
                  return (
                    <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-1">
                      {/* Connector line */}
                      {!isLast && (
                        <span aria-hidden className="absolute bottom-0 left-[1.0625rem] top-9 w-0.5 bg-border" />
                      )}
                      <span
                        aria-hidden
                        className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full", style.className)}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="font-semibold leading-snug">{entry.title}</p>
                        {entry.detail && (
                          <p className="mt-0.5 text-sm text-on-surface-muted">{entry.detail}</p>
                        )}
                        <p className="mt-0.5 text-xs text-on-surface-muted">
                          {entry.at.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" })}
                          {entry.who ? ` · ${entry.who}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

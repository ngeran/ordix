# Ordix conventions

Build-to-order workshop app: orders are manufactured, products are pure identifiers (no stock, no prices), lines are quoted manually, completion is department-closure-only. **Read `README.md` first** — it is the source of truth for operations, deployment, roles and the daily-use guide.

- Stack: Next.js 16 App Router + React 19 + TS strict on Cloudflare Workers (OpenNext), D1 via Drizzle. Never use Node-only APIs (fs, child_process, native modules) in server code.
- Optional on-site deployment: Docker (`scripts/docker-deploy.sh`, same schema, SQLite volume). Same code for both targets.

## Lifecycle (single source of truth: `src/lib/order-status.ts`)

`placed (Submitted) → in_production → production_complete → completed (Closed)`, plus `on_hold` and `cancelled` as branches. Completion happens ONLY via `POST /api/orders/[id]/close` (department closure); `production_complete → completed` is not a transition. Entering `in_production` happens automatically when the first item is sent. Legacy stages (`preparing…dispatched`) render old rows only.

- Lifecycle rules live ONLY in `src/lib/order-status.ts`. API routes and UI import predicates from it (`canSendItem`, `canCompleteItem`, `allItemsProduced`, `CLOSABLE_ORDER_STATUSES`, …); never hard-code status lists elsewhere.
- Every status mutation: conditional `UPDATE … WHERE status = <expected>`; 0 rows → 409 "changed meanwhile"; write an `order_events` row in the same `db.batch` (use `asBatch`).
- Production actions are legal only in `PRODUCIBLE_ORDER_STATUSES`; line edits/appends only in `ITEM_EDITABLE_ORDER_STATUSES`. Closure requires `CLOSABLE_ORDER_STATUSES` (+ all items produced when closing from `in_production`).

## Data & API

- Money: integer cents (`linePriceCents`, `totalCents`). Prices are quoted per order line; products carry no prices.
- IDs are UUID strings — use the `uuid()` helper from `src/lib/uuid.ts` (works on plain-http LAN, where `crypto.randomUUID` is unavailable).
- Raw `sql` templates take epoch seconds, never `Date` objects (D1 rejects objects).
- D1: ~100 bound params per statement; batch in chunks. D1 remote migrations enforce FKs per statement — hand-write additive migrations (ADD COLUMN), keep `drizzle/meta/_journal.json` in sync with every file in `drizzle/`.
- Deleting a product or customer that appears in orders **deactivates** it (soft delete).
- Offline: only `POST /api/orders` and `POST /api/orders/[id]/items` queue in the IndexedDB outbox (`isQueueable`); everything else fails fast with `offline.needsConnection`. Flush serially oldest-first; single flusher via Web Locks.
- Unauthenticated `/api/*` → JSON 401 (middleware), never a redirect.
- Role checks live in `src/lib/api-auth.ts` + `src/lib/roles.ts` (`owner > admin > staff`; owner is CLI-only). Destructive/owner features go behind `requireOwner()` where applicable.

## UI

- i18n: every `MessageKey` must exist in both `en` and `el` in `src/lib/i18n.tsx`. Greek is the default display language; the EL/EN header toggle is per device.
- Design tokens (only these exist): `background`, `surface`, `surface-container(-lowest/-low/-high/-highest)`, `on-surface(-muted)`, `border`, `outline`, `primary(-soft/-strong)`, `on-primary`, `success/warning/error/info` (+ `-soft`), `on-success`, `on-error`. Custom variant: `short` (landscape phone). Root font 18px; hit targets ≥ h-10/44px; no text below 12px.
- Layout: mobile-first; container queries (`@container`, `@3xl/@4xl/@6xl`) for component layout, viewport breakpoints for the shell; fluid grids `grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]`; the order tray is always visible from md (768px) up, drawer below.
- Never nest interactive elements (no `<button>` inside `<Link>`); icons `aria-hidden`; toggles `aria-pressed`; nav items `aria-current`; live text `role="status"`.
- Data: one request per screen tick (`include=items`, no N+1 polls inside `.map()`); show stale/live state; loading and empty states.
- Before deleting code or i18n keys: grep for references. After changes: `npm run typecheck && npm run build && npm test` — report real output.

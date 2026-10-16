---
name: ordix
description: Build, extend, and maintain Ordix — the build-to-order order management and production-tracking app for the workshop (Cloudflare Workers + D1, or Docker; PWA; phones/tablets/desktops). Use when working on Ordix: orders, production board, closure, catalog, customers, users, settings, import/export, offline, or deployment.
---

# Ordix Development Skill

## What is Ordix

Ordix is a **build-to-order** order management system for a workshop that manufactures aluminum components and door/window locking mechanisms. It covers the full flow: an order taker builds a ticket for a **customer** → production makes each item → the order returns to the department → the department closes it (**Ολοκληρώθηκε**). Every step is audited.

It runs on phones, tablets and desktops (any orientation), installs as a **PWA**, works **offline-first**, and is designed for operators who are **50+ and first-time computer users**: giant-tile Home launcher, 18px base type, ≥44px touch targets, plain YES/NO confirmations, Greek UI by default.

## Core Architecture Principles

- **No stock. No prices on products.** Products are pure identifiers: part number, name, category, barcode, description, active. The price of each line is **quoted manually** while taking the order.
- The **lifecycle is a server-enforced state machine** with a single source of truth: `src/lib/order-status.ts`. Screens import predicates from it; they never hard-code status rules.
- Completion is **close-only**: `production_complete → completed` is not a transition. The department closes via `POST /api/orders/[id]/close`.
- Every status mutation is a conditional `UPDATE … WHERE status = <expected>` (409 "changed meanwhile" on 0 rows) and writes an `order_events` row **in the same batch**.
- Money is integer cents; the quoted price is optional per line and stored as `lineTotalCents`.
- **First-time users**: giant-tile Home launcher, plain YES/NO confirmations, no prices shown anywhere in the UI.

## Lifecycle (server-enforced)

```
placed (Submitted) ──► in_production ──► production_complete ──► completed (via /close)
    │ on_hold ⇄ placed / in_production            │                (department closure)
    └─► cancelled
```

- Entering `in_production` happens **automatically** when the first item is sent to production (`production_started_at` is stamped then).
- Handing off (`production_complete`) requires every active item produced — the endpoint 409s with the remaining count otherwise.
- Closing auto-completes any items the manager didn't individually click through; it can never fail on leftover production states.
- `placed` has no direct transition to `in_production` — starting the first item does it, so the status never claims work that isn't happening.
- Legacy stages (`preparing…dispatched`) render old rows but new orders never use them.

Item production states: `pending → in_production → completed` (who/when stamped per line; edits allowed until a line is sent).

## Product Schema (pure identifiers)

`part_number` (unique), `name`, `description`, `barcode` (optional), `category_id`, `items_per_box` (drives the κουτιά/τεμάχια calculator), `image_url`, `is_active` — plus owner-defined **custom fields** stored in an `extra` JSON column. **No stock, no min_stock, no price columns.** Categories and customers follow the same identifier pattern with their own fields.

## Roles

`owner` > `admin` > `staff`. Logins are **usernames**, not emails. Staff order, produce and close; admins also manage catalog, users, settings and import/export; the **owner** additionally controls language, backup/restore, custom fields and the danger zone — and is created/assigned **only from the CLI** (`scripts/set-role.ts`). Destructive actions (restore, clear data) need `DELETE` + password.

## Key Screens

- `/home` — giant-tile launcher (default landing page)
- `/order` — POS: customer bar, compact part cards, Order Tray with typeable BOX/PCS inputs
- `/orders` — simplified table dashboard (Live Flow: filters, time-in-queue/production)
- `/orders/[id]` — detail: stepper, editable pending quantities, timeline
- `/production` — manager board: per-item ▶ Send / ✔ Done, bulk actions, progress bars
- `/cashier` — **Department closure**: Returned / Still in production / Closed today
- `/display` — wall board (read-only)
- `/admin/*` — Products, Categories, Customers, Users, Settings, Import/Export
- `/login` — username + password

## Stack & Hosting

Next.js 16 App Router + React 19 + TS strict, deployed via `@opennextjs/cloudflare` to **Cloudflare Workers + D1** (binding `DB`), or the same Worker in **Docker** on-site (`scripts/docker-deploy.sh`). Offline-first: SW-cached reads + IndexedDB outbox for the two queueable writes (place order, append round). Tests: vitest unit + Playwright E2E matrix (`npm run typecheck && npm test && npm run build`).

## Development Guidelines

1. The lifecycle lives ONLY in `src/lib/order-status.ts`; screens import predicates (`canSendItem`, `canCompleteItem`, `allItemsProduced`, …) instead of comparing statuses.
2. Status mutations: conditional `UPDATE … WHERE status = <expected>` → 409 "changed meanwhile" on 0 rows; `order_events` in the same `db.batch`.
3. Money: integer cents end-to-end. IDs: UUID strings via the `uuid()` helper (works on plain-http LAN).
4. Deleting products/customers with history **deactivates** them (soft delete).
5. i18n: every key exists in **both** `en` and `el` in `src/lib/i18n.tsx` (TS-enforced); Greek is the default display language.
6. Migrations are **hand-written, additive** SQL in `drizzle/` and must be listed in `drizzle/meta/_journal.json`. Prefer ADD COLUMN; D1 remote enforces FKs per statement (no table rebuilds). Never write a `Date` object into a raw `sql` template — epoch seconds only.
7. Offline queueing accepts only place-order and append-round (`isQueueable`); everything else fails fast with `offline.needsConnection`.
8. Keep it usable for 50+ first-timers: giant tiles, plain words, YES/NO dialogs, no hidden gestures.

## When Extending Ordix

- New fields that the code must search/sort on → real column via a hand-written migration (grep the migration ordering rules in README first). Everything else → owner-defined custom fields.
- New screens follow the shared patterns: `usePolling` (pauses when hidden, backs off), stale-state banner, `showErrorToast`, role-gated via middleware/API helpers.
- Realtime (Durable Objects) is the designed upgrade path for the 5 s polling — Coordinate with the owner before adding it.

## Common Pitfalls to Avoid

- Adding stock or price fields back to products — deliberately removed
- Completing an order through the status endpoint — close-only, by the department
- Hooks below an early return (React #310 — hook-count changes between renders)
- A hook/`usePolling` call inside a `.map()` (N+1 polling on every tick)
- Writing a `Date` object into a raw `sql` template (D1 rejects objects — epoch seconds)
- Email-based logins — logins are usernames now

This skill should be loaded whenever the task involves creating, modifying, or debugging any part of Ordix.

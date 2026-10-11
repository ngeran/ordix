# Ordix

**Ordix** is a modern, multi-purpose **order management + inventory** system — built to run equally well for everyday/food-style ordering and for **industrial products** (aluminum components, door & window locking mechanisms).

It covers the full product lifecycle: **order placement → stock deduction → preparation → packing checklist → courier hand-off with tracking number**, with an audit trail for every stock change and void.

Runs on phones, tablets and desktops (any orientation), fully installable as a **PWA**, and is designed for **local-network (LAN) use** with a Cloudflare D1 database online.

---

## Features

- 🧾 **POS order screen** — searchable product grid (name / part number / barcode), category tabs, draft ticket with per-line notes, quantities and oversell guards
- 📦 **Inventory-aware ordering** — stock deducted atomically when an order is placed; ordering is blocked (or warned, configurable) when stock is insufficient
- 🔔 **Low-stock alerts** — `stock_quantity <= min_stock` lights up the POS grid, the stock screen and a header bell
- 🔄 **Full order lifecycle** — `placed → preparing → prepared → boxed → ready → dispatched → completed`, plus `on_hold` and `cancelled` (with automatic restock)
- 🧮 **Daily sequential order numbers** — `ORD-YYYYMMDD-001`, reset per business day (Europe/Athens), allocated atomically
- ♻️ **Append rounds** — add more items to a live order; each append is a new numbered round
- 🚫 **Item-level void** — reason + who + when recorded; optional restock on void (configurable)
- ✅ **Packing checklist** — tick items while boxing, progress bar on the order
- 🚚 **Courier tracking** — courier + tracking number recorded at hand-off, visible on the timeline
- 🕓 **Audit everywhere** — `stock_movements` and `order_events` log every change
- 👥 **Roles** — admin (catalog, stock, settings) vs staff (ordering, prep)
- 🌗 **Dark & light mode**, 🇬🇧/🇬🇷 **EN/EL bilingual UI**
- 📲 **PWA** — manifest + service worker + offline shell, installable

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript (strict) |
| Hosting | Cloudflare Workers via **@opennextjs/cloudflare** (Workers + static assets — the current successor to Pages for full-stack Next apps) |
| Database | **Cloudflare D1** (SQLite) |
| ORM | **Drizzle ORM** (`drizzle-orm/d1`) + drizzle-kit migrations |
| Auth | **NextAuth v5** (credentials + JWT sessions, bcryptjs) |
| State | **Zustand** (draft ticket, persisted; toasts; locale) |
| Styling | **Tailwind CSS v4** (CSS-variable design tokens, dark mode) |
| Validation | **Zod** on every API payload |
| Icons | lucide-react |
| PWA | hand-rolled manifest + service worker (no dependencies) |

### Why Workers instead of "Pages"?
Cloudflare now directs full-stack frameworks to **Workers with static assets** (Pages' engine, same network, same pricing, better Next.js support). Deploys work exactly like Pages: connect the GitHub repo or run `npm run deploy`. Everything below calls it "Cloudflare".

---

## Quickstart (local development)

Requirements: **Node 20+** (Node 24 verified), npm.

```bash
# 1. Install dependencies
npm install

# 2. Environment — copy the example and set AUTH_SECRET
cp .env.example .env
# generate a secret (any 32+ char random string):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# …paste it as AUTH_SECRET in .env

# 3. Create the local D1 database schema
npm run db:migrate:local

# 4. Seed demo data (users, categories, 26 products)
npm run db:seed

# 5. Run — binds 0.0.0.0 so tablets/phones on your LAN can use it
npm run dev
```

Open **http://localhost:3000** — or **http://<your-ip>:3000** from any device on the same network.

### Default credentials (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ordix.local` | `admin123` |
| Staff | `staff@ordix.local` | `staff123` |

> The seed runs against the **local** D1 (miniflare state in `.wrangler/state/v3`) — the exact same database `next dev` reads through the OpenNext dev proxy. No separate SQLite file, no drift.

### Database scripts

| Command | What it does |
|---|---|
| `npm run db:generate` | Generate SQL migrations from the Drizzle schema (`src/db/schema.ts` → `drizzle/`) |
| `npm run db:migrate:local` | Apply migrations to the local D1 (miniflare) |
| `npm run db:migrate:remote` | Apply migrations to the production D1 |
| `npm run db:seed` | Seed local D1 (idempotent — skips if users exist) |
| `npm run db:studio` | Open Drizzle Studio against the schema |

> After changing `src/db/schema.ts`: run `db:generate`, then commit the generated `drizzle/` files (migrations are applied, not derived, in production).

---

## Deploy to Cloudflare

### One-time setup

```bash
# 1. Authenticate
npx wrangler login

# 2. Create the D1 database
npx wrangler d1 create ordix-db
# → copy the printed database_id into wrangler.jsonc

# 3. Apply the schema to production
npm run db:migrate:remote

# 4. Set the auth secret for the Worker
npx wrangler secret put AUTH_SECRET
# (also set APP_TIMEZONE if you want another business-day timezone:
#  add it to "vars" in wrangler.jsonc)

# 5. First deploy
npm run deploy
```

Optionally seed production data the same way the local seed works — or create products through the admin UI (recommended for real data).

### Continuous deployment (GitHub → Cloudflare)

Two supported options:

1. **Workers Builds (recommended, zero config files):** In the Cloudflare dashboard → Workers & Pages → create → connect this repository. Set:
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
   - Add `AUTH_SECRET` as a build/runtime secret (or keep it as a Worker secret from step 4 above).
2. **GitHub Actions:** `.github/workflows/deploy.yml` is included — add `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID`) as repository secrets; every push to `main` deploys.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `AUTH_SECRET` | `.env` (dev) / `wrangler secret` (prod) | NextAuth JWT signing secret. **Required.** |
| `APP_TIMEZONE` | `.env` / `wrangler.jsonc` `vars` | Timezone for the daily order-number reset. Default `Europe/Athens`. |

---

## How it works

### Order lifecycle & stock rules

```
draft (Zustand ticket)
   └─ POST /api/orders ──► placed ─► preparing ─► prepared ─► boxed ─► ready ─► dispatched ─► completed
                             │  (stock deducted atomically at this moment)
                             ├──► on_hold  (resume to any earlier stage)
                             └──► cancelled (active items restocked automatically)
```

- **Placement is one D1 batch** (implicit transaction): daily number upsert → order row → item snapshots → guarded stock decrements (`stock >= qty`, can never go negative) → stock movements → timeline event.
- **Item snapshots** (name, part number, unit price) mean tickets render forever, even if the product is renamed or deactivated later.
- **Voids** require a reason; stock returns only when `restock_on_void` is enabled (toggle in *Stock* screen).
- **Overselling** is blocked by default; *Stock → Behavior settings → Allow overselling* flips it to warn-only.
- Order numbers come from the `order_counters` table (one row per business date) via an atomic `UPSERT … RETURNING` — concurrent placements can never share a number.

### Project structure

```
src/
├── app/                    # Routes (App Router)
│   ├── login/              #   credentials sign-in
│   ├── order/              #   POS: product grid + draft ticket
│   ├── orders/             #   board (active/history) + [id] detail
│   ├── prep/               #   preparation board (queue → in progress → prepared)
│   ├── admin/              #   products · categories · stock (admin-only)
│   └── api/                #   REST endpoints (auth, products, categories,
│                           #     orders, stock, settings, health)
├── components/
│   ├── ui/                 # design-system primitives (button, dialog, …)
│   ├── layout/             # app shell, nav, theme/locale toggles, PWA install
│   ├── pos/                # product grid + cart panel
│   ├── orders/             # board, detail, status badge
│   ├── prep/               # prep board
│   └── admin/              # product form, adjust-stock dialog, screens
├── db/                     # Drizzle schema + D1 client
├── lib/                    # domain logic: status machine, order service,
│                           #   inventory, settings, validation (Zod),
│                           #   i18n (EN/EL), polling hook, API client
├── stores/                 # Zustand: cart, toasts
└── types/                  # shared DTOs + NextAuth augmentation
scripts/seed.ts             # local D1 seeding (wrangler platform proxy)
drizzle/                    # generated SQL migrations (applied via wrangler)
public/                     # PWA: manifest, service worker, offline page, icons
```

Every source file is organized into banner-commented sections (`SECTION: …`) with descriptive names — grep for `SECTION:` to navigate.

### Real-time updates
Screens poll their APIs (5 s boards / 15 s catalog / 30 s stock bell) through a shared hook that pauses when the tab is hidden, backs off exponentially on errors, and keeps the last good data flagged as stale. This is deliberate: it is robust on flaky warehouse LANs and needs zero extra infrastructure. (WebSockets via Durable Objects is the natural upgrade path if you ever need push.)

### Offline / LAN behavior
- `npm run dev` binds `0.0.0.0` — any tablet on the same network can use the app.
- The service worker caches the shell + static assets; navigations fall back to `offline.html` when the server is unreachable. **API data is never served from cache** (stock correctness beats offline writes).
- In production, Cloudflare serves the app globally; LAN clients talk to the edge like any website.

---

## Common tasks

| Task | How |
|---|---|
| Add a product | Admin → Products → *New product* |
| Fix stock after stocktake | Admin → Stock → *Adjust* → "New quantity" + reason |
| Add items to a live order | Order detail → *Append items* (or the board) → ticket switches to append mode |
| Pack an order | Order detail (status `prepared`/`boxed`) → tick items → *Mark as boxed* |
| Hand off to courier | Status `ready` → enter courier + tracking → *Dispatch* |
| Change UI language | Header `EL/EN` button (per device) |
| Switch dark mode | Header moon/sun button (per device) |

---

## Notes & conventions

- **Money is integer cents everywhere** (`priceCents`, `unitPriceCents`, `totalCents`). Only `formatMoney()` at render time and the product form's € input ever see a decimal.
- **IDs are UUID strings** (`crypto.randomUUID()`).
- Timestamps are Drizzle `timestamp` (epoch seconds) columns.
- Deleting a product that appears in orders or stock history **deactivates** it instead (soft delete) — history stays intact.
- Login failures are rate-limited per email (5 tries → 30 s lockout, per isolate).
- Greek translations cover the full UI; add new strings to both dictionaries in `src/lib/i18n.tsx` (TypeScript enforces it).

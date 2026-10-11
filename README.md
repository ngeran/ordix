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
- 📺 **Warehouse wall display** — `/display` turns any iPad/Android tablet into a read-only status board (QUEUE / IN PROGRESS / PREPARED / SHIPPED), auto-refreshing, readable across the aisle
- 🔌 **Offline-first** — works without internet: reads from service-worker cache, writes queue in IndexedDB and sync to Cloudflare automatically on reconnect
- 👵 **Designed for first-time users** — a giant-tile Home launcher (`/home`, the default landing page), 18px base type scaling the whole app, 48px+ touch targets, plain YES/NO confirmations, and automatic Greek on Greek-set devices

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

## Deploying to Cloudflare — complete guide

Ordix is a Cloudflare **Worker** (not a Pages project) — one Worker serves the Next.js server code *and* the static assets, with the D1 database attached as a binding. Every step below was verified end-to-end; follow them in order.

### Step 0 — Prerequisites

- A **GitHub repository** for this code (private is fine)
- A **Cloudflare account** — the free tier runs Ordix (see "Costs" below)
- **Node 20+** locally
- Cloudflare credentials locally: `npx wrangler login` (opens the browser once)

### Step 1 — Push the code to GitHub

```bash
# If you use the GitHub CLI (easiest):
gh auth login                # one-time: GitHub.com → HTTPS → browser login
gh repo create ordix --private --source=. --push

# Or manually: create an empty repo on github.com, then:
git remote add origin git@github.com:<you>/ordix.git
git push -u origin main
```

> SSH remotes (`git@github.com:…`) need an SSH key registered in your GitHub account (Settings → SSH and GPG keys). If `git push` says `Permission denied (publickey)`, either add a key or switch to HTTPS: `git remote set-url origin https://github.com/<you>/ordix.git`.

### Step 2 — Create the production database

```bash
npx wrangler d1 create ordix-db
```

Copy the printed `database_id` into `wrangler.jsonc` (the `d1_databases` entry — keep the binding name `DB`, the code reads it). Then apply the schema:

```bash
npm run db:migrate:remote
```

Verify all 9 tables exist:

```bash
npx wrangler d1 execute ordix-db --remote -y \
  --command "SELECT name FROM sqlite_master WHERE type='table'"
```

> **Never rename the `DB` binding** — `getCloudflareContext().env.DB` is hardcoded across the app. Also make sure there is exactly **one** `d1_databases` entry: wrangler and the app both use the first one.

### Step 3 — Set the AUTH_SECRET (production)

Your `.env` secrets are not deployed automatically — production reads an **encrypted secret attached to the Worker** (the runtime equivalent of `.env`):

```bash
# value from your .env (or generate a fresh one):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# interactive — paste when prompted:
npx wrangler secret put AUTH_SECRET

# or non-interactive:
echo "paste-the-value-here" | npx wrangler secret put AUTH_SECRET
```

Dashboard equivalent: **Workers & Pages → ordix → Settings → Variables and Secrets → Add** (type: *Secret*). Secrets can never be read back — store the value in your password manager. If no Worker named `ordix` exists yet, wrangler creates a placeholder and attaches the secret; it stays attached through every later deploy. Never put the secret into `wrangler.jsonc` (that file is committed).

### Step 4 — First deploy

```bash
npm run deploy          # builds + uploads; prints your URL
```

The app goes live at `https://ordix.<your-subdomain>.workers.dev`. Secrets persist — no need to re-set them after deploys.

### Step 5 — Create the first admin user (production!)

The production database starts **empty** — the demo seed only runs locally, so nobody can log in until you create the first account:

```bash
# admin (default role):
npm run db:create-user -- you@example.com "strong-password" "Your Name"

# additional staff accounts:
npm run db:create-user -- maria@example.com "strong-password" "Maria" --staff --remote
```

(Without `--remote` the script targets your local database. It hashes the password with bcrypt and inserts through wrangler.)

Then sign in at `/login` and build the real catalog in **Admin → Products / Categories**. Seeded demo products are for local development only — production starts clean on purpose.

#### Optional: copy your local catalog to production

If you built up products/categories locally and want them in production:

```bash
# 1. Export catalog tables from the local D1
npx wrangler d1 export ordix-db --local --table categories --table products --output=catalog-export.sql

# 2. IMPORTANT: keep only data — the export contains CREATE TABLE
#    statements that would collide with the existing production schema
grep -E "^(PRAGMA|INSERT)" catalog-export.sql > catalog-apply.sql

# 3. Apply once (remote catalog must be empty; unique part numbers
#    make a second run fail — clear remote first if you must re-run)
npx wrangler d1 execute ordix-db --remote -y --file catalog-apply.sql

# 4. Verify + clean up
npx wrangler d1 execute ordix-db --remote -y --command "SELECT count(*) FROM products"
rm catalog-export.sql catalog-apply.sql
```

This is a one-time copy — afterwards production is the source of truth and the catalog is managed through the admin UI.

### Step 6 — Connect GitHub → automatic deploys (Workers Builds)

Same push-to-deploy experience you know from Cloudflare Pages — but for this app you connect through **Workers**, not the Pages tab:

1. **dash.cloudflare.com → Workers & Pages → Create → Workers → Connect to Git** (authorize GitHub, pick the repo, branch `main`)
2. Set exactly these two commands, leave everything else default (it reads `wrangler.jsonc`):
   - **Build command:** `npx opennextjs-cloudflare build`
   - **Deploy command:** `npx opennextjs-cloudflare deploy`
3. Save. From now on **every `git push` to `main` builds and deploys automatically**; pull-request branches get separate preview URLs.

Notes:

- `AUTH_SECRET` (Step 3) and the D1 binding survive every Git deploy — nothing to re-enter.
- **Database migrations are NOT run by CI** — they're deliberate manual steps. Whenever `src/db/schema.ts` changes: `npm run db:generate`, commit, then `npm run db:migrate:remote` **before or right after** the deploy.

**Alternative — GitHub Actions:** `.github/workflows/deploy.yml` is included; add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets and pushes to `main` deploy via Actions instead. Use one mechanism or the other, not both.

### APP_TIMEZONE (optional)

Business-day boundaries (daily order-number reset) default to `Europe/Athens`. To change: add `"vars": { "APP_TIMEZONE": "…/…" }` in `wrangler.jsonc` and redeploy, or set it in the dashboard under the Worker's Variables.

### Costs — will it run free?

Yes, for a small team. Free-tier allowances vs. Ordix's appetite:

| Resource | Free allowance | Ordix |
|---|---|---|
| Worker requests | 100,000/day | Page loads + API polls (polling pauses on hidden screens) |
| Static assets | Unlimited, always free | Not counted |
| D1 row reads | 5M/day | ~26–60 rows per poll |
| D1 row writes | 100k/day | ~5–10 rows per order |
| D1 storage | 5 GB | Text data — years of headroom |

A few tablets use a few thousand requests/day. The one caveat: on Free, exceeding a daily cap means requests fail until midnight — once Ordix runs a real warehouse, the **$5/month paid plan** (10M requests/month) is cheap insurance.

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

## Offline mode & sync architecture

Ordix is built **offline-first**: the warehouse keeps working when the internet drops, and everything written locally reaches Cloudflare automatically once the connection is back.

### How the devices communicate

```
                    ┌──────────────────────────┐
   Internet OK      │  Cloudflare Workers + D1  │   ← source of truth
 ◄──────────────────►│  (global edge network)    │
                    └────────────┬─────────────┘
                                 │ HTTPS
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
   ┌──────┴──────┐        ┌──────┴──────┐        ┌──────┴──────┐
   │  POS tablet │        │  Prep tablet│        │ Wall display│   ← same Wi-Fi / LAN
   │ (PWA, queue)│        │ (PWA, queue)│        │  (read-only)│      no server needed
   └─────────────┘        └─────────────┘        └─────────────┘
```

- **Online:** every tablet talks directly to the Cloudflare Worker over HTTPS — there is no local server to install or maintain. The LAN only needs internet access (any Wi-Fi router).
- **Offline:** each tablet's **PWA keeps running**:
  1. **Reads** — the service worker has cached every recent API response; boards, catalog and stock screens keep rendering the last known data, clearly flagged with a *"showing last known data"* banner.
  2. **Writes** — every mutation (place order, status change, void, stock adjustment, …) is stored in the device's **IndexedDB outbox** and confirmed to the user with *"Saved offline — will sync automatically"*. The app keeps a header indicator with the number of pending changes.
  3. **Sync** — the moment connectivity returns (or on app launch, or the 30 s retry), the outbox replays **oldest-first, in order**. Only one tab per device flushes at a time (Web Locks API), so two open tabs can't double-send.

### What happens to an offline order at sync time

Order numbers, stock deduction and every business rule are applied **by the server at replay time** — never guessed on the client. That means:

- Offline-placed orders get their real `ORD-YYYYMMDD-NNN` number during sync (numbers stay unique even if several tablets were offline).
- If reality changed while you were offline (stock already gone), the server rejects that replay with a clear **"Sync failed: New order — Not enough stock for …"** toast, and the change is dropped for manual re-entry. No silent corruption, no negative stock.
- Draft tickets live in `localStorage` (Zustand persist), so an unfinished order survives a reload or a day offline.

> **Known trade-off:** a mutation whose response was lost *after* the server already applied it (rare timeout, not true offline) could be applied twice on replay. Server-side idempotency keys are the textbook fix and are deliberately left as future work — the current behavior favors simplicity, and the audit trail makes any duplicate obvious.

### Running a fully offline LAN server (no internet at all)

If a site must run **completely without internet**, run the same Worker locally on any always-on machine in the workshop:

```bash
npm run build
npx opennextjs-cloudflare preview --ip 0.0.0.0 --port 8787
```

That serves the production build against the **local D1** (`.wrangler/state/v3`) — full functionality on `http://<workshop-server>:8787` from every tablet, zero internet required. Data written in this mode lives in the local D1; to push it up to the cloud database later:

```bash
npx wrangler d1 export ordix-db --local --output=export.sql   # dump local
npx wrangler d1 execute ordix-db --remote --file=export.sql   # apply remote (dedupe/merge first!)
```

This export/apply path is a manual runbook for exceptional setups, not an automatic replication engine — for the normal online+offline-drift case, the PWA outbox above is the sync mechanism. A built-in bidirectional D1 sync agent is a possible future addition; the data model (server-allocated numbers, monotonic counters, audit tables) was designed so that such an agent can be added without schema changes.

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

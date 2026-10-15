# Ordix

**Ordix** is a modern, multi-purpose **order management** system. It works just as well for everyday/food-style ordering as for **industrial products** (aluminum components, door & window locking mechanisms).

It covers the full flow of a **build-to-order workshop**: order placement (with customer) → production (item by item, two taps) → payment collection → completed (Ολοκληρώθηκε), with an audit trail for every action.

It runs on phones, tablets and desktops (any orientation), installs as a **PWA**, and is designed for **local-network (LAN) use**. You can host it **online on Cloudflare** (Workers + D1) or **on your own server with Docker**.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Quickstart (local development)](#quickstart-local-development)
4. [Command reference](#command-reference)
5. [Choose where to run it](#choose-where-to-run-it)
6. [Deploying to Cloudflare](#deploying-to-cloudflare--complete-guide)
7. [Running on your own server (Docker)](#running-on-your-own-server-docker)
8. [Updating a live installation](#updating-a-live-installation)
9. [Environment variables](#environment-variables)
10. [Owner guide](#owner-guide): roles, language, backup/restore, custom fields, clearing data
11. [Users, settings, import & export (admin)](#users-settings-import--export-admin)
12. [Common tasks (daily use)](#common-tasks-daily-use)
13. [Troubleshooting](#troubleshooting)
14. [How it works](#how-it-works)
15. [Developer notes](#developer-notes)

---

## Features

- 🧾 **POS order screen**: searchable product grid (name / part number / barcode), category tabs, a draft ticket with per-line notes, κουτιά + τεμάχια quantities, and a manually quoted € price per line
- 🏭 **Made to order**: no stock tracking at all. Products are pure identifiers, and every order is manufactured
- 🔄 **Full order lifecycle**: `placed → in_production → production_complete → completed`, plus `on_hold` and `cancelled`
- 🧮 **Daily sequential order numbers**: `ORD-YYYYMMDD-001`, reset per business day (Europe/Athens), allocated atomically
- ♻️ **Append rounds**: add more items to a live order; each append is a new numbered round
- 🚫 **Item-level void**: reason, who and when are recorded (only before production starts)
- 🕓 **Audit everywhere**: `order_events` logs every status change, production click, void and close
- 👥 **Three roles**: **Staff** (orders, production, closure), **Admin** (catalog, users, settings) and **Owner** (language, backup/restore, custom fields, clearing data)
- 🧩 **Custom fields**: the owner adds extra fields to products, customers and categories without a developer
- 💾 **Backup & restore**: one-click full backup file, all-or-nothing restore
- 🌗 **Dark & light mode**, 🇬🇧/🇬🇷 **EN/EL bilingual UI** (Greek by default)
- 📲 **PWA**: manifest, service worker and offline shell; installable
- 📺 **Warehouse wall display**: `/display` turns any iPad/Android tablet into a read-only status board (Ουρά / Σε παραγωγή / Ολοκληρωμένες / Πληρωμένες), auto-refreshing and readable across the aisle
- 🔌 **Offline-first**: keeps working without internet; writes queue on the device and sync automatically on reconnect
- 👵 **Designed for first-time users**: a giant-tile Home launcher (`/home`, the default landing page), 18px base type, 48px+ touch targets, plain YES/NO confirmations

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript (strict) |
| Hosting | Cloudflare Workers via **@opennextjs/cloudflare**, or the same Worker in **Docker** on your own server |
| Database | **Cloudflare D1** (SQLite); locally and in Docker, a SQLite file managed by wrangler/miniflare |
| ORM | **Drizzle ORM** (`drizzle-orm/d1`) + drizzle-kit migrations |
| Auth | **NextAuth v5** (credentials + JWT sessions, bcryptjs) |
| State | **Zustand** (draft ticket, persisted; toasts; locale) |
| Styling | **Tailwind CSS v4** (CSS-variable design tokens, dark mode) |
| Validation | **Zod** on every API payload |
| Icons | lucide-react |
| PWA | hand-rolled manifest + service worker (no dependencies) |

### Supported devices & browsers

Built touch-first for **tablets in either orientation** (iPad, Android), and equally usable on phones, laptops and large monitors.

| Platform | Minimum |
|---|---|
| iPad / iPhone (Safari, or the installed home-screen app) | **iPadOS / iOS 16.4+** |
| Android tablets & phones (Chrome, Samsung Internet, Edge) | Chrome 111+ (any Android with an up-to-date browser) |
| Windows / macOS / Linux | Chrome / Edge 111+, Safari 16.4+, Firefox 128+ |

These minimums come from Tailwind CSS v4 (cascade layers, `color-mix()`, `@property`); older browsers render unstyled. Viewport heights fall back from `dvh` to `vh` automatically.

**How the layout adapts:**
- **Width:** phones get a top bar plus bottom tabs. From 768px (tablets, landscape phones, desktops) a sidebar takes over: an icon rail with captions below 1280px, expanded above. Lists and boards add columns as space grows, up to 110rem.
- **Height:** short screens (≤ 540px: phones in landscape, split view) compact the chrome. Narrow landscape phones get the icon rail instead of the top and bottom bars.
- **On-screen keyboard:** bottom bars hide, and dialogs fit the visible area and dock to the top, so the field being typed in stays visible (also on iPad, where Safari doesn't resize the page).
- **Notches & home indicator:** safe-area insets are respected in the shell, dialogs, toasts and the wall display.
- **Installing:** Chrome, Edge and Android show **Install app**. On iPad and iPhone the same button explains *Share → Add to Home Screen*.

### Why Workers instead of "Pages"?
Cloudflare now directs full-stack frameworks to **Workers with static assets**: Pages' engine, same network, same pricing, better Next.js support. Deploys work exactly like Pages: connect the GitHub repo or run `npm run deploy`. Everything below calls it "Cloudflare".

---

## Quickstart (local development)

Requirements: **Node 20+** (Node 24 verified), npm.

```bash
# 1. Install dependencies
npm install

# 2. Environment: copy the example and set AUTH_SECRET
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# …paste the output as AUTH_SECRET in .env

# 3. Create the local database schema
npm run db:migrate:local

# 4. Seed demo data (users, customers, categories, 26 products)
npm run db:seed

# 5. Make the demo admin the owner (unlocks the Owner area in Settings)
npm run db:set-role -- admin owner

# 6. Run. It binds 0.0.0.0 so tablets/phones on your LAN can use it
npm run dev
```

Open **http://localhost:3000**, or **http://<your-ip>:3000** from any device on the same network.

### Default credentials (seeded, local only)

| Role | Username | Password |
|---|---|---|
| Admin (→ Owner after step 5) | `admin` | `admin123` |
| Staff | `staff` | `staff123` |

(Old `admin@ordix.local` style emails still work in the username box.) **These accounts exist only in your local database**; the online database starts empty (see [Step 5](#step-5--create-the-owner-account-production)).

> The local database lives in `.wrangler/state/v3` (miniflare). It's the same database `next dev` reads through the OpenNext dev proxy, so there's no separate SQLite file to keep in sync.

---

## Command reference

Add `--remote` to any `db:*` user command to target the **online** Cloudflare database (needs `npx wrangler login` once). Without it, commands target the **local** database.

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 (LAN-reachable) |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run preview` | Build + run the production Worker locally |
| `npm run typecheck` / `npm test` / `npm run test:e2e` | TypeScript check / unit tests (vitest) / browser tests (Playwright) |
| `npm run db:migrate:local` | Apply missing migrations to the local database (safe to repeat) |
| `npm run db:migrate:remote` | Apply missing migrations to the online database |
| `npm run db:seed` | Demo data into the local database (skips if users exist) |
| `npm run db:reset` | Wipe the local database and rebuild it (see [Owner guide](#how-to--reset-the-local-database-from-the-command-line)) |
| `npm run db:create-user -- <user> <pass> [name] [--owner\|--staff] [--remote]` | Create a user (default role: admin) |
| `npm run db:set-role -- <user> <owner\|admin\|staff> [--remote]` | Change a role; the only way to grant or revoke **owner** |
| `npm run db:set-password -- <user> <new-pass> [--remote]` | Reset a password and re-activate the account (recovery) |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` (developers) |
| `npm run db:studio` | Drizzle Studio (developers) |
| `scripts/docker-deploy.sh up\|down\|logs\|reset` | Docker server management (see [Docker](#running-on-your-own-server-docker)) |

All local commands honor `PERSIST_DIR=/some/folder` to use a separate (e.g. test) database. `npm run dev` honors it too.

---

## Choose where to run it

| | **Cloudflare (online)** | **Docker (your own server)** | **`npm run dev`** |
|---|---|---|---|
| Use it for | Production, reachable from anywhere | Production inside the workshop, no cloud account, works without internet | Development and trying things out |
| HTTPS | ✔ automatic | ✘ plain `http://` on the LAN (see [HTTPS](#https-on-the-lan)) | ✘ |
| Database | Cloudflare D1 | SQLite file in a Docker volume | `.wrangler/state` |
| Backups | In-app backup + `wrangler d1 export --remote` | In-app backup + volume copy | In-app backup |
| Cost | Free tier for a small team | Your hardware | Free |

Both production options run the **same code and database schema**, so you can move between them with an in-app backup and restore (see [Moving data](#moving-data-between-cloudflare-and-docker)).

---

## Deploying to Cloudflare — complete guide

Ordix is a Cloudflare **Worker** (not a Pages project). One Worker serves the Next.js server code *and* the static assets, with the D1 database attached as a binding. Follow the steps in order.

### Step 0 — Prerequisites

- A **GitHub repository** for this code (private is fine)
- A **Cloudflare account**; the free tier runs Ordix (see [Costs](#costs--will-it-run-free))
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

Copy the printed `database_id` into `wrangler.jsonc` (the `d1_databases` entry). Keep the binding name `DB`, because the code reads it. Then apply the schema:

```bash
npm run db:migrate:remote
```

Verify the 10 app tables exist (`users`, `settings`, `custom_fields`, `customers`, `categories`, `products`, `orders`, `order_items`, `order_events`, `order_counters`, plus wrangler's own `d1_migrations`):

```bash
npx wrangler d1 execute ordix-db --remote -y \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

> **Never rename the `DB` binding**: `getCloudflareContext().env.DB` is hardcoded across the app. Also make sure there is exactly **one** `d1_databases` entry, because wrangler and the app both use the first one.

### Step 3 — Set the AUTH_SECRET (production)

Your `.env` is not deployed. Production reads an **encrypted secret attached to the Worker** instead:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

npx wrangler secret put AUTH_SECRET          # paste when prompted
# or: echo "the-value" | npx wrangler secret put AUTH_SECRET
```

Dashboard equivalent: **Workers & Pages → ordix → Settings → Variables and Secrets → Add** (type: *Secret*). Secrets can never be read back, so store the value in your password manager. Never put it into `wrangler.jsonc`, because that file is committed. Changing it later signs everyone out (nothing else is lost).

### Step 4 — First deploy

```bash
npm run deploy          # builds + uploads; prints your URL
```

The app goes live at `https://ordix.<your-subdomain>.workers.dev`. Secrets persist across deploys.

### Step 5 — Create the owner account (production)

The production database starts **empty**: the demo users exist only locally, so nobody can sign in until you create the first account. Make it the **owner**:

```bash
npm run db:create-user -- nikos 'strong-password' "Nikos" --owner --remote
```

Sign in at `/login`, then create everyone else in the app (**avatar menu → Users**) and build the catalog in **Products / Categories**, or bring it over (next section).

#### Optional: copy your local data to production

**Easiest (everything):** locally, *Settings → Owner → Backup & restore → Download backup*; online, sign in as the owner and *Restore from file*. Afterwards the online accounts are the ones from your local backup, so make sure it contains an owner with a password you know.

**Catalog only (SQL):**

```bash
npx wrangler d1 export ordix-db --local --table categories --table products --output=catalog-export.sql
grep -E "^(PRAGMA|INSERT)" catalog-export.sql > catalog-apply.sql   # data only, no CREATE TABLE
npx wrangler d1 execute ordix-db --remote -y --file catalog-apply.sql   # run once, on an empty remote catalog
npx wrangler d1 execute ordix-db --remote -y --command "SELECT count(*) FROM products"
rm catalog-export.sql catalog-apply.sql
```

### Step 6 — Connect GitHub → automatic deploys (Workers Builds)

1. **dash.cloudflare.com → Workers & Pages → Create → Workers → Connect to Git** (authorize GitHub, pick the repo, branch `main`)
2. Set exactly these two commands and leave everything else at its default (it reads `wrangler.jsonc`):
   - **Build command:** `npx opennextjs-cloudflare build`
   - **Deploy command:** `npx opennextjs-cloudflare deploy`
3. Save. From now on **every `git push` to `main` builds and deploys automatically**; pull-request branches get separate preview URLs.

> **Database migrations are NOT run by CI.** When a release contains a new file in `drizzle/`, run `npm run db:migrate:remote` yourself. See [Updating a live installation](#updating-a-live-installation).

<details>
<summary><b>Alternative: GitHub Actions instead of Workers Builds</b></summary>

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx opennextjs-cloudflare build
      - run: npx opennextjs-cloudflare deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

1. **dash.cloudflare.com → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** template → copy the token
2. GitHub repo → **Settings → Secrets and variables → Actions** → add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (shown by `npx wrangler whoami`)

**Pick ONE deploy mechanism.** A workflow without its secrets shows a red ✗ on every push, even when the dashboard deploy succeeded.
</details>

### Custom domain (optional)

If your domain is on Cloudflare: **Workers & Pages → ordix → Settings → Domains & Routes → Add → Custom domain** (e.g. `orders.yourshop.gr`). Cloudflare issues the HTTPS certificate automatically. The `workers.dev` address keeps working.

### APP_TIMEZONE (optional)

Business-day boundaries (daily order-number reset) default to `Europe/Athens`. To change them, add `"vars": { "APP_TIMEZONE": "…/…" }` in `wrangler.jsonc` and redeploy, or set it in the dashboard under the Worker's Variables.

### Costs — will it run free?

Yes, for a small team:

| Resource | Free allowance | Ordix |
|---|---|---|
| Worker requests | 100,000/day | Page loads + API polls (polling pauses on hidden screens) |
| Static assets | Unlimited, always free | Not counted |
| D1 row reads | 5M/day | ~26–60 rows per poll |
| D1 row writes | 100k/day | ~5–10 rows per order |
| D1 storage | 5 GB | Text data: years of headroom |

A few tablets use a few thousand requests/day. On Free, exceeding a daily cap makes requests fail until midnight (UTC), so once Ordix runs a real workshop, the **$5/month paid plan** is cheap insurance.

---

## Running on your own server (Docker)

Runs the same Worker runtime (workerd) and the same database engine as local development, inside one container. No Cloudflare account is needed, and it works with **no internet at all** once built. Data lives in the Docker volume `ordix-data`.

### Setup

1. Install **Docker** (Docker Desktop on Mac/Windows, Docker Engine on Linux) on an always-on machine in the workshop.
2. Copy the project to that machine (`git clone …`).
3. Create `.env` next to `docker-compose.yml`:

   ```bash
   AUTH_SECRET=<output of: openssl rand -base64 32>
   OWNER_USERNAME=nikos
   OWNER_PASSWORD=StrongPass!
   OWNER_NAME=Nikos
   APP_TIMEZONE=Europe/Athens
   ```

   (`docker-deploy.sh` generates `AUTH_SECRET` for you if it's missing.)

4. Start it:

   ```bash
   scripts/docker-deploy.sh up       # build + start → http://<server-ip>:3000
   ```

On every start the container applies any new migrations. It creates the owner from `OWNER_*` only while there are no users yet; after that the variables are ignored, so you can remove the password from `.env`.

### Day-to-day

| Task | Command |
|---|---|
| Follow logs | `scripts/docker-deploy.sh logs` |
| Stop (data kept) | `scripts/docker-deploy.sh down` |
| Start again | `scripts/docker-deploy.sh up` |
| Update to new code | `git pull && scripts/docker-deploy.sh up` (rebuilds; migrations run automatically) |
| Wipe and start fresh | `scripts/docker-deploy.sh reset --owner nikos 'pass'` (or `--seed` for demo data) |
| Reset a password | `docker compose exec ordix npx tsx scripts/set-password.ts nikos 'NewPass!'` |
| Make someone owner | `docker compose exec ordix npx tsx scripts/set-role.ts maria owner` |
| Health check | `curl http://<server-ip>:3000/api/health` |

The container restarts automatically after a reboot (`restart: unless-stopped`). To change the port, edit `ports: "3000:3000"` in `docker-compose.yml` (left side = the port tablets use).

### Backups (Docker)

- **In the app (recommended):** *Settings → Owner → Backup & restore → Download backup*. Store the file off the server.
- **Whole volume:** stop the container, then copy the volume (check its exact name with `docker volume ls`; usually `ordix_ordix-data`):

  ```bash
  scripts/docker-deploy.sh down
  docker run --rm -v ordix_ordix-data:/data -v "$PWD":/backup alpine tar czf /backup/ordix-data.tgz -C /data .
  scripts/docker-deploy.sh up
  ```

### Moving data between Cloudflare and Docker

Both use the same schema. Download a backup on one (*Settings → Owner → Backup & restore*), then sign in as an owner on the other and **Restore from file**. Run migrations on the target first (`npm run db:migrate:remote` for Cloudflare; Docker does it on start), so it's on the same or a newer version than the backup.

### HTTPS on the LAN

The Docker server speaks plain `http://`. Ordix works fine that way on a trusted workshop network (it avoids browser APIs that need HTTPS). If you want HTTPS:
- **Cloudflare Tunnel** or **Tailscale**: real certificates with no setup on the tablets; the easiest option.
- **A reverse proxy** (e.g. Caddy) in front of port 3000: each tablet must trust its certificate once.

### Without Docker

On a machine with Node installed, the same server can be run directly:

```bash
npx opennextjs-cloudflare build
npx wrangler d1 migrations apply ordix-db --local
npx wrangler dev --ip 0.0.0.0 --port 8787     # reads AUTH_SECRET from .dev.vars (or .env)
```

---

## Updating a live installation

The safe routine for every new version, especially when it contains a new file in `drizzle/` (a migration):

1. **Back up:** *Settings → Owner → Backup & restore → Download backup*.
2. **Update the database first:**
   - Cloudflare: `npm run db:migrate:remote`
   - Docker: nothing to do; it migrates on start
3. **Deploy the code:**
   - Cloudflare: `git push` (Workers Builds) or `npm run deploy`
   - Docker: `git pull && scripts/docker-deploy.sh up`
4. **Check:** open the app, sign in, and open an order and a product.

Migrations in Ordix only **add** things, so running them before the new code is deployed is safe. The old code simply ignores new columns. Running new code **without** its migrations is what causes `500` errors (see [Troubleshooting](#500-errors-failed-to-load-resource)).

> **Upgrading an older installation:** migration `0006` adds usernames, user deactivation and the settings table (existing users get their email's first part as username: `maria@shop.gr` → `maria`). Migration `0007` adds custom fields: a `custom_fields` table plus an optional `extra` column on products, customers and categories. After `0006`/`0007`, promote your main account: `npm run db:set-role -- <you> owner --remote`.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `AUTH_SECRET` | `.env` (dev, Docker) / `wrangler secret put` (Cloudflare) | Signs the login sessions. **Required.** Changing it signs everyone out. |
| `APP_TIMEZONE` | `.env` / `wrangler.jsonc` `vars` | Timezone for the daily order-number reset. Default `Europe/Athens`. |
| `OWNER_USERNAME`, `OWNER_PASSWORD`, `OWNER_NAME` | `.env` (Docker only) | First owner account, created only while there are no users. |
| `PERSIST_DIR` | shell, when running commands | Use another local database folder (`npm run dev`, `db:*` scripts). Docker sets it to `/data`. |

---

## Owner guide

The **owner** is a special administrator for the app itself: language rules, backups, custom fields and destructive maintenance. Everything an admin can do, the owner can too.

| | Staff | Admin | Owner |
|---|:-:|:-:|:-:|
| Orders, production, closure | ✔ | ✔ | ✔ |
| Products, categories, customers, users, import/export | | ✔ | ✔ |
| Settings: features, theme, business | | ✔ | ✔ |
| Settings: **Language (Γλώσσα)** | | | ✔ |
| Settings: **Backup & restore** | | | ✔ |
| Settings: **Custom fields** | | | ✔ |
| Settings: **Danger zone** (clear data) | | | ✔ |
| Edit the owner account | | | ✔ (own name/password) |

Safety rules, all enforced by the server:
- An owner can only be created or assigned **from the command line**. The Users screen can't create, promote, demote or deactivate an owner.
- Admins can't edit the owner account at all, so they can't reset the owner's password.
- Restore and every Danger-zone action need the word `DELETE` **and** the owner's password.

> Keep **two owners** (e.g. you and a trusted colleague), or at least note how to run `db:set-password`, so a forgotten password never locks you out.

### How to — make someone the owner

```bash
npm run db:set-role -- admin owner              # existing user, local database
npm run db:set-role -- admin owner --remote     # existing user, online
npm run db:create-user -- nikos 'StrongPass!' "Nikos" --owner [--remote]   # new account
npm run db:set-role -- nikos admin [--remote]   # take the role away
```

The change shows up on the user's next page load; no re-login is needed. (Docker: `docker compose exec ordix npx tsx scripts/set-role.ts <user> owner`.)

### How to — set the language (Γλώσσα)

Avatar menu → **Settings** → **Owner** area → **Language**:
- **Default language**: Ελληνικά or English for every device.
- **Users may change the language**: when off, the EL/EN button disappears.

Press **Save** in the bar at the bottom. Admins don't see this card, and the server keeps the stored language if an admin saves Settings.

### How to — back up and restore

Settings → **Owner** area → **Backup & restore**:
- **Download backup** saves `ordix-backup-<date>.json` with **all** data: users (with password hashes), settings, custom fields, customers, categories, products and orders. Keep it as safe as a password, and keep copies off the server.
- **Restore from file** shows what's in the file, then asks for `DELETE` and your password. It **replaces all current data** in one all-or-nothing step: if anything fails, nothing changes. Afterwards you're signed out, and everyone signs in with the accounts stored in the backup.
- A backup with no active owner account is refused, so a restore can't lock everyone out.
- A backup from an older version restores into a newer one; new columns get their default values.

Command-line alternative (whole database as SQL): `npx wrangler d1 export ordix-db --remote --output=backup.sql` (or `--local`).

**Suggested routine:** download a backup weekly, and always before an update, a restore or a Danger-zone action.

### How to — add custom fields (no developer needed)

Settings → **Owner** area → **Custom fields** → pick **Products / Customers / Categories** → **New field**:

| Setting | Notes |
|---|---|
| Label (English / Greek) | Shown in the forms, in each device's language |
| Key | Filled in from the English label (`Warranty (months)` → `warranty_months`). It's the column name in import files. **Can't change later.** |
| Type | Text, Number, Yes/No, or List (one option per line). **Can't change later.** |
| Required | Forms and imports refuse a record without it (Yes/No fields always count as filled) |

- Fields appear immediately in the admin forms, in the order screen's *New customer* dialog, and as a small "Label: value" line on product, customer and category cards.
- **Import:** add a column/element named after the key, e.g. `{"partNumber":"A-1","name":"…","warranty_months":24}` or `<warranty_months>24</warranty_months>`.
- **Remove = hide:** switching a field off hides it everywhere but **keeps the stored values**; switch it on again and they come back.
- Values are stored in an `extra` JSON column, so adding or hiding fields never changes the database structure.

### How to — clear data from the app (Danger zone)

Settings → **Owner** area → **Danger zone**:

| Action | Deletes | Keeps |
|---|---|---|
| **Clear all orders** | orders, items, history, daily numbering | products, categories, customers, users, settings, custom fields |
| **Clear all data** | the above + products, categories, customers, every non-owner user | owner account(s), settings, custom field definitions |

Type `DELETE`, enter your password, then press **Delete permanently**. There is no undo, so **download a backup first**. Typical use: clearing test orders before going live.

### How to — reset the local database from the command line

```bash
npm run db:reset                                  # empty DB (no users, so nobody can sign in!)
npm run db:reset -- --owner nikos 'pass' "Nikos"  # empty DB + one owner
npm run db:reset -- --seed                        # demo data
npm run db:reset -- -y ...                        # skip the "type yes" prompt
```

Stop `npm run dev` first. The old database is **moved** to `.wrangler/state/backup-<date>/`, not deleted. This never touches the online database. (Docker: `scripts/docker-deploy.sh reset …`.)

---

## Users, settings, import & export (admin)

All admin pages live in the **avatar menu** (top right).

**Users**: add people with a **username** (what they type to sign in), a **display name** (shown on orders: *taken by / production by / closed by*), a password and a role (**Admin** or **Staff**; Owner is CLI-only, see the [Owner guide](#owner-guide)). Leavers are **deactivated**, not deleted: their order history stays, and their open sessions stop working on the next request. You can't deactivate yourself or remove the last admin.

**Settings** apply to every device:
- **Features**: wall display board, offline orders, "Install app" button, full-screen button.
- **Business**: name and logo, shown in the menu, sign-in page, tab title and exports.
- **Theme**: each user chooses, or force dark / light (hides the toggle).
- **Owner area** (owner only): Language, Backup & restore, Custom fields, Danger zone.

**Import** (Admin → Import / Export): pick **Products, Categories or Customers**, then **JSON or XML**, then choose / drop / paste the file. Each type has a downloadable template and its field list on the page. **Check first** is a dry run (new / updated / unchanged / problem rows, nothing written); **Import now** applies it. Rows with problems are skipped; the rest import.

| Type | Matched by | Fields (* required) |
|---|---|---|
| Products | `partNumber` (case-insensitive) | `partNumber`*, `name`*, `category` (required for new products; created if missing), `description`, `barcode`, `itemsPerBox` |
| Categories | `name` (case-insensitive) | `name`*, `nameEl`, `description`, `sortOrder` |
| Customers | `phone`, else `name` | `name`*, `phone`, `email`, `address`, `comments` |

Plus any **custom field keys** for that type. JSON may be a bare array or `{ "products": [ … ] }`; XML is `<products><product><partNumber>…</partNumber>…</product></products>` (an `<ordix>` root is optional). Products carry no prices or stock; prices are quoted per order line.

**Export**: the **Export orders** tab downloads **completed** orders for a date range (by closing day) as JSON or XML, including customer, payment, who took / closed it, totals and line items.

---

## Common tasks (daily use)

| Task | How |
|---|---|
| Take an order (step 1) | Home → **New order** → tap the customer bar → tap products (or scan a code + Enter) → set boxes/pieces in the tray → **Send to production** → YES |
| Make it (step 2) | Home → **Production** → **Start** on each item (or *Start all*) → **Mark done** as each finishes (↶ undoes a mis-tap) |
| Hand it to the front desk | When every item is done the order moves to *Ready to finish* → tap **Order complete — send to front desk** |
| Close it (step 3) | Home → **Closure** → *Ready for pickup* card → **Close order** → hand over the listed items → YES |
| Where is an order? | **Orders** → search customer / order / part number → the card shows % done and what happens next |
| Wall screen | **Wallboard** (sidebar or Home); fills any TV/tablet, portrait or landscape |
| Add a customer | Order screen → *Select customer* → *New customer* |
| Add a product | Admin → Products → *New product* |
| Bulk-import customers/products | Admin → Import (JSON/XML) |
| Change UI language | Header `EL/EN` button (per device, if the owner allows switching) |
| Switch dark mode | Header moon/sun button (per device) |

---

## Troubleshooting

### Can't log in after deploying online
The online database starts **empty**; the demo users exist only locally. Run once:

```bash
npx wrangler secret put AUTH_SECRET          # if not set yet
npm run db:migrate:remote
npm run db:create-user -- nikos 'StrongPass!' "Nikos" --owner --remote
```

If the browser lands on `/api/auth/error?error=Configuration`, `AUTH_SECRET` is missing on that server (Cloudflare secret, or `.env` for Docker/dev).

### Forgot a password / owner locked out
```bash
npm run db:set-password -- nikos 'NewStrongPass!' --remote   # online (omit --remote for local)
docker compose exec ordix npx tsx scripts/set-password.ts nikos 'NewStrongPass!'   # Docker
```
This also re-activates the account. After **5 wrong passwords** a username is locked for **60 seconds**; just wait a minute.

### 500 errors ("Failed to load resource")
A `500` means the server hit an error. The real message is in the **terminal running `npm run dev`** (look for `[api] unhandled error`), in `scripts/docker-deploy.sh logs` for Docker, or in Cloudflare under **Workers & Pages → ordix → Logs** (observability is enabled).

The most common cause is **code that is newer than the database**: after pulling or editing code with a new migration, requests that read the changed tables fail with `no such column` until the database is updated:

```bash
npm run db:migrate:local    # local dev (safe any time; applies only what's missing)
npm run db:migrate:remote   # online
# Docker applies migrations automatically on restart
```

No need to restart `npm run dev`; just retry the action.

### Browser console messages that are normal (development only)
- `Download the React DevTools…`: React's standard development tip.
- `[HMR] connected`, `[Fast Refresh] rebuilding / done in …ms`: the dev server reloading changed files.
- `forward-logs-shared.ts`: Next.js forwarding browser logs to the terminal.

None of these appear in production.

### Tablets can't open the dev server / taps do nothing
- Use the computer's LAN address, e.g. `http://192.168.1.20:3000`, with both devices on the same Wi-Fi, and allow Node through the computer's firewall.
- Next.js only serves its dev scripts to the private address ranges listed in `next.config.ts` (`allowedDevOrigins`). If your network uses a different range, add it there.

### Docker: container won't start
`scripts/docker-deploy.sh logs` shows the reason. The usual one is `AUTH_SECRET is required`, which means `.env` is missing next to `docker-compose.yml`. If port 3000 is busy, change the left side of `ports` in `docker-compose.yml`.

---

## How it works

### Order lifecycle, products & pricing (build-to-order)

```
draft (Zustand ticket)
   └─ POST /api/orders ──► placed ─► in_production ─► production_complete ─► completed
     requires a CUSTOMER      │           │                  │                    │
     (new or existing)        │           │                  │                    └─ collect payment
                              │           │                  │                      (method + note)
                              │           └─ production manager clicks each item:
                              │              pending ─► "▶ Send" ─► in_production ─► "✔ Done" ─► completed
                              └─ on_hold / cancelled branch off (with audit)
```

- **Everything is built to order.** Products carry NO stock and NO prices: they're pure identifiers (κωδικός, όνομα, κατηγορία, barcode, περιγραφή, ενεργό), plus any custom fields.
- **The price is quoted per order line.** The order taker (who is also the cashier) types the line's price in € while taking the order; totals auto-sum. Closing an order whose items are all produced works from the order page or the Ταμείο; closing auto-completes production if the manager skipped the hand-off button.
- **Placement is one D1 batch** (implicit transaction): daily number upsert → order row → snapshot items → timeline event.
- **Item snapshots** (name, part number, quoted line price) mean tickets render forever, even if the product is renamed or deactivated later.
- Order numbers come from the `order_counters` table (one row per business date) via an atomic `UPSERT … RETURNING`.
- Pre-build-to-order stages (`preparing…dispatched`) still exist for legacy rows; new orders never use them.

### Project structure

```
src/
├── app/                    # Routes (App Router)
│   ├── home/               #   giant-tile launcher (default landing page)
│   ├── order/              #   POS: product grid + draft ticket
│   ├── orders/             #   board (active/history) + [id] detail + print
│   ├── production/         #   production board (item by item)
│   ├── cashier/            #   closure / Ταμείο
│   ├── display/            #   wall display (read-only)
│   ├── admin/              #   products · categories · customers · users · settings · import
│   ├── login/              #   credentials sign-in
│   └── api/                #   REST: auth, orders, products, categories, customers, users,
│                           #     settings, custom-fields, system (backup/restore/reset),
│                           #     import, export, health
├── components/             # ui/ primitives + one folder per screen area
│                           #   (admin, pos, orders, production, cashier, display, home,
│                           #    layout, custom-fields)
├── db/                     # Drizzle schema + D1 client
├── lib/                    # domain logic: order service & status machine, roles, custom fields,
│                           #   backup, importer, settings, validation (Zod), i18n (EN/EL),
│                           #   polling hook, API client, offline outbox
├── stores/                 # Zustand: cart, settings, sync, toasts
└── types/                  # shared DTOs + NextAuth augmentation
scripts/                    # seed, create-user, set-role, set-password, reset-db, docker-*
drizzle/                    # SQL migrations (applied via wrangler) + drizzle-kit metadata
public/                     # PWA: manifest, service worker, offline page, icons
Dockerfile, docker-compose.yml
```

Every source file is organized into banner-commented sections (`SECTION: …`); grep for `SECTION:` to navigate.

### Real-time updates
Screens poll their APIs (about every 5 s on boards, longer on catalog screens) through a shared hook that pauses when the tab is hidden, backs off exponentially on errors, and keeps the last good data flagged as stale. This is robust on flaky workshop Wi-Fi and needs zero extra infrastructure. (WebSockets via Durable Objects is the natural upgrade path if you ever need push.)

### Offline mode & sync

Ordix is **offline-first**: the workshop keeps working when the internet drops, and everything written locally reaches the server automatically once the connection is back.

```
                    ┌──────────────────────────┐
   Internet OK      │  Cloudflare Workers + D1  │   ← source of truth
 ◄──────────────────►│  (or the Docker server)   │
                    └────────────┬─────────────┘
          ┌──────────────────────┼──────────────────────┐
   ┌──────┴──────┐        ┌──────┴──────┐        ┌──────┴──────┐
   │  POS tablet │        │ Production  │        │ Wall display│   ← same Wi-Fi / LAN
   │ (PWA, queue)│        │ (PWA, queue)│        │  (read-only)│
   └─────────────┘        └─────────────┘        └─────────────┘
```

- **Reads**: the service worker caches the app shell; screens keep showing the last known data, flagged with a *"showing last known data"* banner.
- **Writes**: placing an order or appending a round while offline is stored in the device's **IndexedDB outbox** (*"Saved offline — will sync automatically"*), with a header counter of pending changes. Other actions (cancellations, catalog edits) need a connection and say so. Settings → Features → *Offline orders* can turn queueing off.
- **Sync**: when connectivity returns (or on app launch, or the 30 s retry), the outbox replays **oldest first, in order**. Only one tab per device flushes at a time (Web Locks API).
- **The server decides at replay time**: offline orders get their real `ORD-YYYYMMDD-NNN` number during sync, so numbers stay unique across tablets. If the server rejects a replay (the business rules changed meanwhile), a *"Sync failed"* toast explains why and the change is dropped for manual re-entry.
- Draft tickets live in `localStorage`, so an unfinished order survives a reload.

> **Known trade-off:** a request whose response was lost *after* the server applied it (a rare timeout, not true offline) could be applied twice on replay. Server-side idempotency keys are the textbook fix and are left as future work; the audit trail makes any duplicate obvious.

---

## Developer notes

### Adding a real database column

Most new fields don't need this: use **[Custom fields](#how-to--add-custom-fields-no-developer-needed)**. Use a real column only when the code itself must use the field (search, sorting, calculations).

1. Add the column in `src/db/schema.ts`. Make it nullable, or give it a `.default(...)`, so existing rows stay valid.
2. `npm run db:generate` creates the next `drizzle/00xx_*.sql`. Review it, and keep migrations **additive** (see [Updating](#updating-a-live-installation)).
3. Apply it **right away**: `npm run db:migrate:local`. A running dev server otherwise returns 500s for that table.
4. Wire it through: `src/lib/validation.ts` (Zod), the API route, the admin form, `src/lib/i18n.tsx` (EN + EL labels), and `src/lib/importer.ts` if it should be importable.
5. Commit the `drizzle/` files; production runs `npm run db:migrate:remote`.

**Removing or renaming** a column is the risky one: SQLite often needs a table rebuild (which D1's foreign-key checks make tricky), and every piece of code that reads it must change in the same release. Prefer leaving an unused column in place.

### Conventions

- **Money is integer cents everywhere** (`linePriceCents`, `totalCents`). Only `formatMoney()` at render time and the € inputs ever see a decimal.
- **IDs are UUID strings**; use the `uuid()` helper on the client (works on plain-http LAN, where `crypto.randomUUID` is unavailable).
- Timestamps are Drizzle `timestamp` (epoch seconds) columns.
- Deleting a product or customer that appears in orders **deactivates** it instead (soft delete), so history stays intact.
- Role checks live in `src/lib/api-auth.ts` (`requireUser` / `requireAdmin` / `requireOwner`); new destructive features go behind `requireOwner()` plus a password re-check.
- Login failures are rate-limited per username (5 tries → 60 s lockout, per isolate).
- Greek translations cover the full UI; add new strings to both dictionaries in `src/lib/i18n.tsx` (TypeScript enforces it).

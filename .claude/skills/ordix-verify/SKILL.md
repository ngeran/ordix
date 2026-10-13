# Ordix — Skills & Process Improvements
 
Lessons from the 2026-10-13 review/redesign session, turned into reusable Claude Code skills and
project conventions. Each skill below can be saved as `.claude/skills/<name>/SKILL.md` in this repo
and invoked with `/<name>`.
 
---
 
## 1. Lessons learned (why these skills exist)
 
| Problem seen in the session | Impact | Fix / skill |
|---|---|---|
| The project is not a git repo | No rollback, no diff review, risky edits | `git init` at baseline; `/ordix-safe-edit` |
| The shell was unavailable for most of the session, so there was no typecheck or grep | Edits shipped unverified; leftover references found late (`paidAt` on the display board) | `/ordix-verify` runs typecheck, build, tests and grep checks in one go |
| i18n keys removed without grepping the consumers | Possible build break (`MessageKey` is a typed union) | `/ordix-i18n` checks key parity and usage |
| Invented design token (`bg-surface-dim`) | Silent no-op style | Token list in CLAUDE.md; `/ordix-ui-review` greps for unknown tokens |
| Nested interactive elements (`<Button>` inside `<Link>`) | Invalid HTML, double tab stops | `/ordix-ui-review` checklist |
| Business rules duplicated across API and UI | Screens disagree with the server | Single `src/lib/order-status.ts`; `/ordix-lifecycle-change` |
| N+1 polling on the production board | Wasted D1 reads on every 5 s tick | `/ordix-ui-review` checks for polling inside `.map()` |
| `drizzle/meta/_journal.json` out of sync with the migration files | Migrations may not apply | `/ordix-migration` checks the journal |
| No tests for the state machine | Regressions undetected | `/ordix-verify` + Vitest suites |
 
---
 
## 2. Recommended project `CLAUDE.md` additions
 
Add to `/Users/UPGH/github/Projects/ordix/CLAUDE.md`:
 
```markdown
# Ordix conventions
- Stack: Next.js 16 App Router + React 19 + TS strict on Cloudflare Workers (OpenNext), D1 via Drizzle.
  Never use Node-only APIs in server code (fs, child_process, native modules).
- Lifecycle rules live ONLY in src/lib/order-status.ts. API routes and UI import from it; never
  hard-code status lists elsewhere.
- Every status mutation: conditional UPDATE … WHERE status=<expected> (later: version=<expected>)
  RETURNING; 0 rows → 409; insert an order_events row in the same db.batch.
- i18n: every MessageKey must exist in both `en` and `el` in src/lib/i18n.tsx.
- Design tokens (only these exist): background, surface, surface-container(-lowest/-low/-high/-highest),
  on-surface(-muted), border, outline, primary(-soft/-strong), on-primary, success/warning/error/info(+ -soft),
  on-success, on-error. Custom variant: `short` (landscape phone).
- Layout: mobile-first; container queries (@container, @3xl/@4xl/@6xl) for components; fluid grids
  `grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]`; hit targets ≥ h-10; root font 18px.
- Never nest interactive elements; icons aria-hidden; toggles aria-pressed; nav aria-current.
- Before deleting code or i18n keys: grep for references.
- After changes: npm run typecheck && npm run build && npm test — report real output.
```
 
---
 
## 3. Skills to create
 
### 3.1 `/ordix-verify` — one-shot verification gate
 
```markdown
---
name: ordix-verify
description: Run Ordix typecheck, build, unit tests and static consistency checks; report real results.
---
Run, in order, stopping to report on the first hard failure:
1. `npx tsc --noEmit -p .`
2. `npm run build`
3. `npx vitest run` (if vitest is installed)
4. Static checks (report any hits):
   - Removed i18n keys still referenced: grep `src` for each key that is not in the `en` dictionary.
   - EN/EL parity: the keys in `en` must equal the keys in `el`.
   - Unknown Tailwind tokens: grep for `surface-dim|on-background-muted|text-muted\b` and any `bg-|text-|border-` color not in the CLAUDE.md token list.
   - Payment leftovers: `paidAt|paymentMethod|paymentNote` outside src/db/schema.ts and migrations.
   - Nested interactives: `<Link[^>]*>\s*<Button` and `<button[^>]*>[^<]*<a `.
   - Polling inside loops: `usePolling` used inside a component that is rendered in a `.map(`.
5. Summarize: passed / failed, with file:line for every issue. Never claim success for a step that did not run.
```
 
### 3.2 `/ordix-lifecycle-change` — safely change the state machine
 
```markdown
---
name: ordix-lifecycle-change
description: Add or modify an order/item status or transition in Ordix end-to-end (rules, API, UI, i18n, tests).
---
1. Edit src/lib/order-status.ts first: TRANSITIONS, STATUS_META (en, el, badgeClass, accentClass),
   the status lists (ITEM_EDITABLE / PRODUCIBLE / CLOSABLE) and the helpers.
2. Update the unit tests in src/lib/order-status.test.ts so the full from×to matrix is covered.
3. Find every consumer: grep `STATUS_META|canTransition|allowedTransitions|_ORDER_STATUSES|status ===`.
   Replace any hard-coded status comparisons with the helpers.
4. API: every route that mutates status uses a conditional UPDATE + RETURNING, returns 409 on a lost race,
   and writes order_events in the same batch.
5. UI: the production board columns, the dashboard STATUS_CHIPS, the display board columns, the detail stepper.
6. i18n EN + EL.
7. Run /ordix-verify.
```
 
### 3.3 `/ordix-migration` — D1 schema change
 
```markdown
---
name: ordix-migration
description: Create and validate an additive Drizzle/D1 migration for Ordix.
---
1. Edit src/db/schema.ts (additive only: new tables, nullable columns or columns with defaults, indexes).
2. `npm run db:generate`; inspect the SQL. SQLite cannot ALTER a CHECK/enum, so for enum-like text
   columns, keep the TS union in schema.ts and validate in Zod instead of relying on DB constraints.
3. Verify drizzle/meta/_journal.json lists EVERY .sql file in drizzle/ in order.
4. Show the SQL to the user and wait for approval.
5. Apply to a fresh local DB: `npm run db:migrate:local`; then to a copy of prod data
   (`wrangler d1 export ordix-db --remote --output=prod.sql`, then import locally).
6. Backfill scripts are idempotent and run in db.batch chunks of ≤ 100 statements.
7. Update the types in src/types, the Zod schemas and the seed script. Run /ordix-verify.
8. Remote apply (`npm run db:migrate:remote`) ONLY on the user's explicit go-ahead.
```
 
### 3.4 `/ordix-ui-review` — responsive + a11y audit of a screen
 
```markdown
---
name: ordix-ui-review
description: Audit and improve one Ordix screen for mobile-first responsiveness, touch/keyboard use and accessibility.
---
For the given component/route:
1. Layout: does it work at 320, 390×844, 844×390 (`short`), 1024×768 and 1440×900?
   Prefer @container + fluid auto-fill grids over viewport breakpoints. No horizontal scroll.
2. Touch: targets ≥ 44px, no hover-only affordances, double-tap protection on mutations (pending set).
3. Keyboard: logical tab order, visible focus, Esc closes dialogs, focus returns to the trigger.
4. Semantics: no nested interactives; lists are <ul>/<ol>; tabs, aria-pressed, aria-current, role=status for live text; icons aria-hidden.
5. Data: one request per screen tick (no N+1); show stale/live state; empty and loading states.
6. Tokens: only the CLAUDE.md tokens. EN + EL strings fit (Greek is ~30% longer).
7. Apply the fixes, then /ordix-verify. If a browser is available, actually load the page and test it;
   otherwise state explicitly that the UI was not visually verified.
```
 
### 3.5 `/ordix-i18n` — key management
 
```markdown
---
name: ordix-i18n
description: Add, rename or remove Ordix i18n keys with EN/EL parity and usage checks.
---
- Add: insert into both `en` and `el` next to the related keys; use {var} placeholders consistently.
- Rename: add the new key → update every usage (grep `"old.key"`) → remove the old key.
- Remove: grep `src` for the key (including template-built keys like t(`status.${x}`)); delete only when there are 0 hits.
- Finish with /ordix-verify (the parity check).
```
 
### 3.6 `/ordix-realtime` — Durable Object broadcast wiring
 
```markdown
---
name: ordix-realtime
description: Wire a new Ordix mutation into the OrdersHub Durable Object broadcast and client invalidation.
---
1. After the successful DB batch in the route: `ctx.waitUntil(broadcast(env, {type:"order.changed", orderId, status, version}))`.
2. Never block the response on the broadcast; it is fire-and-forget with error logging.
3. Client: make sure the affected screens' usePolling hooks are registered with useRealtime invalidation.
4. Test: two browsers, change in A appears in B in < 1 s; kill the socket → polling fallback at 5 s.
```
 
### 3.7 `/ordix-e2e` — Playwright scenario authoring
 
```markdown
---
name: ordix-e2e
description: Write or run Ordix Playwright tests across phone/tablet/desktop projects with axe checks.
---
- Projects: iPhone 13, iPhone 13 landscape, iPad (gen 7) landscape, Desktop Chrome, Firefox, WebKit.
- Seed a fresh local D1 before the suite (db:migrate:local + db:seed); log in via the UI once and reuse storageState.
- Use role/label selectors (getByRole, getByLabel) — they double as an a11y check.
- Every screen test ends with `await expect(await new AxeBuilder({page}).analyze()).toHaveNoViolations` (serious/critical).
- Golden path: create → send → complete → auto-return → close → timeline audit.
```
 
---
 
## 4. Workflow improvements
 
1. **Baseline first.** `git init` plus a commit before any session that edits code; one commit per phase.
2. **Verify continuously.** Run `/ordix-verify` after each file group, not at the end.
3. **Grep before delete, both directions.** Check consumers of a removed export/key AND producers of a field (e.g. nothing writes `paidAt` → nothing should read it).
4. **One source of truth per rule.** Lifecycle lives in `order-status.ts`; status lists are never re-typed in components.
5. **Plan approval gates.** Schema (Phase 5) and realtime (Phase 6) need explicit user approval of the SQL/design first.
6. **Honest reporting.** The final summary separates "changed", "verified (how)" and "unverified".
7. **Memory hygiene.** Durable decisions (statuses, roles, realtime choice) go in project memory; the rest lives in code and `REDO-PROMPT.md`.
 
---
 
## 5. Related files
 
- `REDO-PROMPT.md`: the complete prompt to redo every change and finish all pending phases.
- `README.md`: still needs the Phase 8 rewrite (it describes the cashier, `/prep` and stock).

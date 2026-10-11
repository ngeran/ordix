---
name: ordix
description: Build, extend, and maintain the Ordix order + inventory management app. Use when working on Ordix, product catalog, stock management, order lifecycle, Cloudflare Pages + D1 deployment, PWA, or adapting Manolis-POS patterns to industrial + general ordering.
---

# Ordix Development Skill

## What is Ordix

Ordix is a modern order management and inventory system for mixed product catalogs (food-style items + industrial aluminum components and door/window locking mechanisms). It supports the full lifecycle from order placement through stock deduction, preparation, packing, and courier hand-off with tracking numbers.

It is designed to run on local networks and sync with Cloudflare D1 online. It is fully installable as a PWA and optimized for phones, tablets, and desktops in any orientation.

## Core Architecture Principles

- Extract and improve proven patterns from Manolis-POS rather than inventing new ones.
- All monetary values stored as integer cents.
- Draft orders live in Zustand until confirmed.
- Stock is deducted atomically on order confirmation.
- Low-stock alerts trigger when `stock_quantity <= min_stock`.
- Order statuses follow a clear, linear lifecycle with auditability (who/when/reason for voids and cancellations).
- Prefer polling with backoff or lightweight real-time over heavy WebSocket complexity unless clearly needed.
- Touch-first UI: minimum 48px interactive targets.

## Required Tech Stack

- Next.js (App Router) or equivalent that deploys cleanly to Cloudflare Pages
- TypeScript strict mode
- Cloudflare D1 + Drizzle ORM
- Zustand for client-side cart
- Tailwind CSS v4
- NextAuth.js v5 (Credentials) or Cloudflare-compatible auth
- PWA (manifest + service worker)
- Zod for validation

## Product Schema Essentials

Every product must support at minimum:

- `id`
- `part_number` (unique, searchable)
- `name`
- `description`
- `image`
- `stock_quantity`
- `min_stock` (threshold for alerts)
- `price` (integer cents)
- `category_id`
- `is_active`

Categories support full CRUD + active/inactive.

## Order Lifecycle (Do Not Change Lightly)

1. Draft (Zustand)
2. Confirmed / Placed → stock deducted
3. Preparing
4. Prepared
5. Collected / Checked / Boxed
6. Ready for Courier
7. Dispatched (tracking number recorded)
8. Completed

Support item-level void with reason + actor + timestamp. Support appending to open orders.

## Key Screens

- `/login`
- Main order screen (`/pos` or `/order`) – product grid + ticket
- `/orders` – active board + history
- `/orders/[id]` – detail, status transitions, packing, tracking number
- `/admin/products` – product CRUD + stock
- `/admin/categories`
- `/admin/stock` – overview + low-stock alerts
- Optional preparation view

## Hosting & Sync

- Primary target: Cloudflare Pages + D1
- GitHub → Cloudflare automatic deploys
- Must also run well on local network with online sync capability
- Design for optimistic updates and eventual consistency

## Development Guidelines

1. Reuse Manolis-POS patterns for order flow, daily numbers, voiding, status recomputation, and touch UI.
2. Generalize “menu items” → “products” and add stock + part_number.
3. Keep the UI clean, high-contrast, and professional. Support dark mode.
4. Always validate with Zod on the server.
5. Prefer integer cents and server-side total recalculation.
6. Make low-stock alerts highly visible.
7. Ensure the app is fully usable as a PWA on mobile and tablet.
8. Write clear seed data that includes both general and industrial aluminum / locking mechanism products.

## When Extending Ordix

- New features must respect the existing order lifecycle and stock deduction rules.
- Any change to schema requires a proper Drizzle migration path for D1.
- Keep admin actions audited where possible (especially stock adjustments and voids).
- Test on real mobile viewports and in both orientations.

## Common Pitfalls to Avoid

- Storing prices as floats
- Allowing stock to go negative without explicit configuration
- Tiny touch targets
- Hard-coding restaurant-only language or assumptions
- Ignoring offline / local-network scenarios
- Skipping low-stock notifications

This skill should be loaded whenever the task involves creating, modifying, or debugging any part of the Ordix application.

// ============================================================
// SECTION: Ordix service worker (offline shell)
// ------------------------------------------------------------
// Deliberately conservative — Ordix is stock-sensitive, so the
// worker NEVER serves stale app/API data:
//
//   - API calls:               network only (no cache)
//   - page navigations:        network first → cache → /offline.html
//   - static assets (immutable _next/*, icons): cache first
//
// This gives fast loads + an offline shell while guaranteeing a
// tablet can never show yesterday's stock as current.
// ============================================================

const CACHE_NAME = "ordix-v2";
const OFFLINE_URL = "/offline.html";

// Preinstalled at activate: the offline shell + branding assets.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // ============================================================
  // SECTION: API reads — network-first with cache fallback
  // ------------------------------------------------------------
  // This is half of the offline story (the write half is the
  // IndexedDB outbox in the app): while offline, GET /api/*
  // respond from the last successful response so boards and the
  // catalog keep rendering. /api/auth is NEVER cached (session
  // freshness is a correctness rule), and mutations pass through
  // untouched — the app queues those itself when offline.
  // ============================================================
  if (request.method === "GET" && url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/auth")) return; // network only

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          // 503 JSON keeps api-client's error handling consistent
          // when there is no cached copy either.
          return (
            cached ??
            new Response(JSON.stringify({ error: "offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          );
        })
    );
    return;
  }

  if (request.method !== "GET") return;

  // Image optimizer: network only (responses are huge and dynamic).
  if (url.pathname.startsWith("/_next/image")) return;

  // Immutable build assets + icons: cache first (they're hashed).
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Navigations: network first, fall back to cache, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? caches.match(OFFLINE_URL);
        })
    );
  }
});

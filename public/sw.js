/* AthleteOS service worker — conservative shell caching only.
 *
 * Cache-first: /_next/static/*, /icons/*, /favicon.png, /offline.html
 * Network-only: HTML navigations, /api/*, Clerk auth routes, everything else
 * Never cache authenticated or personalized JSON.
 */
const CACHE_VERSION = "athleteos-shell-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/favicon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];

function isStaticAsset(url) {
  const { pathname } = url;
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.startsWith("/icons/")) return true;
  if (pathname === "/favicon.png" || pathname === "/favicon.ico") return true;
  if (pathname === OFFLINE_URL) return true;
  return false;
}

function isNetworkOnly(url) {
  const { pathname } = url;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/sign-in")) return true;
  if (pathname.startsWith("/sign-up")) return true;
  // Clerk-hosted assets / callbacks often share origin paths under these prefixes when configured
  if (pathname.startsWith("/clerk")) return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Never touch APIs / auth — always network, no cache put.
  if (isNetworkOnly(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigations: network-first; offline fallback document only.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match(OFFLINE_URL);
          return cached || new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })(),
    );
    return;
  }

  // Immutable / versioned static assets: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Default: network only (no store).
  event.respondWith(fetch(request));
});

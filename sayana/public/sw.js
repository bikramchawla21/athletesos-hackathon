const CACHE = "sayana-shell-v1";
const SHELL = ["/", "/today", "/recap", "/privacy", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((c) => c || caches.match("/"))),
  );
});

self.addEventListener("push", (event) => {
  let body = "Sayana — something’s waiting from today.";
  try {
    body = event.data ? event.data.text() : body;
  } catch {
    /* keep default */
  }
  event.waitUntil(self.registration.showNotification("Sayana", { body, icon: "/icon.svg" }));
});

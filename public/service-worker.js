const VERSION_URL = "/build-version.json";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/courtrush-icon.svg",
  "/legacy-app.js",
  VERSION_URL,
];

let COURTRUSH_VERSION = "courtrush-dev";
let COURTRUSH_CACHE = `courtrush-pwa-${COURTRUSH_VERSION}`;

async function refreshVersion() {
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (data && data.version) {
      COURTRUSH_VERSION = data.version;
      COURTRUSH_CACHE = `courtrush-pwa-${COURTRUSH_VERSION}`;
    }
  } catch {}
}

async function notifyClients() {
  const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
  clientList.forEach((client) => {
    client.postMessage({ type: "COURTRUSH_VERSION_READY", version: COURTRUSH_VERSION });
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    refreshVersion()
      .then(() => caches.open(COURTRUSH_CACHE))
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    refreshVersion()
      .then(() => caches.keys())
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("courtrush-pwa-") && key !== COURTRUSH_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .then(notifyClients),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(COURTRUSH_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (url.pathname === VERSION_URL) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(COURTRUSH_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "CourtRush";
  const options = {
    body: payload.body || "You have a new CourtRush update.",
    icon: "/courtrush-icon.svg",
    badge: "/courtrush-icon.svg",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    }),
  );
});

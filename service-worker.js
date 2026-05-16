const CACHE_VERSION = "instart-v13";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./artworks-data.js",
  "./chronology-data.js",
  "./schemes-data.js",
  "./manifest.webmanifest",
  "./assets/instart-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, IMAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isNavigation = request.mode === "navigate";
  const isImage = request.destination === "image";
  const isSameOrigin = url.origin === self.location.origin;

  if (isNavigation) {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }

  if (isImage) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (isSameOrigin) {
    event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.status < 400) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(APP_SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response && response.status < 400) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return cache.match(request).then((cached) => cached || cache.match(fallbackUrl));
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkUpdate = fetch(request)
    .then((response) => {
      if (response && response.status < 400) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkUpdate;
}

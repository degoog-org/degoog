const CACHE_NAME = "degoog-v__APP_VERSION__";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isPublicAsset =
    event.request.method === "GET" && url.pathname.startsWith("/public/");
  const isManifest = url.pathname.endsWith(".webmanifest");
  if (!sameOrigin || !isPublicAsset || isManifest) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (!res || res.status !== 200 || res.type !== "basic") return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || new Response("", { status: 503 })))
  );
});

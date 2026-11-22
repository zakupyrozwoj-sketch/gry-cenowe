/* Gry Cenowe — offline cache; shell zawsze najpierw z sieci */
const CACHE = "gry-cenowe-v11";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./manifest.webmanifest",
  "./sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let assets = SHELL.concat([
        "./icons/icon-192.png",
        "./icons/icon-512.png",
        "./icons/apple-touch-icon.png",
      ]);
      try {
        const res = await fetch("./precache.json", { cache: "no-cache" });
        if (res.ok) assets = await res.json();
      } catch (_) {
        /* keep defaults */
      }
      await cache.addAll(assets);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isShellRequest(url) {
  const path = url.pathname;
  return (
    path.endsWith("/") ||
    path.endsWith("/index.html") ||
    path.endsWith("/app.js") ||
    path.endsWith("/styles.css") ||
    path.endsWith("/data.js") ||
    path.endsWith("/sw.js") ||
    path.endsWith("/manifest.webmanifest")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML/JS/CSS: najpierw sieć, żeby telefon dostawał poprawki od razu
  if (isShellRequest(url) || req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req, { cache: "no-cache" });
          if (res && res.ok) {
            const cache = await caches.open(CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached =
            (await caches.match(req, { ignoreSearch: true })) ||
            (await caches.match("./index.html"));
          if (cached) return cached;
          throw new Error("offline");
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) {
        event.waitUntil(
          fetch(req)
            .then((res) => {
              if (res && res.ok) {
                return caches.open(CACHE).then((c) => c.put(req, res.clone()));
              }
            })
            .catch(() => {})
        );
        return cached;
      }

      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        if (req.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        throw new Error("offline");
      }
    })()
  );
});

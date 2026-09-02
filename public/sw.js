/* Steeven Première — Service Worker
 * - App shell + static assets cached for offline use (the data itself lives in IndexedDB).
 * - Navigations: network first, fallback to the cached shell so any route opens offline.
 * - Daily notification through Periodic Background Sync when the browser supports it.
 */
const VERSION = "v1";
const SHELL_CACHE = `steeven-shell-${VERSION}`;
const RUNTIME_CACHE = `steeven-runtime-${VERSION}`;
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/pdf.worker.min.mjs"];
const DB_NAME = "steeven-premiere";
const PLAN_KEY = "notificationPlan";
const PERIODIC_TAG = "steeven-daily-program";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {
            /* an optional asset may be missing in dev */
          }),
        ),
      );
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("steeven-") && k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/pdf.worker.min.mjs" ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // network only

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put("/", response.clone());
          }
          return response;
        } catch {
          const cached = (await caches.match(request)) || (await caches.match("/"));
          return cached || new Response("<h1>Hors ligne</h1><p>Ouvre l'application une première fois en ligne.</p>", { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 });
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Other same-origin GET (RSC payloads, manifest...): stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      return cached || (await network) || new Response("", { status: 503 });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// ---------- Periodic Background Sync (Chromium, installed PWA) ----------

function readPlan() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB_NAME);
      open.onerror = () => resolve(null);
      open.onupgradeneeded = () => {
        // The app has not created the database yet; do nothing.
      };
      open.onsuccess = () => {
        const dbi = open.result;
        if (!dbi.objectStoreNames.contains("meta")) {
          dbi.close();
          resolve(null);
          return;
        }
        const tx = dbi.transaction("meta", "readonly");
        const req = tx.objectStore("meta").get(PLAN_KEY);
        req.onsuccess = () => {
          dbi.close();
          resolve(req.result ? req.result.value : null);
        };
        req.onerror = () => {
          dbi.close();
          resolve(null);
        };
      };
    } catch {
      resolve(null);
    }
  });
}

function writePlan(plan) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB_NAME);
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        const dbi = open.result;
        if (!dbi.objectStoreNames.contains("meta")) {
          dbi.close();
          resolve(false);
          return;
        }
        const tx = dbi.transaction("meta", "readwrite");
        tx.objectStore("meta").put({ key: PLAN_KEY, value: plan });
        tx.oncomplete = () => {
          dbi.close();
          resolve(true);
        };
        tx.onerror = () => {
          dbi.close();
          resolve(false);
        };
      };
    } catch {
      resolve(false);
    }
  });
}

function localDateKey(d) {
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function maybeNotifyFromPlan() {
  const plan = await readPlan();
  if (!plan || !plan.enabled) return;
  const now = new Date();
  const today = localDateKey(now);
  const [h, m] = String(plan.time || "17:00").split(":").map(Number);
  const due = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  if (!due || plan.lastShown === today) return;
  const content = plan.days && plan.days[today];
  if (!content) return;
  await self.registration.showNotification(content.title, {
    body: content.body,
    tag: `daily-${today}`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: "/" },
  });
  await writePlan({ ...plan, lastShown: today });
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === PERIODIC_TAG) event.waitUntil(maybeNotifyFromPlan());
});

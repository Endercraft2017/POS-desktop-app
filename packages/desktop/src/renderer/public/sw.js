// Service worker for the POS PWA shell — web is online-only now, so we just
// cache the React bundle and assets for fast repeat starts.
const CACHE = 'pos-shell-v6';
const SHELL = [
  '/app/',
  '/app/index.html',
  '/app/manifest.webmanifest',
  '/app/icon-192.png',
  '/app/icon-512.png',
];

async function precacheFromIndex() {
  const cache = await caches.open(CACHE);
  try { await cache.addAll(SHELL); } catch {}
  try {
    const res = await fetch('/app/index.html', { cache: 'no-cache' });
    if (!res.ok) return;
    const html = await res.text();
    const hrefs = new Set();
    const re = /\/app\/assets\/[^"'<>\s)]+\.(?:js|css)/g;
    let m;
    while ((m = re.exec(html))) hrefs.add(m[0]);
    const promises = [...hrefs].map((href) =>
      cache.add(new Request(href, { cache: 'reload' })).catch(() => {})
    );
    await Promise.all(promises);
  } catch {}
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(precacheFromIndex());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;

  const isShellHtml = url.pathname === '/app/' || url.pathname === '/app/index.html';
  if (isShellHtml) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put('/app/index.html', clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/app/index.html').then((m) => m || caches.match('/app/')))
    );
    return;
  }

  if (url.pathname.startsWith('/app/assets/')) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) return hit;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  if (url.pathname.startsWith('/app/')) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) {
          fetch(e.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
            }
          }).catch(() => {});
          return hit;
        }
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        });
      })
    );
  }
});

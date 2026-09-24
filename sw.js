// Bump this single revision whenever the app shell changes.
const CACHE_REVISION = '2026-09-24-virtual-clip-fix';
const APP_CACHE = `awesome-rss-shell-${CACHE_REVISION}`;
const DATA_CACHE = 'awesome-rss-data-v1';
const ESM_CACHE = 'awesome-rss-esm-v1';
const LEGACY_CACHES = new Set(['awesome-rss-v1', 'awesome-rss-v4']);
const BASE = self.location.pathname.replace(/sw\.js$/, '');

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll([
        BASE,
        BASE + 'style.css',
        BASE + 'js/main.js',
        BASE + 'js/compact-toolbar.js',
        BASE + 'js/render.js',
        BASE + 'js/virtualization.js',
        BASE + 'js/data.js',
        BASE + 'js/filters.js',
        BASE + 'js/i18n.js',
        BASE + 'js/state.js',
        BASE + 'js/storage.js',
        BASE + 'js/download.js',
        BASE + 'js/theme.js',
        BASE + 'js/sound.js',
        BASE + 'i18n/es.js',
        BASE + 'i18n/en.js',
        BASE + 'i18n/pt.js',
        BASE + 'favicon_io/site.webmanifest',
        BASE + 'favicon_io/favicon.ico',
        BASE + 'llms.txt',
        BASE + 'robots.txt',
        BASE + 'sitemap.xml'
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => {
        const isOldShell = key.startsWith('awesome-rss-shell-') && key !== APP_CACHE;
        if (isOldShell || LEGACY_CACHES.has(key)) return caches.delete(key);
        return undefined;
      })))
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(request, cacheName) {
  const cachePromise = caches.open(cacheName);
  const cachedPromise = cachePromise.then(cache => cache.match(request));
  const networkPromise = fetch(request);
  const revalidatePromise = networkPromise.then(response => {
    if (!response || !response.ok) return response;
    return cachePromise
      .then(cache => cache.put(request, response.clone()))
      .catch(() => {})
      .then(() => response);
  });
  return { cachedPromise, networkPromise, revalidatePromise };
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('awesome-chilean-rss')) {
    const { cachedPromise, networkPromise, revalidatePromise } = staleWhileRevalidate(request, DATA_CACHE);
    event.waitUntil(revalidatePromise.catch(() => {}));
    event.respondWith(cachedPromise.then(cached => cached || networkPromise));
    return;
  }

  if (url.origin === 'https://esm.sh') {
    const { cachedPromise, networkPromise, revalidatePromise } = staleWhileRevalidate(request, ESM_CACHE);
    event.waitUntil(revalidatePromise.catch(() => {}));
    event.respondWith(cachedPromise.then(cached => cached || networkPromise));
    return;
  }

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      caches.open(APP_CACHE)
        .then(cache => cache.match(BASE))
        .then(cached => cached || fetch(request))
    );
    return;
  }

  const path = url.pathname;
  if (url.origin === self.location.origin && (
    path.startsWith(BASE + 'js/') ||
    path.startsWith(BASE + 'i18n/') ||
    path === BASE + 'style.css' ||
    path === BASE + 'llms.txt' ||
    path === BASE + 'robots.txt' ||
    path === BASE + 'sitemap.xml'
  )) {
    event.respondWith(
      caches.open(APP_CACHE)
        .then(cache => cache.match(request))
        .then(cached => cached || fetch(request))
    );
  }
});

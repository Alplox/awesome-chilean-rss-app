const CACHE = 'awesome-rss-v4';
const BASE = self.location.pathname.replace(/sw\.js$/, '');

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      BASE,
      BASE + 'style.css',
      BASE + 'js/main.js', BASE + 'js/render.js', BASE + 'js/data.js',
      BASE + 'js/filters.js', BASE + 'js/i18n.js', BASE + 'js/state.js',
      BASE + 'js/download.js', BASE + 'js/theme.js', BASE + 'js/sound.js',
      BASE + 'i18n/es.js', BASE + 'i18n/en.js', BASE + 'i18n/pt.js'
    ])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => { if (k !== CACHE) return caches.delete(k); }))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  let u = new URL(e.request.url);
  // Cache remote data JSON with stale-while-revalidate
  if (u.hostname === 'raw.githubusercontent.com' && u.pathname.includes('awesome-chilean-rss')) {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(e.request).then(cached => {
        let fetched = fetch(e.request).then(res => {
          if (res.ok) c.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetched;
      }))
    );
    return;
  }
  if (u.origin === 'https://esm.sh') {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; })))
    );
    return;
  }
  let p = u.pathname;
  if (p.startsWith(BASE + 'js/') || p.startsWith(BASE + 'i18n/') || p === BASE + 'style.css' || p === BASE) {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; })))
    );
  }
});

const CACHE = 'awesome-rss-v1';
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

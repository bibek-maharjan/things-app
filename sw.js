// Caches the app files so it opens offline. Bump VERSION after changing any file.
// Caches are shared with the Purchases and Clothes apps (same website), so only touch 'things-' ones.
const VERSION = 'things-v12';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'db.js', 'zip.js',
  'manifest.json', 'icon-192.png', 'icon-512.png'];

// cache: 'reload' skips the browser's HTTP cache. GitHub Pages lets the
// browser reuse files for 10 minutes, which could put old files in the new cache.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c =>
    c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('things-') && k !== VERSION)
      .map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request, { cacheName: VERSION, ignoreSearch: true })
    .then(r => r || fetch(e.request)));
});

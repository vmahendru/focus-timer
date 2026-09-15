// Offline cache. Bump VERSION whenever any of the listed files changes.
const VERSION = 'focus-v6';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './timer.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './art/aloha-far.svg',
  './art/aloha-mid.svg',
  './art/aloha-near.svg',
  './art/empire-far.svg',
  './art/empire-mid.svg',
  './art/empire-near.svg',
  './art/foliage-far.svg',
  './art/foliage-mid.svg',
  './art/foliage-near.svg',
  './art/frontier-far.svg',
  './art/frontier-mid.svg',
  './art/frontier-near.svg',
  './art/frontier-peak.svg',
  './art/gate-far.svg',
  './art/gate-mid.svg',
  './art/gate-near.svg',
  './art/rainier-far.svg',
  './art/rainier-mid.svg',
  './art/rainier-near.svg',
  './art/rainier-peak.svg',
  './art/rockies-far.svg',
  './art/rockies-mid.svg',
  './art/rockies-near.svg',
  './art/rockies-peak.svg',
  './art/spirit-far.svg',
  './art/spirit-mid.svg',
  './art/spirit-near.svg',
  './art/stars.svg',
  './art/summer-far.svg',
  './art/summer-mid.svg',
  './art/summer-near.svg',
  './art/summer-peak.svg',
  './art/sunshine-far.svg',
  './art/sunshine-mid.svg',
  './art/sunshine-near.svg',
  './art/texas-far.svg',
  './art/texas-mid.svg',
  './art/texas-near.svg',
  './art/texas-peak.svg',
  './art/windy-far.svg',
  './art/windy-mid.svg',
  './art/windy-near.svg',
  './art/windy-peak.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first, then network. The app is fully static, so once it is
// installed it never needs the network again until a new version ships.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

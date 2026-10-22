// Офлайн-режим: оболочка и рецепты сохраняются при первом заходе, фото — по мере просмотра
const VERSION = 'v1';
const SHELL = [
  './', 'index.html', 'app.css?v=1', 'app.js?v=1', 'manifest.webmanifest',
  'data/ingredients.js?v=1', 'data/cities.js?v=1', 'data/recipes.js?v=1', 'data/help.js?v=1',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open('shell-' + VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // фото: из кэша, если есть
  if (url.pathname.includes('/img/')) {
    e.respondWith(caches.open('img-' + VERSION).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // остальное: сначала сеть (чтобы обновления доходили), без сети — кэш
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open('shell-' + VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match('index.html'))));
});

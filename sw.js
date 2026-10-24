// Офлайн-режим: оболочка и рецепты сохраняются при первом заходе, фото — по мере просмотра. Обновления приходят сами (см. .github/workflows/deploy.yml)
const VERSION = '202610240907-ba6d15c';
// кэш фото не зависит от версии: после обновления сайта картинки не скачиваются заново
const IMG_CACHE = 'img-cache';
const SHELL = [
  './', 'index.html', 'app.css?v=202610240907-ba6d15c', 'config.js?v=202610240907-ba6d15c', 'core.js?v=202610240907-ba6d15c', 'i18n.js?v=202610240907-ba6d15c', 'data/i18n-en.js?v=202610240907-ba6d15c', 'ui.js?v=202610240907-ba6d15c', 'online.js?v=202610240907-ba6d15c', 'extra.js?v=202610240907-ba6d15c', 'more.js?v=202610240907-ba6d15c', 'manifest.webmanifest',
  'data/ingredients.js?v=202610240907-ba6d15c', 'data/cities.js?v=202610240907-ba6d15c', 'data/recipes.js?v=202610240907-ba6d15c', 'data/help.js?v=202610240907-ba6d15c', 'data/steps.js?v=202610240907-ba6d15c',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open('shell-' + VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== IMG_CACHE && !k.endsWith(VERSION)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // видео грузится кусками (ответ 206) — его не кэширую
  if (url.pathname.includes('/media/')) return;
  // фото: из кэша, если есть
  if (url.pathname.includes('/img/')) {
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // остальное: сначала сеть (чтобы обновления доходили), без сети — кэш
  // cache: 'no-cache' — сверяюсь с сервером, а не с кэшем браузера: обновления приходят сразу после публикации
  // страницу (переход) нельзя пересоздать с настройками — беру её адрес
  const fresh = e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(fetch(fresh).then(res => {
    // хостинг перенаправил страницу (Cloudflare убирает .html) — браузер не примет такой ответ на переход, отдаю переадресацию
    if (e.request.mode === 'navigate' && res.redirected) return Response.redirect(res.url, 301);
    if (res.ok) { const copy = res.clone(); caches.open('shell-' + VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match('index.html'))));
});

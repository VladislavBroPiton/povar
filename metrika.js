// Яндекс Метрика (счётчик 113959622): одна копия для всех страниц — главной, рецептов r/ и подборок q/.
// Роботы и мои проверки (localStorage cook.notrack) не считаются — как и в собственной статистике сайта (track в ui.js)
(function () {
  try { if (navigator.webdriver || localStorage.getItem('cook.notrack')) return; } catch (e) { /* ничего */ }
  var ID = 113959622;
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
    k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + ID, 'ym');
  ym(ID, 'init', { ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer', referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true });
  // приложение меняет экраны без перезагрузки (#/r/борщ, #/plan…) — каждый экран отдельный просмотр
  var prev = location.href;
  window.addEventListener('hashchange', function () { ym(ID, 'hit', location.href, { referer: prev }); prev = location.href; });
})();

'use strict';
/* Интерфейс «Что приготовить». Логика подбора — в core.js. Данные пользователя хранятся только на его устройстве */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const wide = () => matchMedia('(min-width: 1000px)').matches;
const HOME_TITLE = document.title;
const BASE = location.origin + location.pathname.replace(/[^/]*$/, '');
// Места, куда встраиваются функции сервера из online.js (если файла нет — пусто)
const hook = (name, ...args) => typeof window[name] === 'function' ? window[name](...args) : '';

// ---------- Состояние ----------
const KEY = 'cook.v1';
const DEF = {
  city: null, have: [], want: [], ex: [], meal: ['dinner'], kind: [], goals: [], methods: [], diets: [], cuisine: [], occ: '', age: 0,
  // meal: ужин и time: 30 — ниша «ужин за 30 минут»: новым посетителям сразу быстрые ужины
  serv: 0, time: 30, lvl: 0, sort: 'match', view: 'grid', fav: [], list: [], q: '', dates: {}, notes: {}, own: [], plan: null,
  planOpt: { days: 7, people: 2, meals: ['breakfast', 'lunch', 'dinner'], goal: '', budget: false }
};
let S;
try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = { ...DEF }; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); hook('afterSave'); return true; }
  catch { toast('Память браузера заполнена: удалите фото из своих рецептов'); return false; }
}
buildRecipes(S.own);

// Статистика (заработает, когда подключим сервер)
// откуда пришёл человек, с какого устройства, впервые ли — для недельного отчёта (без личных данных)
function visitMeta() {
  const p = new URLSearchParams(location.search);
  let src = p.get('utm_source') || '';
  if (!src) {
    let host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* ничего */ }
    if (/tgWebApp/.test(location.hash) || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)) src = 'telegram_app';
    else if (!host || host === location.hostname) src = 'direct';
    else if (/yandex\.|google\.|bing\.|duckduckgo|mail\.ru|rambler/.test(host)) src = 'search';
    else if (/(^|\.)vk\.(com|ru)$|vkontakte/.test(host)) src = 'vk';
    else if (/(^|\.)ok\.ru$/.test(host)) src = 'ok';
    else if (/t\.me$|telegram/.test(host)) src = 'telegram';
    else if (/pinterest/.test(host)) src = 'pinterest';
    else src = 'other:' + host.slice(0, 30);
  }
  const coarse = matchMedia('(pointer: coarse)').matches, small = Math.min(screen.width, screen.height);
  let nw = '0';
  try { if (!localStorage.getItem('cook.seen')) { nw = '1'; localStorage.setItem('cook.seen', '1'); } } catch { /* ничего */ }
  let lang = 'ru';
  try { lang = localStorage.getItem('cook.lang') || (document.documentElement.lang || 'ru').slice(0, 2); } catch { /* ничего */ }
  return { src, dev: coarse ? (small < 600 ? 'phone' : 'tablet') : 'desktop', lang, nw, pwa: matchMedia('(display-mode: standalone)').matches || navigator.standalone ? '1' : '0' };
}
function track(ev, data) {
  if (!window.API_BASE) return;
  // проверки сайта роботом (перед публикацией и мои) в статистику не попадают
  try { if (navigator.webdriver || localStorage.getItem('cook.notrack')) return; } catch { /* ничего */ }
  try { navigator.sendBeacon(window.API_BASE + '/api/hit', JSON.stringify({ ev, ...data, city: S.city && S.city.n })); } catch { /* не важно */ }
}

// ---------- Город ----------
const CITIES = window.CITIES_RAW.map(([n, cc, tier, zone, en, slug]) => ({ n, cc, tier, zone, en: en.split(','), slug }));
function matchCity(name, cc) {
  const q = norm(name).replace(/^(город|г\.)\s*/, '');
  if (!q) return null;
  return CITIES.find(c => norm(c.n) === q || c.en.includes(q)) ||
    CITIES.find(c => (!cc || c.cc === cc) && (norm(c.n).startsWith(q) || c.en.some(e => e.startsWith(q))));
}
function cityObj(name, cc) {
  const c = matchCity(name, cc);
  if (c) return { n: c.n, cc: c.cc, tier: c.tier, zone: c.zone, slug: c.slug };
  return { n: name, cc: cc || 'RU', tier: 3, zone: 'center', slug: '' };
}
async function getJSON(url, ms = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
async function detectByIP() {
  try { const d = await getJSON('https://get.geojs.io/v1/ip/geo.json'); if (d.city) return cityObj(d.city, d.country_code); } catch { /* следующий сервис */ }
  try { const d = await getJSON('https://ipwho.is/?lang=ru'); if (d.city) return cityObj(d.city, d.country_code); } catch { /* не вышло */ }
  return null;
}
function detectByGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('нет геолокации'));
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude: la, longitude: lo } = pos.coords;
        const d = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=ru`);
        const name = d.city || d.locality || d.principalSubdivision;
        if (!name) throw new Error('город не найден');
        resolve(cityObj(name, d.countryCode));
      } catch (e) { reject(e); }
    }, reject, { timeout: 12000, maximumAge: 600000 });
  });
}
function setCity(c, confirmed) {
  S.city = { ...c, confirmed: !!confirmed };
  save();
  $('#cityName').textContent = c.n;
  $('#cityConfirm').hidden = !!confirmed;
  if (!confirmed) $('#cityConfirmText').textContent = `Похоже, вы в городе ${c.n}. Верно? Покажу магазины, цены и блюда вашего региона`;
  rerender();
}
async function initCity() {
  if (S.city) {
    $('#cityName').textContent = S.city.n;
    $('#cityConfirm').hidden = !!S.city.confirmed;
    if (!S.city.confirmed) $('#cityConfirmText').textContent = `Похоже, вы в городе ${S.city.n}. Верно?`;
    return;
  }
  $('#cityName').textContent = 'Определяю…';
  const c = await detectByIP();
  if (c) setCity(c, false);
  else { $('#cityName').textContent = 'Выбрать город'; openCitySheet(true); }
}
function openCitySheet(first) {
  const popular = [...CITIES].sort((a, b) => a.tier - b.tier || (a.cc === 'RU' ? -1 : 1));
  openSheet(`
    <div class="sheet-head"><h3>${first ? 'Из какого вы города?' : 'Ваш город'}</h3><button class="close" data-close aria-label="Закрыть">×</button></div>
    <p class="muted small">Город нужен для магазинов и доставки рядом, примерных цен, сезонных продуктов и местной кухни</p>
    <button class="btn" id="gpsBtn" type="button"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/></svg><span>Определить точно по геолокации</span></button>
    <input class="input" id="cityQ" placeholder="Начните вводить город" autocomplete="off">
    <div class="city-list" id="cityList"></div>`);
  const list = $('#cityList');
  const draw = () => {
    const q = norm($('#cityQ').value);
    const found = popular.filter(c => !q || norm(c.n).includes(q) || c.en.some(e => e.includes(q))).slice(0, 60);
    let h = found.map(c => `<button type="button" data-city="${esc(c.n)}"><span>${esc(c.n)}</span><span class="muted small">${esc(window.COUNTRY_NAMES[c.cc] || '')}</span></button>`).join('');
    if (q && !found.some(c => norm(c.n) === q)) h += `<button type="button" data-free="${esc($('#cityQ').value.trim())}"><span>Мой город: «${esc($('#cityQ').value.trim())}»</span><span class="muted small">нет в списке</span></button>`;
    list.innerHTML = h;
  };
  draw();
  $('#cityQ').addEventListener('input', draw);
  list.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.city) setCity(cityObj(b.dataset.city), true);
    else if (b.dataset.free) setCity({ n: b.dataset.free, cc: 'RU', tier: 3, zone: 'center', slug: '' }, true);
    closeSheet();
  });
  $('#gpsBtn').addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; $('span', b).textContent = 'Определяю…';
    try { const c = await detectByGPS(); setCity(c, true); closeSheet(); toast(`Ваш город: ${c.n}`); }
    catch { b.disabled = false; $('span', b).textContent = 'Не получилось. Разрешите доступ к геолокации или выберите из списка'; }
  });
}
$('#cityBtn').addEventListener('click', () => openCitySheet(false));
$('#cityYes').addEventListener('click', () => { if (S.city) setCity(S.city, true); });
$('#cityNo').addEventListener('click', () => openCitySheet(false));

function shopLinks(name) {
  const c = S.city || { n: '', cc: 'RU', tier: 3, slug: '' };
  const shops = window.SHOPS[c.cc] || window.SHOPS._;
  const q = encodeURIComponent(name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\/.*$/, '').trim());
  return shops
    .filter(s => !(s.needSlug && !c.slug))
    .map(s => ({ ...s, far: s.tier < c.tier, url: s.u.replace('{q}', q).replace('{city}', encodeURIComponent(c.n)).replace('{slug}', c.slug) }))
    .sort((a, b) => a.far - b.far);
}
function marketLinks() {
  const c = S.city || { n: '', slug: '', cc: 'RU' };
  const q = encodeURIComponent('рынок ' + c.n);
  const out = [{ n: 'Рынки на Яндекс Картах', note: 'фермерские продукты, мясо, зелень', url: `https://yandex.ru/maps/?text=${q}` }];
  if (c.slug && ['RU', 'KZ', 'BY'].includes(c.cc)) out.push({ n: 'Рынки в 2ГИС', note: 'с часами работы', url: `https://2gis.${c.cc === 'RU' ? 'ru' : c.cc.toLowerCase()}/${c.slug}/search/${encodeURIComponent('рынок')}` });
  return out;
}
function openBuySheet(name) {
  const c = S.city;
  const links = shopLinks(name);
  track('buy', { item: name });
  openSheet(`
    <div class="sheet-head"><h3>Где купить: ${esc(name)}</h3><button class="close" data-close aria-label="Закрыть">×</button></div>
    <p class="muted small">${c ? `Город: ${esc(c.n)}. ` : ''}Карты ищут магазины рядом. Доставка сама проверит ваш адрес: если сервиса в городе нет, он скажет об этом</p>
    <div class="shop-links">${links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.n)}<span>${esc(l.far ? 'работает не во всех городах' : l.note)}</span></a>`).join('')}</div>
    <h3>Рынки и фермеры</h3>
    <div class="shop-links">${marketLinks().map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.n)}<span>${esc(l.note)}</span></a>`).join('')}</div>
    <button class="btn sm ghost" type="button" data-city-change>Сменить город</button>`);
  $('[data-city-change]', $('#sheet')).addEventListener('click', () => openCitySheet(false));
}

// «Заказать недостающее»: выбранный сервис доставки + ссылка на поиск каждого продукта.
// Положить всю корзину одной ссылкой сервисы не дают — поэтому по продукту на нажатие
function openOrderSheet(names, title, sub = '') {
  const shops = shopLinks('').filter(x => !x.map);
  if (!shops.length) { openBuySheet(names[0]); return; }
  let pick = '';
  try { pick = localStorage.getItem('cook.shop') || ''; } catch { /* ничего */ }
  const cur = shops.find(x => x.n === pick) || shops[0];
  const url = n => shopLinks(n).find(x => x.n === cur.n).url;
  track('order', { shop: cur.n, n: names.length });
  openSheet(`
    <div class="sheet-head"><h3>${esc(title)}</h3><button class="close" data-close aria-label="Закрыть">×</button></div>
    ${sub ? `<p><b>${esc(sub)}</b></p>` : ''}
    <p class="muted small">Где заказать — запомню выбор. Нажмите на продукт: откроется поиск в магазине, добавьте в корзину и возвращайтесь за следующим</p>
    <div class="chips">${shops.map(x => `<button type="button" class="chip${x.n === cur.n ? ' on' : ''}" data-shop="${esc(x.n)}">${esc(x.n)}</button>`).join('')}</div>
    ${cur.far ? '<p class="small muted">Этот сервис работает не во всех городах. Если вашего нет — выберите другой</p>' : ''}
    <div class="shop-links">${names.map(n => `<a href="${esc(url(n))}" target="_blank" rel="noopener" data-done>${esc(n)}<span>${esc(cur.note)}</span></a>`).join('')}</div>`);
  const sh = $('#sheet');
  $$('[data-shop]', sh).forEach(b => b.addEventListener('click', () => { try { localStorage.setItem('cook.shop', b.dataset.shop); } catch { /* ничего */ } openOrderSheet(names, title, sub); }));
  $$('[data-done]', sh).forEach(a => a.addEventListener('click', () => a.classList.add('done')));
}

// ---------- Общие куски ----------
const coef = () => regionCoef(S.city);
const priceOn = () => showPrice(S.city);
function photo(r, small) {
  if (r.img) return `<img src="${esc(small && r.th ? r.th : r.img)}" alt="${esc(r.t)}" loading="lazy" decoding="async" onerror="this.remove()">`;
  return '';
}
function starsText(id) { const n = S.notes[id] && S.notes[id].s; return n ? '★'.repeat(n) : ''; }
function card(row, H) {
  const r = row.r;
  let need = '';
  if (row.saves && row.saves.length) need = `<p class="need save">Спасёт от порчи: ${esc(row.saves.map(id => ING[id].n.toLowerCase()).join(', '))}</p>`;
  else if (H.size) {
    need = row.miss.length ? `<p class="need">Докупить: ${esc(row.miss.slice(0, 3).map(x => ING[x.i.id].n.toLowerCase()).join(', '))}${row.miss.length > 3 ? ' и ещё ' + (row.miss.length - 3) : ''}</p>`
      : `<p class="need ok">Всё есть дома</p>`;
  }
  const pill = H.size && !row.miss.length ? '<span class="pill ok">Всё есть</span>' : H.size ? `<span class="pill">Не хватает ${row.miss.length}</span>` : r.own ? '<span class="pill">Мой рецепт</span>' : '';
  const st = starsText(r.id);
  return `<a class="rcard" href="#/r/${esc(r.id)}">
    <div class="ph"><span class="fallback" aria-hidden="true">${KIND_ICON[r.kind] || '🍽️'}</span>${photo(r, true)}${pill}</div>
    <div class="body">
      <h3>${esc(r.t)}</h3>
      <div class="meta"><span>⏱ ${r.time} мин</span><span>${Math.round(r.ps[0])} ккал</span><span>Б ${Math.round(r.ps[1])} · Ж ${Math.round(r.ps[2])} · У ${Math.round(r.ps[3])}</span>${priceOn() && r.cost ? `<span>≈ ${fmtRub(r.cost * coef())} / порция</span>` : ''}${st ? `<span class="stars">${st}</span>` : ''}</div>
      ${algHTML(r)}
      ${need}
    </div></a>`;
}
function algHTML(r, full) {
  const a = allergens(r);
  if (!a.length) return '';
  return full ? `<p class="alg-full"><b>Аллергены:</b> ${a.map(x => `${x.ic} ${esc(x.n.toLowerCase())}`).join(', ')}</p>`
    : `<div class="alg" aria-label="Аллергены: ${esc(a.map(x => x.n).join(', '))}">${a.map(x => `<span title="${esc(x.n)}">${x.ic}</span>`).join('')}</div>`;
}
function chipsHTML(field, dict, single) {
  const on = k => single ? String(S[field]) === String(k) : S[field].includes(k);
  return `<div class="chips" data-field="${field}"${single ? ' data-single="1"' : ''}>${Object.entries(dict).map(([k, v]) => `<button type="button" class="chip${on(k) ? ' on' : ''}" data-v="${k}" aria-pressed="${on(k)}">${esc(v)}</button>`).join('')}</div>`;
}
function tagsHTML(field) {
  const cls = field === 'have' ? 'have' : field === 'ex' ? 'ex' : 'on';
  return S[field].map(t => `<button type="button" class="chip x ${cls}" data-rm="${esc(t)}" aria-label="Убрать ${esc(tokenName(t))}">${esc(tokenName(t))}${field === 'have' && S.dates[t] ? ' · до ' + esc(S.dates[t].slice(8, 10) + '.' + S.dates[t].slice(5, 7)) : ''}</button>`).join('');
}
function linksHTML(list) {
  return `<div class="links">${list.map(([n, d, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}<span>${esc(d)}</span></a>`).join('')}</div>`;
}
const POPULAR = ['egg', 'g:chicken', 'potato', 'onion', 'carrot', 'pasta', 'rice', 'buckwheat', 'g:mince', 'g:cheese', 'milk', 'tomato', 'cabbage', 'cottage', 'flour', 'g:fish'];
const LEFTOVERS = ['rice_cooked', 'buckwheat_cooked', 'pasta_cooked', 'potato_boiled', 'chicken_cooked', 'beef_cooked', 'bread_stale'];
// Иконки подборок: свои рисунки в фирменном цвете, с лёгкой анимацией у подборки «сейчас» и при наведении
// Значки кнопок: линии цвета текста — одинаково выглядят на всех телефонах и в тёмной теме (эмодзи рисуются по-разному)
const ic = body => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const IC = {
  timer: ic('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
  heart: ic('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>'),
  heartOn: ic('<path class="fill" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>'),
  camera: ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  sparkle: ic('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'),
  chat: ic('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>'),
  fork: ic('<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-2 2-2 6 0 8v10"/>'),
  image: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>'),
  calendar: ic('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  phone: ic('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
  family: ic('<circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="7" r="2.5"/><circle cx="12" cy="13" r="2"/><path d="M4 20v-3a4 4 0 0 1 4-4M20 20v-3a4 4 0 0 0-4-4M9 21v-1a3 3 0 0 1 6 0v1"/>'),
  notebook: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 8h4M12 12h4"/>'),
  speaker: ic('<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  mic: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  pen: ic('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
  list: ic('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  grid: ic('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
};
const ci = (cls, body) => `<svg class="ci ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const COLL_ICON = {
  season: ci('ci-sway', '<path d="M12 21c-4-3-6-6-6-10a6 6 0 0 1 12 0c0 4-2 7-6 10Z"/><path d="M12 21V9M12 13l3-3"/>'),
  cheap: ci('ci-bounce', '<circle cx="12" cy="12" r="8"/><path d="M10 7v10M10 7h3a3 3 0 0 1 0 6h-4M8 15h5"/>'),
  newyear: ci('ci-twinkle', '<path d="M12 3 6 12h3l-4 6h14l-4-6h3z"/><path d="M12 18v3"/><circle class="spark" cx="12" cy="3" r="1.2"/>'),
  maslenitsa: ci('ci-steam', '<ellipse cx="12" cy="17" rx="8" ry="2.5"/><ellipse cx="12" cy="14" rx="7" ry="2.2"/><path class="st" d="M9 9c-1-1.5 1-2.5 0-4M13 9c-1-1.5 1-2.5 0-4"/>'),
  easter: ci('ci-wobble', '<path d="M12 3c3.5 0 6 5 6 9.5A6 6 0 0 1 6 12.5C6 8 8.5 3 12 3Z"/><path d="M6.5 12.5c2-1 3.5 1 5.5 0s3.5 1 5.5 0"/>'),
  post: ci('ci-sway', '<path d="M5 19C5 10 11 5 19 5c0 8-5 14-14 14Z"/><path d="M5 19 13 11"/>'),
  ramadan: ci('ci-glow', '<path d="M16 4a8 8 0 1 0 4 12A6.5 6.5 0 0 1 16 4Z"/><path class="spark" d="m18 7 .6 1.4 1.4.6-1.4.6L18 11l-.6-1.4L16 9l1.4-.6Z"/>'),
  pesach: ci('ci-tilt', '<path d="M7 4h10l-1 7a4 4 0 0 1-8 0Z"/><path d="M12 15v5M8 20h8"/>'),
  bday: ci('ci-float', '<ellipse cx="12" cy="9" rx="5" ry="6"/><path d="m11 15-1 1.5h4L13 15M12 16.5c0 2-2 2.5-1 4.5"/>'),
  picnic: ci('ci-bounce', '<path d="M4 10h16l-2 9H6Z"/><path d="M8 10a4 4 0 0 1 8 0M4 14h16"/>'),
  leftover: ci('ci-spin', '<path d="M7 7a7 7 0 0 1 11 2M17 17a7 7 0 0 1-11-2"/><path d="M18 4v5h-5M6 20v-5h5"/>')
};
const EMPTY_SVG = {
  pot: '<svg class="ill" viewBox="0 0 120 90" aria-hidden="true"><path d="M20 44h80v10a32 32 0 0 1-32 32H52a32 32 0 0 1-32-32Z"/><path d="M12 44h96"/><path d="M45 34c-4-6 4-10 0-16M60 32c-4-6 4-10 0-16M75 34c-4-6 4-10 0-16" class="steam"/></svg>',
  list: '<svg class="ill" viewBox="0 0 120 90" aria-hidden="true"><rect x="30" y="10" width="60" height="74" rx="8"/><path d="M42 30h36M42 44h36M42 58h24"/><path d="m36 30 2 2 4-4M36 44l2 2 4-4" /></svg>',
  heart: '<svg class="ill" viewBox="0 0 120 90" aria-hidden="true"><path d="M60 80S24 58 24 34a18 18 0 0 1 36-4 18 18 0 0 1 36 4c0 24-36 46-36 46Z"/></svg>',
  book: '<svg class="ill" viewBox="0 0 120 90" aria-hidden="true"><path d="M20 16h34a8 8 0 0 1 8 8v58a6 6 0 0 0-6-6H20Z"/><path d="M100 16H70a8 8 0 0 0-8 8v58a6 6 0 0 1 6-6h32Z"/></svg>'
};

// ---------- Экран «Подбор» ----------
// подсказка по времени суток над заголовком: утром завтрак, днём обед, вечером ужин, ночью — на завтра
function dayPartHTML(now = new Date()) {
  const h = now.getHours();
  const [hi, q, label] = h >= 5 && h < 11 ? ['Доброе утро!', 'быстрый завтрак', 'Завтрак за 20 минут']
    : h >= 11 && h < 16 ? ['Добрый день!', 'обед за 30 минут', 'Обед за 30 минут']
      : h >= 16 && h < 22 ? ['Добрый вечер!', 'ужин за 30 минут', 'Ужин за 30 минут']
        : ['Поздно для готовки?', 'впрок на завтра', 'Приготовить на завтра'];
  return `<p class="daypart"><span>${hi}</span><button type="button" data-ex="${q}">${label}<span aria-hidden="true"> →</span></button></p>`;
}
// наши страницы в соцсетях: внизу главной и в «Шпаргалках»
const SOCIAL = [
  ['https://t.me/kulinar_pomoshchnik', 'Telegram-канал', 'рецепт дня каждое утро'],
  ['https://t.me/kulinar_pomoshchnik_bot', 'Бот в Telegram', 'подберёт блюдо из ваших продуктов'],
  ['https://vk.com/club242531804', 'ВКонтакте', 'рецепты и бот в сообщениях'],
  ['https://ok.ru/group/70000058700764', 'Одноклассники', 'рецепты с БЖУ'],
];
function socialHTML() {
  return `<section class="card social" aria-label="Мы в соцсетях"><h2>Мы в соцсетях</h2><div class="shop-links">${SOCIAL.map(([u, n, note]) => `<a href="${u}" target="_blank" rel="noopener">${n}<span>${note}</span></a>`).join('')}</div></section>`;
}
const EXAMPLES = ['ужин из курицы в духовке на 4', 'есть яйца, молоко и мука', 'высокобелковый завтрак', 'суп без мяса', 'на пару для ребёнка 1 год', 'кашерный ужин на 10 гостей', 'грузинская кухня', 'что сделать из вчерашнего риса'];
let titleWords = [], lastNotice = '', shown = 24;
function renderFind() {
  SEASON_NOW.clear(); seasonNow(S.city).forEach(id => SEASON_NOW.add(id));
  const s = S.serv || 0;
  const now = currentOccasions();
  const collOrder = [...now, ...Object.keys(COLLS).filter(k => !now.includes(k))];
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  app.innerHTML = `<div class="page find">
    <section class="hero" aria-label="Что приготовить">
      <div class="hero-text">
        ${dayPartHTML()}
        <h1>Ужин за 30 минут из того, что есть</h1>
        <p class="lead">Напишите или скажите, что есть в холодильнике. Подберу быстрые блюда под ваш город, цель и число гостей</p>
        <form class="ask-row" id="askForm">
          <input class="input" id="askQ" value="${esc(S.q)}" placeholder="Например: ужин из курицы и картошки на 6" enterkeyhint="search" autocomplete="off" aria-label="Опишите, что хотите приготовить">
          ${SR ? '<button class="btn mic" type="button" id="micBtn" aria-label="Сказать голосом"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>' : ''}
          <button class="btn primary" type="submit">Найти</button>
        </form>
        <div class="hint-examples">${EXAMPLES.map(e => `<button type="button" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        ${hook('onlineHeroHTML')}
      </div>
      <div class="hero-media" id="heroMedia" aria-hidden="true"><img src="media/hero-${heroFormat()}.jpg" alt="" width="960" height="540"></div>
    </section>
    <section class="colls" aria-label="Подборки">
      ${collOrder.map(k => `<button type="button" class="coll${S.occ === k ? ' on' : ''}${now.includes(k) ? ' now' : ''}" data-coll="${k}"><span aria-hidden="true">${COLL_ICON[k]}</span>${esc(COLLS[k].n)}${now.includes(k) ? '<small>сейчас</small>' : ''}</button>`).join('')}
    </section>
    <aside class="side card filters" aria-label="Фильтры">
      <details class="fgroup"${wide() ? ' open' : ''}><summary>Что есть дома <span class="sum" data-sum="have"></span></summary><div class="fbody tagbox" data-box="have">
        <div class="ac"><input class="input" data-ac="have" placeholder="Добавить продукт: яйца, фарш…" autocomplete="off"><div class="ac-list" hidden></div></div>
        <div class="chips" data-tags="have">${tagsHTML('have')}</div>
        ${hook('onlinePhotoHTML')}
        <button class="btn sm" type="button" id="datesBtn"${S.have.length ? '' : ' hidden'}>${IC.calendar}Сроки и количество</button>
        <div id="datesBox" hidden></div>
        <p class="small muted">Быстро добавить:</p>
        <div class="chips">${POPULAR.filter(t => !S.have.includes(t)).map(t => `<button type="button" class="chip" data-add-have="${t}">+ ${esc(tokenName(t))}</button>`).join('')}</div>
        <p class="small muted">Осталось со вчера:</p>
        <div class="chips">${LEFTOVERS.filter(t => !S.have.includes(t)).map(t => `<button type="button" class="chip" data-add-have="${t}">+ ${esc(ING[t].n.replace(/\s*\(.*\)/, ''))}</button>`).join('')}</div>
        <p class="small muted">Соль, перец, растительное масло и вода считаются, что есть всегда</p>
      </div></details>
      <details class="fgroup"><summary>Хочу из этого <span class="sum" data-sum="want"></span></summary><div class="fbody tagbox" data-box="want">
        <div class="ac"><input class="input" data-ac="want" placeholder="Например: тыква, творог" autocomplete="off"><div class="ac-list" hidden></div></div>
        <div class="chips" data-tags="want">${tagsHTML('want')}</div>
        <p class="small muted">В сезоне сейчас${S.city ? ' (' + esc(S.city.n) + ')' : ''}: дешевле и вкуснее</p>
        <div class="chips">${seasonNow(S.city).map(id => `<button type="button" class="chip" data-add-want="${id}">+ ${esc(ING[id].n)}</button>`).join('')}</div>
      </div></details>
      <details class="fgroup"><summary>Нельзя / не люблю <span class="sum" data-sum="ex"></span></summary><div class="fbody tagbox" data-box="ex">
        <div class="ac"><input class="input" data-ac="ex" placeholder="Аллергия или нелюбимый продукт" autocomplete="off"><div class="ac-list" hidden></div></div>
        <div class="chips" data-tags="ex">${tagsHTML('ex')}</div>
        <div class="chips">${Object.entries(EXCL).map(([t, n]) => `<button type="button" class="chip" data-add-ex="${t}">${esc(n)}</button>`).join('')}</div>
      </div></details>
      <details class="fgroup"><summary>Когда едим <span class="sum" data-sum="meal"></span></summary><div class="fbody">${chipsHTML('meal', MEALS)}${chipsHTML('kind', KINDS)}</div></details>
      <details class="fgroup"><summary>Цель <span class="sum" data-sum="goals"></span></summary><div class="fbody">${chipsHTML('goals', GOALS)}</div></details>
      <details class="fgroup"><summary>Детям <span class="sum" data-sum="age"></span></summary><div class="fbody">${chipsHTML('age', AGES, true)}
        <p class="small muted">От 1 года — мягкое, на пару и варёное, без соли и сахара. От 3 лет — без острого и жареной корочки</p></div></details>
      <details class="fgroup"><summary>Как готовить <span class="sum" data-sum="methods"></span></summary><div class="fbody">${chipsHTML('methods', METHODS)}
        <p class="small muted">Выберите способ, и я покажу блюда, где нужен только он. Например, только «Варить» — без сковородки и духовки</p></div></details>
      <details class="fgroup"><summary>Питание <span class="sum" data-sum="diets"></span></summary><div class="fbody">${chipsHTML('diets', DIETS)}
        <p class="small muted">Кашерное: без свинины и морепродуктов, мясное не смешано с молочным. Для строгого кашрута берите продукты со знаком кошерности (hechsher)</p></div></details>
      <details class="fgroup"><summary>Кухня <span class="sum" data-sum="cuisine"></span></summary><div class="fbody">${chipsHTML('cuisine', CUISINES)}</div></details>
      <details class="fgroup"><summary>Порций и время <span class="sum" data-sum="serv"></span></summary><div class="fbody">
        <div class="row"><span>Сколько человек:</span>
          <div class="stepper"><button type="button" data-serv="-1" aria-label="Меньше">−</button><output id="servOut">${s || 'как в рецепте'}</output><button type="button" data-serv="1" aria-label="Больше">+</button></div></div>
        <div class="chips">${[1, 2, 4, 6, 10, 20].map(n => `<button type="button" class="chip${s === n ? ' on' : ''}" data-serv-set="${n}">${n === 10 ? '10, компания' : n === 20 ? '20, праздник' : n}</button>`).join('')}</div>
        <div class="row"><span>Готовить не дольше:</span></div>
        <div class="chips">${[[0, 'неважно'], [15, '15 мин'], [30, '30 мин'], [60, '1 час']].map(([v, n]) => `<button type="button" class="chip${S.time === v ? ' on' : ''}" data-time="${v}">${n}</button>`).join('')}</div>
        <div class="chips">${[[0, 'любая сложность'], [1, 'только простые']].map(([v, n]) => `<button type="button" class="chip${S.lvl === v ? ' on' : ''}" data-lvl="${v}">${n}</button>`).join('')}</div>
      </div></details>
      <button class="btn sm ghost" type="button" id="resetBtn">Сбросить фильтры</button>
    </aside>
    <section class="results" id="results" aria-live="polite"></section>
  </div>
  <div class="page social-wrap">${socialHTML()}</div>`;
  bindFind();
  updateResults();
  heroVideo();
}
// Ролик на первом экране: широкий для компьютера и телефона боком, пониже — для телефона
const heroFormat = () => matchMedia('(max-width: 640px) and (orientation: portrait)').matches ? '4x3' : '16x9';
let heroObs = null;
function heroVideo() {
  const box = $('#heroMedia'); if (!box) return;
  const conn = navigator.connection || {};
  // без ролика: экономия трафика, медленная сеть, просьба не анимировать — остаётся фото
  if (conn.saveData || /(^|-)2g|3g/.test(conn.effectiveType || '') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // ролик (~1 МБ) начинаю качать только после загрузки страницы и паузы: иначе он отбирает канал у картинки и скриптов
  if (document.readyState !== 'complete' || !heroVideo.ready) {
    const go = () => setTimeout(() => { heroVideo.ready = true; heroVideo(); }, 1500);
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
    return;
  }
  if ($('video', box)) return;
  const f = heroFormat();
  const v = document.createElement('video');
  Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto', poster: `media/hero-${f}.jpg` });
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.innerHTML = `<source src="media/hero-${f}.webm" type="video/webm"><source src="media/hero-${f}.mp4" type="video/mp4">`;
  v.addEventListener('playing', () => box.classList.add('live'), { once: true });
  box.appendChild(v);
  const p = v.play(); if (p) p.catch(() => v.remove());
  // ролик вне экрана — на паузу, чтобы не тратить батарею
  if (heroObs) heroObs.disconnect();
  heroObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }));
  heroObs.observe(box);
}
function summaries() {
  const set = (k, v) => { const el = $(`[data-sum="${k}"]`); if (el) el.textContent = v; };
  set('have', S.have.length ? S.have.length + ' шт.' : '');
  set('want', S.want.map(tokenName).join(', '));
  set('ex', S.ex.map(tokenName).join(', '));
  set('meal', [...S.meal.map(k => MEALS[k]), ...S.kind.map(k => KINDS[k])].join(', '));
  set('goals', S.goals.map(k => GOALS[k]).join(', '));
  set('age', S.age ? AGES[S.age] : '');
  set('methods', S.methods.length ? 'только ' + S.methods.map(k => METHODS[k].toLowerCase()).join(', ') : '');
  set('diets', S.diets.map(k => DIETS[k]).join(', '));
  set('cuisine', S.cuisine.map(k => CUISINES[k]).join(', '));
  set('serv', [S.serv ? S.serv + ' чел.' : '', S.time ? 'до ' + S.time + ' мин' : ''].filter(Boolean).join(', '));
}
function searchQueryText() {
  const parts = [];
  if (S.q) parts.push(S.q);
  else {
    if (S.occ) parts.push(COLLS[S.occ].n.toLowerCase());
    parts.push(...S.meal.map(k => MEALS[k].toLowerCase()), ...S.kind.map(k => KINDS[k].toLowerCase()));
    parts.push(...S.want.map(t => tokenName(t).replace(/\s*\(.*\)/, '').toLowerCase()));
    if (!S.want.length) parts.push(...S.have.slice(0, 4).map(t => tokenName(t).replace(/\s*\(.*\)/, '').toLowerCase()));
    parts.push(...S.methods.map(k => METHODS[k].toLowerCase()), ...S.diets.map(k => DIETS[k].toLowerCase()), ...S.goals.map(k => GOALS[k].toLowerCase().replace(/,.*$/, '')));
    parts.push(...S.cuisine.map(k => CUISINES[k].toLowerCase() + ' кухня'));
    if (S.age) parts.push(AGES[S.age].toLowerCase());
    if (S.serv) parts.push(`на ${S.serv} человек`);
  }
  return ('рецепт ' + parts.join(' ')).trim();
}
function webLinks(q) {
  const e = encodeURIComponent(q);
  return [
    ['Яндекс', 'поиск рецептов', `https://yandex.ru/search/?text=${e}`],
    ['YouTube', 'видео', `https://www.youtube.com/results?search_query=${e}`],
    ['Rutube', 'видео', `https://rutube.ru/search/?query=${e}`],
    ['VK Видео', 'видео', `https://vk.com/video?q=${e}`],
    ['Поварёнок', 'рецепты с фото по шагам', `https://www.povarenok.ru/recipes/search/?name=${e}`],
    ['Гастроном', 'рецепты', `https://www.gastronom.ru/search?q=${e}`],
    ['Яндекс Картинки', 'как выглядит', `https://yandex.ru/images/search?text=${e}`],
    ['Google', 'поиск', `https://www.google.com/search?q=${e}`]
  ];
}
function updateResults(more) {
  shown = more ? shown + 24 : 24;
  summaries();
  const ES = typeof effS === 'function' ? effS() : S;
  let { rows, H, exp } = compute(ES, { titleWords });
  // до N минут ничего нет (например, «борщ») — показываю блюда подольше, а не пустой экран
  let relaxed = false;
  if (!rows.length && ES.time) {
    const alt = compute({ ...ES, time: 0 }, { titleWords });
    if (alt.rows.length) ({ rows, H, exp } = alt), relaxed = true;
  }
  const box = $('#results');
  const any = S.have.length || S.want.length || S.ex.length || S.meal.length || S.kind.length || S.goals.length || S.methods.length || S.diets.length || S.cuisine.length || S.occ || S.age || S.time || S.lvl || titleWords.length;
  let h = `<div class="results-head"><h2>${rows.length ? `Нашёл ${rows.length} ${plural(rows.length, 'рецепт', 'рецепта', 'рецептов')}` : 'Ничего не нашлось'}</h2>
    <div class="row">
      <div class="seg" role="group" aria-label="Вид"><button type="button" data-view="grid" class="${S.view === 'grid' ? 'on' : ''}" aria-label="Плиткой">${IC.grid}</button><button type="button" data-view="list" class="${S.view === 'list' ? 'on' : ''}" aria-label="Списком">${IC.list}</button></div>
      <label class="sort">Сначала <select id="sortSel">
      ${[['match', 'подходящие'], ['time', 'быстрые'], ['kcal', 'меньше калорий'], ['protein', 'больше белка'], ['cheap', 'дешевле'], ['rated', 'мои оценки']].map(([v, n]) => `<option value="${v}"${S.sort === v ? ' selected' : ''}>${n}</option>`).join('')}
      </select></label></div></div>`;
  if (S.occ && COLLS[S.occ].note) h += `<div class="notice">${esc(COLLS[S.occ].n)}: ${esc(COLLS[S.occ].note)}</div>`;
  if (exp.length) h += `<div class="notice warn">Скоро испортится: ${esc(exp.map(x => tokenName(x.t).toLowerCase() + ' (' + (x.days < 0 ? 'срок вышел' : x.days === 0 ? 'сегодня' : x.days === 1 ? 'завтра' : 'через ' + x.days + ' дня') + ')').join(', '))}. Блюда с ними — первыми</div>`;
  if (lastNotice) h += `<div class="notice">${lastNotice}</div>`;
  if (relaxed) h += `<div class="notice">До ${S.time} минут под запрос ничего нет — показываю блюда, которые готовятся дольше</div>`;
  const om = oneMore(ES);
  h += hook('profileNoticeHTML');
  if (om) h += `<div class="notice ok one-more"><span>Купите только <b>${esc(ING[om.id].n.toLowerCase())}</b> — и откроются ещё ${om.n} ${plural(om.n, 'блюдо', 'блюда', 'блюд')}</span>
    <div class="row"><button class="btn sm primary" type="button" data-om-buy="${om.id}">В список покупок</button><button class="btn sm" type="button" data-om-show="${om.id}">Показать эти блюда</button></div></div>`;
  if (H.size && rows.length) {
    const full = rows.filter(x => !x.miss.length).length;
    h += `<div class="notice ${full ? 'ok' : ''}">${full ? `Из того, что есть, можно приготовить ${full} ${plural(full, 'блюдо', 'блюда', 'блюд')} без похода в магазин` : 'Без магазина не обойтись: сверху блюда, где докупить меньше всего'}</div>`;
  }
  const lc = localCuisine(S.city);
  if (lc && !any && S.sort === 'match') h += `<div class="notice">Сверху блюда, которые любят в вашем регионе: ${esc(CUISINES[lc].toLowerCase())} кухня</div>`;
  h += `<div class="grid${S.view === 'list' ? ' as-list' : ''}">${rows.slice(0, shown).map(x => card(x, H)).join('')}</div>`;
  if (rows.length > shown) h += `<button class="btn" type="button" id="moreBtn">Показать ещё ${Math.min(24, rows.length - shown)} из ${rows.length - shown}</button>`;
  if (!rows.length) h += `<div class="empty">${EMPTY_SVG.pot}<p>Под все условия сразу рецептов нет. Уберите одно-два условия или поищите в интернете по вашему запросу</p>${any ? '<button class="btn" type="button" id="resetBtn2">Сбросить фильтры</button>' : ''}</div>`;
  h += `<div class="card"><h3>Не то? Поищу везде</h3>${hook('onlineNotFoundHTML')}<p class="small muted">Ваш запрос: «${esc(searchQueryText())}». Откроется на сайтах с фото и видео</p>${linksHTML(webLinks(searchQueryText()))}</div>`;
  box.innerHTML = h;
  $('#sortSel').addEventListener('change', e => { S.sort = e.target.value; save(); updateResults(); });
  const r2 = $('#resetBtn2'); if (r2) r2.addEventListener('click', resetFilters);
  const mb = $('#moreBtn'); if (mb) mb.addEventListener('click', () => { const y = scrollY; updateResults(true); scrollTo(0, y); });
  $$('[data-view]', box).forEach(b => b.addEventListener('click', () => { S.view = b.dataset.view; save(); updateResults(); }));
  const omb = $('[data-om-buy]', box);
  if (omb) omb.addEventListener('click', () => { addItemsToList([{ id: omb.dataset.omBuy, g: 0 }], 'чтобы открыть больше блюд'); flyTo(omb, '.tabs [data-tab="list"] svg'); toast('Добавлено в список покупок'); });
  const oms = $('[data-om-show]', box);
  if (oms) oms.addEventListener('click', () => { addToken('want', oms.dataset.omShow); });
  if (!rows.length && any) track('notfound', { q: searchQueryText() });
}
function resetFilters() {
  Object.assign(S, { want: [], ex: [], meal: [], kind: [], goals: [], methods: [], diets: [], cuisine: [], occ: '', age: 0, serv: 0, time: 0, lvl: 0, q: '' });
  titleWords = []; lastNotice = ''; save(); renderFind();
}
function addToken(field, t) {
  if (!S[field].includes(t)) S[field].push(t);
  save();
  $(`[data-tags="${field}"]`).innerHTML = tagsHTML(field);
  $$(`[data-add-${field}="${t}"]`).forEach(b => b.remove());
  if (field === 'have') $('#datesBtn').hidden = false;
  updateResults();
}
function drawDates() {
  const box = $('#datesBox');
  S.stock = S.stock || {};
  box.innerHTML = `<div class="dates">${S.have.map(t => `<label><span>${esc(tokenName(t))}</span><span class="row"><input type="number" min="0" step="any" class="qty-in" data-stock="${esc(t)}" value="${S.stock[t] != null ? S.stock[t] : ''}" placeholder="сколько" aria-label="Сколько, г или шт"><small>${ING[t] && ING[t].pc ? 'шт' : 'г'}</small><input type="date" data-date="${esc(t)}" value="${esc(S.dates[t] || '')}"></span></label>`).join('')}</div>
    <p class="small muted">Срок — что скоро испортится, пойдёт в дело первым. Количество — после «Я приготовил» сайт сам вычтет то, что ушло в блюдо</p>`;
}
function bindFind() {
  const root = $('.find');
  $('#askForm').addEventListener('submit', e => { e.preventDefault(); applyPhrase($('#askQ').value.trim()); });
  const mic = $('#micBtn');
  if (mic) mic.addEventListener('click', listen);
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ex) { $('#askQ').value = b.dataset.ex; applyPhrase(b.dataset.ex); return; }
    if (b.dataset.coll) {
      S.occ = S.occ === b.dataset.coll ? '' : b.dataset.coll;
      $$('[data-coll]').forEach(x => x.classList.toggle('on', x.dataset.coll === S.occ));
      save(); updateResults(); track('coll', { c: S.occ });
      if (!wide() && S.occ) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const chips = b.closest('[data-field]');
    if (chips && b.dataset.v !== undefined) {
      const f = chips.dataset.field;
      if (chips.dataset.single) {
        const v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
        S[f] = S[f] === v ? (typeof v === 'number' ? 0 : '') : v;
        $$('button', chips).forEach(x => { const on = String(S[f]) === x.dataset.v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      } else {
        const v = b.dataset.v;
        S[f] = S[f].includes(v) ? S[f].filter(x => x !== v) : [...S[f], v];
        b.classList.toggle('on'); b.setAttribute('aria-pressed', S[f].includes(v));
      }
      save(); updateResults(); return;
    }
    if (b.dataset.rm) {
      const f = b.closest('[data-tags]').dataset.tags;
      S[f] = S[f].filter(x => x !== b.dataset.rm);
      if (f === 'have') delete S.dates[b.dataset.rm];
      save(); b.remove(); updateResults(); return;
    }
    if (b.dataset.addHave) return addToken('have', b.dataset.addHave);
    if (b.dataset.addWant) return addToken('want', b.dataset.addWant);
    if (b.dataset.addEx) return addToken('ex', b.dataset.addEx);
    if (b.id === 'datesBtn') { const box = $('#datesBox'); box.hidden = !box.hidden; if (!box.hidden) drawDates(); return; }
    if (b.dataset.serv) { S.serv = Math.max(0, Math.min(60, (S.serv || 0) + +b.dataset.serv)); $('#servOut').textContent = S.serv || 'как в рецепте'; syncOn('[data-serv-set]', 'servSet', S.serv); save(); summaries(); return; }
    if (b.dataset.servSet) { S.serv = S.serv === +b.dataset.servSet ? 0 : +b.dataset.servSet; $('#servOut').textContent = S.serv || 'как в рецепте'; syncOn('[data-serv-set]', 'servSet', S.serv); save(); summaries(); return; }
    if (b.dataset.time !== undefined) { S.time = +b.dataset.time; syncOn('[data-time]', 'time', S.time); save(); updateResults(); return; }
    if (b.dataset.lvl !== undefined) { S.lvl = +b.dataset.lvl; syncOn('[data-lvl]', 'lvl', S.lvl); save(); updateResults(); return; }
    if (b.id === 'resetBtn') resetFilters();
  });
  root.addEventListener('change', e => {
    if (e.target.dataset.stock !== undefined) { S.stock = S.stock || {}; const v = parseFloat(e.target.value); if (v > 0) S.stock[e.target.dataset.stock] = v; else delete S.stock[e.target.dataset.stock]; save(); return; }
    const t = e.target.dataset.date; if (t === undefined) return;
    if (e.target.value) S.dates[t] = e.target.value; else delete S.dates[t];
    save(); $('[data-tags="have"]').innerHTML = tagsHTML('have'); updateResults();
  });
  $$('[data-ac]').forEach(inp => bindAC(inp));
}
function syncOn(sel, key, val) { $$(sel).forEach(x => x.classList.toggle('on', +x.dataset[key] === val)); }
function bindAC(inp, onPick) {
  const field = inp.dataset.ac;
  const list = inp.nextElementSibling;
  let items = [], sel = 0;
  const draw = () => {
    items = acSearch(inp.value, field).filter(x => onPick ? ING[x.t] : !S[field].includes(x.t));
    sel = 0;
    list.hidden = !items.length;
    list.innerHTML = items.map((x, i) => `<button type="button" data-t="${esc(x.t)}" class="${i === 0 ? 'sel' : ''}"><span>${esc(x.n)}</span>${ING[x.t] && ING[x.t].r === 3 ? '<span class="muted">бывает не везде</span>' : ''}</button>`).join('');
  };
  const pick = t => { if (onPick) onPick(t); else { addToken(field, t); inp.value = ''; } list.hidden = true; if (!onPick) inp.focus(); };
  inp.addEventListener('input', draw);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) pick(items[sel].t); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      $$('button', list).forEach((b, i) => b.classList.toggle('sel', i === sel));
    } else if (e.key === 'Escape') list.hidden = true;
  });
  inp.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 180));
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(b.dataset.t); });
}
function applyPhrase(text) {
  S.q = text;
  const p = parsePhrase(text);
  Object.assign(S, { want: p.want, ex: p.ex, meal: p.meal, kind: p.kind, methods: p.methods, diets: p.diets, goals: p.goals, cuisine: p.cuisine, occ: p.occ[0] || '', age: p.age, time: p.time, lvl: 0 });
  if (p.serv) S.serv = p.serv;
  for (const t of p.have) if (!S.have.includes(t)) S.have.push(t);
  titleWords = [];
  lastNotice = '';
  if (p.rest.length) {
    const hits = RECIPES.filter(r => p.rest.every(w => r.hay.includes(stem(w))));
    if (hits.length) titleWords = p.rest;
    else lastNotice = `Не нашёл в своих рецептах: «${esc(p.rest.join(' '))}». Ниже — что подходит под остальное, а внизу кнопки поиска по всему интернету`;
  }
  const understood = [
    ...p.have.map(t => 'есть ' + tokenName(t).toLowerCase()), ...p.want.map(t => tokenName(t).toLowerCase()), ...p.ex.map(t => 'без ' + tokenName(t).toLowerCase()),
    ...p.meal.map(k => MEALS[k].toLowerCase()), ...p.kind.map(k => KINDS[k].toLowerCase()), ...p.methods.map(k => METHODS[k].toLowerCase()),
    ...p.diets.map(k => DIETS[k].toLowerCase()), ...p.goals.filter(g => !(g === 'kids' && p.age)).map(k => GOALS[k].toLowerCase()),
    ...p.cuisine.map(k => CUISINES[k].toLowerCase() + ' кухня'), ...p.occ.map(k => COLLS[k].n.toLowerCase()), p.age ? AGES[p.age].toLowerCase() : '',
    p.serv ? `на ${p.serv} чел.` : '', p.time ? `до ${p.time} мин` : '',
    ...(titleWords.length ? ['в названии: ' + titleWords.join(' ')] : [])
  ].filter(Boolean);
  if (understood.length && text) lastNotice = `Понял так: ${esc(understood.join(', '))}. Поправить можно в фильтрах${lastNotice ? '<br>' + lastNotice : ''}`;
  save();
  track('search', { q: text });
  renderFind();
  if (!wide()) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// Голосовой ввод
function listen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const b = $('#micBtn');
  const rec = new SR();
  rec.lang = 'ru-RU'; rec.interimResults = true; rec.maxAlternatives = 1;
  b.classList.add('rec'); toast('Говорите: например, «ужин из курицы на четверых»');
  rec.onresult = e => {
    const txt = [...e.results].map(r => r[0].transcript).join(' ');
    $('#askQ').value = txt;
    if (e.results[e.results.length - 1].isFinal) applyPhrase(txt);
  };
  rec.onerror = e => { toast(e.error === 'not-allowed' ? 'Разрешите доступ к микрофону в настройках браузера' : 'Не расслышал, попробуйте ещё раз'); };
  rec.onend = () => { const m = $('#micBtn'); if (m) m.classList.remove('rec'); };
  try { rec.start(); } catch { b.classList.remove('rec'); }
}

// ---------- Экран рецепта ----------
let curServ = 0, nutMode = 'serv', wakeLock = null, panK = 1, panD = 0;
function renderRecipe(id) {
  const r = RBYID[id];
  if (!r) { app.innerHTML = `<div class="page"><div class="empty">${EMPTY_SVG.pot}<p>Рецепт не найден</p><a class="btn" href="#/">К подбору</a></div></div>`; return; }
  curServ = S.serv || r.serv;
  nutMode = 'serv'; panK = 1; panD = 0;
  drawRecipe(r);
  document.title = r.t + ' — Что приготовить';
  loadGallery(r);
  if (!r.own && !r.ai) track('recipe', { id });
}
function dietBlocks(d, id, r) {
  const ing = ING[id], cat = ing.cat;
  const meatR = r.items.some(i => !i.opt && MEAT.has(ING[i.id].cat));
  switch (d) {
    case 'veg': return MEAT.has(cat) || cat === 'fish' || cat === 'seafood' || ing.fl.includes('j');
    case 'vegan': return MEAT.has(cat) || cat === 'fish' || cat === 'seafood' || cat === 'egg' || cat === 'dairy' || /[jh]/.test(ing.fl);
    case 'kosher': return cat === 'pork' || cat === 'seafood' || /[kj]/.test(ing.fl) || (meatR && cat === 'dairy');
    case 'halal': return cat === 'pork' || /[aj]/.test(ing.fl);
    case 'gf': return ing.fl.includes('g');
    case 'lf': return cat === 'dairy';
  }
  return false;
}
function stepTimers(s, label, rid) {
  return [...s.matchAll(/(?<![\d,.])(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(мин|час)/g)].slice(0, 2)
    .map(m => { const min = Math.round(parseFloat(m[1].replace(',', '.')) * (m[2] === 'мин' ? 1 : 60)); return min > 0 && min <= 600 ? `<button class="btn sm" type="button" data-timer="${min}" data-label="${esc(label)}" data-rid="${esc(rid || '')}">${IC.timer}${min >= 60 ? (min % 60 ? Math.floor(min / 60) + ' ч ' + (min % 60) + ' мин' : min / 60 + ' ч') : min + ' мин'}</button>` : ''; }).join('');
}
function drawRecipe(r) {
  const k = curServ / r.serv * panK;
  const H = haveSet(S);
  const c = S.city;
  const fav = S.fav.includes(r.id);
  const note = S.notes[r.id] || {};
  const facts = [
    `<span class="fact">${r.time} мин</span>`,
    `<span class="fact">${['', 'просто', 'средне', 'сложно'][r.lvl] || ''}</span>`,
    r.cuisine && CUISINES[r.cuisine] ? `<span class="fact">${esc(CUISINES[r.cuisine])} кухня</span>` : '',
    ...r.m.map(m => `<span class="fact">${METHODS[m]}</span>`),
    ...Object.entries(DIETS).filter(([d]) => r.diet[d]).map(([, n]) => `<span class="fact ok">${n}</span>`),
    r.age ? `<span class="fact ok">${esc(AGES[r.age])}</span>` : '',
    ...Object.entries(GOALS).filter(([g]) => r.goal[g] && !['quick', 'party', 'kids'].includes(g)).map(([, n]) => `<span class="fact">${n}</span>`),
    priceOn() && r.cost ? `<span class="fact">≈ ${fmtRub(r.cost * coef())} за порцию</span>` : ''
  ].join('');
  const conflict = it => S.diets.some(d => dietBlocks(d, it.id, r)) || S.ex.some(t => itemHitsToken(it.id, t));
  const missing = [];
  const ingRows = r.items.map(it => {
    const ing = ING[it.id];
    const st = itemStatus(it.id, H);
    const off = it.opt && conflict(it);
    if (!it.opt && st.s === 'miss') missing.push(it);
    const mark = st.s === 'have' ? '<span class="st have" title="есть">✓</span>' : st.s === 'sub' ? '<span class="st have" title="есть замена">≈</span>' : st.s === 'basic' ? '<span class="st basic">•</span>' : '<span class="st miss" title="нет">!</span>';
    const notes = [];
    if (st.s === 'sub') notes.push(`<span class="sub">у вас есть замена: ${esc(ING[st.by].n.toLowerCase())}</span>`);
    if (off) notes.push('<span class="sub warn">не подходит под ваши ограничения, пропустите</span>');
    const rare = c && ((ing.r === 3 && c.tier >= 2) || (ing.r === 2 && c.tier === 3));
    if (rare && st.s === 'miss') notes.push(`<span class="sub warn">в городе ${esc(c.n)} может не найтись${ing.sub ? ', замена: ' + esc(ING[ing.sub].n.toLowerCase()) : ''}</span>`);
    else if (ing.sub && st.s === 'miss') notes.push(`<span class="sub">можно заменить: ${esc(ING[ing.sub].n.toLowerCase())}</span>`);
    if (st.s === 'miss' || (it.opt && st.s !== 'have')) notes.push(`<button class="buy" type="button" data-buy="${esc(ing.n)}">где купить рядом</button>`);
    return `<li class="${it.opt ? 'optional' : ''}${off ? ' off' : ''}">${mark}<span class="nm"><span>${esc(ing.n)}</span>${notes.join('')}</span><span class="qty">${esc(qtyText(it, k))}</span></li>`;
  }).join('');
  const nut = nutMode === 'serv' ? r.ps : nutMode === 'all' ? r.tot.map(v => v * k) : r.tot.map(v => v / Math.max(r.w, 1) * 100);
  const steps = r.steps.map((s, i) => {
    const t = stepTimers(s, `${r.t}, шаг ${i + 1}`, r.id);
    const im = stepImg(r.id, i);
    return `<li data-step="${i}"><div><p>${esc(s)}</p>${im ? `<img class="step-img" src="${esc(im)}" alt="" loading="lazy" decoding="async">` : ''}${t ? `<div class="row tm">${t}</div>` : ''}</div></li>`;
  }).join('');
  const q = r.t;
  const media = [
    ['YouTube', 'видео рецепта', `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' рецепт')}`],
    ['Rutube', 'видео рецепта', `https://rutube.ru/search/?query=${encodeURIComponent(q + ' рецепт')}`],
    ['VK Видео', 'видео рецепта', `https://vk.com/video?q=${encodeURIComponent(q + ' рецепт')}`],
    ['Яндекс Картинки', 'как должно выглядеть', `https://yandex.ru/images/search?text=${encodeURIComponent(q)}`],
    ['Поварёнок', 'с фото каждого шага', `https://www.povarenok.ru/recipes/search/?name=${encodeURIComponent(q)}`],
    ['Еда.ру', 'другие варианты', `https://eda.ru/search?q=${encodeURIComponent(q)}`]
  ];
  const cooked = note.c || 0;
  app.innerHTML = `<article class="page recipe">
    <div class="r-hero">
      <div class="r-photo"><span class="fallback" aria-hidden="true">${KIND_ICON[r.kind] || '🍽️'}</span>${photo(r)}${r.cr ? `<a class="credit" href="${esc(r.cr.u)}" target="_blank" rel="noopener">Фото: ${esc(r.cr.a)}, ${esc(r.cr.l)}</a>` : ''}</div>
      <div class="r-head">
        <a href="#/" class="small no-print" data-back>← назад</a>
        <h1>${esc(r.t)}</h1>
        <p class="lead">${esc(r.d)}</p>
        ${hook('recipeExtraHTML', r)}
        <div class="facts">${facts}</div>
        ${algHTML(r, true)}
        ${hook('profileFitHTML', r)}
        <div class="row no-print">
          <button class="btn primary" type="button" id="cookBtn">▶ Готовить пошагово</button>
          <button class="btn${fav ? ' on-fav' : ''}" type="button" id="favBtn">${fav ? IC.heartOn + 'В избранном' : IC.heart + 'В избранное'}</button>
          <button class="btn" type="button" id="shareBtn">Поделиться</button>
          <button class="btn" type="button" id="printBtn">Распечатать</button>
          ${r.own ? `<a class="btn" href="#/my/edit/${esc(r.id)}">Изменить</a>` : ''}
          ${hook('recipeButtonsHTML', r)}
        </div>
        <label class="switch no-print"><input type="checkbox" id="wakeChk"${wakeLock ? ' checked' : ''}> Не гасить экран, пока готовлю</label>
      </div>
    </div>
    <div class="r-cols">
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2>Продукты</h2>
          <div class="stepper" aria-label="Порций"><button type="button" data-rs="-1" aria-label="Меньше порций">−</button><output>${curServ}</output><button type="button" data-rs="1" aria-label="Больше порций">+</button></div></div>
        <input class="serv-range" type="range" min="1" max="20" step="1" value="${Math.min(curServ, 20)}" data-rsr aria-label="Сколько порций">
        <p class="small muted">${curServ} ${plural(curServ, 'порция', 'порции', 'порций')}${curServ !== r.serv ? ` (в оригинале ${r.serv}), количество пересчитано` : ''}${priceOn() && r.cost ? ` · всё блюдо ≈ ${fmtRub(r.cost * coef() * curServ * panK)}` : ''}</p>
        ${panHTML(r)}
        <ul class="ings">${ingRows}</ul>
        ${missing.length ? `<div class="row"><button class="btn primary" type="button" id="toList">Добавить ${missing.length} в список покупок</button><button class="btn" type="button" id="orderMiss">Заказать недостающее</button></div>` : H.size ? '<div class="notice ok">Всё нужное у вас есть</div>' : ''}
        <h3>БЖУ</h3>
        <div class="seg" role="group" aria-label="БЖУ на">${[['serv', 'на порцию'], ['all', 'на всё блюдо'], ['100', 'на 100 г']].map(([v, n]) => `<button type="button" data-nm="${v}" class="${nutMode === v ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="nutr"><div><b>${Math.round(nut[0])}</b><span>ккал</span></div><div><b>${fmtN(nut[1])}</b><span>белки, г</span></div><div><b>${fmtN(nut[2])}</b><span>жиры, г</span></div><div><b>${fmtN(nut[3])}</b><span>углеводы, г</span></div></div>
        <p class="small muted">Расчёт по средним значениям продуктов, без необязательных. Цены примерные, средние по ${priceOn() ? 'региону' : 'России'}</p>
      </section>
      <section class="card">
        <h2>Как готовить</h2>
        <p class="small muted no-print">Нажмите на шаг, чтобы отметить его сделанным. Кнопка ${IC.timer} запускает таймер</p>
        <ol class="steps">${steps}</ol>
        ${r.tip ? `<div class="tip"><b>Совет.</b> ${esc(r.tip)}</div>` : ''}
        ${drinksHTML(r)}
        ${hook('stepMediaHTML', r)}
        <div class="mynote no-print">
          <h3>Мои заметки</h3>
          <div class="row"><div class="rate" role="group" aria-label="Моя оценка">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${(note.s || 0) >= n ? 'on' : ''}" aria-label="${n} из 5">★</button>`).join('')}</div>
            <button class="btn sm" type="button" id="cookedBtn">Я приготовил${cooked ? ` · ${cooked} ${plural(cooked, 'раз', 'раза', 'раз')}` : ''}</button></div>
          <textarea class="input" id="noteTxt" rows="3" placeholder="Например: соли меньше, в духовке 25 минут хватает">${esc(note.t || '')}</textarea>
          <p class="small muted">Заметки и оценки видите только вы</p>
        </div>
        <h3>Фото и видео</h3>
        <div class="gallery" id="gallery" aria-label="Фото блюда"></div>
        ${linksHTML(media)}
      </section>
    </div>
    ${hook('commentsHTML', r)}
    ${similarHTML(r)}
  </article>`;
  bindRecipe(r);
}
// фото к шагу (ИИ-иллюстрации для популярных рецептов, data/steps.js)
function stepImg(id, i) { const m = (window.STEP_MEDIA || {})[id]; const x = m && m.find(y => y.s === i); return x ? x.i : ''; }
// пересчёт под размер круглой формы: рецепты выпечки рассчитаны на форму около 22 см
function panHTML(r) {
  if (!r.m.includes('oven') || !['bake', 'dessert'].includes(r.kind)) return '';
  return `<div class="pan"><span class="small muted">Моя форма:</span><div class="chips">${[0, 18, 20, 22, 24, 26, 28].map(d => `<button type="button" class="chip${panD === d ? ' on' : ''}" data-pan="${d}">${d ? d + ' см' : 'как в рецепте'}</button>`).join('')}</div>
    ${panD && panD !== 22 ? `<p class="small muted">Рецепт рассчитан на форму около 22 см. Для ${panD} см продукты ×${fmtN(panK)}, время в духовке ${panD > 22 ? 'чуть больше — проверяйте шпажкой' : 'на 5-10 минут меньше'}</p>` : ''}</div>`;
}
function drinksHTML(r) {
  const d = drinks(r, { noAlcohol: S.diets.includes('halal') || S.age > 0 || S.goals.includes('kids') });
  if (!d.soft.length && !d.wine.length) return '';
  return `<div class="drinks"><b>Что подать к столу.</b> ${esc(d.soft.join(', '))}${d.wine.length ? `. Взрослым: ${esc(d.wine.join(' или '))}` : ''}</div>`;
}
function similarHTML(r) {
  const list = similar(r);
  if (!list.length) return '';
  return `<section class="similar no-print"><h2>Похожие блюда</h2><div class="grid">${list.map(x => card({ r: x, miss: [] }, new Set())).join('')}</div></section>`;
}
function setNote(id, patch) { S.notes[id] = { ...(S.notes[id] || {}), ...patch }; save(); }
function flyTo(from, toSel) {
  const to = $(toSel); if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const dot = document.createElement('div'); dot.className = 'fly';
  dot.style.left = a.left + a.width / 2 + 'px'; dot.style.top = a.top + a.height / 2 + 'px';
  document.body.appendChild(dot);
  dot.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) translate(-50%,-50%) scale(.4)`, opacity: .3 }],
    { duration: 650, easing: 'cubic-bezier(.5,-0.2,.7,1)' }).onfinish = () => { dot.remove(); to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300 }); };
}
function addItemsToList(items, title) {
  let n = 0;
  for (const { id, g } of items) {
    const ex = S.list.find(x => x.id === id && !x.got);
    if (ex) { ex.g += g; if (title && !ex.from.includes(title)) ex.from.push(title); } else S.list.push({ id, g, from: title ? [title] : [], got: false });
    n++;
  }
  save(); updateBadge();
  return n;
}
function bindRecipe(r) {
  const root = $('.recipe');
  // ползунок: пока тянут — меняю только число, отпустили — пересчитываю продукты
  root.addEventListener('input', e => { if (e.target.matches('[data-rsr]')) { const o = $('.r-cols .stepper output'); if (o) o.textContent = e.target.value; } });
  root.addEventListener('change', e => { if (e.target.matches('[data-rsr]')) { curServ = +e.target.value; drawRecipe(r); loadGallery(r); } });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button, [data-back], li[data-step]');
    if (!b) return;
    if (b.dataset.back !== undefined) { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = '#/'); return; }
    if (b.dataset.rs) { curServ = Math.max(1, Math.min(100, curServ + +b.dataset.rs)); drawRecipe(r); loadGallery(r); return; }
    if (b.dataset.nm) { nutMode = b.dataset.nm; drawRecipe(r); loadGallery(r); return; }
    if (b.dataset.pan) { panD = +b.dataset.pan; panK = panD ? (panD / 22) ** 2 : 1; drawRecipe(r); loadGallery(r); return; }
    if (b.dataset.buy) { openBuySheet(b.dataset.buy); return; }
    if (b.id === 'orderMiss') { const H = haveSet(S); openOrderSheet(r.items.filter(it => !it.opt && itemStatus(it.id, H).s === 'miss').map(it => ING[it.id].n), 'Заказать недостающее', r.t); return; }
    if (b.dataset.timer) { startTimer(+b.dataset.timer, b.dataset.label, b.dataset.rid); e.stopPropagation(); return; }
    if (b.dataset.star) { const n = +b.dataset.star; setNote(r.id, { s: (S.notes[r.id] || {}).s === n ? 0 : n }); $$('[data-star]', root).forEach(x => x.classList.toggle('on', (S.notes[r.id].s || 0) >= +x.dataset.star)); return; }
    if (b.matches('li[data-step]')) { b.classList.toggle('done'); return; }
    if (b.id === 'cookBtn') { openCook(r); return; }
    if (b.id === 'cookedBtn') { track('cooked', { id: r.id }); const c = ((S.notes[r.id] || {}).c || 0) + 1; setNote(r.id, { c, last: new Date().toISOString().slice(0, 10) }); hook('afterCooked', r, curServ / r.serv * panK); b.textContent = `Я приготовил · ${c} ${plural(c, 'раз', 'раза', 'раз')}`; toast('Отметил. Приятного аппетита!'); return; }
    if (b.id === 'favBtn') { S.fav = S.fav.includes(r.id) ? S.fav.filter(x => x !== r.id) : [...S.fav, r.id]; save(); const on = S.fav.includes(r.id); b.classList.toggle('on-fav', on); b.innerHTML = on ? IC.heartOn + 'В избранном' : IC.heart + 'В избранное'; if (on) b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300 }); return; }
    if (b.id === 'printBtn') { print(); return; }
    if (b.id === 'shareBtn') {
      const url = r.own ? location.href : BASE + 'r/' + r.id + '.html';
      try { if (navigator.share) await navigator.share({ title: r.t, text: r.d, url }); else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } } catch { /* отмена */ }
      return;
    }
    if (b.id === 'toList') {
      track('list', { id: r.id });
      const k = curServ / r.serv * panK, H = haveSet(S);
      const items = r.items.filter(it => !it.opt && itemStatus(it.id, H).s === 'miss').map(it => ({ id: it.id, g: it.g * k }));
      const n = addItemsToList(items, r.t);
      flyTo(b, '.tabs [data-tab="list"] svg');
      toast(`Добавлено в список: ${n}`); b.textContent = 'В списке покупок ✓'; b.disabled = true;
    }
  });
  let noteT = 0;
  $('#noteTxt').addEventListener('input', e => { clearTimeout(noteT); noteT = setTimeout(() => setNote(r.id, { t: e.target.value }), 400); });
  $('#wakeChk').addEventListener('change', async e => {
    if (e.target.checked) { if (!(await keepAwake(true))) { e.target.checked = false; toast('Этот браузер не умеет держать экран включённым'); } else toast('Экран не погаснет, пока открыт рецепт'); }
    else keepAwake(false);
  });
}
async function keepAwake(on) {
  if (!on) { if (wakeLock) { wakeLock.release(); wakeLock = null; } return true; }
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); return true; } catch { return false; }
}
const galleryCache = {};
async function loadGallery(r) {
  const box = $('#gallery'); if (!box) return;
  const fill = list => {
    box.innerHTML = list.map(x => `<a href="${esc(x.page)}" target="_blank" rel="noopener" title="Фото с Wikimedia Commons"><img src="${esc(x.thumb)}" alt="${esc(r.t)}" loading="lazy"></a>`).join('');
    box.hidden = !list.length;
    // у рецепта без своего фото (ИИ, свои) показываю первое найденное как главное
    const hero = $('.r-photo');
    if (!r.img && list[0] && hero && !$('img', hero)) hero.insertAdjacentHTML('beforeend', `<img src="${esc(list[0].thumb.replace(/\/\d+px-/, '/800px-'))}" alt="${esc(r.t)}" onerror="this.remove()">`);
  };
  if (galleryCache[r.id]) return fill(galleryCache[r.id]);
  if (!navigator.onLine || !r.en) { box.hidden = true; return; }
  try {
    const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=320&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + r.en + ' food');
    const d = await getJSON(u, 8000);
    const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index);
    const list = pages.map(p => p.imageinfo && p.imageinfo[0]).filter(i => i && /jpeg|png|webp/.test(i.mime)).slice(0, 8).map(i => ({ thumb: i.thumburl, page: i.descriptionurl }));
    galleryCache[r.id] = list; fill(list);
  } catch { box.hidden = true; }
}

// ---------- Режим готовки: шаги на весь экран ----------
let cookState = null;
function openCook(r) {
  track('cook', { id: r.id });
  const k = curServ / r.serv * panK;
  const el = document.createElement('div');
  el.className = 'cook'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Готовим: ' + r.t);
  document.body.appendChild(el);
  cookState = { r, i: 0, el, k, ings: false };
  document.body.classList.add('cooking');
  keepAwake(true);
  if (el.requestFullscreen && !/iphone|ipad/i.test(navigator.userAgent)) el.requestFullscreen().catch(() => { /* не обязательно */ });
  drawCook();
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go) cookGo(+b.dataset.go);
    else if (b.dataset.timer) startTimer(+b.dataset.timer, b.dataset.label, b.dataset.rid);
    else if (b.id === 'cookClose') closeCook();
    else if (b.id === 'cookIngs') { cookState.ings = !cookState.ings; drawCook(); }
  });
  let x0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) cookGo(dx < 0 ? 1 : -1); x0 = null; });
  history.pushState({ cook: 1 }, '');
}
function drawCook() {
  const { r, i, el, k, ings } = cookState;
  const n = r.steps.length;
  const last = i === n - 1;
  el.innerHTML = `<div class="cook-top"><button class="close" id="cookClose" aria-label="Выйти">×</button><div class="cook-title"><b>${esc(r.t)}</b><span>Шаг ${i + 1} из ${n}</span></div>${hook('cookToolsHTML')}<button class="btn sm" id="cookIngs">${ings ? 'Шаги' : 'Продукты'}</button></div>
    <div class="cook-bar"><span style="width:${(i + 1) / n * 100}%"></span></div>
    ${ings ? `<ul class="ings cook-ings">${r.items.map(it => `<li><span class="st basic">•</span><span class="nm"><span>${esc(ING[it.id].n)}</span></span><span class="qty">${esc(qtyText(it, k))}</span></li>`).join('')}</ul>`
      : `<div class="cook-step">${stepImg(r.id, i) ? `<img class="cook-img" src="${esc(stepImg(r.id, i))}" alt="">` : ''}<p>${esc(r.steps[i])}</p><div class="row">${stepTimers(r.steps[i], `${r.t}, шаг ${i + 1}`, r.id)}</div>${last && r.tip ? `<div class="tip"><b>Совет.</b> ${esc(r.tip)}</div>` : ''}</div>`}
    <div class="cook-nav"><button class="btn" data-go="-1"${i === 0 ? ' disabled' : ''}>← Назад</button>${last ? '<button class="btn primary" data-go="99">Готово!</button>' : '<button class="btn primary" data-go="1">Дальше →</button>'}</div>`;
}
function cookGo(d) {
  if (!cookState) return;
  if (d === 99) { track('cooked', { id: cookState.r.id }); const c = ((S.notes[cookState.r.id] || {}).c || 0) + 1; setNote(cookState.r.id, { c, last: new Date().toISOString().slice(0, 10) }); hook('afterCooked', cookState.r, cookState.k); closeCook(); toast('Готово! Отметил в заметках к рецепту'); return; }
  cookState.i = Math.max(0, Math.min(cookState.r.steps.length - 1, cookState.i + d));
  cookState.ings = false;
  drawCook();
  hook('cookStepChanged');
}
function closeCook(fromPop) {
  if (!cookState) return;
  cookState.el.remove(); cookState = null;
  document.body.classList.remove('cooking');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ничего */ });
  if (!$('#wakeChk') || !$('#wakeChk').checked) keepAwake(false);
  if (!fromPop) history.back();
}
window.addEventListener('popstate', () => { if (cookState) closeCook(true); });
document.addEventListener('keydown', e => {
  if (!cookState) return;
  if (e.key === 'ArrowRight') cookGo(1); else if (e.key === 'ArrowLeft') cookGo(-1); else if (e.key === 'Escape') closeCook();
});

// ---------- Таймеры ----------
const timers = [];
let audioCtx = null, tickId = 0;
function startTimer(min, label, rid) {
  track('timer', { id: rid || '' });
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch { /* без звука */ }
  timers.push({ id: Date.now() + Math.random(), label, rid, min, end: Date.now() + min * 60000, ring: false });
  hook('timerStarted');
  toast(`Таймер на ${min} мин запущен`);
  tick();
  if (!tickId) tickId = setInterval(tick, 1000);
}
function beep() {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.25, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
  o.start(); o.stop(audioCtx.currentTime + 0.5);
}
function tick() {
  const bar = $('#timerBar');
  const now = Date.now();
  for (const t of timers) if (!t.ring && t.end <= now) { t.ring = true; if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); }
  if (timers.some(t => t.ring) && now % 2000 < 1000) beep();
  bar.hidden = !timers.length;
  bar.innerHTML = timers.map(t => {
    const left = Math.max(0, Math.round((t.end - now) / 1000));
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    return `<div class="timer${t.ring ? ' ring' : ''}" title="${esc(t.label)}"><span>${t.ring ? 'Готово! ' + esc(t.label.split(', ').pop()) : IC.timer + mm + ':' + ss}</span>${!t.ring && t.rid && !/^(my|ai)-/.test(t.rid) && window.API_BASE ? `<a class="tg-timer" href="https://t.me/kulinar_pomoshchnik_bot?start=t${Math.max(1, Math.ceil((t.end - now) / 60000))}_${esc(t.rid)}" target="_blank" rel="noopener" title="Напомнить в Telegram, даже если закрыть сайт" aria-label="Напомнить в Telegram">${IC.phone}</a>` : ''}<button type="button" data-stop="${t.id}" aria-label="Остановить таймер">×</button></div>`;
  }).join('');
  if (!timers.length) { clearInterval(tickId); tickId = 0; }
}
$('#timerBar').addEventListener('click', e => {
  const b = e.target.closest('[data-stop]'); if (!b) return;
  const i = timers.findIndex(t => String(t.id) === b.dataset.stop); if (i >= 0) timers.splice(i, 1); tick();
});

// ---------- Покупки ----------
function updateBadge() {
  const n = S.list.filter(x => !x.got).length;
  const b = $('#listBadge'); b.hidden = !n; b.textContent = n;
}
function renderList() {
  const items = S.list.map((x, i) => ({ ...x, i }));
  const c = S.city;
  const groups = DEPTS.map(([key, name]) => [name, items.filter(x => (x.id ? deptOf(x.id) : 'other') === key)]).filter(([, l]) => l.length);
  const total = items.filter(x => !x.got && x.id).reduce((a, x) => a + ingCost(x.id, x.g, c), 0);
  app.innerHTML = `<div class="page">
    <div class="results-head"><h1>Список покупок</h1>${c ? `<span class="muted small">Город: ${esc(c.n)}</span>` : ''}</div>
    ${hook('familyHTML')}
    ${hook('listShareHTML')}
    <form class="ask-row card" id="addItem">
      <input class="input" id="itemQ" placeholder="Добавить свой пункт: хлеб, салфетки…" autocomplete="off">
      <button class="btn" type="submit">Добавить</button>
    </form>
    ${items.length ? `<section class="card">
      ${priceOn() && total > 0 ? `<p class="muted small">Примерно ${fmtRub(total)} за то, что ещё не куплено (без своих пунктов)</p>` : ''}
      ${groups.map(([name, l]) => `<h3 class="dept">${esc(name)}</h3><ul class="shop-list">${l.map(x => {
        const name2 = x.id ? ING[x.id].n : x.n;
        const qty = x.id && x.g ? fmtGrams(x.g, ING[x.id].fl.includes('l')) : '';
        return `<li class="${x.got ? 'got' : ''}"><input type="checkbox" data-got="${x.i}"${x.got ? ' checked' : ''} aria-label="Куплено: ${esc(name2)}">
        <span class="nm">${esc(name2)}${qty ? ' · ' + esc(qty) : ''}${x.from && x.from.length ? `<small>для: ${esc(x.from.join(', '))}</small>` : ''}</span>
        <button class="btn sm" type="button" data-buy="${esc(name2)}">Где купить</button></li>`;
      }).join('')}</ul>`).join('')}
    <div class="row"><button class="btn sm primary" type="button" id="orderList">Заказать всё</button><button class="btn sm" type="button" id="shareList">Отправить список</button><button class="btn sm" type="button" id="clearGot">Убрать купленное</button><button class="btn sm ghost" type="button" id="clearAll">Очистить всё</button></div></section>`
    : `<div class="empty">${EMPTY_SVG.list}<p>Список пуст. Откройте рецепт или меню на неделю и нажмите «Добавить в список покупок» — туда попадёт только то, чего нет дома</p><div class="row"><a class="btn primary" href="#/">Подобрать рецепт</a><a class="btn" href="#/plan">Меню на неделю</a></div></div>`}
  </div>`;
  $('#addItem').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#itemQ').value.trim(); if (!v) return;
    const hit = acSearch(v).find(x => ING[x.t] && norm(x.n) === norm(v)) || null;
    S.list.push(hit ? { id: hit.t, g: 0, from: [], got: false } : { n: v, g: 0, from: [], got: false });
    save(); updateBadge(); renderList();
  });
  app.onchange = e => {
    const i = e.target.dataset.got; if (i === undefined) return;
    S.list[+i].got = e.target.checked; save(); updateBadge();
    e.target.closest('li').classList.toggle('got', e.target.checked);
  };
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  on('#shareList', async () => {
    const lines = [];
    for (const [name, l] of groups) {
      const left = l.filter(x => !x.got); if (!left.length) continue;
      lines.push('', name + ':');
      for (const x of left) lines.push('— ' + (x.id ? ING[x.id].n : x.n) + (x.id && x.g ? ' ' + fmtGrams(x.g, ING[x.id].fl.includes('l')) : ''));
    }
    const text = 'Купить:' + lines.join('\n');
    try { if (navigator.share) await navigator.share({ title: 'Список покупок', text }); else { await navigator.clipboard.writeText(text); toast('Список скопирован, вставьте его в мессенджер'); } } catch { /* отмена */ }
  });
  on('#clearGot', () => { S.list = S.list.filter(x => !x.got); save(); updateBadge(); renderList(); });
  on('#orderList', () => openOrderSheet(S.list.filter(x => !x.got).map(x => x.id ? ING[x.id].n : x.n), 'Заказать по списку'));
  on('#clearAll', () => { if (confirm('Очистить весь список?')) { S.list = []; save(); updateBadge(); renderList(); } });
  $$('[data-buy]', app).forEach(b => b.addEventListener('click', () => openBuySheet(b.dataset.buy)));
}

// ---------- Меню на неделю ----------
const SLOT_NAMES = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' };
function renderPlan() {
  const o = S.planOpt;
  const p = S.plan;
  const restr = [...S.diets.map(k => DIETS[k]), ...S.ex.map(t => 'без: ' + tokenName(t).toLowerCase())];
  let body = '';
  if (p && p.days && p.days.length) {
    const tot = planTotals(p, S.city);
    const H = haveSet(S);
    const start = new Date(p.start || Date.now());
    const needList = Object.entries(tot.need).filter(([id]) => !isStaple(id));
    const toBuy = needList.filter(([id]) => itemStatus(id, H).s === 'miss');
    body = `<section class="card plan-sum">
        <h2>Итог меню</h2>
        <div class="nutr"><div><b>${Math.round(tot.perDay[0])}</b><span>ккал в день</span></div><div><b>${Math.round(tot.perDay[1])}</b><span>белки, г</span></div><div><b>${Math.round(tot.perDay[2])}</b><span>жиры, г</span></div><div><b>${Math.round(tot.perDay[3])}</b><span>углеводы, г</span></div></div>
        <p class="small muted">На одного человека в среднем за день${priceOn() ? `. Продукты на всё меню на ${p.people} ${plural(p.people, 'человека', 'человек', 'человек')}: примерно ${fmtRub(tot.cost)}` : ''}</p>
        ${hook('planShareHTML')}
        <button class="btn primary" type="button" id="planToList">Купить для всего меню: ${toBuy.length} ${plural(toBuy.length, 'продукт', 'продукта', 'продуктов')}</button>
        <details><summary class="small">Что входит в список</summary><p class="small muted">${esc(toBuy.map(([id, g]) => ING[id].n + ' ' + fmtGrams(g, ING[id].fl.includes('l'))).join(', ') || 'всё есть дома')}</p></details>
      </section>
      <div class="plan-days">${p.days.map((day, d) => {
        const date = new Date(start.getTime() + d * 864e5);
        return `<section class="card plan-day"><h3>${esc(date.toLocaleDateString(window.LANG === 'en' ? 'en-GB' : 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>
          ${p.meals.map(slot => { const r = RBYID[day[slot]]; if (!r) return ''; return `<div class="slot"><span class="slot-name">${SLOT_NAMES[slot]}</span>
            <a class="slot-r" href="#/r/${esc(r.id)}"><span class="thumb">${photo(r, true) || KIND_ICON[r.kind]}</span><span><b>${esc(r.t)}</b><small>${r.time} мин · ${Math.round(r.ps[0])} ккал${priceOn() ? ' · ≈ ' + fmtRub(r.cost * coef() * p.people) : ''}</small></span></a>
            <button class="btn sm ghost" type="button" data-swap="${d}:${slot}" aria-label="Заменить блюдо">↻</button></div>`; }).join('')}
        </section>`;
      }).join('')}</div>`;
  } else body = `<div class="empty">${EMPTY_SVG.book}<p>Укажите, на сколько человек и какие приёмы пищи, — составлю разнообразное меню с общим списком покупок. Продукты повторяются между блюдами, чтобы меньше оставалось лишнего</p></div>`;
  app.innerHTML = `<div class="page plan">
    <h1>Меню на неделю</h1>
    <section class="card">
      <div class="row"><span>Человек:</span><div class="stepper"><button type="button" data-pp="-1" aria-label="Меньше">−</button><output>${o.people}</output><button type="button" data-pp="1" aria-label="Больше">+</button></div></div>
      <div class="row"><span>Дней:</span><div class="chips">${[3, 5, 7].map(n => `<button type="button" class="chip${o.days === n ? ' on' : ''}" data-days="${n}">${n}</button>`).join('')}</div></div>
      <div class="chips">${Object.entries(SLOT_NAMES).map(([k, n]) => `<button type="button" class="chip${o.meals.includes(k) ? ' on' : ''}" data-slot="${k}">${n}</button>`).join('')}</div>
      <div class="chips">${[['', 'Обычное'], ['protein', 'Белковое'], ['lowcal', 'Мало калорий'], ['lowcarb', 'Мало углеводов']].map(([k, n]) => `<button type="button" class="chip${o.goal === k ? ' on' : ''}" data-pgoal="${k}">${n}</button>`).join('')}
        <button type="button" class="chip${o.budget ? ' on' : ''}" data-budget>Подешевле</button></div>
      <p class="small muted">${restr.length ? 'Учитываю ваши ограничения: ' + esc(restr.join(', ')) + '. ' : ''}Ограничения меняются в «Подборе» → «Питание» и «Нельзя»</p>
      <button class="btn primary" type="button" id="makePlan">${p ? 'Составить заново' : 'Составить меню'}</button>
    </section>
    ${body}
  </div>`;
  app.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pp) { o.people = Math.max(1, Math.min(30, o.people + +b.dataset.pp)); if (S.plan) S.plan.people = o.people; save(); renderPlan(); }
    else if (b.dataset.days) { o.days = +b.dataset.days; save(); renderPlan(); }
    else if (b.dataset.slot) { const k = b.dataset.slot; o.meals = o.meals.includes(k) ? o.meals.filter(x => x !== k) : [...o.meals, k]; if (!o.meals.length) o.meals = [k]; o.meals.sort((a, b2) => Object.keys(SLOT_NAMES).indexOf(a) - Object.keys(SLOT_NAMES).indexOf(b2)); save(); renderPlan(); }
    else if (b.dataset.pgoal !== undefined) { o.goal = b.dataset.pgoal; save(); renderPlan(); }
    else if (b.dataset.budget !== undefined) { o.budget = !o.budget; save(); renderPlan(); }
    else if (b.id === 'makePlan') { S.plan = makePlan(hook('effS') || S, { ...o, seed: Date.now() }); S.plan.start = new Date().toDateString(); save(); renderPlan(); track('plan', { days: o.days }); }
    else if (b.dataset.swap) { const [d, slot] = b.dataset.swap.split(':'); replaceInPlan(hook('effS') || S, S.plan, +d, slot); save(); renderPlan(); }
    else if (b.id === 'planToList') {
      const tot = planTotals(S.plan, S.city); const H = haveSet(S);
      const items = Object.entries(tot.need).filter(([id]) => !isStaple(id) && itemStatus(id, H).s === 'miss').map(([id, g]) => ({ id, g }));
      const n = addItemsToList(items, 'меню на неделю');
      flyTo(b, '.tabs [data-tab="list"] svg'); toast(`Добавлено в список: ${n}`);
    }
  };
}

// ---------- Избранное и свои рецепты ----------
function renderFav() {
  const H = haveSet(S);
  const rows = S.fav.map(id => RBYID[id]).filter(Boolean).map(r => ({ r, miss: r.items.filter(i => !i.opt).map(i => ({ i, ...itemStatus(i.id, H) })).filter(x => x.s === 'miss') }));
  const mine = RECIPES.filter(r => r.own).map(r => ({ r, miss: [] }));
  const cooked = Object.entries(S.notes).filter(([id, n]) => n.c && RBYID[id]).sort((a, b) => (b[1].last || '').localeCompare(a[1].last || '')).slice(0, 8).map(([id]) => ({ r: RBYID[id], miss: [] }));
  app.innerHTML = `<div class="page">
    <h1>Избранное</h1>
    <div class="row"><a class="btn" href="#/family">${IC.family}Наша семья</a><a class="btn" href="#/diary">${IC.notebook}Дневник питания</a></div>
    ${rows.length ? `<div class="grid">${rows.map(x => card(x, H)).join('')}</div>` : `<div class="empty">${EMPTY_SVG.heart}<p>Здесь будут рецепты, которые вы отметили ♡</p><a class="btn primary" href="#/">Подобрать рецепт</a></div>`}
    <div class="results-head"><h2>Мои рецепты</h2><a class="btn primary" href="#/my/new">+ Добавить свой рецепт</a></div>
    ${mine.length ? `<div class="grid">${mine.map(x => card(x, new Set())).join('')}</div>` : '<p class="muted">Добавьте бабушкин рецепт: сайт сам посчитает БЖУ, цену и пересчитает на любое число порций</p>'}
    ${cooked.length ? `<h2>Недавно готовил</h2><div class="grid">${cooked.map(x => card(x, new Set())).join('')}</div>` : ''}
    <p class="small muted">Избранное, заметки и свои рецепты хранятся только на этом устройстве</p>
  </div>`;
}
const UNITS = [['г', 1], ['мл', 1], ['шт', 0], ['ст. л.', 15], ['ч. л.', 5], ['стак.', 200], ['по вкусу', 0]];
function gramsFor(id, amount, unit) {
  if (unit === 'по вкусу') return 2;
  if (unit === 'шт') return amount * (ING[id].pc || 100);
  const u = UNITS.find(x => x[0] === unit);
  return amount * (u ? u[1] : 1);
}
function renderMyEdit(id) {
  const r0 = id ? S.own.find(x => x.id === id) : null;
  const r = r0 || { t: '', d: '', serv: 2, time: 30, lvl: 1, meal: ['dinner'], kind: 'main', m: ['fry'], ing: [], steps: [], tip: '', tags: [] };
  let rows = r.ing.map(([iid, g, u, q]) => ({ id: iid, u: u && UNITS.some(x => x[0] === u) ? u : 'г', a: q || (u && u !== 'г' && u !== 'мл' ? 0 : g) }));
  let img = r.img || '';
  const drawRows = () => {
    $('#ingRows').innerHTML = rows.map((x, i) => `<div class="ing-row" data-i="${i}">
      <div class="ac"><input class="input" data-ac="own" value="${esc(x.id ? ING[x.id].n : '')}" placeholder="Продукт" autocomplete="off"><div class="ac-list" hidden></div></div>
      <input class="input num" type="number" min="0" step="any" value="${x.a || ''}" data-amt aria-label="Количество">
      <select class="input" data-unit aria-label="Единица">${UNITS.map(([u]) => `<option${u === x.u ? ' selected' : ''}>${u}</option>`).join('')}</select>
      <button class="close" type="button" data-del="${i}" aria-label="Убрать">×</button></div>`).join('');
    $$('#ingRows [data-ac]').forEach((inp, i) => bindAC(inp, t => { rows[i].id = t; inp.value = ING[t].n; }));
  };
  app.innerHTML = `<div class="page"><h1>${r0 ? 'Изменить рецепт' : 'Мой рецепт'}</h1>
    <form class="card my-form" id="myForm">
      <label>Название<input class="input" name="t" required value="${esc(r.t)}" placeholder="Бабушкины пирожки"></label>
      <label>Коротко о блюде<input class="input" name="d" value="${esc(r.d)}" placeholder="Одно предложение"></label>
      <div class="row"><label>Порций<input class="input num" type="number" name="serv" min="1" value="${r.serv}"></label><label>Минут<input class="input num" type="number" name="time" min="1" value="${r.time}"></label>
        <label>Блюдо<select class="input" name="kind">${Object.entries(KINDS).map(([k, n]) => `<option value="${k}"${r.kind === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div><span class="small muted">Когда едят</span><div class="chips" id="myMeal">${Object.entries(MEALS).map(([k, n]) => `<button type="button" class="chip${r.meal.includes(k) ? ' on' : ''}" data-v="${k}">${n}</button>`).join('')}</div></div>
      <div><span class="small muted">Как готовить</span><div class="chips" id="myM">${Object.entries(METHODS).map(([k, n]) => `<button type="button" class="chip${r.m.includes(k) ? ' on' : ''}" data-v="${k}">${n}</button>`).join('')}</div></div>
      <div><h3>Продукты</h3><p class="small muted">Выбирайте из подсказок, тогда посчитаю БЖУ и цену</p><div id="ingRows"></div><button class="btn sm" type="button" id="addIng">+ Продукт</button></div>
      <label>Шаги — каждый с новой строки<textarea class="input" name="steps" rows="7" placeholder="Обжарьте лук до золотистого цвета, 5 минут">${esc(r.steps.join('\n'))}</textarea></label>
      <label>Совет<input class="input" name="tip" value="${esc(r.tip || '')}"></label>
      <div class="row"><label class="btn sm">${IC.camera}Фото<input type="file" accept="image/*" id="myPhoto" hidden></label><span class="small muted" id="photoState">${img ? 'фото есть' : 'без фото'}</span></div>
      <div class="row"><button class="btn primary" type="submit">Сохранить</button>${r0 ? '<button class="btn ghost" type="button" id="delMy">Удалить рецепт</button>' : ''}<a class="btn ghost" href="#/fav">Отмена</a></div>
    </form></div>`;
  if (!rows.length) rows = [{ id: '', a: '', u: 'г' }, { id: '', a: '', u: 'г' }, { id: '', a: '', u: 'г' }];
  drawRows();
  const form = $('#myForm');
  form.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.closest('#myMeal, #myM') && b.dataset.v) { b.classList.toggle('on'); return; }
    if (b.id === 'addIng') { syncRows(); rows.push({ id: '', a: '', u: 'г' }); drawRows(); return; }
    if (b.dataset.del !== undefined) { syncRows(); rows.splice(+b.dataset.del, 1); drawRows(); return; }
    if (b.id === 'delMy' && confirm('Удалить рецепт?')) { S.own = S.own.filter(x => x.id !== r0.id); S.fav = S.fav.filter(x => x !== r0.id); save(); buildRecipes(S.own); location.hash = '#/fav'; }
  });
  const syncRows = () => $$('.ing-row').forEach((el, i) => { rows[i].a = parseFloat($('[data-amt]', el).value) || 0; rows[i].u = $('[data-unit]', el).value; });
  $('#myPhoto').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#photoState').textContent = 'сжимаю…';
    try { img = await compressImage(f, 800, 0.72); $('#photoState').textContent = 'фото добавлено'; } catch { $('#photoState').textContent = 'не получилось прочитать фото'; }
  });
  form.addEventListener('submit', e => {
    e.preventDefault(); syncRows();
    const fd = new FormData(form);
    const ing = rows.filter(x => x.id).map(x => {
      const g = Math.round(gramsFor(x.id, x.a || 0, x.u) * 10) / 10;
      return x.u === 'по вкусу' ? [x.id, g, 'по вкусу', 0] : x.u === 'г' || x.u === 'мл' ? [x.id, g] : [x.id, g, x.u, x.a];
    });
    if (!ing.length) { toast('Добавьте хотя бы один продукт из подсказок'); return; }
    const rec = {
      id: r0 ? r0.id : 'my-' + Date.now().toString(36), t: fd.get('t').trim(), d: fd.get('d').trim().replace(/\.$/, '') || 'Мой рецепт', serv: Math.max(1, +fd.get('serv') || 2), time: Math.max(1, +fd.get('time') || 30), lvl: 1,
      kind: fd.get('kind'), meal: $$('#myMeal .on').map(b => b.dataset.v), m: $$('#myM .on').map(b => b.dataset.v), ing,
      steps: fd.get('steps').split('\n').map(s => s.trim()).filter(Boolean), tip: fd.get('tip').trim(), tags: [], img
    };
    if (!rec.meal.length) rec.meal = ['dinner'];
    if (!rec.m.length) rec.m = ['raw'];
    S.own = r0 ? S.own.map(x => x.id === rec.id ? rec : x) : [rec, ...S.own];
    if (!save()) { rec.img = ''; S.own = S.own.map(x => x.id === rec.id ? rec : x); save(); }
    buildRecipes(S.own);
    location.hash = '#/r/' + rec.id;
  });
}
function compressImage(file, max, q) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(im.src);
      resolve(cv.toDataURL('image/jpeg', q));
    };
    im.onerror = reject;
    im.src = URL.createObjectURL(file);
  });
}

// ---------- Шпаргалки ----------
function table(head, rows) {
  return `<div class="tbl-wrap"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const THEMES = [['', 'как в системе'], ['light', 'светлая'], ['dark', 'тёмная'], ['warm', 'тёплая вечерняя']];
try { if (localStorage.getItem('cook.big') === '1') document.documentElement.classList.add('big'); } catch { /* ничего */ }
function renderHelp() {
  const H = window.HELP;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const cur = document.documentElement.dataset.theme || '';
  app.innerHTML = `<div class="page"><h1>Шпаргалки</h1>
    ${socialHTML()}
    <div class="help-grid">
      <section class="card"><h2>Чем заменить</h2>${table(['Нет', 'Возьмите'], H.swaps)}</section>
      <section class="card"><h2>Сколько варить крупы</h2>${table(['Крупа', 'Воды на 1 стакан', 'Минут', 'Важно'], H.grains)}</section>
      <section class="card"><h2>Духовка без градусника</h2>${table(['Жар', 'Градусы', 'Для чего'], H.oven)}</section>
      <section class="card"><h2>Мерки без весов</h2>${table(['Мера', 'Объём', 'Сколько весит'], H.measures)}</section>
      <section class="card"><h2>Как понять, что готово</h2>${table(['Продукт', 'Признак'], H.ready)}</section>
      <section class="card"><h2>Сколько хранится</h2>${table(['Что', 'Срок'], H.store)}</section>
      <section class="card" id="install"><h2>Установить как приложение</h2>
        <p>Иконка появится на рабочем столе, сайт откроется на весь экран и будет работать без интернета: рецепты, список покупок и шпаргалки сохраняются на телефоне</p>
        ${ios ? '<p><b>iPhone и iPad:</b> откройте сайт в Safari → кнопка «Поделиться» (квадрат со стрелкой) → «На экран "Домой"»</p>'
          : '<p><b>Android, компьютер:</b> нажмите кнопку «Установить» вверху. Если её нет — меню браузера ⋮ → «Установить приложение» или «Добавить на главный экран»</p><p><b>iPhone:</b> Safari → «Поделиться» → «На экран "Домой"»</p>'}
        <button class="btn primary" type="button" id="installBtn2"${deferredInstall ? '' : ' hidden'}>Установить</button>
      </section>
      ${hook('syncHTML')}
      <section class="card"><h2>Оформление</h2>
        <div class="chips">${THEMES.map(([k, n]) => `<button type="button" class="chip${cur === k ? ' on' : ''}" data-theme-set="${k}">${n}</button>`).join('')}</div>
        <p class="small muted">Тёплая вечерняя — мягкий тёмный свет, не слепит на кухне вечером</p>
        <label class="switch"><input type="checkbox" id="bigChk"${document.documentElement.classList.contains('big') ? ' checked' : ''}> Крупный шрифт — удобно читать с плиты</label>
      </section>
      <section class="card"><h2>О сайте</h2>
        <p>Рецептов в базе: ${RECIPES.length}. Всё, что вы вводите, хранится только на вашем устройстве. Город определяется по интернет-подключению (с VPN может ошибаться) — его всегда можно сменить вверху</p>
        <p class="small muted">Фото блюд — Wikimedia Commons, авторы подписаны на фото. БЖУ считается по средним таблицам калорийности, цены — средние по России с поправкой на регион</p>
      </section>
    </div></div>`;
  const ib = $('#installBtn2'); if (ib) ib.addEventListener('click', doInstall);
  $$('[data-theme-set]').forEach(b => b.addEventListener('click', () => { setTheme(b.dataset.themeSet); renderHelp(); }));
  $('#bigChk').addEventListener('change', e => { document.documentElement.classList.toggle('big', e.target.checked); try { localStorage.setItem('cook.big', e.target.checked ? '1' : '0'); } catch { /* ничего */ } });
}
function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('cook.theme', t); } catch { /* ничего */ }
}
try { const th = localStorage.getItem('cook.theme'); if (th) document.documentElement.dataset.theme = th; } catch { /* ничего */ }

// ---------- Шторка, подсказки ----------
const sheet = $('#sheet');
function openSheet(html) { $('#sheetBody').innerHTML = html; if (!sheet.open) sheet.showModal(); }
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });
let toastT = 0;
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- Установка ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('#installBtn').hidden = false; const b = $('#installBtn2'); if (b) b.hidden = false; });
async function doInstall() {
  if (!deferredInstall) { location.hash = '#/help'; setTimeout(() => $('#install') && $('#install').scrollIntoView({ behavior: 'smooth' }), 50); return; }
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => null);
  deferredInstall = null; $('#installBtn').hidden = true;
}
$('#installBtn').addEventListener('click', doInstall);
window.addEventListener('appinstalled', () => { track('install'); $('#installBtn').hidden = true; toast('Приложение установлено'); });

// ---------- Telegram Mini App ----------
let TG = null;
function initTelegram() {
  if (!/tgWebApp/.test(location.hash + location.search)) return;
  // Telegram дописывает к адресу свои данные: оставляю только нашу часть (#/r/…, #/join/…, #/?have=…)
  const h = location.hash, cut = h.search(/[#&?]tgWebApp/);
  const keep = cut > 1 ? h.slice(0, cut) : '#/';
  history.replaceState(null, '', location.pathname + (keep.startsWith('#/') ? keep : '#/'));
  document.documentElement.classList.add('in-tg');
  const sc = document.createElement('script');
  sc.src = 'https://telegram.org/js/telegram-web-app.js';
  sc.onload = () => {
    TG = window.Telegram && window.Telegram.WebApp; if (!TG) return;
    TG.ready(); TG.expand();
    applyTgTheme();
    TG.onEvent('themeChanged', applyTgTheme);
    TG.BackButton.onClick(() => history.back());
    syncTgBack();
  };
  document.head.appendChild(sc);
}
// цвета сайта внутри Telegram берутся из темы самого Telegram у человека
function applyTgTheme() {
  const p = TG && TG.themeParams; if (!p || !p.bg_color) return;
  const st = document.documentElement.style;
  const set = (v, c) => { if (c) st.setProperty(v, c); };
  if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = TG.colorScheme === 'dark' ? 'dark' : 'light';
  set('--bg', p.secondary_bg_color || p.bg_color); set('--surface', p.bg_color); set('--text', p.text_color);
  set('--muted', p.hint_color); set('--accent', p.button_color); set('--accent-text', p.button_text_color);
  set('--surface-2', p.secondary_bg_color); set('--line', p.section_separator_color || p.hint_color + '40');
  try { TG.setHeaderColor(p.bg_color); TG.setBackgroundColor(p.secondary_bg_color || p.bg_color); } catch { /* старый Telegram */ }
}
function syncTgBack() { if (TG) (location.hash && location.hash !== '#/' ? TG.BackButton.show() : TG.BackButton.hide()); }

// ---------- Маршруты ----------
let findScroll = 0, curView = '';
function route() {
  const h = location.hash || '#/';
  const prev = curView;
  if (prev === 'find') findScroll = scrollY;
  if (cookState) closeCook(true);
  app.onclick = null; app.onchange = null;
  $$('.tabs a').forEach(a => a.classList.remove('on'));
  const tab = n => { const a = $(`.tabs [data-tab="${n}"]`); if (a) a.classList.add('on'); };
  document.title = HOME_TITLE;
  // вопрос про город — только на главной: на других страницах он закрывал бы рецепт
  const cc = $('#cityConfirm'); if (cc) cc.classList.toggle('away', !/^#\/?(\?.*)?$/.test(h));
  syncTgBack();
  const go = (view, t, fn) => { curView = view; tab(t); fn(); scrollTo(0, 0); };
  const extra = hook('onlineRoute', h) || hook('extraRoute', h);
  if (extra) return go(extra[0], extra[1], extra[2]);
  if (h.startsWith('#/r/')) return go('recipe', 'find', () => renderRecipe(decodeURIComponent(h.slice(4))));
  if (h === '#/list') return go('list', 'list', renderList);
  if (h === '#/plan') return go('plan', 'plan', renderPlan);
  if (h === '#/fav') return go('fav', 'fav', renderFav);
  if (h === '#/help') return go('help', 'help', renderHelp);
  if (h === '#/my/new') return go('my', 'fav', () => renderMyEdit(''));
  if (h.startsWith('#/my/edit/')) return go('my', 'fav', () => renderMyEdit(decodeURIComponent(h.slice(10))));
  curView = 'find'; tab('find'); renderFind();
  if (prev === 'recipe') requestAnimationFrame(() => scrollTo(0, findScroll)); else scrollTo(0, 0);
}
function rerender() {
  if (curView === 'find') renderFind();
  else if (['recipe', 'plan', 'list'].includes(curView)) route();
}
window.addEventListener('hashchange', route);

// ---------- Запуск ----------
function boot() {
  initTelegram();
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone && !TG) { const b = $('#installBtn'); b.hidden = false; b.textContent = 'На экран'; }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* без офлайна */ });
  // ссылки вида #/?have=egg,milk&q=… (из бота и чужих ссылок)
  const m = location.hash.match(/^#\/\?(.*)$/);
  if (m) {
    const p = new URLSearchParams(m[1]);
    for (const t of (p.get('have') || '').split(',')) if (ING[t] && !S.have.includes(t)) S.have.push(t);
    if (p.get('q')) S.q = p.get('q');
    save();
    history.replaceState(null, '', location.pathname + '#/');
    if (p.get('q')) setTimeout(() => applyPhrase(S.q), 0);
  }
  updateBadge();
  route();
  initCity();
  track('open', { path: location.hash, ...visitMeta() });
}
// ---------- Автообновление ----------
// После публикации у сайта новая версия (её ставит GitHub при заливке). Сайт сам это замечает
// и перезагружается в спокойный момент: не в режиме готовки и не когда человек печатает.
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || 'dev';
let updateReady = false;
function calmMoment() {
  const a = document.activeElement;
  return !cookState && !timers.length && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !(sheet && sheet.open);
}
function applyUpdate() {
  if (!updateReady) return;
  if (document.hidden || calmMoment()) location.reload();
}
async function checkUpdate() {
  if (APP_VERSION === 'dev' || updateReady || !navigator.onLine) return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (v && v !== APP_VERSION) {
      updateReady = true;
      if (document.hidden) return; // перезагружу, когда человек вернётся на вкладку
      if (calmMoment()) { toast('Сайт обновился, загружаю новую версию…'); setTimeout(applyUpdate, 1200); }
    }
  } catch { /* нет сети — проверю позже */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (updateReady) applyUpdate(); else checkUpdate(); } });
window.addEventListener('hashchange', () => { if (updateReady) setTimeout(applyUpdate, 300); });
setInterval(checkUpdate, 5 * 60 * 1000);
setTimeout(checkUpdate, 20000);
// новый офлайн-помощник (sw.js) взял управление — значит, вышла новая версия
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) { updateReady = true; applyUpdate(); } });
}

// запуск откладываю до конца загрузки всех скриптов (online.js встраивает свои функции)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);

'use strict';
/* «Что приготовить» — всё работает в браузере, данные пользователя хранятся только на его устройстве */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
const app = $('#app');

// ---------- Справочники ----------
const ING = {};
for (const r of window.ING_RAW) {
  ING[r[0]] = { id: r[0], n: r[1], cat: r[2], e: [r[3], r[4], r[5], r[6]], pc: r[7], r: r[8], fl: r[9], sub: r[10], syn: r[11] ? r[11].split(',') : [] };
}
const isStaple = id => ING[id] && ING[id].fl.includes('s');

const GROUPS = {
  'g:chicken': { n: 'Курица (любая часть)', keys: ['курица', 'курочка', 'куриное'], ids: ['chicken_breast', 'chicken_thigh', 'chicken_legs', 'chicken_wings', 'chicken_whole', 'chicken_mince'] },
  'g:meat': { n: 'Мясо (любое)', keys: ['мясо', 'мясное'], ids: ['beef', 'pork', 'lamb', 'pork_ribs'] },
  'g:mince': { n: 'Фарш (любой)', keys: ['фарш'], ids: ['beef_mince', 'mixed_mince', 'chicken_mince', 'turkey_mince'] },
  'g:fish': { n: 'Рыба (любая)', keys: ['рыба', 'рыбное'], ids: Object.values(ING).filter(i => i.cat === 'fish').map(i => i.id) },
  'g:seafood': { n: 'Морепродукты', keys: ['морепродукты'], ids: Object.values(ING).filter(i => i.cat === 'seafood').map(i => i.id) },
  'g:cheese': { n: 'Сыр (любой)', keys: ['сыр', 'сырок'], ids: ['cheese', 'mozzarella', 'feta', 'parmesan', 'cream_cheese'] },
  'g:greens': { n: 'Зелень (любая)', keys: ['зелень'], ids: ['dill', 'parsley', 'cilantro', 'basil', 'green_onion'] },
  'g:mushrooms': { n: 'Грибы (любые)', keys: ['грибы', 'грибочки'], ids: ['mushrooms', 'forest_mushrooms'] },
  'g:offal': { n: 'Субпродукты', keys: ['печень', 'печенка', 'субпродукты'], ids: ['chicken_liver', 'beef_liver', 'chicken_hearts'] }
};
const EXCL = {
  'c:nut': 'Орехи', 'c:dairy': 'Молочное', 'c:egg': 'Яйца', 'c:fish': 'Рыба', 'c:seafood': 'Морепродукты',
  'c:pork': 'Свинина', 'c:mushroom': 'Грибы', 'f:g': 'Глютен', 'f:h': 'Мёд', 'c:offal': 'Субпродукты'
};
const tokenName = t => GROUPS[t] ? GROUPS[t].n : EXCL[t] ? EXCL[t] : ING[t] ? ING[t].n : t;
const tokenIds = t => GROUPS[t] ? GROUPS[t].ids : ING[t] ? [t] : [];
const itemHitsToken = (id, t) => {
  if (t.startsWith('c:')) return ING[id].cat === t.slice(2);
  if (t.startsWith('f:')) return ING[id].fl.includes(t.slice(2));
  return tokenIds(t).includes(id);
};

const MEALS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус', dessert: 'Десерт' };
const KINDS = { soup: 'Суп', main: 'Второе', side: 'Гарнир', salad: 'Салат', breakfast: 'Завтрак', bake: 'Выпечка', dessert: 'Десерт', snack: 'Закуска', drink: 'Напиток', sauce: 'Соус' };
const METHODS = { boil: 'Варить', fry: 'Жарить', steam: 'На пару', oven: 'В духовке', stew: 'Тушить', micro: 'Микроволновка', raw: 'Без готовки' };
const DIETS = { veg: 'Вегетарианское', vegan: 'Веганское', kosher: 'Кашерное', halal: 'Халяль', gf: 'Без глютена', lf: 'Без лактозы' };
const GOALS = {
  protein: 'Высокобелковое', lowcarb: 'Мало углеводов', lowcal: 'Мало калорий', lowfat: 'Мало жиров',
  sweet: 'Сладкое', quick: 'Быстро, до 30 мин', budget: 'Недорого', kids: 'Для детей', prep: 'Впрок, на завтра', party: 'Для компании'
};
const KIND_ICON = { soup: '🍲', main: '🍽️', side: '🍚', salad: '🥗', breakfast: '🍳', bake: '🥧', dessert: '🍰', snack: '🥪', drink: '🥤', sauce: '🥫' };

// ---------- Рецепты ----------
const MEAT = new Set(['poultry', 'beef', 'pork', 'lamb', 'offal']);
function prepRecipe(r) {
  r.items = r.ing.map(([id, g, u, q, o]) => ({ id, g, u, q, opt: !!o }));
  const req = r.items.filter(i => !i.opt);
  const tot = [0, 0, 0, 0];
  let w = 0;
  for (const i of req) { const e = ING[i.id].e; for (let k = 0; k < 4; k++) tot[k] += e[k] * i.g / 100; w += i.g; }
  r.tot = tot; r.w = w;
  r.ps = tot.map(v => v / r.serv);
  const cats = new Set(req.map(i => ING[i.id].cat));
  const fl = req.map(i => ING[i.id].fl).join('');
  const meat = [...cats].some(c => MEAT.has(c));
  const fishy = cats.has('fish');
  const veg = !meat && !fishy && !cats.has('seafood') && !fl.includes('j');
  r.diet = {
    veg,
    vegan: veg && !cats.has('egg') && !cats.has('dairy') && !fl.includes('h'),
    kosher: !cats.has('pork') && !cats.has('seafood') && !fl.includes('k') && !fl.includes('j') && !(meat && cats.has('dairy')) && !(meat && fishy),
    halal: !cats.has('pork') && !fl.includes('a') && !fl.includes('j'),
    gf: !fl.includes('g'),
    lf: !cats.has('dairy')
  };
  const [kc, p, f, c] = r.ps;
  r.goal = {
    protein: p >= 18 && p * 4 / Math.max(kc, 1) >= 0.22,
    lowcarb: c <= 20,
    lowcal: kc <= 400,
    lowfat: f <= 12,
    sweet: r.tags.includes('sweet') || r.kind === 'dessert',
    quick: r.time <= 30,
    budget: r.tags.includes('budget'),
    kids: r.tags.includes('kids') && !r.tags.includes('spicy'),
    prep: r.tags.includes('prep'),
    party: r.tags.includes('party') || r.serv >= 8
  };
  r.hay = norm(r.t + ' ' + r.d + ' ' + (KINDS[r.kind] || ''));
  return r;
}
const RECIPES = (window.RECIPES || []).map(prepRecipe);
const RBYID = Object.fromEntries(RECIPES.map(r => [r.id, r]));

// ---------- Состояние ----------
const KEY = 'cook.v1';
const DEF = { city: null, have: [], want: [], ex: [], meal: [], kind: [], goals: [], methods: [], diets: [], serv: 0, time: 0, lvl: 0, sort: 'match', fav: [], list: [], q: '' };
let S;
try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = { ...DEF }; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* приватный режим */ } };

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
  if (!confirmed) $('#cityConfirmText').textContent = `Похоже, вы в городе ${c.n}. Верно? Покажу, где купить продукты рядом с вами`;
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
    <p class="muted small">Город нужен, чтобы показывать магазины и доставку рядом с вами и предупреждать, если продукт у вас редкость</p>
    <button class="btn" id="gpsBtn" type="button"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/></svg>Определить точно по геолокации</button>
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
    const b = e.currentTarget; b.disabled = true; b.lastChild.textContent = 'Определяю…';
    try { const c = await detectByGPS(); setCity(c, true); closeSheet(); toast(`Ваш город: ${c.n}`); }
    catch { b.disabled = false; b.lastChild.textContent = 'Не получилось. Разрешите доступ к геолокации или выберите из списка'; }
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
function openBuySheet(name) {
  const c = S.city;
  const links = shopLinks(name);
  openSheet(`
    <div class="sheet-head"><h3>Где купить: ${esc(name)}</h3><button class="close" data-close aria-label="Закрыть">×</button></div>
    <p class="muted small">${c ? `Город: ${esc(c.n)}. ` : ''}Карты ищут магазины рядом. Доставка сама проверит ваш адрес: если сервиса в городе нет, он скажет об этом</p>
    <div class="shop-links">${links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.n)}<span>${esc(l.far ? 'работает не во всех городах' : l.note)}</span></a>`).join('')}</div>
    <button class="btn sm ghost" type="button" data-city-change>Сменить город</button>`);
  $('[data-city-change]', $('#sheet')).addEventListener('click', () => openCitySheet(false));
}

// ---------- Поиск по продуктам ----------
const ACINDEX = [
  ...Object.entries(GROUPS).map(([t, g]) => ({ t, n: g.n, keys: g.keys.map(norm), grp: 1 })),
  ...Object.values(ING).map(i => ({ t: i.id, n: i.n, keys: [norm(i.n), ...i.syn.map(norm)] }))
];
function acSearch(q, mode) {
  q = norm(q); if (!q) return [];
  const res = [];
  if (mode === 'ex') for (const [t, n] of Object.entries(EXCL)) if (norm(n).startsWith(q)) res.push({ t, n, rank: 0 });
  for (const x of ACINDEX) {
    let rank = 9;
    x.keys.forEach((k, i) => {
      if (k.startsWith(q)) rank = Math.min(rank, i === 0 ? 1 : 2);
      else if (k.includes(' ' + q) || k.includes(q)) rank = Math.min(rank, 4);
    });
    if (rank < 9) res.push({ t: x.t, n: x.n, rank: rank - (x.grp ? 0.5 : 0) });
  }
  return res.sort((a, b) => a.rank - b.rank || a.n.length - b.n.length).slice(0, 8);
}

// ---------- Разбор фразы ----------
const stem = w => w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2));
const WORD_RULES = [
  [/завтрак/, 'meal', 'breakfast'], [/обед/, 'meal', 'lunch'], [/ужин/, 'meal', 'dinner'], [/перекус|закуск/, 'meal', 'snack'], [/десерт|сладк|к чаю/, 'goals', 'sweet'],
  [/суп|бульон/, 'kind', 'soup'], [/салат/, 'kind', 'salad'], [/гарнир/, 'kind', 'side'], [/выпеч|пирог|печень[ея]|кекс/, 'kind', 'bake'],
  [/вар(ить|еное|еный|ка|ят)|отвар/, 'methods', 'boil'], [/жар(ить|еное|еный|ка)|сковород/, 'methods', 'fry'], [/на пару|пароварк/, 'methods', 'steam'],
  [/духовк|запеч|запек|запека/, 'methods', 'oven'], [/туш(ить|еное|еный|ка)/, 'methods', 'stew'], [/без готовки|без варки|сыро/, 'methods', 'raw'], [/микроволн|свч/, 'methods', 'micro'],
  [/вегетариан|без мяса|постн/, 'diets', 'veg'], [/веган/, 'diets', 'vegan'], [/кошер|кашер|кашрут/, 'diets', 'kosher'], [/халал|халял/, 'diets', 'halal'],
  [/без глютен/, 'diets', 'gf'], [/без лактоз|без молок/, 'diets', 'lf'],
  [/белк|протеин|бжу|спорт|масс/, 'goals', 'protein'], [/низкоуглевод|без углевод|кето|мало углевод/, 'goals', 'lowcarb'],
  [/низкокалор|диет|похуд|легк|мало калор|\sпп\s/, 'goals', 'lowcal'], [/быстр|на скорую/, 'goals', 'quick'], [/дешев|бюджет|недорог|эконом/, 'goals', 'budget'],
  [/дет(ям|ей|ский)|ребен|малыш/, 'goals', 'kids'], [/впрок|на завтра|на неделю|заготов/, 'goals', 'prep'], [/компани|гост|праздник|застол/, 'goals', 'party']
];
const STOP = new Set('что как из на для с со и в во у меня есть хочу можно нужно рецепт рецепты блюдо блюда приготовить сделать сготовить еда еду поесть быстро вкусно человек людей порций порции персон без или а но мне нам дома осталось остались имеется только чтобы чем какой какое какие из-за под от до по к'.split(' '));

function parsePhrase(text) {
  const out = { meal: [], kind: [], methods: [], diets: [], goals: [], want: [], have: [], ex: [], serv: 0, time: 0, rest: [] };
  let t = ' ' + norm(text).replace(/[.,;!?()«»"]/g, ' ').replace(/-(то|нибудь|либо)(?=\s|$)/g, ' ') + ' ';
  const sv = t.match(/на\s+(\d{1,2})\s*(чел|перс|порц|гост|люд)?/) || t.match(/(\d{1,2})\s*(чел|перс|порц|гост)/);
  if (sv) out.serv = +sv[1];
  if (/компани|гостей|праздник/.test(t) && !out.serv) out.serv = 10;
  const tm = t.match(/за\s+(\d{1,3})\s*мин/); if (tm) out.time = +tm[1];
  for (const [re, f, v] of WORD_RULES) {
    if (!re.test(t)) continue;
    if (!out[f].includes(v)) out[f].push(v);
    // слова-признаки убираю, чтобы они не попали в «не понял»
    t = t.replace(new RegExp('\\S*(' + re.source + ')\\S*', 'g'), ' ');
  }
  t = t.replace(/\sбез(?=\s+(без|и|$|\s))/g, ' ');
  const haveMode = /\s(есть|имеется|дома|осталось|остались|остался)\s/.test(t);
  // «без лука» → исключить
  const words = t.split(/\s+/).filter(Boolean);
  const used = new Set();
  const keys = [];
  for (const x of ACINDEX) for (const k of x.keys) keys.push({ t: x.t, k, ws: k.split(' ').map(stem), grp: !!x.grp });
  keys.sort((a, b) => b.ws.length - a.ws.length || b.grp - a.grp || b.k.length - a.k.length);
  for (let i = 0; i < words.length; i++) {
    if (used.has(i) || words[i].length < 3) continue;
    for (const key of keys) {
      if (!key.ws.every((s, j) => words[i + j] && words[i + j].startsWith(s) && !used.has(i + j))) continue;
      if (key.ws[0].length < 3) continue;
      key.ws.forEach((_, j) => used.add(i + j));
      const neg = words[i - 1] === 'без' || (words[i - 2] === 'без' && words[i - 1] === 'и');
      const list = neg ? out.ex : haveMode ? out.have : out.want;
      if (!list.includes(key.t)) list.push(key.t);
      break;
    }
  }
  const ruleHit = w => WORD_RULES.some(([re]) => re.test(' ' + w + ' '));
  words.forEach((w, i) => { if (!used.has(i) && w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w) && !ruleHit(w) && !/^(чел|перс|порц|гост|мин)/.test(w)) out.rest.push(w); });
  return out;
}

// ---------- Подбор ----------
function haveSet() {
  const h = new Set();
  for (const t of S.have) for (const id of tokenIds(t)) h.add(id);
  return h;
}
function itemStatus(id, H) {
  if (isStaple(id)) return { s: 'basic' };
  if (H.has(id)) return { s: 'have' };
  const ing = ING[id];
  if (ing.sub && H.has(ing.sub)) return { s: 'sub', by: ing.sub };
  const rev = Object.values(ING).find(x => x.sub === id && H.has(x.id));
  if (rev) return { s: 'sub', by: rev.id };
  return { s: 'miss' };
}
function methodOk(r) {
  if (!S.methods.length) return true;
  const allow = new Set([...S.methods, 'raw']);
  if (S.methods.length === 1 && S.methods[0] === 'raw') return r.m.every(m => m === 'raw');
  return r.m.every(m => allow.has(m)) && r.m.some(m => S.methods.includes(m) || m === 'raw');
}
let titleWords = [];
function compute() {
  const H = haveSet();
  const rows = [];
  for (const r of RECIPES) {
    if (S.meal.length && !S.meal.some(m => r.meal.includes(m))) continue;
    if (S.kind.length && !S.kind.includes(r.kind)) continue;
    if (!methodOk(r)) continue;
    if (S.diets.some(d => !r.diet[d])) continue;
    if (S.goals.some(g => !r.goal[g])) continue;
    if (S.time && r.time > S.time) continue;
    if (S.lvl && r.lvl > S.lvl) continue;
    if (S.ex.some(t => r.items.some(i => !i.opt && itemHitsToken(i.id, t)))) continue;
    if (S.want.some(t => !r.items.some(i => itemHitsToken(i.id, t)))) continue;
    if (titleWords.length && !titleWords.every(w => r.hay.includes(stem(w)))) continue;
    const req = r.items.filter(i => !i.opt);
    const st = req.map(i => ({ i, ...itemStatus(i.id, H) }));
    const miss = st.filter(x => x.s === 'miss');
    const used = st.filter(x => x.s === 'have' || x.s === 'sub').length;
    rows.push({ r, miss, used });
  }
  const fav = new Set(S.fav);
  const mOn = r => S.methods.some(m => m !== 'raw' && r.m.includes(m)) ? 0 : 1;
  const byMatch = (a, b) => (S.methods.length ? mOn(a.r) - mOn(b.r) : 0) || (H.size ? a.miss.length - b.miss.length || b.used - a.used : 0) || (fav.has(b.r.id) - fav.has(a.r.id)) || a.r.time - b.r.time;
  const sorters = {
    match: byMatch,
    time: (a, b) => a.r.time - b.r.time,
    kcal: (a, b) => a.r.ps[0] - b.r.ps[0],
    protein: (a, b) => b.r.ps[1] - a.r.ps[1]
  };
  rows.sort(sorters[S.sort] || byMatch);
  return { rows, H };
}

// ---------- Отрисовка: общие куски ----------
const fmtN = v => v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace('.', ',');
const FRAC = [[0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.67, '⅔'], [0.75, '¾']];
function fmtQty(v) {
  if (v >= 10) return String(Math.round(v));
  const whole = Math.floor(v), fr = v - whole;
  if (fr < 0.13) return String(whole || '¼');
  if (fr > 0.87) return String(whole + 1);
  const f = FRAC.reduce((a, b) => Math.abs(b[0] - fr) < Math.abs(a[0] - fr) ? b : a);
  return (whole ? whole : '') + f[1];
}
function fmtGrams(g, liquid) {
  const u = liquid ? 'мл' : 'г';
  if (g >= 1000) return (Math.round(g / 100) / 10).toString().replace('.', ',') + (liquid ? ' л' : ' кг');
  if (g >= 50) return Math.round(g / 5) * 5 + ' ' + u;
  return Math.max(1, Math.round(g)) + ' ' + u;
}
function qtyText(it, k) {
  const ing = ING[it.id];
  if (it.u === 'по вкусу') return 'по вкусу';
  if (it.u && it.u !== 'г' && it.u !== 'мл' && it.q) return fmtQty(it.q * k) + ' ' + it.u;
  if (ing.pc && !it.u && ing.cat !== 'spice') {
    const n = it.g * k / ing.pc;
    if (n >= 0.5 && n <= 20) return fmtQty(n) + ' шт';
  }
  return fmtGrams(it.g * k, ing.fl.includes('l'));
}
function photo(r, cls = '') {
  if (r.img) return `<img class="${cls}" src="${esc(r.img)}" alt="${esc(r.t)}" loading="lazy" decoding="async" onerror="this.remove()">`;
  return '';
}
function card(row, H) {
  const r = row.r;
  let need = '';
  if (H.size) {
    need = row.miss.length ? `<p class="need">Докупить: ${esc(row.miss.slice(0, 3).map(x => ING[x.i.id].n.toLowerCase()).join(', '))}${row.miss.length > 3 ? ' и ещё ' + (row.miss.length - 3) : ''}</p>`
      : `<p class="need ok">Всё есть дома</p>`;
  }
  const pill = H.size && !row.miss.length ? '<span class="pill ok">Всё есть</span>' : H.size ? `<span class="pill">Не хватает ${row.miss.length}</span>` : '';
  return `<a class="rcard" href="#/r/${esc(r.id)}">
    <div class="ph"><span class="fallback" aria-hidden="true">${KIND_ICON[r.kind] || '🍽️'}</span>${photo(r)}${pill}</div>
    <div class="body">
      <h3>${esc(r.t)}</h3>
      <div class="meta"><span>${r.time} мин</span><span>${Math.round(r.ps[0])} ккал</span><span>Б ${Math.round(r.ps[1])} · Ж ${Math.round(r.ps[2])} · У ${Math.round(r.ps[3])}</span></div>
      ${need}
    </div></a>`;
}
function chipsHTML(field, dict) {
  return `<div class="chips" data-field="${field}">${Object.entries(dict).map(([k, v]) => `<button type="button" class="chip${S[field].includes(k) ? ' on' : ''}" data-v="${k}" aria-pressed="${S[field].includes(k)}">${esc(v)}</button>`).join('')}</div>`;
}
function tagsHTML(field) {
  const cls = field === 'have' ? 'have' : field === 'ex' ? 'ex' : 'on';
  return S[field].map(t => `<button type="button" class="chip x ${cls}" data-rm="${esc(t)}" aria-label="Убрать ${esc(tokenName(t))}">${esc(tokenName(t))}</button>`).join('');
}
const POPULAR = ['egg', 'g:chicken', 'potato', 'onion', 'carrot', 'pasta', 'rice', 'buckwheat', 'g:mince', 'g:cheese', 'milk', 'tomato', 'cabbage', 'cottage', 'flour', 'g:fish'];
function seasonNow() {
  const m = new Date().getMonth() + 1;
  const ids = new Set(window.SEASON[m]);
  if (S.city && S.city.zone === 'south') for (const id of window.SEASON[m % 12 + 1]) ids.add(id);
  if (S.city && ['north', 'siberia', 'fareast'].includes(S.city.zone)) for (const id of window.SEASON[(m + 10) % 12 + 1]) if (!['tomato', 'eggplant', 'bell_pepper'].includes(id)) ids.add(id);
  return [...ids].filter(id => ING[id]);
}

// ---------- Экран «Подбор» ----------
const wide = () => matchMedia('(min-width: 1000px)').matches;
const EXAMPLES = ['ужин из курицы в духовке на 4', 'есть яйца, молоко и мука', 'высокобелковый завтрак', 'суп без мяса', 'на пару для ребёнка', 'кашерный ужин на 10 гостей', 'десерт за 15 минут'];
function renderFind() {
  const s = S.serv || 0;
  app.innerHTML = `<div class="page find">
    <section class="ask card" aria-label="Что приготовить">
      <h1>Что приготовить?</h1>
      <form class="ask-row" id="askForm">
        <input class="input" id="askQ" value="${esc(S.q)}" placeholder="Например: ужин из курицы и картошки на 6" enterkeyhint="search" autocomplete="off" aria-label="Опишите, что хотите приготовить">
        <button class="btn primary" type="submit">Найти</button>
      </form>
      <div class="hint-examples">${EXAMPLES.map(e => `<button type="button" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
    </section>
    <aside class="side card filters" aria-label="Фильтры">
      <details class="fgroup"${wide() ? " open" : ""}><summary>Что есть дома <span class="sum" data-sum="have"></span></summary><div class="fbody tagbox" data-box="have">
        <div class="ac"><input class="input" data-ac="have" placeholder="Добавить продукт: яйца, фарш…" autocomplete="off"><div class="ac-list" hidden></div></div>
        <div class="chips" data-tags="have">${tagsHTML('have')}</div>
        <p class="small muted">Быстро добавить:</p>
        <div class="chips">${POPULAR.filter(t => !S.have.includes(t)).map(t => `<button type="button" class="chip" data-add-have="${t}">+ ${esc(tokenName(t))}</button>`).join('')}</div>
        <p class="small muted">Соль, перец, растительное масло и вода считаются, что есть всегда</p>
      </div></details>
      <details class="fgroup"><summary>Хочу из этого <span class="sum" data-sum="want"></span></summary><div class="fbody tagbox" data-box="want">
        <div class="ac"><input class="input" data-ac="want" placeholder="Например: тыква, творог" autocomplete="off"><div class="ac-list" hidden></div></div>
        <div class="chips" data-tags="want">${tagsHTML('want')}</div>
        <p class="small muted">В сезоне сейчас${S.city ? ' (' + esc(S.city.n) + ')' : ''}: дешевле и вкуснее</p>
        <div class="chips">${seasonNow().map(id => `<button type="button" class="chip" data-add-want="${id}">+ ${esc(ING[id].n)}</button>`).join('')}</div>
      </div></details>
      <details class="fgroup"><summary>Нельзя / не люблю <span class="sum" data-sum="ex"></span></summary><div class="fbody tagbox" data-box="ex">
        <div class="ac"><input class="input" data-ac="ex" placeholder="Аллергия или нелюбимый продукт" autocomplete="off"><div class="ac-list" hidden></div></div>
        <div class="chips" data-tags="ex">${tagsHTML('ex')}</div>
        <div class="chips">${Object.entries(EXCL).map(([t, n]) => `<button type="button" class="chip" data-add-ex="${t}">${esc(n)}</button>`).join('')}</div>
      </div></details>
      <details class="fgroup"><summary>Когда едим <span class="sum" data-sum="meal"></span></summary><div class="fbody">${chipsHTML('meal', MEALS)}${chipsHTML('kind', KINDS)}</div></details>
      <details class="fgroup"><summary>Цель <span class="sum" data-sum="goals"></span></summary><div class="fbody">${chipsHTML('goals', GOALS)}</div></details>
      <details class="fgroup"><summary>Как готовить <span class="sum" data-sum="methods"></span></summary><div class="fbody">${chipsHTML('methods', METHODS)}
        <p class="small muted">Выберите способ, и я покажу блюда, где нужен только он. Например, только «Варить» — без сковородки и духовки</p></div></details>
      <details class="fgroup"><summary>Питание <span class="sum" data-sum="diets"></span></summary><div class="fbody">${chipsHTML('diets', DIETS)}
        <p class="small muted">Кашерное: без свинины и морепродуктов, мясное не смешано с молочным. Для строгого кашрута берите продукты со знаком кошерности (hechsher)</p></div></details>
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
  </div>`;
  bindFind();
  updateResults();
}
function summaries() {
  const set = (k, v) => { const el = $(`[data-sum="${k}"]`); if (el) el.textContent = v; };
  set('have', S.have.length ? S.have.length + ' шт.' : '');
  set('want', S.want.map(tokenName).join(', '));
  set('ex', S.ex.map(tokenName).join(', '));
  set('meal', [...S.meal.map(k => MEALS[k]), ...S.kind.map(k => KINDS[k])].join(', '));
  set('goals', S.goals.map(k => GOALS[k]).join(', '));
  set('methods', S.methods.length ? 'только ' + S.methods.map(k => METHODS[k].toLowerCase()).join(', ') : '');
  set('diets', S.diets.map(k => DIETS[k]).join(', '));
  set('serv', [S.serv ? S.serv + ' чел.' : '', S.time ? 'до ' + S.time + ' мин' : ''].filter(Boolean).join(', '));
}
function searchQueryText() {
  const parts = [];
  if (S.q) parts.push(S.q);
  else {
    parts.push(...S.meal.map(k => MEALS[k].toLowerCase()), ...S.kind.map(k => KINDS[k].toLowerCase()));
    parts.push(...S.want.map(t => tokenName(t).replace(/\s*\(.*\)/, '').toLowerCase()));
    if (!S.want.length) parts.push(...S.have.slice(0, 4).map(t => tokenName(t).replace(/\s*\(.*\)/, '').toLowerCase()));
    parts.push(...S.methods.map(k => METHODS[k].toLowerCase()), ...S.diets.map(k => DIETS[k].toLowerCase()), ...S.goals.map(k => GOALS[k].toLowerCase().replace(/,.*$/, '')));
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
function linksHTML(list) {
  return `<div class="links">${list.map(([n, d, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}<span>${esc(d)}</span></a>`).join('')}</div>`;
}
let lastNotice = '', shown = 24;
function updateResults(more) {
  shown = more ? shown + 24 : 24;
  summaries();
  const { rows, H } = compute();
  const box = $('#results');
  const any = S.have.length || S.want.length || S.ex.length || S.meal.length || S.kind.length || S.goals.length || S.methods.length || S.diets.length || S.time || S.lvl || titleWords.length;
  let h = `<div class="results-head"><h2>${rows.length ? `Нашёл ${rows.length} ${plural(rows.length, 'рецепт', 'рецепта', 'рецептов')}` : 'Ничего не нашлось'}</h2>
    <label class="sort">Сначала <select id="sortSel">
      ${[['match', 'подходящие'], ['time', 'быстрые'], ['kcal', 'меньше калорий'], ['protein', 'больше белка']].map(([v, n]) => `<option value="${v}"${S.sort === v ? ' selected' : ''}>${n}</option>`).join('')}
    </select></label></div>`;
  if (lastNotice) h += `<div class="notice">${lastNotice}</div>`;
  if (H.size && rows.length) {
    const full = rows.filter(x => !x.miss.length).length;
    h += `<div class="notice ${full ? 'ok' : ''}">${full ? `Из того, что есть, можно приготовить ${full} ${plural(full, 'блюдо', 'блюда', 'блюд')} без похода в магазин` : 'Без магазина не обойтись: сверху блюда, где докупить меньше всего'}</div>`;
  }
  if (!S.city || !S.city.confirmed) h += '';
  h += `<div class="grid">${rows.slice(0, shown).map(x => card(x, H)).join('')}</div>`;
  if (rows.length > shown) h += `<button class="btn" type="button" id="moreBtn">Показать ещё ${Math.min(24, rows.length - shown)} из ${rows.length - shown}</button>`;
  if (!rows.length) h += `<div class="empty"><p>Под все условия сразу рецептов нет. Уберите одно-два условия или поищите в интернете по вашему запросу</p>${any ? '<button class="btn" type="button" id="resetBtn2">Сбросить фильтры</button>' : ''}</div>`;
  h += `<div class="card"><h3>Не то? Поищу везде</h3><p class="small muted">Ваш запрос: «${esc(searchQueryText())}». Откроется на сайтах с фото и видео</p>${linksHTML(webLinks(searchQueryText()))}</div>`;
  box.innerHTML = h;
  $('#sortSel').addEventListener('change', e => { S.sort = e.target.value; save(); updateResults(); });
  const r2 = $('#resetBtn2'); if (r2) r2.addEventListener('click', resetFilters);
  const mb = $('#moreBtn'); if (mb) mb.addEventListener('click', () => { const y = scrollY; updateResults(true); scrollTo(0, y); });
}
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }
function resetFilters() {
  Object.assign(S, { want: [], ex: [], meal: [], kind: [], goals: [], methods: [], diets: [], serv: 0, time: 0, lvl: 0, q: '' });
  titleWords = []; lastNotice = ''; save(); renderFind();
}
function addToken(field, t) {
  if (!S[field].includes(t)) S[field].push(t);
  save();
  $(`[data-tags="${field}"]`).innerHTML = tagsHTML(field);
  $$(`[data-add-${field}="${t}"]`).forEach(b => b.remove());
  updateResults();
}
function bindFind() {
  const root = $('.find');
  $('#askForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#askQ').value.trim();
    applyPhrase(text);
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ex) { $('#askQ').value = b.dataset.ex; applyPhrase(b.dataset.ex); return; }
    const chips = b.closest('[data-field]');
    if (chips && b.dataset.v) {
      const f = chips.dataset.field, v = b.dataset.v;
      S[f] = S[f].includes(v) ? S[f].filter(x => x !== v) : [...S[f], v];
      b.classList.toggle('on'); b.setAttribute('aria-pressed', S[f].includes(v));
      save(); updateResults(); return;
    }
    if (b.dataset.rm) {
      const f = b.closest('[data-tags]').dataset.tags;
      S[f] = S[f].filter(x => x !== b.dataset.rm); save(); b.remove(); updateResults(); return;
    }
    if (b.dataset.addHave) return addToken('have', b.dataset.addHave);
    if (b.dataset.addWant) return addToken('want', b.dataset.addWant);
    if (b.dataset.addEx) return addToken('ex', b.dataset.addEx);
    if (b.dataset.serv) { S.serv = Math.max(0, Math.min(60, (S.serv || 0) + +b.dataset.serv)); $('#servOut').textContent = S.serv || 'как в рецепте'; syncOn('[data-serv-set]', 'servSet', S.serv); save(); summaries(); return; }
    if (b.dataset.servSet) { S.serv = S.serv === +b.dataset.servSet ? 0 : +b.dataset.servSet; $('#servOut').textContent = S.serv || 'как в рецепте'; syncOn('[data-serv-set]', 'servSet', S.serv); save(); summaries(); return; }
    if (b.dataset.time !== undefined) { S.time = +b.dataset.time; syncOn('[data-time]', 'time', S.time); save(); updateResults(); return; }
    if (b.dataset.lvl !== undefined) { S.lvl = +b.dataset.lvl; syncOn('[data-lvl]', 'lvl', S.lvl); save(); updateResults(); return; }
    if (b.id === 'resetBtn') resetFilters();
  });
  $$('[data-ac]').forEach(inp => bindAC(inp));
}
function syncOn(sel, key, val) { $$(sel).forEach(x => x.classList.toggle('on', +x.dataset[key] === val)); }
function bindAC(inp) {
  const field = inp.dataset.ac;
  const list = inp.nextElementSibling;
  let items = [], sel = 0;
  const draw = () => {
    items = acSearch(inp.value, field).filter(x => !S[field].includes(x.t));
    sel = 0;
    list.hidden = !items.length;
    list.innerHTML = items.map((x, i) => `<button type="button" data-t="${esc(x.t)}" class="${i === 0 ? 'sel' : ''}"><span>${esc(x.n)}</span>${ING[x.t] && ING[x.t].r === 3 ? '<span class="muted">бывает не везде</span>' : ''}</button>`).join('');
  };
  const pick = t => { addToken(field, t); inp.value = ''; list.hidden = true; inp.focus(); };
  inp.addEventListener('input', draw);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) pick(items[sel].t); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
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
  Object.assign(S, { want: p.want, ex: p.ex, meal: p.meal, kind: p.kind, methods: p.methods, diets: p.diets, goals: p.goals, time: p.time, lvl: 0 });
  if (p.serv) S.serv = p.serv;
  for (const t of p.have) if (!S.have.includes(t)) S.have.push(t);
  // слова, которые не разобрал: если это название блюда — ищу по названию
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
    ...p.diets.map(k => DIETS[k].toLowerCase()), ...p.goals.map(k => GOALS[k].toLowerCase()), p.serv ? `на ${p.serv} чел.` : '', p.time ? `до ${p.time} мин` : '',
    ...(titleWords.length ? ['в названии: ' + titleWords.join(' ')] : [])
  ].filter(Boolean);
  if (understood.length && text) lastNotice = `Понял так: ${esc(understood.join(', '))}. Поправить можно в фильтрах${lastNotice ? '<br>' + lastNotice : ''}`;
  save();
  renderFind();
  if (matchMedia('(max-width: 999px)').matches) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Экран рецепта ----------
let curServ = 0, nutMode = 'serv', wakeLock = null;
function renderRecipe(id) {
  const r = RBYID[id];
  if (!r) { app.innerHTML = `<div class="page"><div class="empty"><p>Рецепт не найден</p><a class="btn" href="#/">К подбору</a></div></div>`; return; }
  curServ = S.serv || r.serv;
  nutMode = 'serv';
  drawRecipe(r);
  document.title = r.t + ' — Что приготовить';
  loadGallery(r);
}
function drawRecipe(r) {
  const k = curServ / r.serv;
  const H = haveSet();
  const c = S.city;
  const fav = S.fav.includes(r.id);
  const facts = [
    `<span class="fact">${r.time} мин</span>`,
    `<span class="fact">${['', 'просто', 'средне', 'сложно'][r.lvl] || ''}</span>`,
    ...r.m.map(m => `<span class="fact">${METHODS[m]}</span>`),
    ...Object.entries(DIETS).filter(([d]) => r.diet[d]).map(([, n]) => `<span class="fact ok">${n}</span>`),
    ...Object.entries(GOALS).filter(([g]) => r.goal[g] && !['quick', 'party'].includes(g)).map(([, n]) => `<span class="fact">${n}</span>`)
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
    const timers = [...s.matchAll(/(?<![\d,.])(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(мин|час)/g)].slice(0, 2)
      .map(m => { const min = Math.round(parseFloat(m[1].replace(',', '.')) * (m[2] === 'мин' ? 1 : 60)); return min > 0 && min <= 600 ? `<button class="btn sm" type="button" data-timer="${min}" data-label="Шаг ${i + 1}">⏱ ${min >= 60 ? (min % 60 ? Math.floor(min / 60) + ' ч ' + (min % 60) + ' мин' : min / 60 + ' ч') : min + ' мин'}</button>` : ''; }).join('');
    return `<li data-step="${i}"><div><p>${esc(s)}</p>${timers ? `<div class="row tm">${timers}</div>` : ''}</div></li>`;
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
  app.innerHTML = `<article class="page recipe">
    <div class="r-hero">
      <div class="r-photo">${photo(r)}${r.cr ? `<a class="credit" href="${esc(r.cr.u)}" target="_blank" rel="noopener">Фото: ${esc(r.cr.a)}, ${esc(r.cr.l)}</a>` : ''}</div>
      <div class="r-head">
        <a href="#/" class="small no-print" data-back>← к подбору</a>
        <h1>${esc(r.t)}</h1>
        <p class="lead">${esc(r.d)}</p>
        <div class="facts">${facts}</div>
        <div class="row no-print">
          <button class="btn${fav ? ' primary' : ''}" type="button" id="favBtn">${fav ? '♥ В избранном' : '♡ В избранное'}</button>
          <button class="btn" type="button" id="shareBtn">Поделиться</button>
          <button class="btn" type="button" id="printBtn">Распечатать</button>
        </div>
        <label class="switch no-print"><input type="checkbox" id="wakeChk"${wakeLock ? ' checked' : ''}> Не гасить экран, пока готовлю</label>
      </div>
    </div>
    <div class="r-cols">
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2>Продукты</h2>
          <div class="stepper" aria-label="Порций"><button type="button" data-rs="-1" aria-label="Меньше порций">−</button><output>${curServ}</output><button type="button" data-rs="1" aria-label="Больше порций">+</button></div></div>
        <p class="small muted">${curServ} ${plural(curServ, 'порция', 'порции', 'порций')}${curServ !== r.serv ? ` (в оригинале ${r.serv}), количество пересчитано` : ''}</p>
        <ul class="ings">${ingRows}</ul>
        ${missing.length ? `<button class="btn primary" type="button" id="toList">Добавить ${missing.length} в список покупок</button>` : H.size ? '<div class="notice ok">Всё нужное у вас есть</div>' : ''}
        <h3>БЖУ</h3>
        <div class="seg" role="group" aria-label="БЖУ на">${[['serv', 'на порцию'], ['all', 'на всё блюдо'], ['100', 'на 100 г']].map(([v, n]) => `<button type="button" data-nm="${v}" class="${nutMode === v ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="nutr"><div><b>${Math.round(nut[0])}</b><span>ккал</span></div><div><b>${fmtN(nut[1])}</b><span>белки, г</span></div><div><b>${fmtN(nut[2])}</b><span>жиры, г</span></div><div><b>${fmtN(nut[3])}</b><span>углеводы, г</span></div></div>
        <p class="small muted">Расчёт по средним значениям продуктов, без необязательных. Точнее — по этикеткам ваших продуктов</p>
      </section>
      <section class="card">
        <h2>Как готовить</h2>
        <p class="small muted no-print">Нажмите на шаг, чтобы отметить его сделанным. Кнопка ⏱ запускает таймер</p>
        <ol class="steps">${steps}</ol>
        ${r.tip ? `<div class="tip"><b>Совет.</b> ${esc(r.tip)}</div>` : ''}
        <h3>Фото и видео</h3>
        <div class="gallery" id="gallery" aria-label="Фото блюда"></div>
        ${linksHTML(media)}
      </section>
    </div>
  </article>`;
  bindRecipe(r);
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
function bindRecipe(r) {
  const root = $('.recipe');
  root.addEventListener('click', async e => {
    const b = e.target.closest('button, [data-back], li[data-step]');
    if (!b) return;
    if (b.dataset.back !== undefined) { e.preventDefault(); history.length > 1 && lastFindHash ? history.back() : (location.hash = '#/'); return; }
    if (b.dataset.rs) { curServ = Math.max(1, Math.min(100, curServ + +b.dataset.rs)); drawRecipe(r); loadGallery(r); return; }
    if (b.dataset.nm) { nutMode = b.dataset.nm; drawRecipe(r); loadGallery(r); return; }
    if (b.dataset.buy) { openBuySheet(b.dataset.buy); return; }
    if (b.dataset.timer) { startTimer(+b.dataset.timer, r.t + ', ' + b.dataset.label); e.stopPropagation(); return; }
    if (b.matches('li[data-step]')) { b.classList.toggle('done'); return; }
    if (b.id === 'favBtn') { S.fav = S.fav.includes(r.id) ? S.fav.filter(x => x !== r.id) : [...S.fav, r.id]; save(); drawRecipe(r); loadGallery(r); return; }
    if (b.id === 'printBtn') { print(); return; }
    if (b.id === 'shareBtn') {
      const url = location.href;
      try { if (navigator.share) await navigator.share({ title: r.t, text: r.d, url }); else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } } catch { /* отмена */ }
      return;
    }
    if (b.id === 'toList') {
      const k = curServ / r.serv, H = haveSet();
      let n = 0;
      for (const it of r.items) {
        if (it.opt || itemStatus(it.id, H).s !== 'miss') continue;
        const ex = S.list.find(x => x.id === it.id && !x.got);
        if (ex) { ex.g += it.g * k; if (!ex.from.includes(r.t)) ex.from.push(r.t); } else S.list.push({ id: it.id, g: it.g * k, from: [r.t], got: false });
        n++;
      }
      save(); updateBadge(); toast(`Добавлено в список: ${n}`); b.textContent = 'В списке покупок ✓'; b.disabled = true;
    }
  });
  $('#wakeChk').addEventListener('change', async e => {
    if (e.target.checked) {
      try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); toast('Экран не погаснет, пока открыт рецепт'); }
      catch { e.target.checked = false; toast('Этот браузер не умеет держать экран включённым'); }
    } else if (wakeLock) { wakeLock.release(); wakeLock = null; }
  });
}
const galleryCache = {};
async function loadGallery(r) {
  const box = $('#gallery'); if (!box) return;
  const fill = list => { box.innerHTML = list.map(x => `<a href="${esc(x.page)}" target="_blank" rel="noopener" title="Фото с Wikimedia Commons"><img src="${esc(x.thumb)}" alt="${esc(r.t)}" loading="lazy"></a>`).join(''); box.hidden = !list.length; };
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

// ---------- Таймеры ----------
const timers = [];
let audioCtx = null, tickId = 0;
function startTimer(min, label) {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch { /* без звука */ }
  timers.push({ id: Date.now() + Math.random(), label, end: Date.now() + min * 60000, ring: false });
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
    return `<div class="timer${t.ring ? ' ring' : ''}" title="${esc(t.label)}"><span>${t.ring ? 'Готово! ' : '⏱ '}${t.ring ? esc(t.label.split(', ').pop()) : mm + ':' + ss}</span><button type="button" data-stop="${t.id}" aria-label="Остановить таймер">×</button></div>`;
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
  const items = S.list;
  const c = S.city;
  app.innerHTML = `<div class="page">
    <div class="results-head"><h1>Список покупок</h1>${c ? `<span class="muted small">Город: ${esc(c.n)}</span>` : ''}</div>
    <form class="ask-row card" id="addItem" style="display:flex">
      <input class="input" id="itemQ" placeholder="Добавить свой пункт: хлеб, салфетки…" autocomplete="off">
      <button class="btn" type="submit">Добавить</button>
    </form>
    ${items.length ? `<section class="card"><ul class="shop-list">${items.map((x, i) => {
      const name = x.id ? ING[x.id].n : x.n;
      const qty = x.id ? fmtGrams(x.g, ING[x.id].fl.includes('l')) : '';
      return `<li class="${x.got ? 'got' : ''}"><input type="checkbox" data-got="${i}"${x.got ? ' checked' : ''} aria-label="Куплено: ${esc(name)}">
        <span class="nm">${esc(name)}${qty ? ' · ' + esc(qty) : ''}${x.from && x.from.length ? `<small>для: ${esc(x.from.join(', '))}</small>` : ''}</span>
        <button class="btn sm" type="button" data-buy="${esc(name)}">Где купить</button></li>`;
    }).join('')}</ul>
    <div class="row"><button class="btn sm" type="button" id="shareList">Отправить список</button><button class="btn sm" type="button" id="clearGot">Убрать купленное</button><button class="btn sm ghost" type="button" id="clearAll">Очистить всё</button></div></section>`
    : `<div class="empty"><p>Список пуст. Откройте рецепт и нажмите «Добавить в список покупок» — туда попадёт только то, чего нет дома</p><a class="btn primary" href="#/">Подобрать рецепт</a></div>`}
  </div>`;
  $('#addItem').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#itemQ').value.trim(); if (!v) return;
    const hit = acSearch(v).find(x => ING[x.t] && norm(x.n) === norm(v)) || null;
    S.list.push(hit ? { id: hit.t, g: 0, from: [], got: false } : { n: v, g: 0, from: [], got: false });
    save(); updateBadge(); renderList();
  });
  app.addEventListener('change', listChange);
  const q = id => $(id);
  q('#shareList') && q('#shareList').addEventListener('click', async () => {
    const text = 'Купить:\n' + S.list.filter(x => !x.got).map(x => '— ' + (x.id ? ING[x.id].n : x.n) + (x.id && x.g ? ' ' + fmtGrams(x.g, ING[x.id].fl.includes('l')) : '')).join('\n');
    try { if (navigator.share) await navigator.share({ title: 'Список покупок', text }); else { await navigator.clipboard.writeText(text); toast('Список скопирован, вставьте его в мессенджер'); } } catch { /* отмена */ }
  });
  q('#clearGot') && q('#clearGot').addEventListener('click', () => { S.list = S.list.filter(x => !x.got); save(); updateBadge(); renderList(); });
  q('#clearAll') && q('#clearAll').addEventListener('click', () => { if (confirm('Очистить весь список?')) { S.list = []; save(); updateBadge(); renderList(); } });
  $$('[data-buy]', app).forEach(b => b.addEventListener('click', () => openBuySheet(b.dataset.buy)));
}
function listChange(e) {
  const i = e.target.dataset.got; if (i === undefined) return;
  S.list[+i].got = e.target.checked; save(); updateBadge();
  e.target.closest('li').classList.toggle('got', e.target.checked);
}

// ---------- Избранное ----------
function renderFav() {
  const H = haveSet();
  const rows = S.fav.map(id => RBYID[id]).filter(Boolean).map(r => {
    const miss = r.items.filter(i => !i.opt).map(i => ({ i, ...itemStatus(i.id, H) })).filter(x => x.s === 'miss');
    return { r, miss };
  });
  app.innerHTML = `<div class="page"><h1>Избранное</h1>
    ${rows.length ? `<div class="grid">${rows.map(x => card(x, H)).join('')}</div>`
      : `<div class="empty"><p>Здесь будут рецепты, которые вы отметили ♡. Они хранятся только на этом устройстве</p><a class="btn primary" href="#/">Подобрать рецепт</a></div>`}
  </div>`;
}

// ---------- Шпаргалки ----------
function table(head, rows) {
  return `<div class="tbl-wrap"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderHelp() {
  const H = window.HELP;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  app.innerHTML = `<div class="page"><h1>Шпаргалки</h1>
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
      <section class="card"><h2>О сайте</h2>
        <p>Рецептов в базе: ${RECIPES.length}. Всё, что вы вводите, хранится только на вашем устройстве. Город определяется по интернет-подключению (с VPN может ошибаться) — его всегда можно сменить вверху</p>
        <p class="small muted">Фото блюд — Wikimedia Commons, авторы подписаны на фото. БЖУ считается по средним таблицам калорийности</p>
        <div class="row"><button class="btn sm" type="button" id="themeBtn">Тема: ${{ light: 'светлая', dark: 'тёмная' }[document.documentElement.dataset.theme] || 'как в системе'}</button></div>
      </section>
    </div></div>`;
  const ib = $('#installBtn2'); if (ib) ib.addEventListener('click', doInstall);
  $('#themeBtn').addEventListener('click', () => {
    const order = ['', 'light', 'dark'];
    const cur = document.documentElement.dataset.theme || '';
    const next = order[(order.indexOf(cur) + 1) % 3];
    if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('cook.theme', next); } catch { /* ничего */ }
    renderHelp();
  });
}
try { const th = localStorage.getItem('cook.theme'); if (th) document.documentElement.dataset.theme = th; } catch { /* ничего */ }

// ---------- Шторка, подсказки ----------
const sheet = $('#sheet');
function openSheet(html) {
  $('#sheetBody').innerHTML = html;
  if (!sheet.open) sheet.showModal();
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });
let toastT = 0;
function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;top:calc(var(--top-h) + 12px);transform:translateX(-50%);z-index:60;background:var(--text);color:var(--bg);padding:10px 16px;border-radius:12px;font-size:14px;max-width:calc(100vw - 32px);box-shadow:var(--shadow)';
    document.body.appendChild(el);
  }
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
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Приложение установлено'); });
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone) { const b = $('#installBtn'); b.hidden = false; b.textContent = 'На экран'; }
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* без офлайна */ });

// ---------- Маршруты ----------
let lastFindHash = '', findScroll = 0, curView = '';
function route() {
  const h = location.hash || '#/';
  const prev = curView;
  if (prev === 'find') findScroll = scrollY;
  $$('.tabs a').forEach(a => a.classList.remove('on'));
  const tab = n => { const a = $(`.tabs [data-tab="${n}"]`); if (a) a.classList.add('on'); };
  document.title = 'Что приготовить';
  if (h.startsWith('#/r/')) { curView = 'recipe'; tab('find'); renderRecipe(decodeURIComponent(h.slice(4))); scrollTo(0, 0); return; }
  if (h === '#/list') { curView = 'list'; tab('list'); renderList(); scrollTo(0, 0); return; }
  if (h === '#/fav') { curView = 'fav'; tab('fav'); renderFav(); scrollTo(0, 0); return; }
  if (h === '#/help') { curView = 'help'; tab('help'); renderHelp(); scrollTo(0, 0); return; }
  curView = 'find'; tab('find'); lastFindHash = h; renderFind();
  if (prev === 'recipe') requestAnimationFrame(() => scrollTo(0, findScroll)); else scrollTo(0, 0);
}
function rerender() {
  if (curView === 'find') updateResults();
  else if (curView === 'recipe') route();
}
window.addEventListener('hashchange', route);
updateBadge();
route();
initCity();

'use strict';
/* Логика без интерфейса: справочники, подбор, разбор фраз, цены, меню на неделю.
   Работает и в браузере, и в node (для автотестов). */

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
const stem = w => w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2));

// ---------- Продукты ----------
const ING = {};
for (const r of window.ING_RAW) {
  ING[r[0]] = { id: r[0], n: r[1], cat: r[2], e: [r[3], r[4], r[5], r[6]], pc: r[7], r: r[8], fl: r[9], sub: r[10], syn: r[11] ? r[11].split(',') : [] };
}
const PRICE = window.PRICE || {};
const isStaple = id => ING[id] && ING[id].fl.includes('s');
const LEFTOVER_IDS = new Set(['rice_cooked', 'buckwheat_cooked', 'pasta_cooked', 'potato_boiled', 'chicken_cooked', 'beef_cooked', 'bread_stale']);

const GROUPS = {
  'g:chicken': { n: 'Курица (любая часть)', keys: ['курица', 'курочка', 'куриное'], ids: ['chicken_breast', 'chicken_thigh', 'chicken_legs', 'chicken_wings', 'chicken_whole', 'chicken_mince'] },
  'g:meat': { n: 'Мясо (любое)', keys: ['мясо', 'мясное'], ids: ['beef', 'pork', 'lamb', 'pork_ribs'] },
  'g:mince': { n: 'Фарш (любой)', keys: ['фарш'], ids: ['beef_mince', 'mixed_mince', 'chicken_mince', 'turkey_mince'] },
  'g:fish': { n: 'Рыба (любая)', keys: ['рыба', 'рыбное'], ids: Object.values(ING).filter(i => i.cat === 'fish').map(i => i.id) },
  'g:seafood': { n: 'Морепродукты', keys: ['морепродукты'], ids: Object.values(ING).filter(i => i.cat === 'seafood').map(i => i.id) },
  'g:cheese': { n: 'Сыр (любой)', keys: ['сыр', 'сырок'], ids: ['cheese', 'mozzarella', 'feta', 'parmesan', 'cream_cheese', 'suluguni'] },
  'g:greens': { n: 'Зелень (любая)', keys: ['зелень'], ids: ['dill', 'parsley', 'cilantro', 'basil', 'green_onion'] },
  'g:mushrooms': { n: 'Грибы (любые)', keys: ['грибы', 'грибочки'], ids: ['mushrooms', 'forest_mushrooms'] },
  'g:offal': { n: 'Субпродукты', keys: ['печень', 'печенка', 'субпродукты'], ids: ['chicken_liver', 'beef_liver', 'chicken_hearts', 'chicken_stomachs', 'beef_tongue'] },
  'g:leftover': { n: 'Остатки со вчера (любые)', keys: ['остатки', 'вчерашнее'], ids: [...LEFTOVER_IDS] }
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

// ---------- Справочники фильтров ----------
const MEALS = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус', dessert: 'Десерт' };
const KINDS = { soup: 'Суп', main: 'Второе', side: 'Гарнир', salad: 'Салат', breakfast: 'Завтрак', bake: 'Выпечка', dessert: 'Десерт', snack: 'Закуска', drink: 'Напиток', sauce: 'Соус' };
const METHODS = { boil: 'Варить', fry: 'Жарить', steam: 'На пару', oven: 'В духовке', stew: 'Тушить', micro: 'Микроволновка', raw: 'Без готовки' };
const DIETS = { veg: 'Вегетарианское', vegan: 'Веганское', kosher: 'Кашерное', halal: 'Халяль', gf: 'Без глютена', lf: 'Без лактозы' };
const GOALS = {
  protein: 'Высокобелковое', lowcarb: 'Мало углеводов', lowcal: 'Мало калорий', lowfat: 'Мало жиров',
  sweet: 'Сладкое', quick: 'Быстро, до 30 мин', budget: 'Недорого', kids: 'Для детей', prep: 'Впрок, на завтра', party: 'Для компании'
};
const CUISINES = {
  ru: 'Русская', ua: 'Украинская и белорусская', cauc: 'Кавказская', asia_c: 'Средняя Азия', tatar: 'Татарская',
  jewish: 'Еврейская', asia: 'Азиатская', ital: 'Итальянская', euro: 'Европейская', med: 'Средиземноморская', amer: 'Американская'
};
const AGES = { 1: 'Малышу от 1 года', 3: 'Ребёнку от 3 лет', 7: 'Школьнику от 7 лет' };
const KIND_ICON = { soup: '🍲', main: '🍽️', side: '🍚', salad: '🥗', breakfast: '🍳', bake: '🥧', dessert: '🍰', snack: '🥪', drink: '🥤', sauce: '🥫' };
const MEAT = new Set(['poultry', 'beef', 'pork', 'lamb', 'offal']);
const CHAMETZ = new Set(['flour', 'bread', 'rye_bread', 'bread_stale', 'lavash', 'breadcrumbs', 'puff_pastry', 'yeast', 'yeast_dough', 'pasta', 'pasta_cooked', 'egg_noodles', 'couscous', 'bulgur', 'oats', 'semolina', 'pearl_barley', 'tortilla', 'broth_cube', 'soy_sauce']);

const hasOcc = (r, o) => (r.occ || []).includes(o);
const COLLS = {
  newyear: { n: 'Новый год', test: r => hasOcc(r, 'newyear') },
  maslenitsa: { n: 'Масленица', test: r => hasOcc(r, 'maslenitsa') },
  easter: { n: 'Пасха', test: r => hasOcc(r, 'easter') },
  post: { n: 'Пост', note: 'Без мяса, молока и яиц', test: r => hasOcc(r, 'post') || r.diet.vegan },
  ramadan: { n: 'Рамадан', note: 'Халяльные блюда для ифтара и сухура', test: r => hasOcc(r, 'ramadan') },
  pesach: { n: 'Песах', note: 'Без квасного: без муки, хлеба, дрожжей и макарон. Проверяйте маркировку продуктов', test: r => hasOcc(r, 'pesach') || (r.diet.kosher && !r.items.some(i => !i.opt && CHAMETZ.has(i.id))) },
  bday: { n: 'Детский праздник', test: r => hasOcc(r, 'bday') },
  picnic: { n: 'На природу, с собой', test: r => hasOcc(r, 'picnic') },
  leftover: { n: 'Из вчерашних остатков', test: r => r.tags.includes('leftover') || r.items.some(i => LEFTOVER_IDS.has(i.id)) }
};

// Какая кухня ближе жителям города
const LOCAL_CUISINE = {
  cauc: ['Махачкала', 'Грозный', 'Нальчик', 'Владикавказ', 'Тбилиси', 'Ереван', 'Баку', 'Пятигорск', 'Майкоп', 'Сочи'],
  tatar: ['Казань', 'Уфа', 'Набережные Челны', 'Стерлитамак'],
  asia_c: ['Ташкент', 'Бишкек', 'Алматы', 'Астана', 'Шымкент', 'Караганда', 'Душанбе'],
  jewish: ['Тель-Авив'],
  ua: ['Минск', 'Гомель', 'Киев', 'Кишинёв'],
  asia: ['Владивосток', 'Хабаровск', 'Южно-Сахалинск', 'Благовещенск'],
  med: ['Стамбул', 'Дубай']
};
function localCuisine(city) {
  if (!city) return '';
  for (const [k, list] of Object.entries(LOCAL_CUISINE)) if (list.includes(city.n)) return k;
  return '';
}

// ---------- Рецепты ----------
function prepRecipe(r) {
  r.tags = r.tags || [];
  r.items = r.ing.filter(x => ING[x[0]]).map(([id, g, u, q, o]) => ({ id, g, u, q, opt: !!o }));
  const req = r.items.filter(i => !i.opt);
  const tot = [0, 0, 0, 0];
  let w = 0, cost = 0;
  for (const i of req) {
    const e = ING[i.id].e;
    for (let k = 0; k < 4; k++) tot[k] += e[k] * i.g / 100;
    w += i.g;
    cost += (PRICE[i.id] || 0) * i.g / 1000;
  }
  r.tot = tot; r.w = w;
  r.ps = tot.map(v => v / r.serv);
  r.cost = cost / r.serv;
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
    budget: r.tags.includes('budget') || r.cost <= 110,
    kids: (r.tags.includes('kids') || !!r.age) && !r.tags.includes('spicy'),
    prep: r.tags.includes('prep'),
    party: r.tags.includes('party') || r.serv >= 8
  };
  r.hay = norm(r.t + ' ' + r.d + ' ' + (KINDS[r.kind] || '') + ' ' + (CUISINES[r.cuisine] || ''));
  return r;
}
let RECIPES = [], RBYID = {};
function buildRecipes(own) {
  const base = (window.RECIPES || []).map(r => prepRecipe({ ...r }));
  const mine = (own || []).map(r => prepRecipe({ ...r, own: true }));
  RECIPES = [...mine, ...base];
  RBYID = Object.fromEntries(RECIPES.map(r => [r.id, r]));
  return RECIPES;
}

// ---------- Цены ----------
function regionCoef(city) {
  if (!city) return 1;
  if (city.n === 'Москва') return 1.2;
  if (city.n === 'Санкт-Петербург') return 1.12;
  return { fareast: 1.3, north: 1.15, siberia: 1.05, south: 0.95 }[city.zone] || 1;
}
const showPrice = city => !city || city.cc === 'RU';
const fmtRub = v => v < 1 ? '0 ₽' : v < 50 ? Math.round(v) + ' ₽' : Math.round(v / 5) * 5 + ' ₽';
const ingCost = (id, g, city) => (PRICE[id] || 0) * g / 1000 * regionCoef(city);

// ---------- Отделы магазина ----------
const DEPTS = [
  ['veg', 'Овощи, фрукты, зелень', ['veg', 'greens', 'fruit', 'mushroom']],
  ['meat', 'Мясо и птица', ['poultry', 'beef', 'pork', 'lamb', 'offal']],
  ['fish', 'Рыба и морепродукты', ['fish', 'seafood']],
  ['dairy', 'Молочное и яйца', ['dairy', 'egg']],
  ['grain', 'Крупы, макароны, бобовые', ['grain', 'legume']],
  ['bread', 'Хлеб, мука, тесто', ['flour']],
  ['oil', 'Масло, соусы, специи', ['oil', 'sauce', 'spice']],
  ['sweet', 'Сладкое, орехи, сухофрукты', ['sweet', 'nut']],
  ['other', 'Прочее', ['other']]
];
function deptOf(id) {
  const cat = ING[id] ? ING[id].cat : 'other';
  return (DEPTS.find(d => d[2].includes(cat)) || DEPTS[DEPTS.length - 1])[0];
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
const WORD_RULES = [
  [/завтрак/, 'meal', 'breakfast'], [/обед/, 'meal', 'lunch'], [/ужин/, 'meal', 'dinner'], [/перекус|закуск/, 'meal', 'snack'], [/десерт|сладк|к чаю/, 'goals', 'sweet'],
  [/суп|бульон/, 'kind', 'soup'], [/салат/, 'kind', 'salad'], [/гарнир/, 'kind', 'side'], [/выпеч|пирог|печень[ея]|кекс/, 'kind', 'bake'],
  [/вар(ить|еное|еный|ка|ят)|отвар/, 'methods', 'boil'], [/жар(ить|еное|еный|ка)|сковород/, 'methods', 'fry'], [/на пару|пароварк/, 'methods', 'steam'],
  [/духовк|запеч|запек|запека/, 'methods', 'oven'], [/туш(ить|еное|еный|ка)/, 'methods', 'stew'], [/без готовки|без варки|сыро/, 'methods', 'raw'], [/микроволн|свч/, 'methods', 'micro'],
  [/вегетариан|без мяса/, 'diets', 'veg'], [/веган/, 'diets', 'vegan'], [/кошер|кашер|кашрут/, 'diets', 'kosher'], [/халал|халял/, 'diets', 'halal'],
  [/без глютен/, 'diets', 'gf'], [/без лактоз|без молок/, 'diets', 'lf'],
  [/белк|протеин|бжу|спорт|масс/, 'goals', 'protein'], [/низкоуглевод|без углевод|кето|мало углевод/, 'goals', 'lowcarb'],
  [/низкокалор|диет|похуд|легк|мало калор|\sпп\s/, 'goals', 'lowcal'], [/быстр|на скорую/, 'goals', 'quick'], [/дешев|бюджет|недорог|эконом/, 'goals', 'budget'],
  [/впрок|на завтра|заготов/, 'goals', 'prep'], [/компани|гост|застол/, 'goals', 'party'],
  [/грузин|кавказ|армян|азербайдж|дагестан/, 'cuisine', 'cauc'], [/узбек|казах|киргиз|таджик|средн\S* ази/, 'cuisine', 'asia_c'], [/татар|башкир/, 'cuisine', 'tatar'],
  [/еврейск/, 'cuisine', 'jewish'], [/китай|япон|корей|азиат|тайск/, 'cuisine', 'asia'], [/итальян/, 'cuisine', 'ital'], [/француз|европ|немец/, 'cuisine', 'euro'],
  [/средиземномор|турецк|восточн/, 'cuisine', 'med'], [/американ|мексикан/, 'cuisine', 'amer'], [/русск/, 'cuisine', 'ru'], [/украин|белорус/, 'cuisine', 'ua'],
  [/нов\S* год|новогод/, 'occ', 'newyear'], [/пасх/, 'occ', 'easter'], [/маслениц/, 'occ', 'maslenitsa'], [/(^|\s)пост|постн/, 'occ', 'post'],
  [/рамадан|ифтар|сухур|ураз/, 'occ', 'ramadan'], [/песах|пейсах/, 'occ', 'pesach'], [/день рожд|детск\S* праздн/, 'occ', 'bday'],
  [/пикник|на природ|с собой/, 'occ', 'picnic'], [/остатк|вчерашн/, 'occ', 'leftover'],
  [/годовал|(^|\s)(1|од(ин|ному)) год/, 'age', 1], [/(^|\s)(2|3|4|5|6|два|три|двух|трех|четыр|пят)\S*\s*(год|лет)/, 'age', 3], [/школьн|(^|\s)(7|8|9|10)\s*лет/, 'age', 7],
  [/дет(ям|ей|ск)|ребен|малыш/, 'goals', 'kids']
];
const STOP = new Set('что как из на для с со и в во у меня есть хочу можно нужно рецепт рецепты блюдо блюда приготовить сделать сготовить еда еду поесть вкусно человек людей порций порции персон без или а но мне нам дома осталось остались имеется только чтобы чем какой какое какие из-за под от до по к кухня кухни праздник праздника'.split(' '));

function parsePhrase(text) {
  const out = { meal: [], kind: [], methods: [], diets: [], goals: [], cuisine: [], occ: [], age: 0, want: [], have: [], ex: [], serv: 0, time: 0, rest: [] };
  let t = ' ' + norm(text).replace(/[.,;!?()«»"]/g, ' ').replace(/-(то|нибудь|либо)(?=\s|$)/g, ' ') + ' ';
  const sv = t.match(/на\s+(\d{1,2})\s*(чел|перс|порц|гост|люд)/) || t.match(/(\d{1,2})\s*(чел|перс|порц|гост)/) || t.match(/на\s+(\d{1,2})(?=\s|$)(?!\s*(мин|час|год|лет|ден|дн))/);
  if (sv) out.serv = +sv[1];
  if (/компани|гостей|застол/.test(t) && !out.serv) out.serv = 10;
  const tm = t.match(/за\s+(\d{1,3})\s*мин/); if (tm) out.time = +tm[1];
  t = t.replace(/на\s+\d{1,2}\s*(чел\S*|перс\S*|порц\S*|гост\S*|люд\S*)?/g, ' ').replace(/за\s+\d{1,3}\s*мин\S*/g, ' ');
  for (const [re, f, v] of WORD_RULES) {
    if (!re.test(t)) continue;
    if (f === 'age') { if (!out.age || v < out.age) out.age = v; }
    else if (!out[f].includes(v)) out[f].push(v);
    t = t.replace(new RegExp('\\S*(' + re.source + ')\\S*', 'g'), ' ');
  }
  if (out.age && !out.goals.includes('kids')) out.goals.push('kids');
  t = t.replace(/\sбез(?=\s+(без|и|$|\s))/g, ' ');
  const haveMode = /\s(есть|имеется|дома|осталось|остались|остался)\s/.test(t);
  const words = t.split(/\s+/).filter(Boolean);
  const used = new Set();
  const keys = [];
  for (const x of ACINDEX) for (const k of x.keys) keys.push({ t: x.t, k, ws: k.split(' ').map(stem), grp: !!x.grp });
  keys.sort((a, b) => b.ws.length - a.ws.length || b.grp - a.grp || b.k.length - a.k.length);
  for (let i = 0; i < words.length; i++) {
    if (used.has(i) || words[i].length < 3) continue;
    for (const key of keys) {
      if (key.ws[0].length < 3) continue;
      if (!key.ws.every((s, j) => words[i + j] && words[i + j].startsWith(s) && !used.has(i + j))) continue;
      key.ws.forEach((_, j) => used.add(i + j));
      const neg = words[i - 1] === 'без' || (words[i - 2] === 'без' && words[i - 1] === 'и');
      const list = neg ? out.ex : haveMode ? out.have : out.want;
      if (!list.includes(key.t)) list.push(key.t);
      break;
    }
  }
  words.forEach((w, i) => { if (!used.has(i) && w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w)) out.rest.push(w); });
  return out;
}

// ---------- Подбор ----------
function haveSet(st) {
  const h = new Set();
  for (const t of st.have) for (const id of tokenIds(t)) h.add(id);
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
function methodOk(st, r) {
  if (!st.methods.length) return true;
  if (st.methods.length === 1 && st.methods[0] === 'raw') return r.m.every(m => m === 'raw');
  const allow = new Set([...st.methods, 'raw']);
  return r.m.every(m => allow.has(m));
}
// продукты, у которых срок годности истекает в ближайшие 2 дня
function expiring(st, now = new Date()) {
  const out = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const [t, d] of Object.entries(st.dates || {})) {
    if (!st.have.includes(t) || !d) continue;
    const days = Math.round((new Date(d + 'T00:00:00') - today) / 864e5);
    if (days <= 2) out.push({ t, days });
  }
  return out.sort((a, b) => a.days - b.days);
}
function passes(st, r, extra = {}) {
  if (st.meal.length && !st.meal.some(m => r.meal.includes(m))) return false;
  if (st.kind.length && !st.kind.includes(r.kind)) return false;
  if (!methodOk(st, r)) return false;
  if (st.diets.some(d => !r.diet[d])) return false;
  if (st.goals.some(g => !r.goal[g])) return false;
  if (st.cuisine && st.cuisine.length && !st.cuisine.includes(r.cuisine)) return false;
  if (st.occ && COLLS[st.occ] && !COLLS[st.occ].test(r)) return false;
  if (st.age && !(r.age && r.age <= st.age)) return false;
  if (st.time && r.time > st.time) return false;
  if (st.lvl && r.lvl > st.lvl) return false;
  if (st.ex.some(t => r.items.some(i => !i.opt && itemHitsToken(i.id, t)))) return false;
  if (!extra.ignoreWant && st.want.some(t => !r.items.some(i => itemHitsToken(i.id, t)))) return false;
  if (extra.titleWords && extra.titleWords.length && !extra.titleWords.every(w => r.hay.includes(stem(w)))) return false;
  return true;
}
function compute(st, extra = {}) {
  const H = haveSet(st);
  const exp = expiring(st);
  const expIds = new Set(exp.flatMap(x => tokenIds(x.t)));
  const local = localCuisine(st.city);
  const rows = [];
  for (const r of RECIPES) {
    if (!passes(st, r, extra)) continue;
    const req = r.items.filter(i => !i.opt);
    const stt = req.map(i => ({ i, ...itemStatus(i.id, H) }));
    const miss = stt.filter(x => x.s === 'miss');
    const used = stt.filter(x => x.s === 'have' || x.s === 'sub').length;
    const saves = req.filter(i => expIds.has(i.id)).map(i => i.id);
    rows.push({ r, miss, used, saves });
  }
  const fav = new Set(st.fav);
  const stars = id => (st.notes && st.notes[id] && st.notes[id].s) || 0;
  const mOn = r => st.methods.some(m => m !== 'raw' && r.m.includes(m)) ? 0 : 1;
  const byMatch = (a, b) => (b.saves.length - a.saves.length) ||
    (st.methods.length ? mOn(a.r) - mOn(b.r) : 0) ||
    (H.size ? a.miss.length - b.miss.length || b.used - a.used : 0) ||
    ((b.r.cuisine === local) - (a.r.cuisine === local)) ||
    (fav.has(b.r.id) - fav.has(a.r.id)) || (stars(b.r.id) - stars(a.r.id)) || a.r.time - b.r.time;
  const sorters = {
    match: byMatch,
    time: (a, b) => a.r.time - b.r.time,
    kcal: (a, b) => a.r.ps[0] - b.r.ps[0],
    protein: (a, b) => b.r.ps[1] - a.r.ps[1],
    cheap: (a, b) => a.r.cost - b.r.cost,
    rated: (a, b) => stars(b.r.id) - stars(a.r.id) || byMatch(a, b)
  };
  rows.sort(sorters[st.sort] || byMatch);
  return { rows, H, exp };
}

// ---------- Праздники и поводы по календарю ----------
function easterDate(y) {
  // православная Пасха: формула Меёса по юлианскому календарю + 13 дней
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const m = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return new Date(y, m - 1, day + 13);
}
const RAMADAN = { 2026: ['2026-02-18', '2026-03-19'], 2027: ['2027-02-08', '2027-03-09'], 2028: ['2028-01-28', '2028-02-26'], 2029: ['2029-01-16', '2029-02-14'] };
const PESACH = { 2026: ['2026-04-01', '2026-04-09'], 2027: ['2027-04-21', '2027-04-29'], 2028: ['2028-04-10', '2028-04-18'], 2029: ['2029-03-30', '2029-04-07'] };
function currentOccasions(now = new Date()) {
  const y = now.getFullYear();
  const day = 864e5;
  const t = new Date(y, now.getMonth(), now.getDate()).getTime();
  const out = [];
  const md = (now.getMonth() + 1) * 100 + now.getDate();
  if (md >= 1215 || md <= 107) out.push('newyear');
  const ea = easterDate(y).getTime();
  if (t >= ea - 55 * day && t <= ea - 49 * day) out.push('maslenitsa');
  if (t >= ea - 48 * day && t < ea) out.push('post');
  if (md >= 1128 || md <= 106) out.push('post');
  if (t >= ea - 7 * day && t <= ea + 7 * day) out.push('easter');
  const inRange = r => r && t >= new Date(r[0] + 'T00:00:00').getTime() - 3 * day && t <= new Date(r[1] + 'T00:00:00').getTime();
  if (inRange(RAMADAN[y])) out.push('ramadan');
  if (inRange(PESACH[y])) out.push('pesach');
  return [...new Set(out)];
}
function seasonNow(city, now = new Date()) {
  const m = now.getMonth() + 1;
  const ids = new Set(window.SEASON[m]);
  if (city && city.zone === 'south') for (const id of window.SEASON[m % 12 + 1]) ids.add(id);
  if (city && ['north', 'siberia', 'fareast'].includes(city.zone)) for (const id of window.SEASON[(m + 10) % 12 + 1]) if (!['tomato', 'eggplant', 'bell_pepper'].includes(id)) ids.add(id);
  return [...ids].filter(id => ING[id]);
}

// ---------- Меню на неделю ----------
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const SLOT_OK = {
  breakfast: r => r.meal.includes('breakfast') && !['side', 'sauce', 'drink'].includes(r.kind),
  lunch: r => r.meal.includes('lunch') && ['soup', 'main', 'salad'].includes(r.kind),
  dinner: r => r.meal.includes('dinner') && ['main', 'salad', 'soup'].includes(r.kind)
};
function planPool(st, slot, opt) {
  const base = { ...st, meal: [], kind: [], methods: [], goals: opt.goal ? [opt.goal] : [], occ: '', age: 0, time: 0, lvl: 0, want: [], cuisine: [] };
  return RECIPES.filter(r => !r.own && SLOT_OK[slot](r) && passes(base, r, { ignoreWant: true }));
}
function pickFor(st, slot, opt, used, chosenIngs, rand) {
  const H = haveSet(st);
  let pool = planPool(st, slot, opt);
  if (!pool.length) return null;
  const fresh = pool.filter(r => !used.has(r.id));
  if (fresh.length) pool = fresh;
  const weights = pool.map(r => {
    const ids = r.items.filter(i => !i.opt && !isStaple(i.id)).map(i => i.id);
    const shared = ids.filter(id => chosenIngs.has(id)).length;
    const have = ids.filter(id => H.has(id)).length;
    const cheap = opt.budget ? Math.max(0, 1.5 - r.cost / 100) : 0;
    return 1 + shared * 1.5 + have * 2 + cheap * 2;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = rand() * sum;
  for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
function makePlan(st, opt) {
  const rand = rng(opt.seed || Date.now());
  const used = new Set(), chosenIngs = new Set();
  const days = [];
  for (let d = 0; d < opt.days; d++) {
    const day = {};
    for (const slot of opt.meals) {
      const r = pickFor(st, slot, opt, used, chosenIngs, rand);
      if (!r) continue;
      day[slot] = r.id; used.add(r.id);
      r.items.forEach(i => chosenIngs.add(i.id));
    }
    days.push(day);
  }
  return { ...opt, days };
}
function replaceInPlan(st, plan, d, slot) {
  const used = new Set(plan.days.flatMap(x => Object.values(x)));
  const chosen = new Set();
  plan.days.forEach(x => Object.values(x).forEach(id => RBYID[id] && RBYID[id].items.forEach(i => chosen.add(i.id))));
  const r = pickFor(st, slot, plan, used, chosen, rng(Date.now()));
  if (r) plan.days[d][slot] = r.id;
  return plan;
}
function planTotals(plan, city) {
  const need = {};
  let cost = 0;
  const per = [0, 0, 0, 0];
  for (const day of plan.days) for (const id of Object.values(day)) {
    const r = RBYID[id]; if (!r) continue;
    const k = plan.people / r.serv;
    for (const it of r.items) if (!it.opt) need[it.id] = (need[it.id] || 0) + it.g * k;
    for (let i = 0; i < 4; i++) per[i] += r.ps[i];
    cost += r.cost * plan.people * regionCoef(city);
  }
  const n = plan.days.length || 1;
  return { need, cost, perDay: per.map(v => v / n) };
}

// ---------- Форматирование ----------
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
  if (ing.pc && (!it.u || it.u === 'г') && ing.cat !== 'spice') {
    const n = it.g * k / ing.pc;
    if (n >= 0.5 && n <= 20) return fmtQty(n) + ' шт';
  }
  return fmtGrams(it.g * k, ing.fl.includes('l'));
}
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }

if (typeof module !== 'undefined') {
  module.exports = { ING, GROUPS, COLLS, CUISINES, buildRecipes, get RECIPES() { return RECIPES; }, get RBYID() { return RBYID; }, parsePhrase, compute, passes, makePlan, planTotals, replaceInPlan, easterDate, currentOccasions, expiring, qtyText, fmtGrams, fmtQty, deptOf, regionCoef, localCuisine, acSearch, plural };
}

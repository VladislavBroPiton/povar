// Автотесты: данные рецептов и логика подбора. Запуск: node tests/test.js
'use strict';
const path = require('path');
global.window = {};
for (const f of ['data/ingredients.js', 'data/cities.js', 'data/recipes.js', 'data/help.js']) require(path.join(__dirname, '..', f));
const core = require(path.join(__dirname, '..', 'core.js'));

let fails = 0, passed = 0;
function ok(cond, msg) { if (cond) passed++; else { fails++; console.error('ОШИБКА:', msg); } }

const R = core.buildRecipes([]);
const DEF = { city: null, have: [], want: [], ex: [], meal: [], kind: [], goals: [], methods: [], diets: [], cuisine: [], occ: '', age: 0, serv: 0, time: 0, lvl: 0, sort: 'match', fav: [], list: [], dates: {}, notes: {} };
const st = patch => ({ ...DEF, ...patch });

// --- данные ---
ok(R.length >= 200, `рецептов ${R.length}, ждём не меньше 200`);
const ids = new Set();
for (const r of R) {
  ok(!ids.has(r.id), `повтор id ${r.id}`); ids.add(r.id);
  ok(r.items.length === r.ing.length, `${r.id}: неизвестный продукт в составе`);
  ok(r.steps.length >= 3, `${r.id}: мало шагов`);
  ok(r.serv > 0 && r.time > 0, `${r.id}: порции или время`);
  ok(!/\.$/.test(r.d), `${r.id}: точка в конце описания`);
  ok(r.ps[0] > 0 && r.ps[0] < 2500, `${r.id}: странная калорийность ${Math.round(r.ps[0])}`);
  ok(r.cuisine && core.CUISINES[r.cuisine] || r.cuisine === 'intl', `${r.id}: нет кухни`);
  ok(r.m.every(m => ['boil', 'fry', 'steam', 'oven', 'stew', 'raw', 'micro'].includes(m)), `${r.id}: неизвестный способ`);
  if (r.occ && r.occ.includes('post')) ok(r.diet.vegan, `${r.id}: помечен постным, но есть мясо/молоко/яйца`);
  if (r.occ && r.occ.includes('ramadan')) ok(r.diet.halal, `${r.id}: на Рамадан, но не халяль`);
  if (r.age === 1) ok(!r.m.includes('fry'), `${r.id}: жареное для малыша`);
}

// --- диеты ---
const bySt = s => core.compute(s).rows.map(x => x.r);
ok(bySt(st({ diets: ['kosher'] })).every(r => !r.items.some(i => !i.opt && core.ING[i.id].cat === 'pork')), 'в кашерном нашлась свинина');
ok(bySt(st({ diets: ['vegan'] })).every(r => !r.items.some(i => !i.opt && ['dairy', 'egg'].includes(core.ING[i.id].cat))), 'в веганском молочное или яйца');
ok(bySt(st({ diets: ['gf'] })).every(r => !r.items.some(i => !i.opt && core.ING[i.id].fl.includes('g'))), 'в «без глютена» есть глютен');
ok(bySt(st({ methods: ['boil'] })).every(r => r.m.every(m => m === 'boil' || m === 'raw')), '«только варить» пропустил жарку');
ok(bySt(st({ methods: ['steam'] })).length >= 5, 'мало блюд на пару');
ok(bySt(st({ age: 1 })).length >= 8, 'мало блюд для малышей');
core.seasonNow(null, new Date(2026, 8, 15)).forEach(id => core.SEASON_NOW.add(id));
for (const c of Object.keys(core.COLLS)) ok(bySt(st({ occ: c })).length >= 2, `подборка ${c} почти пустая`);

// --- разбор фраз ---
const P = core.parsePhrase;
let p = P('ужин из курицы в духовке на 4');
ok(p.meal.includes('dinner') && p.methods.includes('oven') && p.serv === 4 && p.want.includes('g:chicken'), 'фраза 1: ' + JSON.stringify(p));
p = P('есть яйца, молоко и мука');
ok(p.have.length === 3 && !p.want.length, 'фраза 2: ' + JSON.stringify(p));
p = P('суп без мяса');
ok(p.kind.includes('soup') && p.diets.includes('veg') && !p.rest.length, 'фраза 3: ' + JSON.stringify(p));
p = P('кашерный ужин на 10 гостей');
ok(p.diets.includes('kosher') && p.serv === 10, 'фраза 4: ' + JSON.stringify(p));
p = P('грузинская кухня');
ok(p.cuisine.includes('cauc') && !p.rest.length, 'фраза 5: ' + JSON.stringify(p));
p = P('на пару для ребёнка 1 год');
ok(p.methods.includes('steam') && p.age === 1, 'фраза 6: ' + JSON.stringify(p));
p = P('что сделать из вчерашнего риса');
ok(p.occ.includes('leftover') || p.want.includes('rice_cooked') || p.want.includes('rice'), 'фраза 7: ' + JSON.stringify(p));
p = P('десерт за 15 минут');
ok(p.time === 15 && p.goals.includes('sweet'), 'фраза 8: ' + JSON.stringify(p));

// --- опечатки и разговорные слова ---
ok(P('курцца с рисом').want.includes('g:chicken'), 'опечатка «курцца» → курица');
ok(P('суп без капусиы').ex.includes('cabbage'), 'опечатка в «без капусты»');
ok(P('макорошки с фаршем').want.includes('pasta'), '«макорошки» → макароны');
ok(P('картофан и морковка').want.includes('potato'), '«картофан» → картошка');
ok(!P('ужин для семьи').want.length && !P('говядина тушеная').want.includes('mushrooms'), 'обычные слова не превращаются в продукты');

// --- подбор по продуктам ---
const res = core.compute(st({ have: ['egg', 'milk', 'flour'] }));
ok(res.rows[0].miss.length === 0, 'с яйцами, молоком и мукой первым должно идти блюдо без докупки');
const exp = core.compute(st({ have: ['cottage', 'egg'], dates: { cottage: new Date().toISOString().slice(0, 10) } }));
ok(exp.exp.length === 1 && exp.rows[0].saves.includes('cottage'), 'творог с истекающим сроком должен поднимать блюда с ним');

// --- праздники ---
const e = core.easterDate(2027);
ok(e.getMonth() === 4 && e.getDate() === 2, 'Пасха 2027 — 2 мая, получилось ' + e.toDateString());
ok(core.easterDate(2026).getMonth() === 3 && core.easterDate(2026).getDate() === 12, 'Пасха 2026 — 12 апреля');
ok(core.currentOccasions(new Date(2026, 11, 31)).includes('newyear'), '31 декабря — Новый год');

// --- меню на неделю ---
const plan = core.makePlan(st({ diets: ['veg'] }), { days: 7, people: 2, meals: ['breakfast', 'lunch', 'dinner'], goal: '', budget: false, seed: 42 });
ok(plan.days.length === 7 && plan.days.every(d => d.breakfast && d.lunch && d.dinner), 'меню не заполнено');
ok(plan.days.flatMap(d => Object.values(d)).every(id => core.RBYID[id].diet.veg), 'в вегетарианском меню мясо');
const all = plan.days.flatMap(d => Object.values(d));
ok(new Set(all).size >= all.length - 3, 'в меню много повторов');
const tot = core.planTotals(plan, null);
ok(tot.perDay[0] > 600 && tot.perDay[0] < 4000, 'странная калорийность дня: ' + Math.round(tot.perDay[0]));

// --- количества ---
ok(core.qtyText({ id: 'egg', g: 110 }, 1) === '2 шт', 'яйца в штуках');
ok(core.fmtGrams(2500, true) === '2,5 л', 'литры');

console.log(`Проверок: ${passed + fails}, ошибок: ${fails}`);
process.exit(fails ? 1 : 0);

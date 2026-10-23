'use strict';
/* Английская версия: интерфейс переводится на лету по словарю (data/i18n-en.js),
   названия и шаги рецептов — с сервера (переводятся ИИ один раз и хранятся). */

const LANG = (() => {
  try { const s = localStorage.getItem('cook.lang'); if (s) return s; } catch { /* ничего */ }
  const ls = (navigator.languages || [navigator.language || 'ru']).map(x => String(x).toLowerCase());
  return ls.some(l => /^(ru|uk|be|kk|ky|uz|tg|hy|az|ka|ro|lv|lt|et)/.test(l)) ? 'ru' : 'en';
})();
window.LANG = LANG;

(function () {
  const btn = document.getElementById('langBtn');
  if (btn) {
    btn.textContent = LANG === 'en' ? 'RU' : 'EN';
    btn.setAttribute('aria-label', LANG === 'en' ? 'Русская версия' : 'English version');
    btn.addEventListener('click', () => { try { localStorage.setItem('cook.lang', LANG === 'en' ? 'ru' : 'en'); } catch { /* ничего */ } location.reload(); });
  }
  if (LANG !== 'en') return;
  document.documentElement.lang = 'en';
  const DICT = Object.assign({}, window.I18N_EN || {});
  const ENG = window.ING_EN || {};
  for (const r of window.ING_RAW) {
    const en = ENG[r[0]]; if (!en) continue;
    // в тексте названия встречаются и с заглавной, и строчными, и без пометки в скобках
    const short = r[1].replace(/\s*\(.*\)\s*/, '').trim(), enShort = en.replace(/\s*\(.*\)\s*/, '').trim();
    for (const [ru, e] of [[r[1], en], [short, enShort]]) { DICT[ru] = e; DICT[ru.toLowerCase()] = e.toLowerCase(); }
  }
  // короткие надписи встречаются и со строчной буквы («Аллергены: орехи»)
  for (const [k, v] of Object.entries(DICT)) if (k.length < 30 && /^[А-ЯЁ]/.test(k) && !DICT[k.toLowerCase()]) DICT[k.toLowerCase()] = v.charAt(0).toLowerCase() + v.slice(1);
  for (const c of window.CITIES_RAW) { const en = c[4].split(',')[0]; DICT[c[0]] = en.replace(/(^|[\s-])\S/g, s => s.toUpperCase()); }
  const UNITS = { 'шт': 'pcs', 'ст. л.': 'tbsp', 'ч. л.': 'tsp', 'зуб.': 'cloves', 'щеп.': 'pinch', 'стак.': 'cups', 'пучок': 'bunch', 'г': 'g', 'мл': 'ml', 'кг': 'kg', 'л': 'l' };
  const PATTERNS = [
    [/^Нашёл (\d+) рецепт\S*$/, (m, n) => `Found ${n} ${n === '1' ? 'recipe' : 'recipes'}`],
    [/^([\d¼½¾⅓⅔,]+) (шт|ст\. л\.|ч\. л\.|зуб\.|щеп\.|стак\.|пучок|г|мл|кг|л)$/, (m, n, u) => `${n.replace(',', '.')} ${UNITS[u]}`],
    [/^по вкусу$/, () => 'to taste'],
    [/^(\d+) мин$/, (m, n) => `${n} min`],
    [/^(\d+) ккал$/, (m, n) => `${n} kcal`],
    [/^Б (\d+) · Ж (\d+) · У (\d+)$/, (m, p, f, c) => `P ${p} · F ${f} · C ${c}`],
    [/^≈ (.+) \/ порция$/, (m, x) => `≈ ${x} / serving`],
    [/^≈ (.+) за порцию$/, (m, x) => `≈ ${x} per serving`],
    [/^Не хватает (\d+)$/, (m, n) => `${n} missing`],
    [/^Шаг (\d+) из (\d+)$/, (m, a, b) => `Step ${a} of ${b}`],
    [/^Шаг (\d+)$/, (m, a) => `Step ${a}`],
    [/^(\d+) порци\S*$/, (m, n) => `${n} ${n === '1' ? 'serving' : 'servings'}`],
    [/^Добавить (\d+) в список покупок$/, (m, n) => `Add ${n} to shopping list`],
    [/^Показать ещё (\d+) из (\d+)$/, (m, a, b) => `Show ${a} more of ${b}`],
    [/^Таймер на (\d+) мин запущен$/, (m, n) => `${n}-minute timer started`],
    [/^Добавлено в список: (\d+)$/, (m, n) => `Added to list: ${n}`],
    [/^Готово! (.*)$/, (m, x) => `Done! ${tr(x)}`],
    [/^Расчёт по средним значениям продуктов, без необязательных\. Цены примерные, средние по (региону|России)$/, (m, x) => `Based on average product values, optional items excluded. Prices are approximate, average for ${x === 'региону' ? 'your region' : 'Russia'}`],
    [/^Из того, что есть, можно приготовить (\d+) \S+ без похода в магазин$/, (m, n) => `You can cook ${n} ${n === '1' ? 'dish' : 'dishes'} from what you have, no shopping needed`],
    [/^Купите только (.+) — и откроются ещё (\d+) \S+$/, (m, x, n) => `Buy just ${tr(x)} and ${n} more dishes open up`],
    [/^Похоже, вы в городе (.+?)\. Верно\?(.*)$/, (m, c, rest) => `Looks like you're in ${tr(c)}. Right?${rest ? ' I’ll show shops, prices and local dishes' : ''}`],
    [/^Понял так: (.+?)\. Поправить можно в фильтрах$/, (m, x) => `Understood as: ${tr(x)}. You can adjust it in the filters`],
    [/^Сверху блюда, которые любят в вашем регионе: (.+)$/, (m, x) => `Local favourites first: ${tr(x)}`],
    [/^(\d+) \S+ \(в оригинале (\d+)\), количество пересчитано(.*)$/, (m, a, b, rest) => `${a} servings (originally ${b}), amounts recalculated${rest ? tr(rest).replace('всё блюдо', 'whole dish') : ''}`],
    [/^Докупить: (.+)$/, (m, x) => `To buy: ${tr(x)}`],
    [/^Ваш запрос: «(.+)»\. Откроется на сайтах с фото и видео$/, (m, x) => `Your query: “${x}”. Opens on sites with photos and videos`],
    [/^Скоро испортится: (.+)$/, (m, x) => `Expiring soon: ${tr(x)}`],
    [/^Записал в дневник\. За сегодня (\d+) из (\d+) ккал$/, (m, a, b) => `Logged. Today: ${a} of ${b} kcal`],
    [/^Вижу: (.+)\. Добавил в «Что есть дома»$/, (m, x) => `I can see: ${tr(x)}. Added to “What’s at home”`]
  ];
  let fragRe = null;
  function buildFrag() {
    const keys = Object.keys(DICT).filter(k => k.length >= 3).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    fragRe = keys.length ? new RegExp('(?<![А-Яа-яЁё])(' + keys.join('|') + ')(?![А-Яа-яЁё])', 'g') : null;
  }
  buildFrag();
  const cache = new Map();
  function tr(s) {
    const key = s.trim();
    if (!key || !/[А-Яа-яЁё]/.test(key)) return s;
    if (cache.has(key)) return s.replace(key, cache.get(key));
    let out = DICT[key];
    if (!out) for (const [re, fn] of PATTERNS) { const m = key.match(re); if (m) { out = fn(...m); break; } }
    if (!out && fragRe) out = key.replace(fragRe, k => DICT[k]);
    cache.set(key, out);
    return s.replace(key, out);
  }
  window.trEN = tr;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
  // помню исходный русский текст узла: при повторном переводе (пришли шаги рецепта) перевожу его, а не уже переведённое
  const ORIG = new WeakMap(), DONE = new WeakMap();
  function trNode(n) {
    const cur = n.nodeValue;
    const src = DONE.get(n) === cur ? ORIG.get(n) : cur;
    if (!/[А-Яа-яЁё]/.test(src)) return;
    const v = tr(src);
    ORIG.set(n, src); DONE.set(n, v);
    if (v !== cur) n.nodeValue = v;
  }
  function translate(root) {
    if (!root) return;
    if (root.nodeType === 3) { trNode(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest('[data-notr]')) return;
    for (const a of ['placeholder', 'aria-label', 'title']) {
      const v = root.getAttribute && root.getAttribute(a);
      if (v && /[А-Яа-яЁё]/.test(v)) { const t = tr(v); if (t !== v) root.setAttribute(a, t); }
    }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: n => n.nodeType === 1 ? (SKIP.has(n.tagName) || n.hasAttribute('data-notr') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) trNode(n);
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(el => {
      for (const a of ['placeholder', 'aria-label', 'title']) { const v = el.getAttribute(a); if (v && /[А-Яа-яЁё]/.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
    });
  }
  const obs = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') translate(m.target);
      else m.addedNodes.forEach(translate);
      if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && /[А-Яа-яЁё]/.test(v)) { const t = tr(v); if (t !== v) m.target.setAttribute(m.attributeName, t); } }
    }
  });
  function retranslate() { cache.clear(); buildFrag(); translate(document.body); }
  function start() {
    translate(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
    const fixTitle = () => { const t = tr(document.title); if (t !== document.title) document.title = t; };
    new MutationObserver(fixTitle).observe(document.querySelector('title'), { childList: true });
    fixTitle();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // названия и описания всех рецептов, шаги открытого рецепта — с сервера
  const API = window.API_BASE;
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* память полна */ } };
  const load = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  function addRecipe(id, d) {
    const r = (window.RECIPES || []).find(x => x.id === id);
    if (!r || !d) return;
    if (d.t) DICT[r.t] = d.t;
    if (d.d) DICT[r.d] = d.d;
    (d.steps || []).forEach((s, i) => { if (r.steps[i]) DICT[r.steps[i]] = s; });
    if (d.tip && r.tip) DICT[r.tip] = d.tip;
  }
  const tkey = 'cook.en.titles.' + (window.RECIPES || []).length;
  const titles = load(tkey);
  if (titles) for (const [id, d] of Object.entries(titles)) addRecipe(id, d);
  else if (API) fetch(API + '/api/translate-titles').then(r => r.ok ? r.json() : null).then(d => { if (!d) return; store(tkey, d); for (const [id, x] of Object.entries(d)) addRecipe(id, x); retranslate(); }).catch(() => { /* останутся русские названия */ });
  async function recipeSteps() {
    const m = location.hash.match(/^#\/r\/([\w-]+)/);
    if (!m || !API || m[1].startsWith('my-') || m[1].startsWith('ai-')) return;
    const k = 'cook.en.r.' + m[1];
    let d = load(k);
    if (!d) {
      try { const r = await fetch(API + '/api/translate/' + m[1]); if (!r.ok) return; d = await r.json(); store(k, d); } catch { return; }
    }
    addRecipe(m[1], d);
    retranslate();
  }
  window.addEventListener('hashchange', () => setTimeout(recipeSteps, 50));
  setTimeout(recipeSteps, 300);
})();

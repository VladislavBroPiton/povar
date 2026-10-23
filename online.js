'use strict';
/* Функции, которым нужен сервер: ИИ-повар, ИИ-рецепт, фото холодильника, синхронизация, общий список, статистика.
   Если сервер не задан в config.js — кнопки не показываются, сайт работает как обычно. */

const API = window.API_BASE || '';
const SRV = { ok: null, ai: false, bot: '' };

async function apiCall(path, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeout || 70000);
  const slow = setTimeout(() => toast('Сервер просыпается после простоя, это до минуты…'), 6000);
  try {
    const r = await fetch(API + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'), signal: ctl.signal,
      headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || 'Сервер ответил ошибкой ' + r.status);
    return d;
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Сервер не ответил, попробуйте ещё раз' : e.message === 'Failed to fetch' ? 'Нет связи с сервером' : e.message);
  } finally { clearTimeout(t); clearTimeout(slow); }
}
async function checkServer() {
  if (!API) { SRV.ok = false; return; }
  try {
    const r = await fetch(API + '/health');
    const d = await r.json();
    Object.assign(SRV, { ok: true, ai: !!d.ai, bot: d.bot || '' });
  } catch { SRV.ok = false; }
}

function aiCtx() {
  return {
    city: S.city ? S.city.n : '',
    have: S.have.map(t => tokenName(t)), diets: S.diets.map(k => DIETS[k]), ex: S.ex.map(t => tokenName(t)),
    serv: S.serv || 0
  };
}
const nl2br = s => esc(s).replace(/\n/g, '<br>');

// ---------- Места в интерфейсе ----------
function onlineHeroHTML() {
  if (!API) return '';
  return `<div class="row ai-row"><button class="btn" type="button" data-act="ask">💬 Спросить повара</button><button class="btn" type="button" data-act="airecipe">✨ Придумать рецепт из моих продуктов</button></div>`;
}
function onlinePhotoHTML() {
  if (!API) return '';
  return `<label class="btn sm photo-btn">📷 Фото холодильника — найду продукты сам<input type="file" accept="image/*" capture="environment" data-act="fridge" hidden></label>`;
}
function onlineNotFoundHTML() {
  if (!API) return '';
  return `<div class="row"><button class="btn primary" type="button" data-act="airecipe">✨ Придумать рецепт под мой запрос</button><button class="btn" type="button" data-act="ask">💬 Спросить повара</button></div>`;
}
function recipeExtraHTML(r) {
  if (!r.ai) return '';
  return `<div class="notice ai-note"><span>Этот рецепт придумал ИИ-повар под ваш запрос. Проверяйте соль и время по ходу готовки</span>
    <div class="row"><button class="btn sm primary" type="button" data-act="aisave" data-id="${esc(r.id)}">Сохранить в мои рецепты</button><button class="btn sm" type="button" data-act="airecipe">Придумать другой</button></div></div>`;
}

// ---------- ИИ-повар: вопрос-ответ ----------
const chat = [];
function openAsk(prefill) {
  openSheet(`
    <div class="sheet-head"><h3>Спросить повара</h3><button class="close" data-close aria-label="Закрыть">×</button></div>
    <div class="chat" id="chatBox">${chat.length ? chat.map(chatHTML).join('') : '<p class="muted small">Спросите что угодно о готовке: «чем заменить яйца в блинах», «что сделать из кабачка и фарша», «сколько запекать курицу 1,5 кг». Учту ваш город, ограничения и что есть дома</p>'}</div>
    <form class="ask-row" id="chatForm"><input class="input" id="chatQ" placeholder="Ваш вопрос" value="${esc(prefill || '')}" autocomplete="off" enterkeyhint="send"><button class="btn primary" type="submit">Спросить</button></form>
    <p class="small muted">Отвечает нейросеть: она может ошибаться. Аллергии и диеты по здоровью сверяйте с врачом</p>`);
  const box = $('#chatBox'); box.scrollTop = box.scrollHeight;
  $('#chatForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#chatQ').value.trim(); if (q.length < 3) return;
    const item = { q, a: null };
    chat.push(item);
    $('#chatQ').value = '';
    redrawChat();
    try { const d = await apiCall('/api/ai/ask', { body: { q, ctx: aiCtx() } }); item.a = d.answer; item.r = d.recipes || []; }
    catch (err) { item.a = '⚠ ' + err.message; item.r = []; }
    redrawChat();
    track('ai', { q: 'ask: ' + q });
  });
  setTimeout(() => $('#chatQ') && $('#chatQ').focus(), 50);
}
function chatHTML(x) {
  const recs = (x.r || []).map(id => RBYID[id]).filter(Boolean);
  return `<div class="msg me">${esc(x.q)}</div><div class="msg bot">${x.a === null ? '<span class="dots">Думаю</span>' : nl2br(x.a)}
    ${recs.length ? `<div class="chat-recs">${recs.map(r => `<a href="#/r/${esc(r.id)}" data-close>${esc(r.t)} →</a>`).join('')}</div>` : ''}</div>`;
}
function redrawChat() { const box = $('#chatBox'); if (!box) return; box.innerHTML = chat.map(chatHTML).join(''); box.scrollTop = box.scrollHeight; }

// ---------- ИИ-рецепт ----------
const AI_KEY = 'cook.ai';
function aiStore() { try { return JSON.parse(sessionStorage.getItem(AI_KEY) || '{}'); } catch { return {}; } }
function injectAi(rec) { const r = prepRecipe({ ...rec }); RBYID[r.id] = r; return r; }
for (const rec of Object.values(aiStore())) injectAi(rec);
async function aiRecipe() {
  const q = S.q || searchQueryText().replace(/^рецепт\s*/, '');
  openSheet(`<div class="sheet-head"><h3>Придумываю рецепт</h3><button class="close" data-close aria-label="Закрыть">×</button></div>
    <p>${esc(q ? 'Запрос: «' + q + '»' : 'Из того, что есть дома')}${S.have.length ? '. Есть: ' + esc(S.have.map(t => tokenName(t).toLowerCase()).join(', ')) : ''}</p>
    <p class="muted"><span class="dots">ИИ-повар думает, обычно 5-15 секунд</span></p>`);
  try {
    const rec = await apiCall('/api/ai/recipe', { body: { q, ctx: aiCtx() } });
    const st = aiStore(); st[rec.id] = rec;
    try { sessionStorage.setItem(AI_KEY, JSON.stringify(st)); } catch { /* не страшно */ }
    injectAi(rec);
    closeSheet();
    track('ai', { q: 'recipe: ' + q });
    location.hash = '#/r/' + rec.id;
  } catch (err) {
    $('#sheetBody').innerHTML = `<div class="sheet-head"><h3>Не получилось</h3><button class="close" data-close aria-label="Закрыть">×</button></div><p>${esc(err.message)}</p>`;
  }
}
function aiSave(id) {
  const r = RBYID[id]; if (!r) return;
  const raw = aiStore()[id] || r;
  const mine = { ...raw, id: 'my-' + Date.now().toString(36), ai: false, d: raw.d };
  delete mine.items;
  S.own = [mine, ...S.own]; save(); buildRecipes(S.own);
  toast('Сохранено в «Избранное → Мои рецепты»');
  location.hash = '#/r/' + mine.id;
}

// ---------- Фото холодильника ----------
async function fridgePhoto(file) {
  toast('Смотрю на фото…');
  try {
    const img = await compressImage(file, 1280, 0.78);
    const d = await apiCall('/api/ai/photo', { body: { image: img } });
    const ids = (d.ids || []).filter(id => ING[id]);
    if (!ids.length) { toast('Не разглядел продуктов. Снимите ближе и при свете'); return; }
    const added = ids.filter(id => !S.have.includes(id));
    S.have.push(...added); save();
    track('ai', { q: 'photo: ' + ids.join(',') });
    renderFind();
    toast(`Вижу: ${ids.map(id => ING[id].n.toLowerCase()).join(', ')}. Добавил в «Что есть дома»`);
  } catch (err) { toast(err.message); }
}

// ---------- Синхронизация между устройствами ----------
const SYNC_FIELDS = ['fav', 'notes', 'own', 'have', 'dates', 'plan', 'planOpt', 'diets', 'ex', 'list'];
let syncT = 0, syncBusy = false, lastSyncJSON = '';
function syncPayload() { const d = {}; for (const k of SYNC_FIELDS) if (!(k === 'list' && S.family)) d[k] = S[k]; return d; }
function afterSave() {
  if (S.syncCode && API) {
    const j = JSON.stringify(syncPayload());
    if (j !== lastSyncJSON) {
      // помечаю, что на этом устройстве есть неотправленные изменения
      try { localStorage.setItem('cook.dirty', String(Date.now())); } catch { /* ничего */ }
      clearTimeout(syncT); syncT = setTimeout(pushSync, 2500);
    }
  }
  if (S.family && API) familyDiff();
}
async function pushSync() {
  if (syncBusy) { syncT = setTimeout(pushSync, 2000); return; }
  syncBusy = true;
  const data = syncPayload();
  try { await apiCall('/api/sync/' + S.syncCode, { method: 'PUT', body: { data }, timeout: 30000 }); lastSyncJSON = JSON.stringify(data); S.syncAt = new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(S)); localStorage.removeItem('cook.dirty'); }
  catch { /* повторю при следующем изменении */ } finally { syncBusy = false; }
}
async function pullSync(code) {
  const d = await apiCall('/api/sync/' + code);
  for (const k of SYNC_FIELDS) if (d.data && d.data[k] !== undefined && !(k === 'list' && S.family)) S[k] = d.data[k];
  S.syncCode = code; S.syncAt = new Date().toISOString();
  lastSyncJSON = JSON.stringify(syncPayload());
  localStorage.setItem(KEY, JSON.stringify(S));
  buildRecipes(S.own); updateBadge();
}
function syncHTML() {
  if (!API) return '';
  return `<section class="card" id="syncCard"><h2>Телефон и компьютер вместе</h2>
    ${S.syncCode ? `<p>Код синхронизации: <b class="code">${esc(S.syncCode)}</b></p>
      <p class="small muted">Введите этот код на другом устройстве — избранное, свои рецепты, заметки, меню и «что есть дома» будут общими${S.syncAt ? '. Последнее сохранение: ' + esc(new Date(S.syncAt).toLocaleString('ru-RU')) : ''}</p>
      <div class="row"><button class="btn sm" type="button" data-act="synccopy">Скопировать код</button><button class="btn sm ghost" type="button" data-act="syncoff">Отключить на этом устройстве</button></div>`
    : `<p class="small muted">Сохраните избранное, свои рецепты, заметки и меню, чтобы открыть их на другом устройстве. Без регистрации: достаточно кода</p>
      <div class="row"><button class="btn primary sm" type="button" data-act="syncnew">Создать код</button></div>
      <form class="ask-row" id="syncJoin"><input class="input" id="syncCode" placeholder="Код с другого устройства" autocomplete="off" maxlength="12"><button class="btn" type="submit">Подключить</button></form>`}
  </section>
  <section class="card"><h2>Статистика сайта</h2><p class="small muted">Для владельца: сколько заходов, что ищут и не находят</p><a class="btn sm" href="#/stats">Открыть</a>${SRV.bot ? `<p>Telegram-бот: <a href="https://t.me/${esc(SRV.bot)}" target="_blank" rel="noopener">@${esc(SRV.bot)}</a></p>` : ''}</section>`;
}

// ---------- Общий список покупок для семьи ----------
let famTimer = 0, famSnap = [], famBusy = false;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function familyHTML() {
  if (!API) return '';
  if (S.family) return `<div class="notice ok family">Общий список семьи · код <b class="code">${esc(S.family)}</b>. Отмечайте купленное — у всех обновится за несколько секунд
    <div class="row"><button class="btn sm" type="button" data-act="famshare">Пригласить</button><button class="btn sm ghost" type="button" data-act="famoff">Выйти из общего списка</button></div></div>`;
  return `<div class="notice family"><span>Ходите в магазин по очереди? Сделайте список общим: все увидят, что уже куплено</span>
    <div class="row"><button class="btn sm primary" type="button" data-act="famnew">Сделать общим</button></div></div>`;
}
function toServerItem(x) { return { u: x.u, id: x.id || null, n: x.n || null, g: x.g || 0, from: x.from || [], got: !!x.got }; }
async function familyNew() {
  S.list.forEach(x => { x.u = x.u || uid(); });
  try {
    const d = await apiCall('/api/list', { body: { items: S.list.map(toServerItem) } });
    S.family = d.code; S.list = d.items; famSnap = JSON.parse(JSON.stringify(d.items));
    localStorage.setItem(KEY, JSON.stringify(S));
    renderList(); familyShare();
  } catch (e) { toast(e.message); }
}
async function familyJoin(code) {
  try {
    const mine = S.list.filter(x => !x.got);
    const d = await apiCall('/api/list/' + code);
    S.family = code; S.list = d.items; famSnap = JSON.parse(JSON.stringify(d.items));
    localStorage.setItem(KEY, JSON.stringify(S));
    if (mine.length) await familySend(mine.map(x => ({ op: 'add', item: toServerItem({ ...x, u: uid() }) })));
    toast('Вы подключены к общему списку');
  } catch (e) { toast(e.message); }
  location.hash = '#/list';
}
async function familySend(ops) {
  if (!ops.length) return;
  famBusy = true;
  try {
    const d = await apiCall('/api/list/' + S.family + '/ops', { body: { ops }, timeout: 30000 });
    S.list = d.items; famSnap = JSON.parse(JSON.stringify(d.items));
    localStorage.setItem(KEY, JSON.stringify(S)); updateBadge();
  } catch (e) { toast('Список не сохранился на сервере: ' + e.message); }
  finally { famBusy = false; }
}
// сравниваю список с последним состоянием сервера и отправляю изменения
function familyDiff() {
  if (famBusy) return;
  S.list.forEach(x => { x.u = x.u || uid(); });
  const before = new Map(famSnap.map(x => [x.u, x]));
  const now = new Map(S.list.map(x => [x.u, x]));
  const ops = [];
  for (const [u, x] of now) {
    const b = before.get(u);
    if (!b) ops.push({ op: 'add', item: toServerItem(x) });
    else if (!!b.got !== !!x.got) ops.push({ op: 'got', u, got: !!x.got });
  }
  for (const u of before.keys()) if (!now.has(u)) ops.push({ op: 'del', u });
  if (ops.length) familySend(ops).then(() => { if (curView === 'list') renderList(); });
}
async function familyPoll() {
  if (!S.family || famBusy || curView !== 'list' || document.hidden) return;
  try {
    const d = await apiCall('/api/list/' + S.family, { timeout: 15000 });
    if (JSON.stringify(d.items) !== JSON.stringify(famSnap)) {
      S.list = d.items; famSnap = JSON.parse(JSON.stringify(d.items));
      localStorage.setItem(KEY, JSON.stringify(S)); updateBadge(); renderList();
    }
  } catch { /* сеть пропала — попробую позже */ }
}
async function familyShare() {
  const url = BASE + '#/join/' + S.family;
  const text = `Присоединяйся к нашему списку покупок: ${url}`;
  try { if (navigator.share) await navigator.share({ title: 'Общий список покупок', text, url }); else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована — отправьте её семье'); } } catch { /* отмена */ }
}

// ---------- Статистика ----------
async function renderStats() {
  let key = localStorage.getItem('cook.stats') || '';
  app.innerHTML = `<div class="page"><h1>Статистика</h1>
    <form class="ask-row card" id="statsForm"><input class="input" id="statsKey" placeholder="Ключ статистики (из файла КЛЮЧИ.env)" value="${esc(key)}"><button class="btn primary" type="submit">Показать</button></form>
    <div id="statsBox"></div></div>`;
  const load = async () => {
    const box = $('#statsBox'); box.innerHTML = '<p class="muted">Загружаю…</p>';
    try {
      const d = await apiCall('/api/stats?days=7&key=' + encodeURIComponent(key));
      localStorage.setItem('cook.stats', key);
      const tbl = (title, rows, h1, h2) => `<section class="card"><h2>${title}</h2>${rows.length ? table([h1, h2], rows.map(r => [r.k ?? r.d, r.n ?? ''])) : '<p class="muted">Пока пусто</p>'}</section>`;
      box.innerHTML = `<section class="card"><h2>По дням</h2>${table(['День', 'Заходов', 'Рецептов открыто', 'Поисков'], d.days.map(x => [x.d, x.opens, x.recipes, x.searches]))}<p class="small muted">В Telegram-боте человек: ${d.tg_users}</p></section>
        <div class="help-grid">${tbl('Ищут и не находят', d.notfound, 'Запрос', 'Раз')}${tbl('Что ищут', d.searches, 'Запрос', 'Раз')}${tbl('Популярные рецепты', d.recipes, 'Рецепт', 'Открытий')}${tbl('Что ищут в магазинах', d.buys, 'Продукт', 'Раз')}${tbl('Города', d.cities, 'Город', 'Заходов')}</div>`;
    } catch (e) { box.innerHTML = `<p class="notice warn">${esc(e.message)}</p>`; }
  };
  $('#statsForm').addEventListener('submit', e => { e.preventDefault(); key = $('#statsKey').value.trim(); load(); });
  if (key) load();
}
function onlineRoute(h) {
  if (h === '#/stats') return ['stats', 'help', renderStats];
  const j = h.match(/^#\/join\/([a-z0-9]+)$/);
  if (j) return ['list', 'list', () => { app.innerHTML = '<div class="page"><p class="muted">Подключаю общий список…</p></div>'; familyJoin(j[1]); }];
  return null;
}

// ---------- Кнопки ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act;
  if (act === 'ask') openAsk();
  else if (act === 'airecipe') aiRecipe();
  else if (act === 'aisave') aiSave(b.dataset.id);
  else if (act === 'syncnew') {
    b.disabled = true;
    try { const d = await apiCall('/api/sync', { body: { data: syncPayload() } }); S.syncCode = d.code; S.syncAt = new Date().toISOString(); lastSyncJSON = JSON.stringify(syncPayload()); localStorage.setItem(KEY, JSON.stringify(S)); renderHelp(); toast('Код создан: введите его на другом устройстве'); }
    catch (err) { toast(err.message); b.disabled = false; }
  } else if (act === 'synccopy') { try { await navigator.clipboard.writeText(S.syncCode); toast('Код скопирован'); } catch { toast(S.syncCode); } }
  else if (act === 'syncoff') { if (confirm('Отключить синхронизацию на этом устройстве? Данные останутся здесь')) { delete S.syncCode; save(); renderHelp(); } }
  else if (act === 'famnew') familyNew();
  else if (act === 'famshare') familyShare();
  else if (act === 'famoff') { if (confirm('Выйти из общего списка? Список останется на этом устройстве, но перестанет обновляться')) { delete S.family; S.list.forEach(x => delete x.u); save(); renderList(); } }
});
document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.act === 'fridge' && e.target.files[0]) fridgePhoto(e.target.files[0]);
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'syncJoin') return;
  e.preventDefault();
  const code = $('#syncCode').value.trim().toLowerCase();
  if (code.length < 6) return;
  if (!confirm('Данные с другого устройства заменят избранное, свои рецепты, заметки и меню на этом. Продолжить?')) return;
  try { await pullSync(code); toast('Синхронизация подключена'); renderHelp(); } catch (err) { toast(err.message); }
});

// ---------- Запуск ----------
if (API) {
  checkServer().then(() => { if (curView === 'help') renderHelp(); });
  if (S.syncCode) {
    // есть неотправленные изменения — сначала отправляю их, иначе беру свежее с сервера
    if (localStorage.getItem('cook.dirty')) pushSync();
    else pullSync(S.syncCode).then(() => { if (curView) route(); }).catch(() => { /* офлайн — работаем с тем, что есть */ });
  }
  if (S.family) famSnap = JSON.parse(JSON.stringify(S.list));
  famTimer = setInterval(familyPoll, 6000);
}

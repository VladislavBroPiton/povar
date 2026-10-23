'use strict';
/* Профиль семьи, дневник питания, картинки для соцсетей (рецепт и меню на неделю), фото к шагам */

// ---------- Профиль семьи ----------
// S.profile = { on, kcal, members: [{ n, age, ex: [], diets: [] }] }
function profile() { return S.profile || { on: false, kcal: 2000, members: [] }; }
// состояние для подбора с учётом профиля: ограничения всех членов семьи складываются
function effS() {
  const p = profile();
  if (!p.on || !p.members.length) return S;
  const ex = new Set(S.ex), diets = new Set(S.diets);
  for (const m of p.members) { (m.ex || []).forEach(t => ex.add(t)); (m.diets || []).forEach(d => diets.add(d)); }
  return { ...S, ex: [...ex], diets: [...diets], serv: S.serv || p.members.length };
}
function profileNoticeHTML() {
  const p = profile();
  if (!p.on || !p.members.length) return '';
  const parts = p.members.filter(m => (m.ex || []).length || (m.diets || []).length).map(m => `${esc(m.n)}: ${esc([...(m.diets || []).map(d => DIETS[d].toLowerCase()), ...((m.ex || []).length ? ['нельзя: ' + (m.ex || []).map(t => tokenName(t).toLowerCase()).join(', ')] : [])].join(', '))}`);
  return `<div class="notice">Учитываю семью (${p.members.length} ${plural(p.members.length, 'человек', 'человека', 'человек')})${parts.length ? ': ' + parts.join('; ') : ''}. <a href="#/family">Изменить</a></div>`;
}
function profileFitHTML(r) {
  const p = profile();
  if (!p.on || !p.members.length) return '';
  const notes = [];
  for (const m of p.members) {
    const bad = (m.ex || []).filter(t => r.items.some(i => !i.opt && itemHitsToken(i.id, t)));
    const badDiet = (m.diets || []).filter(d => !r.diet[d]);
    if (bad.length || badDiet.length) notes.push(`<span class="fit no">✕ ${esc(m.n)}: ${esc([...badDiet.map(d => 'не ' + DIETS[d].toLowerCase()), ...bad.map(t => tokenName(t).toLowerCase())].join(', '))}</span>`);
    else if (m.age && m.age < 7) notes.push(r.age && r.age <= m.age ? `<span class="fit ok">✓ ${esc(m.n)} (${m.age} ${plural(m.age, 'год', 'года', 'лет')})</span>` : `<span class="fit warn">? ${esc(m.n)} (${m.age} ${plural(m.age, 'год', 'года', 'лет')}): для этого возраста не проверено</span>`);
    else notes.push(`<span class="fit ok">✓ ${esc(m.n)}</span>`);
  }
  return `<div class="fits">${notes.join('')}</div>`;
}
function renderFamily() {
  const p = profile();
  const AGES_OPT = [[0, 'взрослый'], [1, '1 год'], [2, '2 года'], [3, '3 года'], [4, '4 года'], [5, '5 лет'], [6, '6 лет'], [8, '7-12 лет'], [14, 'подросток']];
  app.innerHTML = `<div class="page"><h1>Наша семья</h1>
    <p class="muted">Заполните один раз: подбор, меню на неделю и рецепты сами учтут, кому что нельзя и сколько вас. Хранится только на этом устройстве</p>
    <label class="switch card"><input type="checkbox" id="profOn"${p.on ? ' checked' : ''}> Учитывать семью при подборе рецептов и в меню</label>
    <div class="fam-list">${p.members.map((m, i) => `<section class="card fam" data-i="${i}">
      <div class="row"><input class="input" data-f="n" value="${esc(m.n)}" placeholder="Имя" aria-label="Имя">
        <select class="input" data-f="age" aria-label="Возраст">${AGES_OPT.map(([v, n]) => `<option value="${v}"${(m.age || 0) === v ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <button class="close" type="button" data-del="${i}" aria-label="Удалить">×</button></div>
      <div class="chips">${Object.entries(DIETS).map(([k, n]) => `<button type="button" class="chip${(m.diets || []).includes(k) ? ' on' : ''}" data-diet="${k}">${n}</button>`).join('')}</div>
      <p class="small muted">Нельзя или не ест:</p>
      <div class="chips">${Object.entries(EXCL).map(([t, n]) => `<button type="button" class="chip${(m.ex || []).includes(t) ? ' ex' : ''}" data-ex="${t}">${esc(n)}</button>`).join('')}
        ${(m.ex || []).filter(t => !EXCL[t]).map(t => `<button type="button" class="chip ex x" data-ex="${esc(t)}">${esc(tokenName(t))}</button>`).join('')}</div>
      <div class="ac"><input class="input" data-ac="famex" placeholder="Другой продукт: лук, грибы…" autocomplete="off"><div class="ac-list" hidden></div></div>
    </section>`).join('')}</div>
    <button class="btn" type="button" id="famAdd">+ Добавить члена семьи</button>
    <section class="card"><h3>Цель по калориям на взрослого в день</h3>
      <div class="chips">${[1500, 1800, 2000, 2300, 2600].map(v => `<button type="button" class="chip${p.kcal === v ? ' on' : ''}" data-kcal="${v}">${v}</button>`).join('')}</div>
      <p class="small muted">Нужно для дневника питания. Обычно: 1800-2000 для женщин, 2300-2600 для мужчин; для похудения — на 300-500 меньше</p></section>
  </div>`;
  const put = () => { S.profile = p; save(); };
  $('#profOn').addEventListener('change', e => { p.on = e.target.checked; put(); });
  $('#famAdd').addEventListener('click', () => { p.members.push({ n: p.members.length ? 'Член семьи ' + (p.members.length + 1) : 'Я', age: 0, ex: [], diets: [] }); p.on = true; put(); renderFamily(); });
  app.oninput = e => { const card = e.target.closest('.fam'); if (!card || !e.target.dataset.f) return; const m = p.members[+card.dataset.i]; m[e.target.dataset.f] = e.target.dataset.f === 'age' ? +e.target.value : e.target.value; put(); };
  app.onchange = app.oninput;
  app.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const card = b.closest('.fam'); const m = card && p.members[+card.dataset.i];
    if (b.dataset.del !== undefined) { p.members.splice(+b.dataset.del, 1); put(); renderFamily(); }
    else if (b.dataset.diet && m) { m.diets = (m.diets || []).includes(b.dataset.diet) ? m.diets.filter(x => x !== b.dataset.diet) : [...(m.diets || []), b.dataset.diet]; b.classList.toggle('on'); put(); }
    else if (b.dataset.ex && m) { m.ex = (m.ex || []).includes(b.dataset.ex) ? m.ex.filter(x => x !== b.dataset.ex) : [...(m.ex || []), b.dataset.ex]; put(); renderFamily(); }
    else if (b.dataset.kcal) { p.kcal = +b.dataset.kcal; put(); renderFamily(); }
  };
  $$('[data-ac="famex"]').forEach(inp => bindAC(inp, t => { const m = p.members[+inp.closest('.fam').dataset.i]; if (!(m.ex || []).includes(t)) m.ex = [...(m.ex || []), t]; put(); renderFamily(); }));
}

// ---------- Дневник питания ----------
const today = () => new Date().toISOString().slice(0, 10);
function recipeButtonsHTML(r) {
  return `<button class="btn" type="button" data-eat="${esc(r.id)}">🍴 Съел порцию</button><button class="btn" type="button" data-card="${esc(r.id)}">🖼 Картинка для соцсетей</button>`;
}
function eat(id) {
  const r = RBYID[id]; if (!r) return;
  S.diary = S.diary || {};
  const d = today();
  S.diary[d] = [...(S.diary[d] || []), { id, t: r.t, p: 1, e: r.ps.map(v => Math.round(v * 10) / 10) }];
  // старше 60 дней не храню
  for (const k of Object.keys(S.diary)) if ((Date.now() - new Date(k)) / 864e5 > 60) delete S.diary[k];
  save();
  const sum = dayTotals(d);
  toast(`Записал в дневник. За сегодня ${Math.round(sum[0])} из ${profile().kcal || 2000} ккал`);
}
function dayTotals(d) {
  const t = [0, 0, 0, 0];
  for (const x of (S.diary || {})[d] || []) for (let i = 0; i < 4; i++) t[i] += x.e[i] * x.p;
  return t;
}
function renderDiary() {
  const goal = profile().kcal || 2000;
  const target = [goal, goal * 0.18 / 4, goal * 0.3 / 9, goal * 0.52 / 4];
  const d = today();
  const t = dayTotals(d);
  const items = (S.diary || {})[d] || [];
  const days = [...Array(7)].map((_, i) => { const dt = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); return [dt, dayTotals(dt)[0]]; }).reverse();
  const maxK = Math.max(goal, ...days.map(x => x[1]));
  const bar = (v, max, label, unit) => `<div class="bar"><div class="bar-top"><span>${label}</span><b>${Math.round(v)} / ${Math.round(max)} ${unit}</b></div><div class="bar-track"><span style="width:${Math.min(100, v / max * 100)}%"${v > max * 1.1 ? ' class="over"' : ''}></span></div></div>`;
  let advice = '';
  const hour = new Date().getHours();
  if (items.length && hour >= 14) {
    if (t[1] < target[1] * 0.6) advice = `Сегодня мало белка: ${Math.round(t[1])} г из ${Math.round(target[1])}. <a href="#/" data-goal="protein">Показать белковые блюда</a>`;
    else if (t[0] > goal * 1.1) advice = 'Калорий уже больше цели — на ужин подойдёт что-то лёгкое. <a href="#/" data-goal="lowcal">Показать лёгкие блюда</a>';
    else if (t[0] < goal * 0.5 && hour >= 18) advice = 'Съедено меньше половины нормы — не забудьте поужинать';
  }
  app.innerHTML = `<div class="page"><h1>Дневник питания</h1>
    <section class="card"><h2>Сегодня</h2>
      ${bar(t[0], target[0], 'Калории', 'ккал')}${bar(t[1], target[1], 'Белки', 'г')}${bar(t[2], target[2], 'Жиры', 'г')}${bar(t[3], target[3], 'Углеводы', 'г')}
      ${advice ? `<div class="notice">${advice}</div>` : ''}
      ${items.length ? `<ul class="shop-list">${items.map((x, i) => `<li><span>🍴</span><span class="nm"><a href="#/r/${esc(x.id)}">${esc(x.t)}</a><small>${Math.round(x.e[0] * x.p)} ккал · Б ${Math.round(x.e[1] * x.p)} · Ж ${Math.round(x.e[2] * x.p)} · У ${Math.round(x.e[3] * x.p)}</small></span>
        <span class="row"><button class="btn sm" type="button" data-pp="${i}" data-d="0.5">½</button><button class="btn sm" type="button" data-pp="${i}" data-d="1">+1</button><button class="close" type="button" data-rm="${i}" aria-label="Удалить">×</button></span></li>`).join('')}</ul>`
        : `<p class="muted">Пока пусто. На странице рецепта нажмите «🍴 Съел порцию»</p>`}
    </section>
    <section class="card"><h2>Неделя</h2><div class="week">${days.map(([dt, k]) => `<div class="wk"><span class="wk-bar"><span style="height:${Math.round(k / maxK * 100)}%"${k > goal * 1.1 ? ' class="over"' : ''}></span></span><small>${new Date(dt).toLocaleDateString(window.LANG === 'en' ? 'en-GB' : 'ru-RU', { weekday: 'short' })}</small><b>${Math.round(k)}</b></div>`).join('')}</div>
      <p class="small muted">Цель: ${goal} ккал в день. <a href="#/family">Изменить</a>. Расчёт по средним значениям продуктов — это ориентир, не медицинский совет</p></section>
  </div>`;
  app.onclick = e => {
    const a = e.target.closest('[data-goal]');
    if (a) { e.preventDefault(); S.goals = [a.dataset.goal]; save(); location.hash = '#/'; return; }
    const b = e.target.closest('button'); if (!b) return;
    const list = S.diary[d];
    if (b.dataset.rm !== undefined) list.splice(+b.dataset.rm, 1);
    else if (b.dataset.pp !== undefined) { const x = list[+b.dataset.pp]; x.p = b.dataset.d === '0.5' ? 0.5 : x.p + 1; }
    else return;
    save(); renderDiary();
  };
}

// ---------- Картинки для соцсетей ----------
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function wrapText(ctx, text, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function coverDraw(ctx, im, x, y, w, h) {
  const k = Math.max(w / im.width, h / im.height);
  const sw = w / k, sh = h / k;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
}
async function shareCanvas(cv, name, title) {
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
  const file = new File([blob], name, { type: 'image/jpeg' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title, text: title + ' — ' + BASE }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Картинка сохранена в «Загрузки»');
}
const CARD_BG = '#241b15', CARD_ACC = '#b4532f', CARD_TXT = '#fdf6ec';
async function recipeCard(id) {
  const r = RBYID[id]; if (!r) return;
  toast('Рисую картинку…');
  await document.fonts.ready;
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = CARD_BG; c.fillRect(0, 0, W, H);
  try { if (r.img) coverDraw(c, await loadImg(r.img), 0, 0, W, 810); } catch { /* без фото */ }
  const g = c.createLinearGradient(0, 640, 0, 810); g.addColorStop(0, 'rgba(36,27,21,0)'); g.addColorStop(1, CARD_BG);
  c.fillStyle = g; c.fillRect(0, 640, W, 170);
  c.fillStyle = CARD_TXT; c.font = '600 64px Unbounded, system-ui, sans-serif';
  let y = 880;
  for (const line of wrapText(c, r.t, W - 120).slice(0, 3)) { c.fillText(line, 60, y); y += 78; }
  c.font = '36px system-ui, Segoe UI, sans-serif'; c.fillStyle = '#f0c9b0';
  y += 10;
  for (const line of wrapText(c, r.d, W - 120).slice(0, 2)) { c.fillText(line, 60, y); y += 48; }
  y += 30;
  const chips = [`⏱ ${r.time} мин`, `${Math.round(r.ps[0])} ккал`, `Б ${Math.round(r.ps[1])} · Ж ${Math.round(r.ps[2])} · У ${Math.round(r.ps[3])}`];
  c.font = '600 34px system-ui, Segoe UI, sans-serif';
  let x = 60;
  for (const t of chips) { const w = c.measureText(t).width + 44; c.fillStyle = 'rgba(253,246,236,.12)'; c.beginPath(); c.roundRect(x, y - 40, w, 60, 30); c.fill(); c.fillStyle = CARD_TXT; c.fillText(t, x + 22, y); x += w + 14; }
  c.fillStyle = CARD_ACC; c.fillRect(0, H - 110, W, 110);
  c.fillStyle = CARD_TXT; c.font = '600 36px Unbounded, system-ui, sans-serif'; c.fillText('Что приготовить?', 60, H - 46);
  c.font = '28px system-ui, sans-serif'; c.textAlign = 'right'; c.fillText(BASE.replace(/^https?:\/\//, '').replace(/\/$/, ''), W - 60, H - 46);
  await shareCanvas(cv, `${r.id}.jpg`, r.t);
}
async function planCard() {
  const p = S.plan; if (!p || !p.days.length) return;
  toast('Рисую меню…');
  await document.fonts.ready;
  const W = 1080, rowH = 150, H = 260 + p.days.length * rowH + 120;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#f7f3ec'; c.fillRect(0, 0, W, H);
  c.fillStyle = CARD_ACC; c.fillRect(0, 0, W, 200);
  c.fillStyle = CARD_TXT; c.font = '600 68px Unbounded, system-ui, sans-serif'; c.fillText('Меню на неделю', 60, 115);
  c.font = '32px system-ui, sans-serif'; c.fillText(`на ${p.people} ${plural(p.people, 'человека', 'человек', 'человек')} · ${p.days.length} ${plural(p.days.length, 'день', 'дня', 'дней')}`, 60, 165);
  const start = new Date(p.start || Date.now());
  const names = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' };
  p.days.forEach((day, i) => {
    const y = 250 + i * rowH;
    c.fillStyle = i % 2 ? '#efe9df' : '#fffdf9'; c.fillRect(30, y - 30, W - 60, rowH - 10);
    c.fillStyle = CARD_ACC; c.font = '600 30px Unbounded, system-ui, sans-serif';
    const dn = new Date(start.getTime() + i * 864e5).toLocaleDateString(window.LANG === 'en' ? 'en-GB' : 'ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
    c.fillText(dn, 60, y + 10);
    c.fillStyle = '#26211c'; c.font = '30px system-ui, sans-serif';
    p.meals.forEach((slot, j) => { const r = RBYID[day[slot]]; if (!r) return; let t = `${names[slot]}: ${r.t}`; while (c.measureText(t).width > W - 360 && t.length > 10) t = t.slice(0, -2); c.fillText(t + (t.length < `${names[slot]}: ${r.t}`.length ? '…' : ''), 300, y - 2 + j * 38); });
  });
  c.fillStyle = '#6f655a'; c.font = '28px system-ui, sans-serif'; c.textAlign = 'center';
  c.fillText('Составлено на «Что приготовить» · ' + BASE.replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, H - 50);
  await shareCanvas(cv, 'menu.jpg', 'Наше меню на неделю');
}
function planShareHTML() { return S.plan && S.plan.days ? '<button class="btn" type="button" data-plancard>🖼 Поделиться меню картинкой</button>' : ''; }

// ---------- Фото к шагам (если есть для рецепта) ----------
function stepMediaHTML(r) {
  const m = (window.STEP_MEDIA || {})[r.id];
  if (!m || !m.length) return '';
  return `<h3>Как это выглядит</h3><div class="step-media">${m.map(x => `<figure>${x.v ? `<video src="${esc(x.v)}" muted loop playsinline autoplay preload="none" poster="${esc(x.i)}"></video>` : `<img src="${esc(x.i)}" alt="" loading="lazy">`}<figcaption>Шаг ${x.s + 1}</figcaption></figure>`).join('')}</div>`;
}

// ---------- Кнопки и маршруты ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-eat], [data-card], [data-plancard]'); if (!b) return;
  if (b.dataset.eat) { eat(b.dataset.eat); b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 250 }); }
  else if (b.dataset.card) recipeCard(b.dataset.card);
  else if (b.dataset.plancard !== undefined) planCard();
});
function extraRoute(h) {
  if (h === '#/family') return ['family', 'fav', renderFamily];
  if (h === '#/diary') return ['diary', 'fav', renderDiary];
  return null;
}

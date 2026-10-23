'use strict';
/* Холодильник с количеством, уведомления таймеров, озвучка и голосовые команды в режиме готовки,
   список покупок картинкой, отзывы с фото, «что это за блюдо» по фото */

// ---------- Холодильник: после «Я приготовил» вычитаю то, что ушло в блюдо ----------
function afterCooked(r, k) {
  if (!S.stock) return;
  const gone = [];
  for (const it of r.items) {
    if (it.opt) continue;
    const t = S.have.find(x => tokenIds(x).includes(it.id));
    if (!t || S.stock[t] == null) continue;
    const ing = ING[it.id];
    const used = ing && ing.pc ? it.g * k / ing.pc : it.g * k; // штуки или граммы — как человек вписал
    S.stock[t] = Math.round((S.stock[t] - used) * 10) / 10;
    if (S.stock[t] <= 0) { gone.push(tokenName(t).toLowerCase()); S.have = S.have.filter(x => x !== t); delete S.stock[t]; delete S.dates[t]; }
  }
  save();
  if (gone.length) setTimeout(() => toast(`Закончились: ${gone.join(', ')}. Убрал из «Что есть дома»`), 1500);
}

// ---------- Таймер звенит и в свёрнутой вкладке ----------
function timerStarted() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { /* не разрешили */ });
}
setInterval(() => {
  for (const t of timers) {
    if (!t.ring || t.notified) continue;
    t.notified = true;
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const body = t.label;
      navigator.serviceWorker && navigator.serviceWorker.getRegistration().then(reg => reg ? reg.showNotification('⏰ Время вышло', { body, tag: 'timer' + t.id, vibrate: [300, 150, 300], renotify: true })
        : new Notification('⏰ Время вышло', { body })).catch(() => { /* без уведомления */ });
    }
  }
}, 1000);

// ---------- Режим готовки: озвучка шагов и голосовые команды ----------
let speakOn = false, listening = null;
function cookToolsHTML() {
  const tts = 'speechSynthesis' in window;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return `${tts ? `<button class="btn sm${speakOn ? ' primary' : ''}" id="cookSpeak" title="Читать шаги вслух" aria-label="Читать шаги вслух">${IC.speaker}</button>` : ''}${SR ? `<button class="btn sm${listening ? ' primary' : ''}" id="cookVoice" title="Голосовые команды: дальше, назад, повтори, таймер" aria-label="Голосовые команды">${IC.mic}</button>` : ''}`;
}
function speakStep() {
  if (!cookState || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cookState.ings ? 'Продукты' : cookState.r.steps[cookState.i]);
  u.lang = window.LANG === 'en' ? 'en-US' : 'ru-RU';
  const v = speechSynthesis.getVoices().find(x => x.lang.startsWith(u.lang.slice(0, 2)));
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
function cookStepChanged() { if (speakOn) speakStep(); }
function voiceCommands() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (listening) { listening.onend = null; listening.stop(); listening = null; drawCook(); return; }
  const rec = new SR();
  rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = false;
  rec.onresult = e => {
    const t = norm(e.results[e.results.length - 1][0].transcript);
    if (/дальше|следующ|вперед|next/.test(t)) cookGo(1);
    else if (/назад|предыдущ|back/.test(t)) cookGo(-1);
    else if (/повтор|прочитай|еще раз|repeat/.test(t)) speakStep();
    else if (/таймер|timer/.test(t)) { const b = $('.cook [data-timer]'); if (b) b.click(); else toast('В этом шаге нет таймера'); }
    else if (/продукт|ингредиент/.test(t)) { cookState.ings = true; drawCook(); }
    else if (/готово|выход|закрой|стоп/.test(t)) closeCook();
  };
  rec.onerror = e => { if (e.error === 'not-allowed') { toast('Разрешите микрофон в настройках браузера'); listening = null; drawCook(); } };
  rec.onend = () => { if (listening === rec && cookState) { try { rec.start(); } catch { /* перезапуск не удался */ } } };
  try { rec.start(); listening = rec; toast('Слушаю: «дальше», «назад», «повтори», «таймер», «продукты»'); } catch { toast('Микрофон недоступен'); }
  drawCook();
}
document.addEventListener('click', e => {
  const b = e.target.closest('#cookSpeak, #cookVoice'); if (!b) return;
  if (b.id === 'cookSpeak') { speakOn = !speakOn; if (speakOn) speakStep(); else speechSynthesis.cancel(); drawCook(); }
  else voiceCommands();
});
// закрыли режим готовки — замолкаю и перестаю слушать
new MutationObserver(() => {
  if (!document.querySelector('.cook')) {
    if (listening) { listening.onend = null; try { listening.stop(); } catch { /* уже */ } listening = null; }
    if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.cancel();
  }
}).observe(document.body, { childList: true });

// ---------- Список покупок картинкой ----------
function listShareHTML() {
  return S.list.some(x => !x.got) ? `<button class="btn sm" type="button" data-listcard>${IC.image}Отправить список картинкой</button>` : '';
}
async function listCard() {
  const left = S.list.filter(x => !x.got);
  if (!left.length) return;
  await document.fonts.ready;
  const groups = DEPTS.map(([key, name]) => [name, left.filter(x => (x.id ? deptOf(x.id) : 'other') === key)]).filter(([, l]) => l.length);
  const rows = groups.reduce((a, [, l]) => a + l.length + 1.4, 0);
  const W = 1080, H = Math.max(900, 300 + rows * 58 + 120);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#fffdf9'; c.fillRect(0, 0, W, H);
  c.fillStyle = CARD_ACC; c.fillRect(0, 0, W, 190);
  c.fillStyle = CARD_TXT; c.font = '600 66px Unbounded, system-ui, sans-serif'; c.fillText('Купить', 60, 110);
  c.font = '32px system-ui, sans-serif'; c.fillText(`${left.length} ${plural(left.length, 'пункт', 'пункта', 'пунктов')}${S.city ? ' · ' + S.city.n : ''}`, 60, 160);
  let y = 260;
  for (const [name, l] of groups) {
    c.fillStyle = CARD_ACC; c.font = '600 30px system-ui, sans-serif'; c.fillText(name.toUpperCase(), 60, y); y += 50;
    for (const x of l) {
      c.strokeStyle = '#b9ab9b'; c.lineWidth = 3; c.strokeRect(60, y - 30, 34, 34);
      c.fillStyle = '#26211c'; c.font = '36px system-ui, sans-serif';
      const nm = (x.id ? ING[x.id].n : x.n) + (x.id && x.g ? ' — ' + fmtGrams(x.g, ING[x.id].fl.includes('l')) : '');
      c.fillText(nm.length > 48 ? nm.slice(0, 47) + '…' : nm, 116, y); y += 58;
    }
    y += 24;
  }
  c.fillStyle = '#6f655a'; c.font = '28px system-ui, sans-serif'; c.textAlign = 'center';
  c.fillText('Список из «Что приготовить» · ' + BASE.replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, H - 50);
  await shareCanvas(cv, 'spisok.jpg', 'Список покупок');
}

// ---------- Отзывы к рецепту ----------
const commentsCache = {};
function commentsHTML(r) {
  if (!window.API_BASE || r.own || r.ai) return '';
  setTimeout(() => loadComments(r.id), 0);
  return `<section class="card comments no-print" id="comments"><h2>Отзывы</h2><div id="cmList"><p class="muted small">Загружаю…</p></div>
    <details><summary class="btn sm">${IC.pen}Оставить отзыв</summary>
      <form id="cmForm" class="cm-form"><input class="input" name="name" maxlength="40" placeholder="Имя (необязательно)">
      <textarea class="input" name="text" rows="3" maxlength="1000" required placeholder="Как получилось? Что поменяли?"></textarea>
      <div class="row"><label class="btn sm">${IC.camera}Фото блюда<input type="file" accept="image/*" name="photo" hidden></label><span class="small muted" id="cmPhoto"></span></div>
      <button class="btn primary" type="submit">Отправить</button>
      <p class="small muted">Отзыв появится после проверки. Ссылки не публикуем</p></form></details></section>`;
}
async function loadComments(id) {
  const box = $('#cmList'); if (!box) return;
  try {
    const d = commentsCache[id] || await apiCall('/api/comments/' + id, { timeout: 20000 });
    commentsCache[id] = d;
    box.innerHTML = d.items.length ? d.items.map(x => `<div class="cm"><b>${esc(x.name)}</b> <span class="small muted">${esc(x.date)}</span><p>${esc(x.text)}</p>${x.photo ? `<img src="${esc(x.photo)}" alt="Фото от ${esc(x.name)}" loading="lazy">` : ''}</div>`).join('')
      : '<p class="muted small">Пока никто не написал. Приготовили — расскажите, как вышло</p>';
  } catch { box.innerHTML = '<p class="muted small">Отзывы сейчас не загрузились</p>'; }
}
let cmPhotoData = '';
document.addEventListener('change', async e => {
  if (e.target.name !== 'photo' || !e.target.closest('#cmForm')) return;
  const f = e.target.files[0]; if (!f) return;
  $('#cmPhoto').textContent = 'сжимаю…';
  try { cmPhotoData = await compressImage(f, 900, 0.72); $('#cmPhoto').textContent = 'фото добавлено'; } catch { $('#cmPhoto').textContent = 'не получилось'; }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'cmForm') return;
  e.preventDefault();
  const id = (location.hash.match(/^#\/r\/([\w-]+)/) || [])[1];
  const fd = new FormData(e.target);
  const b = $('button[type=submit]', e.target); b.disabled = true;
  try {
    const d = await apiCall('/api/comments/' + id, { body: { name: fd.get('name'), text: fd.get('text'), photo: cmPhotoData } });
    e.target.innerHTML = `<p class="notice ok">${esc(d.note || 'Спасибо!')}</p>`; cmPhotoData = '';
  } catch (err) { toast(err.message); b.disabled = false; }
});

// ---------- «Что это за блюдо?» по фото ----------
async function dishPhoto(file) {
  openSheet(`<div class="sheet-head"><h3>Что это за блюдо?</h3><button class="close" data-close aria-label="Закрыть">×</button></div><p class="muted"><span class="dots">Смотрю на фото</span></p>`);
  try {
    const img = await compressImage(file, 1024, 0.78);
    const d = await apiCall('/api/ai/dish', { body: { image: img } });
    const recs = (d.recipes || []).map(id => RBYID[id]).filter(Boolean);
    $('#sheetBody').innerHTML = `<div class="sheet-head"><h3>${esc(d.name || 'Не узнал блюдо')}</h3><button class="close" data-close aria-label="Закрыть">×</button></div>
      ${d.about ? `<p>${esc(d.about)}</p>` : ''}
      ${recs.length ? `<h3>Похожие рецепты</h3><div class="grid">${recs.map(r => card({ r, miss: [] }, new Set())).join('')}</div>` : ''}
      <div class="row"><button class="btn" type="button" data-act="airecipe">${IC.sparkle}Придумать рецепт этого блюда</button></div>`;
    if (d.name) S.q = d.name;
    track('ai', { q: 'dish: ' + (d.name || '?') });
  } catch (err) { $('#sheetBody').innerHTML = `<div class="sheet-head"><h3>Не получилось</h3><button class="close" data-close aria-label="Закрыть">×</button></div><p>${esc(err.message)}</p>`; }
}
$('#sheet').addEventListener('click', e => { if (e.target.closest('.rcard')) closeSheet(); });
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.act === 'dish' && e.target.files[0]) dishPhoto(e.target.files[0]); });
document.addEventListener('click', e => { if (e.target.closest('[data-listcard]')) listCard(); });

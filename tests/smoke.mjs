// Проверка собранного сайта в настоящем браузере перед публикацией.
// Запуск: сайт отдаётся на http://localhost:8790, затем node tests/smoke.mjs
// Падает, если на странице ошибки скрипта, страница шире экрана или не отрисовалось главное
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://localhost:8790/';
const PAGES = [
  ['главная', '', '#app h1'],
  ['рецепт', '#/r/sharlotka', '#app h1'],
  ['меню', '#/plan', '#app h1'],
  ['список покупок', '#/list', '#app h1'],
  ['подсказки', '#/help', '#app h1'],
  ['страница рецепта', 'r/sharlotka.html', 'h1'],
  ['подборка', 'q/iz-kuricy.html', '.qg li'],
];
const SIZES = [['телефон', 390, 844], ['телефон боком', 844, 390], ['планшет', 820, 1180], ['компьютер', 1366, 800]];
// сеть до сервера и счётчиков в CI может быть недоступна — это не ошибка сайта
const IGNORE = /Failed to load resource|net::|onrender\.com|ERR_|favicon/i;

// в GitHub Actions Chrome уже стоит — беру его, чтобы не качать браузер (это иногда висело по 10+ минут)
const browser = await chromium.launch(process.env.CI ? { channel: 'chrome' } : {});
const fails = [];
for (const [sname, w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let errs = [];
  page.on('pageerror', e => errs.push('скрипт: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('консоль: ' + m.text()); });
  for (const [pname, path, sel] of PAGES) {
    errs = [];
    const where = `${pname} (${sname} ${w}×${h})`;
    const t0 = Date.now();
    try {
      await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 });
      await page.waitForSelector(sel, { timeout: 10000 });
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 1) fails.push(`${where}: страница шире экрана на ${over}px`);
    } catch (e) {
      fails.push(`${where}: не отрисовалась — ${e.message.split('\n')[0]}`);
    }
    for (const x of errs) fails.push(`${where}: ${x}`);
    console.log(`${where}: ${Date.now() - t0} мс`);
  }
  await ctx.close();
}
await browser.close();
if (fails.length) {
  console.error('Проблемы:\n' + fails.join('\n'));
  process.exit(1);
}
console.log(`Проверено ${PAGES.length} страниц × ${SIZES.length} размера экрана — без ошибок`);

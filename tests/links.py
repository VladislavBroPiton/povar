"""Проверка ссылок: все страницы из sitemap на живом сайте + внешние ссылки (авторы фото, видео, источники).

Запуск: python tests/links.py [адрес сайта]. Пишет отчёт в links-report.txt, код выхода 1 — есть битые.
"""
import concurrent.futures as cf
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = sys.argv[1] if len(sys.argv) > 1 else 'https://chto-prigotovit-doma.ru/'
UA = {'User-Agent': 'Mozilla/5.0 (link check; povar)'}
SKIP = re.compile(r'localhost|onrender\.com|example\.|fonts\.g|schema\.org|sitemaps\.org|w3\.org|t\.me/share|\{|w/api\.php')


def status(url):
    for method in ('HEAD', 'GET'):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA, method=method), timeout=25) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if method == 'HEAD' and e.code in (403, 405, 400, 404, 501):
                continue
            return e.code
        except Exception as e:  # noqa: BLE001
            if method == 'GET':
                return type(e).__name__
    return 'нет ответа'


def main():
    sitemap = (ROOT / 'sitemap.xml').read_text(encoding='utf-8')
    pages = re.findall(r'<loc>([^<]+)</loc>', sitemap)
    pages = [SITE + p.split('.ru/', 1)[1] if 'chto-prigotovit-doma.ru/' in p else p for p in pages]
    ext = set()
    for f in [ROOT / 'index.html', *ROOT.glob('data/*.js'), *ROOT.glob('*.js')]:
        if f.name == 'i18n-en.js':
            continue
        for u in re.findall(r'https?://[^\s\'"`<>\\]+', f.read_text(encoding='utf-8')):
            u = u.rstrip('.,;')
            while u.endswith(')') and u.count(')') > u.count('('):
                u = u[:-1]
            if not SKIP.search(u) and 'chto-prigotovit-doma.ru' not in u and 'vladislavbropiton.github.io' not in u:
                ext.add(u)
    urls = sorted(set(pages)) + sorted(ext)
    with cf.ThreadPoolExecutor(12) as pool:
        res = dict(zip(urls, pool.map(status, urls)))
    # сбой сети или защита от роботов (429, 403, 498) — проверяем ещё раз по одной, медленно
    for u in [u for u, s in res.items() if not isinstance(s, int) or s in (429, 503)]:
        time.sleep(1.5)
        res[u] = status(u)
    bad = {u: s for u, s in res.items() if not (isinstance(s, int) and (s < 400 or s in (429, 403, 498, 999)))}
    lines = [f'Страниц сайта: {len(set(pages))}, внешних ссылок: {len(ext)}, битых: {len(bad)}']
    lines += [f'{s}  {u}' for u, s in sorted(bad.items())]
    (ROOT / 'links-report.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('\n'.join(lines))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

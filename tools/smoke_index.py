#!/usr/bin/env python3
"""index.html 整站单文件的冒烟：逐个 section 切页，点遍按钮，收集报错。

用法：
    python3 tools/smoke_index.py
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'
CHROME = '/usr/local/bin/chromium'


def pages():
    """从 index.html 里取全部页面名：只认 section 起始标记，不进正文。"""
    html = (DOCS / 'index.html').read_text(encoding='utf-8')
    return re.findall(r'<section class="page" data-name="([^"]+)"', html)


def main() -> int:
    names = pages()
    print("pages:", names[:5], "…", len(names))
    bad = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME)
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append('console: ' + m.text)
                if m.type == 'error' else None)
        page.goto((DOCS / 'index.html').as_uri(), wait_until='load')
        page.wait_for_timeout(300)
        if errors:
            bad.append(('首屏', errors[0][:120]))

        for name in names:
            errors.clear()
            page.evaluate("n => { if (!window.T) throw new Error('T gone, name='+n); window.T.go(n); }", name)
            page.wait_for_timeout(120)
            seen = page.evaluate("() => { var s = document.querySelector('main > section.page:not([hidden])'); return s && s.dataset.name; }")
            if seen != name:
                bad.append((name, '切页后可见的是 ' + str(seen)))
                continue
            t = page.evaluate("() => typeof window.T")
            if t != 'object':
                bad.append((name, 'T 已丢失（' + t + '）'))
                continue
            btns = page.locator('main > section.page:not([hidden]) button')
            for i in range(min(btns.count(), 15)):
                b = btns.nth(i)
                try:
                    if b.is_visible():
                        b.click(timeout=1200)
                        page.wait_for_timeout(20)
                except Exception:
                    pass
            if errors:
                bad.append((name, errors[0][:120]))

        # 首页各入口点一遍，确认都落在自己的页
        page.evaluate("() => window.T.go('index.html')")
        page.wait_for_timeout(100)
        links = page.locator('main > section.page:not([hidden]) a[data-page]')
        n_links = links.count()
        for i in range(n_links):
            errors.clear()
            # 先记下这条入口指向哪页，再点（点完首页就藏起来了）
            want = page.evaluate(
                "i => document.querySelectorAll('main > section.page:not([hidden]) a[data-page]')[i].dataset.page", i)
            page.evaluate(
                "i => document.querySelectorAll('main > section.page:not([hidden]) a[data-page]')[i].click()", i)
            page.wait_for_timeout(60)
            seen = page.evaluate("() => { var s = document.querySelector('main > section.page:not([hidden])'); return s && s.dataset.name; }")
            if seen != want:
                bad.append(('首页入口 ' + str(i) + ' → ' + want, '落到了 ' + str(seen)))
            if errors:
                bad.append(('首页入口 ' + str(i), errors[0][:120]))
            page.evaluate("() => window.T.go('index.html')")
            page.wait_for_timeout(30)

    print('页面 %d 个，首页入口 %d 个，异常 %d 处' % (len(names), n_links, len(bad)))
    for n, e in bad[:20]:
        print('  %s → %s' % (n, e))
    return 1 if bad else 0


if __name__ == '__main__':
    raise SystemExit(main())

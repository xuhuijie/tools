#!/usr/bin/env python3
"""用无头 Chrome 逐个打开 docs/*.html，点遍页面上的按钮与页签，收集控制台报错。

用法：
    python3 tools/smoke.py            # 全部页面
    python3 tools/smoke.py web clock  # 只跑文件名含这些关键词的页面

环境里已装 playwright 与 /usr/local/bin/chromium，无需额外下载浏览器。
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'
CHROME = '/usr/local/bin/chromium'


def main():
    keys = sys.argv[1:]
    files = sorted(p for p in DOCS.glob('*.html') if not keys or any(k in p.name for k in keys))
    bad = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME)
        for f in files:
            page = browser.new_page()
            errors = []
            page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
            page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
            page.goto(f.as_uri())
            page.wait_for_timeout(250)

            buttons = page.locator('button')
            total = buttons.count()
            for i in range(total):
                btn = buttons.nth(i)
                try:
                    if btn.is_visible():
                        btn.click(timeout=1500)
                        page.wait_for_timeout(30)
                except Exception:
                    pass  # 按钮点不到（被遮挡/已失效）不算页面缺陷，跳过
            page.wait_for_timeout(150)

            if errors:
                bad += 1
                print('FAIL ' + f.name)
                for e in errors[:6]:
                    print('   ' + e)
            else:
                print('ok   %s（按钮 %d 个）' % (f.name, total))
            page.close()
        browser.close()
    print('\n%d 个页面有报错' % bad if bad else '\n全部页面零报错')
    return 1 if bad else 0


if __name__ == '__main__':
    raise SystemExit(main())

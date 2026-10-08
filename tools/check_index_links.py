#!/usr/bin/env python3
"""核对首页每条工具条目的落点：点开后页面选中的工具（页签/勾选项）是否就是该条目。

首页入口现在写成 ./page.html#tab，页面由 app.js 的 T.firstTab 认领。映射写错、页面改了
页签名，都会让某条入口悄悄落回默认页签——肉眼看不出来，所以用无头 Chrome 逐条过一遍。

用法：
    python3 tools/check_index_links.py          # 全部条目
    python3 tools/check_index_links.py number   # 只看页面名含关键词的条目
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'
CHROME = '/usr/local/bin/chromium'

# 当前选中的工具：有页签看页签，没有页签的页面看它自己的单选/勾选状态
PROBE_TAB = "() => { var b = document.querySelector('#tabs button.on'); return b ? b.dataset.tab : null; }"
PROBE_CHECKSUM = """() => {
  var on = ['crc', 'sum', 'xor'].filter(function (k) {
    var e = document.querySelector('#chk-' + k);
    return e && e.checked;
  });
  return on.length === 1 ? on[0] : null;
}"""


def entries():
    idx = (DOCS / 'index.html').read_text(encoding='utf-8')
    return re.findall(
        r'<a class="item" href="\./([^"#]+\.html)(?:#([a-z0-9]+))?"[^>]*>.*?class="n">([^<]+)<',
        idx, re.S)


def main():
    keys = sys.argv[1:]
    items = [x for x in entries() if not keys or any(k in x[0] for k in keys)]
    bad = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME)
        for f, tab, name in items:
            # 每条开一个干净的页，避免上一条的状态影响下一条
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append('console: ' + m.text)
                    if m.type == 'error' else None)
            page.goto((DOCS / f).resolve().as_uri() + ('#' + tab if tab else ''))
            page.wait_for_timeout(150)
            actual = page.evaluate(PROBE_TAB)
            if actual is None:
                actual = page.evaluate(PROBE_CHECKSUM)
            page.close()

            if errors:
                bad.append((name, f, tab, 'JS 报错：' + errors[0][:90]))
            elif tab and actual != tab:
                bad.append((name, f, tab, '落到了 ' + str(actual)))

    print('%d 条入口，%d 条有问题' % (len(items), len(bad)))
    for name, f, want, got in bad:
        print('  %s（%s#%s）→ %s' % (name, f, want, got))
    return 1 if bad else 0


if __name__ == '__main__':
    raise SystemExit(main())

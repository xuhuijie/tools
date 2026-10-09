#!/usr/bin/env python3
"""把 docs/*.html 合成整站单文件 docs/index.html。

为什么需要：一个页面一个好分发，30 个页面就不好给了。把全部页面装进同一个文档，
跨页跳转变成文档内切 section，给出一个 html 就是给出全部工具，离线也整站可用。

形态：每个页面一个
    <section class="page" data-name="<文件名>.html" data-title="…" hidden> …该页正文… </section>
    <script data-page-init>…该页自己的脚本…</script>   ← 收在 section 里，首次切到时才执行
共用样式与 app.js 只出现一次（放文档顶层）。app.js 见到 main > section.page 就接管导航。

为什么页面脚本要延迟执行：各页共用同一套 id（tabs / input / output…），合到一份文档里
首屏会互相抢。app.js 的 $ 只在「当前活动页」里找，脚本等切到本页再跑，才各找各的。

各页 <header>（标题副标题）与 <footer>（返回首页）去掉，文档顶部有统一导航。
输出幂等：跑两遍一致；页数对不上就报错退出。
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
OUT = DOCS / 'index.html'
# 首页的可编辑源：docs/index.html 在磁盘上放的是本脚本的产物，拿不到散装首页
PLAIN_INDEX = DOCS / '_src' / 'index.html'

HEAD_RE = re.compile(r'<head>(.*?)</head>', re.S | re.I)
BODY_RE = re.compile(r'<body>(.*)</body>', re.S | re.I)
TITLE_RE = re.compile(r'<title>(.*?)</title>', re.S | re.I)
STYLE_RE = re.compile(r'<style>(.*?)</style>', re.S)
SCRIPT_RE = re.compile(r'<script>(.*?)</script>', re.S)

# app.js 是各页共用的工具层，单独提出来放文档顶层；其余页面脚本留在各自 section 里延迟跑
SHARED = 'app.js'


# 页内自带的 $ 定义（9 个页面各写一份），合到一份文档里会全站撞 id，必须改成按本页找。
OWN_DOLLAR_RE = re.compile(
    r'var\s+\$\s*=\s*function\s*\(\s*id\s*\)\s*\{\s*return\s+document\.getElementById\(id\);\s*\};')
SCOPED_DOLLAR = ('var $ = function (id) { return T.$(id); };'
                 '  // 多页合一文档里按当前页找，避免撞别页同名元素')


def scope_dollar(code: str) -> str:
    """把页内自带的 $ 换成走 T.$（T.$ 会先在本页 section 里找）。"""
    return OWN_DOLLAR_RE.sub(SCOPED_DOLLAR, code)


def guard_script(code: str, where: str) -> str:
    """页内脚本里若出现字面量 </script>，合成的 <script> 会被浏览器当场截断，整页 JS 全废。

    内联单文件（inline_pages.py）早就防了这一手，直接输出成品页时没人防：页面里的
    字符串一旦写成 '<script>…</script>'（web.js 的 XSS 演示模板就是一例），合成就把
    后面所有脚本都吃掉，首页成了没脚本的裸页。这里转义成 <\/script>，语义不变。
    """
    if '</script' in code:
        print('  %s：脚本里有字面量 </script>，已转义' % where)
        code = code.replace('</script', '<\\/script')
    return code


def split(name: str, text: str = None) -> dict:
    """把一份页面拆成 head 样式、正文、页内脚本。text 给源码，供首页用。"""
    if text is None:
        text = (DOCS / name).read_text(encoding='utf-8')
    head = HEAD_RE.search(text)
    body = BODY_RE.search(text)
    if not body:
        raise SystemExit('%s 没有 <body>' % name)
    t = TITLE_RE.search(head.group(1)) if head else None
    inner, own_scripts = body.group(1), []

    def pull(m):
        code = m.group(1)
        own_scripts.append(code.strip('\n'))
        return ''

    inner = SCRIPT_RE.sub(pull, inner)
    own_scripts = [guard_script(scope_dollar(c), name) for c in own_scripts]
    # 页头 / 页脚由文档统一处理
    inner = re.sub(r'<footer>.*?</footer>', '', inner, flags=re.S)
    inner = re.sub(r'<header>.*?</header>', '', inner, count=1, flags=re.S)
    styles = [m.group(1).strip('\n') for m in STYLE_RE.finditer(head.group(1) if head else '')]
    return {'name': name, 'title': (t.group(1).strip() if t else name),
            'body': inner.strip(), 'styles': styles, 'scripts': own_scripts}


def is_app_js(code: str) -> bool:
    """app.js 的特征：定义全局 T。"""
    return 'global.T = {' in code


def main() -> int:
    # 首页的散装形态只存在于 _src：docs/index.html 这个位置放的是本脚本上一轮的产物。
    plain = PLAIN_INDEX.read_text(encoding='utf-8')
    head = HEAD_RE.search(plain).group(1)
    viewport = next((m for m in re.findall(r'<meta[^>]*>', head) if 'viewport' in m), '')

    pages = [split('index.html', plain)]
    pages += [split(p.name) for p in sorted(DOCS.glob('*.html')) if p.name != OUT.name]
    pages.sort(key=lambda p: (p['name'] != 'index.html', p['name']))

    # app.js 的代码来自 _src 引用的 docs/app.js（已内联进各页，这里单独取原文）
    app_js = (DOCS / SHARED).read_text(encoding='utf-8').strip('\n')
    app_js = guard_script(app_js, SHARED)

    styles, first_page_scripts = [], []
    for p in pages:
        styles.extend(p['styles'])
        # 每页脚本数组里，app.js 只留一份；其余是本页专属
        p['scripts'] = [c for c in p['scripts'] if not is_app_js(c)]
    shared_css = (DOCS / 'app.css').read_text(encoding='utf-8').strip('\n')
    index_css = (DOCS / 'index.css').read_text(encoding='utf-8').strip('\n')

    secs = []
    for p in pages:
        secs.append('<section class="page" data-name="%s" data-title="%s" hidden>'
                    % (p['name'], p['title'].replace('"', '&quot;')))
        secs.append(p['body'])
        for code in p['scripts']:
            # type 用非 JS 值：浏览器不会在解析时执行，切到本页时由 app.js 取出改写成真脚本再跑
            secs.append('<script type="text/x-page-init">%s</script>' % code)
        secs.append('</section>\n')

    doc = ['<!DOCTYPE html>', '<html lang="zh-CN">', '<head>',
           '<meta charset="UTF-8">', viewport,
           '<meta name="theme-color" content="#1668dc">',
           '<title>工具合集</title>',
           '<link rel="icon" href="./favicon.svg" type="image/svg+xml">',
           '<link rel="apple-touch-icon" href="./apple-touch-icon.png">',
           '<style>\n%s\n\n%s\n\n%s\n</style>' % (shared_css, index_css, '\n\n'.join(styles)),
           '</head>', '<body>',
           '<nav id="site-nav"><a href="#" data-page="index.html">首页</a></nav>',
           '<main>'] + secs + ['</main>',
           '<script>\n%s\n</script>' % app_js,
           '</body>', '</html>', '']
    OUT.write_text('\n'.join(doc), encoding='utf-8')

    got = OUT.read_text(encoding='utf-8').count('<section class="page" data-name=')
    if got != len(pages):
        raise SystemExit('自检失败：section %d 个，页面 %d 个' % (got, len(pages)))

    # 自检：<script> 必须成对。少了就是某段 JS 里漏了字面量 </script>，合成页会当场截断，
    # 后面全部脚本不执行——首页只剩静态文字，浏览器再去要 favicon 就露在报错里。
    html = OUT.read_text(encoding='utf-8')
    n_open, n_close = 0, 0
    i = 0
    while True:
        i = html.find('<script', i)
        if i < 0:
            break
        n_open += 1
        i += 1
    n_close = html.count('</script')
    if n_open != n_close:
        raise SystemExit('自检失败：<script> %d 个，</script> %d 个，被截断了' % (n_open, n_close))

    print('wrote docs/index.html（%d 个页面，%.0f KB）' % (len(pages), OUT.stat().st_size / 1024))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

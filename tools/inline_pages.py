#!/usr/bin/env python3
"""把工具页的外链本地资源内联，产出「单文件」HTML。

为什么需要它：手机版 Edge 从「下载 / 文件管理器」打开 HTML 时，页面走的是 content:// URI，
浏览器会渲染主文档，却会拦掉 ./xx.css、./xx.js 这类相对子资源。结果就是静态样式全丢、脚本不跑，
只剩一坨裸文字——也就是「很多页面没有渲染」。而 flow.html 这类单文件页自带全部 <style>/<script>，
没有任何子资源可拦，所以照常显示。

做法：以 docs/_src/<page>.html 为可编辑源，遇到
  <link rel="stylesheet" href="./x.css">   → <style>…x.css…</style>
  <script src="./x.js"></script>            → <script>…x.js…</script>
按出现顺序原地替换，其它内容一字不动，输出到 docs/<page>.html。
引用路径都相对 docs/，因此 app.css、app.js、page.js、lib/*.js 都会被内联；
只要某个资源找不到就报错退出，绝不产出一个「半残」的页面。

改完页面重跑本脚本即可，输出幂等：跑两遍结果一致。
"""
import pathlib
import re
import sys

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'
SRC = DOCS / '_src'

LINK_RE = re.compile(r'[ \t]*<link\s+rel="stylesheet"\s+href="(\./[^"]+\.css)"\s*/?>')
SCRIPT_RE = re.compile(r'[ \t]*<script\s+src="(\./[^"]+\.js)"\s*></script>')


def read_asset(ref: str) -> str:
    # 资源仍放在 docs/ 下（app.css、app.js、各页 .js、lib/*.js），
    # 只有页面 HTML 挪到了 docs/_src/，所以 ./x 一律按 docs/ 解析。
    path = (DOCS / ref).resolve()
    if not path.is_file():
        raise SystemExit('找不到资源：%s（%s 里引用了它）' % (ref, path))
    return path.read_text(encoding='utf-8')


def bundle(text: str) -> str:
    def css(m):
        return '<style>\n' + read_asset(m.group(1)).rstrip('\n') + '\n</style>'

    def js(m):
        code = read_asset(m.group(1)).rstrip('\n')
        # 内联脚本里若出现字面量 </script>，浏览器会当场截断 <script>，后面的 JS 全废。
        # 转义成 <\/script>，语义不变（等价于 </script 字符串），但不再被解析成结束标签。
        code = code.replace("</script", "<\\/script")
        return '<script>\n' + code + '\n</script>'

    text = LINK_RE.sub(css, text)
    text = SCRIPT_RE.sub(js, text)
    return text


def main() -> int:
    srcs = sorted(SRC.glob('*.html'))
    if not srcs:
        raise SystemExit('docs/_src/ 下没有可打包的页面')

    for src in srcs:
        out = DOCS / src.name
        out.write_text(bundle(src.read_text(encoding='utf-8')), encoding='utf-8')
        kb = out.stat().st_size / 1024
        print('wrote docs/%s（%.0f KB）' % (src.name, kb))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

#!/usr/bin/env python3
"""渲染 docs/index.html：专项工具置顶，随后 142 个工具按分类全列在首页。

数据来源 tools/catalog.json（条目与说明）、tools/local_pages.json（条目 → 本地页）
与 tools/index_icons.py（图标与配色）。条目本身不带外链，点击即进本地实现页。

布局：手机单列，桌面按容器宽度自适应多列铺满；每条带图标与主题色。
改完映射重跑本脚本即可，输出幂等。
"""
import html
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
DOCS = HERE.parent / 'docs'
sys.path.insert(0, str(HERE))
import index_icons  # noqa: E402

CATEGORIES = [
    ('master', '站长工具', '域名解析、编码转换、HTTP 与网页相关'),
    ('code', '开发工具', '编码解码、加解密、校验和、格式化'),
    ('learn', '学习工具', '数学几何、单位换算、物理电子'),
    ('live', '生活工具', '健康体征、财税、日期时间'),
    ('other', '小工具', '随机生成、图片处理、趣味测试'),
]

PAGE_NAMES = {
    'base.html': '编码解码',
    'cipher.html': '古典密码',
    'hash.html': '哈希与摘要',
    'number.html': '数字与单位',
    'color.html': '颜色转换',
    'random.html': '随机生成',
    'net.html': '网络计算',
    'date.html': '日期与时间',
    'checksum.html': '校验和计算',
    'clock.html': '在线时钟',
    'geometry.html': '几何与电子计算',
    'dev.html': '开发工具',
    'finance.html': '财税与健康',
    'web.html': '网页与站长',
    'station2.html': '站点诊断',
    'text2.html': '文本处理',
    'game.html': '趣味测试',
    'codec.html': '二维码与条形码',
    'crypto.html': '流密码',
    'crypto2.html': '证书与密钥',
    'media.html': '图片与坐标',
    'life2.html': '日常计算',
    'health2.html': '健康与证件',
    'tax2.html': '税额计算',
    'holiday.html': '放假安排',
}

# 本仓库自有的专项工具，不在 142 条清单内；置顶展示
SPECIAL = [
    ('calibration.html', '电磁水表流量点校准', '按零点与误差百分比换算各流量点校正值', 'target'),
    ('gold.html', '黄金价格换算', '美元/盎司 ↔ 人民币/克 双向换算，附斐波那契回调价位', 'coin'),
    ('flow.html', '瞬时流量与流速换算', 'm³/h ↔ m/s 双向换算，按口径与有效内径占比折算', 'flow'),
    ('checksum.html', '校验和计算', 'CRC（60 种预设）/ 累加和 / 异或一次算全，给出校验字节', 'check'),
    ('md5.html', '文件 / 文本 MD5 校验', '文件分块流式计算不占内存，附 SHA 系列', 'hash'),
]


def esc(s):
    return html.escape(s, quote=True)


def icon_svg(key, cls='ico'):
    """按图标键输出 <svg><use></svg>。"""
    return '<svg class="%s" aria-hidden="true"><use href="#ic-%s"/></svg>' % (cls, key)


def item_html(href, name, sub, icon_key):
    """带图标的工具条目：左侧色块图标，右侧名称与副标题。"""
    color, soft = index_icons.color_of(icon_key)
    return (
        '<a class="item" href="./%s" data-page="%s" style="--ic:%s;--ic-bg:%s">'
        '<span class="thumb">%s</span>'
        '<span class="t"><span class="n">%s</span><span class="c">%s</span></span>'
        '</a>' % (esc(href), esc(href), color, soft, icon_svg(icon_key), esc(name), esc(sub))
    )


def main():
    catalog = json.loads((HERE / 'catalog.json').read_text(encoding='utf-8'))
    local = json.loads((HERE / 'local_pages.json').read_text(encoding='utf-8'))

    sections, navs = [], []
    total = 0
    for key, title, subtitle in CATEGORIES:
        items = catalog[key]
        total += len(items)
        rows = []
        pages = []
        for url, meta in items:
            page = local.get(url)
            if not page:
                raise SystemExit('条目缺少本地实现映射：' + url)
            if page not in pages:
                pages.append(page)
            rows.append(item_html(page, meta['name'], PAGE_NAMES[page], index_icons.icon_of(meta['name'])))
        navs.append(
            '<a class="nav" href="#cat-%s"><b>%s</b><span>%d 项 · %d 页</span></a>'
            % (key, esc(title), len(items), len(pages))
        )
        sections.append(
            '<section class="cat" id="cat-%s">\n'
            '  <div class="cat-hd">\n'
            '    <h2>%s <small>%d 项</small></h2>\n'
            '    <p>%s</p>\n'
            '  </div>\n'
            '  <div class="items">\n    %s\n  </div>\n'
            '</section>' % (key, esc(title), len(items), esc(subtitle), '\n    '.join(rows))
        )

    specials = '\n      '.join(
        item_html(page, name, desc, icon_key)
        for page, name, desc, icon_key in SPECIAL
    )

    page = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1668dc">
<title>计量计算工具</title>
<link rel="stylesheet" href="./index.css">
</head>
<body>
%s

<header>
  <div class="wrap">
    <h1>计量计算工具</h1>
    <p>%d 个工具全部本地实现，离线可用</p>
  </div>
</header>

<main>
  <section class="lead">
    <div class="stat"><b>%d</b><span>个工具</span></div>
    <div class="stat"><b>%d</b><span>个分类</span></div>
    <div class="stat"><b>%d</b><span>张页面</span></div>
  </section>

  <section class="cat" id="cat-special">
    <div class="cat-hd">
      <h2>专项工具 <small>%d 项</small></h2>
      <p>本仓库自有的计算页，不在这 142 项清单内</p>
    </div>
    <div class="items">
      %s
    </div>
  </section>

  <nav class="cats">
    %s
  </nav>

  <div class="search-row">
    <input id="q" type="search" placeholder="搜索工具名称或说明，如 编码 / 换算 / 二维码">
  </div>

  <p class="empty" id="empty" hidden>没有匹配的工具，换个关键词试试。</p>

  <div id="list">
%s
  </div>

  <footer>
    全部页面为浏览器端离线计算，打开 html 即可使用，不上传数据。
  </footer>
</main>

<script>
(function () {
  'use strict';
  var items = [].slice.call(document.querySelectorAll('.cat .item'));
  var cats = [].slice.call(document.querySelectorAll('.cat'));
  var q = document.getElementById('q');
  var empty = document.getElementById('empty');

  function apply() {
    var kw = q.value.trim().toLowerCase();
    var shown = 0;
    items.forEach(function (a) {
      var hit = !kw || a.textContent.toLowerCase().indexOf(kw) >= 0;
      a.hidden = !hit;
      if (hit) shown++;
    });
    cats.forEach(function (c) {
      c.hidden = !c.querySelector('.item:not([hidden])');
    });
    empty.hidden = shown > 0;
  }

  q.addEventListener('input', apply);
})();
</script>
</body>
</html>
''' % (index_icons.sprite(), total, total, len(CATEGORIES), len(PAGE_NAMES),
       len(SPECIAL), specials, '\n    '.join(navs), '\n'.join(sections))

    (DOCS / 'index.html').write_text(page, encoding='utf-8')
    print('wrote docs/index.html', len(page), 'bytes;', total, 'tools,',
          len(PAGE_NAMES), 'pages')


if __name__ == '__main__':
    main()

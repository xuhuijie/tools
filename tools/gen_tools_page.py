#!/usr/bin/env python3
"""把 catalog.json 与 local_pages.json 渲染成 docs/tools.html。

本地页映射见 local_pages.json：值为本地页文件名则表示该条目已在本仓库实现，
在目录里给出「本地」直达；未映射的条目只放 metools 官方入口。
"""
import html
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
DOCS = HERE.parent / 'docs'

CATEGORIES = [
    ('master', '站长工具', '域名、编码、HTTP 等建站运维相关'),
    ('code', '开发工具', '编码加密、校验和、格式化等开发相关'),
    ('learn', '学习工具', '数学、几何、单位换算等学习相关'),
    ('live', '生活工具', '健康、财税、时间等生活相关'),
    ('other', '小工具', '随机生成、图片、网络等杂项'),
]

# 本地实现页的展示名，与本地页 <h1> 对应
LOCAL_NAMES = {
    'base.html': '编码解码',
    'cipher.html': '古典密码',
    'hash.html': '哈希与校验和',
    'number.html': '数字与单位',
    'color.html': '颜色转换',
    'random.html': '随机生成',
    'net.html': '网络计算',
    'date.html': '日期与时间',
    'checksum.html': '校验和计算',
}


def items_for(cat_key, catalog, local):
    out = []
    for url, meta in catalog[cat_key]:
        page = local.get(url)
        out.append({
            'name': meta['name'],
            'desc': meta['desc'],
            'url': url,
            'page': page,
            'local_name': LOCAL_NAMES.get(page) if page else None,
        })
    return out


def esc(s):
    return html.escape(s, quote=True)


def render_section(cat_key, title, subtitle, items):
    local_count = sum(1 for i in items if i['page'])
    rows = []
    for it in items:
        badge = ''
        if it['page']:
            badge = '<span class="tag local">本地</span>'
        links = ''
        if it['page']:
            links += '<a class="btn local" href="./%s">用本地版</a>' % esc(it['page'])
        links += '<a class="btn" href="%s" target="_blank" rel="noopener noreferrer">官方入口</a>' % esc(it['url'])
        rows.append(
            '<li class="tool" data-page="%s">'
            '<div class="hd"><span class="name">%s</span>%s</div>'
            '<div class="desc">%s</div>'
            '<div class="links">%s</div>'
            '</li>' % (
                esc(it['page'] or ''), esc(it['name']), badge,
                esc(it['desc']), links,
            )
        )
    return (
        '<section class="cat" id="cat-%s" data-cat="%s">\n'
        '  <div class="cat-hd">\n'
        '    <h2>%s <small>%s</small></h2>\n'
        '    <p class="cat-sub">%s · 共 %d 个，其中 %d 个有本地实现</p>\n'
        '  </div>\n'
        '  <ul class="tools">\n%s\n  </ul>\n'
        '</section>'
    ) % (cat_key, cat_key, esc(title), esc(cat_key), esc(subtitle),
         len(items), local_count, '\n'.join(rows))


def main():
    catalog = json.loads((HERE / 'catalog.json').read_text(encoding='utf-8'))
    local = json.loads((HERE / 'local_pages.json').read_text(encoding='utf-8'))

    sections = []
    total = 0
    total_local = 0
    tabs = []
    for key, title, subtitle in CATEGORIES:
        items = items_for(key, catalog, local)
        total += len(items)
        total_local += sum(1 for i in items if i['page'])
        sections.append(render_section(key, title, subtitle, items))
        tabs.append('<button data-cat="%s">%s <small>%d</small></button>' % (
            key, esc(title), len(items)))

    body = '''
  <section class="intro">
    <div class="stat">
      <div><b>%d</b><span>收录工具</span></div>
      <div><b>%d</b><span>本地可离线用</span></div>
      <div><b>%d</b><span>分类</span></div>
    </div>
    <p class="hint">
      目录整理自 <a href="https://www.metools.info/" target="_blank" rel="noopener noreferrer">metools.info</a>，共 %d 个工具。
      标「本地」的条目本仓库已实现，断网也能用，且结果附计算过程；其余条目给出官方入口链接。
      本地页与 metools 的计算口径若有差异，以本地页说明为准。
    </p>
  </section>

  <div class="tabs" id="cat-tabs">
    <button data-cat="all" class="on">全部 <small>%d</small></button>
    %s
  </div>

  <div class="row search">
    <input id="q" type="search" placeholder="按名称或说明搜索，如 编码 / 换算 / 二维码">
  </div>

  <div class="tabs" id="filter-tabs">
    <button data-filter="all" class="on">全部条目</button>
    <button data-filter="local">仅本地实现</button>
  </div>

  <div id="list">
%s
  </div>

  <p class="empty" id="empty" hidden>没有匹配的条目，换个关键词试试。</p>
''' % (total, total_local, len(CATEGORIES), total, total, '\n    '.join(tabs), '\n'.join(sections))

    page = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#1668dc">
<title>工具目录 · 计量计算工具</title>
<link rel="stylesheet" href="./app.css">
<style>
  .stat{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border-radius:var(--radius);overflow:hidden;margin-bottom:12px}
  .stat div{background:#fff;padding:14px 12px;text-align:center}
  .stat b{display:block;font-size:24px;font-weight:700;color:var(--primary)}
  .stat span{display:block;font-size:12px;color:var(--sub);margin-top:2px}
  .intro{background:#fff;border-radius:var(--radius);padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  .intro .hint{margin:0}
  .intro a{color:var(--primary)}
  .search input{height:44px;background:#fff}
  .cat{margin-bottom:20px}
  .cat[hidden]{display:none}
  .cat-hd{margin:0 2px 10px}
  .cat-hd h2{margin:0;font-size:16px;font-weight:600;display:flex;align-items:baseline;gap:8px}
  .cat-hd h2 small{font-size:11px;font-weight:400;color:var(--sub);background:var(--soft);border-radius:6px;padding:2px 6px}
  .cat-sub{margin:4px 0 0;font-size:12px;color:var(--sub)}
  .tools{list-style:none;margin:0;padding:0}
  .tool{background:#fff;border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
  .tool[hidden]{display:none}
  .tool .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .tool .name{font-size:15px;font-weight:600}
  .tag{font-size:11px;border-radius:6px;padding:2px 6px;background:#e6f7f1;color:var(--ok);border:1px solid #b7e6d8}
  .tool .desc{font-size:12px;color:var(--sub);line-height:1.5;margin-top:5px}
  .tool .links{display:flex;gap:8px;margin-top:10px}
  .btn{
    display:inline-flex;align-items:center;justify-content:center;
    height:32px;padding:0 12px;border-radius:9px;font-size:13px;
    text-decoration:none;color:var(--text);background:#f7f8fa;border:1px solid var(--line);
  }
  .btn.local{background:var(--primary);color:#fff;border-color:var(--primary)}
  .tabs button small{opacity:.65;font-size:11px}
  .empty{font-size:13px;color:var(--sub);text-align:center;padding:24px 0}
</style>
</head>
<body>
<header>
  <h1>工具目录</h1>
  <p>metools.info 全站工具清单 · 标注本地实现</p>
</header>

<main>
%s
  <footer>
    <a href="./index.html">← 工具入口</a>
  </footer>
</main>

<script>
(function(){
  'use strict';
  var cats = [].slice.call(document.querySelectorAll('.cat'));
  var tools = [].slice.call(document.querySelectorAll('.tool'));
  var q = document.getElementById('q');
  var empty = document.getElementById('empty');
  var cat = 'all', filter = 'all';

  function apply(){
    var kw = q.value.trim().toLowerCase();
    var shown = 0;
    tools.forEach(function(t){
      var inCat = cat === 'all' || t.closest('.cat').dataset.cat === cat;
      var isLocal = !!t.dataset.page;
      var inFilter = filter === 'all' || isLocal;
      var text = t.textContent.toLowerCase();
      var inKw = !kw || text.indexOf(kw) >= 0;
      var show = inCat && inFilter && inKw;
      t.hidden = !show;
      if (show) shown++;
    });
    // 分类标题下没有可见条目时整段隐藏，避免留空壳
    cats.forEach(function(c){
      var has = [].slice.call(c.querySelectorAll('.tool')).some(function(t){ return !t.hidden; });
      c.hidden = !has;
    });
    empty.hidden = shown > 0;
  }

  function bindTabs(id, key, onPick){
    var box = document.getElementById(id);
    var btns = [].slice.call(box.querySelectorAll('button'));
    btns.forEach(function(b){
      b.addEventListener('click', function(){
        btns.forEach(function(o){ o.classList.toggle('on', o === b); });
        onPick(b.dataset[key]);
      });
    });
  }

  bindTabs('cat-tabs', 'cat', function(v){ cat = v; apply(); });
  bindTabs('filter-tabs', 'filter', function(v){ filter = v; apply(); });
  q.addEventListener('input', apply);
})();
</script>
</body>
</html>
''' % body

    (DOCS / 'tools.html').write_text(page, encoding='utf-8')
    print('wrote docs/tools.html', len(page), 'bytes;', total, 'tools,', total_local, 'local')


if __name__ == '__main__':
    main()

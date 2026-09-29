#!/usr/bin/env python3
"""从 metools 抓取的工具清单生成 docs/tools.html 的目录数据。

清单是一次性抓取的结果，落地为 catalog.json，避免运行时依赖外部站点。
改本地实现映射时只改 LOCAL_PAGES，重跑本脚本即可。
"""
import html
import json
import pathlib
import re
import urllib.request

SITE = 'https://www.metools.info'
CATEGORIES = [
    ('master', '站长工具', '域名、编码、HTTP 等建站运维相关'),
    ('code', '开发工具', '编码加密、校验和、格式化等开发相关'),
    ('learn', '学习工具', '数学、几何、单位换算等学习相关'),
    ('live', '生活工具', '健康、财税、时间等生活相关'),
    ('other', '小工具', '随机生成、图片、网络等杂项'),
]
# 分类页路径：带斜杠的是分类首页
PAGES = ['/'] + ['/%s/' % c for c, _, _ in CATEGORIES]

ITEM_RE = re.compile(
    r'<a class="item-title" href="([^"]+)"[^>]*>(.*?)</a>.*?'
    r'<div class="item-desc">(.*?)</div>', re.S)


def strip_tags(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


def fetch(path):
    req = urllib.request.Request(SITE + path, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'ignore')


def collect():
    tools = {}
    for path in PAGES:
        page = fetch(path)
        for url, title, desc in ITEM_RE.findall(page):
            tools[url] = {'name': strip_tags(title), 'desc': strip_tags(desc)}
    return tools


if __name__ == '__main__':
    here = pathlib.Path(__file__).parent
    data = collect()
    out = {}
    for key, *_ in CATEGORIES:
        items = {u: v for u, v in data.items() if '/%s/' % key in u}
        out[key] = sorted(items.items(), key=lambda kv: -int(re.search(r'(\d+)', kv[0]).group(1)))
    (here / 'catalog.json').write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(sum(len(v) for v in out.values()), 'tools')

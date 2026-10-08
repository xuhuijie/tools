#!/usr/bin/env python3
"""渲染 docs/index.html：搜索栏下方为专项工具，随后全部工具按分类铺在首页。

数据来源 tools/catalog.json（条目与说明）、tools/local_pages.json（条目 → 本地页）
与 tools/index_icons.py（图标与配色）。条目本身不带外链，点击即进本地实现页。

搜索按「单条工具」粒度匹配：命中即只显示命中的那条，不再连带整类。
布局：手机单列，桌面按容器宽度自适应多列铺满；每条带图标与主题色。
改完映射重跑本脚本即可，输出幂等。
"""
import html
import json
import pathlib
import re
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

# 本仓库自有的专项工具，不属清单内条目；单独一组，排在搜索栏下方
# 清单里有几条是同一个功能的多个入口，重复铺在首页只会让人多点一次。
# 这里按「同一页面 + 同一功能」把冗余入口去掉，键为保留的条目，值为被去掉的条目。
# 只删重复入口，页面能力一项没少。
DUP_ENTRIES = {
    # 隐私类：密码生成 / 随机密码 是同一件事
    '随机密码生成器_生成随机密码': ['密码生成器_在线密码生成'],
    # 舒尔特方格同一游戏两个页面
    '舒尔特方格在线测试游戏': ['舒尔特方格训练免费网页版'],
    # 反应速度测试同一测法两个页面
    '反应速度测试_测试反应速度': ['反应速度测试的网站'],
    # 个税：月工资 / 年报口径，两份「个人所得税计算器」保留一条
    '个人所得税计算器': ['个人所得税计算器在线'],
    # 延迟退休：2025 与 2024 两版表，保留信息更全的一条
    '退休年龄计算器': ['延迟退休计算器2024'],
    # 退休金与养老金是同一测算（账户总额 + 缴费年限 + 社平工资）
    '退休金计算器': ['养老金计算器'],
    # 短链：两条都是 Twitter 短链服务
    '在线短网址生成_短网址在线生成': ['短链接生成器'],
    # 正则函数：arctan 同一函数两个页面
    '反正切函数计算器_反正切函数计算器在线': ['arctan计算器在线'],
    # JWT 解析同一功能两个页面
    'JWT解密解码': ['jwt在线解析'],
    # DNS：六大运营商各一条，能力等价
    'DNS查询/DNS解析': ['教育网DNS', '联通DNS', '移动DNS', '电信DNS', '公共DNS'],
    # 条码：UPC 是 EAN-13 的子集，同一生成器覆盖
    '条形码生成器': ['UPC条形码生成器'],
    # 敏感的：抖音 / 小红书 / 通用 三套词库同一检测器
    '敏感词检测_在线敏感词检测': ['抖音敏感词', '小红书敏感词'],
    # URL 编解码：URL编码 / Url解码 与 UrlEncode编码解码 同页同功能
    'URL编码': ['Url解码', 'UrlEncode编码解码'],
    # Base 系列：编 / 解同一页
    'Base64编码': ['Base64解码'],
    # 正切 / 正弦 / 反正切同页三角计算
    '正弦计算器': ['tan角度计算器_tan计算器'],
    # 面积体积同一组公式
    '正方形面积公式计算器_矩形面积公式计算器': ['平行四边形面积公式计算器'],
    # 经纬度拾取与转换同一坐标系工具
    '经纬度拾取_高德经纬度拾取': ['经纬度转换度分秒_度分秒转换经纬度'],
    # 图片压缩与水印同页同一处理链
    '图片压缩_压缩图片在线工具': ['图片加水印_图片加水印在线'],
    # HTTP 状态：状态码速查与状态查询同页
    'HTTP状态码': ['在线HTTP状态查询'],
}


# 少数页面没有页签按钮，靠勾选框/分段器切工具，可用的 hash 单独列出
HASH_TABS = {
    'checksum.html': {'crc', 'sum', 'xor'},
}


def page_tabs(page):
    """返回页面能认的 hash 目标：有页签按钮的取 data-tab，没有的查 HASH_TABS。"""
    if page in HASH_TABS:
        return HASH_TABS[page]
    src = (DOCS / page).read_text(encoding='utf-8')
    box = re.search(r'<div class="tabs" id="tabs">(.*?)</div>', src, re.S)
    if not box:
        return set()
    return set(re.findall(r'data-tab="([a-z0-9]+)"', box.group(1)))


def check_entry_tabs(catalog, local):
    """每条映射都必须指向该页面真实存在的页签，否则首页会跳到一个不存在的锚点。

    清单改名、页面加/删页签都可能让映射失配，跑脚本时直接报错，比线上点了才发现强。
    """
    seen = set()
    for items in catalog.values():
        for url, meta in items:
            name = meta['name']
            if name not in ENTRY_TABS:
                continue
            seen.add(name)
            page = local.get(url)
            tab = ENTRY_TABS[name]
            if tab not in page_tabs(page):
                raise SystemExit(
                    '%s → %s#%s：%s 里没有这个页签' % (name, page, tab, page))
    unused = set(ENTRY_TABS) - seen
    if unused:
        raise SystemExit('映射里的条目已不在清单：' + '、'.join(sorted(unused)))


def collapse(catalog):
    """去掉 DUP_ENTRIES 里的重复入口，返回（新清单, 被去掉的条数）。"""
    dropped = 0
    names = {}  # 名称 → URL，按名称定位，清单改名也不至于失配
    for items in catalog.values():
        for url, meta in items:
            names.setdefault(meta['name'], url)
    kill = set()
    for keep, dups in DUP_ENTRIES.items():
        if keep not in names:
            raise SystemExit('去重规则指向的条目不在清单里：' + keep)
        for d in dups:
            if d not in names:
                raise SystemExit('去重规则指向的条目不在清单里：' + d)
            kill.add(names[d])
            dropped += 1
    out = {k: [(u, m) for u, m in v if u not in kill] for k, v in catalog.items()}
    return out, dropped


SPECIAL = [
    ('calibration.html', '电磁水表流量点校准', '按零点与误差百分比换算各流量点校正值', 'target'),
    ('gold.html', '黄金价格换算', '美元/盎司 ↔ 人民币/克 双向换算，附斐波那契回调价位', 'coin'),
    ('flow.html', '瞬时流量与流速换算', 'm³/h ↔ m/s 双向换算，按口径与有效内径占比折算', 'flow'),
]

# 清单条目 → 目标页面里的页签（data-tab）。
# 同一张页面装了多个工具，条目不带页签就永远落回页面默认页签——比如「整除计算器」
# 和「整除数计算器」都指向 number.html，点开都停在「金额大写」，看着像同一个工具。
# 这里把每条入口钉到它自己的页签上，首页跳转即 page.html#tab，由 app.js 的 T.firstTab 认领。
# 键为清单条目名，值为 data-tab；页面内部没有页签的功能（放假安排等）不列，用页面默认。
ENTRY_TABS = {
    '在线查看网页源代码': 'source',
    'HTTP状态码': 'http',
    'URL编码': 'url',
    '同义词转换器': 'syn',
    '在线Markdown编辑器': 'markdown',
    '在线网页HTML编辑器': 'html',
    '网页自动刷新_在线网址定时刷新工具': 'refresh',
    '在线短网址生成_短网址在线生成': 'short',
    '在线uuencode编码解码': 'unicode',
    'Punycode编码_Punycode转换_中文域名转码': 'punycode',
    'UserAgent分析，UA查询、检测': 'ua',
    'Escape加密/UnEscape解密工具': 'hex',
    '在线端口扫描工具': 'port',
    '敏感词检测_在线敏感词检测': 'sens',
    'robots文件生成': 'robots',
    '网站备案查询': 'icp',
    'DNS查询/DNS解析': 'dns',
    'Base64编码': 'base64',
    'Base62编码': 'base58',
    'Base58编码解码': 'base58',
    'Base32解码': 'base32',
    'ROT13加密解密': 'rot13',
    'adler32校验和计算器': 'adler',
    'BCC异或校验和工具': 'xor',
    'HMAC在线计算工具': 'hmac',
    '在线格式化JSON_生成格式化JSON工具': 'json',
    'SSL证书校验_证书文件校验在线': 'ssl',
    '在线https私有证书生成颁发工具': 'ca',
    'JWT解密解码': 'jwt',
    'jwt签名验证': 'jwt',
    'jwt在线生成': 'jwt',
    '在线时间戳转换工具_时间戳转换': 'ts',
    '在线文本对比_代码对比工具': 'diff',
    'SQL在线格式化工具': 'sql',
    '培根密码解密加密': 'bacon',
    '栅栏密码解密【基础型】': 'fence',
    '在线Rabbit加密解密': 'rabbit',
    '累加和在线计算': 'sum',
    '在线RSA公私钥生成': 'rsa',
    'CRC32在线校验工具': 'crc',
    '维吉尼亚密码翻译器': 'vigenere',
    '凯撒密码转换器': 'caesar',
    '摩尔斯电码转换器': 'morse',
    '在线RC4加密解密': 'rc4',
    '整除计算器': 'divide',
    '经纬度拾取_高德经纬度拾取': 'gps',
    '等差数列求和公式计算器': 'series',
    '等比数列求和公式计算器': 'series',
    '字节数统计在线计算工具': 'bytes',
    '正方体表面积公式计算器': 'solid',
    '正方形面积公式计算器_矩形面积公式计算器': 'plane',
    '梯形周长公式计算器': 'plane',
    '在线文字排版_文本排版工具': 'tidy',
    '圆柱体表面积公式计算器': 'solid',
    '存储单位换算': 'storage',
    'log计算器_log在线计算器': 'log',
    '圆锥表面积公式计算': 'solid',
    '长方体表面积公式计算器': 'solid',
    '正弦计算器': 'trig',
    '并联电阻分流计算': 'res',
    '电阻分压计算器_电阻分压计算公式': 'res',
    '串联电阻计算器': 'res',
    '电阻并联计算器_并联电阻计算器': 'res',
    '反正切函数计算器_反正切函数计算器在线': 'trig',
    '舒尔特方格在线测试游戏': 'schulte',
    '大写转换器': 'daxie',
    '在线数独': 'sdk',
    'N次方计算器': 'power',
    '整除数计算器': 'divisor',
    '开平方根计算器': 'power',
    'log2为底计算器': 'log',
    '个人所得税计算器': 'salary',
    '年终奖计算器_年终奖个税计算器': 'bonus',
    '在线尺子测量工具': 'ruler',
    '在线毫秒时钟显示': 'clock',
    '胎儿体重计算器在线': 'preg',
    '身份证号提取年龄': 'card',
    '预产期计算器在线计算': 'preg',
    '10万国债一年多少利息_国债收益率计算': 'bond',
    '内衣尺码表_内衣尺码对照表': 'bmi',
    'egfr计算器_egfr计算公式': 'egfr',
    '百家姓排名_百家姓': 'name',
    '体脂率在线计算器': 'bmi',
    '基础代谢率计算器': 'bmr',
    '年龄计算器在线计算': 'age',
    '退休倒计时计算器': 'retire',
    '时间间隔计算器': 'diff',
    '退休年龄计算器': 'retire',
    '油耗计算器': 'fuel',
    '劳务报酬所得税计算器': 'labor',
    '税额计算器': 'all',
    '退休金计算器': 'pension',
    '个税专项扣除计算器': 'salary',
    'BMI计算器公式': 'bmi',
    '文件md5计算': 'md5',
    '数字小游戏': 'guess',
    '图片压缩_压缩图片在线工具': 'zip',
    '在线学生随机点名器': 'roll',
    '二维码识别_二维码在线识别': 'qrread',
    '随机密码生成器_生成随机密码': 'pass',
    '在线秒表毫秒计时器': 'stopwatch',
    '反应速度测试_测试反应速度': 'reaction',
    '随机数生成器在线版': 'num',
    'CPS测试手速测试': 'cps',
    '钢管重量计算器_计算公式': 'steel',
    '计数器在线': 'count',
    '种子转磁力': 'magnet',
    '今天是第几周_今天第几周': 'week',
    '子网掩码计算器': 'subnet',
    '在线秒表': 'stopwatch',
    '二维码生成器': 'qr',
    '条形码生成器': 'bar',
    '在线MAC地址生成器': 'mac',
}

# 首页条目与页面页签对不上时用来兜底：单页单工具，整页就是这一项
CHECKSUM_TABS = ('crc', 'sum', 'xor', 'md5')

# 已删除与清单内条目重复的专项页入口：
#  - checksum.html（校验和计算）与 CRC32 / adler32 / BCC 异或 重复
#  - md5.html（文件 / 文本 MD5 校验）与「文件md5计算」重复
# 两个页面文件保留，仍可从 hash.html 与 checksum.html 互链进入


def esc(s):
    return html.escape(s, quote=True)


def icon_svg(key, cls='ico'):
    """按图标键输出 <svg><use></svg>。"""
    return '<svg class="%s" aria-hidden="true"><use href="#ic-%s"/></svg>' % (cls, key)


def item_html(href, name, sub, icon_key, tab=None):
    """带图标的工具条目：左侧色块图标，右侧名称与副标题。

    带 tab 时链接写成 ./page.html#tab，点开直达该条工具自己的页签。
    """
    color, soft = index_icons.color_of(icon_key)
    url = href + ('#' + tab if tab else '')
    return (
        '<a class="item" href="./%s" data-page="%s" style="--ic:%s;--ic-bg:%s">'
        '<span class="thumb">%s</span>'
        '<span class="t"><span class="n">%s</span><span class="c">%s</span></span>'
        '</a>' % (esc(url), esc(href), color, soft, icon_svg(icon_key), esc(name), esc(sub))
    )


def main():
    catalog = json.loads((HERE / 'catalog.json').read_text(encoding='utf-8'))
    local = json.loads((HERE / 'local_pages.json').read_text(encoding='utf-8'))
    catalog, dropped = collapse(catalog)
    check_entry_tabs(catalog, local)

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
            rows.append(item_html(page, meta['name'], PAGE_NAMES[page], index_icons.icon_of(meta['name']), ENTRY_TABS.get(meta['name'])))
        navs.append(
            '<a class="nav" href="#cat-%s"><b>%s</b><span>%d 项</span></a>'
            % (key, esc(title), len(items))
        )
        sections.append(
            '<section class="cat" id="cat-%s">\n'
            '  <div class="cat-hd">\n'
            '    <h2>%s <small>%d 项</small></h2>\n'
            '    <p>%s</p>\n'
            '  </div>\n'
            '  <div class="items">\n    %s\n  </div>\n'
            '</section>' % (key, esc(title), len(items),
                            esc(subtitle), '\n    '.join(rows))
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
<title>工具合集</title>
<link rel="stylesheet" href="./index.css">
</head>
<body>
%s

<header>
  <div class="wrap">
    <h1>工具合集</h1>
    <p>共 %d 个工具，按分类铺开，搜索直达单项</p>
  </div>
</header>

<main>
  <div class="search-row">
    <input id="q" type="search" placeholder="搜索工具，如 编码 / 二维码 / 面积">
  </div>

  <p class="empty" id="empty" hidden>没有匹配的工具，换个关键词试试。</p>

  <section class="cat" id="cat-special">
    <div class="cat-hd">
      <h2>专项工具 <small>%d 项</small></h2>
    </div>
    <div class="items">
      %s
    </div>
  </section>

  <nav class="cats">
    %s
  </nav>

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
  var items = [].slice.call(document.querySelectorAll('.item'));
  var groups = [].slice.call(document.querySelectorAll('.cat, .cats'));
  var q = document.getElementById('q');
  var empty = document.getElementById('empty');

  function apply() {
    var kw = q.value.trim().toLowerCase();
    var hits = 0;
    items.forEach(function (a) {
      // 只按本条目自己的文字判定，命中即单独显示这一条
      var hit = !kw || a.textContent.toLowerCase().indexOf(kw) >= 0;
      a.hidden = !hit;
      if (hit) hits++;
    });
    // 搜索时收起分类导航与未命中的分类，只留命中的条目本身
    groups.forEach(function (g) {
      if (g.classList.contains('cats')) {
        g.hidden = !!kw;
      } else {
        g.hidden = !g.querySelector('.item:not([hidden])');
      }
    });
    empty.hidden = hits > 0;
  }

  q.addEventListener('input', apply);
})();
</script>
</body>
</html>
''' % (index_icons.sprite(), total, len(SPECIAL), specials, '\n    '.join(navs), '\n'.join(sections))

    (DOCS / 'index.html').write_text(page, encoding='utf-8')
    print('wrote docs/index.html', len(page), 'bytes;', total, 'tools（去重 %d 条）,' %
          dropped, len(PAGE_NAMES), 'pages')


if __name__ == '__main__':
    main()

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
    ('master', '站长工具', '域名解析、HTTP 与网页、站点诊断'),
    ('code', '开发工具', '编码解码、加解密、校验和、格式化'),
    ('learn', '学习工具', '数学几何、单位换算、物理电子、文本处理'),
    ('live', '生活工具', '健康体征、财税、日期时间、图片与坐标'),
    ('other', '小工具', '随机生成、图片处理、趣味测试'),
]

# 分类导航胶囊的图标：按分类语义挑一个，跟条目的图标集同一套
CAT_ICONS = {
    'master': 'browser',
    'code': 'code',
    'learn': 'graph',
    'live': 'heart',
    'other': 'dice',
}

# 每条工具的副标题：一句话说清「它是干什么的」，写死在这里而不是抓清单描述。
# 清单描述是给搜索引擎看的（「在线XX工具，可对...」），句长、重复名称，铺在首页等于没写。
ENTRY_SUBS = json.loads((HERE / 'entry_subs.json').read_text(encoding='utf-8'))


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


# 清单里的条目名带「站长 / 网页」字样，但功能其实属于别的分类，一直挂在站长工具下：
#  - 同义词转换器、敏感词检测：文本处理，与「文本处理」页里的排版 / 大小写 / 去重是一组
#  - 在线文字排版：同上
#  - 经纬度拾取、在线尺子：图片与坐标
# 值写分类键，条目搬到该分类末尾；分类键写错或条目已不在清单里会直接报错。
CAT_MOVES = {
    '同义词转换器': 'learn',
    '敏感词检测_在线敏感词检测': 'learn',
    '在线文字排版_文本排版工具': 'learn',
    '经纬度拾取_高德经纬度拾取': 'live',
    '在线尺子测量工具': 'live',
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


def check_search_alias(catalog):
    """搜索别名表的键必须都能在清单里找到，否则清单改名后会静默失效。"""
    names = set()
    for items in catalog.values():
        for url, meta in items:
            names.add(meta['name'])
    for name in SEARCH_ALIAS:
        if name not in names and name not in {t[1] for t in SPECIAL}:
            raise SystemExit('搜索别名指向的条目已不在清单：' + name)


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


def check_entry_subs(catalog):
    """每条工具的副标题都必须写过，否则首页会显示成页面名（「编码解码」），等于没说。

    清单里改名、去重后新留下的条目，都会在这里当场露出来，不会悄悄退回兜底文案。
    """
    missing = [m['name'] for items in catalog.values() for _, m in items
               if m['name'] not in ENTRY_SUBS and m['name'] not in {t[1] for t in SPECIAL}]
    if missing:
        raise SystemExit('这些条目还没有副标题（补进 entry_subs.json）：' + '、'.join(missing))
    stale = [n for n in ENTRY_SUBS
             if n not in {m['name'] for items in catalog.values() for _, m in items}
             and n not in {t[1] for t in SPECIAL}]
    if stale:
        raise SystemExit('副标题表里的条目已不在首页：' + '、'.join(stale))


def move_entries(catalog):
    """把 CAT_MOVES 里的条目搬到目标分类，返回（新清单, 搬动条数）。

    不搬的话它们会一直挂在原分类里——分类是抓清单时定的，
    但「这个功能算哪一类」是人的判断，改清单不如在这里显式写一笔。
    """
    names = {}
    for key, items in catalog.items():
        for url, meta in items:
            names.setdefault(meta['name'], (key, url))
    moved = 0
    for name, dest in CAT_MOVES.items():
        if dest not in catalog:
            raise SystemExit('分类重排指向了不存在的分类：' + dest)
        if name not in names:
            raise SystemExit('分类重排指向的条目已不在清单：' + name)
        src, url = names[name]
        if src == dest:
            continue
        catalog[dest].append((url, dict(names_url_meta(catalog, src, url))))
        catalog[src] = [(u, m) for u, m in catalog[src] if u != url]
        moved += 1
    return catalog, moved


def names_url_meta(catalog, key, url):
    """取回某条目在原分类里的描述文本。"""
    for u, m in catalog[key]:
        if u == url:
            return m
    raise SystemExit('找不到条目：' + url)


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


# 清单条目名与页面生成的条目名对不上，或多半没人照全名搜时，补一组搜索别名。
# 站长工具下的 18 条是抓清单时定名的，长这样：「敏感词检测_在线敏感词检测」「UserAgent分析，UA查询、检测」，
# 简称覆盖率比开发 / 学习 / 生活几类低，搜「敏感」得先想到后半截「敏感词检测」。
# 这里给每条补上人真正会敲的词，搜索按「别名 + 副标题 + 名称」匹配，任意命中即显示。
SEARCH_ALIAS = {
    '在线查看网页源代码': '源码 源代码 网页源码 查看源码 view source',
    'HTTP状态码': 'http 状态码 状态码查询 404 500',
    'URL编码': 'url url编码 url解码 urlencode urldecode 转义',
    '同义词转换器': '同义词 近义词 替换 伪原创',
    '在线Markdown编辑器': 'markdown md 编辑器 预览',
    '在线网页HTML编辑器': 'html 网页编辑 富文本 可视化编辑',
    '在线网页颜色取色器': '颜色 取色器 色板 色值 调色',
    '网页自动刷新_在线网址定时刷新工具': '刷新 定时刷新 自动刷新 网页刷新',
    '在线短网址生成_短网址在线生成': '短链 短网址 短url 压缩链接',
    '在线uuencode编码解码': 'uuencode uudecode 编码 解码',
    'Punycode编码_Punycode转换_中文域名转码': 'punycode 中文域名 域名转码',
    'UserAgent分析，UA查询、检测': 'ua useragent 浏览器标识 设备识别',
    'Escape加密/UnEscape解密工具': 'escape unescape 转义 unicode转义',
    '在线端口扫描工具': '端口 端口扫描 开放端口 端口检测',
    '敏感词检测_在线敏感词检测': '敏感 敏感词 违禁词 敏感词检测',
    'robots文件生成': 'robots robots.txt 爬虫协议',
    '网站备案查询': '备案 icp 备案号 备案查询',
    'DNS查询/DNS解析': 'dns 域名解析 解析 ip查询 域名查询',
    'Base64编码': 'base64 base 编码 解码',
    'Base62编码': 'base62 base 编码',
    'Base58编码解码': 'base58 base 编码 解码',
    'Base32解码': 'base32 base 编码 解码',
    'ROT13加密解密': 'rot13 rot 凯撒 位移',
    'adler32校验和计算器': 'adler32 adler 校验和 checksum',
    'BCC异或校验和工具': 'bcc 异或 xor 校验和',
    'HMAC在线计算工具': 'hmac 签名 消息认证',
    '在线格式化JSON_生成格式化JSON工具': 'json 格式化 校验 压缩',
    'SSL证书校验_证书文件校验在线': 'ssl 证书 证书解析 证书校验 https',
    '在线https私有证书生成颁发工具': 'ca 证书 自签 签发 私有证书 https',
    'JWT解密解码': 'jwt token 解析 解码',
    'jwt签名验证': 'jwt 签名 验签 校验',
    'jwt在线生成': 'jwt 生成 token 签发',
    'RGB颜色转换_RGB颜色转换器': 'rgb hex 颜色 色值 转换',
    '在线时间戳转换工具_时间戳转换': '时间戳 unix timestamp 转换 毫秒',
    '在线文本对比_代码对比工具': '对比 diff 文本对比 差异 代码对比',
    'SQL在线格式化工具': 'sql 格式化 美化 压缩',
    '培根密码解密加密': '培根 bacon 密码 加密',
    '栅栏密码解密【基础型】': '栅栏 fence 密码 加密',
    '在线Rabbit加密解密': 'rabbit 流密码 加密 解密',
    '累加和在线计算': '累加和 求和 checksum 校验',
    '在线RSA公私钥生成': 'rsa 公钥 私钥 密钥',
    'CRC32在线校验工具': 'crc crc32 校验 crc16',
    '维吉尼亚密码翻译器': '维吉尼亚 vigenere 密码 加密',
    '凯撒密码转换器': '凯撒 caesar 密码 位移',
    '摩尔斯电码转换器': '摩尔斯 摩斯 morse 电码',
    '在线RC4加密解密': 'rc4 流密码 加密 解密',
    '整除计算器': '整除 除法 商 余数',
    '等差数列求和公式计算器': '等差 数列 求和 数列求和',
    '等比数列求和公式计算器': '等比 数列 求和 数列求和',
    '字节数统计在线计算工具': '字节 字数 byte 大小统计',
    '正方体表面积公式计算器': '正方体 表面积 立方体',
    '正方形面积公式计算器_矩形面积公式计算器': '面积 正方形 矩形 长方形 平行四边形',
    '梯形周长公式计算器': '梯形 周长 面积',
    '圆柱体表面积公式计算器': '圆柱 表面积 圆柱体',
    '存储单位换算': '存储 单位换算 kb mb gb tb',
    'log计算器_log在线计算器': 'log 对数 log2 lg',
    '圆锥表面积公式计算': '圆锥 表面积 圆锥体',
    '长方体表面积公式计算器': '长方体 表面积',
    '正弦计算器': '正弦 正切 三角 sin cos tan',
    '并联电阻分流计算': '电阻 并联 分流',
    '电阻分压计算器_电阻分压计算公式': '电阻 分压 电压',
    '串联电阻计算器': '电阻 串联',
    '电阻并联计算器_并联电阻计算器': '电阻 并联',
    '反正切函数计算器_反正切函数计算器在线': '反正切 arctan 反三角 三角函数',
    '舒尔特方格在线测试游戏': '舒尔特 方格 注意力 专注力',
    '大写转换器': '大写 金额大写 数字大写 人民币',
    '在线数独': '数独 sudoku',
    'N次方计算器': '次方 幂 开方 方根',
    '整除数计算器': '整除 因数 约数 因子',
    '开平方根计算器': '开方 平方根 sqrt 根号',
    'log2为底计算器': 'log2 对数',
    '个人所得税计算器': '个税 个税计算 工资 到手工资 个税专项',
    '年终奖计算器_年终奖个税计算器': '年终奖 个税 奖金',
    '在线尺子测量工具': '尺子 测量 长度 屏幕尺',
    '在线毫秒时钟显示': '时钟 毫秒 时间',
    '胎儿体重计算器在线': '胎儿 体重 孕检 胎儿体重',
    '身份证号提取年龄': '身份证 年龄 证件 校验',
    '预产期计算器在线计算': '预产期 怀孕 孕周',
    '10万国债一年多少利息_国债收益率计算': '国债 利息 收益率',
    '内衣尺码表_内衣尺码对照表': '内衣 尺码 胸围 罩杯',
    'egfr计算器_egfr计算公式': 'egfr 肾小球 肾功能 肌酐',
    '百家姓排名_百家姓': '百家姓 姓氏 排名',
    '体脂率在线计算器': '体脂 体脂率 体脂率计算',
    '基础代谢率计算器': '基础代谢 bmr 代谢',
    '年龄计算器在线计算': '年龄 周岁 生日',
    '退休倒计时计算器': '退休 倒计时',
    '时间间隔计算器': '时间间隔 日期差 间隔天数',
    '退休年龄计算器': '退休 退休年龄 延迟退休',
    '油耗计算器': '油耗 百公里油耗 耗油',
    '劳务报酬所得税计算器': '劳务报酬 劳务费 个税',
    '税额计算器': '税 税额 增值税 税金',
    '退休金计算器': '退休金 养老金 退休工资',
    '个税专项扣除计算器': '个税 专项扣除 专项附加扣除',
    'BMI计算器公式': 'bmi 体重指数 胖瘦',
    '文件md5计算': 'md5 摘要 校验 文件校验',
    '数字小游戏': '猜数字 小游戏 游戏',
    '图片压缩_压缩图片在线工具': '图片 压缩 图片压缩 图片处理 水印',
    '在线学生随机点名器': '点名 随机点名 抽人',
    '二维码识别_二维码在线识别': '二维码 扫码 识别 解析',
    '随机密码生成器_生成随机密码': '密码 随机密码 密码生成',
    '在线秒表毫秒计时器': '秒表 计时 毫秒 计时器',
    '反应速度测试_测试反应速度': '反应 反应速度 反应测试',
    '随机数生成器在线版': '随机数 随机数字',
    'CPS测试手速测试': 'cps 手速 点击速度',
    '钢管重量计算器_计算公式': '钢管 重量 钢材',
    '计数器在线': '计数器 计数',
    '种子转磁力': '种子 磁力 bt 磁力链接',
    '今天是第几周_今天第几周': '周 周数 第几周 星期',
    '子网掩码计算器': '子网掩码 子网 ip 网段',
    '在线秒表': '秒表 计时',
    '二维码生成器': '二维码 生成 二维码生成',
    '条形码生成器': '条形码 条码 code128 ean upc',
    '在线MAC地址生成器': 'mac 物理地址 网卡地址',
    '电磁水表流量点校准': '校准 电磁水表 流量点',
    '黄金价格换算': '黄金 金价 盎司',
    '瞬时流量与流速换算': '流量 流速 瞬时流量',
}


def esc(s):
    return html.escape(s, quote=True)


def icon_svg(key, cls='ico'):
    """按图标键输出 <svg><use></svg>。"""
    return '<svg class="%s" aria-hidden="true"><use href="#ic-%s"/></svg>' % (cls, key)


def item_html(href, name, sub, icon_key, tab=None, keywords='', badge=None):
    """带图标的工具条目：左侧色块图标，右侧名称与副标题。

    带 tab 时链接写成 ./page.html#tab，点开直达该条工具自己的页签。
    keywords 写进 data-kw，搜索时一并匹配——别名只给搜索用，不占版面。
    badge 是条目右上角的角标（专项工具用「自研」这类，提醒它不是清单里的搬运项）。
    """
    color, soft = index_icons.color_of(icon_key)
    url = href + ('#' + tab if tab else '')
    kw = (' data-kw="%s"' % esc(keywords)) if keywords else ''
    tag = ('<span class="badge">%s</span>' % esc(badge)) if badge else ''
    return (
        '<a class="item" href="./%s" data-page="%s"%s style="--ic:%s;--ic-bg:%s">'
        '<span class="thumb">%s</span>'
        '<span class="t"><span class="n">%s</span><span class="c">%s</span></span>%s'
        '<span class="go" aria-hidden="true">'
        '<svg class="ico"><use href="#ic-arrow"/></svg></span>'
        '</a>' % (esc(url), esc(href), kw, color, soft, icon_svg(icon_key),
                  esc(name), esc(sub), tag)
    )


def main():
    catalog = json.loads((HERE / 'catalog.json').read_text(encoding='utf-8'))
    local = json.loads((HERE / 'local_pages.json').read_text(encoding='utf-8'))
    catalog, dropped = collapse(catalog)
    catalog, moved = move_entries(catalog)
    check_search_alias(catalog)
    check_entry_tabs(catalog, local)
    check_entry_subs(catalog)

    sections, navs = [], []
    total = 0
    for key, title, subtitle in CATEGORIES:
        items = catalog[key]
        total += len(items)
        rows = []
        for url, meta in items:
            page = local.get(url)
            if not page:
                raise SystemExit('条目缺少本地实现映射：' + url)
            rows.append(item_html(page, meta['name'],
                                  ENTRY_SUBS.get(meta['name'], PAGE_NAMES[page]),
                                  index_icons.icon_of(meta['name']),
                                  ENTRY_TABS.get(meta['name']),
                                  SEARCH_ALIAS.get(meta['name'], '')))
        icon = CAT_ICONS.get(key, 'wrench')
        navs.append(
            '<a class="nav" href="#cat-%s" style="--ic:%s">'
            '<svg class="ico"><use href="#ic-%s"/></svg>'
            '<b>%s</b><span>%d 项</span></a>'
            % (key, index_icons.color_of(icon)[0], icon, esc(title), len(items))
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
        item_html(page, name, desc, icon_key, keywords=SEARCH_ALIAS.get(name, ''),
                  badge='自研')
        for page, name, desc, icon_key in SPECIAL
    )

    page = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1668dc">
<title>工具合集 · 离线可用的中文小工具</title>
<link rel="stylesheet" href="./index.css">
</head>
<body>
%s

<header class="hd">
  <div class="wrap hd-in">
    <div class="brand">
      <span class="logo" aria-hidden="true"><svg class="ico"><use href="#ic-grid"/></svg></span>
      <span class="bt">
        <h1>工具合集</h1>
        <p>中文小工具，打开即用</p>
      </span>
    </div>
    <div class="hd-side">
      <span class="tagline">纯浏览器计算 · 数据不出本机</span>
      <button id="theme" type="button" aria-label="切换深浅色">
        <svg class="ico moon" aria-hidden="true"><use href="#ic-moon"/></svg>
        <svg class="ico sun" aria-hidden="true"><use href="#ic-sun"/></svg>
      </button>
    </div>
  </div>
</header>

<main>
  <section class="hero">
    <div class="wrap">
      <div class="stats">
        <span class="stat"><b>%d</b> 个工具</span>
        <span class="stat"><b>%d</b> 个页面</span>
        <span class="stat"><b>%d</b> 个分类</span>
      </div>
      <div class="search-row">
        <svg class="ico" aria-hidden="true"><use href="#ic-search"/></svg>
        <input id="q" type="search" placeholder="搜索工具，如 编码 / 二维码 / 面积 / 个税">
        <span class="kbd">/</span>
      </div>
    </div>
  </section>

  <div class="wrap">
    <nav class="cats" aria-label="分类导航">
      %s
    </nav>

    <p class="empty" id="empty" hidden>没有匹配的工具，换个关键词试试。</p>

    <section class="cat" id="cat-special">
      <div class="cat-hd">
        <h2>专项工具 <small>%d 项</small></h2>
        <p>本仓库自研，清单里没有对应款</p>
      </div>
      <div class="items">
      %s
      </div>
    </section>

    <div id="list">
%s
    </div>

    <footer>
      <p>全部页面为浏览器端离线计算，打开 html 即可使用，不上传数据。</p>
      <p class="dim">站点名与官网无关，页面实现均为本仓库自写。</p>
    </footer>
  </div>
</main>

<script>
(function () {
  'use strict';
  var items = [].slice.call(document.querySelectorAll('.item'));
  var cats = [].slice.call(document.querySelectorAll('.cat'));
  var navs = [].slice.call(document.querySelectorAll('.cats .nav'));
  var q = document.getElementById('q');
  var empty = document.getElementById('empty');
  var nav = document.querySelector('.cats');

  // 搜索：命中就只留命中的条目本身，分类导航与空分类一并收起
  function apply() {
    var kw = q.value.trim().toLowerCase();
    var hits = 0, catsOn = {};
    items.forEach(function (a) {
      // 只按本条目自己的文字判定；名称与副标题之外，再看 data-kw 里为搜索专写的别名。
      var hit = !kw || ((a.textContent + ' ' + (a.getAttribute('data-kw') || ''))
        .toLowerCase().indexOf(kw) >= 0);
      a.hidden = !hit;
      if (hit) {
        hits++;
        catsOn[a.closest('.cat').id] = 1;
      }
    });
    cats.forEach(function (c) { c.hidden = !catsOn[c.id]; });
    nav.hidden = !!kw;
    navs.forEach(function (a) { a.hidden = !catsOn[a.getAttribute('href').slice(1)]; });
    empty.hidden = hits > 0;
  }

  q.addEventListener('input', apply);
  // 手机上敲完就收起键盘，别挡住下面刚筛出来的条目
  q.addEventListener('change', function () { q.blur(); });

  // 深浅色：跟随系统，手动切过就记住（离线打开时 localStorage 可能不可用，忽略异常）
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('theme');
    if (saved) root.setAttribute('data-theme', saved);
  } catch (e) {}
  document.getElementById('theme').addEventListener('click', function () {
    var now = root.getAttribute('data-theme');
    if (!now) {
      now = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var next = now === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  // 分类导航横滑时把当前分类的胶囊滚进视野，省得滑到一半不知道在哪
  var catBox = document.querySelector('#list');
  if (catBox && 'IntersectionObserver' in window) {
    var pick = new IntersectionObserver(function (rows) {
      var on = null;
      rows.forEach(function (r) { if (r.isIntersecting) on = r.target.id; });
      if (!on) return;
      navs.forEach(function (a) {
        var cur = a.getAttribute('href') === '#' + on;
        a.classList.toggle('on', cur);
        if (cur && a.scrollIntoView) {
          a.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
      });
    }, { rootMargin: '-72px 0px -70%% 0px' });
    cats.forEach(function (c) { if (c.id !== 'cat-special') pick.observe(c); });
  }
})();
</script>
</body>
</html>
''' % (index_icons.sprite(), total, len(PAGE_NAMES), len(CATEGORIES),
            '\n      '.join(navs), len(SPECIAL), specials, '\n'.join(sections))

    (DOCS / 'index.html').write_text(page, encoding='utf-8')
    print('wrote docs/index.html', len(page), 'bytes;', total,
          'tools（去重 %d 条，分类重排 %d 条）,' % (dropped, moved),
          len(PAGE_NAMES), 'pages')


if __name__ == '__main__':
    main()

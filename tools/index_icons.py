#!/usr/bin/env python3
"""首页条目的图标与配色：按工具名匹配图标键，按图标键上色。

图标用内联 SVG（`<symbol>` + `<use>`），不引外部字体或图标库，断网可用。
配色按功能域分组，同一图标键同色，视觉上能一眼分层。

改映射只需维护 ICON_RULES 与 COLORS，重跑 tools/gen_index_page.py 即可。
"""

# 图标键 → 24x24 viewBox 下的 path 数据（描边风格，stroke-width 由 CSS 给）
ICONS = {
    'code': '<path d="M8 6 2.5 12 8 18M16 6l5.5 6L16 18"/>',
    'link': '<path d="M9.5 14.5 14.5 9.5M8 12l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2"/>',
    'key': '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/>',
    'lock': '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    'unlock': '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
    'shield': '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    'hash': '<path d="M10 3 8 21M16 3l-2 18M4 9h16M3 15h16"/>',
    'check': '<path d="M4 12.5 9.5 18 20 6"/>',
    'sum': '<path d="M17 4H6l6 8-6 8h11"/>',
    'calc': '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    'graph': '<path d="M4 19V5M4 19h16"/><path d="M7 15l4-5 3 3 4-6"/>',
    'shape': '<rect x="3" y="3" width="10" height="10" rx="1"/><circle cx="16" cy="16" r="5"/>',
    'angle': '<path d="M4 20h16M4 20 16 6"/><path d="M11 20a7 7 0 0 1 7-7"/>',
    'bolt': '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
    'text': '<path d="M5 6h14M12 6v13M9 19h6"/>',
    'paragraph': '<path d="M13 4v16M17 4v16M13 8H9a4 4 0 0 0 0 8h4"/>',
    'search': '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5 21 21"/>',
    'clock': '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3.5 2"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'palette': '<path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 2-2 2 2 0 0 0-.6-1.4 2 2 0 0 1 1.4-3.4H17a4 4 0 0 0 4-4c0-3.9-4-7.2-9-7.2z"/><circle cx="8" cy="10" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="15" cy="7" r="1"/>',
    'dice': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
    'qr': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z"/>',
    'barcode': '<path d="M4 5v14M7 5v14M10 5v10M13 5v14M16 5v10M19 5v14"/>',
    'image': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-7 9"/>',
    'pin': '<path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z"/><circle cx="12" cy="11" r="2.3"/>',
    'ruler': '<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M7 8v3M12 8v4M17 8v3"/>',
    'network': '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/>',
    'server': '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    'browser': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01"/>',
    'heart': '<path d="M12 20s-7-4.4-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.6 12 20 12 20z"/>',
    'coin': '<circle cx="12" cy="12" r="8"/><path d="M9 9.5h6M9 13h6M12 7v10"/>',
    'percent': '<circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/><path d="M19 5 5 19"/>',
    'id': '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M5.5 16c.8-1.5 2-2.2 3.5-2.2s2.7.7 3.5 2.2M15 10h3M15 13h3"/>',
    'game': '<rect x="2" y="8" width="20" height="9" rx="4"/><path d="M7 12h3M8.5 10.5v3M15 11.5h.01M17.5 14h.01"/>',
    'flow': '<path d="M4 8h9a4 4 0 0 1 0 8H9"/><path d="M7 5 4 8l3 3M12 13l3 3-3 3"/>',
    'target': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    'list': '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    'wrench': '<path d="M14.5 6a4 4 0 1 0 4.3 6.4L21 15.6 18.6 18l-3.2-3.2A4 4 0 0 1 9 10.5z"/><path d="M9.5 14.5 4 20"/>',
    'tag': '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7" cy="8" r="1.4"/>',
    'table': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/>',
    'layers': '<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    'book': '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M17 7h2v13H8"/>',
    'scale': '<path d="M12 4v16M7 20h10M4 9h16M8 9l-3 6h6zM16 9l-3 6h6z"/>',
    'grid': '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    'moon': '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
    'arrow': '<path d="M9 6l6 6-6 6"/>',
}

# 图标键 → (主色, 浅底色)。同键同色，保证「编码类都是蓝的」这种直觉。
COLORS = {
    'code': ('#1668dc', '#e8f1fd'),
    'hashlock': ('#1668dc', '#e8f1fd'),
    'link': ('#1668dc', '#e8f1fd'),
    'key': ('#6b4fd8', '#eee9fb'),
    'lock': ('#6b4fd8', '#eee9fb'),
    'unlock': ('#6b4fd8', '#eee9fb'),
    'shield': ('#0f8f74', '#e3f5f0'),
    'hash': ('#c2410c', '#fdeee5'),
    'check': ('#c2410c', '#fdeee5'),
    'sum': ('#c2410c', '#fdeee5'),
    'text': ('#0f8f74', '#e3f5f0'),
    'paragraph': ('#0f8f74', '#e3f5f0'),
    'search': ('#0f8f74', '#e3f5f0'),
    'book': ('#0f8f74', '#e3f5f0'),
    'list': ('#0f8f74', '#e3f5f0'),
    'calc': ('#0891b2', '#e0f4f9'),
    'graph': ('#0891b2', '#e0f4f9'),
    'shape': ('#0891b2', '#e0f4f9'),
    'angle': ('#0891b2', '#e0f4f9'),
    'percent': ('#0891b2', '#e0f4f9'),
    'scale': ('#0891b2', '#e0f4f9'),
    'target': ('#0891b2', '#e0f4f9'),
    'table': ('#0891b2', '#e0f4f9'),
    'bolt': ('#d97706', '#fdf1de'),
    'wheel': ('#d97706', '#fdf1de'),
    'clock': ('#7c3aed', '#f0e9fe'),
    'calendar': ('#7c3aed', '#f0e9fe'),
    'palette': ('#db2777', '#fde8f1'),
    'image': ('#db2777', '#fde8f1'),
    'dice': ('#db2777', '#fde8f1'),
    'qr': ('#db2777', '#fde8f1'),
    'barcode': ('#db2777', '#fde8f1'),
    'globe': ('#1668dc', '#e8f1fd'),
    'pin': ('#1668dc', '#e8f1fd'),
    'ruler': ('#1668dc', '#e8f1fd'),
    'network': ('#1668dc', '#e8f1fd'),
    'server': ('#1668dc', '#e8f1fd'),
    'browser': ('#1668dc', '#e8f1fd'),
    'file': ('#475569', '#eceff3'),
    'heart': ('#e11d48', '#fde7ec'),
    'coin': ('#d97706', '#fdf1de'),
    'id': ('#0f8f74', '#e3f5f0'),
    'game': ('#7c3aed', '#f0e9fe'),
    'flow': ('#0891b2', '#e0f4f9'),
    'wrench': ('#475569', '#eceff3'),
    'tag': ('#475569', '#eceff3'),
    'layers': ('#475569', '#eceff3'),
}

# 匹配规则：从上往下，第一个命中的关键字决定图标键。顺序敏感（先专后泛）。
ICON_RULES = [
    ('QR', 'qr'), ('二维码', 'qr'),
    ('条形码', 'barcode'), ('UPC', 'barcode'), ('EAN', 'barcode'),
    ('图片', 'image'), ('水印', 'image'), ('压缩', 'image'),
    ('颜色取色', 'palette'), ('取色', 'palette'), ('RGB', 'palette'),
    ('经纬度', 'pin'), ('拾取', 'pin'), ('坐标', 'pin'),
    ('度分秒', 'angle'), ('尺子', 'ruler'), ('测量', 'ruler'),
    ('子网', 'network'), ('MAC地址', 'network'), ('IP', 'network'),
    ('DNS', 'server'),
    ('端口', 'server'),
    ('UserAgent', 'browser'), ('UA查询', 'browser'),
    ('舒尔特', 'game'), ('数独', 'game'),
    ('网页源代码', 'browser'), ('HTTP状态', 'browser'), ('网页', 'browser'),
    ('robots', 'browser'), ('短网址', 'link'), ('短链', 'link'), ('网址', 'link'),
    ('备案', 'shield'),
    ('Markdown', 'paragraph'), ('HTML编辑器', 'paragraph'), ('排版', 'paragraph'),
    ('同义词', 'book'),
    ('敏感词', 'shield'),
    ('文本对比', 'layers'), ('代码对比', 'layers'),
    ('SQL', 'table'), ('JSON', 'code'),
    ('JWT', 'unlock'), ('jwt', 'unlock'),
    ('SSL', 'shield'), ('证书', 'shield'), ('私有证书', 'shield'),
    ('RSA', 'key'), ('公私钥', 'key'),
    ('RC4', 'lock'), ('Rabbit', 'lock'),
    ('md5', 'hash'), ('MD5', 'hash'), ('HMAC', 'hash'),
    ('adler32', 'sum'), ('累加和', 'sum'), ('CRC', 'check'), ('异或', 'check'), ('校验和', 'check'),
    ('Base64', 'code'), ('Base32', 'code'), ('Base62', 'code'), ('Base58', 'code'),
    ('URL', 'code'), ('Url', 'code'), ('url', 'code'),
    ('uuencode', 'code'), ('Punycode', 'code'), ('Escape', 'code'),
    ('大写转换', 'text'), ('大写', 'text'),
    ('摩尔斯', 'text'), ('ROT13', 'text'), ('凯撒', 'text'), ('培根', 'text'),
    ('栅栏', 'text'), ('维吉尼亚', 'text'), ('密码生成', 'key'), ('随机密码', 'key'),
    ('编码', 'code'), ('解码', 'code'), ('转码', 'code'), ('转换器', 'code'),
    ('时间戳', 'clock'), ('时钟', 'clock'), ('秒表', 'clock'), ('计时器', 'clock'),
    ('身份证', 'id'), ('年龄', 'calendar'), ('生日', 'calendar'), ('第几周', 'calendar'),
    ('时间间隔', 'clock'), ('放假', 'calendar'), ('日期', 'calendar'),
    ('反应速度', 'game'), ('CPS', 'game'),
    ('手速', 'game'), ('小游戏', 'game'), ('点名', 'game'), ('计数器', 'game'),
    ('随机', 'dice'), ('密码生成', 'dice'), ('生成器', 'dice'), ('种子', 'dice'), ('磁力', 'dice'),
    ('整除', 'target'), ('因数', 'target'),
    ('面积', 'shape'), ('体积', 'shape'), ('周长', 'shape'), ('正方体', 'shape'),
    ('长方体', 'shape'), ('圆柱', 'shape'), ('圆锥', 'shape'), ('梯形', 'shape'),
    ('平行四边形', 'shape'), ('正方形', 'shape'), ('矩形', 'shape'),
    ('正弦', 'angle'), ('tan', 'angle'), ('arctan', 'angle'), ('反正切', 'angle'), ('角度', 'angle'),
    ('电阻', 'bolt'), ('分压', 'bolt'), ('分流', 'bolt'), ('并联', 'bolt'), ('串联', 'bolt'),
    ('钢管', 'scale'), ('重量', 'scale'),
    ('存储单位', 'layers'), ('字节', 'layers'), ('单位换算', 'layers'),
    ('log', 'graph'), ('对数', 'graph'), ('开平方', 'graph'), ('平方根', 'graph'),
    ('N次方', 'calc'), ('乘方', 'calc'),
    ('等差数列', 'sum'), ('等比数列', 'sum'), ('数列', 'sum'),
    ('金额', 'coin'), ('人民币', 'coin'),
    ('个税', 'percent'), ('所得税', 'percent'), ('年终奖', 'percent'), ('税额', 'percent'),
    ('劳务报酬', 'percent'), ('税率', 'percent'), ('税金', 'percent'), ('专项扣除', 'percent'),
    ('增值税', 'percent'),
    ('BMI', 'heart'), ('体脂', 'heart'), ('基础代谢', 'heart'), ('eGFR', 'heart'), ('egfr', 'heart'),
    ('胎儿', 'heart'), ('预产期', 'heart'), ('内衣', 'tag'), ('尺码', 'tag'), ('衣服', 'tag'), ('鞋码', 'tag'),
    ('百家姓', 'book'),
    ('国债', 'coin'), ('利息', 'coin'), ('收益', 'coin'), ('养老金', 'coin'), ('退休金', 'coin'),
    ('退休', 'calendar'), ('油耗', 'flow'), ('油料', 'flow'),
    ('流量点校准', 'target'), ('校准', 'target'),
    ('黄金', 'coin'), ('价格', 'coin'), ('换算', 'calc'),
    ('瞬时流量', 'flow'), ('流速', 'flow'), ('流量', 'flow'),
    ('计数器', 'game'),
    ('查看', 'search'), ('查询', 'search'), ('解析', 'search'), ('检测', 'search'),
    ('统计', 'list'), ('汇总', 'list'),
]


def icon_of(name):
    """按工具名返回图标键，匹配不到用通用 wrench。"""
    for kw, key in ICON_RULES:
        if kw in name:
            return key
    return 'wrench'


def color_of(icon_key):
    return COLORS.get(icon_key, ('#475569', '#eceff3'))


def sprite():
    """返回首页顶部内联的 <svg><symbol>…</symbol></svg> 图标集。"""
    parts = ['<svg class="sprite" aria-hidden="true" focusable="false">']
    for key, body in ICONS.items():
        parts.append('<symbol id="ic-%s" viewBox="0 0 24 24">%s</symbol>' % (key, body))
    parts.append('</svg>')
    return ''.join(parts)

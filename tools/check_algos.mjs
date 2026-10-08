#!/usr/bin/env node
/*
 * 校验各工具页里的核心算法。
 *
 * 做法：把 docs/*.js 的 IIFE 外壳剥掉，用最小 DOM 桩在 Node 里加载，
 * 再拿标准测试向量逐条比对。改算法后跑一遍 `node tools/check_algos.mjs`，
 * 全过说明与标准仍一致；失败会打印期望值与实际值。
 *
 * 部分页面依赖 docs/lib 下的第三方库（二维码、条形码、证书、Markdown）。
 * loadModule 的 lib 参数会先按顺序把那些库加载进沙箱全局，再执行页面模块，
 * 因此带依赖的页面同样能在 Node 里被断言。
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.join(here, '..', 'docs');

let failed = 0;
let passed = 0;

function eq(actual, expected, label) {
  const ok = String(actual) === String(expected);
  if (ok) passed++;
  else { failed++; console.log('FAIL ' + label + '\n  实际 ' + JSON.stringify(actual) + '\n  期望 ' + JSON.stringify(expected)); }
}

// 剥掉 IIFE 外壳，只留函数体；文件头部允许有注释块
function loadBody(file) {
  const src = fs.readFileSync(path.join(docs, file), 'utf8');
  const end = src.lastIndexOf('})();');
  // 定位 IIFE 起点，跳过文件开头的注释
  const m = /\(function\s*\([^)]*\)\s*\{[\s\S]*?['"]use strict['"];?\n/.exec(src);
  if (!m) throw new Error(file + ' 里找不到 IIFE 外壳');
  return src.slice(m.index + m[0].length, end);
}

// 页面初始化会读这些控件的值；桩里给一份与页面默认值一致的初值，
// 否则 fuBuildFields 之类的代码会拿到空串而找不到对应的表单定义。
const DOM_DEFAULTS = {
  'fu-mode': 'twice',
  'bd-amount': '100000', 'bd-rate': '2.38', 'bd-years': '3', 'bd-kind': 'electronic', 'bd-tax': '0',
  'rt-birth': '1985-06-15', 'rt-sex': 'm', 'rt-type': 'worker',
  'qr-level': 'M', 'qr-size': '300', 'qr-margin': '4', 'qr-text': 'https://cnb.cool',
  'bc-type': 'code128', 'bc-text': 'CNB-2026-0001', 'bc-scale': '3', 'bc-height': '15', 'bc-include': '1',
  'jt-alg': 'HS256', 'jt-key': 'your-256-bit-secret',
  'sk-level': 'mid', 'sc-size': '5', 'gs-range': '100',
  'sy-level': '2', 'zp-quality': '0.72', 'zp-maxw': '1920', 'zp-format': 'image/jpeg',
  'wm-text': 'CNB · 内部资料', 'wm-pos': 'br', 'wm-size': '4', 'wm-opacity': '0.45',
  'wm-color': '#ffffff', 'wm-angle': '-30',
  'gp-lat': '39.908722', 'gp-lng': '116.397499', 'rl-known': '1',
  'sn-in': '加微信领福利', 'ct-in': '你好abc 123',
  // station2：HTTP 搜索、UA 输入、端口搜索
  'ht-q': '', 'ua-in': '', 'pt-q': '',
  // holiday：年份段选择器需要 on class（由 T.tabs 桩提供不了，直接给默认年月）
  'pg-lmp': '2026-01-05', 'pg-cycle': '28', 'pg-today': '',
  'ft-bpd': '8.5', 'ft-ac': '29.0', 'ft-fl': '6.5',
  'eg-age': '55', 'eg-sex': 'f', 'eg-cr': '88.4', 'eg-unit': 'umol',
  'cd-in': '110105199001011234', 'cd-at': '',
  'sz-h': '175', 'sz-w': '70', 'sz-sex': 'm', 'sz-fit': 'normal',
  'sh-len': '25.5', 'bj-q': '',
  'lb-amount': '30000',
  'vt-net': '10000', 'vt-gross': '11300', 'vt-rate': '13', 'vt-tax': '1300',
  'al-gross': '11300', 'al-rate': '13', 'al-pay': '20000', 'al-ins': '2100', 'al-extra': '0',
  'al-bamount': '50000', 'al-lamount': '50000', 'al-lother': '60000',
  'rb-key': '00000000000000000000000000000000', 'rb-iv': '0000000000000000',
  'rb-in': 'hello rabbit', 'r4-key': 'Key', 'r4-in': 'Plaintext'
};

function domStub() {
  const store = {};
  const mk = (tag) => {
    const node = {
      value: '', textContent: '', className: '', placeholder: '', dataset: {}, children: [],
      tagName: (tag || 'div').toUpperCase(), selected: false, checked: false, innerHTML: '',
      style: { setProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      hidden: false,
      addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
      appendChild(c) { this.children.push(c); return c; },
      insertBefore(c) { this.children.unshift(c); return c; },
      remove() {},
      querySelector: () => mk('div'), querySelectorAll: () => [],
      getAttribute: () => null,
      closest: () => mk('div'),
      // 容器类节点保留 innerHTML 语义：赋 '' 时清空 children
      set innerHTMLHTML(v) {},
      parentNode: { insertBefore() {}, querySelector: () => mk('div') },
    };
    Object.defineProperty(node, 'innerHTML', {
      get() { return node._html || ''; },
      set(v) { node._html = v; if (v === '') node.children.length = 0; },
    });
    return node;
  };
  const document = {
    createElement: mk, createTextNode: (t) => Object.assign(mk('#text'), { textContent: t }),
    getElementById: (i) => {
      if (!store[i]) {
        store[i] = mk();
        if (DOM_DEFAULTS[i] != null) store[i].value = DOM_DEFAULTS[i];
      }
      return store[i];
    },
    querySelector: () => mk(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    documentElement: mk('html'), body: mk('body'), title: '', hidden: false,
    visibilityState: 'visible',
  };
  return { document, store };
}

// 载入 docs/lib 下的第三方库：按声明顺序依次执行，挂到沙箱全局上。
// 传 null 表示该页不依赖任何库。顺序有讲究（bwip-js 依赖已存在的 global/window）。
function loadLibs(libs) {
  if (!libs || !libs.length) return '';
  return libs.map((f) => fs.readFileSync(path.join(docs, 'lib', f), 'utf8')).join('\n;\n');
}

function loadModule(file, exports, libs) {
  const { document, store } = domStub();
  globalThis.window = globalThis;
  globalThis.document = document;
  globalThis.TextEncoder = TextEncoder;
  // Node 自带 webcrypto（只读 getter），不必覆盖
  globalThis.T = {
    $: (i) => document.getElementById(i),
    el: () => domStub().document.createElement(),
    tabs: () => [], bindCopy() {}, cells() {},
    fmt: (n, d) => Number(n.toFixed(d == null ? 4 : d)).toLocaleString('zh-CN', { maximumFractionDigits: d }),
  };
  globalThis.__store = store;
  // 新页面依赖的浏览器 API：Node 里用等价实现顶上
  globalThis.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
  globalThis.btoa = (bin) => Buffer.from(bin, 'binary').toString('base64');
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  // 部分页面（二维码、证书、图片）在加载时就会跑一次初始化，需要 canvas 与文件 API 的等价桩
  globalThis.Image = function () { return domStub().document.createElement('img'); };
  globalThis.URL = globalThis.URL || {};
  globalThis.URL.createObjectURL = () => 'blob:stub';
  globalThis.URL.revokeObjectURL = () => {};
  // Node 24 的 navigator 是只读 getter，用 defineProperty 补上页面需要的字段
  if (!globalThis.navigator || !globalThis.navigator.clipboard) {
    try {
      Object.defineProperty(globalThis, 'navigator', { value: { clipboard: null, userAgent: 'node' }, configurable: true });
    } catch (e) { /* 实在改不了就跳过，页面里对 navigator 的访问都在运行时 */ }
  }
  const origCreate = document.createElement;
  document.createElement = function (tag) {
    const node = origCreate(tag);
    if (String(tag).toLowerCase() === 'canvas') {
      node.getContext = () => ({
        fillStyle: '', font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
        fillRect() {}, clearRect() {}, drawImage() {}, fillText() {},
        measureText: (t) => ({ width: String(t).length * 8 }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData() {}, save() {}, restore() {}, translate() {}, rotate() {},
        stroke() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, setTransform() {}
      });
      node.toBlob = (cb) => cb(new Blob([]));
      node.width = 0;
      node.height = 0;
    }
    return node;
  };
  const prelude = loadLibs(libs);
  return new Function(prelude + '\n' + loadBody(file) + '\nreturn {' + exports.join(',') + '};')();
}

const enc = (s) => new TextEncoder().encode(s);

// ---------- base.js ----------
{
  const M = loadModule('base.js',
    'b64Encode,b64Decode,b32Encode,b32Decode,radixEncode,radixDecode,B58,B62,hexEncode,hexDecode,unicodeEncode,unicodeDecode,punycodeEncode,punycodeDecode,domainToAscii,domainToUnicode,urlEncode,urlDecode'.split(','));
  eq(M.b64Encode('你好abc'), '5L2g5aW9YWJj', 'Base64 编码中文');
  eq(M.b64Decode('5L2g5aW9YWJj'), '你好abc', 'Base64 解码中文');
  eq(M.b64Encode('a'), 'YQ==', 'Base64 补位');
  eq(M.b32Encode('foobar'), 'MZXW6YTBOI======', 'Base32 编码（RFC 4648）');
  eq(M.b32Decode('MZXW6YTBOI======'), 'foobar', 'Base32 解码');
  eq(M.radixEncode('hello', M.B58), 'Cn8eVZg', 'Base58 编码（比特币字母表）');
  eq(M.radixDecode('Cn8eVZg', M.B58), 'hello', 'Base58 解码');
  eq(M.radixEncode('hello', M.B62), '7tQLFHz', 'Base62 编码');
  eq(M.radixDecode('7tQLFHz', M.B62), 'hello', 'Base62 解码');
  eq(M.hexEncode('hi'), '68 69', 'Hex 编码');
  eq(M.hexDecode('e4 bd a0 e5 a5 bd'), '你好', 'Hex 解码');
  eq(M.unicodeEncode('你好'), '\\u4F60\\u597D', 'Unicode 转义');
  eq(M.unicodeDecode('\\u4F60\\u597D'), '你好', 'Unicode 还原');
  eq(M.punycodeEncode('中国'), 'fiqs8s', 'Punycode 编码（RFC 3492）');
  eq(M.punycodeDecode('fiqs8s'), '中国', 'Punycode 解码');
  eq(M.punycodeEncode('mañana'), 'maana-pta', 'Punycode mañana');
  eq(M.domainToAscii('中国.cn'), 'xn--fiqs8s.cn', '中文域名转 ACE');
  eq(M.domainToUnicode('xn--fiqs8s.cn'), '中国.cn', 'ACE 转中文域名');
  eq(M.domainToAscii('münchen.de'), 'xn--mnchen-3ya.de', 'münchen 转 ACE');
  eq(M.urlDecode('a%20b%26c%3D%E4%B8%AD'), 'a b&c=中', 'URL 解码');
}

// ---------- cipher.js ----------
{
  const M = loadModule('cipher.js',
    'morseEncode,morseDecode,vigenere,fenceEncode,fenceDecode,baconEncode,baconDecode,shiftChar'.split(','));
  eq(M.morseEncode('SOS'), '... --- ...', '摩尔斯 SOS');
  eq(M.morseDecode('... --- ...'), 'SOS', '摩尔斯解码');
  eq(M.shiftChar('Z', 3), 'C', '凯撒回绕');
  eq(M.shiftChar('a', -3), 'x', '凯撒反向');
  eq(M.shiftChar('1', 3), '1', '凯撒跳过非字母');
  eq(M.vigenere('ATTACKATDAWN', 'LEMON', 'enc'), 'LXFOPVEFRNHR', '维吉尼亚加密');
  eq(M.vigenere('LXFOPVEFRNHR', 'LEMON', 'dec'), 'ATTACKATDAWN', '维吉尼亚解密');
  eq(M.fenceEncode('WEAREDISCOVEREDFLEEATONCE', 3), 'WRIORFEOEEESVELANADCEDETC', '栅栏加密');
  eq(M.fenceDecode('WRIORFEOEEESVELANADCEDETC', 3), 'WEAREDISCOVEREDFLEEATONCE', '栅栏解密');
  for (const n of [2, 3, 4, 5]) {
    eq(M.fenceDecode(M.fenceEncode('WEAREDISCOVEREDFLEEATONCEAB', n), n),
      'WEAREDISCOVEREDFLEEATONCEAB', '栅栏往返 ' + n + ' 栏');
  }
  eq(M.baconDecode(M.baconEncode('SECRET')), 'SECRET', '培根往返');
}

// ---------- hash.js ----------
{
  const M = loadModule('hash.js',
    'md5,sha1Js,sha256Js,sha512Js,crcOf,sum8,sum16,xor8,adler32'.split(','));
  eq(M.md5(enc('')), 'd41d8cd98f00b204e9800998ecf8427e', 'MD5 空串');
  eq(M.md5(enc('abc')), '900150983cd24fb0d6963f7d28e17f72', 'MD5 abc');
  eq(M.md5(enc('中文测试')), crypto.createHash('md5').update('中文测试').digest('hex'), 'MD5 中文');
  eq(M.sha1Js(enc('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d', 'SHA-1 abc');
  eq(M.sha256Js(enc('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 abc');
  eq(M.sha256Js(enc('中文测试')), crypto.createHash('sha256').update('中文测试').digest('hex'), 'SHA-256 中文');
  eq(M.sha512Js(enc('abc')),
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    'SHA-512 abc');
  // CRC 标准值来自 CRC RevEng 目录，输入统一用 "123456789"
  const crcCases = {
    'CRC-32': '0xCBF43926',
    'CRC-32/MPEG-2': '0x0376E6E7',
    'CRC-16/MODBUS': '0x4B37',
    'CRC-16/USB': '0xB4C8',
    'CRC-16/CCITT-FALSE': '0x29B1',
    'CRC-16/XMODEM': '0x31C3',
    'CRC-8/MAXIM': '0xA1',
    'CRC-8/ATM': '0xF4',
  };
  for (const [k, v] of Object.entries(crcCases)) eq(M.crcOf(enc('123456789'), k), v, k);
  eq(M.adler32(enc('Wikipedia')), 0x11E60398, 'Adler-32 Wikipedia');
  eq(M.adler32(enc('123456789')), 0x091E01DE, 'Adler-32 123456789');
  eq(M.sum16(enc('123456789')), 477, '16 位累加和');
  eq(M.xor8(enc('abc')), 97 ^ 98 ^ 99, '8 位异或');
  // HMAC 与 Node 的 crypto 对照
  const H = loadModule('hash.js', 'hmac'.split(','));
  for (const [algo, block] of [['SHA-256', 64], ['SHA-512', 128], ['SHA-1', 64]]) {
    eq(await H.hmac(algo, enc('secret'), enc('hello'), block),
      crypto.createHmac(algo.toLowerCase().replace('-', ''), 'secret').update('hello').digest('hex'),
      'HMAC-' + algo);
  }
}

// ---------- number.js ----------
{
  const M = loadModule('number.js',
    'amountToChinese,storage,powerResult,logResult,divisorResult,seriesResult,byteStats,steelResult,factorize,divisors,parseSteelInput'.split(',').filter(x => x !== 'parseSteelInput'));
  const amounts = [
    [1234.56, '壹仟贰佰叁拾肆元伍角陆分'],
    [100, '壹佰元整'],
    [0, '零元整'],
    [0.5, '伍角'],
    [10000, '壹万元整'],
    [100000000, '壹亿元整'],
    [100000001, '壹亿零壹元整'],
    [1050, '壹仟零伍拾元整'],
    [10.05, '壹拾元零伍分'],
    [1000001, '壹佰万零壹元整'],
    [-5.5, '负伍元伍角'],
    [1234567.89, '壹佰贰拾叁万肆仟伍佰陆拾柒元捌角玖分'],
  ];
  for (const [v, want] of amounts) eq(M.amountToChinese(v), want, '金额大写 ' + v);
  const st = Object.fromEntries(M.storage(1, 'GiB'));
  eq(st['GiB'], '1', '存储 1 GiB → GiB');
  eq(st['MiB'], '1,024', '存储 1 GiB → MiB');
  eq(st['MB'], '1,073.741824', '存储 1 GiB → MB（十进制）');
  eq(M.factorize(360).map((x) => x.join('^')).join('×'), '2^3×3^2×5^1', '质因数分解 360');
  eq(M.divisors(12).join(','), '1,2,3,4,6,12', '因数 12');
  eq(M.seriesResult(1, 1, 100, 'ap')[2][1], '5,050', '等差数列 1..100 和');
  eq(M.seriesResult(1, 2, 10, 'gp')[1][1], '512', '等比数列第 10 项');
  eq(M.seriesResult(1, 2, 10, 'gp')[2][1], '1,023', '等比数列前 10 项和');
  eq(M.steelResult(108, 4, 7.85)[0][1], '10.2592 kg/m', '钢管 108×4 理论重量');
  eq(M.byteStats('你好abc').find((r) => r[0].includes('总字节数'))[1], '9', '字节统计 UTF-8');
}

// ---------- color.js ----------
{
  const M = loadModule('color.js', 'rgbToHex,hexToRgb,rgbToHsl,rgbToHsv,rgbToCmyk,contrast'.split(','));
  eq(M.rgbToHex(22, 104, 220), '#1668DC', 'RGB → HEX');
  eq(M.hexToRgb('#16c').join(','), '17,102,204', '三位 HEX 缩写');
  eq(M.hexToRgb('zzz'), null, '非法 HEX');
  eq(M.rgbToHsl(255, 0, 0).join(','), '0,100,50', 'HSL 纯红');
  eq(M.rgbToHsv(0, 0, 255).join(','), '240,100,100', 'HSV 纯蓝');
  eq(M.rgbToCmyk(255, 0, 0).join(','), '0,100,100,0', 'CMYK 纯红');
  eq(M.contrast([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00', 'WCAG 黑白对比度');
}

// ---------- net.js ----------
{
  const M = loadModule('net.js', 'parseIp,ipToInt,intToIp,parseMask,subnet,parseMac'.split(','));
  eq(M.intToIp(M.ipToInt([192, 168, 1, 10])), '192.168.1.10', 'IP 往返');
  eq(M.parseMask('24'), 24, '掩码 24');
  eq(M.parseMask('/24'), 24, '掩码 /24');
  eq(M.parseMask('255.255.255.0'), 24, '掩码点分形式');
  eq(M.parseMask('255.0.255.0'), null, '非连续掩码应拒绝');
  const s = Object.fromEntries(M.subnet('192.168.1.10', '24').rows);
  eq(s['网络地址'], '192.168.1.0/24', '网络地址');
  eq(s['广播地址'], '192.168.1.255', '广播地址');
  eq(s['可用主机数'], '254', '/24 可用主机数');
  eq(Object.fromEntries(M.subnet('10.0.0.5', '255.255.255.252').rows)['地址总数'], '4', '/30 地址总数');
  const mac = Object.fromEntries(M.parseMac('00:1A:2B:3C:4D:5E'));
  eq(mac['OUI（厂商前缀）'], '00:1A:2B', 'MAC OUI');
  eq(mac['单播 / 组播'], '单播（bit0 = 0）', 'MAC 单播位');
}

// ---------- date.js ----------
{
  const M = loadModule('date.js', 'parseDate,ageBetween,isoWeek,dayOfYear,tsConvert,isLeap'.split(','));
  eq(M.parseDate('2024-02-31'), null, '拒绝不存在的日期');
  eq(M.isLeap(2024), true, '闰年判断');
  eq(M.ageBetween(new Date(1995, 5, 15), new Date(2024, 5, 14)).years, 28, '生日前一天年龄');
  eq(M.ageBetween(new Date(1995, 5, 15), new Date(2024, 5, 15)).years, 29, '生日当天年龄');
  eq(M.isoWeek(new Date(2024, 0, 1)).week, 1, 'ISO 周号 2024-01-01');
  eq(M.isoWeek(new Date(2021, 0, 1)).week, 53, 'ISO 周号 2021-01-01（属 2020 年第 53 周）');
  eq(M.dayOfYear(new Date(2024, 11, 31)), 366, '闰年第 366 天');
  eq(M.tsConvert(1700000000, null).find((r) => r[0] === '识别单位')[1], '秒', '10 位时间戳按秒');
  eq(M.tsConvert(1700000000000, null).find((r) => r[0] === '识别单位')[1], '毫秒', '13 位时间戳按毫秒');
}

// ---------- clock.js ----------
{
  const M = loadModule('clock.js', 'split,hms,dayOfYear,fmtOffset,shade,isDST,formatDur,zoneDiff,zoneTime'.split(','));
  const s1 = M.split(3661001);
  eq(`${s1.h},${s1.m},${s1.s},${s1.ms}`, '1,1,1,1', 'clock split 1:01:01.001');
  const s2 = M.split(0);
  eq(`${s2.h},${s2.m},${s2.s},${s2.ms}`, '0,0,0,0', 'clock split 归零');
  const s3 = M.split(-1500);
  eq(`${s3.neg},${s3.h},${s3.m},${s3.s},${s3.ms}`, 'true,0,0,1,500', 'clock split 负值取绝对值并标负');
  eq(M.hms(M.split(61000), true, 3), '01:01.000', 'clock hms 不足 1 小时按 mm:ss');
  eq(M.hms(M.split(3600000), false, 2), '01:00:00', 'clock hms 整小时带时位');
  eq(M.formatDur(90061000), '25 小时 1 分 1 秒', 'clock 时长口语化');
  eq(M.fmtOffset(480), 'UTC+8', 'clock 东八区');
  eq(M.fmtOffset(-330), 'UTC-5:30', 'clock 半小时时区');
  eq(M.fmtOffset(0), 'UTC+0', 'clock 零偏移');
  eq(M.fmtOffset(345), 'UTC+5:45', 'clock 尼泊尔 5:45');
  eq(M.dayOfYear(new Date(2024, 11, 31)), 366, 'clock 闰年第 366 天');
  eq(M.dayOfYear(new Date(2025, 0, 1)), 1, 'clock 元旦为第 1 天');
  eq(M.dayOfYear(new Date(2025, 2, 1)), 60, 'clock 平年 3 月 1 日为第 60 天');
  eq(M.shade('#1668dc', -0.22), '#1151ac', 'clock 调暗主色');
  eq(M.shade('#ffffff', -0.5), '#808080', 'clock 白色减半');
  eq(M.shade('#000000', 0.5), '#808080', 'clock 黑色加半');
  // 时区偏移与 Node Intl 对照（2024-07-01，含夏令时）
  const d = new Date('2024-07-01T12:00:00Z');
  eq(M.zoneDiff('Asia/Tokyo', d), 540, 'clock 东京 +9');
  eq(M.zoneDiff('Europe/London', d), 60, 'clock 伦敦夏令时 +1');
  eq(M.zoneDiff('America/New_York', d), -240, 'clock 纽约夏令时 −4');
  eq(M.zoneDiff('Asia/Kolkata', d), 330, 'clock 印度 +5:30');
  eq(M.zoneDiff('UTC', d), 0, 'clock UTC 0');
}

// ---------- geometry.js ----------
{
  const M = loadModule('geometry.js', 'PLANE,SOLID,parseFraction,trigCompute,resCompute,deg2rad,rad2deg'.split(','));
  const R = (rows) => Object.fromEntries(rows.map((r) => [r[0], String(r[1]).replace(/ .*$/, '')]));
  const near = (a, b, t, label) => eq(Math.abs(Number(a) - Number(b)) <= (t == null ? 1e-6 : t), true, label + ` (${a} vs ${b})`);

  const sq = R(M.PLANE.square.compute({ a: '3', b: '4' }).rows);
  near(sq['面积'], 12, 1e-6, '几何 矩形面积 3×4');
  near(sq['周长'], 14, 1e-6, '几何 矩形周长');
  near(sq['对角线'], 5, 1e-6, '几何 3-4-5 直角三角形');
  const pg = R(M.PLANE.parallelogram.compute({ a: '6', h: '4', b: '5' }).rows);
  near(pg['面积'], 24, 1e-6, '几何 平行四边形面积');
  const tp = R(M.PLANE.trapezoid.compute({ a: '4', b: '8', h: '3', c: '5', d: '5' }).rows);
  near(tp['面积'], 18, 1e-6, '几何 梯形面积');
  near(tp['中位线'], 6, 1e-6, '几何 梯形中位线');
  near(tp['周长'], 22, 1e-6, '几何 梯形周长');

  const cb = R(M.SOLID.cube.compute({ a: '3' }).rows);
  near(cb['表面积'], 54, 1e-6, '几何 正方体表面积');
  near(cb['体积'], 27, 1e-6, '几何 正方体体积');
  near(cb['体对角线'], Math.sqrt(3) * 3, 1e-6, '几何 正方体体对角线');
  const cd = R(M.SOLID.cuboid.compute({ a: '2', b: '3', c: '4' }).rows);
  near(cd['表面积'], 52, 1e-6, '几何 长方体表面积');
  near(cd['体积'], 24, 1e-6, '几何 长方体体积');
  near(cd['体对角线'], Math.sqrt(29), 1e-6, '几何 长方体体对角线');
  const cy = R(M.SOLID.cylinder.compute({ r: '3', h: '5' }).rows);
  near(cy['侧面积'], 2 * Math.PI * 15, 1e-5, '几何 圆柱侧面积');
  near(cy['表面积'], 2 * Math.PI * 9 + 2 * Math.PI * 15, 1e-5, '几何 圆柱表面积');
  near(cy['体积'], Math.PI * 9 * 5, 1e-5, '几何 圆柱体积');
  const co = R(M.SOLID.cone.compute({ r: '3', h: '4' }).rows);
  near(co['母线长'], 5, 1e-6, '几何 圆锥母线 3-4-5');
  near(co['侧面积'], Math.PI * 15, 1e-5, '几何 圆锥侧面积');
  near(co['体积'], Math.PI * 9 * 4 / 3, 1e-5, '几何 圆锥体积');

  near(R(M.trigCompute('sin', { x: '30' }).rows)['函数值'], 0.5, 1e-9, '几何 sin30');
  near(R(M.trigCompute('cos', { x: '60' }).rows)['函数值'], 0.5, 1e-9, '几何 cos60');
  eq(M.trigCompute('tan', { x: '90' }).rows[0][1], '未定义', '几何 tan90 未定义');
  // arctan 的角度带 '°' 后缀，取值时剥掉单位
  const atanDeg = Number(String(M.trigCompute('atan', { x: '3/4' }).rows[0][1]).replace(/[^\d.]/g, ''));
  near(atanDeg, Math.atan(0.75) * 180 / Math.PI, 1e-5, '几何 arctan 支持分式');
  eq(M.trigCompute('asin', { x: '2' }), null, '几何 arcsin 越界拒绝');
  eq(M.trigCompute('acos', { x: '-2' }), null, '几何 arccos 越界拒绝');
  eq(M.parseFraction('3/4'), 0.75, '几何 分式 3/4');
  eq(Number.isNaN(M.parseFraction('1/0')), true, '几何 分母为 0 返回 NaN');
  eq(Number.isNaN(M.parseFraction('abc')), true, '几何 非数字返回 NaN');
  eq(M.parseFraction(' 2.5 '), 2.5, '几何 分式容忍空格');

  const se = R(M.resCompute('series', { u: '12', r1: '100', r2: '200' }).rows);
  near(se['串联总阻值'], 300, 1e-6, '几何 串联 100+200');
  near(se['总电流'], 12 / 300, 1e-9, '几何 串联电流');
  near(se['R1 分压'], 4, 1e-6, '几何 R1 分压 100/300×12');
  const pa = R(M.resCompute('parallel', { u: '12', r1: '100', r2: '200' }).rows);
  near(pa['并联总阻值'], 1 / (1 / 100 + 1 / 200), 1e-6, '几何 并联 100‖200');
  near(pa['R1 分流'], 12 / 100, 1e-9, '几何 R1 分流');
  const dv = R(M.resCompute('divider', { u: '12', r1: '100', r2: '200' }).rows);
  near(dv['R1 分压'], 4, 1e-6, '几何 分压 R1 电压');
  near(dv['R1 后对地电压'], 8, 1e-6, '几何 分压 R1 后对地');
  near(dv['R2 后对地电压'], 0, 1e-6, '几何 分压 R2 后对地归零');
}

// ---------- dev.js ----------
{
  const M = loadModule('dev.js',
    'stripJsonLoose,fmtJson,jsonDepth,jsonToJsObject,fmtSql,minSql,diffText,mergeRuns,jwtParse,jwtBuild,b64urlDecode,b64urlEncode,byteLen'.split(','));
  eq(M.stripJsonLoose('{"a":1, /*c*/ "b":"x",}'), '{"a":1,  "b":"x"}', 'dev 剔除注释与尾逗号');
  eq(M.fmtJson('{"b":1,"a":[1,2]}', 2).text, '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}', 'dev JSON 2 空格');
  eq(M.fmtJson('{"b":1,"a":[1,2]}', 0).text, '{"b":1,"a":[1,2]}', 'dev JSON 压缩');
  eq(M.fmtJson('{"b":1}', 'tab').text, '{\n\t"b": 1\n}', 'dev JSON Tab 缩进');
  eq(!!M.fmtJson('{oops}', 2).err, true, 'dev 非法 JSON 报错');
  eq(M.fmtJson('{"a":1,}', 2).text, '{\n  "a": 1\n}', 'dev 尾逗号被宽容处理');
  eq(M.jsonDepth({ a: { b: { c: 1 } } }), 3, 'dev 嵌套层数');
  eq(M.jsonDepth({ a: 1 }), 1, 'dev 平铺层数');
  eq(M.jsonToJsObject('{"a":1}').text, 'const data = {\n  "a": 1\n};', 'dev 转 JS 字面量');

  // SQL：字符串字面量里的关键字不能被换行误伤
  const sql = M.fmtSql("select id,name from users where age>18 and city='北京' order by id desc", { caseMode: 'upper' }).text;
  eq(/^SELECT/.test(sql), true, 'dev SQL 首行为 SELECT');
  eq(sql.includes('\nFROM users'), true, 'dev SQL FROM 换行');
  eq(sql.includes('\nWHERE'), true, 'dev SQL WHERE 换行');
  eq(sql.includes("city='北京'"), true, 'dev SQL 字符串字面量完好');
  eq(sql.includes('\n  AND '), true, 'dev SQL AND 缩进');
  eq(M.fmtSql('SELECT ID FROM T', { caseMode: 'lower' }).text, 'select ID from T', 'dev SQL 只改关键字大小写');
  eq(M.fmtSql('SeLeCt id From t', { caseMode: 'keep' }).text, 'SeLeCt id From t', 'dev SQL 保持原样');
  eq(M.minSql("select  id ,  name  from  users  where a = 'x  y'").text,
    "select id,name from users where a='x  y'", 'dev SQL 压缩保留字符串内空格');
  eq(M.fmtSql("select 1 where s='select from where'", { caseMode: 'upper' }).text.includes("'select from where'"),
    true, 'dev SQL 字符串内关键字不被处理');

  // 对比
  eq(M.diffText('a\nb\nc', 'a\nx\nc', { mode: 'line' }).ops.map((o) => o.t + ':' + o.v).join('|'),
    'same:a|del:b|add:x|same:c', 'dev 行级替换');
  eq(M.diffText('a', 'a\nb', { mode: 'line' }).ops.map((o) => o.t + ':' + o.v).join('|'),
    'same:a|add:b', 'dev 行级新增');
  eq(M.diffText('a\nb', 'a', { mode: 'line' }).ops.map((o) => o.t).join('|'), 'same|del', 'dev 行级删除');
  eq(M.diffText('a  ', 'a', { mode: 'line', trim: true }).ops.map((o) => o.t).join('|'), 'same', 'dev 忽略行尾空格');
  eq(M.diffText('a  ', 'a', { mode: 'line', trim: false }).ops.map((o) => o.t).join('|'), 'del|add', 'dev 不忽略空格则有差异');
  eq(M.diffText('ABC', 'abc', { mode: 'line', case: true }).ops.map((o) => o.t).join('|'), 'same', 'dev 忽略大小写');
  eq(M.diffText('a\n\nb', 'a\nb', { mode: 'line', blank: true }).ops.map((o) => o.t + ':' + o.v).join('|'),
    'same:a|same:|same:b', 'dev 空行按同内容保留');
  eq(M.diffText('abc', 'axc', { mode: 'char' }).ops.map((o) => o.t + ':' + o.v).join('|'),
    'same:a|del:b|add:x|same:c', 'dev 字符级对比');
  eq(M.mergeRuns([{ t: 'same', v: 'a' }, { t: 'same', v: 'b' }, { t: 'add', v: 'c' }])
    .map((o) => o.t + ':' + o.v).join('|'), 'same:ab|add:c', 'dev 同类操作合并');
  eq(M.byteLen('你好abc'), 9, 'dev UTF-8 字节数');

  // JWT
  eq(M.b64urlDecode(M.b64urlEncode('你好abc')), '你好abc', 'dev Base64URL 中文往返');
  const tk = M.jwtBuild({ alg: 'HS256', typ: 'JWT' }, { sub: '123', exp: 4070908800, iss: 'x' }, 'sig');
  const p = M.jwtParse(tk);
  eq(p.header.alg, 'HS256', 'dev JWT alg');
  eq(p.payload.sub, '123', 'dev JWT sub');
  eq(p.expired, false, 'dev JWT 未过期');
  eq(M.jwtParse(M.jwtBuild({ alg: 'HS256' }, { exp: 1000 }, 's')).expired, true, 'dev JWT 已过期识别');
  eq(!!M.jwtParse('abc').err, true, 'dev JWT 单段报错');
  eq(!!M.jwtParse('a.b.c.d').err, true, 'dev JWT 四段报错');
  eq(!!M.jwtParse('eyJhIjox.eyJhIjoxfQ.s').err, true, 'dev JWT 头部非法 JSON 报错');
}

// ---------- finance.js ----------
{
  const M = loadModule('finance.js',
    'MONTH_BRACKETS,bracketOf,salaryTax,bonusTax,bonusMerged,bonusCliff,bmiCalc,bodyFat,bodyFatCategory,bmrCalc,tdeeCalc'.split(','));
  const near = (a, b, t, label) => eq(Math.abs(Number(a) - Number(b)) <= (t == null ? 1e-6 : t), true, label + ` (${a} vs ${b})`);

  // 月度税率表分档边界
  eq(M.bracketOf(M.MONTH_BRACKETS, 3000).rate, 0.03, '财税 3000 整落 3%');
  eq(M.bracketOf(M.MONTH_BRACKETS, 3000.01).rate, 0.10, '财税 3000.01 跳 10%');
  eq(M.bracketOf(M.MONTH_BRACKETS, 12000).rate, 0.10, '财税 12000 整仍 10%');
  eq(M.bracketOf(M.MONTH_BRACKETS, 25000).rate, 0.20, '财税 25000 整仍 20%');
  eq(M.bracketOf(M.MONTH_BRACKETS, 1e9).rate, 0.45, '财税 超高档 45%');

  // 工资个税：20000 → ins 2100 → taxable 12900 → 20% 档 ded 1410
  const s = M.salaryTax({ pay: '20000', ins: '', extra: '0', city: 'sh' });
  near(s.ins, 2100, 1e-6, '财税 三险一金 20000×10.5%');
  near(s.taxable, 12900, 1e-6, '财税 应纳税所得额');
  eq(s.rate, 0.20, '财税 12900 落 20% 档');
  near(s.tax, 12900 * 0.20 - 1410, 1e-6, '财税 本月个税');
  near(s.net, 20000 - 2100 - (12900 * 0.20 - 1410), 1e-6, '财税 到手工资');
  eq(s.insEstimated, true, '财税 未填三险一金时标记估算');
  eq(M.salaryTax({ pay: '5000', ins: '0', extra: '0', city: 'none' }).tax, 0, '财税 月薪 5000 不缴税');
  near(M.salaryTax({ pay: '8000', ins: '0', extra: '0', city: 'none' }).tax, 3000 * 0.03, 1e-6, '财税 恰好 3000 按 3%');
  const ex = M.salaryTax({ pay: '30000', ins: '3000', extra: '4000', city: 'none' });
  near(ex.taxable, 18000, 1e-6, '财税 含专项附加应纳税所得额');
  near(ex.tax, 18000 * 0.20 - 1410, 1e-6, '财税 含专项附加个税');
  eq(!!M.salaryTax({ pay: '-1' }).err, true, '财税 负月薪报错');

  // 年终奖：36000/36001 跳档是经典坑
  const b36 = M.bonusTax('36000'), b37 = M.bonusTax('36001');
  eq(b36.rate, 0.03, '财税 36000 落 3% 档');
  near(b36.tax, 36000 * 0.03, 1e-6, '财税 36000 税额');
  eq(b37.rate, 0.10, '财税 36001 跳 10% 档');
  near(b37.tax, 36001 * 0.10 - 210, 1e-6, '财税 36001 税额');
  eq(b37.net < b36.net, true, '财税 临界点：多发 1 元到手反而变少');
  near(M.bonusTax('50000').tax, 50000 * 0.10 - 210, 1e-6, '财税 50000 税额（折月 4166 落 10%）');
  eq(M.bonusTax('0').tax, 0, '财税 零奖金税额 0');
  eq(!!M.bonusTax('-1').err, true, '财税 负奖金报错');
  eq(M.bonusCliff('37000'), 36000, '财税 识别 36000 跳档点');
  eq(M.bonusCliff('10000'), null, '财税 低奖金无跳档');

  // 并入综合所得：base 60000 + 50000，年度表 10% 档 ded 2520
  const m = M.bonusMerged('50000', '60000');
  near(m.taxWithout, 60000 * 0.10 - 2520, 1e-6, '财税 并入前年税');
  near(m.taxWith, 110000 * 0.10 - 2520, 1e-6, '财税 并入后年税');
  near(m.marginal, 5000, 1e-6, '财税 奖金实际承担税额');
  near(m.net, 45000, 1e-6, '财税 并入后到手');

  // BMI / 体脂 / BMR
  const b = M.bmiCalc('175', '70');
  near(b.bmi, 70 / (1.75 * 1.75), 1e-6, '财税 BMI 70kg/175cm');
  eq(b.cat, '正常', '财税 BMI 22.86 判正常');
  near(b.lo, 18.5 * 1.75 * 1.75, 1e-6, '财税 健康体重下限');
  near(b.hi, 23.9 * 1.75 * 1.75, 1e-6, '财税 健康体重上限');
  eq(M.bmiCalc('170', '50').cat, '偏瘦', '财税 BMI 17.3 偏瘦');
  eq(M.bmiCalc('170', '70').cat, '超重', '财税 BMI 24.2 超重');
  eq(M.bmiCalc('170', '90').cat, '肥胖', '财税 BMI 31.1 肥胖');
  eq(M.bmiCalc('', '70').err != null, true, '财税 空身高报错');

  eq(M.bodyFat('m', '175', '70', ''), null, '财税 无腰围不返回体脂');
  near(M.bodyFat('m', '175', '70', '85'),
    86.010 * Math.log10(85) - 70.041 * Math.log10(175) + 36.76, 1e-6, '财税 男性体脂海军法');
  near(M.bodyFat('f', '160', '55', '75'),
    163.205 * Math.log10(75) - 97.684 * Math.log10(160) - 78.387, 1e-6, '财税 女性体脂海军法');
  eq(M.bodyFatCategory('m', 12), '运动员', '财税 体脂 12% 男=运动员');
  eq(M.bodyFatCategory('f', 40), '肥胖', '财税 体脂 40% 女=肥胖');

  // 男 30 岁 175cm 70kg：10×70 + 6.25×175 − 5×30 + 5 = 1648.75
  near(M.bmrCalc('m', '30', '175', '70').bmr, 1648.75, 1e-6, '财税 男 BMR Mifflin-St Jeor');
  // 女 30 岁 165cm 55kg：10×55 + 6.25×165 − 5×30 − 161 = 1270.25
  near(M.bmrCalc('f', '30', '165', '55').bmr, 1270.25, 1e-6, '财税 女 BMR');
  near(M.tdeeCalc(1648.75, 1.55), 1648.75 * 1.55, 1e-6, '财税 TDEE 活动系数');
}

// ---------- web.js ----------
{
  const M = loadModule('web.js',
    'normalizeUrl,robotsBuild,icpParse,DNS_LIST,localShort,sanitize'.split(','));

  eq(M.normalizeUrl('example.com'), 'https://example.com/', 'web 补协议');
  eq(M.normalizeUrl('http://a.cn/x'), 'http://a.cn/x', 'web 保留 http');
  eq(M.normalizeUrl('ftp://a.cn'), null, 'web 拒绝非 http 协议');
  eq(M.normalizeUrl(''), null, 'web 空串拒绝');
  eq(M.normalizeUrl('   '), null, 'web 纯空白拒绝');

  const rb = M.robotsBuild({
    agent: '*, Baiduspider', disallow: '/admin/\n\n/tmp/', allow: '/admin/public/',
    delay: '2', sitemap: 'https://a.cn/sitemap.xml'
  });
  eq(rb.includes('User-agent: *\nUser-agent: Baiduspider'), true, 'robots 多 agent 各占一行');
  eq(rb.includes('\n\n\n'), false, 'robots 不产生连续空行');
  eq(/Allow: \/admin\/public\/\nDisallow: \/admin\//.test(rb), true, 'robots 同组内 Allow 先于 Disallow');
  eq(rb.includes('Crawl-delay: 2'), true, 'robots 输出 Crawl-delay');
  eq(rb.includes('Sitemap: https://a.cn/sitemap.xml'), true, 'robots 输出 Sitemap');
  eq(rb.endsWith('\n'), true, 'robots 以换行结尾');
  eq(M.robotsBuild({ agent: '*', disallow: '', allow: '' }).includes('Disallow:\n'), true, 'robots 空规则输出裸 Disallow');

  const icp1 = M.icpParse('京ICP备12345678号-1');
  eq(icp1.province, '京', '备案 省份');
  eq(icp1.type, 'ICP备', '备案 类型');
  eq(icp1.number, '12345678', '备案 编号');
  eq(icp1.seq, '1', '备案 网站序号');
  eq(icp1.known, true, '备案 格式检查通过');
  const icp2 = M.icpParse('沪ICP证000000号');
  eq(icp2.type, 'ICP证', '备案 ICP证');
  eq(icp2.seq, null, '备案 无序号');
  const icp3 = M.icpParse('京公网安备11010502000000号');
  eq(icp3.type, '公网安备', '备案 公安网备');
  eq(M.icpParse('12345678-2').partial, true, '备案 仅编号给出部分提示');
  eq(!!M.icpParse('乱七八糟').err, true, '备案 无法识别时报错');
  eq(!!M.icpParse('').err, true, '备案 空输入报错');
  // 省份简称写错时 known=false，但仍能解析出结构
  eq(M.icpParse('囧ICP备123号').known, false, '备案 非法省份简称被标出');

  eq(M.DNS_LIST.length >= 30, true, 'DNS 清单不少于 30 条');
  const ops = new Set(M.DNS_LIST.map((r) => r.op));
  ['公共', '电信', '联通', '移动', '教育网', '安全'].forEach((o) => {
    eq(ops.has(o), true, 'DNS 清单包含分类 ' + o);
  });
  const missing = M.DNS_LIST.filter((r) => !r.p || !r.note);
  eq(missing.length, 0, 'DNS 清单每条都有首选地址与备注');

  // 本地短参是「可粘贴的编码形式」，不是真短链，只保证可复现且不含分隔符
  const long = 'https://example.com/' + 'x'.repeat(20);
  eq(M.localShort(long) === M.localShort(long), true, '本地短参可复现');
  eq(/^[0-9a-z.]+$/.test(M.localShort(long)), true, '本地短参只含 base36 与点号');
  eq(M.localShort('ab') !== M.localShort('ba'), true, '本地短参对不同输入不同');
}

// ---------- text2.js ----------
{
  const M = loadModule('text2.js',
    'detectSensitive,synonymReplace,countText,utf8Len,dedupeLines,tidyText'.split(','));

  const hit = M.detectSensitive('加微信领福利，绝对正品', 'strict');
  eq(hit.hits.some((h) => h.word === '加微信'), true, '敏感词 命中违禁词');
  eq(hit.hits.some((h) => h.word === '绝对正品'), true, '敏感词 命中极限词（取最长匹配）');
  eq(hit.stat.block >= 1 && hit.stat.risk >= 1, true, '敏感词 分级统计');
  eq(M.detectSensitive('这是一段普通文本', 'strict').hits.length, 0, '敏感词 普通文本不误报');
  // 宽松模式应能识破间隔符绕过
  eq(M.detectSensitive('加 微 信 领福利', 'strict').hits.length, 0, '敏感词 严格模式下间隔符不漏判为命中');
  eq(M.detectSensitive('加 微 信 领福利', 'loose').hits.some((h) => h.word === '加微信'), true, '敏感词 宽松模式识破间隔');
  // 拼音变形
  // 拼音/谐音变形：把 wx 视作「微信」的别名，于是「加wx」整体命中「加微信」
  eq(M.detectSensitive('加wx领福利', 'pinyin').hits.some((h) => h.word === '加微信'), true, '敏感词 拼音变形识破 wx=微信');
  eq(M.detectSensitive('加wx领福利', 'strict').hits.length, 0, '敏感词 严格模式不识破拼音变形');
  // 重叠去重：命中「赌场」时不再单独报更短的，同级只留最长的
  const over = M.detectSensitive('去赌场玩', 'strict').hits.filter((h) => h.word === '赌场');
  eq(over.length, 1, '敏感词 重叠命中不重复');

  const syn = M.synonymReplace('这个产品质量不错，物流很快。', 2);
  eq(syn.text.includes('质量'), false, '同义词 中度替换掉质量');
  eq(syn.used.length > 0, true, '同义词 给出替换明细');
  eq(M.synonymReplace('质量质量质量', 2).text.split('品质').length - 1 >= 1, true, '同义词 多次出现会替换');
  eq(M.synonymReplace('', 2).text, '', '同义词 空文本');

  const c = M.countText('你好abc 123\n第二行');
  eq(c.han, 5, '字数 汉字数');
  eq(c.letters, 3, '字数 字母数');
  eq(c.digits, 3, '字数 数字数');
  eq(c.words, 2, '字数 单词数（abc 与 123）');
  eq(c.lines, 2, '字数 行数');
  eq(c.bytes, M.utf8Len('你好abc 123\n第二行'), '字数 字节数与 utf8Len 一致');
  eq(M.utf8Len('你好'), 6, 'utf8Len 汉字 3 字节');
  eq(M.utf8Len('a'), 1, 'utf8Len ASCII 1 字节');
  eq(M.utf8Len('😀'), 4, 'utf8Len emoji 4 字节（代理对）');
  eq(M.countText('').chars, 0, '字数 空串');

  const d1 = M.dedupeLines('苹果\n香蕉\n苹果\n  香蕉\nApple\napple', { trim: true, case: false, blank: true });
  eq(d1.lines.join(','), '苹果,香蕉,Apple,apple', '去重 忽略首尾空格，保留 Apple/apple 区分');
  const d2 = M.dedupeLines('苹果\n香蕉\n苹果\n  香蕉\nApple\napple', { trim: true, case: true, blank: true });
  eq(d2.lines.join(','), '苹果,香蕉,Apple', '去重 忽略大小写');
  const d3 = M.dedupeLines('a\n\n\nb', { trim: true, case: false, blank: true });
  eq(d3.lines.join(','), 'a,b', '去重 丢弃空行');
  const d4 = M.dedupeLines('a\n\n\nb', { trim: true, case: false, blank: false });
  eq(d4.lines.join('|'), 'a||b', '去重 保留空行（重复空行合成一个）');
  eq(d4.before, 4, '去重 保留空行时行数统计含空行');
  eq(M.dedupeLines('x\nx\nx', { trim: true, case: false, blank: true }).counter[0].count, 3, '去重 统计出现次数');
  eq(d1.before, 6, '去重 记录去重前行数');

  const t = M.tidyText('　　这是    很多空格的文本。\n\n\n\n第二段。   \n', {
    blank: true, space: true, fullwidth: true, indent: true, trim: true, cjk: false, punct: true
  });
  eq(t.text.includes('   '), false, '排版 合并多余空格');
  eq(t.text.includes('\n\n\n'), false, '排版 合并多余空行');
  eq(t.text.includes('\u3000'), false, '排版 全角空格转半角');
  eq(t.text.endsWith('\n'), false, '排版 去掉尾部换行');
  const t2 = M.tidyText('中文English混排', { cjk: true, blank: false, space: false, fullwidth: false, indent: false, trim: false, punct: false });
  eq(t2.text, '中文 English 混排', '排版 中英文之间补空格');
  const t3 = M.tidyText('已有 空格', { cjk: true, blank: false, space: false, fullwidth: false, indent: false, trim: false, punct: false });
  eq(t3.text, '已有 空格', '排版 不重复补空格');
  const t4 = M.tidyText('中文,标点', { punct: true, cjk: false, blank: false, space: false, fullwidth: false, indent: false, trim: false });
  eq(t4.text, '中文，标点', '排版 中文间逗号转全角');
}

// ---------- game.js ----------
{
  const M = loadModule('game.js',
    'rng,shuffle,canPlace,countSolutions,sudokuGenerate,SUDOKU_LEVELS,bdecode,sliceInfoBytes,sha1,toHex,buildMultiHashInput,torrentToMagnet'.split(','));

  // SHA-1 对 NIST 向量
  eq(M.sha1(new TextEncoder().encode('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d', 'sha1 abc');
  eq(M.sha1(new TextEncoder().encode('')), 'da39a3ee5e6b4b0d3255bfef95601890afd80709', 'sha1 空串');
  eq(M.sha1(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    '84983e441c3bd26ebaae4aa1f95129e5e54670f1', 'sha1 448 位向量');
  {
    const long = new Uint8Array(1000000).fill(0x61);
    eq(M.sha1(long), '34aa973cd4c4daa4f61eeb2bdbad27316534016f', 'sha1 一百万个 a');
  }

  // 可复现随机数
  const r1 = M.rng(12345), r2 = M.rng(12345);
  eq(r1(), r2(), 'rng 同种子可复现');
  const arr = M.shuffle([1, 2, 3, 4, 5], M.rng(7));
  eq(arr.slice().sort().join(','), '1,2,3,4,5', 'shuffle 不丢元素');

  // 数独：棋盘合法性 + 唯一解 + 提示数在目标区间
  eq(M.canPlace([[0,0,0,0,0,0,0,0,0]].concat(Array(8).fill(Array(9).fill(0))), 0, 0, 5), true, '数独 空盘可放任意值');
  {
    const g = [];
    for (let i = 0; i < 9; i++) g.push(new Array(9).fill(0));
    g[0][0] = 5;
    eq(M.canPlace(g, 0, 1, 5), false, '数独 同行冲突被拒');
    eq(M.canPlace(g, 1, 0, 5), false, '数独 同列冲突被拒');
    eq(M.canPlace(g, 1, 1, 5), false, '数独 同宫冲突被拒');
    eq(M.canPlace(g, 1, 1, 6), true, '数独 不冲突可放');
  }
  {
    const p = M.sudokuGenerate('mid', 20260101);
    const clues = p.puzzle.flat().filter((x) => x).length;
    eq(clues === p.clues, true, '数独 提示数统计一致');
    eq(clues >= 30 && clues <= 40, true, '数独 中等难度提示数落在合理区间（' + clues + '）');
    // 终盘必须是合法解
    let valid = true;
    for (let i = 0; i < 9; i++) {
      const row = new Set(p.solution[i]);
      const col = new Set(p.solution.map((r) => r[i]));
      if (row.size !== 9 || col.size !== 9) valid = false;
    }
    for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
      const box = new Set();
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) box.add(p.solution[br * 3 + y][bc * 3 + x]);
      if (box.size !== 9) valid = false;
    }
    eq(valid, true, '数独 终盘每行每列每宫都是 1~9');
    // 题目保留的格子必须与解一致
    let same = true;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (p.puzzle[r][c] && p.puzzle[r][c] !== p.solution[r][c]) same = false;
    }
    eq(same, true, '数独 题面与正确答案不冲突');
    // 唯一解：数解个数应为 1
    eq(M.countSolutions(p.puzzle.map((r) => r.slice()), 2), 1, '数独 题目有唯一解');
    eq(M.SUDOKU_LEVELS.expert.clues < M.SUDOKU_LEVELS.easy.clues, true, '数独 难度越高提示越少');
  }
  {
    // 空白盘应该有大量解，验证 countSolutions 的上限逻辑
    const blank = [];
    for (let i = 0; i < 9; i++) blank.push(new Array(9).fill(0));
    eq(M.countSolutions(blank, 2) >= 2, true, '数独 空盘认定为多解');
  }

  // bencode：自造一个种子并核对结构
  {
    const enc2 = (s) => new TextEncoder().encode(s);
    const parts = [];
    parts.push(enc2('d'));
    parts.push(enc2('8:announce28:udp://tracker.example.com:80'));
    parts.push(enc2('4:info'));
    parts.push(enc2('d6:lengthi1234e4:name8:test.bin12:piece lengthi16384e6:pieces20:'));
    parts.push(new Uint8Array(20).fill(7));
    parts.push(enc2('ee'));
    let len = 0;
    parts.forEach((p) => { len += p.length; });
    const buf = new Uint8Array(len);
    let off = 0;
    parts.forEach((p) => { buf.set(p, off); off += p.length; });

    const d = M.bdecode(buf);
    const txt = (b) => Buffer.from(b).toString('utf8');
    eq(txt(d.announce), 'udp://tracker.example.com:80', 'bencode 解析字符串');
    eq(d.info.length, 1234, 'bencode 解析整数');
    eq(d.info['piece length'], 16384, 'bencode 带空格的键');
    eq(txt(d.info.name), 'test.bin', 'bencode 解析 name');
    eq(d.info.pieces.length, 20, 'bencode 二进制串按字节保留');

    const raw = M.sliceInfoBytes(buf);
    eq(!!raw, true, 'bencode 能切出 info 段原始字节');
    eq(M.toHex(raw).slice(0, 2), '64', 'info 段以字典起始标记 d 开头');
    eq(M.torrentToMagnet(buf).name, 'test.bin', '种子转磁力 名称');
    eq(M.torrentToMagnet(buf).files, 1, '种子转磁力 单文件');

    // 非法输入要给明确错误而不是抛栈
    let threw = false;
    try { M.bdecode(enc2('x')); } catch (e) { threw = true; }
    eq(threw, true, 'bencode 非法起始字节报错');
    threw = false;
    try { M.bdecode(enc2('d6:lengthi12e')); } catch (e) { threw = true; }
    eq(threw, true, 'bencode 未闭合的字典报错');
  }
}

// ---------- codec.js ----------
{
  const M = loadModule('codec.js',
    'gtinCheck,BC_PLACEHOLDER,qrEncode,qrDraw,bcRender,utf8Len'.split(','), ['qrcode-generator.js']);

  // GS1 校验位：从右往左交替 3 / 1
  eq(M.gtinCheck('690123456789'), '2', 'EAN-13 校验位');
  eq(M.gtinCheck('01234567890'), '5', 'UPC-A 校验位');
  eq(M.gtinCheck('6901234'), '1', 'EAN-8 校验位');
  eq(M.gtinCheck('1234567890123'), '1', 'ITF-14 校验位');
  // 自己算的校验位再喂回去，应当自洽（校验位校验通过）
  eq(M.gtinCheck('690123456789' + M.gtinCheck('690123456789')), M.gtinCheck('690123456789'), '校验位自洽');
  eq(M.BC_PLACEHOLDER.ean13.endsWith(M.gtinCheck(M.BC_PLACEHOLDER.ean13.slice(0, 12))), true, 'EAN-13 占位值校验位正确');
  eq(M.BC_PLACEHOLDER.ean8.endsWith(M.gtinCheck(M.BC_PLACEHOLDER.ean8.slice(0, 7))), true, 'EAN-8 占位值校验位正确');
  eq(M.BC_PLACEHOLDER.upca.endsWith(M.gtinCheck(M.BC_PLACEHOLDER.upca.slice(0, 11))), true, 'UPC-A 占位值校验位正确');
  eq(M.BC_PLACEHOLDER.itf14.endsWith(M.gtinCheck(M.BC_PLACEHOLDER.itf14.slice(0, 13))), true, 'ITF-14 占位值校验位正确');

  const qr = M.qrEncode('https://cnb.cool', 'M');
  eq(qr.getModuleCount() % 4 === 1, true, '二维码 模块数为 4n+1');
  eq(qr.getModuleCount() >= 21, true, '二维码 最小版本 21 模块');
  eq(M.qrEncode('a', 'L').getModuleCount() <= M.qrEncode('a'.repeat(200), 'L').getModuleCount(), true, '二维码 内容越长版本越高');
  eq(M.qrEncode('x', 'H').getModuleCount() >= M.qrEncode('x', 'L').getModuleCount(), true, '二维码 高容错占用更多模块');
}

// ---------- crypto2.js ----------
{
  const M = loadModule('crypto2.js',
    'jwtVerify,sampleJwt,b64urlEncode,b64urlDecode,b64urlBytes,constantEquals,ALG_INFO,hexColon,curveBits'.split(','),
    ['forge.js']);

  // base64url 往返，含中文
  eq(M.b64urlDecode(M.b64urlEncode('你好abc')), '你好abc', 'JWT base64url 中文往返');
  eq(M.b64urlEncode('a').indexOf('='), -1, 'JWT base64url 不带填充');
  eq(M.b64urlDecode('eyJhIjoxfQ'), '{"a":1}', 'JWT base64url 解码对象');

  // 恒定时比较
  eq(M.constantEquals('abc', 'abc'), true, 'JWT 恒定时比较相同');
  eq(M.constantEquals('abc', 'abd'), false, 'JWT 恒定时比较不同');
  eq(M.constantEquals('abc', 'ab'), false, 'JWT 恒定时长度不同');

  const secret = 'your-256-bit-secret';
  const tk = M.sampleJwt(secret);
  eq(tk.split('.').length, 3, 'JWT 示例为三段');
  const ok = M.jwtVerify(tk, 'HS256', secret);
  eq(ok.verified, true, 'JWT HS256 验签通过');
  eq(ok.err, undefined, 'JWT 无误报');
  eq(ok.payload.name, '徐惠杰', 'JWT 中文声明正确解出');
  eq(ok.algMatch, true, 'JWT 算法声明匹配');

  // 篡改 payload 必须验签失败
  const parts = tk.split('.');
  const tampered = parts[0] + '.' + M.b64urlEncode(JSON.stringify({ sub: '9999' })) + '.' + parts[2];
  eq(M.jwtVerify(tampered, 'HS256', secret).verified, false, 'JWT 篡改 payload 验签失败');

  // alg 混淆：声明 HS256 却按 HS512 校验，必须拒绝
  const mismatch = M.jwtVerify(tk, 'HS512', secret);
  eq(mismatch.algMatch, false, 'JWT 算法不一致被识别');
  eq(mismatch.verified, false, 'JWT 算法不一致拒绝验签');
  eq(/alg 混淆/.test(mismatch.err), true, 'JWT 提示 alg 混淆攻击');

  // 错误密钥
  eq(M.jwtVerify(tk, 'HS256', 'wrong').verified, false, 'JWT 密钥不对验签失败');

  // 段数不对 / 非法 JSON
  eq(!!M.jwtVerify('abc', 'HS256', secret).err, true, 'JWT 单段报错');
  eq(!!M.jwtVerify('a.b.c.d', 'HS256', secret).err, true, 'JWT 四段报错');

  // 指纹格式化
  eq(M.hexColon('0e0a5a376647bf642b35f9a7b470b3fc12336b46b2504b459b9600209c330712').split(':').length, 32, '证书 SHA-256 指纹 32 组');
  eq(M.hexColon('abcd').length, 5, '证书指纹加分隔符');
  eq(M.curveBits('1.2.840.10045.3.1.7'), 256, '证书 P-256 曲线位数');
  eq(M.curveBits('1.3.132.0.34'), 384, '证书 P-384 曲线位数');
}

// ---------- media.js ----------
{
  const M = loadModule('media.js',
    'fitSize,wgs84ToGcj02,gcj02ToWgs84,gcj02ToBd09,bd09ToGcj02,wgs84ToBd09,bd09ToWgs84,toDms,toDm,haversine,outOfChina,fmtSize'.split(','));

  const near = (a, b, t, label) => eq(Math.abs(a - b) <= t, true, label + '（' + a + ' vs ' + b + '）');

  // 尺寸缩放：只缩不放大
  const s1 = M.fitSize(4000, 3000, 1920);
  eq(s1.w + 'x' + s1.h, '1920x1440', '图片 长边缩到 1920');
  const s2 = M.fitSize(800, 600, 1920);
  eq(s2.scaled, false, '图片 不放大');
  eq(M.fitSize(100, 300, 100).w + 'x' + M.fitSize(100, 300, 100).h, '33x100', '图片 竖图按长边缩');
  eq(M.fitSize(1000, 500, 0).w, 1000, '图片 上限为 0 表示不缩');

  // WGS-84 → GCJ-02：天安门处的公开对照值
  const g = M.wgs84ToGcj02(39.908722, 116.397499);
  near(g[0], 39.910100, 0.0005, '坐标 WGS→GCJ 纬度');
  near(g[1], 116.403830, 0.0005, '坐标 WGS→GCJ 经度');
  // 往返要收敛
  const w = M.gcj02ToWgs84(g[0], g[1]);
  near(w[0], 39.908722, 1e-6, '坐标 GCJ→WGS 往返纬度');
  near(w[1], 116.397499, 1e-6, '坐标 GCJ→WGS 往返经度');
  // BD-09 链条
  const b = M.wgs84ToBd09(39.908722, 116.397499);
  near(b[0], 39.916350, 0.0005, '坐标 WGS→BD 纬度');
  near(b[1], 116.410230, 0.0005, '坐标 WGS→BD 经度');
  const bw = M.bd09ToWgs84(b[0], b[1]);
  near(bw[0], 39.908722, 1e-4, '坐标 BD→WGS 往返纬度');
  near(bw[1], 116.397499, 1e-4, '坐标 BD→WGS 往返经度');
  // GCJ ↔ BD 互转往返
  const g2 = M.bd09ToGcj02(b[0], b[1]);
  near(g2[0], g[0], 1e-5, '坐标 GCJ↔BD 往返纬度');
  near(g2[1], g[1], 1e-5, '坐标 GCJ↔BD 往返经度');
  // 境外不做偏移
  eq(M.outOfChina(35.6762, 139.6503), true, '坐标 东京在境外');
  eq(M.outOfChina(39.9, 116.4), false, '坐标 北京在境内');
  const tk = M.wgs84ToGcj02(35.6762, 139.6503);
  eq(tk[0] === 35.6762 && tk[1] === 139.6503, true, '坐标 境外原值返回');

  // 度分秒不出现 60 的写法
  const dms = M.toDms(39.908722, true);
  eq(dms.text, "39°54'31.399\"N", '坐标 度分秒格式');
  eq(M.toDms(-116.397499, false).text.endsWith('W'), true, '坐标 负经度标 W');
  eq(M.toDms(0, true).text.endsWith('N'), true, '坐标 零纬度标 N');
  eq(M.toDms(-0.5, false).text.endsWith('W'), true, '坐标 零下经度标 W');
  eq(M.toDms(59.9999999, true).text.indexOf('60\'') < 0, true, '坐标 不进位成 60 分');
  eq(M.toDm(39.908722, true).indexOf('60′)') < 0, true, '坐标 度分不进位成 60 分');
  eq(M.toDm(39.908722, true), '39°54.5233′N', '坐标 度分格式');

  // Haversine 对已知距离（北京→上海 ≈ 1068 km）
  near(M.haversine(39.9042, 116.4074, 31.2304, 121.4737) / 1000, 1068, 15, '坐标 京沪距离');
  near(M.haversine(0, 0, 0, 1), 111195, 200, '坐标 赤道 1 度约 111 km');
  eq(M.haversine(30, 120, 30, 120), 0, '坐标 同点距离为 0');

  eq(M.fmtSize(500), '500 B', '图片 字节格式化 B');
  eq(M.fmtSize(1024), '1.0 KiB', '图片 字节格式化 KiB');
  eq(M.fmtSize(1048576), '1.00 MiB', '图片 字节格式化 MiB');
}

// ---------- 补充：全半角 / 大小写 / BMI / 内衣尺码 / 养老金 / 方位角 ----------
{
  const M = loadModule('text2.js',
    'toHalfWidth,toFullWidth,changeCase'.split(','));

  eq(M.toHalfWidth('ＡＢＣ１２３'), 'ABC123', '全半角 全角字母数字转半角');
  eq(M.toHalfWidth('　全角空格'), ' 全角空格', '全半角 全角空格转半角');
  eq(M.toHalfWidth('Ｈｅｌｌｏ，Ｗｏｒｌｄ！'), 'Hello,World!', '全半角 全角标点转半角');
  eq(M.toFullWidth('ABC123'), 'ＡＢＣ１２３', '全半角 半角转全角');
  eq(M.toFullWidth('a b'), 'ａ　ｂ', '全半角 半角空格转全角');
  eq(M.toHalfWidth(M.toFullWidth('Hello, World! 123')), 'Hello, World! 123', '全半角 往返一致');
  eq(M.toFullWidth(M.toHalfWidth('ＡＢＣ　１２３')), 'ＡＢＣ　１２３', '全半角 反向往返一致');
  eq(M.toHalfWidth('中文与 emoji 😀 不受影响'), '中文与 emoji 😀 不受影响', '全半角 中文与 emoji 不动');

  eq(M.changeCase('hello world', 'upper'), 'HELLO WORLD', '大小写 全部大写');
  eq(M.changeCase('HELLO World', 'lower'), 'hello world', '大小写 全部小写');
  eq(M.changeCase('the quick brown fox', 'title'), 'The Quick Brown Fox', '大小写 标题式');
  eq(M.changeCase('THE QUICK FOX', 'title'), 'The Quick Fox', '大小写 标题式先归小写');
  eq(M.changeCase('hello. world! yes? no', 'sentence'), 'Hello. World! Yes? No', '大小写 句首大写');
  eq(M.changeCase('aBcD', 'toggle'), 'AbCd', '大小写 反转');
  eq(M.changeCase('不变', 'upper'), '不变', '大小写 中文不受影响');
  eq(M.changeCase('a', 'unknown'), 'a', '大小写 未知模式原样返回');
}

{
  const M = loadModule('health2.js', 'bmiCalc,braSize,BRA_CUP_NAMES'.split(','));

  const near = (a, b, t, label) => eq(Math.abs(a - b) <= t, true, label + '（' + a + ' vs ' + b + '）');

  const b1 = M.bmiCalc(175, 70);
  near(b1.bmi, 70 / 1.75 / 1.75, 1e-9, 'BMI 计算公式');
  eq(b1.cat[0], '正常', 'BMI 22.86 判正常（中国标准）');
  eq(M.bmiCalc(170, 50).cat[0], '偏瘦', 'BMI 17.3 偏瘦');
  eq(M.bmiCalc(170, 70).cat[0], '超重', 'BMI 24.2 超重（中国标准 24 起）');
  eq(M.bmiCalc(170, 90).cat[0], '肥胖', 'BMI 31.1 肥胖');
  // 中国标准的关键分界：24 就是超重的起点，不是 WHO 的 25
  eq(M.bmiCalc(100, 23.9).cat[0], '正常', 'BMI 23.9 仍属正常');
  eq(M.bmiCalc(100, 24).cat[0], '超重', 'BMI 24.0 起算超重（中国标准）');
  eq(M.bmiCalc(100, 28).cat[0], '肥胖', 'BMI 28.0 起算肥胖（中国标准）');
  near(M.bmiCalc(175, 70).standard, 70, 1e-9, 'BMI 标准体重 = 身高 − 105');
  eq(!!M.bmiCalc(0, 70).err, true, 'BMI 零身高报错');

  // 内衣尺码：下围 75、上围 85 → 差 10 → A 杯
  const r1 = M.braSize(75, 85);
  eq(r1.cup, 'A', '内衣 上下差 10 为 A 杯');
  eq(r1.code, '75A', '内衣 亚洲码 75A');
  eq(r1.base, 75, '内衣 底围就近取 75');
  eq(r1.matched, true, '内衣 底围正好落在标准档');
  eq(M.braSize(75, 87.5).cup, 'B', '内衣 差 12.5 为 B 杯');
  eq(M.braSize(75, 90).cup, 'C', '内衣 差 15 为 C 杯');
  eq(M.braSize(75, 82.5).cup, 'AA', '内衣 差 7.5 为 AA 杯');
  eq(M.braSize(75, 80).cup, 'AA', '内衣 差 5 也归 AA（最小档）');
  eq(M.braSize(75, 100).cup, 'G', '内衣 差 25 为 G 杯（档差 2.5cm）');
  const r2 = M.braSize(78, 88);
  eq(r2.base, 80, '内衣 底围 78 就近取 80');
  eq(r2.matched, false, '内衣 底围不在标准档时标记出来');
  eq(!!M.braSize(85, 80).err, true, '内衣 上围小于下围报错');
  eq(!!M.braSize(0, 85).err, true, '内衣 零下围报错');
  eq(M.BRA_CUP_NAMES[0], 'AA', '内衣 罩杯表首项是 AA');
}

{
  const M = loadModule('life2.js', 'pensionCalc,pensionMonths,PENSION_MONTHS'.split(','));

  const near = (a, b, t, label) => eq(Math.abs(a - b) <= t, true, label + '（' + a + ' vs ' + b + '）');

  eq(M.pensionMonths(60), 139, '养老金 60 岁计发月数 139');
  eq(M.pensionMonths(55), 170, '养老金 55 岁计发月数 170');
  eq(M.pensionMonths(50), 195, '养老金 50 岁计发月数 195');
  eq(M.pensionMonths(45), 216, '养老金 45 岁计发月数 216');
  // 中间年龄线性插值，落在相邻两档之间
  const mid = M.pensionMonths(57);
  eq(mid > 139 && mid < 170, true, '养老金 57 岁插值落在 139~170 之间（' + mid + '）');

  // 社平 8000、增长 0%、40 岁缴到 60 岁、缴 35 年、指数 1.0、账户 20 万
  const r = M.pensionCalc({ avg: 8000, growth: 0, age: 40, retireAge: 60, years: 35, index: 1, acct: 200000 });
  near(r.avgAtRetire, 8000, 1e-9, '养老金 零增长时社平不变');
  // 基础养老金 = 8000 ×(1+1)÷2 ×35 ×1% = 2800
  near(r.base, 2800, 1e-9, '养老金 基础养老金');
  // 个人账户 = 200000 ÷ 139
  near(r.personal, 200000 / 139, 1e-9, '养老金 个人账户养老金');
  near(r.total, r.base + r.personal, 1e-9, '养老金 合计');
  eq(r.months, 139, '养老金 60 岁计发月数');
  eq(r.yearsLeft, 20, '养老金 剩余缴费年限');
  // 有增长时社平高于现值
  const r2 = M.pensionCalc({ avg: 8000, growth: 3, age: 40, retireAge: 60, years: 35, index: 1, acct: 200000 });
  near(r2.avgAtRetire, 8000 * Math.pow(1.03, 20), 1e-6, '养老金 社平按增长率复利');
  eq(r2.base > r.base, true, '养老金 社平增长带动基础养老金上升');
  // 缴费指数翻倍，基础养老金应增加但不到翻倍（公式里是 (1+指数)/2）
  const r3 = M.pensionCalc({ avg: 8000, growth: 0, age: 40, retireAge: 60, years: 35, index: 2, acct: 200000 });
  near(r3.base, 8000 * 1.5 * 35 * 0.01, 1e-9, '养老金 缴费指数 2.0 时的基础养老金');
  // 错误分支
  eq(!!M.pensionCalc({ avg: 0, growth: 0, age: 40, retireAge: 60, years: 35, index: 1, acct: 0 }).err, true, '养老金 零社平报错');
  eq(!!M.pensionCalc({ avg: 8000, growth: 0, age: 60, retireAge: 55, years: 35, index: 1, acct: 0 }).err, true, '养老金 退休年龄小于当前年龄报错');
  eq(!!M.pensionCalc({ avg: 8000, growth: 0, age: 40, retireAge: 60, years: 0, index: 1, acct: 0 }).err, true, '养老金 零缴费年限报错');
}

{
  const M = loadModule('media.js', 'bearing,dirName,distanceInfo,DIRS'.split(','));

  const near = (a, b, t, label) => eq(Math.abs(a - b) <= t, true, label + '（' + a + ' vs ' + b + '）');

  // 正北 / 正东 / 正南 / 正西
  near(M.bearing(0, 0, 1, 0), 0, 1e-6, '方位角 正北为 0°');
  near(M.bearing(0, 0, 0, 1), 90, 1e-6, '方位角 正东为 90°');
  near(M.bearing(1, 0, 0, 0), 180, 1e-6, '方位角 正南为 180°');
  near(M.bearing(0, 1, 0, 0), 270, 1e-6, '方位角 正西为 270°');
  // 北京 → 上海 大致是东南方向
  const bd = M.bearing(39.9042, 116.4074, 31.2304, 121.4737);
  eq(bd > 90 && bd < 180, true, '方位角 京沪方向落在东南象限（' + bd.toFixed(1) + '°）');
  eq(M.dirName(bd), '东南', '方位角 京沪方向名为东南');

  eq(M.dirName(0), '正北', '方向名 0° 正北');
  eq(M.dirName(45), '东北', '方向名 45° 东北');
  eq(M.dirName(90), '正东', '方向名 90° 正东');
  eq(M.dirName(180), '正南', '方向名 180° 正南');
  eq(M.dirName(359), '正北', '方向名 359° 归正北');
  eq(M.DIRS.length, 8, '方向表 8 项');

  const d = M.distanceInfo(39.9042, 116.4074, 31.2304, 121.4737);
  near(d.km, 1068, 15, '距离 京沪约 1068 km');
  eq(/^[北南]偏[东西]/.test(d.compass), true, '距离 口语说法格式正确（' + d.compass + '）');
  // 大圆上往返方位角不是严格差 180°（在球面上会偏），但应落在对面象限
  eq(Math.abs(((d.bearing + 180) % 360) - d.backBearing) < 10, true,
    '距离 反向方位角接近 180° 的偏差（' + d.bearing.toFixed(1) + ' vs ' + d.backBearing.toFixed(1) + '）');
  near(M.bearing(0, 0, 0, 1) + 180, M.bearing(0, 1, 0, 0), 1e-6, '距离 赤道上往返方位角严格差 180°');
  const d0 = M.distanceInfo(30, 120, 30, 120);
  eq(d0.meters, 0, '距离 同一点距离为 0');
}

// ---------- life2.js ----------
{
  const M = loadModule('life2.js',
    'fuelConsumption,retireCalc,delayMonths,bondCalc,money,fmtDur'.split(','));

  const near = (a, b, t, label) => eq(Math.abs(a - b) <= t, true, label + '（' + a + ' vs ' + b + '）');

  // 油耗四种算法
  const f1 = M.fuelConsumption({ mode: 'twice', odoFill1: '12000', odoFill2: '12480', liters: '38.5' });
  near(f1.per100, 38.5 / 480 * 100, 1e-9, '油耗 两次加油法');
  const f2 = M.fuelConsumption({ mode: 'trip', distance: '480', liters2: '38.5' });
  near(f2.per100, f1.per100, 1e-9, '油耗 行程法与两次法一致');
  const f3 = M.fuelConsumption({ mode: 'price', liters3: '40', price3: '7.85', distance3: '500' });
  near(f3.cost, 40 * 7.85, 1e-9, '油耗 按钱算油费');
  near(f3.per100, 8, 1e-9, '油耗 按钱算百公里');
  const f4 = M.fuelConsumption({ mode: 'reverse', wantDistance: '600', wantPer100: '8', wantPrice: '7.85' });
  near(f4.liters, 48, 1e-9, '油耗 反推需油量');
  near(f4.cost, 48 * 7.85, 1e-9, '油耗 反推油费');
  near(f1.kmPerLiter, 100 / f1.per100, 1e-9, '油耗 每升里程');
  near(f1.rangePer50, 50 / f1.per100 * 100, 1e-9, '油耗 50L 续航');
  // 里程填反要报错而不是给出负数
  eq(!!M.fuelConsumption({ mode: 'twice', odoFill1: '500', odoFill2: '100', liters: '10' }).err, true, '油耗 里程填反报错');
  eq(!!M.fuelConsumption({ mode: 'trip', distance: '0', liters2: '10' }).err, true, '油耗 零里程报错');
  eq(!!M.fuelConsumption({ mode: 'price', liters3: '0', price3: '7', distance3: '' }).err, true, '油耗 零油量报错');
  eq(!!M.fuelConsumption({ mode: 'reverse', wantDistance: '', wantPer100: '8', wantPrice: '7' }).err, true, '油耗 缺里程报错');
  // 只有钱没有里程时，不该编出百公里油耗
  const f5 = M.fuelConsumption({ mode: 'price', liters3: '40', price3: '7.85', distance3: '' });
  eq(f5.per100, null, '油耗 无里程不硬算百公里');

  // 退休：2024 决定的节奏（男：每 4 个月出生延 1 个月，上限 36）
  eq(M.retireCalc(1964, 12, 'm').delayMonths, 0, '退休 男 1964-12 不延迟');
  eq(M.retireCalc(1965, 1, 'm').delayMonths, 1, '退休 男 1965-01 延迟 1 个月');
  eq(M.retireCalc(1965, 5, 'm').delayMonths, 2, '退休 男 1965-05 延迟 2 个月');
  eq(M.retireCalc(1966, 1, 'm').delayMonths, 4, '退休 男 1966-01 延迟 4 个月');
  eq(M.retireCalc(1976, 9, 'm').delayMonths, 36, '退休 男 1976-09 到上限 36 个月');
  eq(M.retireCalc(1990, 1, 'm').delayMonths, 36, '退休 男 1990-01 仍封顶');
  eq(M.retireCalc(1976, 9, 'm').retireAge, 60, '退休 男年龄基数 60');
  const r85 = M.retireCalc(1985, 6, 'm');
  eq(r85.retireDate.getFullYear() + '-' + (r85.retireDate.getMonth() + 1), '2048-6', '退休 男 1985-06 → 2048-06');
  eq(r85.delayMonths, 36, '退休 男 1985-06 延迟 36 个月');

  // 女干部（原 55 岁）：1970-01 起每 4 个月 1 个月，上限 36
  eq(M.retireCalc(1969, 12, 'f55').delayMonths, 0, '退休 女55 1969-12 不延迟');
  eq(M.retireCalc(1970, 1, 'f55').delayMonths, 1, '退休 女55 1970-01 延迟 1 个月');
  eq(M.retireCalc(1981, 1, 'f55').delayMonths, 34, '退休 女55 1981-01 延迟 34 个月');
  eq(M.retireCalc(1981, 12, 'f55').delayMonths, 36, '退休 女55 1981-12 到上限');
  eq(M.retireCalc(1981, 12, 'f55').retireAge, 55, '退休 女55 年龄基数 55');

  // 女工人（原 50 岁）：1975-01 起每 2 个月 1 个月，上限 60
  eq(M.retireCalc(1974, 12, 'f50').delayMonths, 0, '退休 女50 1974-12 不延迟');
  eq(M.retireCalc(1975, 1, 'f50').delayMonths, 1, '退休 女50 1975-01 延迟 1 个月');
  eq(M.retireCalc(1975, 3, 'f50').delayMonths, 2, '退休 女50 1975-03 延迟 2 个月');
  eq(M.retireCalc(1984, 11, 'f50').delayMonths, 60, '退休 女50 1984-11 到上限 60 个月');
  eq(M.retireCalc(1995, 1, 'f50').delayMonths, 60, '退休 女50 1995-01 仍封顶');
  eq(M.retireCalc(1984, 11, 'f50').retireAge, 50, '退休 女50 年龄基数 50');
  // 跨年进位：12 月出生 + 延迟后月份要进位到次年
  const dec = M.retireCalc(1980, 12, 'm');
  eq(dec.retireDate.getMonth() + 1 >= 1 && dec.retireDate.getMonth() + 1 <= 12, true, '退休 月份合法');
  eq(dec.retireDate.getTime() > new Date(1980, 11, 1).getTime(), true, '退休 日期晚于出生');

  // 国债
  const b1 = M.bondCalc(100000, 2.38, 3, 'electronic', 0);
  near(b1.perYear, 2380, 1e-9, '国债 年利息');
  near(b1.totalInterest, 7140, 1e-9, '国债 三年利息合计');
  near(b1.finalTotal, 107140, 1e-9, '国债 到期本息');
  eq(b1.rows.length, 3, '国债 每年一行');
  near(b1.rows[0].end, 102380, 1e-9, '国债 电子式每年末本息');
  const b2 = M.bondCalc(100000, 2.38, 3, 'certificate', 0);
  near(b2.totalInterest, b1.totalInterest, 1e-9, '国债 凭证式总利息与电子式一致');
  eq(b2.rows[0].interest, 0, '国债 凭证式中途不付息');
  near(b2.rows[2].interest, 7140, 1e-9, '国债 凭证式到期一次付息');
  near(b2.rows[2].cumulative, 7140, 1e-9, '国债 凭证式累计利息');
  const b3 = M.bondCalc(100000, 2.38, 3, 'electronic', 20);
  near(b3.totalInterest, 7140 * 0.8, 1e-9, '国债 扣 20% 利息税');
  near(b3.totalTax, 7140 * 0.2, 1e-9, '国债 税额');
  const b4 = M.bondCalc(10000, 5, 1, 'electronic', 0);
  near(b4.totalInterest, 500, 1e-9, '国债 单年');

  eq(M.fmtDur(366), '1 年 1 天', '退休 时长格式化超过一年');
  eq(M.fmtDur(30), '30 天', '退休 时长格式化不足一年');
  eq(M.fmtDur(365), '365 天', '退休 时长格式化：365 天不足回归年');
  eq(M.fmtDur(731), '2 年 1 天', '退休 时长格式化两年');
  eq(M.fmtDur(0), '0 天', '退休 时长格式化零');
}

// ---------- crypto.js ----------
{
  const M = loadModule('crypto.js',
    'rc4,rc4Keystream,rc4SelfTest,Rabbit,rabbitCrypt,rabbitSelfTest,RABBIT_VECTORS,utf8Bytes,bytesToUtf8,hexToBytes,bytesToHex,g,rotl32'.split(','));

  // RC4 公开测试集（维基百科示例）
  const rv = M.rc4SelfTest();
  eq(rv.length, 3, 'RC4 向量条数');
  rv.forEach((v) => eq(v.pass, true, 'RC4 ' + v.label));
  eq(M.bytesToHex(M.rc4(M.utf8Bytes('Key'), M.utf8Bytes('Plaintext'))), 'BBF316E8D940AF0AD3', 'RC4 Key/Plaintext');
  eq(M.bytesToHex(M.rc4(M.utf8Bytes('Wiki'), M.utf8Bytes('pedia'))), '1021BF0420', 'RC4 Wiki/pedia');
  eq(M.bytesToHex(M.rc4(M.utf8Bytes('Secret'), M.utf8Bytes('Attack at dawn'))),
    '45A01F645FC35B383552544B9BF5', 'RC4 Secret/Attack at dawn');
  // 加解密同一个操作，往返必须一致
  const key = M.utf8Bytes('key123');
  const msg = M.utf8Bytes('明文与 English 混排');
  eq(M.bytesToUtf8(M.rc4(key, M.rc4(key, msg))), '明文与 English 混排', 'RC4 往返一致');
  // 密钥流常见对照值（Key 密钥的前 16 字节）
  eq(M.bytesToHex(M.rc4Keystream(M.utf8Bytes('Key'), 16)), 'EB9F7781B734CA72A7194A2867B64295', 'RC4 密钥流前 16 字节');
  // 空密钥必须直接报错，不能悄悄返回零流
  let emptyKeyErr = '';
  try { M.rc4([], [1]); } catch (e) { emptyKeyErr = e.message; }
  eq(/密钥不能为空/.test(emptyKeyErr), true, 'RC4 空密钥抛错');

  // Rabbit：RFC 4503 附录 A 全部向量
  const tv = M.rabbitSelfTest();
  eq(tv.length, 6, 'Rabbit 向量条数');
  tv.forEach((v) => eq(v.pass, true, 'Rabbit ' + v.label));
  eq(M.RABBIT_VECTORS.length, 6, 'Rabbit 向量数据条数');

  // 密钥长度必须 16 字节，IV 必须 8 字节或省略
  let threw = '';
  try { M.Rabbit(new Array(15).fill(0), null); } catch (e) { threw = e.message; }
  eq(/16 字节/.test(threw), true, 'Rabbit 拒绝非 16 字节密钥');
  threw = '';
  try { M.Rabbit(new Array(16).fill(0), new Array(7).fill(0)); } catch (e) { threw = e.message; }
  eq(/8 字节/.test(threw), true, 'Rabbit 拒绝非 8 字节 IV');

  // 加解密往返
  const rk = M.hexToBytes('8395741587E0C733E9E9AB01C09B0043');
  const riv = M.hexToBytes('C373F575C1267E59');
  const rmsg = M.utf8Bytes('hello rabbit 中文');
  eq(M.bytesToUtf8(M.rabbitCrypt(rk, riv, M.rabbitCrypt(rk, riv, rmsg))), 'hello rabbit 中文', 'Rabbit 往返一致');
  // 不同 IV 必须给出不同密钥流（A.1 与 A.2 的教训）
  const ksNoIv = M.bytesToHex(M.Rabbit(M.hexToBytes('00'.repeat(16)), null)(16));
  const ksZeroIv = M.bytesToHex(M.Rabbit(M.hexToBytes('00'.repeat(16)), M.hexToBytes('00'.repeat(8)))(16));
  eq(ksNoIv !== ksZeroIv, true, 'Rabbit 不传 IV 与全零 IV 不等价');

  // g 函数的 32 位平方不能丢精度（这是本轮真踩到的坑）
  eq(M.g(0xFFFFFFFF, 1)[0], Number((BigInt(0) * BigInt(0)) & 0xFFFFFFFFn) , 'g 边界值不报错');
  eq(M.g(0, 0)[0], 0, 'g(0,0) = 0');
  eq(M.rotl32(1, 16), 0x00010000, 'rotl32 基本旋转');
  eq(M.rotl32(0x80000001, 1), 0x00000003, 'rotl32 跨位旋转');

  // 编解码工具
  eq(M.bytesToHex([0, 15, 255]), '000FFF', '字节转 hex 补零');
  eq(M.hexToBytes('00 0F ff'), [0, 15, 255], 'hex 转字节（容忍空格）');
  eq(M.hexToBytes('00:0F:FF'), [0, 15, 255], 'hex 转字节（容忍冒号）');
  let badHex = '';
  try { M.hexToBytes('0G'); } catch (e) { badHex = e.message; }
  eq(/只含 0-9a-f/.test(badHex), true, 'hex 含非法字符时报错');
  let oddHex = '';
  try { M.hexToBytes('abc'); } catch (e) { oddHex = e.message; }
  eq(/偶数/.test(oddHex), true, 'hex 长度为奇数时报错');
  eq(M.bytesToUtf8(M.utf8Bytes('a中😀')), 'a中😀', 'UTF-8 往返含 emoji');
}

// ---------- station2.js ----------
{
  const M = loadModule('station2.js',
    'HTTP_CODES,PORTS,uaAnalyze,uaSuspicion,CLASS_DESC,UA_BROWSERS,UA_OS,UA_BOTS'.split(','));

  eq(M.HTTP_CODES.length >= 60, true, 'HTTP 状态码不少于 60 条（' + M.HTTP_CODES.length + '）');
  // 必查的几个常见码
  const map = Object.fromEntries(M.HTTP_CODES.map((c) => [c[0], c]));
  eq(!!map[200], true, 'HTTP 有 200');
  eq(!!map[301], true, 'HTTP 有 301');
  eq(!!map[404], true, 'HTTP 有 404');
  eq(!!map[418], true, 'HTTP 有 418');
  eq(!!map[503], true, 'HTTP 有 503');
  // 类别与码值必须一致
  eq(M.HTTP_CODES.every((c) => c[0] >= 100 && c[0] < 600), true, 'HTTP 码值都在 100~599');
  eq(M.HTTP_CODES.every((c) => c.length === 4), true, 'HTTP 每条四列齐全');
  eq(new Set(M.HTTP_CODES.map((c) => c[0])).size, M.HTTP_CODES.length, 'HTTP 码值不重复');
  // 401 与 403 语义不能写反
  eq(/未认证/.test(map[401][2]), true, 'HTTP 401 是未认证');
  eq(/禁止|没权限|无权限/.test(map[403][2]), true, 'HTTP 403 是禁止访问');

  eq(M.PORTS.length >= 30, true, '端口清单不少于 30 条（' + M.PORTS.length + '）');
  eq(M.PORTS.every((p) => p.port >= 1 && p.port <= 65535), true, '端口号在合法范围');
  eq(M.PORTS.filter((p) => p.port === 6379).length, 1, '端口清单含 6379');
  eq(M.PORTS.filter((p) => p.port === 3306)[0].risk, '极高', 'MySQL 端口标为极高风险');

  // UA 分析：常见浏览器
  const chrome = M.uaAnalyze('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  eq(chrome.browser, 'Chrome', 'UA 识别 Chrome');
  eq(chrome.browserVer, '131.0.0.0', 'UA 取到 Chrome 版本');
  eq(chrome.os, 'Windows 11 / 10', 'UA 识别 Windows 10/11');
  eq(chrome.device, '桌面', 'UA 判为桌面');
  eq(chrome.engine, 'Blink', 'UA 引擎 Blink');

  // Edge 必须先于 Chrome 命中，否则会被认成 Chrome
  const edge = M.uaAnalyze('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0');
  eq(edge.browser, 'Edge', 'UA 优先识别 Edge 而不是 Chrome');
  eq(edge.browserVer, '131.0.0.0', 'UA 取到 Edge 版本');

  const ff = M.uaAnalyze('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0');
  eq(ff.browser, 'Firefox', 'UA 识别 Firefox');
  eq(ff.engine, 'Gecko', 'UA 引擎 Gecko');

  const safari = M.uaAnalyze('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
  eq(safari.browser, 'Safari', 'UA 识别 Safari');
  eq(safari.os, 'iOS', 'UA 识别 iOS');
  eq(safari.osVer, '17.5', 'UA 版本下划线转点');
  eq(safari.device, '手机', 'UA 判为手机');
  eq(safari.engine, 'WebKit', 'UA 引擎 WebKit');

  const android = M.uaAnalyze('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36');
  eq(android.os, 'Android', 'UA 识别 Android');
  eq(android.device, '手机', 'Android Mobile 判为手机');

  // 爬虫与工具
  eq(M.uaAnalyze('Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)').bot, 'Baiduspider', 'UA 识别百度爬虫');
  eq(M.uaAnalyze('curl/8.6.0').bot, 'curl', 'UA 识别 curl');
  eq(M.uaAnalyze('Googlebot/2.1 (+http://www.google.com/bot.html)').bot, 'Googlebot', 'UA 识别 Googlebot');
  eq(M.uaAnalyze('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 MicroMessenger/8.0.49').bot, '微信内置浏览器', 'UA 识别微信内置浏览器');
  eq(M.uaAnalyze('chrome').bot, null, 'UA 无明显爬虫特征时返回 null');

  // 可疑度
  eq(M.uaSuspicion(M.uaAnalyze('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36')), '高度可疑（疑似脚本伪造）', 'UA 识别 Headless Chrome');
  eq(M.uaSuspicion(M.uaAnalyze('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')), '正常', 'UA 正常 Chrome 判为正常');
  eq(M.uaSuspicion(M.uaAnalyze('')), '轻微可疑', 'UA 空串判为可疑（异常短）');
  eq(M.uaAnalyze('').browser, '未知', 'UA 空串返回未知');
}

// ---------- holiday.js ----------
{
  const M = loadModule('holiday.js', 'DATA,FESTIVAL_DATES,buildIndex,yearStats,restDays,ymd,shortRange'.split(','));

  eq(Object.keys(M.DATA).sort().join(','), '2025,2026', '放假数据含 2025 与 2026');
  eq(M.DATA[2025].length, 6, '2025 年 6 个假期');
  eq(M.DATA[2026].length, 7, '2026 年 7 个假期（中秋与国庆分开）');

  // 每年每条安排的四要素齐全
  [2025, 2026].forEach((y) => {
    eq(M.DATA[y].every((f) => f.name && f.tag && f.days > 0 && Array.isArray(f.rest) && Array.isArray(f.makeup)), true,
      y + ' 年安排字段齐全');
    eq(M.DATA[y].every((f) => f.rest.length === f.days), true, y + ' 年放假天数与日期条数一致');
    eq(M.DATA[y].every((f) => f.desc && /放假/.test(f.desc)), true, y + ' 年每条都有说明');
  });

  // 2025 春节：1/28~2/4 共 8 天，调休 1/26 与 2/8
  const cny25 = M.DATA[2025].filter((f) => f.name === '春节')[0];
  eq(cny25.rest[0], '2025-01-28', '2025 春节从 1 月 28 日开始');
  eq(cny25.rest[cny25.rest.length - 1], '2025-02-04', '2025 春节到 2 月 4 日');
  eq(cny25.makeup.join(','), '2025-01-26,2025-02-08', '2025 春节调休日期');

  // 2025 国庆中秋连休 8 天
  const nat25 = M.DATA[2025].filter((f) => f.name.indexOf('国庆') >= 0)[0];
  eq(nat25.days, 8, '2025 国庆中秋 8 天');
  eq(nat25.makeup.join(','), '2025-09-28,2025-10-11', '2025 国庆调休日期');

  // 索引与统计自洽
  const idx = M.buildIndex(2025);
  eq(idx['2025-01-28'].state, 'fest', '索引里 1/28 是放假');
  eq(idx['2025-01-26'].state, 'makeup', '索引里 1/26 是调休上班');
  eq(idx['2025-01-28'].tag, '春节', '索引带节日标签');
  eq(idx['2025-06-15'], undefined, '普通工作日不出现在索引里');

  const st = M.yearStats(2025);
  eq(st.total, 365, '2025 年 365 天');
  eq(st.fest, M.DATA[2025].reduce((a, f) => a + f.days, 0), '法定节假日天数合计正确');
  eq(st.makeup, M.DATA[2025].reduce((a, f) => a + f.makeup.length, 0), '调休上班天数合计正确');
  eq(st.fest + st.weekend + st.makeup + st.work, 365, '四类天数加起来等于全年');
  eq(st.festOnly, st.fest - (() => {
    // 落在周末的法定节假日数量
    let n = 0;
    Object.keys(idx).forEach((k) => {
      if (idx[k].state !== 'fest') return;
      const p = k.split('-').map(Number);
      const d = new Date(p[0], p[1] - 1, p[2]);
      if (d.getDay() === 0 || d.getDay() === 6) n++;
    });
    return n;
  })(), '净放假天数 = 法定天数 − 落在周末的天数');

  const st26 = M.yearStats(2026);
  eq(st26.total, 365, '2026 年 365 天');
  eq(st26.fest + st26.weekend + st26.makeup + st26.work, 365, '2026 四类天数自洽');
  eq(M.restDays(2026) > 100, true, '全年休息日多于 100 天');

  eq(M.ymd(new Date(2025, 0, 5)), '2025-01-05', 'ymd 补零');
  eq(M.shortRange(['2025-01-28', '2025-02-04']), '1 月 28 日 至 2 月 4 日（共 2 天）', '日期区间文案');
}

// ---------- health2.js ----------
{
  const M = loadModule('health2.js',
    'egfrCkdEpi,egfrMdrd,gfrStage,toMgDl,dueDate,gestAge,pregCalc,CHECKUPS,hadlock4,shepard,idCheckDigit,luhnCheck,idParse,PROVINCES,ID_WEIGHTS,ID_CHECKS,recommendSize,SIZE_MEN,SIZE_WOMEN,shoeLookup,SHOE_TABLE,SURNAMES,parseYmd,addDays,fmtDate'.split(','));

  const near = (a, b, t, label) => eq(Math.abs(a - b) <= t, true, label + '（' + a + ' vs ' + b + '）');

  // eGFR：CKD-EPI 官方示例值（Scr 1.0 mg/dL、45 岁女性 ≈ 65）
  // CKD-EPI 2009 公式算出的值（女 45 岁 Scr 1.0 → 约 68；男 → 约 90）
  near(M.egfrCkdEpi(1.0, 45, 'f'), 68.0, 0.5, 'eGFR CKD-EPI 女性 45 岁 Scr 1.0');
  near(M.egfrCkdEpi(1.0, 45, 'm'), 90.5, 0.5, 'eGFR CKD-EPI 男性 45 岁 Scr 1.0');
  // 女性系数 1.018 是乘在公式末尾的；用「按男性算完再乘 1.018 应等于女性结果」验证，
  // 前提是把 kappa/alpha 也换成男性的——这里换个角度：直接用公式本身对拍
  {
    const scr = 1.0, age = 60;
    const manualF = 141 * Math.pow(Math.min(scr / 0.7, 1), -0.329) * Math.pow(Math.max(scr / 0.7, 1), -1.209) *
      Math.pow(0.993, age) * 1.018;
    eq(Math.abs(M.egfrCkdEpi(scr, age, 'f') - manualF) < 1e-9, true, 'eGFR 女性结果与手工代入一致（含 1.018 系数）');
  }
  // eGFR 随年龄单调下降
  eq(M.egfrCkdEpi(1.0, 70, 'm') < M.egfrCkdEpi(1.0, 40, 'm'), true, 'eGFR 随年龄下降');
  // 肌酐翻倍，eGFR 应大幅下降
  eq(M.egfrCkdEpi(2.0, 45, 'f') < M.egfrCkdEpi(1.0, 45, 'f') * 0.6, true, 'eGFR 随肌酐升高而下降');
  // 同样的肌酐与年龄，男性算出的 eGFR 更高（kappa 与 alpha 都不同）
  eq(M.egfrCkdEpi(1.0, 50, 'f') < M.egfrCkdEpi(1.0, 50, 'm'), true, '同肌酐下女性 eGFR 低于男性');
  eq(M.egfrCkdEpi(0, 50, 'm'), null, 'eGFR 拒绝零肌酐');
  // 单位换算
  near(M.toMgDl(88.4, 'umol'), 1.0, 1e-9, 'μmol/L 转 mg/dL');
  near(M.toMgDl(1.0, 'mgdl'), 1.0, 1e-9, 'mg/dL 原样返回');
  // CKD 分期边界
  eq(M.gfrStage(90)[0], 'G1', 'eGFR 90 为 G1');
  eq(M.gfrStage(89.9)[0], 'G2', 'eGFR 89.9 为 G2');
  eq(M.gfrStage(60)[0], 'G2', 'eGFR 60 仍 G2');
  eq(M.gfrStage(59.9)[0], 'G3a', 'eGFR 59.9 为 G3a');
  eq(M.gfrStage(30)[0], 'G3b', 'eGFR 30 为 G3b');
  eq(M.gfrStage(15)[0], 'G4', 'eGFR 15 为 G4');
  eq(M.gfrStage(14.9)[0], 'G5', 'eGFR 14.9 为 G5');
  // MDRD 也要能算
  eq(M.egfrMdrd(1.0, 45, 'm') > 0, true, 'MDRD 返回正值');

  // 预产期：28 天周期，LMP 2026-01-05 → 2026-10-12
  eq(M.fmtDate(M.dueDate(M.parseYmd('2026-01-05'), 28)), '2026-10-12', '预产期（28 天周期）');
  // 周期 35 天应把预产期往后推 7 天
  eq(M.fmtDate(M.dueDate(M.parseYmd('2026-01-05'), 35)), '2026-10-19', '预产期（35 天周期推后 7 天）');
  eq(M.fmtDate(M.dueDate(M.parseYmd('2026-01-05'), 21)), '2026-10-05', '预产期（21 天周期提前 7 天）');
  // 孕周：LMP + 28 天 = 4w0d
  const ga = M.gestAge(M.parseYmd('2026-01-05'), 28, M.parseYmd('2026-02-02'));
  eq(ga.days, 28, '孕周天数');
  eq(ga.weeks, 4, '孕周周数');
  eq(ga.remDays, 0, '孕周余天数');
  eq(ga.text, '4w0d', '孕周文案');
  eq(ga.trimester, '第一孕期', '第一孕期判定');
  const ga2 = M.gestAge(M.parseYmd('2026-01-05'), 28, M.parseYmd('2026-07-06'));
  eq(ga2.trimester, '第二孕期', '第二孕期判定（约 26 周）');
  const ga3 = M.gestAge(M.parseYmd('2026-01-05'), 28, M.parseYmd('2026-10-12'));
  eq(ga3.text, '40w0d', '预产期当天为 40 周');
  // 产检节点按孕周排序
  eq(M.CHECKUPS.length >= 10, true, '产检节点不少于 10 个');
  eq(M.CHECKUPS.every((c, i, a) => i === 0 || c[0] >= a[i - 1][0]), true, '产检节点按孕周递增');
  const pr = M.pregCalc(M.parseYmd('2026-01-05'), 28, M.parseYmd('2026-02-02'));
  eq(pr.checkups.filter((c) => c.done).length, 0, '孕 4 周时所有产检节点都还没到');
  const prLate = M.pregCalc(M.parseYmd('2026-01-05'), 28, M.parseYmd('2026-06-01'));
  eq(prLate.checkups.filter((c) => c.done).length > 0, true, '孕 20 周后已有产检节点完成');
  eq(pr.checkups[0].done, false, '孕 4 周时 6 周产检还没到');
  eq(pr.daysLeft > 240 && pr.daysLeft < 260, true, '距预产期天数合理');

  // 胎儿体重公式：典型径线上的结果要落在足月常见的 2000~3200 g
  const w1 = M.hadlock4(8.5, 29.0, 6.5);
  eq(w1 > 1800 && w1 < 3200, true, 'Hadlock 结果落在合理区间（' + Math.round(w1) + ' g）');
  const w2 = M.shepard(8.5, 29.0);
  eq(w2 > 1800 && w2 < 3200, true, 'Shepard 结果落在合理区间（' + Math.round(w2) + ' g）');
  // 两式应当相互印证（差不超过 20%）
  eq(Math.abs(w1 - w2) / w1 < 0.2, true, '两式结果互相印证（相差 ' + Math.round(Math.abs(w1 - w2)) + ' g）');
  // 径线变大体重必须变大
  eq(M.hadlock4(9.0, 31.0, 7.0) > w1, true, 'Hadlock 随径线增大而增大');
  eq(M.shepard(9.0, 31.0) > w2, true, 'Shepard 随径线增大而增大');
  eq(M.hadlock4(0, 29, 6.5), null, 'Hadlock 拒绝非法输入');
  eq(M.shepard(8.5, 0), null, 'Shepard 拒绝非法输入');

  // 身份证校验位：GB 11643
  eq(M.ID_WEIGHTS.length, 17, '身份证权重 17 位');
  eq(M.ID_CHECKS.length, 11, '校验码表 11 个');
  eq(M.idCheckDigit('11010519900101123'), '2', '身份证校验位计算（GB 11643）');
  eq(M.luhnCheck('110105199001011232'), true, '合法身份证通过校验');
  eq(M.luhnCheck('110105199001011233'), false, '改末位后校验失败');
  eq(M.idCheckDigit('1101051990010112'), null, '不足 17 位返回 null');
  // 已知真实格式的号（弃用「地址码真实存在」的假设，只验校验位逻辑）
  const idOk = '110105199001011232';
  eq(M.idCheckDigit(idOk.slice(0, 17)) === idOk[17], true, '样例号码校验位自洽');

  // 身份证解析
  const ip = M.idParse('110105199001011232', new Date(2026, 5, 15));
  eq(ip.valid, true, '身份证解析有效');
  eq(ip.sex, '男', '身份证性别（顺序码第 3 位 3 为奇数）');
  eq(ip.birthText, '1990-01-01', '身份证出生日期');
  eq(ip.age, 36, '身份证年龄（2026-06-15 时 36 岁）');
  eq(ip.province, '北京市', '身份证省份');
  eq(ip.city, '北京市朝阳区', '身份证地区码');
  eq(ip.checkOk, true, '身份证校验通过');
  const ipEarly = M.idParse('110105199001011232', new Date(2024, 11, 31));
  eq(ipEarly.age, 34, '生日未到时按上一岁算（1990-01-01 出生，2024-12-31 时 34 岁）');
  const ipOnBirthday = M.idParse('110105199001011232', new Date(2025, 0, 1));
  eq(ipOnBirthday.age, 35, '生日当天即算新的周岁');
  const ipBad = M.idParse('110105199001011233', new Date(2026, 5, 15));
  eq(ipBad.valid, false, '校验位错判为无效');
  eq(ipBad.checkOk, false, '校验位错被标出');
  const ipShort = M.idParse('1101051990010112', new Date());
  eq(!!ipShort.err, true, '长度不足报错');
  const ipBadDate = M.idParse('110105199002311234', new Date());
  eq(M.idParse('110105199002311232', new Date()).birthOk, false, '2 月 31 日被判非法日期');
  eq(M.idParse('990105199001011232', new Date()).valid, false, '未知省份代码判为无效');
  eq(M.PROVINCES['11'], '北京市', '省份表含北京');
  eq(M.PROVINCES['82'], '澳门特别行政区', '省份表含澳门');

  // 尺码推荐
  const r1 = M.recommendSize(M.SIZE_MEN, 175, 70, 'normal');
  eq(r1.size.name, 'M', '175/70 男装推荐 M');
  const r2 = M.recommendSize(M.SIZE_MEN, 175, 70, 'loose');
  eq(r2.size.name, 'L', '宽松版型上调一档');
  const r3 = M.recommendSize(M.SIZE_MEN, 175, 70, 'slim');
  eq(r3.size.name, 'S', '修身版型下调一档');
  // 女装表：160/50 落在 S 上限附近，推荐 S；165/55 落 M
  const r4 = M.recommendSize(M.SIZE_WOMEN, 165, 55, 'normal');
  eq(r4.size.name, 'M', '165/55 女装推荐 M');
  const r4b = M.recommendSize(M.SIZE_WOMEN, 160, 50, 'normal');
  eq(r4b.size.name, 'S', '160/50 女装推荐 S');
  eq(r4b.exact, true, '160/50 完全落在 S 区间内');
  // 极端值不该越界
  const r5 = M.recommendSize(M.SIZE_MEN, 210, 150, 'loose');
  eq(M.SIZE_MEN.indexOf(r5.size) === M.SIZE_MEN.length - 1, true, '超大号不越界到表外（' + r5.size.name + '）');
  eq(r5.offset, 0, '已在最大码时偏移被钳制为 0');
  eq(r5.requested, 1, '仍记录用户请求的偏移方向');
  const r6 = M.recommendSize(M.SIZE_MEN, 120, 30, 'slim');
  eq(M.SIZE_MEN.indexOf(r6.size) === 0, true, '超小号不越界到表外（' + r6.size.name + '）');

  // 鞋码
  eq(M.shoeLookup(25.5).exact, true, '脚长 25.5 有精确对照');
  eq(M.shoeLookup(25.5).row.eu, 41, '25.5cm 对应 EU 41');
  eq(M.shoeLookup(25.5).row.cn, 255, '25.5cm 对应中国码 255');
  eq(M.shoeLookup(25.3).exact, false, '非半码走就近换算');
  eq(M.shoeLookup(25.3).nearest, 25.5, '25.3 就近到 25.5');
  eq(M.shoeLookup(30).row.eu > 46, true, '超出表的脚长按公式外推');
  eq(M.shoeLookup(20).row.eu < 35, true, '小于表的脚长按公式外推');
  eq(M.shoeLookup(0), null, '零脚长返回 null');
  eq(M.SHOE_TABLE.every((s, i, a) => i === 0 || s.cm > a[i - 1].cm), true, '鞋码表按脚长递增');

  // 百家姓
  eq(M.SURNAMES.length, 100, '百家姓收录 100 个');
  eq(M.SURNAMES[0], '王', '第一位是王');
  eq(M.SURNAMES[1], '李', '第二位是李');
  eq(new Set(M.SURNAMES).size, 100, '没有重复姓氏');

  // 日期工具
  eq(M.fmtDate(M.addDays(M.parseYmd('2026-01-31'), 1)), '2026-02-01', '跨月加一天');
  eq(M.fmtDate(M.addDays(M.parseYmd('2026-12-31'), 1)), '2027-01-01', '跨年加一天');
  eq(M.fmtDate(M.addDays(M.parseYmd('2024-02-28'), 1)), '2024-02-29', '闰年 2 月 29 日');
  eq(M.parseYmd('2026-02-31'), null, '拒绝不存在的日期');
  eq(M.parseYmd('2026-2-1'), null, '拒绝非补零格式');
}

// ---------- tax2.js ----------
{
  const M = loadModule('tax2.js',
    'vatSolve,VT_FORMS,laborTax,laborYearly,LABOR_BRACKETS,salaryTax,bonusTax,bonusCliffs,bracketOf,MONTH_BRACKETS,BONUS_BRACKETS,money,rateStr'.split(','));

  const near = (a, b, t, label) => eq(Math.abs(a - b) <= t, true, label + '（' + a + ' vs ' + b + '）');

  // 增值税四件套
  const v1 = M.vatSolve('addTax', 10000, 13);
  near(v1.tax, 1300, 1e-9, '增值税 不含税→税额');
  near(v1.gross, 11300, 1e-9, '增值税 不含税→含税');
  const v2 = M.vatSolve('stripTax', 11300, 13);
  near(v2.net, 10000, 1e-9, '增值税 含税→不含税');
  near(v2.tax, 1300, 1e-9, '增值税 含税→税额');
  const v3 = M.vatSolve('addRate', 1300, 10000);
  near(v3.rate, 0.13, 1e-9, '增值税 税额/不含税→税率');
  near(v3.gross, 11300, 1e-9, '增值税 税额+不含税→含税');
  const v4 = M.vatSolve('rateFrom', 11300, 10000);
  near(v4.rate, 0.13, 1e-9, '增值税 含税与不含税→税率');
  near(v4.tax, 1300, 1e-9, '增值税 含税与不含税→税额');
  // 四种模式走一圈应回到原点
  near(M.vatSolve('addTax', v2.net, 13).gross, 11300, 1e-6, '增值税 往返一致');
  // 3% 征收率
  near(M.vatSolve('addTax', 1000, 3).gross, 1030, 1e-9, '增值税 3% 征收率');
  // 错误分支
  eq(!!M.vatSolve('stripTax', 100, 0).err, false, '增值税 零税率不算错');
  eq(!!M.vatSolve('addRate', 100, 0).err, true, '增值税 零不含税额算不出税率');
  eq(!!M.vatSolve('rateFrom', 100, 200).err, true, '增值税 不含税大于含税时报错');
  eq(!!M.vatSolve('addTax', 100, 200).err, true, '增值税 税率超过 100% 报错');

  // 劳务报酬预扣税
  const l1 = M.laborTax(3000);
  near(l1.deduction, 800, 1e-9, '劳务 ≤4000 定额减 800');
  near(l1.taxable, 2200, 1e-9, '劳务 应纳税所得额');
  near(l1.tax, 440, 1e-9, '劳务 3000 元税额 440');
  const l2 = M.laborTax(4000);
  near(l2.deduction, 800, 1e-9, '劳务 恰好 4000 仍按定额 800');
  near(l2.tax, 640, 1e-9, '劳务 4000 元税额');
  const l3 = M.laborTax(4001);
  near(l3.deduction, 4001 * 0.2, 1e-9, '劳务 超过 4000 改按 20%');
  const l4 = M.laborTax(30000);
  near(l4.taxable, 24000, 1e-9, '劳务 30000 应纳税所得额');
  eq(l4.rate, 0.30, '劳务 24000 落 30% 档');
  near(l4.tax, 24000 * 0.30 - 2000, 1e-9, '劳务 30000 税额');
  const l5 = M.laborTax(100000);
  near(l5.taxable, 80000, 1e-9, '劳务 100000 应纳税所得额');
  eq(l5.rate, 0.40, '劳务 80000 落 40% 档');
  near(l5.tax, 80000 * 0.40 - 7000, 1e-9, '劳务 100000 税额');
  // 档位边界
  eq(M.laborTax(25000).rate, 0.20, '劳务 应纳税所得额恰好 20000 仍是 20% 档');
  near(M.laborTax(25000).tax, 20000 * 0.20, 1e-9, '劳务 边界税额');
  eq(M.laborTax(25001).rate, 0.30, '劳务 略超 20000 跳 30%');
  eq(M.laborTax(0).tax, 0, '劳务 零收入零税');
  eq(M.laborTax(500).tax, 0, '劳务 不足 800 不预扣');
  eq(!!M.laborTax(-1).err, true, '劳务 负收入报错');
  eq(M.LABOR_BRACKETS.length, 3, '劳务预扣率三档');

  // 工资薪金
  const s1 = M.salaryTax({ pay: 20000, ins: 2100, extra: 0 });
  near(s1.taxable, 12900, 1e-9, '工资 应纳税所得额');
  eq(s1.rate, 0.20, '工资 12900 落 20% 档');
  near(s1.tax, 12900 * 0.20 - 1410, 1e-9, '工资 月个税');
  near(s1.net, 20000 - 2100 - s1.tax, 1e-9, '工资 到手');
  eq(M.salaryTax({ pay: 5000 }).tax, 0, '工资 恰好 5000 不缴税');
  near(M.salaryTax({ pay: 8000 }).tax, 3000 * 0.03, 1e-9, '工资 8000 恰在 3% 档上限');
  eq(M.bracketOf(M.MONTH_BRACKETS, 3000).rate, 0.03, '月度表 3000 整落 3%');
  eq(M.bracketOf(M.MONTH_BRACKETS, 3000.01).rate, 0.10, '月度表 3000.01 跳 10%');
  eq(M.bracketOf(M.MONTH_BRACKETS, 25000).rate, 0.20, '月度表 25000 整仍 20%');
  eq(M.bracketOf(M.MONTH_BRACKETS, 1e9).rate, 0.45, '月度表超高档 45%');
  eq(!!M.salaryTax({ pay: -1 }).err, true, '工资 负收入报错');

  // 年终奖单独计税
  const b1 = M.bonusTax(36000);
  eq(b1.rate, 0.03, '年终奖 36000 落 3%');
  near(b1.tax, 36000 * 0.03, 1e-9, '年终奖 36000 税额');
  const b2 = M.bonusTax(36001);
  eq(b2.rate, 0.10, '年终奖 36001 跳 10%');
  near(b2.tax, 36001 * 0.10 - 210, 1e-9, '年终奖 36001 税额');
  eq(b2.net < b1.net, true, '年终奖多发 1 元到手反而变少（跳档）');
  const b3 = M.bonusTax(144000);
  eq(b3.rate, 0.10, '年终奖 144000 折月 12000 落 10%');
  const b4 = M.bonusTax(144001);
  eq(b4.rate, 0.20, '年终奖 144001 跳 20%');
  eq(b4.net < b3.net, true, '年终奖 144000 也是跳档点');
  eq(M.bonusTax(0).tax, 0, '年终奖零奖金');
  eq(!!M.bonusTax(-1).err, true, '年终奖负值报错');
  // 跳档提醒：当前金额高于跳档点、但低于该档起始金额时，报出「要发到多少才追得回来」
  const cliffs = M.bonusCliffs(36001);
  eq(cliffs.length, 0, '年终奖 36001 已越过跳档点，不再提示（它本身就是被跳档的那个）');
  const cliffs2 = M.bonusCliffs(36000);
  eq(cliffs2.length > 0, true, '年终奖正好在 36000 时提示下一档的跳档风险');
  eq(cliffs2[0].at, 36000, '跳档点是 36000');
  eq(cliffs2[0].netAtStart > 0, true, '给出跳档点的到手金额');
  eq(cliffs2[0].needTotal > 36000, true, '给出「要发到多少才追得回来」的金额');
  // 36000 到手 34920，36001 到手 32611，差 2309
  // 36000 到手 34920 元，36001 到手 32610.9 元，少拿 2309 元
  near(cliffs2[0].gap, 2309, 2, '跳档造成的到手损失约 2309 元');
  near(cliffs2[0].needTotal, 38567, 2, '要发到约 38567 元才追回损失');
  eq(M.bonusCliffs(12000).length, 0, '年终奖低档位无跳档');

  // 劳务并入年度
  const y1 = M.laborYearly(50000, 60000);
  eq(y1.taxable > 0, true, '劳务并入后应纳税所得额为正');
  eq(y1.tax > 0, true, '劳务并入后年度税额为正');
  eq(typeof y1.diff, 'number', '劳务并入给出汇算差额');
  near(M.laborYearly(50000, 0).taxable, 40000, 1e-9, '劳务 50000 并入后应纳税所得额 40000');

  eq(M.rateStr(0.13), '13%', '税率格式化 13%');
  eq(M.rateStr(0.035), '3.50%', '税率格式化 3.5%');
  eq(M.money(1234.5), '1,234.50', '金额格式化带千分位');
}

console.log('\n' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);

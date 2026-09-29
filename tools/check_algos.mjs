#!/usr/bin/env node
/*
 * 校验各工具页里的核心算法。
 *
 * 做法：把 docs/*.js 的 IIFE 外壳剥掉，用最小 DOM 桩在 Node 里加载，
 * 再拿标准测试向量逐条比对。改算法后跑一遍 `node tools/check_algos.mjs`，
 * 全过说明与标准仍一致；失败会打印期望值与实际值。
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
    getElementById: (i) => store[i] || (store[i] = mk()),
    querySelector: () => mk(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    documentElement: mk('html'), body: mk('body'), title: '', hidden: false,
    visibilityState: 'visible',
  };
  return { document, store };
}

function loadModule(file, exports) {
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
  return new Function(loadBody(file) + '\nreturn {' + exports.join(',') + '};')();
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

console.log('\n' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);

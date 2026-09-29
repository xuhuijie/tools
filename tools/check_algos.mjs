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

// 剥掉 (function(){ 'use strict'; ... })(); 外壳，只留函数体
function loadBody(file) {
  const src = fs.readFileSync(path.join(docs, file), 'utf8');
  const start = src.indexOf('\n') + 1;
  const end = src.lastIndexOf('})();');
  return src.slice(start, end).replace("(function () {\n  'use strict';\n", '', 1);
}

function domStub() {
  const store = {};
  const mk = () => ({
    value: '', textContent: '', className: '', placeholder: '', dataset: {}, children: [],
    tagName: 'DIV', selected: false, checked: false, innerHTML: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, setAttribute() {}, appendChild() {},
    querySelectorAll: () => [], parentNode: { insertBefore() {} },
  });
  const document = { createElement: mk, getElementById: (i) => store[i] || (store[i] = mk()) };
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

console.log('\n' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);

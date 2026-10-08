/* 哈希与校验和：MD5 / SHA 系列 / CRC / 累加和 / Adler-32 / HMAC */
(function () {
  'use strict';
  var $ = T.$, input = $('input'), output = $('output'), hint = $('hint'), current = 'md5';
  var fileBytes = null; // 选择文件后用文件字节，否则用文本框内容

  // ---------- 字节来源 ----------
  function toBytes(s) { return new TextEncoder().encode(s); }
  function fromHex(s) {
    var clean = s.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
    if (clean.length % 2) throw new Error('十六进制位数需为偶数');
    var b = new Uint8Array(clean.length / 2);
    for (var i = 0; i < b.length; i++) b[i] = parseInt(clean.substr(i * 2, 2), 16);
    return b;
  }
  function currentBytes() {
    if (fileBytes) return fileBytes;
    if (needHex() && $('hex').value.trim()) return fromHex($('hex').value.trim());
    return toBytes(input.value);
  }
  function needHex() { return current === 'crc' || current === 'sum' || current === 'adler'; }

  // ---------- MD5（本地实现，Web Crypto 无 MD5） ----------
  var MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  var MD5_K = (function () {
    var k = [];
    for (var i = 0; i < 64; i++) k.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
    return k;
  })();

  function rotl(x, c) { return ((x << c) | (x >>> (32 - c))) >>> 0; }

  function md5(bytes) {
    var len = bytes.length;
    // 补位：0x80 + 若干 0，使长度 ≡ 56 mod 64，再接 64 位小端长度
    var withOne = len + 1;
    var padLen = (56 - withOne % 64 + 64) % 64;
    var total = withOne + padLen + 8;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    var bitLen = len * 8;
    // 长度按 64 位小端写入，高 32 位对 JS 能处理的输入可忽略
    for (var i = 0; i < 4; i++) buf[total - 8 + i] = (bitLen >>> (8 * i)) & 0xff;
    for (var j = 4; j < 8; j++) buf[total - 8 + j] = 0;

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    var M = new Uint32Array(16);

    for (var off = 0; off < total; off += 64) {
      for (var m = 0; m < 16; m++) {
        M[m] = buf[off + m * 4] | (buf[off + m * 4 + 1] << 8) |
               (buf[off + m * 4 + 2] << 16) | (buf[off + m * 4 + 3] << 24);
      }
      var A = a0, B = b0, C = c0, D = d0;
      for (var i2 = 0; i2 < 64; i2++) {
        var F, g;
        if (i2 < 16) { F = (B & C) | (~B & D); g = i2; }
        else if (i2 < 32) { F = (D & B) | (~D & C); g = (5 * i2 + 1) % 16; }
        else if (i2 < 48) { F = B ^ C ^ D; g = (3 * i2 + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i2) % 16; }
        F = (F + A + MD5_K[i2] + M[g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + rotl(F, MD5_S[i2])) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0;
      c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return [a0, b0, c0, d0].map(function (w) {
      return [0, 8, 16, 24].map(function (s) {
        return ((w >>> s) & 0xff).toString(16).padStart(2, '0');
      }).join('');
    }).join('');
  }

  // ---------- CRC ----------
  // 参数取自 CRC RevEng 目录：多项式、初值、输入/输出反射、结果异或。
  // poly 一律写成「正常（非反射）」形式，反射表在生成时现推，避免每种型号手抄一份表。
  var CRC_MODELS = {
    'CRC-32': { poly: 0x04C11DB7, width: 32, init: 0xFFFFFFFF, refin: true, refout: true, xorout: 0xFFFFFFFF },
    'CRC-32/MPEG-2': { poly: 0x04C11DB7, width: 32, init: 0xFFFFFFFF, refin: false, refout: false, xorout: 0 },
    'CRC-16/MODBUS': { poly: 0x8005, width: 16, init: 0xFFFF, refin: true, refout: true, xorout: 0 },
    'CRC-16/USB': { poly: 0x8005, width: 16, init: 0xFFFF, refin: true, refout: true, xorout: 0xFFFF },
    'CRC-16/CCITT-FALSE': { poly: 0x1021, width: 16, init: 0xFFFF, refin: false, refout: false, xorout: 0 },
    'CRC-16/XMODEM': { poly: 0x1021, width: 16, init: 0, refin: false, refout: false, xorout: 0 },
    'CRC-8/MAXIM': { poly: 0x31, width: 8, init: 0, refin: true, refout: true, xorout: 0 },
    'CRC-8/ATM': { poly: 0x07, width: 8, init: 0, refin: false, refout: false, xorout: 0 }
  };

  // 按位反射一个 width 位的数
  function reflect(v, bits) {
    var r = 0;
    for (var i = 0; i < bits; i++) { r = (r << 1) | (v & 1); v >>>= 1; }
    return r >>> 0;
  }

  // 反射算法（refin）用右移表：表里存的是「反射后的多项式」推出的一字节余数
  function reflectedTable(polyReverse, width) {
    var top = 1 << (width - 1);
    var mask = width === 32 ? 0xFFFFFFFF : (1 << width) - 1;
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var j = 0; j < 8; j++) {
        c = (c & 1) ? ((c >>> 1) ^ polyReverse) : (c >>> 1);
        c &= mask;
      }
      t[i] = c >>> 0;
    }
    return t;
  }

  // 正向算法（非反射）用左移表：余数从高位进
  function normalTable(poly, width) {
    var shift = width - 8;
    var mask = width === 32 ? 0xFFFFFFFF : (1 << width) - 1;
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i << shift;
      for (var j = 0; j < 8; j++) {
        c = (c & (1 << (width - 1))) ? ((c << 1) ^ poly) : (c << 1);
        c &= mask;
      }
      t[i] = c >>> 0;
    }
    return t;
  }

  function crcOf(bytes, model) {
    var m = CRC_MODELS[model], width = m.width;
    var mask = width === 32 ? 0xFFFFFFFF : (1 << width) - 1;
    var val = m.init;

    if (m.refin) {
      var tr = reflectedTable(reflect(m.poly, width), width);
      for (var i = 0; i < bytes.length; i++) {
        val = (((val >>> 8) ^ tr[(val ^ bytes[i]) & 0xff]) & mask) >>> 0;
      }
      // refin=true 表示输入按位反转进算法，refout=true 表示结果再反转回去；
      // 查表法已隐含输入反射，所以只有 refout 与 refin 不一致时才需要补一次反转
      if (m.refout !== m.refin) val = reflect(val, width);
    } else {
      var tn = normalTable(m.poly, width);
      for (var j = 0; j < bytes.length; j++) {
        val = (((val << 8) ^ tn[((val >>> (width - 8)) ^ bytes[j]) & 0xff]) & mask) >>> 0;
      }
      if (m.refout) val = reflect(val, width);
    }

    val = ((val ^ m.xorout) & mask) >>> 0;
    return '0x' + val.toString(16).toUpperCase().padStart(width / 4, '0');
  }

  // ---------- 累加和 / 异或 ----------
  function sum8(bytes) { var s = 0; for (var i = 0; i < bytes.length; i++) s = (s + bytes[i]) & 0xff; return s; }
  function xor8(bytes) { var s = 0; for (var i = 0; i < bytes.length; i++) s ^= bytes[i]; return s; }
  function sum16(bytes) { var s = 0; for (var i = 0; i < bytes.length; i++) s = (s + bytes[i]) & 0xffff; return s; }
  function xor16(bytes) {
    var s = 0;
    for (var i = 0; i < bytes.length; i += 2) {
      var w = (bytes[i] << 8) | (bytes[i + 1] || 0);
      s ^= w;
    }
    return s & 0xffff;
  }

  // ---------- Adler-32 ----------
  function adler32(bytes) {
    var a = 1, b = 0, MOD = 65521;
    for (var i = 0; i < bytes.length; i++) {
      a = (a + bytes[i]) % MOD;
      b = (b + a) % MOD;
    }
    return ((b << 16) | a) >>> 0;
  }

  // ---------- SHA（优先 Web Crypto，失败回退纯 JS 实现） ----------
  async function sha(algo, bytes) {
    if (window.crypto && window.crypto.subtle) {
      try {
        var buf = await window.crypto.subtle.digest(algo, bytes);
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      } catch (e) { /* 非安全上下文回退到本地实现 */ }
    }
    return shaJs(algo, bytes);
  }

  // ---------- 纯 JS SHA-1 / SHA-256 / SHA-512（非安全上下文回退） ----------
  function shaJs(algo, bytes) {
    if (algo === 'SHA-1') return sha1Js(bytes);
    if (algo === 'SHA-512') return sha512Js(bytes);
    return sha256Js(bytes);
  }

  function sha1Js(bytes) {
    var h = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    var msg = padBE(bytes, 64, true);
    var w = new Uint32Array(80);
    for (var off = 0; off < msg.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = beWord(msg, off + i * 4);
      for (var i2 = 16; i2 < 80; i2++) w[i2] = rotl(w[i2 - 3] ^ w[i2 - 8] ^ w[i2 - 14] ^ w[i2 - 16], 1);
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
      for (var j = 0; j < 80; j++) {
        var f, k;
        if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        var t = (rotl(a, 5) + f + e + k + w[j]) >>> 0;
        e = d; d = c; c = rotl(b, 30); b = a; a = t;
      }
      h = [h[0] + a >>> 0, h[1] + b >>> 0, h[2] + c >>> 0, h[3] + d >>> 0, h[4] + e >>> 0];
    }
    return wordsToHex(h);
  }

  var SHA256_K = (function () {
    var primes = [], n = 2;
    while (primes.length < 64) {
      var isP = true;
      for (var d = 2; d * d <= n; d++) if (n % d === 0) { isP = false; break; }
      if (isP) primes.push(n);
      n++;
    }
    return primes.map(function (p) { return Math.floor((Math.pow(p, 1 / 3) % 1) * 4294967296) >>> 0; });
  })();

  function sha256Js(bytes) {
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var msg = padBE(bytes, 64, true);
    var w = new Uint32Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = beWord(msg, off + i * 4);
      for (var i2 = 16; i2 < 64; i2++) {
        var s0 = rotr(w[i2 - 15], 7) ^ rotr(w[i2 - 15], 18) ^ (w[i2 - 15] >>> 3);
        var s1 = rotr(w[i2 - 2], 17) ^ rotr(w[i2 - 2], 19) ^ (w[i2 - 2] >>> 10);
        w[i2] = (w[i2 - 16] + s0 + w[i2 - 7] + s1) >>> 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (var j = 0; j < 64; j++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + SHA256_K[j] + w[j]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h = h.map(function (v, k) { return (v + [a, b, c, d, e, f, g, hh][k]) >>> 0; });
    }
    return wordsToHex(h);
  }

  // SHA-512 常量表：每个质数立方根小数部分的低 64 位。
  // 用 BigInt 精确开方（2^64·cbrt(p) 逐位二分），浮点算不出这个精度。
  var SHA512_K = (function () {
    var primes = [], n = 2;
    while (primes.length < 80) {
      var isP = true;
      for (var d = 2; d * d <= n; d++) if (n % d === 0) { isP = false; break; }
      if (isP) primes.push(n);
      n++;
    }
    return primes.map(function (p) {
      var target = BigInt(p) * (1n << 192n);
      var lo = 0n, hi = 1n << 97n;
      while (lo < hi) {
        var mid = (lo + hi + 1n) >> 1n;
        if (mid * mid * mid <= target) lo = mid; else hi = mid - 1n;
      }
      return lo - ((lo >> 64n) << 64n);
    });
  })();

  var M64 = 0xFFFFFFFFFFFFFFFFn;

  function sha512Js(bytes) {
    var H = [0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
      0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n];
    var m = padBE(bytes, 128, false); // SHA-512 用 128 字节块、16 字节长度
    var w = new Array(80);
    for (var off = 0; off < m.length; off += 128) {
      for (var i = 0; i < 16; i++) {
        var v = 0n;
        for (var b = 0; b < 8; b++) v = (v << 8n) | BigInt(m[off + i * 8 + b]);
        w[i] = v;
      }
      for (var i2 = 16; i2 < 80; i2++) {
        var s0 = rotr64(w[i2 - 15], 1n) ^ rotr64(w[i2 - 15], 8n) ^ (w[i2 - 15] >> 7n);
        var s1 = rotr64(w[i2 - 2], 19n) ^ rotr64(w[i2 - 2], 61n) ^ (w[i2 - 2] >> 6n);
        w[i2] = (w[i2 - 16] + s0 + w[i2 - 7] + s1) & M64;
      }
      var a = H[0], b2 = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], hh = H[7];
      for (var j = 0; j < 80; j++) {
        var S1 = rotr64(e, 14n) ^ rotr64(e, 18n) ^ rotr64(e, 41n);
        var ch = (e & f) ^ (~e & M64 & g);
        var t1 = (hh + S1 + ch + SHA512_K[j] + w[j]) & M64;
        var S0 = rotr64(a, 28n) ^ rotr64(a, 34n) ^ rotr64(a, 39n);
        var maj = (a & b2) ^ (a & c) ^ (b2 & c);
        var t2 = (S0 + maj) & M64;
        hh = g; g = f; f = e; e = (d + t1) & M64;
        d = c; c = b2; b2 = a; a = (t1 + t2) & M64;
      }
      H = H.map(function (v, k) { return (v + [a, b2, c, d, e, f, g, hh][k]) & M64; });
    }
    return H.map(function (v) { return v.toString(16).padStart(16, '0'); }).join('');
  }

  function rotr64(v, n) { return ((v >> n) | (v << (64n - n))) & M64; }

  function pext(word, i) { return (word >>> (24 - i * 8)) & 0xff; }

  // 大端补位：SHA-1/256 块长 64、长度域 8 字节；SHA-512 块长 128、长度域 16 字节
  function padBE(bytes, blockSize, shortLen) {
    var lenField = shortLen ? 8 : 16;
    var withOne = bytes.length + 1;
    var padLen = (blockSize - lenField - withOne % blockSize + blockSize) % blockSize;
    var total = withOne + padLen + lenField;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    var bits = BigInt(bytes.length) * 8n;
    for (var i = 0; i < lenField; i++) {
      buf[total - 1 - i] = Number((bits >> BigInt(8 * i)) & 0xffn);
    }
    return buf;
  }

  function beWord(buf, off) {
    return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
  }
  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }
  function wordsToHex(h) {
    return h.map(function (w) { return (w >>> 0).toString(16).padStart(8, '0'); }).join('');
  }

  // ---------- HMAC（复用上面的哈希） ----------
  async function hmac(algo, keyBytes, msgBytes, blockSize) {
    var key = keyBytes;
    if (key.length > blockSize) key = await digestBytes(algo, key);
    var padded = new Uint8Array(blockSize);
    padded.set(key);
    var ipad = new Uint8Array(blockSize), opad = new Uint8Array(blockSize);
    for (var i = 0; i < blockSize; i++) {
      ipad[i] = padded[i] ^ 0x36;
      opad[i] = padded[i] ^ 0x5c;
    }
    var inner = await digestBytes(algo, concat(ipad, msgBytes));
    return bytesToHex(await digestBytes(algo, concat(opad, inner)));
  }

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a); out.set(b, a.length);
    return out;
  }
  function bytesToHex(b) {
    return Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  async function digestBytes(algo, bytes) {
    if (window.crypto && window.crypto.subtle) {
      try {
        return new Uint8Array(await window.crypto.subtle.digest(algo, bytes));
      } catch (e) { /* 回退 */ }
    }
    return fromHex(shaJs(algo, bytes));
  }

  // ---------- 面板渲染 ----------
  var HINTS = {
    md5: 'MD5 输出 128 位（32 位十六进制）。MD5 已不具备抗碰撞性，仅用于校验完整性，不要用于口令存储与签名。',
    sha: 'SHA-1/SHA-256/SHA-384/SHA-512 输出十六进制摘要。SHA-1 已不推荐用于安全场景。',
    crc: 'CRC 为循环冗余校验，用于检测传输误码，不具备任何安全强度。可在下方切换多项式与位宽。',
    sum: '累加和取字节和模 256/65536；异或校验取所有字节异或。常用于简单通信协议校验。',
    adler: 'Adler-32 为 zlib 使用的校验和：a 为字节和、b 为 a 的累加和，均模 65521，结果为 b<<16|a。',
    hmac: 'HMAC 用密钥与哈希构造消息认证码，可防篡改。密钥长度建议不小于哈希输出长度。'
  };

  var PICKERS = {
    sha: ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'],
    crc: Object.keys(CRC_MODELS),
    hmac: ['HmacMD5', 'HmacSHA1', 'HmacSHA256', 'HmacSHA512']
  };

  var subPick = document.createElement('div');
  subPick.className = 'pick';
  subPick.style.display = 'none';
  $('tabs').parentNode.insertBefore(subPick, $('tabs').nextSibling);
  var subValue = null;

  function renderPicker(kind) {
    subPick.innerHTML = '';
    var opts = PICKERS[kind];
    if (!opts) { subPick.style.display = 'none'; return; }
    subPick.style.display = 'flex';
    subValue = opts[0];
    opts.forEach(function (o, i) {
      var b = T.el('button', i === 0 ? 'on' : null, o);
      b.addEventListener('click', function () {
        subValue = o;
        [].forEach.call(subPick.children, function (c) { c.classList.toggle('on', c === b); });
      });
      subPick.appendChild(b);
    });
  }

  function setTab(name) {
    T.markTab(name);
    current = name;
    hint.className = 'hint';
    hint.textContent = HINTS[name] || '';
    $('hex-row').style.display = needHex() ? '' : 'none';
    $('key-row').style.display = name === 'hmac' ? '' : 'none';
    renderPicker(name);
    output.className = 'out mono-lg';
    output.textContent = '';
  }

  function rows(pairs) {
    return pairs.map(function (p) { return p[0] + '  ' + p[1]; }).join('\n');
  }

  async function run() {
    var bytes = currentBytes();
    if (!bytes.length) { output.className = 'out mono-lg err'; output.textContent = '请输入内容或选择文件'; return; }
    try {
      var text;
      if (current === 'md5') {
        text = rows([['MD5', md5(bytes)]]);
      } else if (current === 'sha') {
        text = rows([['算法', subValue], [subValue, await sha(subValue, bytes)]]);
      } else if (current === 'crc') {
        text = rows([['算法', subValue], [subValue, crcOf(bytes, subValue)]]);
      } else if (current === 'sum') {
        text = rows([
          ['8 位累加和', '0x' + sum8(bytes).toString(16).toUpperCase().padStart(2, '0')],
          ['16 位累加和', '0x' + sum16(bytes).toString(16).toUpperCase().padStart(4, '0')],
          ['8 位异或 (BCC)', '0x' + xor8(bytes).toString(16).toUpperCase().padStart(2, '0')],
          ['16 位异或', '0x' + xor16(bytes).toString(16).toUpperCase().padStart(4, '0')]
        ]);
      } else if (current === 'adler') {
        text = rows([['Adler-32', '0x' + adler32(bytes).toString(16).toUpperCase().padStart(8, '0')]]);
      } else if (current === 'hmac') {
        var algo = subValue.replace('Hmac', 'SHA-');
        var blockSize = algo === 'SHA-512' ? 128 : 64;
        text = rows([['算法', subValue], [subValue, await hmac(algo, toBytes($('hkey').value), bytes, blockSize)]]);
      }
      output.className = 'out mono-lg';
      output.textContent = text;
    } catch (e) {
      output.className = 'out mono-lg err';
      output.textContent = '计算失败：' + e.message;
    }
  }

  T.tabs($('tabs'), setTab);
  $('run').addEventListener('click', run);
  $('clear').addEventListener('click', function () {
    input.value = ''; fileBytes = null; $('file').value = '';
    output.className = 'out mono-lg'; output.textContent = '';
  });
  $('file').addEventListener('change', function () {
    var f = $('file').files[0];
    if (!f) { fileBytes = null; return; }
    var r = new FileReader();
    r.onload = function () {
      fileBytes = new Uint8Array(r.result);
      output.className = 'out mono-lg';
      output.textContent = '已读取文件：' + f.name + '（' + fileBytes.length + ' 字节），点「计算」得到摘要';
    };
    r.readAsArrayBuffer(f);
  });
  input.addEventListener('input', function () { fileBytes = null; });

  setTab(T.firstTab('md5'));
})();

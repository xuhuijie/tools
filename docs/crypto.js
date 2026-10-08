/* 流密码：RC4 与 Rabbit（RFC 4503）
   两者都是自己实现的，并用标准向量在页面上当场自检。
   RC4 已被 RFC 7465 禁用、Rabbit 未被主流协议采纳，页面顶部有明确警告。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ================= 字节工具 ================= */

  function utf8Bytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | c >> 6, 0x80 | c & 63); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var c2 = s.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | cp >> 18, 0x80 | cp >> 12 & 63, 0x80 | cp >> 6 & 63, 0x80 | cp & 63);
      } else { out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63); }
    }
    return out;
  }

  function bytesToUtf8(b) {
    var s = '', i = 0;
    while (i < b.length) {
      var c = b[i++];
      if (c < 0x80) s += String.fromCharCode(c);
      else if (c >= 0xc0 && c < 0xe0) s += String.fromCharCode((c & 31) << 6 | b[i++] & 63);
      else if (c >= 0xe0 && c < 0xf0) s += String.fromCharCode((c & 15) << 12 | (b[i++] & 63) << 6 | b[i++] & 63);
      else {
        var cp = (c & 7) << 18 | (b[i++] & 63) << 12 | (b[i++] & 63) << 6 | b[i++] & 63;
        cp -= 0x10000;
        s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
      }
    }
    return s;
  }

  function hexToBytes(h) {
    var s = String(h).replace(/[\s:]/g, '');
    if (!/^[0-9a-fA-F]*$/.test(s) || s.length % 2) throw new Error('hex 长度必须是偶数且只含 0-9a-f');
    var out = [];
    for (var i = 0; i < s.length; i += 2) out.push(parseInt(s.substr(i, 2), 16));
    return out;
  }

  function bytesToHex(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2).toUpperCase();
    return s;
  }

  function looksHex(s) {
    var t = String(s).replace(/[\s:]/g, '');
    return t.length >= 2 && t.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(t);
  }

  // 文本可能是给用户看的，也可能是 hex；按开关决定怎么读
  function readBytes(text, asHex) {
    if (asHex) return hexToBytes(text);
    return utf8Bytes(text);
  }

  /* ================= RC4 ================= */

  function rc4(keyBytes, dataBytes) {
    if (!keyBytes.length) throw new Error('密钥不能为空');
    var S = [], i, j = 0, t;
    for (i = 0; i < 256; i++) S[i] = i;
    for (i = 0; i < 256; i++) {
      j = (j + S[i] + keyBytes[i % keyBytes.length]) & 255;
      t = S[i]; S[i] = S[j]; S[j] = t;
    }
    var out = [];
    i = j = 0;
    for (var k = 0; k < dataBytes.length; k++) {
      i = (i + 1) & 255;
      j = (j + S[i]) & 255;
      t = S[i]; S[i] = S[j]; S[j] = t;
      out.push(dataBytes[k] ^ S[(S[i] + S[j]) & 255]);
    }
    return out;
  }

  // 只要密钥流（跳过前 drop 字节），用于与 RFC 6229 的前 N 字节对拍
  function rc4Keystream(keyBytes, length, drop) {
    var ks = rc4(keyBytes, new Array((drop || 0) + length).fill(0));
    return ks.slice(drop || 0);
  }

  var RC4_VECTORS = [
    { key: 'Key', plain: 'Plaintext', cipher: 'BBF316E8D940AF0AD3' },
    { key: 'Wiki', plain: 'pedia', cipher: '1021BF0420' },
    { key: 'Secret', plain: 'Attack at dawn', cipher: '45A01F645FC35B383552544B9BF5' }
  ];

  function rc4SelfTest() {
    return RC4_VECTORS.map(function (v) {
      var got = bytesToHex(rc4(utf8Bytes(v.key), utf8Bytes(v.plain)));
      return { label: v.key + ' / ' + v.plain, expect: v.cipher, got: got, pass: got === v.cipher };
    });
  }

  /* ================= Rabbit（RFC 4503） =================
     结构：8 个 32 位状态字 + 8 个计数寄存器。
     每轮先把计数寄存器按 A 常数组合，再喂进 g 函数做平方，最后与状态字异或。
     g 函数里有一次 32 位 × 32 位乘法，JS 双精度会丢低位，所以用 BigInt 算。 */

  var RABBIT_A = [0x4D34D34D, 0xD34D34D3, 0x34D34D34, 0x4D34D34D,
    0xD34D34D3, 0x34D34D34, 0x4D34D34D, 0xD34D34D3];

  function rotl32(v, n) {
    v = v >>> 0;
    return ((v << n) | (v >>> (32 - n))) >>> 0;
  }

  // g(u,v) = LSW((u+v)^2) ^ MSW((u+v)^2)
  // 32 位平方最大到 2^64，JS 的 Number 只有 53 位精度，直接相乘会丢低位——
  // 表现是前几轮还像样、之后彻底跑偏。必须走 BigInt。
  function g(u, v) {
    var s = (u + v) >>> 0;
    var sq = BigInt(s) * BigInt(s);
    var lo = Number(sq & 0xFFFFFFFFn);
    var hi = Number(sq >> 32n & 0xFFFFFFFFn);
    return [lo ^ hi, hi];
  }

  function Rabbit(keyBytes, ivBytes) {
    if (keyBytes.length !== 16) throw new Error('Rabbit 密钥必须是 16 字节（128 位），当前 ' + keyBytes.length + ' 字节');
    if (ivBytes && ivBytes.length && ivBytes.length !== 8) {
      throw new Error('Rabbit 的 IV 必须是 8 字节（64 位）或留空，当前 ' + ivBytes.length + ' 字节');
    }

    // 子密钥 Kj 是 16 位，RFC 的 K0 = K[15..0] 指的是密钥的最低 16 位，
    // 也就是 keyBytes 的最后两个字节，且按 I2OSP 顺序（高位字节在前）。
    // 这里把 K[0..7] 从密钥尾部往前数着填，容易写错，所以单独列出来。
    var k = [];
    for (var i = 0; i < 8; i++) {
      k[i] = (keyBytes[14 - i * 2] << 8 | keyBytes[15 - i * 2]) >>> 0;
    }

    // 计数系统带一个跨字进位位 b，且 b 要保留到下一次 nextState 调用。
    // 先声明再调用：少写这个 b，前几轮看着还像回事，一迭代就跟 RFC 分道扬镳。
    var carry = 0;

    // 密钥装载：Xj 与 Cj 都是两个 16 位子密钥拼成的 32 位字
    var x = [], c = [];
    for (i = 0; i < 8; i++) {
      if (i % 2 === 0) {
        x[i] = (k[(i + 1) % 8] << 16 | k[i]) >>> 0;
        c[i] = (k[(i + 4) % 8] << 16 | k[(i + 5) % 8]) >>> 0;
      } else {
        x[i] = (k[(i + 5) % 8] << 16 | k[(i + 4) % 8]) >>> 0;
        c[i] = (k[i] << 16 | k[(i + 1) % 8]) >>> 0;
      }
    }
    for (i = 0; i < 4; i++) nextState();
    // 这一步用的是「当轮迭代后的 X」，不是初始 X（RFC 2.3 节最后一行）
    for (i = 0; i < 8; i++) c[i] = (c[i] ^ x[(i + 4) & 7]) >>> 0;

    // IV 装载：改的是计数寄存器，之后还要再迭代 4 轮才是第一个输出块。
    // 注意「全 0 IV」与「不传 IV」并不等价——RFC 4503 的 A.1 与 A.2 正是这两条。
    if (ivBytes && ivBytes.length) {
      // IV 是 64 位，按 I2OSP 切成两个 32 位半区：ivHi = IV[63..32]、ivLo = IV[31..0]。
      // RFC 里 C1 用 (IV[63..48] || IV[31..16]) 这种跨半区的拼接，
      // 等价于把 ivHi 的低 16 位与 ivLo 的高 16 位接起来。
      var ivLo = ((ivBytes[4] << 24) | (ivBytes[5] << 16) | (ivBytes[6] << 8) | ivBytes[7]) >>> 0;
      var ivHi = ((ivBytes[0] << 24) | (ivBytes[1] << 16) | (ivBytes[2] << 8) | ivBytes[3]) >>> 0;
      // C1 ^= IV[63..48] || IV[31..16]：ivHi 的高 16 位在高位，ivLo 的高 16 位在低位
      var cross = (((ivHi >>> 16) << 16) | ((ivLo >>> 16) & 0xFFFF)) >>> 0;
      // C3 ^= IV[47..32] || IV[15..0]：ivHi 的低 16 位在高位，ivLo 的低 16 位在低位。
      // 两处的第一项相同、第二项不同，很容易抄成一个，抄错了 IV 全零时看不出来。
      var cross2 = (((ivHi & 0xFFFF) << 16) | (ivLo & 0xFFFF)) >>> 0;
      c[0] = (c[0] ^ ivLo) >>> 0;
      c[1] = (c[1] ^ cross) >>> 0;
      c[2] = (c[2] ^ ivHi) >>> 0;
      c[3] = (c[3] ^ cross2) >>> 0;
      c[4] = (c[4] ^ ivLo) >>> 0;
      c[5] = (c[5] ^ cross) >>> 0;
      c[6] = (c[6] ^ ivHi) >>> 0;
      c[7] = (c[7] ^ cross2) >>> 0;
      for (i = 0; i < 4; i++) nextState();
    }

    function nextState() {
      var i;
      for (i = 0; i < 8; i++) {
        var sum = c[i] + RABBIT_A[i] + carry;
        carry = Math.floor(sum / 0x100000000);
        c[i] = sum >>> 0;
      }
      var G = [];
      for (i = 0; i < 8; i++) {
        // Gj 就是 g 的 32 位输出（低半 ^ 高半）；旋转用的也是这个值本身，
        // 不是平方的高半——这里写错过一次，结果整条密钥流全错但看着挺随机。
        G[i] = g(x[i], c[i])[0];
      }
      x[0] = (G[0] + rotl32(G[7], 16) + rotl32(G[6], 16)) >>> 0;
      x[1] = (G[1] + rotl32(G[0], 8) + G[7]) >>> 0;
      x[2] = (G[2] + rotl32(G[1], 16) + rotl32(G[0], 16)) >>> 0;
      x[3] = (G[3] + rotl32(G[2], 8) + G[1]) >>> 0;
      x[4] = (G[4] + rotl32(G[3], 16) + rotl32(G[2], 16)) >>> 0;
      x[5] = (G[5] + rotl32(G[4], 8) + G[3]) >>> 0;
      x[6] = (G[6] + rotl32(G[5], 16) + rotl32(G[4], 16)) >>> 0;
      x[7] = (G[7] + rotl32(G[6], 8) + G[5]) >>> 0;
    }

    // RFC 2.7 的提取：每个 16 位输出字是两个不同状态字的半字异或，不是直接取半字。
    // 这一步最容易想当然写错——写成「按顺序取各状态字的低/高半字」也能算出像样的
    // 随机串，但和标准答案对不上，且没有任何中间状态能提示你。
    function block() {
      var words = [
        (x[0] & 0xFFFF) ^ (x[5] >>> 16 & 0xFFFF),
        (x[0] >>> 16 & 0xFFFF) ^ (x[3] & 0xFFFF),
        (x[2] & 0xFFFF) ^ (x[7] >>> 16 & 0xFFFF),
        (x[2] >>> 16 & 0xFFFF) ^ (x[5] & 0xFFFF),
        (x[4] & 0xFFFF) ^ (x[1] >>> 16 & 0xFFFF),
        (x[4] >>> 16 & 0xFFFF) ^ (x[7] & 0xFFFF),
        (x[6] & 0xFFFF) ^ (x[3] >>> 16 & 0xFFFF),
        (x[6] >>> 16 & 0xFFFF) ^ (x[1] & 0xFFFF)
      ];
      // 输出块按 S[127..0] 的位序书写：最高位那一段在最前，每段 16 位按大端拆字节。
      // 也就是要把上面按 S[15..0] 起算的顺序整体倒过来，且每字大端。
      // 与标准向量对拍时如果漏了这一步，整条密钥流会「看着随机但全错」。
      var out = [];
      for (var k = words.length - 1; k >= 0; k--) {
        out.push(words[k] >>> 8 & 0xFF, words[k] & 0xFF);
      }
      return out;
    }

    var buffer = [];
    return function keystream(n) {
      while (buffer.length < n) {
        nextState();
        buffer = buffer.concat(block());
      }
      var out = buffer.slice(0, n);
      buffer = buffer.slice(n);
      return out;
    };
  }

  function rabbitCrypt(keyBytes, ivBytes, dataBytes) {
    var ks = Rabbit(keyBytes, ivBytes)(dataBytes.length);
    return dataBytes.map(function (b, i) { return b ^ ks[i]; });
  }

  // RFC 4503 附录 A 的向量，各取前 48 字节密钥流。
  // 全部照 RFC 原文逐字节抄下来，任何一条不通过就说明实现偏离标准。
  var RABBIT_VECTORS = [
    {
      name: 'A.1 无 IV 装载（key 全零）',
      key: '00000000000000000000000000000000',
      iv: null,
      ks: 'B15754F036A5D6ECF56B45261C4AF702' + '88E8D815C59C0C397B696C4789C68AA7' + 'F416A1C3700CD451DA68D1881673D696'
    },
    {
      name: 'A.1 无 IV 装载（key 91 28 13 29 2E 3D …）',
      key: '912813292E3D36FE3BFC62F1DC51C3AC',
      iv: null,
      ks: '3D2DF3C83EF627A1E97FC38487E2519C' + 'F576CD61F4405B8896BF53AA8554FC19' + 'E5547473FBDB43508AE53B20204D4C5E'
    },
    {
      name: 'A.1 无 IV 装载（key 83 95 …）',
      key: '8395741587E0C733E9E9AB01C09B0043',
      iv: null,
      ks: '0CB10DCDA041CDAC32EB5CFD02D0609B' + '95FC9FCA0F17015A7B7092114CFF3EAD' + '9649E5DE8BFC7F3F924147AD3A947428'
    },
    {
      name: 'A.2 IV 全零',
      key: '00000000000000000000000000000000',
      iv: '0000000000000000',
      ks: 'C6A7275EF85495D87CCD5D376705B7ED' + '5F29A6AC04F5EFD47B8F293270DC4A8D' + '2ADE822B29DE6C1EE52BDB8A47BF8F66'
    },
    {
      name: 'A.2 IV C3 73 F5 75 C1 26 7E 59',
      key: '00000000000000000000000000000000',
      iv: 'C373F575C1267E59',
      ks: '1FCD4EB9580012E2E0DCCC9222017D6D' + 'A75F4E10D12125017B2499FFED936F2E' + 'EBC112C393E738392356BDD012029BA7'
    },
    {
      name: 'A.2 IV A6 EB 56 1A D2 F4 17 27',
      key: '00000000000000000000000000000000',
      iv: 'A6EB561AD2F41727',
      ks: '445AD8C805858DBF70B6AF23A151104D' + '96C8F27947F42C5BAEAE67C6ACC35B03' + '9FCBFC895FA71C17313DF034F01551CB'
    }
  ];

  function rabbitSelfTest() {
    return RABBIT_VECTORS.map(function (v) {
      var key = hexToBytes(v.key);
      var iv = v.iv ? hexToBytes(v.iv) : null;
      var ks = Rabbit(key, iv)(48);
      var got = bytesToHex(ks);
      return { label: v.name, expect: v.ks, got: got, pass: got === v.ks };
    });
  }

  /* ================= RC4 界面 ================= */

  var r4HexIn = false, r4HexOut = false;

  function r4Run() {
    var hint = $('r4-hint'), out = $('r4-out'), hexout = $('r4-hexout');
    var outBytes, inBytes;
    try {
      var keyBytes = readBytes($('r4-key').value, looksHex($('r4-key').value) && r4HexIn);
      outBytes = rc4(keyBytes, readBytes($('r4-in').value, r4HexIn));
      inBytes = readBytes($('r4-in').value, r4HexIn);
    } catch (e) {
      hint.className = 'hint err';
      hint.textContent = '计算失败：' + e.message;
      out.textContent = '';
      hexout.textContent = '';
      return null;
    }
    hint.className = 'hint';
    hint.textContent = '输入 ' + inBytes.length + ' 字节，密钥 ' + readBytes($('r4-key').value, false).length + ' 字节。RC4 加解密是同一个操作。';
    if (r4HexOut) {
      out.textContent = bytesToHex(outBytes);
      hexout.textContent = '';
    } else {
      out.textContent = bytesToUtf8(outBytes);
      hexout.textContent = 'Hex: ' + bytesToHex(outBytes);
    }
    return outBytes;
  }

  function r4PaintVectors() {
    var body = $('r4-vec-body');
    body.innerHTML = '';
    rc4SelfTest().forEach(function (v) {
      var tr = document.createElement('tr');
      tr.className = v.pass ? 'pass' : 'fail';
      [v.pass ? '通过' : '不通过', v.label, v.expect, v.got].forEach(function (t) {
        var td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  var r4Presets = $('r4-presets').querySelectorAll('button');
  [].forEach.call(r4Presets, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(r4Presets, function (o) { o.classList.toggle('on', o === b); });
      $('r4-key').value = b.dataset.key;
      r4Run();
    });
  });
  $('r4-enc').addEventListener('click', r4Run);
  $('r4-dec').addEventListener('click', r4Run);
  $('r4-swap').addEventListener('click', function () {
    var v = r4Run();
    if (v) { $('r4-in').value = bytesToUtf8(v); r4Run(); }
  });
  $('r4-hex-in').addEventListener('click', function () {
    r4HexIn = !r4HexIn;
    this.classList.toggle('on', r4HexIn);
    this.textContent = r4HexIn ? '按文本读输入（点击切回）' : '按 Hex 读输入';
    r4Run();
  });
  $('r4-hex-out').addEventListener('click', function () {
    r4HexOut = !r4HexOut;
    this.classList.toggle('on', r4HexOut);
    this.textContent = r4HexOut ? '输出文本（点击切回）' : '输出 Hex';
    r4Run();
  });
  $('r4-copy').addEventListener('click', function () { T.copy(r4OutText()); });
  function r4OutText() {
    return r4HexOut ? $('r4-out').textContent : $('r4-out').textContent;
  }
  $('r4-key').addEventListener('input', r4Run);
  $('r4-in').addEventListener('input', r4Run);

  /* ================= Rabbit 界面 ================= */

  var rbHex = false;

  function rbRandomBytes(n) {
    var b = new Uint8Array(n);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
    return Array.prototype.slice.call(b);
  }

  function readKeyInput(el, expected, name) {
    var raw = String(el.value).trim();
    if (!raw) return null;
    if (looksHex(raw) && hexToBytes(raw).length === expected) return hexToBytes(raw);
    if (raw.length === expected * 2 && /^[0-9a-fA-F]+$/.test(raw)) return hexToBytes(raw);
    var bytes = utf8Bytes(raw);
    if (bytes.length === expected) return bytes;
    // 长度不匹配时按 hex 再试一次，都不行就给明确的报错
    if (looksHex(raw)) return hexToBytes(raw);
    throw new Error(name + ' 需要 ' + expected + ' 字节，当前文本是 ' + bytes.length +
      ' 字节。可以改用 hex 写（' + expected * 2 + ' 个十六进制字符）。');
  }

  function rbRun() {
    var hint = $('rb-hint'), out = $('rb-out');
    var key, iv, data;
    try {
      key = readKeyInput($('rb-key'), 16, 'Rabbit 密钥');
      if (!key) throw new Error('请先填 16 字节密钥');
      var ivv = String($('rb-iv').value).trim();
      iv = ivv ? readKeyInput($('rb-iv'), 8, 'Rabbit IV') : null;
      data = readBytes($('rb-in').value, rbHex);
      if (!data.length) { out.textContent = ''; hint.className = 'hint'; hint.textContent = '输入为空。'; return null; }
    } catch (e) {
      hint.className = 'hint err';
      hint.textContent = e.message;
      out.textContent = '';
      return null;
    }
    var res = rabbitCrypt(key, iv, data);
    hint.className = 'hint';
    hint.textContent = '密钥 ' + key.length + ' 字节，IV ' + (iv ? iv.length + ' 字节' : '未使用') +
      '，输入 ' + data.length + ' 字节。Rabbit 加解密也是同一个操作。';
    out.textContent = rbHex ? bytesToHex(res) : bytesToUtf8(res) + '\n\nHex: ' + bytesToHex(res);
    return res;
  }

  function rbPaintVectors() {
    var body = $('rb-vec-body');
    body.innerHTML = '';
    rabbitSelfTest().forEach(function (v) {
      var tr = document.createElement('tr');
      tr.className = v.pass ? 'pass' : 'fail';
      [v.pass ? '通过' : '不通过', v.label, v.expect, v.got].forEach(function (t) {
        var td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  $('rb-enc').addEventListener('click', rbRun);
  $('rb-dec').addEventListener('click', rbRun);
  $('rb-gen').addEventListener('click', function () {
    $('rb-key').value = bytesToHex(rbRandomBytes(16));
    $('rb-iv').value = bytesToHex(rbRandomBytes(8));
    rbRun();
  });
  $('rb-hex').addEventListener('click', function () {
    rbHex = !rbHex;
    this.classList.toggle('on', rbHex);
    this.textContent = rbHex ? '按文本读输入（点击切回）' : '用 Hex 作为输入';
    rbRun();
  });
  $('rb-swap').addEventListener('click', function () {
    var v = rbRun();
    if (v) { $('rb-in').value = bytesToHex(v); rbHex = true; $('rb-hex').classList.add('on'); $('rb-hex').textContent = '按文本读输入（点击切回）'; rbRun(); }
  });
  $('rb-copy').addEventListener('click', function () { T.copy($('rb-out').textContent); });
  ['rb-key', 'rb-iv', 'rb-in'].forEach(function (id) { $(id).addEventListener('input', rbRun); });

  /* ================= 页签与初始化 ================= */

  var PANELS = ['rc4', 'rabbit'];
  function setTab(name) {
    T.markTab(name);
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);

  r4PaintVectors();
  rbPaintVectors();
  r4Run();
  rbRun();
  setTab(T.firstTab('rc4'));

  window.__crypto = {
    rc4: rc4, rc4Keystream: rc4Keystream, rc4SelfTest: rc4SelfTest, RC4_VECTORS: RC4_VECTORS,
    Rabbit: Rabbit, rabbitCrypt: rabbitCrypt, rabbitSelfTest: rabbitSelfTest, RABBIT_VECTORS: RABBIT_VECTORS,
    utf8Bytes: utf8Bytes, bytesToUtf8: bytesToUtf8, hexToBytes: hexToBytes, bytesToHex: bytesToHex,
    g: g, rotl32: rotl32
  };
})();

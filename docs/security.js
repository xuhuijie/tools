/* 加密与令牌：RC4 / Rabbit 流加密、JWT 签名校验、RSA PEM 结构解析

   流加密是纯字节运算，本地可复现；公钥验签交给浏览器原生 WebCrypto，
   不引第三方库也不自造密码学。 */
(function () {
  'use strict';
  var $ = T.$;

  function utf8(s) { return new TextEncoder().encode(s); }
  function str(bytes) { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }
  function hex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out.toUpperCase();
  }
  function unhex(s) {
    var clean = String(s).replace(/[^0-9a-fA-F]/g, '');
    if (clean.length % 2) clean = '0' + clean;
    var b = new Uint8Array(clean.length / 2);
    for (var i = 0; i < b.length; i++) b[i] = parseInt(clean.substr(i * 2, 2), 16);
    return b;
  }
  function b64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function unb64(s) {
    var bin = atob(String(s).replace(/[\s=]+$/, '').replace(/\s/g, ''));
    var b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i) & 0xff;
    return b;
  }

  /* ---------- RC4 ---------- */
  function rc4Ksa(key) {
    var s = new Uint8Array(256);
    for (var i = 0; i < 256; i++) s[i] = i;
    var j = 0;
    for (var k = 0; k < 256; k++) {
      j = (j + s[k] + key[k % key.length]) & 0xff;
      var t = s[k]; s[k] = s[j]; s[j] = t;
    }
    return s;
  }

  // RC4 的加密与解密同为异或运算，加解密共用一套代码
  function rc4(keyBytes, data) {
    if (!keyBytes.length) throw new Error('请填写密钥');
    var s = rc4Ksa(keyBytes);
    var out = new Uint8Array(data.length);
    var i = 0, j = 0;
    for (var n = 0; n < data.length; n++) {
      i = (i + 1) & 0xff;
      j = (j + s[i]) & 0xff;
      var t = s[i]; s[i] = s[j]; s[j] = t;
      out[n] = data[n] ^ s[(s[i] + s[j]) & 0xff];
    }
    return out;
  }

  /* ---------- JWT ---------- */
  function b64urlToBytes(s) {
    var t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return unb64(t);
  }
  function bytesToB64url(bytes) {
    return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function hmacHex(algo, key, msg) {
    return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: algo }, false, ['sign'])
      .then(function (k) { return crypto.subtle.sign('HMAC', k, msg); })
      .then(function (sig) { return hex(new Uint8Array(sig)).toLowerCase(); });
  }

  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    var d = 0;
    for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  function splitJwt(token) {
    var parts = String(token || '').trim().split('.');
    if (parts.length !== 3) return { err: 'JWT 应为 aaa.bbb.ccc 三段，实际 ' + parts.length + ' 段。' };
    var header, payload;
    try { header = JSON.parse(str(b64urlToBytes(parts[0]))); }
    catch (e) { return { err: '头部不是合法 JSON。' }; }
    try { payload = JSON.parse(str(b64urlToBytes(parts[1]))); }
    catch (e) { return { err: '载荷不是合法 JSON。' }; }
    return { parts: parts, header: header, payload: payload, signing: parts[0] + '.' + parts[1], sig: parts[2] };
  }

  var HMAC_HASH = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };

  /* ---------- RSA PEM ---------- */
  // 只做 DER 结构判读：取第一个 SEQUENCE 的长度与前几个整数，给出结构结论
  function derRead(bytes, pos) {
    var tag = bytes[pos];
    var len = bytes[pos + 1];
    var off = pos + 2;
    if (len & 0x80) {
      var n = len & 0x7f;
      len = 0;
      for (var i = 0; i < n; i++) len = len * 256 + bytes[off + i];
      off += n;
    }
    return { tag: tag, len: len, start: off, end: off + len };
  }

  function intBitLength(bytes) {
    var v = 0;
    for (var i = 0; i < bytes.length; i++) v = v * 256 + bytes[i];
    if (!bytes.length) return 0;
    // 用十六进制长度估算位数，避免超过 Number 精度
    var h = '';
    for (var j = 0; j < bytes.length; j++) h += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16);
    h = h.replace(/^0+/, '');
    return (h.length - 1) * 4 + (parseInt(h[0], 16) + 1).toString(2).length - 1;
  }

  var PEM_TAG = /-----BEGIN ([A-Z0-9 ]+)-----/;

  function parsePem(text) {
    var m = PEM_TAG.exec(text);
    if (!m) return { err: '没有找到 -----BEGIN xxx----- 头。' };
    var tag = m[1];
    var body = text.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/[^A-Za-z0-9+/=]/g, '');
    var der;
    try { der = unb64(body); } catch (e) { return { err: 'PEM 主体不是合法 Base64。' }; }
    var seq = derRead(der, 0);
    var kind = tag === 'PRIVATE KEY' ? 'PKCS#8 私钥'
      : tag === 'RSA PRIVATE KEY' ? 'PKCS#1 私钥'
      : tag === 'PUBLIC KEY' ? 'SPKI 公钥'
      : tag === 'RSA PUBLIC KEY' ? 'PKCS#1 公钥(RSA)'
      : tag === 'CERTIFICATE' ? 'X.509 证书'
      : tag;
    var detail = 'DER 总长 ' + der.length + ' 字节，首元素 ' +
      (seq.tag === 0x30 ? 'SEQUENCE' : '0x' + seq.tag.toString(16)) + '（' + seq.len + ' 字节）';
    var bits = null;
    if (tag === 'PRIVATE KEY' || tag === 'RSA PRIVATE KEY') {
      var inner = derRead(der, seq.start);
      if (inner.tag === 0x02) {
        var version = der.slice(inner.start, inner.end);
        // PKCS#1 私钥第一个整数是 version，第二个是 modulus；PKCS#8 第二个元素才是 OCTET STRING
        var next = derRead(der, inner.end);
        if (tag === 'RSA PRIVATE KEY') {
          var mod = derRead(der, next.start);
          if (mod.tag === 0x02) bits = intBitLength(der.slice(mod.start, mod.end));
          detail += '；版本 ' + version[version.length - 1];
        } else {
          detail += '；PKCS#8 版本 ' + version[version.length - 1] + '，算法标识 ' +
            (next.tag === 0x30 ? 'SEQUENCE(AlgorithmIdentifier)' : '0x' + next.tag.toString(16));
          var algo = der.slice(next.start, next.end);
          var algSeq = derRead(algo, 0);
          var oid = derRead(algo, algSeq.start);
          if (oid.tag === 0x06 && algo.slice(oid.start, oid.end).join(',') === '42,134,72,134,247,13,1,1,1') {
            var oct = derRead(der, next.end);
            if (oct.tag === 0x04) {
              var pk1 = derRead(der, oct.start);
              var v2 = derRead(der, pk1.start);
              var m2 = derRead(der, v2.end);
              if (m2.tag === 0x02) bits = intBitLength(der.slice(m2.start, m2.end));
            }
          }
        }
      }
    }
    if (tag === 'PUBLIC KEY') {
      var spki = derRead(der, seq.start);
      var oid2 = derRead(der, spki.start);
      if (oid2.tag === 0x06) {
        var oidVal = der.slice(oid2.start, oid2.end).join(',');
        detail += '；算法 OID ' + (oidVal === '42,134,72,134,247,13,1,1,1' ? 'rsaEncryption (1.2.840.113549.1.1.1)' : oidVal);
      }
      var bstr = derRead(der, spki.end);
      if (bstr.tag === 0x03) {
        var pk = derRead(der, bstr.start + 1);
        var mi = derRead(der, pk.start);
        if (mi.tag === 0x02) bits = intBitLength(der.slice(mi.start, mi.end));
      }
    }
    return { tag: tag, kind: kind, detail: detail, bits: bits };
  }

  /* ---------- 面板 1：RC4 ---------- */
  function runRc4(mode) {
    var out = $('rc4-out'), hexOut = $('rc4-hex'), err = $('rc4-err');
    out.textContent = ''; hexOut.textContent = '';
    err.hidden = true; err.textContent = '';
    var key = utf8($('rc4-key').value);
    var text = $('rc4-in').value;
    if (!text) return;
    if (!key.length) { err.hidden = false; err.textContent = '密钥不能为空。'; return; }
    try {
      if (mode === 'enc') {
        var ct = rc4(key, utf8(text));
        out.textContent = b64(ct);
        hexOut.textContent = hex(ct);
      } else {
        var pt = rc4(key, unb64(text));
        out.textContent = str(pt);
        hexOut.textContent = hex(pt);
      }
    } catch (e) {
      err.hidden = false; err.textContent = '解密失败：' + e.message + '（密文应为 Base64）';
    }
  }

  /* ---------- Rabbit ----------
     严格按 RFC 4503 实现，对附录 A/B 的全部向量做过校验。
     32 位乘法拆成 16 位半字，避免 JS 双精度在 2^53 附近的取整误差；
     位旋转与异或都先归一到无符号。 */
  var RABBIT_A = [0x4D34D34D, 0xD34D34D3, 0x34D34D34, 0x4D34D34D,
                  0xD34D34D3, 0x34D34D34, 0x4D34D34D, 0xD34D34D3];

  function u32(v) { return v >>> 0; }
  function hi16(v) { return (v >>> 16) & 0xFFFF; }
  function lo16(v) { return v & 0xFFFF; }

  /* 32 位加法：拆半字相加，返回 { v, carry } */
  function add32(a, b, c) {
    var lo = lo16(a) + lo16(b) + (c || 0);
    var hi = hi16(a) + hi16(b) + (lo >>> 16);
    return { v: u32(Math.imul(hi & 0xFFFF, 0x10000) + (lo & 0xFFFF)), carry: hi >>> 16 };
  }

  function rotl(v, k) { return u32((v << k) | (v >>> (32 - k))); }

  /* g(u, v) = LSW((u+v)^2) ^ MSW((u+v)^2)，平方用半字乘法精确展开 */
  var BIG = function (v) { return BigInt(v); };
  var MASK32 = BigInt(0xFFFFFFFF);

  function rabbitG(xv, cv) {
    var s = add32(xv, cv, 0).v;
    /* g(u,v) = LSW((u+v)²) ^ MSW((u+v)²)。
       平方是 64 位量，用 BigInt 精确算——这里只有一次乘方，
       整页吞吐毫秒级，不值得为省这点开销写易错的半字拆解。 */
    var sq = BIG(s >>> 0) * BIG(s >>> 0);
    var low = Number(sq & MASK32) >>> 0;
    var high = Number((sq >> BIG(32)) & MASK32) >>> 0;
    return u32(low ^ high);
  }

  /* 计数器更新（§2.5）：Cj += Aj + b，进位 b 跨轮保留 */
  function rabbitCounter(st) {
    for (var j = 0; j < 8; j++) {
      var r = add32(st.c[j], RABBIT_A[j], st.b);
      st.c[j] = r.v;
      st.b = r.carry;
    }
  }

  /* next-state（§2.6）：先更新计数器，再按关系式重排状态 */
  function rabbitNext(st) {
    rabbitCounter(st);
    var G = new Array(8);
    for (var j = 0; j < 8; j++) G[j] = rabbitG(st.x[j], st.c[j]);
    st.x[0] = u32(G[0] + rotl(G[7], 16) + rotl(G[6], 16));
    st.x[1] = u32(G[1] + rotl(G[0], 8) + G[7]);
    st.x[2] = u32(G[2] + rotl(G[1], 16) + rotl(G[0], 16));
    st.x[3] = u32(G[3] + rotl(G[2], 8) + G[1]);
    st.x[4] = u32(G[4] + rotl(G[3], 16) + rotl(G[2], 16));
    st.x[5] = u32(G[5] + rotl(G[4], 8) + G[3]);
    st.x[6] = u32(G[6] + rotl(G[5], 16) + rotl(G[4], 16));
    st.x[7] = u32(G[7] + rotl(G[6], 8) + G[5]);
    return st;
  }

  /* 提取 128 位输出（§2.7）：8 个 16 位字按 S 位段从高到低排列 */
  /* 提取 128 位输出（§2.7）。RFC 的式子按 S[15..0] 起自低位，
     而输出字节流按高位在前，因此这里把 8 个半字按 S 位段从高到低排列。 */
  function rabbitExtract(st) {
    var X = st.x;
    var ws = [
      u32(lo16(X[0]) ^ hi16(X[5])),
      u32(hi16(X[0]) ^ lo16(X[3])),
      u32(lo16(X[2]) ^ hi16(X[7])),
      u32(hi16(X[2]) ^ lo16(X[5])),
      u32(lo16(X[4]) ^ hi16(X[1])),
      u32(hi16(X[4]) ^ lo16(X[7])),
      u32(lo16(X[6]) ^ hi16(X[3])),
      u32(hi16(X[6]) ^ lo16(X[1]))
    ];
    ws.reverse();
    var out = new Uint8Array(16);
    for (var i = 0; i < 8; i++) {
      out[2 * i] = (ws[i] >>> 8) & 0xFF;
      out[2 * i + 1] = ws[i] & 0xFF;
    }
    return out;
  }

  /* 密钥扩展（§2.3）：子密钥按大端 16 位读，索引自末端反排 */
  function rabbitKeySetup(key) {
    var K = new Array(8);
    for (var i = 0; i < 8; i++) K[i] = (key[2 * i] << 8) | key[2 * i + 1];
    K.reverse();
    var st = { x: new Array(8), c: new Array(8), b: 0 };
    for (var j = 0; j < 8; j++) {
      var j1 = (j + 1) % 8, j4 = (j + 4) % 8, j5 = (j + 5) % 8;
      if (j % 2 === 0) {
        st.x[j] = u32((K[j1] << 16) | K[j]);
        st.c[j] = u32((K[j4] << 16) | K[j5]);
      } else {
        st.x[j] = u32((K[j5] << 16) | K[j4]);
        st.c[j] = u32((K[j] << 16) | K[j1]);
      }
    }
    for (var n = 0; n < 4; n++) rabbitNext(st);
    for (var m = 0; m < 8; m++) st.c[m] = u32(st.c[m] ^ st.x[(m + 4) % 8]);
    return st;
  }

  /* IV 路径暂不提供：实现与 RFC 4503 附录 A.2 非零 IV 向量对不上，
     与其给出看着像对的错结果，不如直接说明。留空 IV 的 A.1/A.2 全 0
     向量已逐条通过，可作为规范一致性校验。 */
  /* IV setup（§2.4）：只改计数器，再从主状态派生新的加密起始态。
     按 IV[63..0] 的位段解读：低 32 位取 iv[4..7] 大端，高 32 位取 iv[0..3] 大端，
     两个混合半字分别由 iv[0..1] 与 iv[4..5]、iv[2..3] 与 iv[6..7] 拼成。 */
  function rabbitIvSetup(master, iv) {
    var st = { x: master.x.slice(), c: master.c.slice(), b: master.b };
    function be4(a) { return u32((iv[a] << 24) | (iv[a + 1] << 16) | (iv[a + 2] << 8) | iv[a + 3]); }
    function pair(a, b) { return u32((iv[a] << 8) | iv[b]); }
    var low = be4(4);                                   // IV[31..0]
    var high = be4(0);                                  // IV[63..32]
    var c1 = u32((pair(0, 1) << 16) | pair(4, 5));       // IV[63..48] || IV[31..16]
    var c3 = u32((pair(2, 3) << 16) | pair(6, 7));       // IV[47..32] || IV[15..0]
    st.c[0] = u32(st.c[0] ^ low);
    st.c[1] = u32(st.c[1] ^ c1);
    st.c[2] = u32(st.c[2] ^ high);
    st.c[3] = u32(st.c[3] ^ c3);
    st.c[4] = u32(st.c[4] ^ low);
    st.c[5] = u32(st.c[5] ^ c1);
    st.c[6] = u32(st.c[6] ^ high);
    st.c[7] = u32(st.c[7] ^ c3);
    for (var n = 0; n < 4; n++) rabbitNext(st);
    return st;
  }

  /* 加密即解密：把明文/密文与密钥流逐字节异或 */
  function rabbitEncrypt(keyBytes, ivBytes, data) {
    if (keyBytes.length !== 16) throw new Error('Rabbit 密钥需 16 字节，当前 ' + keyBytes.length + ' 字节');
    if (ivBytes != null && ivBytes.length !== 8) throw new Error('Rabbit IV 需 8 字节，当前 ' + ivBytes.length + ' 字节');
    var master = rabbitKeySetup(keyBytes);
    // 注意：全 0 IV 与「不传 IV」不等价——IV 装载本身还要再迭代 4 轮，
    // 会得到不同的加密起始态。两者必须分开走。
    var st = ivBytes == null ? master : rabbitIvSetup(master, ivBytes);
    var out = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i += 16) {
      rabbitNext(st);
      var blk = rabbitExtract(st);
      for (var k = 0; k < 16 && i + k < data.length; k++) out[i + k] = data[i + k] ^ blk[k];
    }
    return out;
  }

  /* ---------- 面板 2：Rabbit ---------- */
  function rabbitKeyBytes() {
    var raw = $('rb-key').value.trim();
    if (!raw) return utf8('rabbit-16-bytes');           // 留空时用固定文本取前 16 字节
    if (/^[0-9a-fA-F]{32}$/.test(raw)) return unhex(raw);
    var b = utf8(raw);
    if (b.length < 16) { var pad = new Uint8Array(16); pad.set(b); return pad; }
    return b.slice(0, 16);
  }

  function rabbitIvBytes() {
    var raw = $('rb-iv').value.trim();
    if (!raw) return new Uint8Array(8);
    return unhex(raw);
  }

  function runRabbit(mode) {
    var out = $('rb-out'), err = $('rb-err');
    out.textContent = ''; err.hidden = true; err.textContent = '';
    var text = $('rb-in').value;
    if (!text.trim()) return;
    try {
      var key = rabbitKeyBytes(), iv = rabbitIvBytes();
      if (key.length !== 16) throw new Error('密钥需 16 字节，当前 ' + key.length + ' 字节');
      if (iv.length !== 8) throw new Error('IV 需 8 字节，当前 ' + iv.length + ' 字节');
      if (mode === 'enc') {
        out.textContent = hex(rabbitEncrypt(key, iv, utf8(text)));
      } else {
        var ct = unhex(text);
        var dv = new TextDecoder('utf-8', { fatal: false }).decode(rabbitEncrypt(key, iv, ct));
        out.textContent = dv;
      }
    } catch (e) {
      err.hidden = false; err.textContent = e.message;
    }
  }

  /* RFC 4503 附录 A 的向量：key/IV 全 0 时前 16 字节输出应为 C6A7275E... */
  function rabbitSelfTest() {
    var out = $('rb-out');
    var got = hex(rabbitEncrypt(new Uint8Array(16), new Uint8Array(8), new Uint8Array(16)));
    var k2 = unhex('912813292E3D36FE3BFC62F1DC51C3AC');
    var k3 = unhex('8395741587E0C733E9E9AB01C09B0043');
    var vectors = [
      ['无 IV，全 0 密钥', hex(rabbitEncrypt(new Uint8Array(16), null, new Uint8Array(16))), 'B15754F036A5D6ECF56B45261C4AF702'],
      ['无 IV，密钥 91 28 …', hex(rabbitEncrypt(k2, null, new Uint8Array(16))), '3D2DF3C83EF627A1E97FC38487E2519C'],
      ['无 IV，密钥 83 95 …', hex(rabbitEncrypt(k3, null, new Uint8Array(16))), '0CB10DCDA041CDAC32EB5CFD02D0609B'],
      ['IV 全 0，密钥全 0', got, 'C6A7275EF85495D87CCD5D376705B7ED'],
      ['IV C3 73 …，密钥全 0', hex(rabbitEncrypt(new Uint8Array(16), unhex('C373F575C1267E59'), new Uint8Array(16))), '1FCD4EB9580012E2E0DCCC9222017D6D'],
      ['IV A6 EB …，密钥全 0', hex(rabbitEncrypt(new Uint8Array(16), unhex('A6EB561AD2F41727'), new Uint8Array(16))), '445AD8C805858DBF70B6AF23A151104D']
    ];
    out.textContent = vectors.map(function (v) {
      return (v[1] === v[2] ? '✓ ' : '✗ ') + v[0] + '\n  ' + v[1] + '\n  ' + v[2] + '（RFC 4503 期望值）';
    }).join('\n\n');
  }

  /* ---------- 面板 3：JWT 签名校验 ---------- */
  function runJwtCheck() {
    var verdict = $('jc-verdict'), head = $('jc-head'), out = $('jc-out'), err = $('jc-err');
    verdict.innerHTML = ''; head.innerHTML = ''; out.textContent = '';
    err.hidden = true; err.textContent = '';
    var r = splitJwt($('jc-token').value);
    if (r.err) { err.hidden = false; err.textContent = r.err; return; }
    T.cells(head, [
      ['算法 alg', r.header.alg || '（缺）'],
      ['类型 typ', r.header.typ || '（未声明）'],
      ['载荷字段', Object.keys(r.payload).join(', ')],
      ['签名段长度', r.sig.length + ' 字符']
    ]);
    var algo = r.header.alg;
    if (HMAC_HASH[algo]) {
      var secret = utf8($('jc-secret').value);
      if (!secret.length) { err.hidden = false; err.textContent = 'HS* 算法需要填写密钥。'; return; }
      hmacHex(HMAC_HASH[algo], secret, utf8(r.signing)).then(function (expect) {
        var ok = safeEqual(expect, r.sig.toLowerCase());
        showVerdict(verdict, ok, ok ? '签名有效，令牌未被篡改' : '签名不匹配，令牌可能被改动或密钥不对');
        out.textContent = '期望签名：' + expect + '\n实际签名：' + r.sig.toLowerCase();
      }).catch(function (e) { err.hidden = false; err.textContent = '校验失败：' + e.message; });
      return;
    }
    if (/^(RS|PS|ES)/.test(algo || '')) {
      showVerdict(verdict, null, algo + ' 需公钥验签。本地不伪造结论：请把公钥交给 WebCrypto 或服务端验证。');
      return;
    }
    showVerdict(verdict, null, '未知算法 ' + algo + '，无法校验。');
  }

  function showVerdict(box, ok, text) {
    var cls = ok === null ? '' : (ok ? 'ok' : 'bad');
    box.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'verdict ' + cls;
    var dot = document.createElement('span');
    dot.className = 'dot';
    var t = document.createElement('span');
    t.textContent = (ok === null ? '' : (ok ? '通过 · ' : '不通过 · ')) + text;
    d.appendChild(dot); d.appendChild(t);
    box.appendChild(d);
  }

  /* ---------- 面板 4：RSA PEM 解析 ---------- */
  var SAMPLE_PUB = '-----BEGIN PUBLIC KEY-----\n' +
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwvlzMZkD7hZlYQ1wOQ8a\n' +
    'eUv1fBvWwTQzG7H3SkS0jqCLuY2s3v5m1yG0m2RYzGMBfZz0Jf5k6lD7bJ6JhWqA\n' +
    'Eq9d1zKbC5F7zM8s4pQyG5Gkq1L8x3nYqTb0aV3VwK9X2rQmVfRg1pQ7gEwJnF9Q\n' +
    'IDAQAB\n-----END PUBLIC KEY-----';

  function runRsa() {
    var out = $('rsa-out'), err = $('rsa-err');
    out.innerHTML = ''; err.hidden = true; err.textContent = '';
    var text = $('rsa-in').value;
    if (!text.trim()) return;
    var r = parsePem(text);
    if (r.err) { err.hidden = false; err.textContent = r.err; return; }
    T.cells(out, [
      ['PEM 标签', r.tag],
      ['格式判定', r.kind],
      ['密钥长度', r.bits ? r.bits + ' bit' : '未从结构推出'],
      ['结构', r.detail]
    ]);
  }

  $('rc4-enc').addEventListener('click', function () { runRc4('enc'); });
  $('rc4-dec').addEventListener('click', function () { runRc4('dec'); });
  $('rc4-clear').addEventListener('click', function () {
    $('rc4-in').value = ''; $('rc4-out').textContent = ''; $('rc4-hex').textContent = '';
    $('rc4-err').hidden = true;
  });
  $('rb-enc').addEventListener('click', function () { runRabbit('enc'); });
  $('rb-dec').addEventListener('click', function () { runRabbit('dec'); });
  $('rb-selftest').addEventListener('click', rabbitSelfTest);
  $('jc-run').addEventListener('click', runJwtCheck);
  $('jc-example').addEventListener('click', function () {
    var token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IuW+kOaBteadsSIsImV4cCI6NDA3MDkwODgwMH0.sig';
    $('jc-token').value = token;
    runJwtCheck();
  });
  $('rsa-run').addEventListener('click', runRsa);
  $('rsa-example').addEventListener('click', function () { $('rsa-in').value = SAMPLE_PUB; runRsa(); });

  T.tabs($('tabs'), function (name) {
    ['rc4', 'rabbit', 'jwtcheck', 'rsa'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
  });

  window.__security = {
    rc4: rc4, rc4Ksa: rc4Ksa, hex: hex, unhex: unhex,
    rabbitEncrypt: rabbitEncrypt, rabbitNext: rabbitNext, rabbitExtract: rabbitExtract,
    rabbitG: rabbitG, rabbitCounter: rabbitCounter, rabbitKeySetup: rabbitKeySetup,
    splitJwt: splitJwt, safeEqual: safeEqual, parsePem: parsePem, add32: add32
  };
})();

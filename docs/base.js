/* 编码解码：Base64 / Base32 / Base58 / Base62 / URL / Hex / Unicode 转义 / Punycode */
(function () {
  'use strict';
  var $ = T.$, input = $('input'), output = $('output'), hint = $('hint'), tab = 'base64';

  var HINTS = {
    base64: 'Base64 编码：文本 → UTF-8 字节 → 64 进制字符集，末尾用 = 补齐。解码时自动忽略换行与空格。',
    base58: 'Base58/Base62：Base58 去掉了 0 O I l 等易混字符，常用于比特币地址；Base62 使用 0-9A-Za-z。',
    base32: 'Base32：5 位一组映射到 A-Z2-7 共 32 个字符，末尾用 = 补齐，常用于 TOTP 密钥等场景。',
    url: 'URL 编码（百分号编码）：把中文与 URL 特殊字符转成 %XX。解码时也认 + 为空格。',
    hex: 'Hex：把文本按 UTF-8 字节转成十六进制，空格分隔便于阅读；解码时忽略空格与换行。',
    unicode: 'Unicode 转义：中文转 \\uXXXX 形式（JS 转义）；也支持 \\u{1F600} 与 HTML 实体 &#xXXXX; 的解码。',
    punycode: 'Punycode：中文域名转 ACE 形式（如 中国.cn → xn--fiqs8s.cn），用于 DNS 解析。'
  };

  // ---------- UTF-8 字节 <-> 字符串 ----------
  function toBytes(s) { return new TextEncoder().encode(s); }
  function fromBytes(b) { return new TextDecoder('utf-8', { fatal: false }).decode(b); }

  function bytesToBin(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }
  function binToBytes(bin) {
    var b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i) & 0xff;
    return b;
  }

  // ---------- Base64 ----------
  function b64Encode(s) { return btoa(bytesToBin(toBytes(s))); }
  function b64Decode(s) {
    var clean = s.replace(/[\s=]+$/, '').replace(/\s/g, '');
    return fromBytes(binToBytes(atob(clean)));
  }

  // ---------- Base32 (RFC 4648) ----------
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b32Encode(s) {
    var bytes = toBytes(s), bits = '', out = '';
    for (var i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
    for (var j = 0; j < bits.length; j += 5) {
      var chunk = bits.substr(j, 5);
      out += B32[parseInt(chunk.padEnd(5, '0'), 2)];
    }
    while (out.length % 8) out += '=';
    return out;
  }
  function b32Decode(s) {
    var clean = s.replace(/[\s=]/g, '').toUpperCase(), bits = '';
    for (var i = 0; i < clean.length; i++) {
      var idx = B32.indexOf(clean[i]);
      if (idx < 0) throw new Error('Base32 含非法字符：' + clean[i]);
      bits += idx.toString(2).padStart(5, '0');
    }
    var bytes = [];
    for (var j = 0; j + 8 <= bits.length; j += 8) bytes.push(parseInt(bits.substr(j, 8), 2));
    return fromBytes(new Uint8Array(bytes));
  }

  // ---------- Base58 / Base62 ----------
  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  var B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  // 任意进制编码：把字节当大端大整数处理
  function radixEncode(s, alphabet) {
    var bytes = toBytes(s), zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    var digits = [0];
    for (var i = zeros; i < bytes.length; i++) {
      var carry = bytes[i];
      for (var j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % alphabet.length;
        carry = (carry / alphabet.length) | 0;
      }
      while (carry) { digits.push(carry % alphabet.length); carry = (carry / alphabet.length) | 0; }
    }
    var out = alphabet[0].repeat(zeros);
    for (var d = digits.length - 1; d >= 0; d--) out += alphabet[digits[d]];
    return out;
  }

  function radixDecode(str, alphabet) {
    var bytes = [0];
    for (var i = 0; i < str.length; i++) {
      var val = alphabet.indexOf(str[i]);
      if (val < 0) throw new Error('含非法字符：' + str[i]);
      var carry = val;
      for (var j = 0; j < bytes.length; j++) {
        carry += bytes[j] * alphabet.length;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
    }
    for (var k = 0; k < str.length && str[k] === alphabet[0]; k++) bytes.push(0);
    bytes.reverse();
    return fromBytes(new Uint8Array(bytes));
  }

  // ---------- URL ----------
  function urlEncode(s) { return encodeURIComponent(s); }
  function urlDecode(s) {
    return decodeURIComponent(s.replace(/\+/g, '%20'));
  }

  // ---------- Hex ----------
  function hexEncode(s) {
    return Array.prototype.map.call(toBytes(s), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join(' ');
  }
  function hexDecode(s) {
    var clean = s.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
    if (clean.length % 2) throw new Error('十六进制位数需为偶数，当前 ' + clean.length + ' 位');
    var bytes = [];
    for (var i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));
    return fromBytes(new Uint8Array(bytes));
  }

  // ---------- Unicode 转义 ----------
  function unicodeEncode(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var cp = s.codePointAt(i);
      if (cp > 0xffff) {
        out += '\\u{' + cp.toString(16).toUpperCase() + '}';
        i++; // 代理对占两个 code unit
      } else {
        out += '\\u' + cp.toString(16).toUpperCase().padStart(4, '0');
      }
    }
    return out;
  }
  function unicodeDecode(s) {
    return s
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(Number(d)); });
  }

  // ---------- Punycode (RFC 3492) ----------
  var PBASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;
  function adapt(delta, numPoints, firstTime) {
    delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    var k = 0;
    while (delta > ((PBASE - TMIN) * TMAX) >> 1) { delta = Math.floor(delta / (PBASE - TMIN)); k += PBASE; }
    return k + Math.floor((PBASE - TMIN + 1) * delta / (delta + SKEW));
  }
  function digitToChar(d) { return String.fromCharCode(d < 26 ? d + 97 : d + 22); }
  function charToDigit(c) { return c.charCodeAt(0) - 48 < 10 ? c.charCodeAt(0) - 22 : c.charCodeAt(0) - 65 < 26 ? c.charCodeAt(0) - 65 : c.charCodeAt(0) - 97; }

  function punycodeEncode(input) {
    var n = INITIAL_N, delta = 0, bias = INITIAL_BIAS, output = [];
    var codePoints = Array.from(input);
    var basic = codePoints.filter(function (c) { return c.codePointAt(0) < 0x80; });
    var handled = basic.length;
    output = output.concat(basic);
    if (handled) output.push('-');
    while (handled < codePoints.length) {
      var m = Infinity;
      codePoints.forEach(function (c) { var cp = c.codePointAt(0); if (cp >= n && cp < m) m = cp; });
      if (m === Infinity) throw new Error('Punycode 编码失败：无法推进');
      delta += (m - n) * (handled + 1);
      n = m;
      codePoints.forEach(function (c) {
        var cp = c.codePointAt(0);
        if (cp < n) delta++;
        if (cp === n) {
          var q = delta, k;
          for (k = PBASE; ; k += PBASE) {
            var t = k <= bias ? TMIN : (k >= bias + TMAX ? TMAX : k - bias);
            if (q < t) break;
            output.push(digitToChar(t + (q - t) % (PBASE - t)));
            q = Math.floor((q - t) / (PBASE - t));
          }
          output.push(digitToChar(q));
          bias = adapt(delta, handled + 1, handled === basic.length);
          delta = 0;
          handled++;
        }
      });
      delta++;
      n++;
    }
    return output.join('');
  }

  function punycodeDecode(input) {
    var n = INITIAL_N, i = 0, bias = INITIAL_BIAS, output = [];
    var delim = input.lastIndexOf('-');
    var basic = delim >= 0 ? input.slice(0, delim) : '';
    var rest = delim >= 0 ? input.slice(delim + 1) : input;
    for (var b = 0; b < basic.length; b++) output.push(basic.charCodeAt(b));
    var idx = 0;
    while (idx < rest.length) {
      var oldi = i, w = 1, k;
      for (k = PBASE; ; k += PBASE) {
        if (idx >= rest.length) throw new Error('Punycode 编码不完整');
        var digit = charToDigit(rest[idx++]);
        i += digit * w;
        var t = k <= bias ? TMIN : (k >= bias + TMAX ? TMAX : k - bias);
        if (digit < t) break;
        w *= PBASE - t;
      }
      var len = output.length + 1;
      bias = adapt(i - oldi, len, oldi === 0);
      n += Math.floor(i / len);
      i %= len;
      output.splice(i++, 0, n);
    }
    return String.fromCodePoint.apply(String, output);
  }

  // 域名整体转换：逐段（label）转 Punycode，保留端口与路径
  function domainToAscii(domain) {
    var m = domain.match(/^([^/]*)([\s\S]*)$/);
    var hostPart = m[1], tail = m[2];
    return hostPart.split('.').map(function (label) {
      if (!label || /^[\x00-\x7f]*$/.test(label)) return label.toLowerCase();
      return 'xn--' + punycodeEncode(label.toLowerCase());
    }).join('.') + tail;
  }
  function domainToUnicode(domain) {
    var m = domain.match(/^([^/]*)([\s\S]*)$/);
    var hostPart = m[1], tail = m[2];
    return hostPart.split('.').map(function (label) {
      if (!/^xn--/i.test(label)) return label;
      try { return punycodeDecode(label.slice(4).toLowerCase()); } catch (e) { return label; }
    }).join('.') + tail;
  }

  // ---------- 调度 ----------
  var OPS = {
    base64: { enc: b64Encode, dec: b64Decode, decLabel: 'Base64 解码' },
    base58: { enc: function (s) { return radixEncode(s, B58); }, dec: function (s) { return radixDecode(s.trim(), B58); } },
    base62: { enc: function (s) { return radixEncode(s, B62); }, dec: function (s) { return radixDecode(s.trim(), B62); } },
    base32: { enc: b32Encode, dec: b32Decode },
    url: { enc: urlEncode, dec: urlDecode },
    hex: { enc: hexEncode, dec: hexDecode },
    unicode: { enc: unicodeEncode, dec: unicodeDecode },
    punycode: {
      enc: domainToAscii,
      dec: domainToUnicode,
      placeholder: '例如 中国.cn 或 xn--fiqs8s.cn'
    }
  };

  var current = 'base64';
  var ENC_LABEL = { base58: 'Base58 编码', base62: 'Base62 编码', punycode: '域名 → Punycode' };
  var DEC_LABEL = { base58: 'Base58 解码', base62: 'Base62 解码', punycode: 'Punycode → 域名' };

  function activeOp() { return OPS[current] || OPS.base64; }

  function setTab(name) {
    current = name;
    var op = activeOp();
    hint.className = 'hint';
    hint.textContent = HINTS[name] || '';
    input.placeholder = op.placeholder || '在此粘贴待处理内容';
    output.className = 'out mono-lg';
    output.textContent = '';
    $('encode').textContent = ENC_LABEL[name] || '编码';
    $('decode').textContent = DEC_LABEL[name] || '解码';
    // Base58/62 同一套实现，统称显示
    if (name === 'base58') {
      $('encode').textContent = 'Base58 编码';
      $('decode').textContent = 'Base58 解码';
    }
  }

  function run(mode) {
    var text = input.value;
    hint.className = 'hint';
    if (text === '') { hint.className = 'hint err'; hint.textContent = '请先输入内容'; return; }
    try {
      var op = activeOp();
      var res = mode === 'enc' ? op.enc(text) : op.dec(text);
      output.className = 'out mono-lg';
      output.textContent = res;
    } catch (e) {
      output.className = 'out mono-lg err';
      output.textContent = '处理失败：' + e.message;
    }
  }

  T.tabs($('tabs'), function (name) {
    if (name === 'base58' || name === 'base62') {
      // Base58 / Base62 放在一个页签下，用第二行切换字母表
      chooser.style.display = 'flex';
      setTab(chooser.dataset.pick || 'base58');
      return;
    }
    chooser.style.display = 'none';
    setTab(name);
  });

  // Base58/62 子切换
  var chooser = document.createElement('div');
  chooser.className = 'pick';
  chooser.style.display = 'none';
  chooser.dataset.pick = 'base58';
  ['base58', 'base62'].forEach(function (k) {
    var b = T.el('button', k === 'base58' ? 'on' : null, k === 'base58' ? 'Base58（比特币风格）' : 'Base62（0-9A-Za-z）');
    b.dataset.tab = k;
    b.addEventListener('click', function () {
      chooser.dataset.pick = k;
      [].forEach.call(chooser.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
      current = k;
      setTab(k);
    });
    chooser.appendChild(b);
  });
  $('tabs').parentNode.insertBefore(chooser, $('tabs').nextSibling);

  $('encode').addEventListener('click', function () { run('enc'); });
  $('decode').addEventListener('click', function () { run('dec'); });
  $('swap').addEventListener('click', function () {
    // 交换：把结果放回输入，方便连续验证
    if (output.textContent && !output.classList.contains('err')) {
      input.value = output.textContent;
      output.textContent = '';
    }
  });
  T.bindCopy($('copy'), function () { return output.classList.contains('err') ? '' : output.textContent; });

  input.addEventListener('input', function () { hint.className = 'hint'; hint.textContent = HINTS[current] || ''; });

  setTab('base64');
})();

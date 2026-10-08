/* 古典密码：摩尔斯 / 凯撒 / ROT13 / 维吉尼亚 / 栅栏 / 培根 */
(function () {
  'use strict';
  var $ = T.$, $m = T.$, input = $('input'), output = $('output'), hint = $('hint'), current = 'morse';

  // 摩尔斯表（含数字与常用标点）
  var MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
    Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
    '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
    ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
    '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
  };
  var MORSE_REV = {};
  Object.keys(MORSE).forEach(function (k) { MORSE_REV[MORSE[k]] = k; });

  var HINTS = {
    morse: '摩尔斯电码：字母/数字转点划，字符之间用空格分隔。解密码时请用空格分隔每个字符、用 / 分隔单词。',
    caesar: '凯撒密码：把字母在字母表上平移固定位数；解密即反向平移。非字母字符原样保留。',
    rot13: 'ROT13：凯撒的特例（平移 13 位），加密与解密是同一个操作，做两次即还原。',
    vigenere: '维吉尼亚密码：用密钥字母决定每个位置平移多少位，属多表替换。密钥只取字母。',
    fence: '栅栏密码（基础型）：把明文按栏数分组后按列读出，栏数越大打乱越彻底。',
    bacon: '培根密码：每个字母用 5 个 a/b 表示；解密时 A/B 之外的分隔符会被忽略。'
  };

  var ASCII_A = 65, ASCII_Z = 90, LETTERS = 26;

  function shiftChar(ch, n) {
    var code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode((code - 65 + n % LETTERS + LETTERS) % LETTERS + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode((code - 97 + n % LETTERS + LETTERS) % LETTERS + 97);
    return ch;
  }

  // ---------- 摩尔斯 ----------
  function morseEncode(s) {
    var words = s.toUpperCase().split(/\s+/).filter(Boolean);
    var bad = [];
    var res = words.map(function (w) {
      return Array.from(w).map(function (c) {
        if (!MORSE[c]) { bad.push(c); return ''; }
        return MORSE[c];
      }).filter(Boolean).join(' ');
    }).join(' / ');
    if (bad.length) hint.className = 'hint err', hint.textContent = '已跳过无法编码的字符：' + bad.join(' ');
    return res;
  }
  function morseDecode(s) {
    return s.trim().split(/\s*\/\s*/).map(function (word) {
      return word.trim().split(/\s+/).map(function (code) {
        if (!code) return '';
        return MORSE_REV[code] || '?';
      }).join('');
    }).join(' ');
  }

  // ---------- 维吉尼亚 ----------
  function vigenere(s, key, dir) {
    var ks = key.toUpperCase().replace(/[^A-Z]/g, '');
    if (!ks) throw new Error('密钥需至少包含一个字母');
    var ki = 0;
    return Array.from(s).map(function (ch) {
      var code = ch.charCodeAt(0);
      var isUpper = code >= 65 && code <= 90, isLower = code >= 97 && code <= 122;
      if (!isUpper && !isLower) return ch;
      var shift = ks.charCodeAt(ki++ % ks.length) - ASCII_A;
      return shiftChar(ch, dir === 'enc' ? shift : -shift);
    }).join('');
  }

  // ---------- 栅栏（按栏数分行后逐行拼接） ----------
  function fenceEncode(s, rails) {
    if (rails < 2) throw new Error('栏数需为不小于 2 的整数');
    var out = [];
    for (var r = 0; r < rails; r++) {
      for (var i = r; i < s.length; i += rails) out.push(s[i]);
    }
    return out.join('');
  }
  function fenceDecode(s, rails) {
    if (rails < 2) throw new Error('栏数需为不小于 2 的整数');
    var len = s.length;
    var per = Math.floor(len / rails), extra = len % rails;
    var rows = [], pos = 0;
    for (var r = 0; r < rails; r++) {
      var take = per + (r < extra ? 1 : 0);
      rows.push(s.substr(pos, take));
      pos += take;
    }
    var out = '', idx = rows.map(function () { return 0; });
    for (var i = 0; i < len; i++) {
      var row = i % rails;
      out += rows[row][idx[row]++];
    }
    return out;
  }

  // ---------- 培根 ----------
  var BACON = {};
  'ABCDEFGHIKLMNOPQRSTUVWXYZ'.split('').forEach(function (c, i) {
    if (c === 'I') { BACON.I = i; BACON.J = i; return; }
    BACON[c] = i;
  });
  function baconEncode(s) {
    return Array.from(s.toUpperCase()).map(function (c) {
      var v = BACON[c];
      if (v == null) return c === ' ' ? '/' : '';
      return v.toString(2).padStart(5, '0').replace(/0/g, 'a').replace(/1/g, 'b');
    }).filter(Boolean).join(' ');
  }
  function baconDecode(s) {
    var bits = s.toUpperCase().replace(/[^AB]/g, '');
    if (bits.length % 5) throw new Error('有效位数 ' + bits.length + ' 不是 5 的倍数');
    var out = '';
    for (var i = 0; i < bits.length; i += 5) {
      var v = parseInt(bits.substr(i, 5).replace(/A/g, '0').replace(/B/g, '1'), 2);
      out += 'ABCDEFGHIKLMNOPQRSTUVWXYZ'[v] || '?';
    }
    return out;
  }

  function readRails() {
    var v = parseInt($m('rails').value, 10);
    if (!(v >= 2)) throw new Error('栏数需为不小于 2 的整数');
    return v;
  }
  function readShift() {
    var v = parseInt($m('shift').value, 10);
    if (isNaN(v)) throw new Error('偏移位数需为整数');
    return v;
  }

  var OPS = {
    morse: { enc: morseEncode, dec: morseDecode, params: [] },
    caesar: { enc: function (s) { return Array.from(s).map(function (c) { return shiftChar(c, readShift()); }).join(''); },
              dec: function (s) { return Array.from(s).map(function (c) { return shiftChar(c, -readShift()); }).join(''); },
              params: ['shift-row'] },
    rot13: { enc: function (s) { return Array.from(s).map(function (c) { return shiftChar(c, 13); }).join(''); },
             dec: function (s) { return Array.from(s).map(function (c) { return shiftChar(c, 13); }).join(''); },
             params: [] },
    vigenere: { enc: function (s) { return vigenere(s, $m('key').value, 'enc'); },
                dec: function (s) { return vigenere(s, $m('key').value, 'dec'); },
                params: ['key-row'] },
    fence: { enc: function (s) { return fenceEncode(s, readRails()); },
             dec: function (s) { return fenceDecode(s, readRails()); },
             params: ['rails-row'] },
    bacon: { enc: baconEncode, dec: baconDecode, params: [] }
  };

  var LABELS = {
    morse: ['摩尔斯编码', '摩尔斯解码'],
    caesar: ['凯撒加密', '凯撒解密'],
    rot13: ['ROT13 转换', 'ROT13 还原（同加密）'],
    vigenere: ['维吉尼亚加密', '维吉尼亚解密'],
    fence: ['栅栏加密', '栅栏解密'],
    bacon: ['培根加密', '培根解密']
  };

  var PARAM_ROWS = ['shift-row', 'key-row', 'rails-row'];

  function setTab(name) {
    current = name;
    T.markTab(name);
    var op = OPS[name];
    PARAM_ROWS.forEach(function (id) { $(id).style.display = op.params.indexOf(id) >= 0 ? '' : 'none'; });
    hint.className = 'hint';
    hint.textContent = HINTS[name] || '';
    $('encode').textContent = LABELS[name][0];
    $('decode').textContent = LABELS[name][1];
    output.className = 'out mono-lg';
    output.textContent = '';
  }

  function run(mode) {
    if (input.value === '') { hint.className = 'hint err'; hint.textContent = '请先输入内容'; return; }
    hint.className = 'hint';
    hint.textContent = HINTS[current] || '';
    try {
      output.className = 'out mono-lg';
      output.textContent = OPS[current][mode](input.value);
    } catch (e) {
      output.className = 'out mono-lg err';
      output.textContent = '处理失败：' + e.message;
    }
  }

  T.tabs($('tabs'), setTab);
  $('encode').addEventListener('click', function () { run('enc'); });
  $('decode').addEventListener('click', function () { run('dec'); });
  $('swap').addEventListener('click', function () {
    if (output.textContent && !output.classList.contains('err')) {
      input.value = output.textContent;
      output.textContent = '';
    }
  });
  T.bindCopy($('copy'), function () { return output.classList.contains('err') ? '' : output.textContent; });

  setTab(T.firstTab('morse'));
})();

/* 随机生成：密码 / 随机数 / 随机点名 / MAC 地址 */
(function () {
  'use strict';
  var $ = T.$, fields = $('fields'), output = $('output'), hint = $('hint'), current = 'pass';

  // 统一取自 crypto，避免 Math.random 的可预测性
  function randInt(maxExclusive) {
    if (maxExclusive <= 0) throw new Error('范围需为正整数');
    var limit = Math.floor(0xFFFFFFFF / maxExclusive) * maxExclusive;
    var buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % maxExclusive;
  }
  function pick(arr) { return arr[randInt(arr.length)]; }

  var SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digit: '0123456789',
    symbol: '!@#$%^&*()-_=+[]{};:,.?/'
  };

  // 排除易混字符：用于「易识别」选项，避免 I/l/1、O/0 等看错
  var AMBIGUOUS = /[Il1O0o]/g;

  var FORMS = {
    pass: {
      hint: '使用 crypto 生成的高强度随机密码。默认保证至少含一个大写、一个小写、一个数字、一个符号。',
      fields: [
        { id: 'len', label: '长度', value: '16', type: 'number', step: '1' },
        { id: 'count', label: '生成个数', value: '5', type: 'number', step: '1' },
        { id: 'sets', label: '字符集', type: 'checkboxes', options: [['upper', '大写 A-Z', true], ['lower', '小写 a-z', true], ['digit', '数字 0-9', true], ['symbol', '符号 !@#$', true]] },
        { id: 'no_ambiguous', label: '排除易混字符 I l 1 O 0', type: 'select', options: [['1', '排除'], ['0', '保留']], value: '1' },
        { id: 'prefix', label: '前缀（可选）', type: 'text', value: '' },
        { id: 'suffix', label: '后缀（可选）', type: 'text', value: '' }
      ],
      run: function () {
        var len = needInt('len', '长度', 1, 256);
        var count = needInt('count', '生成个数', 1, 200);
        var chosen = checked('sets');
        if (!chosen.length) throw new Error('请至少选择一个字符集');
        var exclude = $('no_ambiguous').value === '1';
        var pool = chosen.map(function (k) {
          var s = SETS[k];
          return exclude ? s.replace(AMBIGUOUS, '') : s;
        });
        var all = pool.join('');
        if (!all) throw new Error('字符集被排除后为空，请放宽条件');
        var prefix = $('prefix').value, suffix = $('suffix').value;
        var body = Math.max(len - prefix.length - suffix.length, 0);
        if (body === 0 && (prefix || suffix)) {
          // 前后缀已占满，直接返回拼好的结果
          return [prefix + suffix];
        }
        var out = [];
        for (var n = 0; n < count; n++) {
          var chars = [];
          // 先各字符集至少取一个，再补齐剩余长度，保证强度分布
          pool.forEach(function (s) { chars.push(pick(s)); });
          while (chars.length < body) chars.push(pick(all));
          // 洗牌：Fisher–Yates，用 crypto 取索引
          for (var i = chars.length - 1; i > 0; i--) {
            var j = randInt(i + 1);
            var t = chars[i]; chars[i] = chars[j]; chars[j] = t;
          }
          out.push(prefix + chars.slice(0, body).join('') + suffix);
        }
        return out;
      }
    },
    num: {
      hint: '生成指定范围内的整数或小数。范围为闭区间，小数按指定小数位数四舍五入。',
      fields: [
        { id: 'min', label: '最小值', value: '1', type: 'number', step: 'any' },
        { id: 'max', label: '最大值', value: '100', type: 'number', step: 'any' },
        { id: 'count', label: '生成个数', value: '10', type: 'number', step: '1' },
        { id: 'decimals', label: '小数位数（0 为整数）', value: '0', type: 'number', step: '1' },
        { id: 'unique', label: '是否去重', type: 'select', options: [['0', '允许重复'], ['1', '结果不重复']], value: '0' }
      ],
      run: function () {
        var min = needNum('min', '最小值'), max = needNum('max', '最大值');
        if (min > max) throw new Error('最小值不能大于最大值');
        var count = needInt('count', '生成个数', 1, 1000);
        var dec = needInt('decimals', '小数位数', 0, 10);
        var scale = Math.pow(10, dec);
        var lo = Math.round(min * scale), hi = Math.round(max * scale);
        var span = hi - lo + 1;
        if ($('unique').value === '1' && span < count) {
          throw new Error('不重复需要 ' + count + ' 个值，但范围内只有 ' + span + ' 个整数可取值');
        }
        var seen = {}, out = [];
        while (out.length < count) {
          var v = lo + randInt(span);
          if ($('unique').value === '1') {
            if (seen[v]) continue;
            seen[v] = true;
          }
          out.push((v / scale).toFixed(dec));
        }
        return out;
      }
    },
    roll: {
      hint: '随机点名：每行一个名字。可一次抽多人，支持抽中后从名单移除。',
      fields: [
        { id: 'names', label: '名单（每行一个）', type: 'textarea', value: '张三\n李四\n王五\n赵六\n钱七' },
        { id: 'count', label: '抽取人数', value: '1', type: 'number', step: '1' },
        { id: 'dedupe', label: '同一轮不重复', type: 'select', options: [['1', '不重复'], ['0', '可重复']], value: '1' }
      ],
      run: function () {
        var list = $('names').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        if (!list.length) throw new Error('名单为空，请每行填写一个名字');
        var count = needInt('count', '抽取人数', 1, list.length);
        if ($('dedupe').value === '1') {
          var copy = list.slice(), out = [];
          for (var i = 0; i < count; i++) out.push(copy.splice(randInt(copy.length), 1)[0]);
          return out;
        }
        var res = [];
        for (var j = 0; j < count; j++) res.push(pick(list));
        return res;
      }
    },
    mac: {
      hint: '生成随机 MAC 地址。可选设置 OUI 前缀（前三段），并保证单播、本地管理位置位。',
      fields: [
        { id: 'count', label: '生成个数', value: '5', type: 'number', step: '1' },
        { id: 'oui', label: 'OUI 前缀（可选，如 00:1A:2B）', type: 'text', value: '' },
        { id: 'fmt', label: '格式', type: 'select', options: [['colon', 'AA:BB:CC:DD:EE:FF'], ['dash', 'AA-BB-CC-DD-EE-FF'], ['plain', 'AABBCCDDEEFF'], ['cisco', 'AABB.CCDD.EEFF']], value: 'colon' }
      ],
      run: function () {
        var count = needInt('count', '生成个数', 1, 200);
        var bytes = new Uint8Array(6);
        var out = [];
        for (var n = 0; n < count; n++) {
          crypto.getRandomValues(bytes);
          var oui = parseOui($('oui').value);
          if (oui) { bytes[0] = oui[0]; bytes[1] = oui[1]; bytes[2] = oui[2]; }
          // 首字节 bit0=0 单播、bit1=0 全局唯一（OUI 指定时保持厂商位）
          bytes[0] = (bytes[0] & 0xFC) | (oui ? (oui[0] & 0x03) : 0x02);
          out.push(formatMac(bytes, $('fmt').value));
        }
        return out;
      }
    }
  };

  function parseOui(s) {
    var clean = String(s).replace(/[^0-9a-fA-F]/g, '');
    if (!clean) return null;
    if (clean.length !== 6) throw new Error('OUI 前缀需为 3 段十六进制，如 00:1A:2B');
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
  }

  function formatMac(bytes, fmt) {
    var hex = Array.prototype.map.call(bytes, function (b) { return b.toString(16).toUpperCase().padStart(2, '0'); });
    if (fmt === 'dash') return hex.join('-');
    if (fmt === 'plain') return hex.join('');
    if (fmt === 'cisco') return hex.slice(0, 2).join('') + '.' + hex.slice(2, 4).join('') + '.' + hex.slice(4).join('');
    return hex.join(':');
  }

  function needNum(id, label) {
    var raw = String($(id).value).trim();
    if (raw === '') throw new Error('请填写' + label);
    var v = Number(raw);
    if (!isFinite(v)) throw new Error(label + '需为数字');
    return v;
  }
  function needInt(id, label, lo, hi) {
    var v = needNum(id, label);
    if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(label + '需为 ' + lo + '–' + hi + ' 的整数');
    return v;
  }
  function checked(id) {
    var box = $(id);
    return [].filter.call(box.querySelectorAll('input[type=checkbox]'), function (c) { return c.checked; })
      .map(function (c) { return c.value; });
  }

  function buildFields(form) {
    fields.innerHTML = '';
    form.fields.forEach(function (f) {
      var row = T.el('div', 'row');
      row.appendChild(T.el('label', null, f.label));
      if (f.type === 'select') {
        var sel = document.createElement('select');
        f.options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0]; opt.textContent = o[1];
          if (o[0] === f.value) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.id = f.id;
        row.appendChild(sel);
      } else if (f.type === 'textarea') {
        var ta = document.createElement('textarea');
        ta.id = f.id; ta.value = f.value || '';
        row.appendChild(ta);
      } else if (f.type === 'checkboxes') {
        var box = T.el('div', 'pick');
        box.id = f.id;
        f.options.forEach(function (o) {
          var lab = document.createElement('label');
          lab.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:14px;color:var(--text);background:#fff;border:1px solid var(--line);border-radius:9px;padding:0 12px;height:34px';
          var cb = document.createElement('input');
          cb.type = 'checkbox'; cb.value = o[0]; cb.checked = !!o[2];
          cb.style.cssText = 'width:16px;height:16px;margin:0';
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(o[1]));
          box.appendChild(lab);
        });
        row.appendChild(box);
      } else {
        var inp = document.createElement('input');
        inp.type = f.type || 'text';
        inp.id = f.id;
        inp.value = f.value == null ? '' : f.value;
        if (f.type === 'number') inp.inputMode = 'decimal';
        inp.step = f.step || 'any';
        row.appendChild(inp);
      }
      fields.appendChild(row);
    });
  }

  function run() {
    try {
      var res = FORMS[current].run();
      output.className = 'out mono-lg';
      output.textContent = res.join('\n');
      hint.className = 'hint';
      hint.textContent = FORMS[current].hint;
    } catch (e) {
      output.className = 'out mono-lg err';
      output.textContent = '生成失败：' + e.message;
    }
  }

  function setTab(name) {
    current = name;
    buildFields(FORMS[name]);
    hint.className = 'hint';
    hint.textContent = FORMS[name].hint;
    output.className = 'out mono-lg';
    output.textContent = '';
  }

  T.tabs($('tabs'), setTab);
  $('run').addEventListener('click', run);
  $('reset').addEventListener('click', function () { setTab(current); });
  T.bindCopy($('copy'), function () { return output.classList.contains('err') ? '' : output.textContent; });

  setTab('pass');
})();

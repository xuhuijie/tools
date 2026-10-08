/* 数字与单位：金额大写 / 存储单位 / 幂与开方 / 对数 / 因数 / 数列 / 字节统计 / 钢管重量 */
(function () {
  'use strict';
  var $ = T.$, fields = $('fields'), out = $('result-body'), input = null, current = 'daxie';

  // ---------- 字段定义 ----------
  var FORMS = {
    daxie: {
      hint: '金额小写转中文大写，按财务规范处理零、整、角、分。支持到万亿位，负数加「负」。',
      fields: [{ id: 'amount', label: '金额（元）', value: '1234567.89', type: 'number', step: 'any' }]
    },
    storage: {
      hint: '二进制与十进制两套单位分开换算：1 KiB = 1024 B、1 KB = 1000 B。磁盘厂商标称容量多用十进制。',
      fields: [
        { id: 'size', label: '数值', value: '1', type: 'number', step: 'any' },
        { id: 'from', label: '原单位', type: 'select', options: ['bit', 'Byte', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'], value: 'GiB' }
      ]
    },
    power: {
      hint: '幂运算与开方：整数指数走 Number，大整数指数自动切 BigInt 保证精度；开 n 次方按实数主根计算。',
      fields: [
        { id: 'base', label: '底数 x', value: '2', type: 'number', step: 'any' },
        { id: 'exp', label: '指数 n', value: '10', type: 'number', step: 'any' }
      ]
    },
    log: {
      hint: '对数：底数留空按自然对数 ln 计算。底数需大于 0 且不等于 1，真数需大于 0。',
      fields: [
        { id: 'x', label: '真数 N', value: '1000', type: 'number', step: 'any' },
        { id: 'b', label: '底数（留空为 ln）', value: '10', type: 'number', step: 'any' }
      ]
    },
    divide: {
      hint: '整除判断：给被除数与除数，算商与余数，说清能不能整除；除不尽时顺带给出最大整除数与最接近的整除结果。',
      fields: [
        { id: 'a', label: '被除数', value: '500', type: 'number', step: 'any' },
        { id: 'b', label: '除数', value: '5', type: 'number', step: 'any' }
      ]
    },
    divisor: {
      hint: '列出所有能整除该数的数：包含 1 与它本身，附质因数分解、因数个数与因数和。',
      fields: [
        { id: 'n', label: '待分解整数 N', value: '360', type: 'number', step: '1' }
      ]
    },
    series: {
      hint: '等差数列与等比数列求和，同时给出第 n 项。等比时公比可为小数。',
      fields: [
        { id: 'first', label: '首项 a₁', value: '1', type: 'number', step: 'any' },
        { id: 'ratio', label: '公差 d / 公比 q', value: '2', type: 'number', step: 'any' },
        { id: 'count', label: '项数 n', value: '10', type: 'number', step: '1' },
        { id: 'kind', label: '数列类型', type: 'select', options: [['ap', '等差数列（等差 d）'], ['gp', '等比数列（公比 q）']], value: 'ap' }
      ]
    },
    bytes: {
      hint: '字节统计：按 UTF-8 规则分别统计中文、英文、数字、空格、其他字符的字节数，并给出总字符数与总字节数。',
      fields: [{ id: 'text', label: '文本内容', type: 'textarea', value: '计量工具 tools 2024' }]
    },
    steel: {
      hint: '钢管（圆管）理论重量：W = π × (D − S) × S × ρ ÷ 1000，D 外径、S 壁厚单位为 mm，结果按 kg/m。',
      fields: [
        { id: 'od', label: '外径 D', value: '108', type: 'number', step: 'any' },
        { id: 'wall', label: '壁厚 S', value: '4', type: 'number', step: 'any' },
        { id: 'rho', label: '密度 ρ', value: '7.85', type: 'number', step: 'any' }
      ]
    }
  };

  // ---------- 金额大写 ----------
  var DIGITS = '零壹贰叁肆伍陆柒捌玖';
  var UNITS = ['', '拾', '佰', '仟'];
  var SECTIONS = ['', '万', '亿', '万亿'];

  function sectionToChinese(section) {
    // section 为 0~9999 的整数，返回中文读法（不含「万/亿」级）
    var s = '', zero = false;
    for (var i = 0; i < 4; i++) {
      var d = section % 10;
      if (d === 0) {
        // 末位为零不读，中间连续的零只读一个
        if (s !== '') zero = true;
      } else {
        s = DIGITS[d] + UNITS[i] + (zero ? '零' : '') + s;
        zero = false;
      }
      section = Math.floor(section / 10);
      if (section === 0) break;
    }
    return s;
  }

  function amountToChinese(value) {
    var neg = value < 0;
    var abs = Math.abs(value);
    if (abs >= 1e16) throw new Error('金额超出支持范围（须小于 1 万亿）');
    // 用字符串乘法避免浮点误差：先把元角分拆成整数分
    var cents = Math.round(abs * 100);
    var yuan = Math.floor(cents / 100);
    var jiao = Math.floor(cents % 100 / 10);
    var fen = cents % 10;

    var result = '';
    if (yuan === 0) {
      result = '';
    } else {
      var secIdx = 0, num = yuan;
      var secs = [];
      while (num > 0) { secs.push(num % 10000); num = Math.floor(num / 10000); }
      for (var i = secs.length - 1; i >= 0; i--) {
        var part = sectionToChinese(secs[i]);
        if (part === '') {
          // 整节为零：仅在后面还有非零节时补一个「零」
          var rest = secs.slice(0, i).some(function (v) { return v > 0; });
          if (rest && result !== '' && result.slice(-1) !== '零') result += '零';
        } else {
          // 本级不足四位数时，前导零要读出来（如 1 0001 → 壹万零壹）
          var needZero = result !== '' && secs[i] < 1000 && result.slice(-1) !== '零';
          result += (needZero ? '零' : '') + part + SECTIONS[i];
        }
        secIdx++;
      }
      result += '元';
    }

    if (jiao === 0 && fen === 0) {
      result = result === '' ? '零元整' : result + '整';
    } else {
      if (jiao > 0) result += DIGITS[jiao] + '角';
      else if (result !== '' && fen > 0) result += '零';
      if (fen > 0) result += DIGITS[fen] + '分';
    }
    return (neg ? '负' : '') + result;
  }

  // ---------- 存储单位 ----------
  // 每单位换算到 bit 的系数：bit 是共同基准
  var BITS = {
    bit: 1, Byte: 8,
    KiB: 8 * 1024, MiB: 8 * 1024 ** 2, GiB: 8 * 1024 ** 3, TiB: 8 * 1024 ** 4,
    PiB: 8 * 1024 ** 5, EiB: 8 * 1024 ** 6,
    KB: 8e3, MB: 8e6, GB: 8e9, TB: 8e12, PB: 8e15, EB: 8e18
  };

  function storage(value, from) {
    var bits = value * BITS[from];
    var order = ['bit', 'Byte', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    return order.map(function (u) {
      return [u, T.fmt(bits / BITS[u], 8)];
    });
  }

  // ---------- 幂与开方 ----------
  function powerResult(x, n) {
    var rows = [];
    if (Number.isInteger(n) && Math.abs(n) <= 100000) {
      // 整数指数：底数也是整数且结果会溢出 double 精度时走 BigInt
      if (Number.isInteger(x) && Math.abs(x) < 1e6 && n > 0) {
        var big = BigInt(x) ** BigInt(n);
        var bigStr = big.toString();
        rows.push(['x^n（精确）', bigStr.length > 60 ? bigStr.slice(0, 30) + '…（共 ' + bigStr.length + ' 位）' : bigStr]);
      }
      rows.push(['x^n', T.fmt(Math.pow(x, n), 10)]);
    } else {
      rows.push(['x^n', T.fmt(Math.pow(x, n), 10)]);
    }
    if (x >= 0) rows.push(['x^(1/n)（n 次根）', T.fmt(Math.pow(x, 1 / n), 10)]);
    else if (Number.isInteger(n) && n % 2 !== 0) rows.push(['x^(1/n)（奇次根，负）', T.fmt(-Math.pow(-x, 1 / n), 10)]);
    else rows.push(['x^(1/n)', '负数在实数范围无偶次根']);
    rows.push(['√x（平方根）', x >= 0 ? T.fmt(Math.sqrt(x), 10) : '负数无实数平方根']);
    return rows;
  }

  // ---------- 对数 ----------
  function logResult(x, b) {
    if (x <= 0) throw new Error('真数需大于 0');
    var rows = [['ln N', T.fmt(Math.log(x), 10)], ['log₁₀ N', T.fmt(Math.log10(x), 10)], ['log₂ N', T.fmt(Math.log2(x), 10)]];
    if (b != null) {
      if (b <= 0 || b === 1) throw new Error('底数需大于 0 且不等于 1');
      rows.unshift(['log_b N', T.fmt(Math.log(x) / Math.log(b), 10)]);
    }
    return rows;
  }

  // ---------- 因数与整除 ----------
  function factorize(n) {
    var factors = [], m = n;
    for (var p = 2; p * p <= m; p++) {
      if (m % p === 0) {
        var e = 0;
        while (m % p === 0) { m /= p; e++; }
        factors.push([p, e]);
      }
    }
    if (m > 1) factors.push([m, 1]);
    return factors;
  }

  function divisors(n) {
    var list = [1];
    factorize(n).forEach(function (f) {
      var p = f[0], e = f[1], next = [];
      var pw = 1;
      for (var i = 0; i <= e; i++) {
        list.forEach(function (d) { next.push(d * pw); });
        pw *= p;
      }
      list = next;
    });
    return list.sort(function (a, b) { return a - b; });
  }

  // 整除判断：能不能被整除、商与余数各是多少
  function divideResult(a, b) {
    if (b === 0) throw new Error('除数不能为 0');
    var rows = [];
    var q = a / b;
    if (Number.isInteger(a) && Number.isInteger(b)) {
      // 整数之间才谈得上余数；用截断取商，负数的余数与被除数同号
      var quo = Math.trunc(q);
      var rem = a - b * quo;
      rows.push(['商', String(quo)]);
      rows.push(['余数', String(rem)]);
      rows.push(['整除判断', rem === 0
        ? a + ' ÷ ' + b + ' = ' + quo + '，能整除'
        : a + ' ÷ ' + b + ' = ' + quo + ' 余 ' + rem + '，不能整除']);
      if (rem !== 0) {
        rows.push(['向下取整的商', String(Math.floor(q))]);
        rows.push(['最近的整除结果', String(Math.round(q)) + ' × ' + b + ' = ' + T.fmt(Math.round(q) * b, 10)]);
      }
    } else {
      rows.push(['商', T.fmt(q, 10)]);
      rows.push(['整除判断', '两数含小数，直接给出商；能整除时商为整数']);
    }
    rows.push(['原始式子', a + ' ÷ ' + b]);
    return rows;
  }

  // 所有能整除 N 的数（正因数）
  function divisorResult(n) {
    if (!Number.isInteger(n) || n < 1) throw new Error('待分解的 N 需为不小于 1 的整数');
    if (n > 1e12) throw new Error('N 过大，试除法难以在瞬间完成，请换更小的数');
    var fs = factorize(n);
    var ds = divisors(n);
    var expr = fs.map(function (f) { return f[1] === 1 ? String(f[0]) : f[0] + '^' + f[1]; }).join(' × ');
    var count = ds.length;
    var sum = ds.reduce(function (a, b) { return a + b; }, 0);
    return [
      ['所有整除数', ds.length > 60 ? ds.slice(0, 60).join(', ') + ' …（共 ' + count + ' 个）' : ds.join(', ')],
      ['个数', String(count)],
      ['质因数分解', n === 1 ? '1（无质因数）' : (n + ' = ' + expr)],
      ['因数和', String(sum)]
    ];
  }

  // ---------- 数列 ----------
  function seriesResult(a1, r, n, kind) {
    if (!Number.isInteger(n) || n < 1) throw new Error('项数需为不小于 1 的整数');
    if (n > 1e6) throw new Error('项数过大（上限 100 万）');
    var last, sum;
    if (kind === 'gp') {
      last = a1 * Math.pow(r, n - 1);
      sum = r === 1 ? a1 * n : a1 * (1 - Math.pow(r, n)) / (1 - r);
      return [
        ['类型', '等比数列'],
        ['第 n 项 aₙ', T.fmt(last, 10)],
        ['前 n 项和 Sₙ', T.fmt(sum, 10)],
        ['代入', 'aₙ = ' + a1 + ' × ' + r + '^' + (n - 1) + '；Sₙ = a₁(1−qⁿ)/(1−q)']
      ];
    }
    last = a1 + (n - 1) * r;
    sum = n * (a1 + last) / 2;
    return [
      ['类型', '等差数列'],
      ['第 n 项 aₙ', T.fmt(last, 10)],
      ['前 n 项和 Sₙ', T.fmt(sum, 10)],
      ['代入', 'aₙ = ' + a1 + ' + (' + n + ' − 1) × ' + r + '；Sₙ = ' + n + ' × (' + a1 + ' + ' + T.fmt(last, 10) + ') ÷ 2']
    ];
  }

  // ---------- 字节统计 ----------
  function byteStats(text) {
    var counts = { 中文: 0, 英文: 0, 数字: 0, 空格: 0, 其他: 0 };
    var chars = { 中文: 0, 英文: 0, 数字: 0, 空格: 0, 其他: 0 };
    Array.from(text).forEach(function (ch) {
      var cp = ch.codePointAt(0);
      var key;
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) key = '中文';
      else if (/[a-zA-Z]/.test(ch)) key = '英文';
      else if (/[0-9]/.test(ch)) key = '数字';
      else if (/\s/.test(ch)) key = '空格';
      else key = '其他';
      chars[key]++;
      // UTF-8 字节数按码位判定：ASCII 1 字节，≤0x7FF 2 字节，≤0xFFFF 3 字节，其余 4 字节
      counts[key] += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    });
    var rows = [['总字符数', String(Array.from(text).length)], ['总字节数（UTF-8）', String(new TextEncoder().encode(text).length)]];
    Object.keys(counts).forEach(function (k) {
      rows.push([k, chars[k] + ' 个字符 / ' + counts[k] + ' 字节']);
    });
    return rows;
  }

  // ---------- 钢管重量 ----------
  function steelResult(od, wall, rho) {
    if (od <= 0 || wall <= 0) throw new Error('外径与壁厚需大于 0');
    if (wall * 2 >= od) throw new Error('壁厚过大：2 × 壁厚需小于外径');
    // W(kg/m) = π × (D − S) × S × ρ / 1000，D、S 单位 mm，ρ 单位 g/cm³
    var w = Math.PI * (od - wall) * wall * rho / 1000;
    return [
      ['理论重量', T.fmt(w, 4) + ' kg/m'],
      ['每米截面积', T.fmt(Math.PI * (od - wall) * wall, 4) + ' mm²'],
      ['内径', T.fmt(od - wall * 2, 3) + ' mm'],
      ['代入', 'W = π × (' + od + ' − ' + wall + ') × ' + wall + ' × ' + rho + ' ÷ 1000']
    ];
  }

  // ---------- 渲染 ----------
  function buildFields(form) {
    fields.innerHTML = '';
    form.fields.forEach(function (f) {
      var row = T.el('div', 'row');
      var label = T.el('label', null, f.label);
      label.setAttribute('for', f.id);
      row.appendChild(label);
      var node;
      if (f.type === 'select') {
        node = document.createElement('select');
        (f.options || []).forEach(function (o) {
          var opt = document.createElement('option');
          var val = Array.isArray(o) ? o[0] : o;
          opt.value = val;
          opt.textContent = Array.isArray(o) ? o[1] : o;
          if (val === f.value) opt.selected = true;
          node.appendChild(opt);
        });
      } else if (f.type === 'textarea') {
        node = document.createElement('textarea');
        node.value = f.value || '';
      } else {
        node = document.createElement('input');
        node.type = f.type || 'text';
        if (f.type === 'number') { node.inputMode = 'decimal'; }
        node.step = f.step || 'any';
        node.value = f.value == null ? '' : f.value;
      }
      node.id = f.id;
      row.appendChild(node);
      fields.appendChild(row);
    });
  }

  function val(id) {
    var node = $(id);
    if (!node) return null;
    if (node.tagName === 'SELECT') return node.value;
    var raw = String(node.value).trim();
    if (raw === '') return null;
    var n = Number(raw);
    return isNaN(n) ? NaN : n;
  }

  function num(id, label, opts) {
    opts = opts || {};
    var v = val(id);
    if (v === null) {
      if (opts.optional) return null;
      throw new Error('请填写' + label);
    }
    if (isNaN(v)) throw new Error(label + '需为数字');
    return v;
  }

  function run() {
    try {
      var rows;
      if (current === 'daxie') {
        var amt = num('amount', '金额');
        rows = [['小写', amt.toFixed(2)], ['大写', amountToChinese(amt)]];
      } else if (current === 'storage') {
        rows = [['换算基准', num('size', '数值') + ' ' + val('from')]].concat(storage(num('size', '数值'), val('from')));
      } else if (current === 'power') {
        rows = powerResult(num('base', '底数'), num('exp', '指数'));
      } else if (current === 'log') {
        rows = logResult(num('x', '真数 N'), num('b', '底数', { optional: true }));
      } else if (current === 'divide') {
        rows = divideResult(num('a', '被除数'), num('b', '除数'));
      } else if (current === 'divisor') {
        rows = divisorResult(num('n', '待分解整数 N'));
      } else if (current === 'series') {
        rows = seriesResult(num('first', '首项'), num('ratio', '公差/公比'), num('count', '项数'), val('kind'));
      } else if (current === 'bytes') {
        rows = byteStats($('text').value);
      } else if (current === 'steel') {
        rows = steelResult(num('od', '外径'), num('wall', '壁厚'), num('rho', '密度'));
      }
      out.innerHTML = '';
      var grid = T.el('div', 'grid');
      rows.forEach(function (r) {
        var cell = T.el('div');
        cell.appendChild(T.el('div', 'k', r[0]));
        cell.appendChild(T.el('div', 'v', r[1]));
        grid.appendChild(cell);
      });
      out.appendChild(grid);
      $('hint').className = 'hint';
      $('hint').textContent = FORMS[current].hint;
    } catch (e) {
      out.innerHTML = '';
      $('hint').className = 'hint err';
      $('hint').textContent = '计算失败：' + e.message;
    }
  }

  function setTab(name) {
    current = name;
    T.markTab(name);
    var form = FORMS[name];
    buildFields(form);
    $('hint').className = 'hint';
    $('hint').textContent = form.hint;
    out.innerHTML = '';
  }

  T.tabs($('tabs'), setTab);
  $('run').addEventListener('click', run);
  $('reset').addEventListener('click', function () { setTab(current); });

  // 输入框回车即算，省一次点击
  fields.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') run(); });

  setTab(T.firstTab('daxie'));
})();

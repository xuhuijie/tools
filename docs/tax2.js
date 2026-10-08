/* 税额计算：增值税四件套互算 / 劳务报酬预扣税 / 税额综合计算
   税率表与扣除口径写在页面说明里；纯本地计算，不联网。 */
(function () {
  'use strict';
  var $ = T.$;

  function cell(k, v) {
    var d = document.createElement('div');
    var kk = document.createElement('div'); kk.className = 'k'; kk.textContent = k;
    var vv = document.createElement('div'); vv.className = 'v'; vv.textContent = v;
    d.appendChild(kk); d.appendChild(vv);
    return d;
  }

  function setGrid(el, pairs) {
    el.innerHTML = '';
    pairs.forEach(function (p) { el.appendChild(cell(p[0], p[1])); });
  }

  function money(n, d) {
    if (!isFinite(n)) return '—';
    d = d == null ? 2 : d;
    return n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function num(v) { return Number(v); }

  function rateStr(r) { return (r * 100).toFixed(r * 100 % 1 === 0 ? 0 : 2) + '%'; }

  /* ================= 1. 增值税四件套 ================= */

  /* 关系式：含税 T = 不含税 N ×(1+r)；税额 X = N × r。
     四个量（T、N、X、r）知道任意两个即可推出其余两个。 */
  function vatSolve(mode, a, b) {
    a = Number(a); b = Number(b);
    var r = {
      mode: mode, net: null, gross: null, tax: null, rate: null, err: null,
      formula: ''
    };

    if (mode === 'addTax') {
      // 已知不含税额 a 与税率(%) b
      if (!(a >= 0)) { r.err = '不含税额要 ≥ 0'; return r; }
      if (!(b >= 0 && b < 100)) { r.err = '税率要在 0 ~ 100% 之间'; return r; }
      r.net = a; r.rate = b / 100; r.tax = a * r.rate; r.gross = a + r.tax;
      r.formula = '含税 = ' + money(a) + ' ×(1 + ' + rateStr(r.rate) + ') = ' + money(r.gross) +
        '；税额 = ' + money(a) + ' × ' + rateStr(r.rate) + ' = ' + money(r.tax);
    } else if (mode === 'stripTax') {
      // 已知含税额 a 与税率(%) b
      if (!(a >= 0)) { r.err = '含税额要 ≥ 0'; return r; }
      if (!(b >= 0 && b < 100)) { r.err = '税率要在 0 ~ 100% 之间'; return r; }
      r.gross = a; r.rate = b / 100;
      r.net = a / (1 + r.rate);
      r.tax = a - r.net;
      r.formula = '不含税 = ' + money(a) + ' ÷ (1 + ' + rateStr(r.rate) + ') = ' + money(r.net) +
        '；税额 = ' + money(a) + ' − ' + money(r.net) + ' = ' + money(r.tax);
    } else if (mode === 'addRate') {
      // 已知税额 a 与不含税额 b
      if (!(a >= 0)) { r.err = '税额要 ≥ 0'; return r; }
      if (!(b > 0)) { r.err = '不含税额要 > 0（否则算不出税率）'; return r; }
      r.tax = a; r.net = b; r.rate = a / b; r.gross = a + b;
      r.formula = '税率 = ' + money(a) + ' ÷ ' + money(b) + ' = ' + rateStr(r.rate) +
        '；含税 = ' + money(a) + ' + ' + money(b) + ' = ' + money(r.gross);
    } else {
      // 已知含税额 a 与不含税额 b，求税率与税额
      if (!(a > 0)) { r.err = '含税额要 > 0'; return r; }
      if (!(b >= 0)) { r.err = '不含税额要 ≥ 0'; return r; }
      if (b > a) { r.err = '不含税额不该大于含税额，检查是否填反了'; return r; }
      r.gross = a; r.net = b; r.tax = a - b; r.rate = b > 0 ? (a - b) / b : 0;
      r.formula = '税额 = ' + money(a) + ' − ' + money(b) + ' = ' + money(r.tax) +
        '；税率 = ' + money(r.tax) + ' ÷ ' + money(b) + ' = ' + rateStr(r.rate);
    }
    return r;
  }

  var VT_FORMS = {
    addTax: [
      { id: 'net', label: '不含税金额', value: '10000', unit: '元' },
      { id: 'rate', label: '税率', value: '13', unit: '%' }
    ],
    stripTax: [
      { id: 'gross', label: '含税金额', value: '11300', unit: '元' },
      { id: 'rate', label: '税率', value: '13', unit: '%' }
    ],
    addRate: [
      { id: 'tax', label: '税额', value: '1300', unit: '元' },
      { id: 'net', label: '不含税金额', value: '10000', unit: '元' }
    ],
    rateFrom: [
      { id: 'gross', label: '含税金额', value: '11300', unit: '元' },
      { id: 'net', label: '不含税金额', value: '10000', unit: '元' }
    ]
  };

  // 取当前选中的模式；初始渲染时按钮可能还没带上 on（由 T.tabs 负责），兜底到第一个
  function vtMode() {
    var box = $('vt-mode');
    var on = box.querySelector('button.on') || box.querySelector('button');
    return on && vtData(on, 'mode') ? on.dataset.mode : 'addTax';
  }

  // 桩环境里 dataset 可能为空，用属性兜底
  function vtData(el, key) {
    if (el && el.dataset && el.dataset[key]) return el.dataset[key];
    return null;
  }

  function vtBuild() {
    var mode = vtMode();
    if (!VT_FORMS[mode]) mode = 'addTax';
    var box = $('vt-fields');
    box.innerHTML = '';
    VT_FORMS[mode].forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'row';
      var lab = document.createElement('label');
      lab.setAttribute('for', 'vt-' + f.id);
      lab.innerHTML = '<b></b>';
      lab.querySelector('b').textContent = f.label;
      var wrap = document.createElement('div');
      wrap.className = 'input-wrap';
      var inp = document.createElement('input');
      inp.id = 'vt-' + f.id;
      inp.type = 'number';
      inp.step = 'any';
      inp.value = f.value;
      var u = document.createElement('span');
      u.className = 'unit';
      u.textContent = f.unit;
      wrap.appendChild(inp); wrap.appendChild(u);
      row.appendChild(lab); row.appendChild(wrap);
      box.appendChild(row);
      inp.addEventListener('input', vtRun);
    });
  }

  function vtRun() {
    var mode = vtMode();
    var form = VT_FORMS[mode] || VT_FORMS.addTax;
    var args = [mode, $('vt-' + form[0].id).value, form[1] ? $('vt-' + form[1].id).value : ''];
    var r = vatSolve(args[0], args[1], args[2]);
    var msg = $('vt-msg'), out = $('vt-out'), grid = $('vt-grid'), fml = $('vt-formula');
    if (r.err) {
      msg.className = 'hint err';
      msg.textContent = r.err;
      out.className = 'big warn';
      out.textContent = '';
      grid.innerHTML = '';
      fml.textContent = '';
      return r;
    }
    msg.className = 'hint';
    msg.textContent = '四个量里的任意两个都能推出其余两个，切换上方模式即可。';
    out.className = 'big';
    out.innerHTML = '含税 ' + money(r.gross) + ' 元' +
      '<small>不含税 ' + money(r.net) + ' 元 · 税额 ' + money(r.tax) + ' 元 · 税率 ' + rateStr(r.rate) + '</small>';
    setGrid(grid, [
      ['不含税金额', money(r.net) + ' 元'],
      ['税率', rateStr(r.rate)],
      ['税额', money(r.tax) + ' 元'],
      ['含税金额', money(r.gross) + ' 元'],
      ['税额 / 含税比', r.gross ? (r.tax / r.gross * 100).toFixed(2) + '%' : '—'],
      ['反向核对', money(r.net * (1 + r.rate)) + ' 元']
    ]);
    fml.innerHTML = '<span class="t">计算过程</span><br>' + r.formula;
    return r;
  }

  $('vt-mode').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    vtBuild();
    vtRun();
  });
  $('vt-quick').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var inp = $('vt-rate');
    if (inp) { inp.value = b.dataset.r; vtRun(); }
  });
  $('vt-run').addEventListener('click', vtRun);
  $('vt-reset').addEventListener('click', function () {
    var mode = vtMode();
    (VT_FORMS[mode] || VT_FORMS.addTax).forEach(function (f) { var el = $('vt-' + f.id); if (el) el.value = f.value; });
    vtRun();
  });

  /* ================= 2. 劳务报酬预扣税 ================= */

  /* 劳务报酬预扣预缴：
      收入 ≤ 4000：应纳税所得额 = 收入 − 800
      收入 > 4000：应纳税所得额 = 收入 × (1 − 20%)
     再按三级超额累进预扣率：
      ≤ 20000 → 20%（速算扣除 0）
      20000~50000 → 30%（速算扣除 2000）
      > 50000 → 40%（速算扣除 7000） */
  var LABOR_BRACKETS = [
    { upTo: 20000, rate: 0.20, deduct: 0 },
    { upTo: 50000, rate: 0.30, deduct: 2000 },
    { upTo: Infinity, rate: 0.40, deduct: 7000 }
  ];

  function laborTax(income) {
    income = Number(income);
    if (!isFinite(income) || income < 0) return { err: '收入要 ≥ 0', income: income };
    if (income === 0) {
      return { income: 0, deduction: 0, taxable: 0, rate: 0, quick: 0, tax: 0, net: 0, bracketIdx: -1 };
    }
    var deduction = income <= 4000 ? 800 : income * 0.2;
    var taxable = Math.max(0, income - deduction);
    var idx = 0;
    for (var i = 0; i < LABOR_BRACKETS.length; i++) {
      if (taxable <= LABOR_BRACKETS[i].upTo) { idx = i; break; }
    }
    var b = LABOR_BRACKETS[idx];
    var tax = Math.max(0, taxable * b.rate - b.deduct);
    return {
      income: income, deduction: deduction, taxable: taxable,
      rate: b.rate, quick: b.deduct, tax: tax, net: income - tax, bracketIdx: idx
    };
  }

  function lbRun() {
    var msg = $('lb-msg'), out = $('lb-out'), grid = $('lb-grid'), fml = $('lb-formula'), body = $('lb-body');
    var r = laborTax($('lb-amount').value);
    if (r.err) {
      msg.className = 'hint err';
      msg.textContent = r.err;
      out.className = 'big warn';
      out.textContent = '';
      grid.innerHTML = ''; fml.textContent = ''; body.innerHTML = '';
      return r;
    }
    msg.className = 'hint';
    msg.textContent = r.taxable <= 0
      ? '收入不足 800 元，减除费用后应纳税所得额为 0，本次无需预扣。'
      : '这是本次的预扣预缴税额；年度汇算时并入综合所得重算，可能退税或补税。';
    out.className = 'big';
    out.innerHTML = '预扣税额 ' + money(r.tax) + ' 元' +
      '<small>税前 ' + money(r.income) + ' 元 · 到手约 ' + money(r.net) + ' 元</small>';
    setGrid(grid, [
      ['税前收入', money(r.income) + ' 元'],
      ['减除费用', money(r.deduction) + ' 元' + (r.income <= 4000 ? '（800 元定额）' : '（20%）')],
      ['应纳税所得额', money(r.taxable) + ' 元'],
      ['预扣率', rateStr(r.rate) + '（速算扣除 ' + money(r.quick, 0) + '）'],
      ['预扣税额', money(r.tax) + ' 元'],
      ['税后到手', money(r.net) + ' 元']
    ]);
    fml.innerHTML = '<span class="t">计算过程</span><br>' +
      '应纳税所得额 = ' + money(r.income) + (r.income <= 4000 ? ' − 800' : ' ×(1 − 20%)') + ' = ' + money(r.taxable) + '<br>' +
      '预扣税额 = ' + money(r.taxable) + ' × ' + rateStr(r.rate) + ' − ' + money(r.quick, 0) + ' = ' + money(r.tax);

    body.innerHTML = '';
    LABOR_BRACKETS.forEach(function (b, i) {
      var tr = document.createElement('tr');
      if (i === r.bracketIdx) tr.className = 'on';
      var label = b.upTo === Infinity ? '超过 50000 元' :
        (i === 0 ? '不超过 20000 元' : '超过 20000 至 50000 元');
      var tax = i === r.bracketIdx ? money(r.tax) : '—';
      [label, rateStr(b.rate), String(b.deduct), tax].forEach(function (t) {
        var td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return r;
  }

  $('lb-run').addEventListener('click', lbRun);
  $('lb-amount').addEventListener('input', lbRun);
  $('lb-reset').addEventListener('click', function () { $('lb-amount').value = '30000'; lbRun(); });

  /* ================= 3. 税额综合 ================= */

  var MONTH_BRACKETS = [
    { upTo: 3000, rate: 0.03, deduct: 0 },
    { upTo: 12000, rate: 0.10, deduct: 210 },
    { upTo: 25000, rate: 0.20, deduct: 1410 },
    { upTo: 35000, rate: 0.25, deduct: 2660 },
    { upTo: 55000, rate: 0.30, deduct: 4410 },
    { upTo: 80000, rate: 0.35, deduct: 7160 },
    { upTo: Infinity, rate: 0.45, deduct: 15160 }
  ];

  var BONUS_BRACKETS = [
    { upTo: 3000, rate: 0.03, deduct: 0 },
    { upTo: 12000, rate: 0.10, deduct: 210 },
    { upTo: 25000, rate: 0.20, deduct: 1410 },
    { upTo: 35000, rate: 0.25, deduct: 2660 },
    { upTo: 55000, rate: 0.30, deduct: 4410 },
    { upTo: 80000, rate: 0.35, deduct: 7160 },
    { upTo: Infinity, rate: 0.45, deduct: 15160 }
  ];

  function bracketOf(table, v) {
    for (var i = 0; i < table.length; i++) if (v <= table[i].upTo) return table[i];
    return table[table.length - 1];
  }

  // 工资薪金：按月等效税率表估算，起征点 5000
  function salaryTax(opts) {
    var pay = Number(opts.pay), ins = Number(opts.ins || 0), extra = Number(opts.extra || 0);
    if (!(pay >= 0)) return { err: '收入要 ≥ 0' };
    var taxable = pay - 5000 - ins - extra;
    if (taxable <= 0) return { pay: pay, ins: ins, extra: extra, taxable: 0, rate: 0, deduct: 0, tax: 0, net: pay - ins, bracketIdx: -1 };
    var b = bracketOf(MONTH_BRACKETS, taxable);
    var idx = MONTH_BRACKETS.indexOf(b);
    var tax = Math.max(0, taxable * b.rate - b.deduct);
    return {
      pay: pay, ins: ins, extra: extra, taxable: taxable,
      rate: b.rate, deduct: b.deduct, tax: tax, net: pay - ins - tax, bracketIdx: idx
    };
  }

  // 年终奖单独计税：金额 ÷ 12 定税率，再整体乘税率
  function bonusTax(amount) {
    amount = Number(amount);
    if (!(amount >= 0)) return { err: '奖金要 ≥ 0' };
    if (amount === 0) return { amount: 0, monthly: 0, rate: 0, deduct: 0, tax: 0, net: 0, bracketIdx: -1 };
    var monthly = amount / 12;
    var b = bracketOf(BONUS_BRACKETS, monthly);
    var idx = BONUS_BRACKETS.indexOf(b);
    var tax = Math.max(0, amount * b.rate - b.deduct);
    return { amount: amount, monthly: monthly, rate: b.rate, deduct: b.deduct, tax: tax, net: amount - tax, bracketIdx: idx };
  }

  /* 年终奖的「跳档区间」：多发一点点、到手反而变少。
     在每个档位边界上解出「到手不减少」的最小追加额。 */
  function bonusCliffs(amount) {
    var cur = bonusTax(amount);
    var curNet = cur.net;
    var cliffs = [];
    BONUS_BRACKETS.forEach(function (b, i) {
      if (i === 0) return;
      // 该档起始金额 = 上一档上限 × 12
      var start = BONUS_BRACKETS[i - 1].upTo * 12;
      var taxAtStart = start * b.rate - b.deduct;
      var netAtStart = start - taxAtStart;
      if (curNet > 0 && netAtStart < curNet && amount <= start) {
        // 需要加多少钱才能补回被多扣的税
        var need = (curNet - netAtStart) / (1 - b.rate);
        cliffs.push({
          at: start, rate: b.rate,
          netAtStart: netAtStart, gap: curNet - netAtStart,
          needExtra: need, needTotal: start + need
        });
      }
    });
    return cliffs;
  }

  // 劳务报酬并入综合所得（年度）
  function laborYearly(income, otherYearly) {
    var l = laborTax(income);
    if (l.err) return l;
    var taxable = Math.max(0, l.taxable + Number(otherYearly || 0));
    var YEAR = [
      { upTo: 36000, rate: 0.03, deduct: 0 },
      { upTo: 144000, rate: 0.10, deduct: 2520 },
      { upTo: 300000, rate: 0.20, deduct: 16920 },
      { upTo: 420000, rate: 0.25, deduct: 31920 },
      { upTo: 660000, rate: 0.30, deduct: 52920 },
      { upTo: 960000, rate: 0.35, deduct: 85920 },
      { upTo: Infinity, rate: 0.45, deduct: 181920 }
    ];
    var b = bracketOf(YEAR, taxable);
    var tax = Math.max(0, taxable * b.rate - b.deduct);
    return {
      income: l.income, deduction: l.deduction, taxable: taxable,
      rate: b.rate, deduct: b.deduct, tax: tax,
      prepaid: laborTax(income).tax, diff: tax - laborTax(income).tax
    };
  }

  var AL_FORMS = {
    vat: [
      { id: 'gross', label: '价税合计（含税）', value: '11300', unit: '元' },
      { id: 'rate', label: '税率', value: '13', unit: '%' }
    ],
    salary: [
      { id: 'pay', label: '月税前工资', value: '20000', unit: '元' },
      { id: 'ins', label: '三险一金（个人承担）', value: '2100', unit: '元' },
      { id: 'extra', label: '专项附加扣除（月）', value: '0', unit: '元' }
    ],
    bonus: [
      { id: 'bamount', label: '年终奖金额', value: '50000', unit: '元' }
    ],
    labor2: [
      { id: 'lamount', label: '劳务报酬（税前）', value: '50000', unit: '元' },
      { id: 'lother', label: '其他综合所得（年，可留空）', value: '60000', unit: '元' }
    ]
  };

  function alKind() {
    var box = $('al-kind');
    var on = box.querySelector('button.on') || box.querySelector('button');
    return on && on.dataset && on.dataset.kind ? on.dataset.kind : 'vat';
  }

  function alBuild() {
    var kind = alKind();
    if (!AL_FORMS[kind]) kind = 'vat';
    var box = $('al-fields');
    box.innerHTML = '';
    AL_FORMS[kind].forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'row';
      var lab = document.createElement('label');
      lab.setAttribute('for', 'al-' + f.id);
      lab.innerHTML = '<b></b>';
      lab.querySelector('b').textContent = f.label;
      var wrap = document.createElement('div');
      wrap.className = 'input-wrap';
      var inp = document.createElement('input');
      inp.id = 'al-' + f.id;
      inp.type = 'number';
      inp.step = 'any';
      inp.value = f.value;
      var u = document.createElement('span');
      u.className = 'unit';
      u.textContent = f.unit;
      wrap.appendChild(inp); wrap.appendChild(u);
      row.appendChild(lab); row.appendChild(wrap);
      box.appendChild(row);
      inp.addEventListener('input', alRun);
    });
  }

  function alRun() {
    var kind = alKind();
    if (!AL_FORMS[kind]) kind = 'vat';
    var msg = $('al-msg'), out = $('al-out'), grid = $('al-grid'), fml = $('al-formula');
    grid.innerHTML = '';
    fml.innerHTML = '';

    if (kind === 'vat') {
      var r = vatSolve('stripTax', $('al-gross').value, $('al-rate').value);
      if (r.err) { msg.className = 'hint err'; msg.textContent = r.err; out.textContent = ''; return null; }
      msg.className = 'hint';
      msg.textContent = '按价外税拆分，不含税价与税额之和应等于含税价。';
      out.className = 'big';
      out.innerHTML = '税额 ' + money(r.tax) + ' 元<small>不含税 ' + money(r.net) + ' 元 · 含税 ' + money(r.gross) + ' 元</small>';
      setGrid(grid, [
        ['含税（价税合计）', money(r.gross) + ' 元'],
        ['不含税', money(r.net) + ' 元'],
        ['税额', money(r.tax) + ' 元'],
        ['税率', rateStr(r.rate)],
        ['税额占含税比', (r.tax / r.gross * 100).toFixed(2) + '%'],
        ['核对', money(r.net + r.tax) + ' 元']
      ]);
      fml.innerHTML = '<span class="t">计算过程</span><br>' + r.formula;
      return r;
    }

    if (kind === 'salary') {
      var s = salaryTax({ pay: $('al-pay').value, ins: $('al-ins').value, extra: $('al-extra').value });
      if (s.err) { msg.className = 'hint err'; msg.textContent = s.err; out.textContent = ''; return null; }
      msg.className = 'hint';
      msg.textContent = '按月等效税率表估算；实际走累计预扣预缴，年初少、年末多，全年合计接近。';
      out.className = 'big';
      out.innerHTML = '月个税 ' + money(s.tax) + ' 元<small>税后到手约 ' + money(s.net) + ' 元</small>';
      setGrid(grid, [
        ['税前工资', money(s.pay) + ' 元'],
        ['三险一金', money(s.ins) + ' 元'],
        ['专项附加扣除', money(s.extra) + ' 元'],
        ['应纳税所得额', money(s.taxable) + ' 元'],
        ['适用税率', rateStr(s.rate) + '（速算扣除 ' + money(s.deduct, 0) + '）'],
        ['本月个税', money(s.tax) + ' 元']
      ]);
      fml.innerHTML = '<span class="t">计算过程</span><br>' +
        '应纳税所得额 = ' + money(s.pay) + ' − 5000 − ' + money(s.ins) + ' − ' + money(s.extra) + ' = ' + money(s.taxable) + '<br>' +
        '个税 = ' + money(s.taxable) + ' × ' + rateStr(s.rate) + ' − ' + money(s.deduct, 0) + ' = ' + money(s.tax);
      return s;
    }

    if (kind === 'bonus') {
      var b = bonusTax($('al-bamount').value);
      if (b.err) { msg.className = 'hint err'; msg.textContent = b.err; out.textContent = ''; return null; }
      var cliffs = bonusCliffs(Number(b.amount));
      msg.className = 'hint';
      msg.textContent = cliffs.length
        ? '注意跳档：再发到 ' + money(cliffs[0].at, 0) + ' 元时，到手反而比现在少 ' +
          money(cliffs[0].gap) + ' 元，要比 ' + money(cliffs[0].needTotal, 0) + ' 元才追得回来。'
        : '未落在跳档区间内。';
      out.className = 'big' + (cliffs.length ? ' warn' : '');
      out.innerHTML = '个税 ' + money(b.tax) + ' 元<small>折月 ' + money(b.monthly) +
        ' 元落 ' + rateStr(b.rate) + ' 档 · 税后到手 ' + money(b.net) + ' 元</small>';
      setGrid(grid, [
        ['奖金金额', money(b.amount) + ' 元'],
        ['折合每月', money(b.monthly) + ' 元'],
        ['适用税率', rateStr(b.rate)],
        ['速算扣除数', money(b.deduct, 0) + ' 元'],
        ['应纳税额', money(b.tax) + ' 元'],
        ['税后到手', money(b.net) + ' 元']
      ]);
      fml.innerHTML = '<span class="t">计算过程</span><br>' +
        '按月折算定档：' + money(b.amount) + ' ÷ 12 = ' + money(b.monthly) + ' → ' + rateStr(b.rate) + ' 档<br>' +
        '个税 = ' + money(b.amount) + ' × ' + rateStr(b.rate) + ' − ' + money(b.deduct, 0) + ' = ' + money(b.tax);
      return b;
    }

    var l = laborYearly($('al-lamount').value, $('al-lother').value);
    if (l.err) { msg.className = 'hint err'; msg.textContent = l.err; out.textContent = ''; return null; }
    msg.className = 'hint';
    msg.textContent = '并入综合所得按年度税率表重算：预扣 ' + money(l.prepaid) + ' 元，年度应纳税 ' +
      money(l.tax) + ' 元，汇算时' + (l.diff >= 0 ? '需补 ' + money(l.diff) : '可退 ' + money(-l.diff)) + ' 元。';
    out.className = 'big';
    out.innerHTML = '年度个税 ' + money(l.tax) + ' 元' +
      '<small>预扣 ' + money(l.prepaid) + ' 元 · ' + (l.diff >= 0 ? '补税 ' : '退税 ') + money(Math.abs(l.diff)) + ' 元</small>';
    setGrid(grid, [
      ['劳务收入', money(l.income) + ' 元'],
      ['减除费用', money(l.deduction) + ' 元'],
      ['并入后应纳税所得额', money(l.taxable) + ' 元'],
      ['年度税率', rateStr(l.rate) + '（速算扣除 ' + money(l.deduct, 0) + '）'],
      ['年度应纳税额', money(l.tax) + ' 元'],
      ['汇算差额', (l.diff >= 0 ? '补 ' : '退 ') + money(Math.abs(l.diff)) + ' 元']
    ]);
    fml.innerHTML = '<span class="t">计算过程</span><br>' +
      '并入综合所得后应纳税所得额 = ' + money(l.taxable) + '<br>' +
      '年度个税 = ' + money(l.taxable) + ' × ' + rateStr(l.rate) + ' − ' + money(l.deduct, 0) + ' = ' + money(l.tax) + '<br>' +
      '与预扣 ' + money(l.prepaid) + ' 元相比，' + (l.diff >= 0 ? '应补缴' : '应退还') + ' ' + money(Math.abs(l.diff)) + ' 元';
    return l;
  }

  $('al-kind').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    alBuild();
    alRun();
  });
  $('al-run').addEventListener('click', alRun);
  $('al-reset').addEventListener('click', function () {
    var kind = alKind();
    (AL_FORMS[kind] || AL_FORMS.vat).forEach(function (f) { var el = $('al-' + f.id); if (el) el.value = f.value; });
    alRun();
  });

  /* ================= 页签与初始化 ================= */

  var PANELS = ['vat', 'labor', 'all'];
  function setTab(name) {
    T.markTab(name);
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);

  vtBuild();
  vtRun();
  lbRun();
  alBuild();
  alRun();
  setTab(T.firstTab('vat'));

  window.__tax2 = {
    vatSolve: vatSolve, VT_FORMS: VT_FORMS,
    laborTax: laborTax, laborYearly: laborYearly, LABOR_BRACKETS: LABOR_BRACKETS,
    salaryTax: salaryTax, bonusTax: bonusTax, bonusCliffs: bonusCliffs,
    bracketOf: bracketOf, MONTH_BRACKETS: MONTH_BRACKETS, BONUS_BRACKETS: BONUS_BRACKETS,
    money: money, rateStr: rateStr
  };
})();

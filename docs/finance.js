/* 个税与健康计算：工资个税、年终奖、BMI/体脂、基础代谢

   税率表与扣除口径按现行（2025 版）执行：
   - 工资薪金走累计预扣预缴，本页按月折算的等效年度税率表估算
   - 年终奖单独计税用「金额 ÷ 12 定税率、再乘回金额」的老办法
   - 健康类用 WHO 标准与 Mifflin-St Jeor / 美国海军法

   所有纯函数集中在前面，便于测试脚本直接取向量。 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  function num(v, def) {
    if (v === '' || v == null) return def == null ? NaN : def;
    var n = Number(v);
    return isFinite(n) ? n : (def == null ? NaN : def);
  }
  function r2(n) { return isFinite(n) ? Number(n.toFixed(2)) : NaN; }
  function money(n) { return isFinite(n) ? Number(n.toFixed(2)).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; }

  /* ---------- 个税税率表 ----------
     按月应纳税所得额（累计口径下每档除以 12 的等效值） */
  var MONTH_BRACKETS = [
    { up: 3000, rate: 0.03, ded: 0 },
    { up: 12000, rate: 0.10, ded: 210 },
    { up: 25000, rate: 0.20, ded: 1410 },
    { up: 35000, rate: 0.25, ded: 2660 },
    { up: 55000, rate: 0.30, ded: 4410 },
    { up: 80000, rate: 0.35, ded: 7160 },
    { up: Infinity, rate: 0.45, ded: 15160 }
  ];
  // 按年（综合所得）税率表，年终奖并入时用
  var YEAR_BRACKETS = MONTH_BRACKETS.map(function (b) {
    return { up: b.up === Infinity ? Infinity : b.up * 12, rate: b.rate, ded: b.ded * 12 };
  });

  function bracketOf(table, taxable) {
    for (var i = 0; i < table.length; i++) {
      if (taxable <= table[i].up) return { idx: i, rate: table[i].rate, ded: table[i].ded, up: table[i].up };
    }
    return { idx: table.length - 1, rate: 0.45, ded: 15160, up: Infinity };
  }

  /* 工资个税：月薪 - 三险一金 - 5000 起征 - 专项附加 = 应纳税所得额 */
  var PIT_BASE = 5000;
  // 社保个人比例：养老 8% + 医疗 2% + 失业 0.5%（上海口径）
  var INS_RATE = { sh: 0.105, other: 0.102, none: 0 };

  function salaryTax(opts) {
    var pay = num(opts.pay);
    if (!(pay >= 0)) return { err: '请输入税后月薪（不小于 0）。' };
    var rate = INS_RATE[opts.city] == null ? 0.105 : INS_RATE[opts.city];
    var ins = opts.ins === '' || opts.ins == null ? pay * rate : num(opts.ins, 0);
    if (!(ins >= 0)) ins = 0;
    var extra = num(opts.extra, 0);
    if (!(extra >= 0)) extra = 0;

    var taxable = pay - ins - PIT_BASE - extra;
    var tax = 0;
    var br = null;
    if (taxable > 0) {
      br = bracketOf(MONTH_BRACKETS, taxable);
      tax = taxable * br.rate - br.ded;
      if (tax < 0) tax = 0;
    }
    var net = pay - ins - tax;
    return {
      pay: pay, ins: ins, extra: extra, taxable: Math.max(0, taxable),
      tax: tax, net: net, bracket: br, rate: br ? br.rate : 0,
      insEstimated: !(opts.ins !== '' && opts.ins != null)
    };
  }

  /* 年终奖单独计税：金额 ÷ 12 落到哪档，就用该档税率乘全额 */
  function bonusTax(amt) {
    var a = num(amt);
    if (!(a >= 0)) return { err: '请输入年终奖金额（不小于 0）。' };
    if (a === 0) return { amt: 0, tax: 0, net: 0, rate: 0, month: 0, ded: 0, bracketIdx: 0 };
    var month = a / 12;
    var br = bracketOf(MONTH_BRACKETS, month);
    var tax = a * br.rate - br.ded;
    if (tax < 0) tax = 0;
    return { amt: a, tax: tax, net: a - tax, rate: br.rate, month: month, ded: br.ded, bracketIdx: br.idx, upper: br.up };
  }

  /* 年终奖并入综合所得：把奖金加进全年应纳税所得额，按年度税率表算 */
  function bonusMerged(amt, base) {
    var a = num(amt);
    var b = num(base, 0);
    if (!(a >= 0)) return { err: '请输入年终奖金额。' };
    if (!(b >= 0)) b = 0;
    function yearTax(x) {
      if (x <= 0) return 0;
      var br = bracketOf(YEAR_BRACKETS, x);
      return Math.max(0, x * br.rate - br.ded);
    }
    var tWith = yearTax(b + a);
    var tWithout = yearTax(b);
    var marginal = tWith - tWithout;
    return {
      amt: a, base: b, taxWith: tWith, taxWithout: tWithout, marginal: marginal,
      net: a - marginal, rate: a > 0 ? marginal / a : 0
    };
  }

  /* 年终奖临界点：奖金稍增而税后反降的区间（俗称「多发一元多缴几千」） */
  function bonusCliff(amt) {
    var a = num(amt);
    if (!(a > 0)) return null;
    // 每个档位上限 ×12 就是跳挡点，跨过它边际税率跳一级
    var cliffs = MONTH_BRACKETS.map(function (b) { return b.up === Infinity ? null : b.up * 12; })
      .filter(function (x) { return x != null; });
    for (var i = 0; i < cliffs.length; i++) {
      if (a > cliffs[i] && a <= cliffs[i] + 60000) return cliffs[i];
    }
    return null;
  }

  /* ---------- BMI ---------- */
  function bmiCalc(h, w) {
    var H = num(h) / 100, W = num(w);
    if (!(H > 0) || !(W > 0)) return { err: '请输入有效的身高与体重。' };
    var bmi = W / (H * H);
    var cat;
    // WHO 成人标准；中国标准把超重线下调到 24，此处用中国标准并标注
    if (bmi < 18.5) cat = ['偏瘦', '低于 18.5'];
    else if (bmi < 24) cat = ['正常', '18.5 ~ 23.9'];
    else if (bmi < 28) cat = ['超重', '24 ~ 27.9'];
    else cat = ['肥胖', '≥ 28'];
    // 对应身高的健康体重区间
    var lo = 18.5 * H * H, hi = 23.9 * H * H;
    return { bmi: bmi, cat: cat[0], range: cat[1], lo: lo, hi: hi, height: H, weight: W };
  }

  /* 体脂率：美国海军法（围度法），需要腰围 */
  function bodyFat(sex, h, w, waist) {
    var H = num(h), W = num(w), C = num(waist);
    if (!(H > 0) || !(W > 0) || !(C > 0)) return null;
    /* 美国海军围度法（公制版）。完整式需要腰围与颈围两项，
       这里用只含腰围与身高的近似式（男性少一项颈围，误差约 ±3%）。 */
    var v;
    if (sex === 'm') {
      v = 86.010 * Math.log10(C) - 70.041 * Math.log10(H) + 36.76;
    } else {
      v = 163.205 * Math.log10(C) - 97.684 * Math.log10(H) - 78.387;
    }
    if (!isFinite(v)) return null;
    return Math.max(0, Math.min(70, v));
  }

  function bodyFatCategory(sex, bf) {
    if (bf == null) return '—';
    if (sex === 'm') {
      if (bf < 6) return '必需脂肪';
      if (bf < 14) return '运动员';
      if (bf < 18) return '健康';
      if (bf < 25) return '偏高';
      return '肥胖';
    }
    if (bf < 14) return '必需脂肪';
    if (bf < 21) return '运动员';
    if (bf < 25) return '健康';
    if (bf < 32) return '偏高';
    return '肥胖';
  }

  /* ---------- 基础代谢：Mifflin-St Jeor ---------- */
  function bmrCalc(sex, age, h, w) {
    var A = num(age, 0), H = num(h), W = num(w);
    if (!(H > 0) || !(W > 0)) return { err: '请输入有效的身高与体重。' };
    if (!(A >= 0)) A = 0;
    // 男：10W + 6.25H − 5A + 5；女：同式 − 161
    var base = 10 * W + 6.25 * H - 5 * A;
    var bmr = sex === 'f' ? base - 161 : base + 5;
    return { bmr: bmr, base: base, sex: sex, age: A, height: H, weight: W };
  }

  function tdeeCalc(bmr, factor) {
    var f = num(factor, 1.2);
    return bmr * f;
  }

  /* ---------- 界面 ---------- */
  var UI = {
    salary: { city: 'sh' },
    bonus: { mode: 'single' },
    bmi: { sex: 'm' },
    bmr: { sex: 'm', act: 1.2 }
  };

  // 专项附加扣除标准（元/月）
  var EXTRA_ITEMS = [
    ['子女教育', 2000, '每个子女，父母可各扣一半'],
    ['婴幼儿照护', 2000, '3 岁以下每个婴幼儿'],
    ['继续教育', 400, '学历教育期间每月 400'],
    ['住房贷款利息', 1000, '首套房贷，最长 240 个月'],
    ['住房租金', 1500, '直辖市/省会等按档次'],
    ['赡养老人', 3000, '独生子女全额，非独生分摊'],
    ['大病医疗', 0, '年度据实扣除，按年汇算']
  ];

  function buildExtraItems() {
    var box = $('sa-items');
    box.innerHTML = '';
    EXTRA_ITEMS.forEach(function (it) {
      var lab = document.createElement('label');
      lab.className = 'chk';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.amount = String(it[1]);
      cb.dataset.title = it[0];
      var sp = document.createElement('span');
      sp.textContent = it[0] + '　';
      var em = document.createElement('em');
      em.textContent = it[1] ? it[1] + ' 元/月' : '据实扣除';
      sp.appendChild(em);
      lab.appendChild(cb); lab.appendChild(sp);
      lab.title = it[2];
      box.appendChild(lab);
    });
    box.addEventListener('change', function () {
      var sum = 0;
      [].forEach.call(box.querySelectorAll('input'), function (c) { if (c.checked) sum += Number(c.dataset.amount) || 0; });
      $('sa-extra').value = String(sum);
      salaryRun();
    });
  }

  function tblRows(table, activeIdx) {
    table.innerHTML = '';
    var head = document.createElement('tr');
    ['级数', '月应纳税所得额', '税率', '速算扣除数'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    });
    table.appendChild(head);
    MONTH_BRACKETS.forEach(function (b, i) {
      var tr = document.createElement('tr');
      if (i === activeIdx) tr.className = 'on';
      var lo = i === 0 ? 0 : MONTH_BRACKETS[i - 1].up;
      var range = b.up === Infinity ? '超过 ' + lo.toLocaleString() : (i === 0 ? '不超过 ' + b.up.toLocaleString() : lo.toLocaleString() + ' ~ ' + b.up.toLocaleString());
      var cells = [String(i + 1), range, (b.rate * 100) + '%', b.ded ? b.ded.toLocaleString() : '0'];
      cells.forEach(function (v, ci) {
        var td = document.createElement('td');
        td.textContent = v;
        if (ci > 0) td.style.fontFamily = 'ui-monospace,Menlo,Consolas,monospace';
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
  }

  function salaryRun() {
    var r = salaryTax({
      pay: $('sa-pay').value, ins: $('sa-ins').value,
      extra: $('sa-extra').value, city: UI.salary.city
    });
    var err = $('sa-note');
    if (r.err) {
      $('sa-net').textContent = '—';
      $('sa-grid').innerHTML = '';
      $('sa-steps').textContent = '';
      tblRows($('sa-rate'), -1);
      err.className = 'note err';
      err.textContent = r.err;
      return;
    }
    $('sa-net').innerHTML = money(r.net) + '<small> 元 / 月</small>';
    T.cells($('sa-grid'), [
      ['税前月薪', money(r.pay) + ' 元'],
      ['三险一金' + (r.insEstimated ? '（估算）' : ''), money(r.ins) + ' 元'],
      ['专项附加扣除', money(r.extra) + ' 元'],
      ['应纳税所得额', money(r.taxable) + ' 元'],
      ['适用税率', (r.rate * 100) + '%'],
      ['本月个税', money(r.tax) + ' 元'],
      ['全年个税（估）', money(r.tax * 12) + ' 元'],
      ['全年到手（估）', money(r.net * 12) + ' 元']
    ]);
    tblRows($('sa-rate'), r.bracket ? r.bracket.idx : -1);
    var lines = [];
    lines.push('① 应纳税所得额 = 月薪 ' + money(r.pay) + ' − 三险一金 ' + money(r.ins) + ' − 起征点 5,000' + (r.extra ? ' − 专项附加 ' + money(r.extra) : '') + ' = ' + money(r.taxable) + ' 元');
    if (r.taxable > 0) {
      lines.push('② 查表落在 ' + ((r.bracket.idx + 1)) + ' 级，税率 ' + (r.rate * 100) + '%，速算扣除数 ' + r.bracket.ded.toLocaleString());
      lines.push('③ 本月个税 = ' + money(r.taxable) + ' × ' + (r.rate * 100) + '% − ' + r.bracket.ded.toLocaleString() + ' = ' + money(r.tax) + ' 元');
    } else {
      lines.push('② 未超过起征点，本月不用缴税');
    }
    lines.push('④ 到手 = ' + money(r.pay) + ' − ' + money(r.ins) + ' − ' + money(r.tax) + ' = ' + money(r.net) + ' 元');
    $('sa-steps').textContent = lines.join('\n');
    err.className = 'note';
    err.innerHTML = '<b>说明</b>　三险一金按社保个人比例估算（' + (UI.salary.city === 'sh' ? '养老 8% + 医疗 2% + 失业 0.5%' : UI.salary.city === 'other' ? '养老 8% + 医疗 2% + 失业 0.2%' : '未估算') + '），未计入公积金与年终奖。' +
      '实际工资走累计预扣预缴，月度税额会随累计所得变化，本页按月等效税率表估算，年终汇算以「多退少补」为准。';
  }

  function bonusRun() {
    var amt = $('bn-amt').value;
    var note = $('bn-note');
    if (UI.bonus.mode === 'single') {
      var r = bonusTax(amt);
      if (r.err) { note.className = 'note err'; note.textContent = r.err; return; }
      $('bn-net').innerHTML = money(r.net) + '<small> 元</small>';
      T.cells($('bn-grid'), [
        ['年终奖金额', money(r.amt) + ' 元'],
        ['折合每月', money(r.month) + ' 元'],
        ['适用税率', (r.rate * 100) + '%'],
        ['速算扣除数', r.ded.toLocaleString() + ' 元'],
        ['应纳税额', money(r.tax) + ' 元'],
        ['实际到手', money(r.net) + ' 元']
      ]);
      $('bn-steps').textContent = [
        '① 折合每月 = ' + money(r.amt) + ' ÷ 12 = ' + money(r.month) + ' 元',
        '② 查月税率表落在 ' + (r.bracketIdx + 1) + ' 级，税率 ' + (r.rate * 100) + '%，速算扣除数 ' + r.ded.toLocaleString(),
        '③ 应纳税额 = 全额 ' + money(r.amt) + ' × ' + (r.rate * 100) + '% − ' + r.ded.toLocaleString() + ' = ' + money(r.tax) + ' 元',
        '④ 到手 = ' + money(r.amt) + ' − ' + money(r.tax) + ' = ' + money(r.net) + ' 元'
      ].join('\n');
      var cliff = bonusCliff(r.amt);
      var warn = '';
      if (r.amt > 36000 && r.amt <= 36000 + 2310) warn = '当前金额正处在 36,000 元跳档区（36,001 ~ 38,566 元），多发反而少拿，建议把奖金调到 36,000 元或以下。';
      note.className = 'note';
      note.innerHTML = warn ? '<b style="color:var(--warn)">避坑提醒</b>　' + warn : '<b>说明</b>　年终奖单独计税一年只能用一次，当年已用过则在汇算时必须并入综合所得。' +
        (cliff ? '' : '');
    } else {
      var m = bonusMerged(amt, $('bn-base').value);
      if (m.err) { note.className = 'note err'; note.textContent = m.err; return; }
      $('bn-net').innerHTML = money(m.net) + '<small> 元</small>';
      T.cells($('bn-grid'), [
        ['年终奖金额', money(m.amt) + ' 元'],
        ['并入前全年应纳税所得额', money(m.base) + ' 元'],
        ['并入前全年个税', money(m.taxWithout) + ' 元'],
        ['并入后全年个税', money(m.taxWith) + ' 元'],
        ['奖金实际税负', money(m.marginal) + ' 元'],
        ['实际边际税率', (m.rate * 100).toFixed(2) + '%']
      ]);
      $('bn-steps').textContent = [
        '① 并入后应纳税所得额 = ' + money(m.base) + ' + ' + money(m.amt) + ' = ' + money(m.base + m.amt) + ' 元',
        '② 并入后全年个税 = ' + money(m.taxWith) + ' 元',
        '③ 不并入时全年个税 = ' + money(m.taxWithout) + ' 元',
        '④ 奖金实际承担 = ' + money(m.taxWith) + ' − ' + money(m.taxWithout) + ' = ' + money(m.marginal) + ' 元',
        '⑤ 到手 = ' + money(m.amt) + ' − ' + money(m.marginal) + ' = ' + money(m.net) + ' 元'
      ].join('\n');
      note.className = 'note';
      note.innerHTML = '<b>说明</b>　并入综合所得后，奖金按年度累进税率表计税。一般来说奖金高、且原本适用税率已较高时，单独计税更划算；' +
        '奖金低且原本未用满免征额时，并入可能更省。可切回「单独计税」比较两种口径的到手金额。';
    }
  }

  function bmiRun() {
    var r = bmiCalc($('bm-h').value, $('bm-w').value);
    var note = $('bm-note');
    if (r.err) {
      $('bm-bmi').textContent = '—';
      $('bm-grid').innerHTML = '';
      $('bm-steps').textContent = '';
      note.className = 'note err';
      note.textContent = r.err;
      return;
    }
    $('bm-bmi').textContent = r.bmi.toFixed(2);
    var rows = [
      ['体质指数 BMI', r.bmi.toFixed(2)],
      ['体型评价', r.cat],
      ['正常范围', r.range],
      ['对应健康体重', r.lo.toFixed(1) + ' ~ ' + r.hi.toFixed(1) + ' kg']
    ];
    var waist = num($('bm-waist').value, NaN);
    var bf = bodyFat(UI.bmi.sex, r.height * 100, r.weight, waist);
    if (bf != null) {
      rows.push(['体脂率（海军法）', bf.toFixed(1) + '%']);
      rows.push(['体脂评价', bodyFatCategory(UI.bmi.sex, bf)]);
    }
    T.cells($('bm-grid'), rows);
    var steps = [
      '① BMI = 体重 ÷ 身高² = ' + r.weight + ' ÷ ' + r.height.toFixed(2) + '² = ' + r.bmi.toFixed(2),
      '② 按中国成人标准：< 18.5 偏瘦，18.5 ~ 23.9 正常，24 ~ 27.9 超重，≥ 28 肥胖'
    ];
    if (bf != null) {
      steps.push('③ 体脂率（美国海军围度法，需腰围）：' + bf.toFixed(1) + '%，' + bodyFatCategory(UI.bmi.sex, bf));
    }
    $('bm-steps').textContent = steps.join('\n');
    note.className = 'note';
    note.innerHTML = '<b>说明</b>　BMI 只看身高体重，肌肉量大的人会被判「超重」，建议结合体脂率一起看。' +
      '体脂率用海军围度法（需要腰围），误差通常 ±3%，只做趋势参考。' +
      (bf == null && waist !== waist ? '　填上腰围可一并算出体脂率。' : '');
  }

  function bmrRun() {
    var r = bmrCalc(UI.bmr.sex, $('br-age').value, $('br-h').value, $('br-w').value);
    var note = $('br-note');
    if (r.err) {
      $('br-tdee').textContent = '—';
      $('br-grid').innerHTML = '';
      $('br-steps').textContent = '';
      note.className = 'note err';
      note.textContent = r.err;
      return;
    }
    var f = Number(UI.bmr.act);
    var tdee = tdeeCalc(r.bmr, f);
    $('br-tdee').innerHTML = Math.round(tdee).toLocaleString() + '<small> kcal / 天</small>';
    T.cells($('br-grid'), [
      ['基础代谢率 BMR', Math.round(r.bmr).toLocaleString() + ' kcal/天'],
      ['活动系数', '× ' + f],
      ['每日总消耗 TDEE', Math.round(tdee).toLocaleString() + ' kcal/天'],
      ['轻度减脂（−15%）', Math.round(tdee * 0.85).toLocaleString() + ' kcal/天'],
      ['明显减脂（−25%）', Math.round(tdee * 0.75).toLocaleString() + ' kcal/天'],
      ['增肌（+10%）', Math.round(tdee * 1.1).toLocaleString() + ' kcal/天']
    ]);
    $('br-steps').textContent = [
      '① ' + (r.sex === 'f' ? '女性' : '男性') + ' BMR = 10 × 体重 ' + r.weight + ' + 6.25 × 身高 ' + r.height + ' − 5 × 年龄 ' + r.age + (r.sex === 'f' ? ' − 161' : ' + 5'),
      '　 = ' + Math.round(r.bmr).toLocaleString() + ' kcal/天（Mifflin-St Jeor 公式）',
      '② TDEE = BMR × 活动系数 = ' + Math.round(r.bmr).toLocaleString() + ' × ' + f + ' = ' + Math.round(tdee).toLocaleString() + ' kcal/天'
    ].join('\n');
    note.className = 'note';
    note.innerHTML = '<b>说明</b>　BMR 是躺着不动也需要消耗的热量，TDEE 才是日常总消耗。' +
      '减脂建议每天缺口 300 ~ 500 kcal，别低于 BMR，否则易掉肌肉与代谢下降。' +
      '公式为估算值，个体差异可达 ±10%。';
  }

  /* 页签绑定 */
  function showTab(name) {
    [].forEach.call($('tabs').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    ['salary', 'bonus', 'bmi', 'bmr'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
    if (name === 'salary') salaryRun();
    if (name === 'bonus') bonusRun();
    if (name === 'bmi') bmiRun();
    if (name === 'bmr') bmrRun();
  }
  T.tabs($('tabs'), showTab);

  /* 分段选择器通用绑定 */
  function bindSeg(id, key, cb) {
    var box = $(id);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      [].forEach.call(box.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
      cb(b.dataset);
    });
  }

  bindSeg('sa-city', 'city', function (d) { UI.salary.city = d.city; salaryRun(); });
  bindSeg('bn-mode', 'mode', function (d) {
    UI.bonus.mode = d.mode;
    $('bn-merge-wrap').hidden = d.mode !== 'merge';
    bonusRun();
  });
  bindSeg('bm-sex', 'sex', function (d) { UI.bmi.sex = d.sex; bmiRun(); });
  bindSeg('br-sex', 'sex', function (d) { UI.bmr.sex = d.sex; bmrRun(); });
  bindSeg('br-act', 'act', function (d) { UI.bmr.act = d.act; bmrRun(); });

  $('sa-run').addEventListener('click', salaryRun);
  $('sa-reset').addEventListener('click', function () {
    $('sa-pay').value = '20000'; $('sa-ins').value = ''; $('sa-extra').value = '0';
    [].forEach.call($('sa-items').querySelectorAll('input'), function (c) { c.checked = false; });
    salaryRun();
  });
  $('bn-run').addEventListener('click', bonusRun);
  $('bn-reset').addEventListener('click', function () {
    $('bn-amt').value = '50000'; $('bn-base').value = '60000'; bonusRun();
  });
  $('bm-run').addEventListener('click', bmiRun);
  $('bm-reset').addEventListener('click', function () {
    $('bm-h').value = '175'; $('bm-w').value = '70'; $('bm-waist').value = ''; bmiRun();
  });
  $('br-run').addEventListener('click', bmrRun);
  $('br-reset').addEventListener('click', function () {
    $('br-age').value = '30'; $('br-h').value = '175'; $('br-w').value = '70'; bmrRun();
  });
  ['sa-pay', 'sa-ins', 'sa-extra'].forEach(function (id) { $(id).addEventListener('input', salaryRun); });
  ['bn-amt', 'bn-base'].forEach(function (id) { $(id).addEventListener('input', bonusRun); });
  ['bm-h', 'bm-w', 'bm-waist'].forEach(function (id) { $(id).addEventListener('input', bmiRun); });
  ['br-age', 'br-h', 'br-w'].forEach(function (id) { $(id).addEventListener('input', bmrRun); });

  buildExtraItems();
  salaryRun(); bonusRun(); bmiRun(); bmrRun();

  window.__finance = {
    MONTH_BRACKETS: MONTH_BRACKETS, YEAR_BRACKETS: YEAR_BRACKETS, INS_RATE: INS_RATE,
    PIT_BASE: PIT_BASE, salaryTax: salaryTax, bonusTax: bonusTax, bonusMerged: bonusMerged,
    bonusCliff: bonusCliff, bmiCalc: bmiCalc, bodyFat: bodyFat, bodyFatCategory: bodyFatCategory,
    bmrCalc: bmrCalc, tdeeCalc: tdeeCalc, bracketOf: bracketOf, money: money
  };
})();

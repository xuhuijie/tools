/* 健康与证件：eGFR / 孕产计算 / 身份证解析 / 尺码对照 / 百家姓
   公式与数据来源都写在页面说明里，纯本地计算，不联网。 */
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

  function num(v) { return Number(v); }

  /* ================= 1. eGFR ================= */

  /* CKD-EPI 2009（CKD-EPI 原始版），用 mg/dL 的 Scr：
       eGFR = 141 × min(Scr/κ,1)^α × max(Scr/κ,1)^(-1.209) × 0.993^Age × [1.018 if 女]
     κ 男 0.9、女 0.7；α 男 -0.411、女 -0.329。
     另一个常用的是 MDRD（186 × Scr^-1.154 × Age^-0.203 × [0.742 女]），两条都算出来对照。 */
  var CKD_EPI = { m: { k: 0.9, a: -0.411 }, f: { k: 0.7, a: -0.329 } };

  function egfrCkdEpi(scrMgDl, age, sex) {
    if (!(scrMgDl > 0) || !(age > 0)) return null;
    var p = CKD_EPI[sex];
    var r = scrMgDl / p.k;
    var v = 141 * Math.pow(Math.min(r, 1), p.a) * Math.pow(Math.max(r, 1), -1.209) *
      Math.pow(0.993, age);
    if (sex === 'f') v *= 1.018;
    return v;
  }

  function egfrMdrd(scrMgDl, age, sex) {
    if (!(scrMgDl > 0) || !(age > 0)) return null;
    var v = 186 * Math.pow(scrMgDl, -1.154) * Math.pow(age, -0.203);
    if (sex === 'f') v *= 0.742;
    return v;
  }

  // CKD 分期按 KDIGO 的 GFR 分级
  function gfrStage(v) {
    if (v == null) return ['—', ''];
    if (v >= 90) return ['G1', '正常或偏高（≥90）'];
    if (v >= 60) return ['G2', '轻度下降（60~89）'];
    if (v >= 45) return ['G3a', '轻中度下降（45~59）'];
    if (v >= 30) return ['G3b', '中重度下降（30~44）'];
    if (v >= 15) return ['G4', '重度下降（15~29）'];
    return ['G5', '肾衰竭（<15）'];
  }

  function toMgDl(v, unit) {
    return unit === 'umol' ? v / 88.4 : v;
  }

  var egUnit = 'umol';

  function egRun() {
    var msg = $('eg-msg'), out = $('eg-out'), body = $('eg-body');
    var age = num($('eg-age').value);
    var sex = $('eg-sex').value;
    var cr = num($('eg-cr').value);
    if (!(age > 0) || age > 120) { msg.className = 'hint err'; msg.textContent = '年龄要在 1 ~ 120 之间。'; return null; }
    if (!(cr > 0)) { msg.className = 'hint err'; msg.textContent = '肌酐值要大于 0。'; return null; }
    var mgdl = toMgDl(cr, egUnit);
    var epi = egfrCkdEpi(mgdl, age, sex);
    var mdrd = egfrMdrd(mgdl, age, sex);

    var stage = gfrStage(epi);
    out.className = 'big' + (epi < 60 ? ' warn' : '');
    out.innerHTML = 'eGFR ' + epi.toFixed(1) + ' mL/min/1.73m²' +
      '<small>CKD-EPI · ' + stage[0] + ' 期（' + stage[1] + '）</small>';

    msg.className = 'hint';
    msg.textContent = '已把肌酐换算成 ' + mgdl.toFixed(3) + ' mg/dL 参与计算。' +
      (epi >= 60 ? '公式在 eGFR ≥ 60 时误差较大，临床上常报作「≥90」。' : '');

    setGrid($('eg-grid'), [
      ['年龄', age + ' 岁'],
      ['性别', sex === 'm' ? '男' : '女'],
      ['肌酐（mg/dL）', mgdl.toFixed(3)],
      ['CKD-EPI', epi.toFixed(1)],
      ['MDRD', mdrd.toFixed(1)],
      ['两式差值', Math.abs(epi - mdrd).toFixed(1)]
    ]);

    body.innerHTML = '';
    [['CKD-EPI 2009', epi], ['MDRD', mdrd]].forEach(function (p) {
      var st = gfrStage(p[1]);
      var tr = document.createElement('tr');
      if (p[0].indexOf('CKD-EPI') === 0) tr.className = 'on';
      [p[0], p[1].toFixed(1), st[0] + '（' + st[1] + '）'].forEach(function (t) {
        var td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return { ckdEpi: epi, mdrd: mdrd, mgdl: mgdl };
  }

  var egBtns = $('eg-unit').querySelectorAll('button');
  [].forEach.call(egBtns, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(egBtns, function (o) { o.classList.toggle('on', o === b); });
      var old = egUnit;
      egUnit = b.dataset.unit;
      // 单位切换时把输入值也换算过去，不然数字看着没变但含义变了
      var v = num($('eg-cr').value);
      if (isFinite(v) && v > 0) {
        $('eg-cr').value = old === 'umol' && egUnit === 'mgdl' ? (v / 88.4).toFixed(2)
          : old === 'mgdl' && egUnit === 'umol' ? (v * 88.4).toFixed(1) : String(v);
      }
      egRun();
    });
  });
  ['eg-age', 'eg-sex', 'eg-cr'].forEach(function (id) {
    $(id).addEventListener('input', egRun);
    $(id).addEventListener('change', egRun);
  });
  $('eg-run').addEventListener('click', egRun);
  $('eg-reset').addEventListener('click', function () {
    $('eg-age').value = '55'; $('eg-sex').value = 'f'; $('eg-cr').value = '88.4';
    egUnit = 'umol';
    [].forEach.call(egBtns, function (o) { o.classList.toggle('on', o.dataset.unit === 'umol'); });
    egRun();
  });

  /* ================= 2. 孕产 ================= */

  var DAY = 86400000;

  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
    return d;
  }

  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* 内格勒法则：预产期 = LMP + 280 天。
     周期不等于 28 天时要校正：排卵日通常比 LMP 晚 (周期 - 14) 天，
     所以把 LMP 往后挪 (周期 - 28) 天再算，等价于预产期 = LMP + 280 + (周期 - 28)。 */
  function dueDate(lmp, cycle) {
    cycle = cycle || 28;
    return addDays(lmp, 280 + (cycle - 28));
  }

  // 孕周按「已过天数」折算：满 37 周 + 3 天记作 37w3d
  function gestAge(lmp, cycle, today) {
    cycle = cycle || 28;
    var adjusted = addDays(lmp, cycle - 28);
    var days = Math.floor((today - adjusted) / DAY);
    return {
      days: days,
      weeks: Math.floor(days / 7),
      remDays: days % 7,
      text: Math.floor(days / 7) + 'w' + (days % 7) + 'd',
      trimester: days < 0 ? '—' : days < 14 * 7 ? '第一孕期' : days < 28 * 7 ? '第二孕期' : '第三孕期',
      adjusted: adjusted
    };
  }

  // 常规产检节点，日期都按校正后的孕周推算
  var CHECKUPS = [
    [6, '早孕确认（B 超看宫内孕囊）'],
    [7, '看胎心'],
    [12, 'NT 检查 + 建档（11~13w6d 之间）'],
    [16, '唐筛 / 无创 DNA（16~20 周）'],
    [20, '大排畸 B 超（20~24 周）'],
    [24, '糖耐量筛查 OGTT（24~28 周）'],
    [28, '常规产检，开始数胎动'],
    [32, 'B 超评估胎儿生长'],
    [36, 'GBS 筛查 + 胎心监护'],
    [37, '足月，每周一检'],
    [40, '预产期']
  ];

  function pregCalc(lmp, cycle, today) {
    var due = dueDate(lmp, cycle);
    var ga = gestAge(lmp, cycle, today);
    var left = Math.round((due - today) / DAY);
    var checkups = CHECKUPS.map(function (c) {
      return { week: c[0], name: c[1], date: addDays(ga.adjusted, c[0] * 7), done: c[0] * 7 <= ga.days };
    });
    return { due: due, ga: ga, daysLeft: left, checkups: checkups };
  }

  /* ---- 胎儿体重公式 ----
     两条公式都取「BPD/AC/FL 用 cm、结果用 g」的口径：

       Hadlock 4 (BPD, AC, FL)：log10 W = 1.304 + 0.05281×AC + 0.1938×FL − 0.004×AC×FL
       Shepard   (BPD, AC)：    log10 W(kg) = −1.7492 + 0.166×BPD + 0.046×AC − 2.646×AC×BPD/1000

     只放两条能相互印证的：不同来源对 Hadlock 其余几个变式的系数记法不一致
     （有的按 mm、有的把 kg 和 g 混着写），抄错一位就会差出十倍，与其塞进来不如不放。 */
  function hadlock4(bpd, ac, fl) {
    if (!(bpd > 0 && ac > 0 && fl > 0)) return null;
    var v = 1.304 + 0.05281 * ac + 0.1938 * fl - 0.004 * ac * fl;
    return Math.pow(10, v);
  }

  // Shepard 式内部算的是千克，这里统一换算成克返回
  function shepard(bpd, ac) {
    if (!(bpd > 0 && ac > 0)) return null;
    var kg = Math.pow(10, -1.7492 + 0.166 * bpd + 0.046 * ac - 2.646 * ac * bpd / 1000);
    return kg * 1000;
  }

  var pgPart = 'due';

  function pgRun() {
    var msg = $('pg-msg');
    var lmp = parseYmd($('pg-lmp').value);
    if (!lmp) { msg.className = 'hint err'; msg.textContent = '请填写末次月经第一天。'; return null; }
    var cycle = Math.max(20, Math.min(45, num($('pg-cycle').value) || 28));
    var today = parseYmd($('pg-today').value) || new Date();
    var r = pregCalc(lmp, cycle, today);
    if (r.ga.days < 0) {
      msg.className = 'hint err';
      msg.textContent = '基准日早于末次月经，检查一下日期。';
      return null;
    }
    msg.className = 'hint';
    msg.textContent = cycle !== 28
      ? '周期 ' + cycle + ' 天，已把排卵日比标准 28 天周期推后 ' + (cycle - 28) + ' 天，孕周与预产期都按此校正。'
      : '按标准 28 天周期计算。周期不规律时误差较大，应以早期 B 超为准。';

    $('pg-out').className = 'big';
    $('pg-out').innerHTML = '预产期 ' + fmtDate(r.due) +
      '<small>当前孕周 ' + r.ga.text + '（' + r.ga.trimester + '）' +
      (r.daysLeft >= 0 ? '，距预产期 ' + r.daysLeft + ' 天' : '，已过预产期 ' + Math.abs(r.daysLeft) + ' 天') + '</small>';

    setGrid($('pg-grid'), [
      ['末次月经', fmtDate(lmp)],
      ['校正后排卵日', fmtDate(r.ga.adjusted)],
      ['当前孕周', r.ga.text],
      ['累计天数', r.ga.days + ' 天'],
      ['预产期', fmtDate(r.due)],
      ['距预产期', r.daysLeft >= 0 ? r.daysLeft + ' 天' : '已超 ' + Math.abs(r.daysLeft) + ' 天']
    ]);

    var body = $('pg-body');
    body.innerHTML = '';
    r.checkups.forEach(function (c) {
      var tr = document.createElement('tr');
      if (!c.done) tr.className = 'on';
      [c.name, c.week + ' 周', fmtDate(c.date) + (c.done ? '（已过）' : '')].forEach(function (t) {
        var td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return r;
  }

  function ftRun() {
    var msg = $('ft-msg'), out = $('ft-out');
    var bpd = num($('ft-bpd').value), ac = num($('ft-ac').value), fl = num($('ft-fl').value);
    if (!(bpd > 0) || !(ac > 0) || !(fl > 0)) {
      msg.className = 'hint err';
      msg.textContent = '三个径线都要填正数。';
      return null;
    }
    var h4 = hadlock4(bpd, ac, fl);
    var sp = shepard(bpd, ac);
    var avg = (h4 + sp) / 2;
    var spread = Math.abs(h4 - sp);

    msg.className = 'hint';
    msg.textContent = '两个公式相差 ' + Math.round(spread) + ' g（约 ' +
      (spread / avg * 100).toFixed(1) + '%）。临床报告的 ±10%~15% 误差就来自公式间的这种差异，不是测量本身。';

    out.className = 'big';
    out.innerHTML = Math.round(avg) + ' g（两式均值）' +
      '<small>约 ' + (avg / 500).toFixed(2) + ' 斤 · 两式差 ' + Math.round(spread) + ' g</small>';

    setGrid($('ft-grid'), [
      ['Hadlock（BPD+AC+FL）', Math.round(h4) + ' g'],
      ['Shepard（BPD+AC）', Math.round(sp) + ' g'],
      ['两式均值', Math.round(avg) + ' g'],
      ['±15% 区间', Math.round(avg * 0.85) + ' ~ ' + Math.round(avg * 1.15) + ' g'],
      ['估值离散度', (spread / avg * 100).toFixed(1) + '%'],
      ['折合', (avg / 500).toFixed(2) + ' 斤']
    ]);
    return { hadlock: h4, shepard: sp, avg: avg, spread: spread };
  }

  ['pg-lmp', 'pg-cycle', 'pg-today'].forEach(function (id) {
    $(id).addEventListener('input', pgRun);
    $(id).addEventListener('change', pgRun);
  });
  ['ft-bpd', 'ft-ac', 'ft-fl'].forEach(function (id) {
    $(id).addEventListener('input', ftRun);
  });
  $('pg-run').addEventListener('click', pgRun);
  $('ft-run').addEventListener('click', ftRun);
  $('pg-reset').addEventListener('click', function () {
    $('pg-lmp').value = '2026-01-05'; $('pg-cycle').value = '28'; $('pg-today').value = '';
    pgRun();
  });
  $('ft-reset').addEventListener('click', function () {
    $('ft-bpd').value = '8.5'; $('ft-ac').value = '29.0'; $('ft-fl').value = '6.5';
    ftRun();
  });
  $('pg-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    pgPart = b.dataset.part;
    $('pg-due').hidden = pgPart !== 'due';
    $('pg-fetal').hidden = pgPart !== 'fetal';
  });

  /* ================= 3. 身份证 ================= */

  /* GB 11643：前 17 位加权求和，权重 Wi = 2^(17-i) mod 11，
     和对 11 取模后查校验码表 "10X98765432"。 */
  var ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var ID_CHECKS = '10X98765432';

  function idCheckDigit(body17) {
    if (!/^\d{17}$/.test(body17)) return null;
    var sum = 0;
    for (var i = 0; i < 17; i++) sum += Number(body17[i]) * ID_WEIGHTS[i];
    return ID_CHECKS[sum % 11];
  }

  function luhnCheck(id) {
    if (!/^\d{17}[\dXx]$/.test(id)) return false;
    return idCheckDigit(id.slice(0, 17)) === id[17].toUpperCase();
  }

  // 行政区划按 GB/T 2260 前 6 位；这里只收录到「省市」级别，县级太多且会调整
  var PROVINCES = {
    '11': '北京市', '12': '天津市', '13': '河北省', '14': '山西省', '15': '内蒙古自治区',
    '21': '辽宁省', '22': '吉林省', '23': '黑龙江省',
    '31': '上海市', '32': '江苏省', '33': '浙江省', '34': '安徽省', '35': '福建省',
    '36': '江西省', '37': '山东省',
    '41': '河南省', '42': '湖北省', '43': '湖南省', '44': '广东省', '45': '广西壮族自治区',
    '46': '海南省',
    '50': '重庆市', '51': '四川省', '52': '贵州省', '53': '云南省', '54': '西藏自治区',
    '61': '陕西省', '62': '甘肃省', '63': '青海省', '64': '宁夏回族自治区', '65': '新疆维吾尔自治区',
    '71': '台湾省',
    '81': '香港特别行政区', '82': '澳门特别行政区',
    '91': '国外（外国在华人员）'
  };

  var CITY_HINTS = {
    '110105': '北京市朝阳区', '110101': '北京市东城区', '110102': '北京市西城区',
    '110108': '北京市海淀区', '310101': '上海市黄浦区', '310115': '上海市浦东新区',
    '440305': '广东省深圳市南山区', '440304': '广东省深圳市福田区',
    '440103': '广东省广州市荔湾区', '330106': '浙江省杭州市西湖区',
    '320106': '江苏省南京市鼓楼区', '510107': '四川省成都市武侯区'
  };

  function idParse(id, today) {
    id = String(id || '').trim().toUpperCase();
    var r = { input: id, valid: false, err: null };
    if (id.length !== 18) { r.err = '必须 18 位，当前 ' + id.length + ' 位'; return r; }
    if (!/^\d{17}[\dX]$/.test(id)) { r.err = '前 17 位必须是数字，末位是数字或 X'; return r; }

    var provinceCode = id.slice(0, 2);
    var cityCode = id.slice(0, 6);
    var body17 = id.slice(0, 17);
    var expect = idCheckDigit(body17);
    r.provinceCode = provinceCode;
    r.cityCode = cityCode;
    r.province = PROVINCES[provinceCode] || '未知省份代码（' + provinceCode + '）';
    r.city = CITY_HINTS[cityCode] || null;
    r.expectCheck = expect;
    r.actualCheck = id[17];
    r.checkOk = expect === id[17];

    var y = Number(id.slice(6, 10)), m = Number(id.slice(10, 12)), d = Number(id.slice(12, 14));
    var birth = new Date(y, m - 1, d);
    r.birthOk = birth.getFullYear() === y && birth.getMonth() === m - 1 && birth.getDate() === d;
    r.birth = birth;
    r.birthText = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

    var seq = id.slice(14, 17);
    r.seq = seq;
    r.seqCode = Number(seq);
    r.sex = Number(seq[2]) % 2 === 1 ? '男' : '女';

    today = today || new Date();
    var age = today.getFullYear() - y;
    var hadBirthday = (today.getMonth() > m - 1) || (today.getMonth() === m - 1 && today.getDate() >= d);
    if (!hadBirthday) age -= 1;
    r.age = age;

    // 年龄按周岁算；顺带给出下个生日还有多久
    var nextBirthday = new Date(today.getFullYear(), m - 1, d);
    if (nextBirthday < today) nextBirthday = new Date(today.getFullYear() + 1, m - 1, d);
    r.nextBirthdayIn = Math.round((nextBirthday - today) / DAY);

    r.valid = r.checkOk && r.birthOk && !!PROVINCES[provinceCode];
    return r;
  }

  function cdRun() {
    var msg = $('cd-msg'), out = $('cd-out'), body = $('cd-body');
    var today = parseYmd($('cd-at').value) || new Date();
    var r = idParse($('cd-in').value, today);
    if (r.err) {
      msg.className = 'hint err';
      msg.textContent = r.err;
      out.textContent = '';
      $('cd-grid').innerHTML = '';
      body.innerHTML = '';
      return null;
    }
    out.className = 'big' + (r.valid ? '' : ' warn');
    if (r.valid) {
      out.innerHTML = r.sex + ' · ' + r.age + ' 岁' + '<small>' + r.birthText + ' 出生于 ' + r.province + '</small>';
    } else {
      out.innerHTML = '格式有问题' + '<small>' +
        (!r.checkOk ? '校验位应为 ' + r.expectCheck + '，实际是 ' + r.actualCheck : '出生日期或省份代码不合法') + '</small>';
    }
    msg.className = r.valid ? 'hint' : 'hint err';
    msg.textContent = r.valid
      ? '校验位与出生日期都通过，但这只说明格式合法，不能证明号码真实存在。'
      : '注意：校验通过也不代表号码真实存在，伪造者只要按规则算对校验位就能造出合法格式的号。';

    setGrid($('cd-grid'), [
      ['性别', r.sex],
      ['周岁', String(r.age)],
      ['出生日期', r.birthText],
      ['省份', r.province],
      ['地区码', r.city ? r.city : r.cityCode],
      ['下个生日', r.nextBirthdayIn + ' 天后']
    ]);

    body.innerHTML = '';
    [
      ['输入号码', r.input],
      ['地区码（前 6 位）', r.cityCode + (r.city ? '（' + r.city + '）' : '（仅识别到省级）')],
      ['出生日期码', r.birthText],
      ['顺序码', r.seq + '（第 3 位 ' + (r.seqCode % 2 === 1 ? '奇' : '偶') + ' 数决定性别）'],
      ['校验码', r.actualCheck + '，按 GB 11643 应为 ' + r.expectCheck + (r.checkOk ? '（一致）' : '（不一致）')],
      ['校验结果', r.checkOk ? '通过' : '不通过'],
      ['出生日期校验', r.birthOk ? '合法日期' : '非法日期（该月没有这一天）'],
      ['省份代码', r.province]
    ].forEach(function (row) {
      var tr = document.createElement('tr');
      row.forEach(function (t, i) {
        var td = document.createElement('td');
        td.textContent = t;
        if (i === 0) td.style.color = 'var(--sub)';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return r;
  }

  $('cd-run').addEventListener('click', cdRun);
  ['cd-in', 'cd-at'].forEach(function (id) { $(id).addEventListener('input', cdRun); });
  $('cd-reset').addEventListener('click', function () {
    $('cd-in').value = '110105199001011234';
    $('cd-at').value = '';
    cdRun();
  });

  /* ================= 3.5 BMI 与内衣尺码 ================= */

  /* BMI 分类按中国成人标准（WS/T 428-2013）：
     偏瘦 < 18.5、正常 18.5~23.9、超重 24~27.9、肥胖 ≥ 28。
     注意这与 WHO 的国际标准（超重 ≥ 25、肥胖 ≥ 30）不同，别混用。 */
  function bmiCalc(h, w) {
    if (!(h > 0) || !(w > 0)) return { err: '身高与体重都需为正数。' };
    var m = h / 100;
    var bmi = w / (m * m);
    var cat = bmi < 18.5 ? ['偏瘦', '注意营养，必要时查甲状腺与消化系统']
      : bmi < 24 ? ['正常', '保持规律作息与运动即可']
      : bmi < 28 ? ['超重', '建议控制总热量，每周 150 分钟中等强度运动']
      : ['肥胖', '建议在内分泌或营养科指导下减重'];
    var standard = h - 105;   // 常用粗略标准体重（Broca 改良式）
    return {
      bmi: bmi, cat: cat, standard: standard,
      lo: 18.5 * m * m, hi: 23.9 * m * m,
      diff: w - standard
    };
  }

  /* 内衣尺码：下胸围就近取 5 的倍数作为底围，上下胸围差定罩杯。
     罩杯档差 2.5cm，取每档中点判断，避免正好落在边界上时归错档。 */
  var BRA_CUP_STEPS = [7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5];
  var BRA_CUP_NAMES = ['AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  var BRA_UNDER_STEPS = [65, 70, 75, 80, 85, 90, 95, 100, 105, 110];

  function braSize(under, over) {
    if (!(under > 0) || !(over > 0)) return { err: '上下胸围都需为正数。' };
    if (over <= under) return { err: '上胸围应大于下胸围，请检查输入。' };
    var diff = over - under;
    var cup = -1;
    for (var i = 0; i < BRA_CUP_STEPS.length; i++) {
      if (diff < BRA_CUP_STEPS[i] + 1.25) { cup = i; break; }
    }
    if (cup < 0) cup = BRA_CUP_NAMES.length - 1;
    // 底围就近到标准档
    var base = BRA_UNDER_STEPS[0], best = Infinity;
    BRA_UNDER_STEPS.forEach(function (u) {
      var d = Math.abs(u - under);
      if (d < best) { best = d; base = u; }
    });
    // 欧美码把下围换算成英寸再加 4（这是北美传统标法，与亚洲码不是一个体系）
    var us = Math.round(under / 2.54) + 4;
    return {
      cup: BRA_CUP_NAMES[cup], diff: Number(diff.toFixed(1)), base: base,
      code: base + BRA_CUP_NAMES[cup], us: us + BRA_CUP_NAMES[cup],
      matched: best <= 1.5
    };
  }

  /* ================= 4. 尺码 ================= */

  // 男装：以身高 170 / 体重 60kg 左右为 M 码的基准，按 BMI 与版型偏移
  var SIZE_MEN = [
    { name: 'XS', hMin: 155, hMax: 165, wMin: 45, wMax: 55 },
    { name: 'S', hMin: 160, hMax: 170, wMin: 50, wMax: 62 },
    { name: 'M', hMin: 168, hMax: 176, wMin: 58, wMax: 72 },
    { name: 'L', hMin: 173, hMax: 181, wMin: 68, wMax: 82 },
    { name: 'XL', hMin: 178, hMax: 186, wMin: 78, wMax: 92 },
    { name: '2XL', hMin: 183, hMax: 191, wMin: 88, wMax: 102 },
    { name: '3XL', hMin: 188, hMax: 200, wMin: 98, wMax: 120 }
  ];

  var SIZE_WOMEN = [
    { name: 'XS', hMin: 148, hMax: 156, wMin: 38, wMax: 46 },
    { name: 'S', hMin: 153, hMax: 161, wMin: 43, wMax: 52 },
    { name: 'M', hMin: 158, hMax: 166, wMin: 48, wMax: 58 },
    { name: 'L', hMin: 163, hMax: 171, wMin: 54, wMax: 65 },
    { name: 'XL', hMin: 168, hMax: 176, wMin: 60, wMax: 73 },
    { name: '2XL', hMin: 173, hMax: 182, wMin: 68, wMax: 82 },
    { name: '3XL', hMin: 178, hMax: 190, wMin: 76, wMax: 95 }
  ];

  // 打分：落在区间内得分，落在区间外按「离区间多远」扣分。
  // 扣分要用真实距离（不是除以 4 后的值再截断），否则 210cm/150kg 这种极端值
  // 会被扣到负数、反而让某个中间档胜出。
  function recommendSize(table, h, w, fit) {
    var offset = fit === 'slim' ? -1 : fit === 'loose' ? 1 : 0;

    function gap(v, lo, hi) {
      if (v < lo) return lo - v;
      if (v > hi) return v - hi;
      return 0;
    }

    var best = null;
    table.forEach(function (s, i) {
      var hGap = gap(h, s.hMin, s.hMax);
      var wGap = gap(w, s.wMin, s.wMax);
      var score = 0;
      // 落在区间内给高分；否则按距离扣分，身高权重与体重相同
      score += hGap === 0 ? 10 : -hGap;
      score += wGap === 0 ? 10 : -wGap;
      if (best === null || score > best.score) best = { idx: i, score: score, size: s, hGap: hGap, wGap: wGap };
    });
    // 版型偏移后要钳回表内，否则 3XL 再「宽松上调」就没有可给的了
    var pick = table[Math.max(0, Math.min(table.length - 1, best.idx + offset))];
    var applied = table.indexOf(pick) - best.idx;
    return {
      size: pick, base: best.size, offset: applied, requested: offset,
      score: best.score, hGap: best.hGap, wGap: best.wGap,
      exact: best.hGap === 0 && best.wGap === 0
    };
  }

  function szRun() {
    var msg = $('sz-msg'), out = $('sz-out');
    var h = num($('sz-h').value), w = num($('sz-w').value);
    if (!(h > 0) || !(w > 0)) { msg.className = 'hint err'; msg.textContent = '身高体重都要填正数。'; return null; }
    var sex = $('sz-sex').value;
    var fit = $('sz-fit').value;
    var table = sex === 'm' ? SIZE_MEN : SIZE_WOMEN;
    var r = recommendSize(table, h, w, fit);
    var bmi = w / Math.pow(h / 100, 2);

    out.className = 'big';
    out.innerHTML = r.size.name + ' 码' +
      '<small>' + (sex === 'm' ? '男装' : '女装') + ' · ' +
      { slim: '修身', normal: '标准', loose: '宽松' }[fit] +
      ' · 基准码 ' + r.base.name + (r.offset ? '（' + (r.offset > 0 ? '上调一档' : '下调一档') + '）' : '') + '</small>';

    msg.className = 'hint';
    msg.textContent = r.score < 3
      ? '身高体重组合落在尺码表边缘，建议看具体商品的实测尺寸（胸围/衣长）再定。'
      : 'BMI ' + bmi.toFixed(1) + '，落在推荐的 ' + r.size.name + ' 码区间内。';

    setGrid($('sz-grid'), [
      ['推荐尺码', r.size.name],
      ['身高区间', r.size.hMin + ' ~ ' + r.size.hMax + ' cm'],
      ['体重区间', r.size.wMin + ' ~ ' + r.size.wMax + ' kg'],
      ['你的 BMI', bmi.toFixed(1)],
      ['身高偏差', (h < r.size.hMin ? '偏矮 ' + (r.size.hMin - h) : h > r.size.hMax ? '偏高 ' + (h - r.size.hMax) : '在区间内') + ' cm'],
      ['体重偏差', (w < r.size.wMin ? '偏轻 ' + (r.size.wMin - w) : w > r.size.wMax ? '偏重 ' + (w - r.size.wMax) : '在区间内') + ' kg']
    ]);
    return r;
  }

  /* 鞋码换算：
     中国码按脚长（cm）直接标注，如 25.5 → 255。
     欧码 EU ≈ 脚长 × 1.5 + 2（男鞋近似），实际按下表查。
     美码 / 英码按常见对照表；男女码不同，本页统一用男码（女码通常比男码小 1.5 左右）。 */
  var SHOE_TABLE = [
    { cm: 22.5, cn: 225, eu: 35, us: 4.5, uk: 4.0 },
    { cm: 23.0, cn: 230, eu: 36, us: 5.0, uk: 4.5 },
    { cm: 23.5, cn: 235, eu: 37, us: 5.5, uk: 5.0 },
    { cm: 24.0, cn: 240, eu: 38, us: 6.0, uk: 5.5 },
    { cm: 24.5, cn: 245, eu: 39, us: 6.5, uk: 6.0 },
    { cm: 25.0, cn: 250, eu: 40, us: 7.0, uk: 6.5 },
    { cm: 25.5, cn: 255, eu: 41, us: 7.5, uk: 7.0 },
    { cm: 26.0, cn: 260, eu: 42, us: 8.0, uk: 7.5 },
    { cm: 26.5, cn: 265, eu: 43, us: 9.0, uk: 8.5 },
    { cm: 27.0, cn: 270, eu: 44, us: 9.5, uk: 9.0 },
    { cm: 27.5, cn: 275, eu: 45, us: 10.5, uk: 10.0 },
    { cm: 28.0, cn: 280, eu: 46, us: 11.0, uk: 10.5 }
  ];

  function shoeLookup(cm) {
    if (!(cm > 0)) return null;
    // 就近取整到 0.5，然后查表；超出表则按公式外推
    var nearest = Math.round(cm * 2) / 2;
    var hit = SHOE_TABLE.filter(function (s) { return Math.abs(s.cm - nearest) < 1e-9; })[0];
    if (hit) return { row: hit, exact: Math.abs(hit.cm - cm) < 1e-9, nearest: nearest };
    var first = SHOE_TABLE[0], last = SHOE_TABLE[SHOE_TABLE.length - 1];
    var base = nearest < first.cm ? first : last;
    var step = nearest < first.cm ? -0.5 : 0.5;
    var n = Math.round(Math.abs(nearest - base.cm) / 0.5) * (nearest < first.cm ? -1 : 1);
    return {
      row: {
        cm: nearest, cn: Math.round(nearest * 10),
        eu: base.eu + n, us: Math.round((base.us + n * 0.5) * 2) / 2,
        uk: Math.round((base.uk + n * 0.5) * 2) / 2
      },
      exact: false, nearest: nearest
    };
  }

  function shRun() {
    var msg = $('sh-msg'), out = $('sh-grid');
    var cm = num($('sh-len').value);
    var r = shoeLookup(cm);
    if (!r) { msg.className = 'hint err'; msg.textContent = '脚长要填正数。'; out.innerHTML = ''; return null; }
    msg.className = 'hint';
    msg.textContent = r.exact
      ? '脚长 ' + cm + ' cm 正好对应表中一行。'
      : '脚长 ' + cm + ' cm 落到表外/' + '非半码，已就近按 ' + r.nearest + ' cm 换算，实际可能有半码误差。';
    setGrid(out, [
      ['中国码', String(r.row.cn)],
      ['欧码 EU', String(r.row.eu)],
      ['美码 US（男）', String(r.row.us)],
      ['英码 UK', String(r.row.uk)],
      ['脚长', r.row.cm + ' cm'],
      ['建议', cm > r.row.cm ? '取大一码更舒服' : cm < r.row.cm ? '取小半码' : '按此码即可']
    ]);

    var body = $('sh-body');
    body.innerHTML = '';
    SHOE_TABLE.forEach(function (s) {
      var tr = document.createElement('tr');
      if (Math.abs(s.cn - r.row.cn) < 1e-9) tr.className = 'on';
      [s.cm + ' cm', String(s.cn), String(s.eu), String(s.us), String(s.uk)].forEach(function (t) {
        var td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return r;
  }

  $('sz-run').addEventListener('click', szRun);
  $('sh-run').addEventListener('click', shRun);
  $('bm-run').addEventListener('click', bmRun);
  $('br-run').addEventListener('click', brRun);
  ['bm-h', 'bm-w'].forEach(function (id) { $(id).addEventListener('input', bmRun); });
  ['br-under', 'br-over'].forEach(function (id) { $(id).addEventListener('input', brRun); });
  $('bm-reset').addEventListener('click', function () {
    $('bm-h').value = '175'; $('bm-w').value = '70'; bmRun();
  });
  $('br-reset').addEventListener('click', function () {
    $('br-under').value = '75'; $('br-over').value = '85'; brRun();
  });
  ['sz-h', 'sz-w', 'sz-sex', 'sz-fit'].forEach(function (id) {
    $(id).addEventListener('input', szRun);
    $(id).addEventListener('change', szRun);
  });
  $('sh-len').addEventListener('input', shRun);
  $('sz-reset').addEventListener('click', function () {
    $('sz-h').value = '175'; $('sz-w').value = '70';
    $('sz-sex').value = 'm'; $('sz-fit').value = 'normal';
    szRun();
  });

  /* ================= 4.5 BMI 与内衣尺码面板 ================= */

  function bmRun() {
    var msg = $('bm-msg'), out = $('bm-out');
    var r = bmiCalc(num($('bm-h').value), num($('bm-w').value));
    if (r.err) {
      msg.className = 'hint err';
      msg.textContent = r.err;
      out.textContent = ''; $('bm-grid').innerHTML = '';
      return r;
    }
    msg.className = 'hint';
    msg.textContent = '按中国成人标准分类；BMI 不区分肌肉与脂肪，健身人群仅供参考。';
    out.className = 'big';
    out.innerHTML = r.bmi.toFixed(1) + '<small>' + r.cat[0] + ' · ' + r.cat[1] + '</small>';
    setGrid($('bm-grid'), [
      ['BMI', r.bmi.toFixed(1)],
      ['分类', r.cat[0]],
      ['正常范围', '18.5 ~ 23.9'],
      ['对应体重区间', r.lo.toFixed(1) + ' ~ ' + r.hi.toFixed(1) + ' kg'],
      ['标准体重（身高−105）', r.standard.toFixed(1) + ' kg'],
      ['与标准体重差', (r.diff >= 0 ? '超 ' : '轻 ') + Math.abs(r.diff).toFixed(1) + ' kg']
    ]);
    return r;
  }

  function brRun() {
    var msg = $('br-msg'), out = $('br-out');
    var r = braSize(num($('br-under').value), num($('br-over').value));
    if (r.err) {
      msg.className = 'hint err';
      msg.textContent = r.err;
      out.textContent = ''; $('br-grid').innerHTML = '';
      return r;
    }
    msg.className = 'hint';
    msg.textContent = r.matched
      ? '下胸围正好落在标准档上。'
      : '下胸围不在标准档正中，已就近取档，实际可能有半档偏差，试穿为准。';
    out.className = 'big';
    out.innerHTML = r.code + '<small>罩杯 ' + r.cup + ' · 上下差 ' + r.diff +
      ' cm · 欧美码约 ' + r.us + '</small>';
    setGrid($('br-grid'), [
      ['亚洲码', r.code],
      ['底围', String(r.base) + ' cm'],
      ['罩杯', r.cup],
      ['上下胸围差', r.diff + ' cm'],
      ['欧美码（参考）', r.us],
      ['档位匹配', r.matched ? '正好落在标准档' : '就近取档']
    ]);
    return r;
  }

  /* ================= 5. 百家姓 ================= */

  // 公安部姓名报告的前 100 名次序；不同统计口径会有出入，这里按常用排序给出
  var SURNAMES = ('王 李 张 刘 陈 杨 黄 赵 吴 周 徐 孙 马 朱 胡 郭 何 高 林 罗 ' +
    '郑 梁 谢 宋 唐 许 韩 冯 邓 曹 彭 曾 肖 田 董 袁 潘 于 蒋 蔡 ' +
    '余 杜 叶 程 苏 魏 吕 丁 任 沈 姚 卢 姜 崔 钟 谭 陆 汪 范 ' +
    '金 石 廖 贾 夏 韦 付 方 白 邹 孟 熊 秦 邱 江 尹 薛 闫 段 雷 ' +
    '侯 龙 史 陶 黎 贺 顾 毛 郝 龚 邵 万 钱 严 覃 武 戴 莫 孔 向 汤').split(' ');

  function bjRun() {
    var q = $('bj-q').value.trim();
    var hits = [];
    if (!q) {
      hits = SURNAMES.slice(0, 20).map(function (n, i) { return { rank: i + 1, name: n }; });
    } else if (/^\d+$/.test(q)) {
      var r = Number(q);
      if (r >= 1 && r <= SURNAMES.length) hits = [{ rank: r, name: SURNAMES[r - 1] }];
    } else {
      SURNAMES.forEach(function (n, i) {
        if (n.indexOf(q) >= 0 || q.indexOf(n) >= 0) hits.push({ rank: i + 1, name: n });
      });
    }
    var msg = $('bj-msg');
    if (!hits.length) {
      msg.className = 'hint err';
      msg.textContent = '在收录的前 100 名里没找到「' + q + '」。它可能是较少的姓氏，或不在本表的统计范围内。';
    } else {
      msg.className = 'hint';
      msg.textContent = q ? '找到 ' + hits.length + ' 个匹配。' : '默认展示前 20 名（本表收录 ' + SURNAMES.length + ' 个）。';
    }

    var grid = $('bj-grid');
    grid.innerHTML = '';
    if (hits.length === 1) {
      var h = hits[0];
      grid.appendChild(cell('姓氏', h.name));
      grid.appendChild(cell('排名', '第 ' + h.rank + ' 位'));
      grid.appendChild(cell('所属段位', h.rank <= 10 ? '前十（超常见）' : h.rank <= 30 ? '前三十（很常见）' : h.rank <= 60 ? '前六十（常见）' : '百名内'));
      grid.appendChild(cell('总收录', SURNAMES.length + ' 个'));
    }

    var body = $('bj-body');
    body.innerHTML = '';
    hits.forEach(function (h) {
      var tr = document.createElement('tr');
      if (hits.length === 1) tr.className = 'on';
      [String(h.rank), h.name,
        h.rank <= 10 ? '超常见' : h.rank <= 30 ? '很常见' : h.rank <= 60 ? '常见' : '较少'].forEach(function (t) {
        var td = document.createElement('td');
        td.textContent = t;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return hits;
  }

  $('bj-q').addEventListener('input', bjRun);

  /* ================= 页签与初始化 ================= */

  var PANELS = ['egfr', 'preg', 'card', 'bmi', 'size', 'name'];
  function setTab(name) {
    T.markTab(name);
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);

  egRun();
  pgRun();
  ftRun();
  cdRun();
  bmRun();
  brRun();
  szRun();
  shRun();
  bjRun();
  setTab(T.firstTab('egfr'));

  window.__health2 = {
    egfrCkdEpi: egfrCkdEpi, egfrMdrd: egfrMdrd, gfrStage: gfrStage, toMgDl: toMgDl,
    dueDate: dueDate, gestAge: gestAge, pregCalc: pregCalc, CHECKUPS: CHECKUPS,
    hadlock4: hadlock4, shepard: shepard,
    idCheckDigit: idCheckDigit, luhnCheck: luhnCheck, idParse: idParse,
    PROVINCES: PROVINCES, ID_WEIGHTS: ID_WEIGHTS, ID_CHECKS: ID_CHECKS,
    bmiCalc: bmiCalc, braSize: braSize, BRA_CUP_NAMES: BRA_CUP_NAMES,
    recommendSize: recommendSize, SIZE_MEN: SIZE_MEN, SIZE_WOMEN: SIZE_WOMEN,
    shoeLookup: shoeLookup, SHOE_TABLE: SHOE_TABLE, SURNAMES: SURNAMES,
    parseYmd: parseYmd, addDays: addDays, fmtDate: fmtDate
  };
})();

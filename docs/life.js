/* 生活计算：渐进式延迟退休、含税/不含税换算、劳务报酬、国债利息、养老金、放假安排

   退休规则按 2024 年《关于实施渐进式延迟法定退休年龄的决定》：
   男职工与女干部自 2025 年起每 4 个月延 1 个月，分别到 63 / 58 岁；
   女工人每 2 个月延 1 个月，到 55 岁。这里按出生年月推算退休年龄。 */
(function () {
  'use strict';
  var $ = T.$;

  function num(id, def) {
    var n = Number($(id).value);
    return isFinite(n) ? n : (def == null ? NaN : def);
  }
  function r2(n) { return isFinite(n) ? Number(n.toFixed(2)) : NaN; }
  function money(n) {
    return isFinite(n) ? Number(n.toFixed(2)).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* ---------- 1. 延迟退休 ----------
     规则：从 2025 年 1 月 1 日起，按出生时间分档，每档递增。
     男/女干部：每 4 个月出生时间延 1 个月，上限 +36 / +36 个月。
     女工人：每 2 个月出生时间延 1 个月，上限 +60 个月。 */
  var RETIRE_KINDS = {
    m: { name: '男性', base: 60, step: 4, cap: 36 },
    fCadre: { name: '女性 · 干部', base: 55, step: 4, cap: 36 },
    fFlex: { name: '女性 · 灵活就业', base: 55, step: 4, cap: 36 },
    fWorker: { name: '女性 · 普通工人', base: 50, step: 2, cap: 60 }
  };

  function retireAge(kind, birthYear, birthMonth) {
    var cfg = RETIRE_KINDS[kind] || RETIRE_KINDS.m;
    // 以出生年月相对 1965-01 的月份数作为「延后进度」
    var monthsFrom = (birthYear - 1965) * 12 + (birthMonth - 1);
    if (monthsFrom < 0) monthsFrom = 0;
    // 分档：出生时间每满 step 个月，延迟加 1 个月。1965-01~04 出生不延迟
    var delay = Math.floor(monthsFrom / cfg.step);
    if (delay > cfg.cap) delay = cfg.cap;
    var totalMonths = cfg.base * 12 + delay;
    var years = Math.floor(totalMonths / 12);
    var months = totalMonths % 12;
    // 退休日期 = 出生年月 + 退休年龄（月）
    var retire = new Date(birthYear, birthMonth - 1 + totalMonths, 1);
    return {
      kind: cfg.name, base: cfg.base, delayMonths: delay,
      years: years, months: months, totalMonths: totalMonths,
      retireDate: retire, cap: cfg.cap
    };
  }

  /* ---------- 2. 税金换算 ---------- */
  function taxRate(gross, net) {
    if (!(gross > 0) || !(net > 0)) return { err: '含税与不含税金额都需为正数。' };
    if (net > gross) return { err: '不含税金额不应大于含税金额。' };
    var tax = gross - net;
    return { gross: gross, net: net, tax: tax, rate: (tax / net) * 100 };
  }
  function netFromGross(gross, ratePct) {
    if (!(gross > 0)) return { err: '含税金额需为正数。' };
    if (!(ratePct >= 0)) return { err: '税率不能为负。' };
    var net = gross / (1 + ratePct / 100);
    return { gross: gross, net: net, tax: gross - net, rate: ratePct };
  }
  function grossFromNet(net, ratePct) {
    if (!(net > 0)) return { err: '不含税金额需为正数。' };
    if (!(ratePct >= 0)) return { err: '税率不能为负。' };
    var gross = net * (1 + ratePct / 100);
    return { gross: gross, net: net, tax: gross - net, rate: ratePct };
  }
  function fromTax(tax, ratePct) {
    if (!(tax >= 0)) return { err: '税额不能为负。' };
    if (!(ratePct > 0)) return { err: '税率需大于 0 才能反推金额。' };
    var net = tax / (ratePct / 100);
    return { gross: net + tax, net: net, tax: tax, rate: ratePct };
  }

  /* ---------- 3. 劳务报酬（2025 预扣）----------
     应纳税所得额：≤800 不缴；800~4000 减 800；>4000 减 20%。
     预扣率：≤20000 → 20%；20000~50000 → 30% 速扣 2000；>50000 → 40% 速扣 7000。 */
  var LABOR_BRACKETS = [
    { up: 20000, rate: 0.20, ded: 0 },
    { up: 50000, rate: 0.30, ded: 2000 },
    { up: Infinity, rate: 0.40, ded: 7000 }
  ];
  function laborTax(amount) {
    var a = Number(amount);
    if (!(a >= 0)) return { err: '劳务报酬需不小于 0。' };
    var sum;
    if (a <= 800) sum = 0;
    else if (a <= 4000) sum = a - 800;
    else sum = a * 0.8;
    var br = LABOR_BRACKETS[0];
    for (var i = 0; i < LABOR_BRACKETS.length; i++) {
      if (sum <= LABOR_BRACKETS[i].up) { br = LABOR_BRACKETS[i]; break; }
    }
    var tax = sum > 0 ? Math.max(0, sum * br.rate - br.ded) : 0;
    return { amount: a, taxable: sum, rate: br.rate, ded: br.ded, tax: tax, net: a - tax, exempt: a <= 800 };
  }

  /* ---------- 4. 国债利息（单利）---------- */
  function bondInterest(amt, years, ratePct) {
    if (!(amt >= 0) || !(years > 0)) return { err: '本金需不小于 0，期限需大于 0。' };
    if (!(ratePct >= 0)) return { err: '年利率不能为负。' };
    var yearly = amt * ratePct / 100;
    var total = yearly * years;
    return { amt: amt, years: years, rate: ratePct, yearly: yearly, total: total, sum: amt + total };
  }

  /* ---------- 5. 养老金 ----------
     基础养老金 = 退休时社平 × (1 + 缴费指数) ÷ 2 × 缴费年限 × 1%
     个人账户养老金 = 账户余额 ÷ 计发月数（60 岁 139、55 岁 170、50 岁 195、45 岁 216）
     增发养老金 = 退休时社平 × 缴费指数 × 缴费年限 × 0.1%（本页按此口径也一并给出） */
  var PENSION_MONTHS = { 45: 216, 50: 195, 55: 170, 60: 139 };
  function pensionMonths(age) {
    if (PENSION_MONTHS[age]) return PENSION_MONTHS[age];
    // 中间年龄线性插值，平滑到相邻档
    var keys = Object.keys(PENSION_MONTHS).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length - 1; i++) {
      if (age > keys[i] && age < keys[i + 1]) {
        var t = (age - keys[i]) / (keys[i + 1] - keys[i]);
        return Math.round(PENSION_MONTHS[keys[i]] * (1 - t) + PENSION_MONTHS[keys[i + 1]] * t);
      }
    }
    return age >= 60 ? PENSION_MONTHS[60] : PENSION_MONTHS[45];
  }

  function pension(opts) {
    var avg = Number(opts.avg), growth = Number(opts.growth) / 100;
    var age = Number(opts.age), retireAgeV = Number(opts.retireAge);
    var acct = Number(opts.acct), years = Number(opts.years), index = Number(opts.index) / 100;
    if (!(avg > 0)) return { err: '社平工资需为正数。' };
    if (!(retireAgeV > age)) return { err: '退休年龄需大于当前年龄。' };
    if (!(years > 0)) return { err: '缴费年限需大于 0。' };
    var yearsLeft = retireAgeV - age;
    var avgAtRetire = avg * Math.pow(1 + growth, yearsLeft);
    var base = avgAtRetire * (1 + index) / 2 * years * 0.01;
    var months = pensionMonths(retireAgeV);
    var personal = acct / months;
    var extra = avgAtRetire * index * years * 0.001;
    return {
      avgAtRetire: avgAtRetire, base: base, personal: personal, extra: extra,
      months: months, total: base + personal + extra, yearsLeft: yearsLeft
    };
  }

  /* ---------- 6. 放假安排 ---------- */
  var HOLIDAYS = {
    2026: {
      spans: [
        ['元旦', '2026-01-01', '2026-01-03', '共 3 天', '1 月 4 日（周日）上班'],
        ['春节', '2026-02-15', '2026-02-23', '共 9 天', '2 月 14 日（周六）、2 月 28 日（周六）上班'],
        ['清明节', '2026-04-04', '2026-04-06', '共 3 天', '不调休'],
        ['劳动节', '2026-05-01', '2026-05-05', '共 5 天', '5 月 9 日（周六）上班'],
        ['端午节', '2026-06-19', '2026-06-21', '共 3 天', '不调休'],
        ['中秋节', '2026-09-25', '2026-09-27', '共 3 天', '不调休'],
        ['国庆节', '2026-10-01', '2026-10-07', '共 7 天', '9 月 20 日（周日）、10 月 10 日（周六）上班']
      ],
      workdays: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']
    },
    2025: {
      spans: [
        ['元旦', '2025-01-01', '2025-01-01', '共 1 天', '不调休'],
        ['春节', '2025-01-28', '2025-02-04', '共 8 天', '1 月 26 日（周日）、2 月 8 日（周六）上班'],
        ['清明节', '2025-04-04', '2025-04-06', '共 3 天', '不调休'],
        ['劳动节', '2025-05-01', '2025-05-05', '共 5 天', '4 月 27 日（周日）上班'],
        ['端午节', '2025-05-31', '2025-06-02', '共 3 天', '不调休'],
        ['国庆节 · 中秋节', '2025-10-01', '2025-10-08', '共 8 天', '9 月 28 日（周日）、10 月 11 日（周六）上班']
      ],
      workdays: ['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11']
    }
  };

  function dstr(s) { return s; }
  function holidayOf(year, dateStr) {
    var set = HOLIDAYS[year];
    if (!set || !dateStr) return null;
    var inSpan = null;
    set.spans.forEach(function (s) {
      if (dateStr >= s[1] && dateStr <= s[2]) inSpan = s;
    });
    if (inSpan) return { type: 'holiday', span: inSpan };
    if (set.workdays.indexOf(dateStr) >= 0) return { type: 'makeup', span: null };
    return { type: 'normal', span: null };
  }

  /* ---------- 面板渲染 ---------- */
  function segBox(id, cb) {
    var box = $(id);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      [].forEach.call(box.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
      cb(b.dataset);
    });
    return box;
  }
  function segVal(id, key, def) {
    var on = $(id).querySelector('button.on');
    return on ? on.dataset[key] : def;
  }

  /* 退休 */
  function runRetire() {
    var y = num('re-year'), m = num('re-month');
    if (!(y >= 1900) || !(m >= 1)) { $('re-big').textContent = '—'; $('re-out').innerHTML = ''; $('re-note').textContent = '请填写出生年份与月份。'; return; }
    var kind = segVal('re-kind', 'kind', 'm');
    var r = retireAge(kind, y, m);
    $('re-big').innerHTML = r.years + ' 岁' + (r.months ? ' ' + r.months + ' 个月' : '') + ' <small>法定退休年龄</small>';
    T.cells($('re-out'), [
      ['类别', r.kind],
      ['原法定退休年龄', r.base + ' 岁'],
      ['延迟时长', r.delayMonths ? '+' + r.delayMonths + ' 个月' : '无需延迟'],
      ['延迟后年龄', r.years + ' 岁' + (r.months ? ' ' + r.months + ' 个月' : '')],
      ['预计退休时间', r.retireDate.getFullYear() + ' 年 ' + (r.retireDate.getMonth() + 1) + ' 月'],
      ['延迟上限', '+' + r.cap + ' 个月']
    ]);
    $('re-note').innerHTML = '<b>说明</b>　男职工、女干部自 2025 年起每 4 个月延 1 个月，上限分别 +36 个月（到 63 岁）与 +36 个月（到 58 岁）；' +
      '女工人每 2 个月延 1 个月，上限 +60 个月（到 55 岁）。1965 年 1 月前出生者不延迟，1978 年后出生者基本已到延迟上限。' +
      '本页仅按出生年月与类别推算，特殊工种、病退、丧失劳动能力等另按专门规定。';
  }

  /* 税金 */
  var TAX_MODES = {
    rate: {
      hint: '输入含税与不含税金额，算出税率（税点）与税额。',
      fields: [['gross', '含税金额', '10000'], ['net', '不含税金额', '9009.01']]
    },
    net: { hint: '输入含税金额与税率，算出不含税金额与税额。', fields: [['gross', '含税金额', '10000'], ['rate', '税率（点）', '11']] },
    gross: { hint: '输入不含税金额与税率，算出含税金额与税额。', fields: [['net', '不含税金额', '9009.01'], ['rate', '税率（点）', '11']] },
    tax: { hint: '输入税额与税率，反推含税与不含税金额。', fields: [['tax', '税额', '990.99'], ['rate', '税率（点）', '11']] }
  };

  function buildTaxFields(mode) {
    var cfg = TAX_MODES[mode];
    var box = $('tx-fields');
    box.innerHTML = '';
    cfg.fields.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'row';
      var label = document.createElement('label');
      label.textContent = f[1] + (f[0] === 'rate' ? '（%）' : '（元）');
      var wrap = document.createElement('div');
      wrap.className = 'input-wrap';
      var input = document.createElement('input');
      input.type = 'number';
      input.id = 'tx-' + f[0];
      input.value = f[2];
      input.step = '0.01';
      input.addEventListener('input', runTax);
      wrap.appendChild(input);
      row.appendChild(label); row.appendChild(wrap);
      box.appendChild(row);
    });
    $('tx-hint').textContent = cfg.hint;
  }

  function runTax() {
    var mode = segVal('tx-mode', 'mode', 'rate');
    var r;
    if (mode === 'rate') r = taxRate(num('tx-gross'), num('tx-net'));
    else if (mode === 'net') r = netFromGross(num('tx-gross'), num('tx-rate'));
    else if (mode === 'gross') r = grossFromNet(num('tx-net'), num('tx-rate'));
    else r = fromTax(num('tx-tax'), num('tx-rate'));
    if (r.err) { $('tx-out').innerHTML = ''; $('tx-formula').textContent = ''; $('tx-note').textContent = r.err; return; }
    T.cells($('tx-out'), [
      ['含税金额', money(r.gross) + ' 元'],
      ['不含税金额', money(r.net) + ' 元'],
      ['税额', money(r.tax) + ' 元'],
      ['税率', r2(r.rate) + ' %']
    ]);
    var lines = {
      rate: '税率 = 税额 ÷ 不含税金额 = ' + money(r.tax) + ' ÷ ' + money(r.net) + ' × 100% = ' + r2(r.rate) + '%',
      net: '不含税 = 含税 ÷ (1 + 税率) = ' + money(r.gross) + ' ÷ (1 + ' + r.rate + '%) = ' + money(r.net),
      gross: '含税 = 不含税 × (1 + 税率) = ' + money(r.net) + ' × (1 + ' + r.rate + '%) = ' + money(r.gross),
      tax: '不含税 = 税额 ÷ 税率 = ' + money(r.tax) + ' ÷ ' + r.rate + '% = ' + money(r.net)
    };
    $('tx-formula').textContent = lines[mode];
    $('tx-note').textContent = '增值税为价外税，报「含税价」时税额 = 含税 ÷ (1 + 税率) × 税率，不含税 = 含税 − 税额。';
  }

  /* 劳务报酬 */
  function runLabor() {
    var r = laborTax(num('lb-amt'));
    if (r.err) { $('lb-out').innerHTML = ''; $('lb-formula').textContent = ''; $('lb-note').textContent = r.err; return; }
    T.cells($('lb-out'), [
      ['劳务报酬', money(r.amount) + ' 元'],
      ['应纳税所得额', money(r.taxable) + ' 元'],
      ['预扣率', (r.rate * 100) + ' %'],
      ['速算扣除数', money(r.ded) + ' 元'],
      ['应预扣税额', money(r.tax) + ' 元'],
      ['税后收入', money(r.net) + ' 元']
    ]);
    var exp = r.amount <= 800 ? '收入不超过 800 元，免征'
      : r.amount <= 4000 ? money(r.amount) + ' − 800 = ' + money(r.taxable)
      : money(r.amount) + ' × (1 − 20%) = ' + money(r.taxable);
    $('lb-formula').innerHTML = '<span class="t">计算过程</span><br>' +
      '① 应纳税所得额：' + exp + '<br>' +
      '② 应纳税额 = ' + money(r.taxable) + ' × ' + (r.rate * 100) + '% − ' + money(r.ded) + ' = ' + money(r.tax) + ' 元';
    $('lb-note').innerHTML = '<b>说明</b>　劳务报酬按次预扣，年度汇算时并入综合所得、与工资合并计税，多退少补。' +
      '预扣率表：不超过 20000 部分 20%；20000~50000 部分 30%（速算扣除 2000）；超过 50000 部分 40%（速算扣除 7000）。' +
      '本页给的是<b>预扣</b>税额，年度实际税负以汇算清缴为准。';
  }

  /* 国债 */
  function runBond() {
    var r = bondInterest(num('bd-amt'), num('bd-years'), num('bd-rate'));
    if (r.err) { $('bd-big').textContent = '—'; $('bd-out').innerHTML = ''; $('bd-formula').textContent = ''; return; }
    $('bd-big').innerHTML = money(r.sum) + ' <small>元（到期本息）</small>';
    T.cells($('bd-out'), [
      ['本金', money(r.amt) + ' 元'],
      ['年利息', money(r.yearly) + ' 元'],
      ['总利息', money(r.total) + ' 元'],
      ['本息合计', money(r.sum) + ' 元'],
      ['10 万元一年利息', money(100000 * r.rate / 100) + ' 元']
    ]);
    $('bd-formula').innerHTML = '<span class="t">单利计算</span><br>' +
      '总利息 = 本金 × 年利率 × 期限 = ' + money(r.amt) + ' × ' + r.rate + '% × ' + r.years + ' = ' + money(r.total) + ' 元<br>' +
      '本息合计 = ' + money(r.amt) + ' + ' + money(r.total) + ' = ' + money(r.sum) + ' 元';
  }

  /* 养老金 */
  function runPension() {
    var r = pension({
      avg: num('pe-avg'), growth: num('pe-growth'), age: num('pe-age'),
      retireAge: Number($('pe-retire').value), acct: num('pe-acct'),
      years: num('pe-years'), index: num('pe-index')
    });
    if (r.err) { $('pe-big').textContent = '—'; $('pe-out').innerHTML = ''; $('pe-formula').textContent = ''; $('pe-note').textContent = r.err; return; }
    $('pe-big').innerHTML = money(r.total) + ' <small>元/月（预估）</small>';
    T.cells($('pe-out'), [
      ['退休时社平工资', money(r.avgAtRetire) + ' 元/月'],
      ['基础养老金', money(r.base) + ' 元'],
      ['个人账户养老金', money(r.personal) + ' 元'],
      ['增发养老金', money(r.extra) + ' 元'],
      ['合计', money(r.total) + ' 元/月'],
      ['计发月数', r.months + ' 个月']
    ]);
    $('pe-formula').innerHTML = '<span class="t">计算过程</span><br>' +
      '① 退休时社平 = ' + money(num('pe-avg')) + ' × (1 + ' + num('pe-growth') + '%)^' + r.yearsLeft + ' = ' + money(r.avgAtRetire) + ' 元<br>' +
      '② 基础养老金 = ' + money(r.avgAtRetire) + ' × (1 + ' + (num('pe-index') / 100) + ') ÷ 2 × ' + num('pe-years') + ' × 1% = ' + money(r.base) + ' 元<br>' +
      '③ 个人账户养老金 = ' + money(num('pe-acct')) + ' ÷ ' + r.months + ' = ' + money(r.personal) + ' 元<br>' +
      '④ 增发养老金 = ' + money(r.avgAtRetire) + ' × ' + (num('pe-index') / 100) + ' × ' + num('pe-years') + ' × 0.1% = ' + money(r.extra) + ' 元';
    $('pe-note').innerHTML = '<b>说明</b>　本页不含过渡性养老金（各地口径差异大，1996 年前视同缴费年限可并入缴费年限近似）。' +
      '计发月数按退休年龄取 45→216、50→195、55→170、60→139，中间年龄线性插值。个人账户余额这里按当前值直接代入，未计后续缴费与记账利率。' +
      '结果是粗估，实际以社保经办机构核定为准。';
  }

  /* 放假 */
  function renderHoliday() {
    var year = Number(segVal('hd-year', 'year', '2026'));
    var set = HOLIDAYS[year] || HOLIDAYS[2026];
    if (!set) return;
    var out = $('hd-out');
    out.innerHTML = '';
    set.spans.forEach(function (s) {
      var div = document.createElement('div');
      div.innerHTML = '<b>' + s[0] + '</b>　' + s[1] + ' ~ ' + s[2] + '　' + s[3] +
        '　<span style="color:var(--sub)">' + s[4] + '</span>';
      out.appendChild(div);
    });
    var d = $('hd-date').value;
    var dayBox = $('hd-day');
    if (!d || d.slice(0, 4) !== String(year)) { dayBox.hidden = true; }
    else {
      var r = holidayOf(year, d);
      var w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(d).getDay()];
      dayBox.hidden = false;
      dayBox.innerHTML = d + '（' + w + '）：' +
        (r.type === 'holiday' ? '<b>' + r.span[0] + '假期</b>'
          : r.type === 'makeup' ? '<span class="warn">调休上班日</span>'
          : '正常工作日 / 周末');
    }
    $('hd-note').innerHTML = '<b>说明</b>　数据来自国务院办公厅节假日安排通知，含调休与补班日。' +
      '放假期间高速公路免费通行等政策另有规定，请以主管部门通知为准。';
  }

  /* 绑定 */
  (function () {
    var sel = $('re-month');
    for (var i = 1; i <= 12; i++) {
      var o = document.createElement('option');
      o.value = i; o.textContent = i + ' 月';
      sel.appendChild(o);
    }
    sel.value = '6';
    var pr = $('pe-retire');
    [45, 50, 55, 60, 63].forEach(function (a) {
      var o2 = document.createElement('option');
      o2.value = a; o2.textContent = a + ' 岁';
      pr.appendChild(o2);
    });
    pr.value = '60';
  })();

  segBox('re-kind', runRetire);
  segBox('tx-mode', function (d) { buildTaxFields(d.mode); runTax(); });
  segBox('hd-year', renderHoliday);

  ['re-year', 're-month'].forEach(function (id) { $(id).addEventListener('input', runRetire); });
  ['lb-amt'].forEach(function (id) { $(id).addEventListener('input', runLabor); });
  ['bd-amt', 'bd-years', 'bd-rate'].forEach(function (id) { $(id).addEventListener('input', runBond); });
  ['pe-avg', 'pe-growth', 'pe-age', 'pe-acct', 'pe-years', 'pe-index'].forEach(function (id) { $(id).addEventListener('input', runPension); });
  $('pe-retire').addEventListener('change', runPension);
  $('hd-date').addEventListener('input', renderHoliday);

  $('re-run').addEventListener('click', runRetire);
  $('tx-run').addEventListener('click', runTax);
  $('lb-run').addEventListener('click', runLabor);
  $('bd-run').addEventListener('click', runBond);
  $('pe-run').addEventListener('click', runPension);
  $('re-reset').addEventListener('click', function () { $('re-year').value = '1990'; $('re-month').value = '6'; runRetire(); });
  $('tx-reset').addEventListener('click', function () { buildTaxFields(segVal('tx-mode', 'mode', 'rate')); runTax(); });
  $('lb-reset').addEventListener('click', function () { $('lb-amt').value = '20000'; runLabor(); });
  $('bd-reset').addEventListener('click', function () { $('bd-amt').value = '100000'; $('bd-years').value = '3'; $('bd-rate').value = '1.63'; runBond(); });
  $('pe-reset').addEventListener('click', function () {
    $('pe-avg').value = '12000'; $('pe-growth').value = '5'; $('pe-age').value = '35';
    $('pe-acct').value = '200000'; $('pe-years').value = '20'; $('pe-index').value = '100'; runPension();
  });

  T.tabs($('tabs'), function (name) {
    ['retire', 'tax', 'labor', 'bond', 'pension', 'holiday'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
    if (name === 'tax') { buildTaxFields(segVal('tx-mode', 'mode', 'rate')); runTax(); }
    if (name === 'holiday') renderHoliday();
  });

  buildTaxFields('rate');
  runRetire(); runTax(); runLabor(); runBond(); runPension(); renderHoliday();

  window.__life = {
    RETIRE_KINDS: RETIRE_KINDS, retireAge: retireAge, LABOR_BRACKETS: LABOR_BRACKETS,
    laborTax: laborTax, taxRate: taxRate, netFromGross: netFromGross, grossFromNet: grossFromNet,
    fromTax: fromTax, bondInterest: bondInterest, pension: pension, pensionMonths: pensionMonths,
    HOLIDAYS: HOLIDAYS, holidayOf: holidayOf
  };
})();

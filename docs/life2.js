/* 日常计算：油耗 / 退休测算 / 国债利息
   纯本地计算，不联网。政策口径写在页面说明里，代码里也标注了依据。 */
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

  function money(n, digits) {
    if (!isFinite(n)) return '—';
    return n.toLocaleString('zh-CN', { minimumFractionDigits: digits == null ? 2 : digits, maximumFractionDigits: digits == null ? 2 : digits });
  }

  function num(v) { return Number(v); }

  function bar(label, value, max, text) {
    var d = document.createElement('div');
    d.className = 'bar';
    d.innerHTML = '<div class="lab"></div><div class="track"><div class="fill"></div></div><div class="val"></div>';
    d.querySelector('.lab').textContent = label;
    d.querySelector('.fill').style.width = Math.max(0, Math.min(100, max ? value / max * 100 : 0)) + '%';
    d.querySelector('.val').textContent = text;
    return d;
  }

  /* ================= 1. 油耗 ================= */

  // 统一成「百公里油耗 L/100km」与「每公里花费」两个核心指标
  function fuelConsumption(input) {
    var mode = input.mode;
    var r = { mode: mode, err: null };

    function need(name, v, cond, tip) {
      if (!isFinite(v) || !cond) { r.err = tip; return false; }
      return true;
    }

    if (mode === 'twice') {
      var v1 = num(input.odoFill1), v2 = num(input.odoFill2), liters = num(input.liters);
      if (!need('odoFill1', v1, v1 >= 0, '第一次加满时的里程表读数要填数字')) return r;
      if (!need('odoFill2', v2, v2 > v1, '第二次加满的里程必须大于第一次，检查是不是填反了')) return r;
      if (!need('liters', liters, liters > 0, '第二次加了多少升要大于 0')) return r;
      r.distance = v2 - v1;
      r.liters = liters;
      r.per100 = liters / (v2 - v1) * 100;
    } else if (mode === 'trip') {
      var dist = num(input.distance), l2 = num(input.liters2);
      if (!need('distance', dist, dist > 0, '总里程要大于 0')) return r;
      if (!need('liters2', l2, l2 > 0, '总耗油量要大于 0')) return r;
      r.distance = dist;
      r.liters = l2;
      r.per100 = l2 / dist * 100;
    } else if (mode === 'price') {
      var l3 = num(input.liters3), p3 = num(input.price3), d3 = num(input.distance3);
      if (!need('liters3', l3, l3 > 0, '加油量要大于 0')) return r;
      if (!need('price3', p3, p3 > 0, '油价要大于 0')) return r;
      r.distance = isFinite(d3) && d3 > 0 ? d3 : null;
      r.liters = l3;
      r.cost = l3 * p3;
      r.perLiterCost = p3;
      r.per100 = r.distance ? l3 / r.distance * 100 : null;
    } else {
      var want = num(input.wantDistance), per100 = num(input.wantPer100), price = num(input.wantPrice);
      if (!need('wantDistance', want, want > 0, '要行驶的里程要大于 0')) return r;
      if (!need('wantPer100', per100, per100 > 0, '百公里油耗要大于 0')) return r;
      if (!need('wantPrice', price, price > 0, '油价要大于 0')) return r;
      r.distance = want;
      r.liters = per100 / 100 * want;
      r.cost = r.liters * price;
      r.per100 = per100;
      r.perLiterCost = price;
    }

    if (r.per100 != null && r.per100 > 0) {
      // 每公里油费只在已知油价时才有意义
      if (r.perLiterCost) r.perKm = r.per100 / 100 * r.perLiterCost;
      if (r.distance && r.liters) r.perKmFromData = r.liters / r.distance;
    }
    if (r.per100 != null) {
      // 一箱油能跑多远：按常见 50L 油箱给个参考，用户可自行换算
      r.rangePer50 = 50 / r.per100 * 100;
      r.kmPerLiter = 100 / r.per100;
    }
    return r;
  }

  var FU_FORMS = {
    twice: {
      hint: '两次都加满、里程表读数之差就是本次实际行驶里程，用掉的油量就是「第二次加了多少升」。',
      fields: [
        { id: 'odoFill1', label: '上次加满时里程表读数', value: '12000', unit: 'km' },
        { id: 'odoFill2', label: '这次加满时里程表读数', value: '12480', unit: 'km' },
        { id: 'liters', label: '这次加了多少升', value: '38.5', unit: 'L' }
      ]
    },
    trip: {
      hint: '已知一段行程的总里程与总耗油量，直接相除。适合跑长途后核算。',
      fields: [
        { id: 'distance', label: '总里程', value: '480', unit: 'km' },
        { id: 'liters2', label: '总耗油量', value: '38.5', unit: 'L' }
      ]
    },
    price: {
      hint: '只记得加了多少钱、油价多少。里程可以留空——留空时只算这次加油量与花费。',
      fields: [
        { id: 'liters3', label: '加油量', value: '40', unit: 'L' },
        { id: 'price3', label: '油价', value: '7.85', unit: '元/L' },
        { id: 'distance3', label: '行驶里程（可留空）', value: '500', unit: 'km' }
      ]
    },
    reverse: {
      hint: '出发前先算账：跑这么远要烧多少油、花多少钱。',
      fields: [
        { id: 'wantDistance', label: '计划行驶里程', value: '600', unit: 'km' },
        { id: 'wantPer100', label: '百公里油耗', value: '8', unit: 'L/100km' },
        { id: 'wantPrice', label: '油价', value: '7.85', unit: '元/L' }
      ]
    }
  };

  function fuBuildFields() {
    var form = FU_FORMS[$('fu-mode').value];
    var box = $('fu-fields');
    box.innerHTML = '';
    form.fields.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'row';
      var lab = document.createElement('label');
      lab.setAttribute('for', 'fu-' + f.id);
      lab.innerHTML = '<b></b>';
      lab.querySelector('b').textContent = f.label;
      var wrap = document.createElement('div');
      wrap.className = 'input-wrap';
      var inp = document.createElement('input');
      inp.id = 'fu-' + f.id;
      inp.type = 'number';
      inp.step = 'any';
      inp.value = f.value;
      var u = document.createElement('span');
      u.className = 'unit';
      u.textContent = f.unit;
      wrap.appendChild(inp); wrap.appendChild(u);
      row.appendChild(lab); row.appendChild(wrap);
      box.appendChild(row);
      inp.addEventListener('input', fuRun);
    });
    $('fu-hint').textContent = form.hint;
  }

  function fuRead() {
    var o = { mode: $('fu-mode').value };
    FU_FORMS[o.mode].fields.forEach(function (f) { o[f.id] = $('fu-' + f.id).value; });
    return o;
  }

  function fuRun() {
    var r = fuelConsumption(fuRead());
    var out = $('fu-out'), grid = $('fu-grid'), fml = $('fu-formula');
    if (r.err) {
      out.className = 'big warn';
      out.textContent = r.err;
      grid.innerHTML = '';
      fml.textContent = '';
      return r;
    }
    out.className = 'big';
    var main = r.per100 != null ? r.per100.toFixed(2) + ' L/100km' : money(r.liters, 2) + ' L';
    var sub = r.per100 != null
      ? (r.distance ? '行驶 ' + r.distance + ' km，耗油 ' + r.liters.toFixed(2) + ' L' : '')
      : '未提供里程，只算出加油量';
    out.innerHTML = main + '<small>' + sub + '</small>';

    var pairs = [['百公里油耗', r.per100 != null ? r.per100.toFixed(2) + ' L/100km' : '—']];
    if (r.kmPerLiter) pairs.push(['每升可跑', r.kmPerLiter.toFixed(2) + ' km']);
    if (r.perKm) pairs.push(['每公里油费', r.perKm.toFixed(3) + ' 元']);
    if (r.cost != null) pairs.push(['本次油费', money(r.cost) + ' 元']);
    if (r.rangePer50) pairs.push(['50L 油箱续航', Math.round(r.rangePer50) + ' km']);
    setGrid(grid, pairs);

    fml.innerHTML = '';
    if (r.mode === 'twice' || r.mode === 'trip' || (r.mode === 'price' && r.distance)) {
      fml.innerHTML = '<span class="t">计算过程</span><br>' +
        '百公里油耗 = 耗油量 ÷ 里程 × 100 = ' + r.liters.toFixed(2) + ' ÷ ' + r.distance + ' × 100 = ' +
        r.per100.toFixed(2) + ' L/100km';
    } else if (r.mode === 'reverse') {
      fml.innerHTML = '<span class="t">计算过程</span><br>' +
        '需油量 = 里程 ÷ 100 × 百公里油耗 = ' + r.distance + ' ÷ 100 × ' + r.per100 + ' = ' + r.liters.toFixed(2) + ' L<br>' +
        '油费 = 需油量 × 油价 = ' + r.liters.toFixed(2) + ' × ' + r.perLiterCost + ' = ' + money(r.cost) + ' 元';
    } else {
      fml.innerHTML = '<span class="t">计算过程</span><br>加油量 ' + r.liters.toFixed(2) + ' L × 油价 ' + r.perLiterCost + ' 元/L = ' + money(r.cost) + ' 元';
    }
    return r;
  }

  $('fu-mode').addEventListener('change', function () { fuBuildFields(); fuRun(); });
  $('fu-run').addEventListener('click', fuRun);
  $('fu-reset').addEventListener('click', function () { fuBuildFields(); fuRun(); });
  fuBuildFields();

  /* ================= 2. 退休测算 ================= */

  /* 依据：2024 年 9 月《关于实施渐进式延迟法定退休年龄的决定》及附表。
     男职工与原 55 岁女职工：从 2025-01-01 起每 4 个月出生延后 1 个月，上限分别 63 / 58 岁；
     原 50 岁女职工：每 2 个月出生延后 1 个月，上限 55 岁。
     附表按「出生年月」给出退休年月，这里按同一规则用公式复算：
     延迟月数 = ceil(从起点到该出生年月的月数 ÷ 间隔)，再封顶。 */
  var RETIRE_START = { year: 1965, month: 1 };     // 男职工 1965-01 起开始延迟
  var RETIRE_START_F55 = { year: 1970, month: 1 }; // 原 55 岁女职工 1970-01 起
  var RETIRE_START_F50 = { year: 1975, month: 1 }; // 原 50 岁女职工 1975-01 起

  function monthIndex(y, m) { return (y - 1900) * 12 + (m - 1); }

  function delayMonths(birthY, birthM, kind) {
    var start, step, cap;
    if (kind === 'm') { start = RETIRE_START; step = 4; cap = 36; }
    else if (kind === 'f55') { start = RETIRE_START_F55; step = 4; cap = 36; }
    else { start = RETIRE_START_F50; step = 2; cap = 60; }

    var baseAge = kind === 'm' ? 60 : (kind === 'f55' ? 55 : 50);
    var monthsFromStart = monthIndex(birthY, birthM) - monthIndex(start.year, start.month);
    if (monthsFromStart < 0) return { age: baseAge, delay: 0, phase: '未开始延迟（原法定年龄）' };
    // 出生越晚，延迟越多；每 step 个月出生时间多延 1 个月
    var delay = Math.min(cap, Math.floor(monthsFromStart / step) + 1);
    return { age: baseAge, delay: delay, phase: delay >= cap ? '已到上限' : '渐进延迟中' };
  }

  function retireCalc(birthY, birthM, kind, now) {
    var d = delayMonths(birthY, birthM, kind);
    // 退休月份 = 出生月 + 法定年龄 + 延迟月数，跨年由 Date 自动进位
    var totalMonths = (birthM - 1) + d.delay;
    var retire = new Date(birthY + d.age + Math.floor(totalMonths / 12), totalMonths % 12, 1);

    now = now || new Date();
    var monthsLeft = (retire.getFullYear() - now.getFullYear()) * 12 + (retire.getMonth() - now.getMonth());
    var daysLeft = Math.round((retire - now) / 86400000);

    return {
      baseAge: d.age, delayMonths: d.delay, phase: d.phase,
      retireDate: retire, retireAge: d.age, retireAgeExact: d.age + d.delay / 12,
      monthsLeft: Math.max(0, monthsLeft), daysLeft: Math.max(0, daysLeft),
      already: retire < now,
      born: new Date(birthY, birthM - 1, 1)
    };
  }

  function rtRun() {
    var msg = $('rt-msg'), out = $('rt-out'), grid = $('rt-grid'), bars = $('rt-bars');
    var bv = $('rt-birth').value;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bv || '');
    if (!m) {
      msg.className = 'hint err';
      msg.textContent = '请填写出生日期。';
      out.className = 'big warn';
      out.textContent = '';
      grid.innerHTML = ''; bars.innerHTML = '';
      return null;
    }
    var by = Number(m[1]), bm = Number(m[2]);
    if (by < 1900 || by > 2100) {
      msg.className = 'hint err';
      msg.textContent = '出生年份看起来不对。';
      return null;
    }
    var sex = $('rt-sex').value;
    var kind = sex === 'm' ? 'm' : ($('rt-type').value === 'cadre' ? 'f55' : 'f50');
    var r = retireCalc(by, bm, kind);

    if (r.already) {
      out.className = 'big ok';
      out.innerHTML = '已达法定退休年龄<small>' + fmtYm(r.retireDate) + ' 起可办理（原法定 ' +
        r.baseAge + ' 岁 + 延迟 ' + r.delayMonths + ' 个月）</small>';
    } else {
      out.className = 'big';
      out.innerHTML = '还需 ' + fmtDur(r.daysLeft) + '<small>' + fmtYm(r.retireDate) + ' 达到法定退休年龄</small>';
    }

    msg.className = 'hint';
    msg.textContent = r.delayMonths
      ? '按 2024 年决定：原法定 ' + r.baseAge + ' 岁，延迟 ' + r.delayMonths + ' 个月，实际 ' +
        (r.baseAge + r.delayMonths / 12).toFixed(2).replace(/\.?0+$/, '') + ' 岁（' + r.phase + '）。'
      : '出生时间早于该群体的延迟起点，仍按原法定 ' + r.baseAge + ' 岁退休。';

    setGrid(grid, [
      ['原法定退休年龄', r.baseAge + ' 岁'],
      ['延迟月数', r.delayMonths + ' 个月'],
      ['法定退休年龄', (r.retireAge + r.delayMonths / 12).toFixed(2) + ' 岁'],
      ['预计退休时间', fmtYm(r.retireDate)],
      ['距离退休', r.already ? '已到' : r.daysLeft + ' 天'],
      ['按月计', r.already ? '—' : r.monthsLeft + ' 个月']
    ]);

    // 进度条：从 22 岁工作起点算到退休，直观一点
    var workStart = 22;
    var ageNow = (new Date() - r.born) / (365.2425 * 86400000);
    var pct = Math.max(0, Math.min(1, (ageNow - workStart) / ((r.retireAge + r.delayMonths / 12) - workStart)));
    bars.innerHTML = '';
    bars.appendChild(bar('年龄进度', pct, 1, (ageNow < 0 ? 0 : ageNow).toFixed(1) + ' / ' + (r.retireAge + r.delayMonths / 12).toFixed(1) + ' 岁'));

    // 参考表：同性别不同出生的年龄对照
    var body = $('rt-body');
    body.innerHTML = '';
    var samples = [];
    for (var y = Math.max(1963, by - 3); y <= by + 6; y += 1) samples.push(y);
    samples.forEach(function (y) {
      var rr = retireCalc(y, bm, kind);
      var tr = document.createElement('tr');
      if (y === by) tr.className = 'on';
      var td1 = document.createElement('td'); td1.textContent = y + '-' + String(bm).padStart(2, '0');
      var td2 = document.createElement('td'); td2.textContent = rr.retireAge + ' 岁 + ' + rr.delayMonths + ' 个月';
      var td3 = document.createElement('td'); td3.className = 'range'; td3.textContent = fmtYm(rr.retireDate);
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      body.appendChild(tr);
    });
    return r;
  }

  function fmtYm(d) {
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月';
  }

  function fmtDur(days) {
    var y = Math.floor(days / 365.2425);
    var rest = Math.round(days - y * 365.2425);
    if (y >= 1) return y + ' 年 ' + rest + ' 天';
    return days + ' 天';
  }

  $('rt-run').addEventListener('click', rtRun);
  ['rt-birth', 'rt-sex', 'rt-type'].forEach(function (id) {
    $(id).addEventListener('change', rtRun);
  });
  $('rt-reset').addEventListener('click', function () {
    $('rt-birth').value = '1985-06-15';
    $('rt-sex').value = 'm';
    $('rt-type').value = 'worker';
    rtRun();
  });

  /* ================= 2.5 养老金测算 =================

     企业职工基本养老金按三块相加：

       基础养老金   = 退休时当地社平工资 ×(1 + 本人平均缴费指数) ÷ 2 × 缴费年限 × 1%
       个人账户养老金 = 个人账户余额 ÷ 计发月数
       过渡性养老金 = 视同缴费年限那部分（1990 年代统账结合前参加工作的人才有），本页不含

     计发月数按《城镇企业职工基本养老保险个人账户管理暂行办法》附表：
       45 岁 216、50 岁 195、55 岁 170、60 岁 139。
       退休年龄落在两档之间时线性插值——这是**近似**，附表实际是按整数年龄逐档给的。 */

  var PENSION_MONTHS = { 45: 216, 50: 195, 55: 170, 60: 139 };

  function pensionMonths(age) {
    if (PENSION_MONTHS[age]) return PENSION_MONTHS[age];
    var keys = Object.keys(PENSION_MONTHS).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length - 1; i++) {
      if (age > keys[i] && age < keys[i + 1]) {
        var t = (age - keys[i]) / (keys[i + 1] - keys[i]);
        return Math.round(PENSION_MONTHS[keys[i]] * (1 - t) + PENSION_MONTHS[keys[i + 1]] * t);
      }
    }
    return age >= 60 ? PENSION_MONTHS[60] : PENSION_MONTHS[45];
  }

  function pensionCalc(opts) {
    var avg = Number(opts.avg), growth = Number(opts.growth) / 100;
    var age = Number(opts.age), retireAge = Number(opts.retireAge);
    // index 是「本人平均缴费指数」，1.0 表示按社平工资缴费，不是百分数
    var acct = Number(opts.acct), years = Number(opts.years), index = Number(opts.index);
    if (!(avg > 0)) return { err: '社平工资需为正数。' };
    if (!(retireAge > age)) return { err: '退休年龄需大于当前年龄。' };
    if (!(years > 0)) return { err: '缴费年限需大于 0。' };
    var yearsLeft = retireAge - age;
    // 社平工资按年增长率复利到退休那年
    var avgAtRetire = avg * Math.pow(1 + growth, yearsLeft);
    var base = avgAtRetire * (1 + index) / 2 * years * 0.01;
    var months = pensionMonths(retireAge);
    var personal = acct / months;
    return {
      avgAtRetire: avgAtRetire, base: base, personal: personal,
      months: months, total: base + personal, yearsLeft: yearsLeft,
      replacement: base + personal > 0 ? (base + personal) / avgAtRetire : 0
    };
  }

  /* ================= 3. 国债利息 ================= */

  /* 电子式储蓄国债按年付息（单利，每年利息固定）；
     凭证式到期一次还本付息，同样按单利，但利息在到期时一次性给付。
     两者都不是复利——提前把利息再投资属于另行操作，本页不假设。 */
  function bondCalc(principal, ratePct, years, kind, taxPct) {
    var rate = ratePct / 100;
    var tax = (taxPct || 0) / 100;
    var perYear = principal * rate;
    var rows = [];
    var cumulative = 0;
    for (var y = 1; y <= years; y++) {
      var interest = perYear;
      var net = interest * (1 - tax);
      if (kind === 'certificate') {
        // 凭证式：到期才给，中途不产生现金流
        cumulative = perYear * y;
        rows.push({
          year: y, interest: y === years ? perYear * years : 0,
          cumulative: cumulative, end: y === years ? principal + cumulative * (1 - tax) : principal,
          note: y === years ? '到期一次还本付息' : '未付息'
        });
      } else {
        cumulative += net;
        rows.push({ year: y, interest: net, cumulative: cumulative, end: principal + net, note: '年度付息' });
      }
    }
    var totalInterest = kind === 'certificate' ? perYear * years * (1 - tax) : cumulative;
    return {
      principal: principal, rate: ratePct, years: years, kind: kind, tax: taxPct || 0,
      perYear: perYear, perYearNet: perYear * (1 - tax),
      totalInterest: totalInterest, totalInterestGross: perYear * years,
      totalTax: perYear * years - totalInterest,
      finalTotal: principal + totalInterest,
      rows: rows
    };
  }

  function bdRun() {
    var msg = $('bd-msg'), out = $('bd-out'), grid = $('bd-grid'), body = $('bd-body');
    var p = num($('bd-amount').value), rate = num($('bd-rate').value);
    var years = Math.round(num($('bd-years').value));
    if (!isFinite(p) || p <= 0) { msg.className = 'hint err'; msg.textContent = '本金要大于 0。'; return null; }
    if (!isFinite(rate) || rate < 0 || rate > 20) { msg.className = 'hint err'; msg.textContent = '年利率看起来不对（0 ~ 20%）。'; return null; }
    if (!isFinite(years) || years < 1 || years > 50) { msg.className = 'hint err'; msg.textContent = '持有期限要在 1 ~ 50 年。'; return null; }

    var r = bondCalc(p, rate, years, $('bd-kind').value, num($('bd-tax').value));
    msg.className = 'hint';
    msg.textContent = (r.kind === 'certificate'
      ? '凭证式：到期一次还本付息，中途不产生现金流。'
      : '电子式：每年付息一次，利息可另作他用（本页不假设再投资）。') +
      (r.tax ? '已按 ' + r.tax + '% 扣利息税。' : '储蓄国债利息免征个人所得税。');

    out.className = 'big';
    out.innerHTML = '到期可得 ' + money(r.finalTotal) + ' 元' +
      '<small>本金 ' + money(r.principal, 0) + ' 元，利息合计 ' + money(r.totalInterest) +
      ' 元' + (r.totalTax ? '（已扣税 ' + money(r.totalTax) + '）' : '') + '</small>';

    setGrid(grid, [
      ['年利率', rate.toFixed(2) + '%'],
      ['每年利息', money(r.perYearNet) + ' 元'],
      ['持有期限', years + ' 年'],
      ['利息合计', money(r.totalInterest) + ' 元'],
      ['本息合计', money(r.finalTotal) + ' 元'],
      ['折合年均收益率', ((r.totalInterest / r.principal / years) * 100).toFixed(3) + '%']
    ]);

    body.innerHTML = '';
    r.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      [String(row.year), row.interest ? money(row.interest) : '—',
       money(row.cumulative), money(row.end)].forEach(function (v, i) {
        var td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return r;
  }

  $('pn-run').addEventListener('click', pnRun);
  ['pn-avg', 'pn-growth', 'pn-age', 'pn-retire', 'pn-years', 'pn-index', 'pn-acct'].forEach(function (id) {
    $(id).addEventListener('input', pnRun);
    $(id).addEventListener('change', pnRun);
  });
  $('pn-reset').addEventListener('click', function () {
    $('pn-avg').value = '8000'; $('pn-growth').value = '3'; $('pn-age').value = '40';
    $('pn-retire').value = '60'; $('pn-years').value = '35'; $('pn-index').value = '1';
    $('pn-acct').value = '200000';
    pnRun();
  });

  $('bd-run').addEventListener('click', bdRun);
  ['bd-amount', 'bd-rate', 'bd-years', 'bd-kind', 'bd-tax'].forEach(function (id) {
    $(id).addEventListener('input', bdRun);
    $(id).addEventListener('change', bdRun);
  });
  $('bd-reset').addEventListener('click', function () {
    $('bd-amount').value = '100000';
    $('bd-rate').value = '2.38';
    $('bd-years').value = '3';
    $('bd-kind').value = 'electronic';
    $('bd-tax').value = '0';
    bdRun();
  });

  /* ================= 养老金界面 ================= */

  function pnRun() {
    var msg = $('pn-msg'), out = $('pn-out'), grid = $('pn-grid'), fml = $('pn-formula');
    var r = pensionCalc({
      avg: $('pn-avg').value, growth: $('pn-growth').value,
      age: $('pn-age').value, retireAge: $('pn-retire').value,
      years: $('pn-years').value, index: $('pn-index').value,
      acct: $('pn-acct').value
    });
    if (r.err) {
      msg.className = 'hint err';
      msg.textContent = r.err;
      out.textContent = ''; grid.innerHTML = ''; fml.innerHTML = '';
      return r;
    }
    msg.className = 'hint';
    msg.textContent = '退休时社平工资按年增长 ' + $('pn-growth').value + '% 复利折算为 ' +
      money(r.avgAtRetire) + ' 元/月。不含过渡性养老金与个人账户后续计息。';
    out.className = 'big';
    out.innerHTML = '每月约 ' + money(r.total) + ' 元' +
      '<small>基础 ' + money(r.base) + ' + 个人账户 ' + money(r.personal) +
      ' · 替代率约 ' + (r.replacement * 100).toFixed(1) + '%</small>';

    setGrid(grid, [
      ['退休时社平工资', money(r.avgAtRetire) + ' 元'],
      ['基础养老金', money(r.base) + ' 元'],
      ['个人账户养老金', money(r.personal) + ' 元'],
      ['计发月数', r.months + ' 个月'],
      ['合计（月）', money(r.total) + ' 元'],
      ['合计（年）', money(r.total * 12) + ' 元']
    ]);

    fml.innerHTML = '<span class="t">计算过程</span><br>' +
      '退休时社平 = ' + money(Number($('pn-avg').value)) + ' ×(1 + ' + $('pn-growth').value + '%)^' +
      r.yearsLeft + ' = ' + money(r.avgAtRetire) + ' 元<br>' +
      '基础养老金 = ' + money(r.avgAtRetire) + ' ×(1 + ' + $('pn-index').value + ') ÷ 2 × ' +
      $('pn-years').value + ' × 1% = ' + money(r.base) + ' 元<br>' +
      '个人账户养老金 = ' + money(Number($('pn-acct').value)) + ' ÷ ' + r.months + ' = ' +
      money(r.personal) + ' 元';
    return r;
  }

  /* ================= 页签与初始化 ================= */

  var PANELS = ['fuel', 'retire', 'pension', 'bond'];
  function setTab(name) {
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);

  fuBuildFields();
  fuRun();
  rtRun();
  pnRun();
  bdRun();
  setTab('fuel');

  window.__life2 = {
    fuelConsumption: fuelConsumption, FU_FORMS: FU_FORMS,
    retireCalc: retireCalc, delayMonths: delayMonths,
    RETIRE_START: RETIRE_START, RETIRE_START_F55: RETIRE_START_F55, RETIRE_START_F50: RETIRE_START_F50,
    bondCalc: bondCalc, pensionCalc: pensionCalc, pensionMonths: pensionMonths,
    PENSION_MONTHS: PENSION_MONTHS, money: money, fmtDur: fmtDur
  };
})();

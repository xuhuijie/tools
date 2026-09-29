/* 健康计算：eGFR、胎儿体重、预产期、BMI 与尺码

   公式都写在页面里，页面上标明出处与口径；这些是估算值，不能替代诊断。 */
(function () {
  'use strict';
  var $ = T.$;

  function num(id, def) {
    var n = Number($(id).value);
    return isFinite(n) ? n : (def == null ? NaN : def);
  }
  function r1(n) { return isFinite(n) ? Number(n.toFixed(1)) : NaN; }
  function r2(n) { return isFinite(n) ? Number(n.toFixed(2)) : NaN; }

  /* ---------- eGFR（CKD-EPI 2009）----------
     Scr 单位 mg/dL。女性 Scr>0.7 用 -1.209，否则 -0.329；
     男性 Scr>0.9 用 -1.209，否则 -0.411。 */
  function egfr(age, scrUmol, sex) {
    if (!(age > 0) || !(scrUmol > 0)) return { err: '年龄与血清肌酐需为正数。' };
    var scr = scrUmol / 88.4;
    var k = sex === 'f' ? 0.7 : 0.9;
    var a = sex === 'f' ? -0.329 : -0.411;
    var coef = sex === 'f' ? 144 : 141;
    var exp = scr <= k ? a : -1.209;
    var val = coef * Math.pow(scr / k, exp) * Math.pow(0.993, age);
    return { value: val, scr: scr, k: k, exp: exp, coef: coef };
  }

  function ckdStage(v) {
    if (v >= 90) return ['1 期', '肾功能正常', '有肾损伤标志（如蛋白尿）时才算 1 期，单看 eGFR 正常'];
    if (v >= 60) return ['2 期', '轻度下降', '多数人无症状，建议每年复查'];
    if (v >= 30) return ['3 期', '中度下降', '3a(45~59) 与 3b(30~44) 分开看，需专科随访'];
    if (v >= 15) return ['4 期', '重度下降', '需肾内科管理，准备肾脏替代治疗评估'];
    return ['5 期', '肾衰竭', '尿毒症期，需透析或移植评估'];
  }

  /* ---------- 胎儿体重（Hadlock）----------
     体重(g) = 10^(1.3596 + 0.0064·HC + 0.0424·AC + 0.174·FL − 0.00335·AC·FL)
     本页无 HC 输入，按 HC ≈ BPD × π 估算。 */
  function fetalWeight(bpd, ac, fl) {
    if (!(bpd > 0) || !(ac > 0) || !(fl > 0)) return { err: 'BPD、AC、FL 都需为正数。' };
    var hc = bpd * Math.PI;
    var expPart = 1.3596 + 0.0064 * hc + 0.0424 * ac + 0.174 * fl - 0.00335 * ac * fl;
    var g = Math.pow(10, expPart);
    return { grams: g, hc: hc, expPart: expPart };
  }

  /* ---------- 预产期（内格勒法则）---------- */
  function dueDate(lmpStr, cycle) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(lmpStr || ''));
    if (!m) return { err: '请选择末次月经首日。' };
    var lmp = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(lmp.getTime())) return { err: '日期无法识别。' };
    var cyc = isFinite(cycle) && cycle > 0 ? cycle : 28;
    var days = 280 + (cyc - 28);
    var due = new Date(lmp.getTime() + days * 86400000);
    var today = new Date();
    var today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var elapsed = Math.floor((today0 - lmp) / 86400000);
    return { due: due, lmp: lmp, days: days, elapsed: elapsed, cycle: cyc };
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- BMI 与标准体重 ---------- */
  function bmiCalc(h, w) {
    if (!(h > 0) || !(w > 0)) return { err: '身高与体重都需为正数。' };
    var m = h / 100;
    var bmi = w / (m * m);
    var cat = bmi < 18.5 ? ['偏瘦', '注意营养，必要时查甲状腺与消化系统']
      : bmi < 24 ? ['正常', '保持规律作息与运动即可']
      : bmi < 28 ? ['超重', '建议控制总热量，每周 150 分钟中等强度运动']
      : ['肥胖', '建议在内分泌或营养科指导下减重'];
    var standard = h - 105;
    return {
      bmi: bmi, cat: cat, standard: standard,
      lo: 18.5 * m * m, hi: 23.9 * m * m,
      diff: w - standard
    };
  }

  /* ---------- 内衣尺码 ---------- */
  var CUP_STEPS = [7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5];
  var CUP_NAMES = ['AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  var UNDER_STEPS = [65, 70, 75, 80, 85, 90, 95, 100, 105, 110];

  function braSize(under, over) {
    if (!(under > 0) || !(over > 0)) return { err: '上下胸围都需为正数。' };
    if (over <= under) return { err: '上胸围应大于下胸围，请检查输入。' };
    var diff = over - under;
    var cup = -1;
    for (var i = 0; i < CUP_STEPS.length; i++) {
      // 每档取中点判断，7.5 及以下算 AA
      if (diff < CUP_STEPS[i] + 1.25) { cup = i; break; }
    }
    if (cup < 0) cup = CUP_NAMES.length - 1;
    var base = UNDER_STEPS[0];
    var best = Infinity;
    UNDER_STEPS.forEach(function (u) {
      var d = Math.abs(u - under);
      if (d < best) { best = d; base = u; }
    });
    // 亚洲码 = 下围 + 罩杯；欧美码把下围换算成英寸再加 4
    var us = Math.round(under / 2.54) + 4;
    return {
      cup: CUP_NAMES[cup], diff: r1(diff), base: base,
      code: base + CUP_NAMES[cup], us: us + CUP_NAMES[cup]
    };
  }

  /* ---------- 渲染 ---------- */
  function seg(id, cb) {
    var box = $(id);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      [].forEach.call(box.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
      cb(b.dataset);
    });
  }
  function sexOf(id) {
    var on = $(id).querySelector('button.on');
    return on ? on.dataset.sex : 'm';
  }
  function showErr(id, msg) {
    var el = $(id);
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  /* eGFR */
  function runEgfr() {
    var r = egfr(num('eg-age'), num('eg-scr'), sexOf('eg-sex'));
    if (r.err) { $('eg-big').textContent = '—'; $('eg-out').innerHTML = ''; showErr('eg-note', r.err); return; }
    showErr('eg-note', '');
    $('eg-big').innerHTML = r1(r.value) + ' <small>mL/min/1.73m²</small>';
    var st = ckdStage(r.value);
    T.cells($('eg-out'), [
      ['eGFR', r1(r.value) + ' mL/min/1.73m²'],
      ['肌酐（mg/dL）', r2(r.scr)],
      ['CKD 分期', st[0] + ' · ' + st[1]]
    ]);
    $('eg-stage').innerHTML = '';
    [['≥ 90', '1 期'], ['60~89', '2 期'], ['30~59', '3 期'], ['15~29', '4 期'], ['< 15', '5 期']].forEach(function (s) {
      var n = document.createElement('div'); n.className = 'n'; n.textContent = s[0];
      var v = document.createElement('div');
      v.textContent = s[1];
      v.className = st[0].indexOf(s[1].charAt(0)) === 0 ? 'on' : '';
      $('eg-stage').appendChild(n); $('eg-stage').appendChild(v);
    });
    $('eg-note').className = 'note';
    $('eg-note').innerHTML = '<b>说明</b>　CKD-EPI 2009 公式适用于 18 岁以上成人，<b>孕期、儿童、极端肌肉量人群不适用</b>。' +
      'eGFR 是估计值，实际肾功能还要结合尿蛋白、影像与病史判断。' + st[2] + '。';
  }

  /* 胎儿体重 */
  function runFetal() {
    var r = fetalWeight(num('ft-bpd'), num('ft-ac'), num('ft-fl'));
    if (r.err) { $('ft-big').textContent = '—'; $('ft-out').innerHTML = ''; $('ft-formula').textContent = ''; showErr('ft-note', r.err); return; }
    showErr('ft-note', '');
    var g = r.grams;
    $('ft-big').innerHTML = (g / 1000).toFixed(2) + ' <small>kg（' + Math.round(g) + ' g）</small>';
    T.cells($('ft-out'), [
      ['估算体重', Math.round(g) + ' g'],
      ['折合市斤', (g / 500).toFixed(2) + ' 斤'],
      ['估算头围 HC', r2(r.hc) + ' cm'],
      ['体重区间（±10%）', Math.round(g * 0.9) + ' ~ ' + Math.round(g * 1.1) + ' g']
    ]);
    $('ft-formula').innerHTML = '<span class="t">Hadlock 公式</span><br>' +
      '<code>体重(g) = 10^(1.3596 + 0.0064·HC + 0.0424·AC + 0.174·FL − 0.00335·AC·FL)</code><br>' +
      '代入：HC ≈ BPD ' + $('ft-bpd').value + ' × π = ' + r2(r.hc) + '，AC = ' + $('ft-ac').value + '，FL = ' + $('ft-fl').value + '<br>' +
      '指数 = ' + r.expPart.toFixed(4) + ' → 10^指数 = ' + Math.round(g) + ' g';
    $('ft-note').className = 'note';
    $('ft-note').innerHTML = '<b>说明</b>　胎儿体重公式误差可达 ±10%~15%，受胎位、羊水与测量手法影响。' +
      'HC 这里按 BPD × π 估算，若超声报告给了实测头围，建议用实测值另算。结果仅供产检参考。';
  }

  /* 预产期 */
  function runDue() {
    var r = dueDate($('du-lmp').value, num('du-cycle'));
    if (r.err) { $('du-big').textContent = '—'; $('du-out').innerHTML = ''; showErr('du-note', r.err); return; }
    showErr('du-note', '');
    $('du-big').innerHTML = fmtDate(r.due) + ' <small>预产期</small>';
    var weeks = Math.floor(r.elapsed / 7);
    var days = r.elapsed % 7;
    var left = Math.ceil((r.due - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000);
    T.cells($('du-out'), [
      ['预产期', fmtDate(r.due)],
      ['孕周（截至今天）', weeks + ' 周 ' + days + ' 天'],
      ['距预产期', left >= 0 ? left + ' 天' : '已超 ' + (-left) + ' 天'],
      ['妊娠总天数', r.days + ' 天']
    ]);
    $('du-note').className = 'note';
    $('du-note').innerHTML = '<b>说明</b>　内格勒法则：末次月经首日 + 280 天，周期不是 28 天时按差值校正（本页用了 ' +
      r.cycle + ' 天周期，共 ' + r.days + ' 天）。实际分娩在预产期前后 2 周内都算正常范围，' +
      '37 周前为早产、42 周后为过期妊娠，都要就医评估。';
  }

  /* BMI 与尺码 */
  function runWeight() {
    var r = bmiCalc(num('wt-h'), num('wt-w'));
    if (r.err) { $('wt-big').textContent = '—'; $('wt-out').innerHTML = ''; showErr('wt-stage', r.err); return; }
    showErr('wt-stage', '');
    $('wt-big').innerHTML = r2(r.bmi) + ' <small>' + r.cat[0] + '</small>';
    T.cells($('wt-out'), [
      ['BMI', r2(r.bmi)],
      ['判定', r.cat[0]],
      ['标准体重（身高−105）', r1(r.standard) + ' kg'],
      ['健康体重区间', r1(r.lo) + ' ~ ' + r1(r.hi) + ' kg'],
      ['与标准体重之差', (r.diff >= 0 ? '+' : '') + r1(r.diff) + ' kg']
    ]);
    $('wt-stage').innerHTML = '';
    [['< 18.5', '偏瘦'], ['18.5~23.9', '正常'], ['24~27.9', '超重'], ['≥ 28', '肥胖']].forEach(function (s) {
      var n = document.createElement('div'); n.className = 'n'; n.textContent = s[0];
      var v = document.createElement('div'); v.textContent = s[1];
      v.className = s[1] === r.cat[0] ? 'on' : '';
      $('wt-stage').appendChild(n); $('wt-stage').appendChild(v);
    });
    return r;
  }

  function runBra() {
    var r = braSize(num('br-under'), num('br-over'));
    if (r.err) { $('br-big').textContent = '—'; $('br-out').innerHTML = ''; showErr('br-note', r.err); return; }
    showErr('br-note', '');
    $('br-big').innerHTML = r.code + ' <small>文胸尺码</small>';
    T.cells($('br-out'), [
      ['下围基准', r.base + '（70/75/80…）'],
      ['上下胸围差', r.diff + ' cm'],
      ['罩杯', r.cup],
      ['欧美码（参考）', r.us]
    ]);
    $('br-note').className = 'note';
    $('br-note').innerHTML = '<b>说明</b>　罩杯按上下胸围差每 2.5cm 一档：AA 7.5、A 10、B 12.5、C 15、D 17.5 起。' +
      '下围取 70/75/80… 的最近档。不同品牌版型差异较大，建议以试穿为准，量取时保持自然呼吸、软尺水平。';
  }

  /* 绑定 */
  seg('eg-sex', runEgfr);
  seg('wt-sex', runWeight);
  ['eg-age', 'eg-scr'].forEach(function (id) { $(id).addEventListener('input', runEgfr); });
  ['ft-bpd', 'ft-ac', 'ft-fl'].forEach(function (id) { $(id).addEventListener('input', runFetal); });
  ['du-lmp', 'du-cycle'].forEach(function (id) { $(id).addEventListener('input', runDue); });
  ['wt-h', 'wt-w'].forEach(function (id) { $(id).addEventListener('input', runWeight); });
  ['br-under', 'br-over'].forEach(function (id) { $(id).addEventListener('input', runBra); });
  $('eg-run').addEventListener('click', runEgfr);
  $('ft-run').addEventListener('click', runFetal);
  $('du-run').addEventListener('click', runDue);
  $('wt-run').addEventListener('click', runWeight);
  $('br-run').addEventListener('click', runBra);
  $('eg-reset').addEventListener('click', function () { $('eg-age').value = '45'; $('eg-scr').value = '88.4'; runEgfr(); });
  $('ft-reset').addEventListener('click', function () { $('ft-bpd').value = '8.5'; $('ft-ac').value = '30'; $('ft-fl').value = '6.5'; runFetal(); });
  $('du-reset').addEventListener('click', function () { $('du-cycle').value = '28'; runDue(); });
  $('wt-reset').addEventListener('click', function () { $('wt-h').value = '170'; $('wt-w').value = '65'; runWeight(); });
  $('br-reset').addEventListener('click', function () { $('br-under').value = '75'; $('br-over').value = '88'; runBra(); });

  T.tabs($('tabs'), function (name) {
    ['egfr', 'fetal', 'due', 'weight'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
    if (name === 'egfr') runEgfr();
    if (name === 'fetal') runFetal();
    if (name === 'due') runDue();
    if (name === 'weight') { runWeight(); runBra(); }
  });

  // 预产期默认取三个月前，便于打开即见效果
  (function () {
    var d = new Date(Date.now() - 90 * 86400000);
    $('du-lmp').value = fmtDate(d);
  })();
  runEgfr(); runFetal(); runDue(); runWeight(); runBra();

  window.__health = {
    egfr: egfr, ckdStage: ckdStage, fetalWeight: fetalWeight, dueDate: dueDate,
    bmiCalc: bmiCalc, braSize: braSize, fmtDate: fmtDate
  };
})();

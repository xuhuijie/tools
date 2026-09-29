/* 互动小工具：舒尔特方格、反应速度、CPS 手速、计数器

   计时一律用 performance.now() 差值，不靠 tick 累加，切到后台回来仍然准。 */
(function () {
  'use strict';
  var $ = T.$;
  var now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };

  function pad(n, w) { return String(n).padStart(w == null ? 2 : w, '0'); }
  function fmtTime(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    var m = Math.floor(ms / 60000);
    var s = Math.floor(ms % 60000 / 1000);
    var t = Math.floor(ms % 1000 / 10);
    return pad(m) + ':' + pad(s) + '.' + pad(t);
  }
  function segVal(id, key, def) {
    var on = $(id).querySelector('button.on');
    return on ? on.dataset[key] : def;
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------- 1. 舒尔特方格 ---------- */
  var sc = { n: 5, next: 1, running: false, startAt: 0, timer: 0, errors: 0, best: {} };

  function buildSchulte() {
    sc.n = Number(segVal('sc-size', 'n', '5'));
    sc.next = 1;
    sc.running = false;
    sc.startAt = 0;
    sc.errors = 0;
    clearInterval(sc.timer);
    $('sc-time').textContent = '00:00.00';
    $('sc-out').innerHTML = '';
    var grid = $('sc-grid');
    grid.style.gridTemplateColumns = 'repeat(' + sc.n + ', 1fr)';
    grid.innerHTML = '';
    var nums = [];
    for (var i = 1; i <= sc.n * sc.n; i++) nums.push(i);
    shuffle(nums);
    nums.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = v;
      b.dataset.v = v;
      b.addEventListener('click', function () { pickSchulte(v, b); });
      grid.appendChild(b);
    });
    renderSchulteNote();
  }

  function renderSchulteNote() {
    var total = sc.n * sc.n;
    var best = sc.best[sc.n];
    var ref = sc.n <= 5 ? '5×5 成年人数值：20~25 秒优秀，26~35 秒良好，36~45 秒中等，超过 45 秒可多练练'
      : sc.n === 6 ? '6×6 成年人：25~35 秒优秀，36~45 秒良好，46~55 秒中等，超过 55 秒需多练习'
      : '7×7 及以上以稳定完成、少点错为先，时间只做纵向对比';
    $('sc-note').innerHTML = '<b>说明</b>　按 1 → ' + total + ' 的顺序点数字，点错会计入错误次数但不中断。' +
      ref + '。' + (best ? '你在这个尺寸的最好成绩：<b>' + fmtTime(best) + '</b>。' : '');
  }

  function pickSchulte(v, btn) {
    if (v !== sc.next) {
      if (sc.running) sc.errors++;
      btn.style.borderColor = 'var(--warn)';
      setTimeout(function () { btn.style.borderColor = ''; }, 260);
      return;
    }
    if (v === 1) {
      if (!sc.running) { sc.running = true; sc.startAt = now(); startSchulteTimer(); }
    }
    btn.classList.add('done');
    sc.next++;
    if (sc.next > sc.n * sc.n) finishSchulte();
  }

  function startSchulteTimer() {
    clearInterval(sc.timer);
    sc.timer = setInterval(function () {
      $('sc-time').textContent = fmtTime(now() - sc.startAt);
    }, 40);
  }

  function finishSchulte() {
    clearInterval(sc.timer);
    sc.running = false;
    var ms = now() - sc.startAt;
    $('sc-time').textContent = fmtTime(ms);
    if (!sc.best[sc.n] || ms < sc.best[sc.n]) sc.best[sc.n] = ms;
    T.cells($('sc-out'), [
      ['用时', fmtTime(ms)],
      ['尺寸', sc.n + '×' + sc.n + '（' + (sc.n * sc.n) + ' 格）'],
      ['错误次数', String(sc.errors)],
      ['历史最好', fmtTime(sc.best[sc.n])]
    ]);
    renderSchulteNote();
  }

  /* ---------- 2. 反应速度 ---------- */
  var re = { state: 'idle', timer: 0, startAt: 0, hist: [] };

  function reSet(state, text, cls) {
    re.state = state;
    var box = $('re-box');
    box.className = 'react ' + cls;
    box.textContent = text;
  }

  function reStart() {
    clearTimeout(re.timer);
    reSet('wait', '等变绿…', 'wait');
    re.timer = setTimeout(function () {
      re.startAt = now();
      reSet('go', '点！', 'go');
    }, 1200 + Math.random() * 2800);
  }

  function reClick() {
    if (re.state === 'idle' || re.state === 'done' || re.state === 'early') { reStart(); return; }
    if (re.state === 'wait') {
      clearTimeout(re.timer);
      reSet('early', '抢了点，重来', 'wait');
      setTimeout(reStart, 700);
      return;
    }
    var ms = now() - re.startAt;
    re.hist.push(ms);
    if (re.hist.length > 8) re.hist.shift();
    var avg = re.hist.reduce(function (a, b) { return a + b; }, 0) / re.hist.length;
    var best = Math.min.apply(null, re.hist);
    T.cells($('re-out'), [
      ['本次反应', Math.round(ms) + ' ms'],
      ['平均（近 ' + re.hist.length + ' 次）', Math.round(avg) + ' ms'],
      ['最快', Math.round(best) + ' ms'],
      ['水平', ms < 150 ? '职业玩家水平' : ms < 200 ? '反应很快' : ms < 250 ? '成年人平均水平' : '偏慢，可多练']
    ]);
    var hist = $('re-hist');
    hist.innerHTML = '';
    re.hist.forEach(function (v) {
      var s = document.createElement('span');
      s.textContent = Math.round(v) + ' ms';
      hist.appendChild(s);
    });
    reSet('done', '本次 ' + Math.round(ms) + ' ms，点一下再来', 'idle');
    $('re-note').innerHTML = '<b>说明</b>　成年人的平均视觉反应时间在 200~250 ms，职业电竞选手常在 100~150 ms。' +
      '反应速度受遗传、睡眠与注意力影响，单次结果波动大，看多次平均更有意义。';
  }

  /* ---------- 3. CPS ---------- */
  var cp = { state: 'idle', clicks: 0, startAt: 0, duration: 10000, timer: 0, ticker: 0 };

  function cpSet(text) { $('cp-box').textContent = text; }

  function cpStart() {
    clearTimeout(cp.timer); clearInterval(cp.ticker);
    cp.state = 'run';
    cp.clicks = 0;
    cp.startAt = now();
    $('cp-box').className = 'react go';
    cpSet('快点！0 次');
    cp.ticker = setInterval(function () {
      var left = Math.max(0, cp.duration - (now() - cp.startAt));
      cpSet(cp.clicks + ' 次 · 还剩 ' + (left / 1000).toFixed(1) + ' 秒');
    }, 50);
    cp.timer = setTimeout(cpFinish, cp.duration);
  }

  function cpClick() {
    if (cp.state === 'idle' || cp.state === 'done') { cpStart(); return; }
    cp.clicks++;
  }

  function cpFinish() {
    clearTimeout(cp.timer); clearInterval(cp.ticker);
    cp.state = 'done';
    var sec = cp.duration / 1000;
    var cps = cp.clicks / sec;
    $('cp-box').className = 'react idle';
    cpSet('结果：' + cps.toFixed(2) + ' CPS（点一下再来）');
    T.cells($('cp-out'), [
      ['总点击', cp.clicks + ' 次'],
      ['时长', sec + ' 秒'],
      ['CPS', cps.toFixed(2)],
      ['评级', cps < 3 ? '偏慢' : cps < 5 ? '普通' : cps < 7 ? '较快' : cps < 9 ? '很快' : '职业级']
    ]);
    $('cp-note').innerHTML = '<b>说明</b>　CPS（Clicks Per Second）是每秒点击次数，10 秒测试取平均。' +
      '普通用户多在 3~6，游戏玩家 6~9，职业选手可到 10 以上。鼠标、触屏与浏览器节流都会影响结果，横向比较意义有限。';
  }

  /* ---------- 4. 计数器 ---------- */
  var ct = { value: 0, logs: [] };

  function ctRender() {
    $('ct-num').textContent = ct.value.toLocaleString('zh-CN');
    $('ct-log').textContent = ct.logs.map(function (v, i) { return '第 ' + (i + 1) + ' 笔：' + v.toLocaleString('zh-CN'); }).join('\n');
  }
  function ctStep() {
    var s = Number($('ct-step').value);
    return isFinite(s) && s !== 0 ? s : 1;
  }
  function ctBump(dir) {
    ct.value += dir * ctStep();
    ctRender();
    var t = Number($('ct-target').value);
    if (isFinite(t) && t > 0 && dir > 0 && ct.value >= t) {
      $('ct-num').style.color = 'var(--ok)';
      setTimeout(function () { $('ct-num').style.color = ''; }, 700);
    }
  }

  /* ---------- 绑定 ---------- */
  T.$('sc-size').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    buildSchulte();
  });
  $('sc-restart').addEventListener('click', buildSchulte);
  $('sc-start').addEventListener('click', function () {
    if (sc.running) return;
    sc.next = 1;
    sc.errors = 0;
    [].forEach.call($('sc-grid').querySelectorAll('button'), function (b) { b.classList.remove('done'); });
    sc.running = true;
    sc.startAt = now();
    startSchulteTimer();
  });

  $('re-box').addEventListener('click', reClick);
  $('cp-box').addEventListener('click', cpClick);
  $('ct-inc').addEventListener('click', function () { ctBump(1); });
  $('ct-dec').addEventListener('click', function () { ctBump(-1); });
  $('ct-reset').addEventListener('click', function () { ct.value = 0; ctRender(); });
  $('ct-rec').addEventListener('click', function () { ct.logs.push(ct.value); ctRender(); });
  T.bindCopy($('ct-copy'), function () { return $('ct-log').textContent; });
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space') return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!T.$('panel-counter').hidden) { e.preventDefault(); ctBump(1); }
  });
  ['ct-step', 'ct-target'].forEach(function (id) { $(id).addEventListener('input', ctRender); });

  T.tabs($('tabs'), function (name) {
    ['schulte', 'react', 'cps', 'counter'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
    if (name === 'schulte') buildSchulte();
    if (name === 'counter') ctRender();
  });

  buildSchulte();
  ctRender();

  window.__fun = {
    fmtTime: fmtTime, shuffle: shuffle, PAD: pad
  };
})();

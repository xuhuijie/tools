/* 小游戏与趣味测试：数独 / 舒尔特方格 / 反应速度 / CPS / 计数器 / 猜数字 / 种子转磁力
   数独生成走「随机终盘 + 挖洞 + 唯一解回验」，种子解析自己实现 bencode 与 SHA-1。
   全部离线，不联网。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ========== 通用：可复现随机数 ========== */

  // 用 xorshift32 而不是 Math.random，便于测试时用固定种子复现
  function rng(seed) {
    var s = (seed >>> 0) || 88172645;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ========== 1. 数独 ========== */

  function emptyGrid() {
    var g = [];
    for (var i = 0; i < 9; i++) g.push([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    return g;
  }

  function canPlace(g, r, c, v) {
    for (var i = 0; i < 9; i++) {
      if (g[r][i] === v) return false;
      if (g[i][c] === v) return false;
    }
    var br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) if (g[br + y][bc + x] === v) return false;
    return true;
  }

  // 从空白盘用回溯填出一个完整终盘
  function solveFill(g, rand, pos) {
    pos = pos || 0;
    if (pos === 81) return true;
    var r = Math.floor(pos / 9), c = pos % 9;
    var order = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
    for (var i = 0; i < 9; i++) {
      var v = order[i];
      if (!canPlace(g, r, c, v)) continue;
      g[r][c] = v;
      if (solveFill(g, rand, pos + 1)) return true;
      g[r][c] = 0;
    }
    return false;
  }

  // 数解个数（最多数到 limit 个就够了，用于唯一性判定）
  function countSolutions(g, limit) {
    var best = null, bestR = -1, bestC = -1, bestN = 10;
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (g[r][c] !== 0) continue;
        var used = [], n = 0;
        for (var v = 1; v <= 9; v++) if (canPlace(g, r, c, v)) { used.push(v); n++; }
        if (n === 0) return 0;
        if (n < bestN) { bestN = n; bestR = r; bestC = c; best = used; if (n === 1) { r = 9; break; } }
      }
    }
    if (best === null) return 1;
    var total = 0;
    for (var i = 0; i < best.length; i++) {
      g[bestR][bestC] = best[i];
      total += countSolutions(g, limit - total);
      g[bestR][bestC] = 0;
      if (total >= limit) break;
    }
    return total;
  }

  // 难度 → 目标提示数。挖洞从目标提示数反推要挖掉多少格。
  var SUDOKU_LEVELS = {
    easy: { clues: 42, label: '简单' },
    mid: { clues: 34, label: '中等' },
    hard: { clues: 29, label: '困难' },
    expert: { clues: 24, label: '专家' }
  };

  function sudokuGenerate(level, seed) {
    var cfg = SUDOKU_LEVELS[level] || SUDOKU_LEVELS.mid;
    var rand = rng(seed || (Date.now() & 0x7fffffff));
    var full = emptyGrid();
    solveFill(full, rand);
    var puzzle = full.map(function (row) { return row.slice(); });

    var cells = [];
    for (var i = 0; i < 81; i++) cells.push(i);
    shuffle(cells, rand);

    var clues = 81;
    for (var k = 0; k < cells.length && clues > cfg.clues; k++) {
      var p = cells[k], r = Math.floor(p / 9), c = p % 9;
      var backup = puzzle[r][c];
      if (backup === 0) continue;
      puzzle[r][c] = 0;
      // 挖掉后若解不唯一就填回去，保证题目只有唯一解
      if (countSolutions(puzzle.map(function (row) { return row.slice(); }), 2) !== 1) {
        puzzle[r][c] = backup;
      } else {
        clues--;
      }
    }

    return { puzzle: puzzle, solution: full, clues: clues, level: cfg.label };
  }

  var skState = null;

  function skRender() {
    var grid = $('sk-grid');
    grid.innerHTML = '';
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = 'numeric';
        inp.maxLength = 1;
        inp.dataset.r = String(r);
        inp.dataset.c = String(c);
        inp.className = skState.puzzle[r][c] ? 'given' : '';
        inp.value = skState.puzzle[r][c] ? String(skState.puzzle[r][c]) : '';
        if (skState.puzzle[r][c]) inp.readOnly = true;
        grid.appendChild(inp);
      }
    }
  }

  function skStat() {
    var grid = $('sk-stat');
    grid.innerHTML = '';
    var filled = 0, wrong = 0;
    var inputs = $('sk-grid').querySelectorAll('input');
    [].forEach.call(inputs, function (inp) {
      var v = Number(inp.value);
      if (v >= 1 && v <= 9) {
        filled++;
        if (!inp.readOnly && v !== skState.solution[Number(inp.dataset.r)][Number(inp.dataset.c)]) wrong++;
      }
    });
    grid.appendChild(cell('难度', skState.level));
    grid.appendChild(cell('提示数', skState.clues + ' / 81'));
    grid.appendChild(cell('已填', filled + ' / 81'));
    grid.appendChild(cell('已填错', wrong ? wrong + ' 格' : '无'));
    return { filled: filled, wrong: wrong };
  }

  function skNew(level) {
    $('sk-msg').className = 'hint';
    $('sk-msg').textContent = '正在生成题目…';
    // 生成要大几十毫秒，先让提示画出来再算
    setTimeout(function () {
      var t0 = Date.now();
      skState = sudokuGenerate(level || $('sk-level').value);
      skRender();
      skStat();
      $('sk-msg').className = 'hint';
      $('sk-msg').textContent = '题目已生成（' + (Date.now() - t0) + ' ms），唯一解。开始填吧。';
    }, 20);
  }

  $('sk-new').addEventListener('click', function () { skNew(); });
  $('sk-level').addEventListener('change', function () { skNew(); });
  $('sk-clear').addEventListener('click', function () {
    if (!skState) return;
    var inputs = $('sk-grid').querySelectorAll('input');
    [].forEach.call(inputs, function (inp) { if (!inp.readOnly) { inp.value = ''; inp.className = ''; } });
    skStat();
  });
  $('sk-check').addEventListener('click', function () {
    if (!skState) return;
    var inputs = $('sk-grid').querySelectorAll('input');
    var empty = 0, wrong = 0;
    [].forEach.call(inputs, function (inp) {
      var r = Number(inp.dataset.r), c = Number(inp.dataset.c);
      var v = Number(inp.value);
      inp.className = inp.readOnly ? 'given' : '';
      if (!inp.readOnly) {
        if (!v) { empty++; return; }
        if (v !== skState.solution[r][c]) { inp.className = 'bad'; wrong++; }
      }
    });
    var msg = $('sk-msg');
    if (wrong) { msg.className = 'hint err'; msg.textContent = '有 ' + wrong + ' 格填错了（已标红）。'; }
    else if (empty) { msg.className = 'hint'; msg.textContent = '目前都对，还差 ' + empty + ' 格。'; }
    else { msg.className = 'hint'; msg.textContent = '全部正确，完成！'; }
    skStat();
  });
  $('sk-hint').addEventListener('click', function () {
    if (!skState) return;
    var inputs = $('sk-grid').querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (inp.readOnly) continue;
      var r = Number(inp.dataset.r), c = Number(inp.dataset.c);
      if (Number(inp.value) !== skState.solution[r][c]) {
        inp.value = String(skState.solution[r][c]);
        inp.className = '';
        skStat();
        $('sk-msg').className = 'hint';
        $('sk-msg').textContent = '已提示第 ' + (r + 1) + ' 行第 ' + (c + 1) + ' 列。';
        return;
      }
    }
    $('sk-msg').textContent = '没有需要提示的格子了。';
  });
  $('sk-solve').addEventListener('click', function () {
    if (!skState) return;
    var inputs = $('sk-grid').querySelectorAll('input');
    [].forEach.call(inputs, function (inp) {
      var r = Number(inp.dataset.r), c = Number(inp.dataset.c);
      inp.value = String(skState.solution[r][c]);
      inp.className = inp.readOnly ? 'given' : '';
    });
    skStat();
    $('sk-msg').className = 'hint';
    $('sk-msg').textContent = '已填入答案。点「换一题」再来一局。';
  });
  $('sk-grid').addEventListener('input', function (e) {
    var t = e.target;
    if (t.tagName !== 'INPUT') return;
    t.value = t.value.replace(/[^1-9]/g, '').slice(0, 1);
    t.className = '';
    skStat();
  });

  /* ========== 2. 舒尔特方格 ========== */

  var scState = { size: 5, next: 1, order: [], startedAt: 0, running: false, best: {}, errors: 0 };

  function scNew() {
    scState.size = Number($('sc-size').value) || 5;
    var n = scState.size * scState.size;
    var nums = [];
    for (var i = 1; i <= n; i++) nums.push(i);
    scState.order = shuffle(nums, rng(Date.now() & 0x7fffffff));
    scState.next = 1;
    scState.running = false;
    scState.startedAt = 0;
    scState.errors = 0;
    var grid = $('sc-grid');
    grid.style.gridTemplateColumns = 'repeat(' + scState.size + ',1fr)';
    grid.innerHTML = '';
    scState.order.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(v);
      b.dataset.v = String(v);
      grid.appendChild(b);
    });
    scStat();
    $('sc-msg').className = 'hint';
    $('sc-msg').textContent = '从 1 开始，按顺序点到 ' + n + '。点第一个数字时自动开始计时。';
  }

  function scStat() {
    var grid = $('sc-stat');
    grid.innerHTML = '';
    var n = scState.size * scState.size;
    var done = scCount();
    var cost;
    if (scState.running) cost = Date.now() - scState.startedAt;
    else if (scState.lastCost) cost = scState.lastCost;
    else cost = 0;
    grid.appendChild(cell('已完成', done + ' / ' + n));
    grid.appendChild(cell('用时', cost ? (cost / 1000).toFixed(2) + ' 秒' : '—'));
    grid.appendChild(cell('点错次数', String(scState.errors)));
    grid.appendChild(cell('平均每格', done && cost ? (cost / 1000 / done).toFixed(2) + ' 秒' : '—'));
  }

  function scCount() { return scState.next - 1; }

  $('sc-new').addEventListener('click', scNew);
  $('sc-size').addEventListener('change', scNew);
  $('sc-start').addEventListener('click', function () {
    scState.startedAt = Date.now();
    scState.running = true;
    $('sc-msg').className = 'hint';
    $('sc-msg').textContent = '计时中…按 1 → ' + (scState.size * scState.size) + ' 的顺序点。';
    scStat();
  });
  $('sc-grid').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || !scState.order.length) return;
    var v = Number(b.dataset.v);
    if (!scState.running) { scState.startedAt = Date.now(); scState.running = true; }
    if (v === scState.next) {
      b.classList.add('done');
      scState.next++;
      if (scState.next > scState.size * scState.size) {
        scState.lastCost = Date.now() - scState.startedAt;
        scState.running = false;
        var key = String(scState.size);
        if (!scState.best[key] || scState.lastCost < scState.best[key]) scState.best[key] = scState.lastCost;
        $('sc-msg').className = 'hint';
        $('sc-msg').textContent = '完成！用时 ' + (scState.lastCost / 1000).toFixed(2) + ' 秒，点错 ' +
          scState.errors + ' 次，最佳 ' + (scState.best[key] / 1000).toFixed(2) + ' 秒。';
      }
      scStat();
    } else {
      // 点错不给惩罚性重置，只记数并闪一下，避免破坏练习节奏
      scState.errors++;
      b.style.background = '#ffe0d9';
      setTimeout(function () { b.style.background = ''; }, 180);
      scStat();
    }
  });

  /* ========== 3. 反应速度 ========== */

  var rxState = { phase: 'idle', timer: null, goAt: 0, records: [] };

  function rxStat() {
    var box = $('rx-stat');
    box.innerHTML = '';
    var rs = rxState.records;
    var avg = rs.length ? Math.round(rs.reduce(function (a, b) { return a + b; }, 0) / rs.length) : 0;
    var best = rs.length ? Math.min.apply(null, rs) : 0;
    var worst = rs.length ? Math.max.apply(null, rs) : 0;
    [['测试次数', rs.length], ['平均', avg ? avg + ' ms' : '—'], ['最快', best ? best + ' ms' : '—']].forEach(function (p) {
      var d = document.createElement('div');
      var b = document.createElement('b'); b.textContent = p[1];
      var s = document.createElement('span'); s.textContent = p[0];
      d.appendChild(b); d.appendChild(s);
      box.appendChild(d);
    });
    var bars = $('rx-bars');
    bars.innerHTML = '';
    if (rs.length) {
      var max = worst || 1;
      rs.slice(-10).forEach(function (v, i) {
        bars.appendChild(bar('第 ' + (rs.length - Math.min(10, rs.length) + i + 1) + ' 次', v, max, v + ' ms'));
      });
    }
    return { avg: avg, best: best, count: rs.length };
  }

  function bar(label, value, max, text) {
    var d = document.createElement('div');
    d.className = 'bar';
    var l = document.createElement('div'); l.className = 'lab'; l.textContent = label;
    var t = document.createElement('div'); t.className = 'track';
    var f = document.createElement('div'); f.className = 'fill';
    f.style.width = Math.max(2, Math.min(100, value / max * 100)) + '%';
    t.appendChild(f);
    var v = document.createElement('div'); v.className = 'val'; v.textContent = text;
    d.appendChild(l); d.appendChild(t); d.appendChild(v);
    return d;
  }

  function rxReset(text, cls) {
    var box = $('rx-box');
    box.className = 'hitbox' + (cls ? ' ' + cls : '');
    box.textContent = text;
    rxState.phase = 'idle';
    if (rxState.timer) { clearTimeout(rxState.timer); rxState.timer = null; }
  }

  function rxArm() {
    var box = $('rx-box');
    var wait = 1200 + Math.floor(Math.random() * 3000);
    rxState.phase = 'waiting';
    box.className = 'hitbox armed';
    box.textContent = '等… 变绿后立刻点击（' + (wait / 1000).toFixed(1) + ' 秒内随机）';
    rxState.timer = setTimeout(function () {
      rxState.phase = 'go';
      rxState.goAt = performance.now();
      box.className = 'hitbox go';
      box.textContent = '点！';
    }, wait);
  }

  $('rx-box').addEventListener('click', function () {
    var box = this;
    if (rxState.phase === 'idle') { rxArm(); return; }
    if (rxState.phase === 'waiting') {
      clearTimeout(rxState.timer); rxState.timer = null;
      rxState.phase = 'idle';
      box.className = 'hitbox tooearly';
      box.textContent = '抢跑了，这次不算。点一下重来。';
      return;
    }
    if (rxState.phase === 'go') {
      var ms = Math.round(performance.now() - rxState.goAt);
      rxState.records.push(ms);
      rxState.phase = 'idle';
      box.className = 'hitbox';
      box.textContent = ms + ' ms' + (ms < 200 ? '（相当快）' : ms < 300 ? '（正常范围）' : '（偏慢些）') + '，点一下再来';
      rxStat();
    }
  });

  $('rx-start').addEventListener('click', function () { rxArm(); });
  $('rx-reset').addEventListener('click', function () {
    rxState.records = [];
    rxReset('点击这里开始，变绿后立刻再点一次');
    rxStat();
  });

  /* ========== 4. CPS ========== */

  var cpState = { phase: 'idle', clicks: [], timer: null, endAt: 0 };

  function cpStat() {
    var box = $('cp-stat');
    box.innerHTML = '';
    var n = cpState.clicks.length;
    var span = n > 1 ? (cpState.clicks[n - 1] - cpState.clicks[0]) / 1000 : 0;
    var cps = span > 0 ? (n - 1) / span : 0;
    [['点击次数', n], ['CPS', cps ? cps.toFixed(2) : '—'], ['剩余', cpState.phase === 'running' ? Math.max(0, ((cpState.endAt - performance.now()) / 1000)).toFixed(1) + ' s' : '—']].forEach(function (p) {
      var d = document.createElement('div');
      var b = document.createElement('b'); b.textContent = p[1];
      var s = document.createElement('span'); s.textContent = p[0];
      d.appendChild(b); d.appendChild(s);
      box.appendChild(d);
    });
    var bars = $('cp-bars');
    bars.innerHTML = '';
    if (span > 0) {
      var perSec = [];
      cpState.clicks.forEach(function (t) {
        var bucket = Math.floor((t - cpState.clicks[0]) / 1000);
        perSec[bucket] = (perSec[bucket] || 0) + 1;
      });
      var max = Math.max.apply(null, perSec.filter(function (x) { return x; })) || 1;
      perSec.forEach(function (v, i) {
        if (v) bars.appendChild(bar('第 ' + (i + 1) + ' 秒', v, max, v + ' 次'));
      });
    }
    return { clicks: n, cps: cps };
  }

  function cpFinish() {
    cpState.phase = 'done';
    var n = cpState.clicks.length;
    var span = n > 1 ? (cpState.clicks[n - 1] - cpState.clicks[0]) / 1000 : 0;
    var cps = span > 0 ? (n - 1) / span : 0;
    var box = $('cp-box');
    box.className = 'hitbox';
    box.textContent = '结束：' + n + ' 次 ≈ ' + cps.toFixed(2) + ' CPS（约 ' +
      Math.round(cps * 60) + ' 次/分钟）。点一下再来。';
    cpStat();
  }

  $('cp-box').addEventListener('click', function () {
    if (cpState.phase === 'running') {
      var now = performance.now();
      // 15ms 内的重复事件是触屏抖动或连发，不计入
      if (cpState.clicks.length && now - cpState.clicks[cpState.clicks.length - 1] < 15) return;
      cpState.clicks.push(now);
      cpStat();
      return;
    }
    // 开始或重新开始
    cpState.phase = 'running';
    cpState.clicks = [];
    cpState.endAt = performance.now() + 5000;
    this.className = 'hitbox go';
    this.textContent = '开始点！5 秒';
    cpState.timer = setTimeout(cpFinish, 5000);
    cpStat();
  });

  /* ========== 5. 计数器 ========== */

  var ctValue = 0, ctHistory = [], CT_KEY = 'cnb.counter.v1';

  function ctLoad() {
    try {
      var raw = localStorage.getItem(CT_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      ctValue = Number(o.value) || 0;
      ctHistory = Array.isArray(o.history) ? o.history.slice(-50) : [];
      if (o.step != null) $('ct-step').value = String(o.step);
    } catch (e) { /* 存储不可用时按默认值走 */ }
  }

  function ctSave() {
    try {
      localStorage.setItem(CT_KEY, JSON.stringify({
        value: ctValue, history: ctHistory.slice(-50), step: $('ct-step').value
      }));
    } catch (e) { /* 隐私模式下写不进去，忽略即可 */ }
  }

  function ctPaint() {
    $('ct-num').textContent = String(ctValue);
    var grid = $('ct-stat');
    grid.innerHTML = '';
    grid.appendChild(cell('当前值', String(ctValue)));
    grid.appendChild(cell('步长', $('ct-step').value));
    grid.appendChild(cell('可撤销', ctHistory.length + ' 步'));
    grid.appendChild(cell('绝对值', String(Math.abs(ctValue))));
  }

  function ctChange(dir) {
    var step = Number($('ct-step').value) || 1;
    ctHistory.push(ctValue);
    if (ctHistory.length > 50) ctHistory.shift();
    ctValue += dir * step;
    ctPaint(); ctSave();
  }

  $('ct-plus').addEventListener('click', function () { ctChange(1); });
  $('ct-minus').addEventListener('click', function () { ctChange(-1); });
  $('ct-reset').addEventListener('click', function () {
    ctHistory.push(ctValue);
    ctValue = 0;
    ctPaint(); ctSave();
  });
  $('ct-undo').addEventListener('click', function () {
    if (!ctHistory.length) return;
    ctValue = ctHistory.pop();
    ctPaint(); ctSave();
  });
  $('ct-copy').addEventListener('click', function () { T.copy(String(ctValue)); });
  $('ct-step').addEventListener('input', ctPaint);
  document.addEventListener('keydown', function (e) {
    if ($('panel-count').hidden) return;
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' && e.target.id !== 'ct-step') return;
    if (e.key === '+' || e.key === '=' || e.key === 'ArrowUp') { ctChange(1); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_' || e.key === 'ArrowDown') { ctChange(-1); e.preventDefault(); }
    else if (e.key === '0') { ctHistory.push(ctValue); ctValue = 0; ctPaint(); ctSave(); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { $('ct-undo').click(); e.preventDefault(); }
  });

  /* ========== 6. 猜数字 ========== */

  var gsState = { max: 100, answer: 0, tries: 0, lo: 1, hi: 100, log: [], done: false };

  function gsNew() {
    gsState.max = Number($('gs-range').value) || 100;
    gsState.answer = Math.floor(Math.random() * gsState.max) + 1;
    gsState.tries = 0;
    gsState.lo = 1;
    gsState.hi = gsState.max;
    gsState.log = [];
    gsState.done = false;
    $('gs-in').value = '';
    $('gs-msg').className = 'hint';
    $('gs-msg').textContent = '想好一个 1 ~ ' + gsState.max + ' 的数，试试几次能猜中。';
    gsPaint();
  }

  function gsPaint() {
    var grid = $('gs-stat');
    grid.innerHTML = '';
    grid.appendChild(cell('已猜次数', String(gsState.tries)));
    grid.appendChild(cell('可能区间', gsState.done ? '已猜中' : gsState.lo + ' ~ ' + gsState.hi));
    grid.appendChild(cell('剩余可能值', gsState.done ? '0' : String(Math.max(0, gsState.hi - gsState.lo + 1))));
    grid.appendChild(cell('理论最少', gsState.done ? '—' : String(Math.ceil(Math.log2(Math.max(1, gsState.hi - gsState.lo + 1)))) + ' 次'));
    var log = $('gs-log');
    log.innerHTML = '';
    gsState.log.slice().reverse().forEach(function (l) {
      var li = document.createElement('li');
      li.textContent = l;
      log.appendChild(li);
    });
  }

  function gsGuess() {
    if (gsState.done) { gsNew(); return; }
    var v = Number($('gs-in').value);
    var msg = $('gs-msg');
    if (!Number.isInteger(v) || v < 1 || v > gsState.max) {
      msg.className = 'hint err';
      msg.textContent = '请输入 1 ~ ' + gsState.max + ' 之间的整数。';
      return;
    }
    gsState.tries++;
    if (v === gsState.answer) {
      gsState.done = true;
      gsState.log.push('第 ' + gsState.tries + ' 次：' + v + ' —— 猜中！');
      msg.className = 'hint';
      msg.textContent = '猜中！共用 ' + gsState.tries + ' 次。' +
        (gsState.tries <= Math.ceil(Math.log2(gsState.max)) ? '达到二分法上限内的最优水平。' : '再试试每次猜区间中点。');
    } else if (v < gsState.answer) {
      gsState.lo = Math.max(gsState.lo, v + 1);
      gsState.log.push('第 ' + gsState.tries + ' 次：' + v + ' —— 小了');
      msg.className = 'hint';
      msg.textContent = v + ' 小了，答案比它大。';
    } else {
      gsState.hi = Math.min(gsState.hi, v - 1);
      gsState.log.push('第 ' + gsState.tries + ' 次：' + v + ' —— 大了');
      msg.className = 'hint';
      msg.textContent = v + ' 大了，答案比它小。';
    }
    $('gs-in').value = '';
    gsPaint();
  }

  $('gs-guess').addEventListener('click', gsGuess);
  $('gs-new').addEventListener('click', gsNew);
  $('gs-range').addEventListener('change', gsNew);
  $('gs-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') gsGuess(); });

  /* ========== 7. 种子转磁力 ========== */

  /* --- bencode 解析：只认 d/l/i/e 四种记号，其余一律报错 --- */
  function bdecode(buf) {
    var pos = 0;
    var view = buf;

    function byte() { return view[pos++]; }

    function parse() {
      var c = byte();
      if (c === 0x69) return parseint();          // 'i'
      if (c === 0x6c) return parselist();          // 'l'
      if (c === 0x64) return parsedict();          // 'd'
      if (c >= 0x30 && c <= 0x39) { pos--; return parsestr(); }
      throw new Error('意外的字节 0x' + (c == null ? 'EOF' : c.toString(16)) + '（位置 ' + (pos - 1) + '）');
    }

    function parseint() {
      var s = '';
      while (pos < view.length && view[pos] !== 0x65) s += String.fromCharCode(byte()); // 'e'
      byte();
      if (!/^-?\d+$/.test(s)) throw new Error('整数格式不对：' + s);
      return parseInt(s, 10);
    }

    function parsestr() {
      var len = '';
      while (pos < view.length && view[pos] !== 0x3a) len += String.fromCharCode(byte()); // ':'
      byte();
      var n = parseInt(len, 10);
      if (!(n >= 0) || pos + n > view.length) throw new Error('字符串长度越界：' + len);
      var out = view.slice(pos, pos + n);
      pos += n;
      return out;
    }

    function parselist() {
      var out = [];
      while (view[pos] !== 0x65) out.push(parse());
      byte();
      return out;
    }

    function parsedict() {
      var out = {};
      while (view[pos] !== 0x65) {
        var k = parsestr();
        out[buf2str(k)] = parse();
      }
      byte();
      return out;
    }

    var r = parse();
    if (pos !== view.length) throw new Error('文件末尾还有 ' + (view.length - pos) + ' 字节未解析，可能不是合法的种子文件');
    return r;
  }

  // bencode 的键按字节序比大小，中文文件名要按 UTF-8 逐字节还原；
  // 键正常都是 ASCII，遇到非 ASCII 就整体按 UTF-8 解码
  function buf2str(b) {
    var ascii = true;
    for (var i = 0; i < b.length; i++) if (b[i] >= 0x80) { ascii = false; break; }
    if (ascii) {
      var s0 = '';
      for (var j = 0; j < b.length; j++) s0 += String.fromCharCode(b[j]);
      return s0;
    }
    return bytesToStr(b);
  }

  function bytesToStr(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) {
      s += b[i] < 0x80 ? String.fromCharCode(b[i]) : '%' + ('0' + b[i].toString(16)).slice(-2);
    }
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  /* --- 从解析结果里重新取 info 段的原始字节：SHA-1 要按原字节算，
         重新编码会因为键序、整数写法差异算出不同的 btih --- */
  function sliceInfoBytes(buf) {
    var pos = 0;
    function scan() {
      var c = buf[pos];
      if (c === 0x69) { // i
        var start = pos;
        while (buf[pos] !== 0x65) pos++;
        pos++;
        return [start, pos];
      }
      if (c === 0x6c) { // l
        var start = pos; pos++;
        while (buf[pos] !== 0x65) scan();
        pos++;
        return [start, pos];
      }
      if (c === 0x64) { // d
        var start = pos; pos++;
        while (buf[pos] !== 0x65) { keyRange(); scan(); }
        pos++;
        return [start, pos];
      }
      return strRange();
    }
    // 记号格式统一是「长度:内容」。keyRange 返回内容区间，密钥取值用；
    // strRange 返回含长度前缀的完整区间，info 段要原样切片算 SHA-1。
    function strBody() {
      var len = '';
      while (buf[pos] !== 0x3a) len += String.fromCharCode(buf[pos++]);
      pos++;
      var n = parseInt(len, 10);
      var start = pos;
      pos += n;
      return [start, pos];
    }
    function strRange() {
      var start = pos;
      strBody();
      return [start, pos];
    }
    var keyRange = strBody;

    if (buf[0] !== 0x64) throw new Error('种子文件顶层不是字典');
    pos = 1;
    var infoRange = null;
    while (buf[pos] !== 0x65) {
      var k = keyRange();
      // Uint8Array.slice 返回的仍是 Uint8Array，必须显式转成字符串才能比 key
      var key = buf2str(buf.slice(k[0], k[1]));
      var r = scan();
      if (key !== 'info') continue;
      if (buf[r[0]] !== 0x64) throw new Error('info 段不是字典');
      infoRange = r;
    }
    if (!infoRange) throw new Error('种子里没有 info 段');
    return buf.slice(infoRange[0], infoRange[1]);
  }

  /* --- SHA-1：磁力链接的 btih 用的就是它，自己实现避免依赖 --- */
  function sha1(bytes) {
    var ml = bytes.length * 8;
    var withPad = ((bytes.length + 8) >> 6 << 6) + 64;
    var buf = new Uint8Array(withPad);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    var dv = new DataView(buf.buffer);
    dv.setUint32(withPad - 8, Math.floor(ml / 4294967296));
    dv.setUint32(withPad - 4, ml >>> 0);

    var h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    var w = new Array(80);

    for (var i = 0; i < withPad; i += 64) {
      for (var j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4);
      for (j = 16; j < 80; j++) {
        var v = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
        w[j] = (v << 1) | (v >>> 31);
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
      for (j = 0; j < 80; j++) {
        var f, k;
        if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        var t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0;
      h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0;
    }
    return h.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
  }

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += ('0' + bytes[i].toString(16)).slice(-2);
    return s;
  }

  // 多文件种子的 btih 串：按文件名排序后，逐条拼 "路径长度:路径长度:路径" + 文件长度
  function buildMultiHashInput(info) {
    var files = (info.files || []).slice().map(function (f) {
      var path = (f['path.utf-8'] || f.path || []).join('/');
      return { path: path, length: f.length };
    });
    files.sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
    return files.map(function (f) {
      return String(f.path.length) + ':' + f.path + String(f.length) + ':';
    }).join('');
  }

  function torrentToMagnet(bytes, opts) {
    opts = opts || {};
    var root = bdecode(bytes);
    var info = root.info;
    if (!info) throw new Error('种子里没有 info 段');

    var btih, kind;
    if (opts.forceV1 || info.files || info.length != null) {
      var raw = sliceInfoBytes(bytes);
      btih = sha1(raw);
      kind = 'v1（info 段整体 SHA-1）';
    } else if (info['meta version'] === 2) {
      // v2 种子的 infohash 是截断的 SHA-256，本页不冒充支持
      throw new Error('这是 BitTorrent v2 种子，btih 规则用截断 SHA-256，本页只支持 v1');
    } else {
      var raw2 = sliceInfoBytes(bytes);
      btih = sha1(raw2);
      kind = 'v1（info 段整体 SHA-1）';
    }

    var name = info['name.utf-8'] ? bytesToStr(info['name.utf-8']) : bytesToStr(info.name || new Uint8Array());
    var magnet = 'magnet:?xt=urn:btih:' + btih;
    if (name) magnet += '&dn=' + encodeURIComponent(name);

    var trackers = [];
    (root['announce-list'] || []).forEach(function (tier) {
      (Array.isArray(tier) ? tier : [tier]).forEach(function (t) {
        var u = bytesToStr(t);
        if (u && trackers.indexOf(u) < 0) trackers.push(u);
      });
    });
    if (root.announce) {
      var a = bytesToStr(root.announce);
      if (trackers.indexOf(a) < 0) trackers.unshift(a);
    }
    // 多个 tracker 参数是磁力链接的标准写法，每个都要单独带 &tr=
    trackers.forEach(function (t) { magnet += '&tr=' + encodeURIComponent(t); });

    var size = 0, count = 0;
    if (info.files) {
      count = info.files.length;
      info.files.forEach(function (f) { size += Number(f.length) || 0; });
    } else if (info.length != null) {
      count = 1;
      size = Number(info.length) || 0;
    }

    return {
      magnet: magnet, btih: btih, hashKind: kind,
      name: name, trackers: trackers, files: count, size: size,
      pieces: info.pieces ? Math.floor(info.pieces.length / 20) : 0,
      pieceLength: Number(info['piece length']) || 0,
      encoding: info.encoding ? bytesToStr(info.encoding) : '',
      creationDate: root['creation date'] || null,
      comment: root.comment ? bytesToStr(root.comment) : '',
      createdBy: root['created by'] ? bytesToStr(root['created by']) : ''
    };
  }

  var mgBytes = null;

  function fmtSize(n) {
    var u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    var i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(2) : n) + ' ' + u[i];
  }

  function mgRun() {
    var msg = $('mg-msg'), out = $('mg-out'), grid = $('mg-grid');
    out.textContent = '';
    grid.innerHTML = '';
    if (!mgBytes) { msg.className = 'hint err'; msg.textContent = '先选一个 .torrent 文件。'; return null; }
    var r;
    try {
      r = torrentToMagnet(mgBytes);
    } catch (e) {
      msg.className = 'hint err';
      msg.textContent = '解析失败：' + e.message;
      return null;
    }
    msg.className = 'hint';
    msg.textContent = '解析成功，磁力链接已生成。';
    out.textContent = r.magnet;
    grid.appendChild(cell('btih', r.btih));
    grid.appendChild(cell('infohash 算法', r.hashKind));
    grid.appendChild(cell('名称', r.name || '（无）'));
    grid.appendChild(cell('文件数', String(r.files)));
    grid.appendChild(cell('总大小', fmtSize(r.size)));
    grid.appendChild(cell('分片数', String(r.pieces)));
    grid.appendChild(cell('分片大小', r.pieceLength ? fmtSize(r.pieceLength) : '—'));
    grid.appendChild(cell('Tracker', String(r.trackers.length) + ' 个'));
    return r;
  }

  $('mg-in').addEventListener('change', function () {
    var f = this.files[0];
    mgBytes = null;
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      mgBytes = new Uint8Array(rd.result);
      $('mg-msg').className = 'hint';
      $('mg-msg').textContent = '已读取 ' + f.name + '（' + mgBytes.length + ' 字节），点「生成磁力链接」。';
    };
    rd.readAsArrayBuffer(f);
  });
  $('mg-run').addEventListener('click', mgRun);
  $('mg-copy').addEventListener('click', function () {
    var r = mgRun();
    if (r) T.copy(r.magnet);
  });
  $('mg-clear').addEventListener('click', function () {
    mgBytes = null;
    $('mg-in').value = '';
    $('mg-out').textContent = '';
    $('mg-grid').innerHTML = '';
    $('mg-msg').className = 'hint';
    $('mg-msg').textContent = '';
  });

  /* ========== 页签与初始化 ========== */

  var PANELS = ['sdk', 'schulte', 'reaction', 'cps', 'count', 'guess', 'magnet'];
  function setTab(name) {
    T.markTab(name);
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);
  setTab(T.firstTab('sdk'));

  function cell(k, v) {
    var d = document.createElement('div');
    var kk = document.createElement('div'); kk.className = 'k'; kk.textContent = k;
    var vv = document.createElement('div'); vv.className = 'v'; vv.textContent = v;
    d.appendChild(kk); d.appendChild(vv);
    return d;
  }

  ctLoad();
  ctPaint();
  scNew();
  rxStat();
  cpStat();
  gsNew();
  skNew('mid');

  window.__game = {
    rng: rng, shuffle: shuffle, canPlace: canPlace, countSolutions: countSolutions,
    sudokuGenerate: sudokuGenerate, SUDOKU_LEVELS: SUDOKU_LEVELS,
    bdecode: bdecode, sliceInfoBytes: sliceInfoBytes, sha1: sha1, toHex: toHex,
    buildMultiHashInput: buildMultiHashInput, torrentToMagnet: torrentToMagnet, fmtSize: fmtSize
  };
})();

/* 在线时钟：时钟 / 秒表 / 计时器 / 倒计时 / 世界时间
   计时一律以 performance.now() 或 Date.now() 差值推算，不靠 tick 累加，
   页面切到后台被节流后回来仍显示准确值。 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  function pad(n, w) { return String(n).padStart(w == null ? 2 : w, '0'); }
  function ms3(n) { return pad(n, 3); }
  function ms2(n) { return pad(Math.floor(n / 10), 2); }

  /* 把毫秒拆成 时/分/秒/毫秒，秒数为 0 时返回 mm:ss 形式 */
  function split(ms) {
    var neg = ms < 0;
    ms = Math.abs(Math.round(ms));
    var h = Math.floor(ms / 3600000);
    var m = Math.floor(ms % 3600000 / 60000);
    var s = Math.floor(ms % 60000 / 1000);
    var t = ms % 1000;
    return { neg: neg, h: h, m: m, s: s, ms: t, total: ms };
  }

  function hms(o, showMs, msDigits) {
    var out = (o.h > 0 ? pad(o.h) + ':' : '') + pad(o.m) + ':' + pad(o.s);
    if (showMs) out += '.' + (msDigits === 3 ? ms3(o.ms) : ms2(o.ms));
    return (o.neg ? '-' : '') + out;
  }

  /* ---------- 面板切换 ---------- */
  var current = 'clock';
  var tabsBox = $('tabs');
  var panels = { clock: 'panel-clock', stopwatch: 'panel-stopwatch', timer: 'panel-timer', countdown: 'panel-countdown', zones: 'panel-zones' };

  function show(name) {
    T.markTab(name);
    current = name;
    [].forEach.call(tabsBox.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.tab === name);
    });
    Object.keys(panels).forEach(function (k) {
      $(panels[k]).hidden = k !== name;
    });
    onEnter(name);
  }

  tabsBox.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) show(b.dataset.tab);
  });

  function onEnter(name) {
    if (name === 'stopwatch') swRender();
    if (name === 'timer') { if (tm.running && tmRemain() <= 0) tmDone(); else tmRender(); }
    if (name === 'countdown') cdRender();
    if (name === 'zones') renderZones();
  }

  /* ---------- 1. 在线时钟 ---------- */
  var clkMode = '24';
  var clkColor = '#1668dc';
  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function loadColor() {
    try {
      var v = localStorage.getItem('clock.color');
      if (v && /^#[0-9a-f]{6}$/i.test(v)) return v;
    } catch (e) { /* 隐私模式禁 localStorage，忽略 */ }
    return '#1668dc';
  }
  function saveColor(v) {
    try { localStorage.setItem('clock.color', v); } catch (e) { /* 同上 */ }
  }

  function applyColor(c) {
    clkColor = c;
    var root = document.documentElement;
    root.style.setProperty('--primary', c);
    $('clk-color').value = c;
    // 主色偏亮时用更深的按下态，避免视觉上「按下去没变化」
    root.style.setProperty('--primary-press', shade(c, -0.22));
  }

  /* 按比例调亮/调暗一个 #rrggbb */
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    function f(v) {
      var x = k < 0 ? v * (1 + k) : v + (255 - v) * k;
      return Math.max(0, Math.min(255, Math.round(x)));
    }
    return '#' + [f(r), f(g), f(b)].map(function (v) { return pad(v.toString(16), 2); }).join('');
  }

  /* 该时刻相对 UTC 的偏移分钟数，东八区为 480。
     取每年 1/7 与 7/1 两个时刻，两者一致视为无夏令时。 */
  function offsetMinutes(d) {
    return -d.getTimezoneOffset();
  }
  function isDST(d) {
    var y = d.getFullYear();
    var jan = -new Date(y, 0, 7).getTimezoneOffset();
    var jul = -new Date(y, 6, 1).getTimezoneOffset();
    return jan !== jul && offsetMinutes(d) === Math.max(jan, jul);
  }
  function tzLabel(d) {
    var y = d.getFullYear();
    var jan = -new Date(y, 0, 7).getTimezoneOffset();
    var jul = -new Date(y, 6, 1).getTimezoneOffset();
    if (jan === jul) return jan === 480 ? 'UTC+8（北京时间）' : fmtOffset(jan);
    return fmtOffset(offsetMinutes(d)) + (isDST(d) ? ' 夏令时' : ' 标准时');
  }
  function fmtOffset(mins) {
    var sign = mins < 0 ? '-' : '+';
    var a = Math.abs(mins);
    var h = Math.floor(a / 60), m = a % 60;
    return 'UTC' + sign + h + (m ? ':' + pad(m) : '');
  }
  var TZ = (function () {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  })();

  function clkTick() {
    if (current !== 'clock') return;
    var d = new Date();
    var h = d.getHours();
    var ampm = '';
    if (clkMode === '12') {
      ampm = h < 12 ? '上午' : '下午';
      h = h % 12 || 12;
    }
    var main = pad(h) + '<span class="sep">:</span>' + pad(d.getMinutes()) + '<span class="sep">:</span>' + pad(d.getSeconds());
    var t = $('clk-time');
    t.innerHTML = main + (clkMode === 'ms' ? '<span class="ms">.' + ms3(d.getMilliseconds()) + '</span>' : '');
    $('clk-date').textContent = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' +
      WEEK[d.getDay()] + (ampm ? ' · ' + ampm : '');

    if (clkMode === 'ms') {
      // 毫秒档按帧刷新，其余字段同步更新即可
    }
    T.cells($('clk-grid'), [
      ['时区', TZ || tzLabel(d)],
      ['UTC 偏移', fmtOffset(offsetMinutes(d))],
      ['星期', WEEK_EN[d.getDay()]],
      ['Unix 秒', String(Math.floor(d.getTime() / 1000))],
      ['Unix 毫秒', String(d.getTime())],
      ['年内第几天', String(dayOfYear(d))]
    ]);
  }

  function dayOfYear(d) {
    var start = new Date(d.getFullYear(), 0, 1);
    return Math.floor((d - start) / 86400000) + 1;
  }

  $('clk-mode').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    clkMode = b.dataset.mode;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    clkTick();
  });
  $('clk-color').addEventListener('input', function () { applyColor(this.value); saveColor(this.value); });

  /* ---------- 2. 秒表 ---------- */
  var sw = { running: false, start: 0, base: 0, laps: [], lastLap: 0 };
  var SW_KEY = 'stopwatch.state';

  function swElapsed() {
    return sw.base + (sw.running ? performance.now() - sw.start : 0);
  }

  function swRender() {
    var e = swElapsed();
    var o = split(e);
    var big = o.h > 0 ? pad(o.h) + ':' : '';
    $('sw-time').innerHTML = big + pad(o.m) + ':' + pad(o.s) + '<span class="ms">.' + ms2(o.ms) + '</span>';
    $('sw-lap').disabled = !sw.running;
    $('sw-reset').disabled = !sw.running && sw.base === 0;
    $('sw-main').textContent = sw.running ? '暂停' : (sw.base > 0 ? '继续' : '开始');
  }

  function swLap() {
    if (!sw.running) return;
    var total = swElapsed();
    var delta = total - sw.lastLap;
    sw.lastLap = total;
    sw.laps.push({ delta: delta, total: total });
    swPaintLaps();
  }

  /* 重绘计次表：最快绿、最慢红、最新一条加粗 */
  function swPaintLaps() {
    var tb = $('sw-laps');
    var laps = sw.laps;
    tb.innerHTML = '';
    $('sw-laps-wrap').hidden = laps.length === 0;
    if (!laps.length) return;
    var best = laps[0], worst = laps[0];
    laps.forEach(function (l) {
      if (l.delta < best.delta) best = l;
      if (l.delta > worst.delta) worst = l;
    });
    var multi = laps.length > 1;
    laps.forEach(function (l, i) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td');
      td1.textContent = i + 1;
      var td2 = document.createElement('td');
      td2.textContent = hms(split(l.delta), true, 2);
      var td3 = document.createElement('td');
      td3.textContent = hms(split(l.total), true, 2);
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      if (i === laps.length - 1) tr.style.fontWeight = '600';
      else if (multi && l === best) tr.style.color = 'var(--ok)';
      else if (multi && l === worst) tr.style.color = 'var(--warn)';
      tb.appendChild(tr);
    });
  }

  $('sw-main').addEventListener('click', function () {
    if (sw.running) {
      sw.base = swElapsed();
      sw.running = false;
    } else {
      sw.start = performance.now();
      sw.running = true;
    }
    swRender();
  });
  $('sw-lap').addEventListener('click', function () { swLap(); });
  $('sw-reset').addEventListener('click', function () {
    sw = { running: false, start: 0, base: 0, laps: [], lastLap: 0 };
    $('sw-laps').innerHTML = '';
    $('sw-laps-wrap').hidden = true;
    swRender();
  });

  /* ---------- 3. 计时器 ---------- */
  var tm = { running: false, total: 300000, remain: 300000, endAt: 0, warned: false };
  var RING = 2 * Math.PI * 88;

  function tmRead() {
    var h = +$('tm-h').value || 0;
    var m = +$('tm-m').value || 0;
    var s = +$('tm-s').value || 0;
    var ms = +$('tm-ms').value || 0;
    var t = ((h * 60 + m) * 60 + s) * 1000 + ms;
    return Math.max(0, t);
  }
  function tmWrite(t) {
    var o = split(t);
    $('tm-h').value = o.h; $('tm-m').value = o.m; $('tm-s').value = o.s; $('tm-ms').value = o.ms;
  }
  function tmRemain() {
    return tm.running ? Math.max(0, tm.endAt - performance.now()) : tm.remain;
  }
  function tmRender() {
    var r = tmRemain();
    var o = split(r);
    var big = (o.h > 0 ? pad(o.h) + ':' : '') + pad(o.m) + ':' + pad(o.s);
    // 剩余不足 1 分钟时给两位小数，否则一位，避免末段跳动过于细碎
    var frac = r < 60000 ? ms2(o.ms) : pad(Math.floor(o.ms / 100), 1);
    $('tm-time').innerHTML = big + '<span class="ms">.' + frac + '</span>';
    $('tm-time').classList.toggle('pulse', tm.running && r < 10000 && r > 0);
    var pct = tm.total > 0 ? r / tm.total : 0;
    $('tm-bar').setAttribute('stroke-dasharray', RING.toFixed(1));
    $('tm-bar').setAttribute('stroke-dashoffset', (RING * (1 - pct)).toFixed(1));
    $('tm-bar').classList.toggle('warn', r < 10000 && r > 0);
    $('tm-bar').classList.toggle('ok', r === 0 && tm.total > 0);
    $('tm-main').textContent = tm.running ? '暂停' : (r > 0 && r < tm.total ? '继续' : '开始');
    $('tm-reset').disabled = !tm.running && tm.remain === tm.total;
  }
  function tmDone() {
    tm.running = false;
    tm.remain = 0;
    $('tm-msg').textContent = '时间到！' + new Date().toLocaleTimeString('zh-CN');
    $('tm-msg').classList.add('err');
    document.title = '⏰ 时间到！';
    if (navigator.vibrate) { try { navigator.vibrate([200, 120, 200, 120, 400]); } catch (e) { /* 不支持则忽略 */ } }
    if (window.Notification && Notification.permission === 'granted') {
      try { new Notification('计时结束', { body: formatDur(tm.total) + ' 已走完' }); } catch (e) { /* 部分机型需 SW，忽略 */ }
    }
    tmRender();
  }
  function formatDur(ms) {
    var o = split(ms);
    return (o.h ? o.h + ' 小时 ' : '') + (o.m ? o.m + ' 分 ' : '') + (o.s || 0) + ' 秒';
  }
  $('tm-preset').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    tmReset(+b.dataset.sec * 1000);
  });
  ['tm-h', 'tm-m', 'tm-s', 'tm-ms'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if (tm.running) return;
      [].forEach.call($('tm-preset').querySelectorAll('button'), function (o) { o.classList.remove('on'); });
      tm.total = tm.remain = tmRead();
      tmRender();
    });
  });
  function tmReset(t) {
    tm.running = false;
    tm.warned = false;
    document.title = '在线时钟 · 秒表 · 计时器';
    $('tm-msg').textContent = '到点后在页面内提示（无声音依赖，可点击「提醒」按钮请求系统通知权限）。';
    $('tm-msg').classList.remove('err');
    if (t != null) tmWrite(t);
    tm.total = tm.remain = tmRead();
    tmRender();
  }
  $('tm-main').addEventListener('click', function () {
    if (tm.running) {
      tm.remain = tmRemain();
      tm.running = false;
      tmRender();
      return;
    }
    if (tm.remain <= 0) tmReset();
    if (tm.total <= 0) { $('tm-msg').textContent = '请先填入大于 0 的时长。'; $('tm-msg').classList.add('err'); return; }
    tm.endAt = performance.now() + tm.remain;
    tm.running = true;
    document.title = '在线时钟 · 秒表 · 计时器';
    tmRender();
  });
  $('tm-reset').addEventListener('click', function () { tmReset(); });

  /* ---------- 4. 倒计时 ---------- */
  function cdTarget() {
    var v = $('cd-at').value;
    if (v) {
      var d = new Date(v);
      if (!isNaN(d)) return d;
    }
    var days = parseFloat($('cd-days').value);
    if (isFinite(days)) return new Date(Date.now() + days * 86400000);
    return null;
  }
  function cdRender() {
    var t = cdTarget();
    if (!t) {
      $('cd-d').textContent = '—';
      T.cells($('cd-grid'), [['目标时刻', '—'], ['距今', '—']]);
      $('cd-msg').textContent = '填「目标时刻」或「距今天数」其中之一即可。';
      return;
    }
    var diff = t.getTime() - Date.now();
    var o = split(diff);
    var days = Math.floor(o.total / 86400000);
    $('cd-d').textContent = (diff < 0 ? '已过 ' : '') + (days > 0 ? days + ' 天 ' : '') + hms({ h: o.h % 24, m: o.m, s: o.s, ms: o.ms, neg: false }, true, 3);
    T.cells($('cd-grid'), [
      ['目标时刻', t.toLocaleString('zh-CN', { hour12: false })],
      ['距今', diff >= 0 ? '还有' : '已过去'],
      ['总天数', T.fmt(o.total / 86400000, 2)],
      ['总小时', T.fmt(o.total / 3600000, 1)]
    ]);
    $('cd-msg').textContent = '倒计时目标 ' + t.toLocaleString('zh-CN', { hour12: false }) + (diff < 0 ? '（已过期）' : '');
    $('cd-msg').classList.toggle('err', diff < 0);
  }
  $('cd-at').addEventListener('input', function () { if (this.value) $('cd-days').value = ''; cdRender(); });
  $('cd-days').addEventListener('input', function () { if (this.value) $('cd-at').value = ''; cdRender(); });

  /* ---------- 5. 世界时间 ---------- */
  var ZONES = [
    ['北京', 'Asia/Shanghai'], ['东京', 'Asia/Tokyo'], ['首尔', 'Asia/Seoul'],
    ['新加坡', 'Asia/Singapore'], ['孟买', 'Asia/Kolkata'], ['迪拜', 'Asia/Dubai'],
    ['莫斯科', 'Europe/Moscow'], ['柏林', 'Europe/Berlin'], ['巴黎', 'Europe/Paris'],
    ['伦敦', 'Europe/London'], ['纽约', 'America/New_York'], ['芝加哥', 'America/Chicago'],
    ['洛杉矶', 'America/Los_Angeles'], ['圣保罗', 'America/Sao_Paulo'],
    ['悉尼', 'Australia/Sydney'], ['奥克兰', 'Pacific/Auckland'], ['UTC', 'UTC']
  ];

  function zoneTime(zone, d) {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: zone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(d);
    } catch (e) {
      return '—';
    }
  }
  function zoneDiff(zone, d) {
    try {
      // 用同一瞬间在目标时区与 UTC 的墙上时间差，反推该时区偏移
      var f = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      var p = {};
      f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      var mins = Math.round((asUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000);
      // 归一到 ±14 小时
      while (mins > 840) mins -= 1440;
      while (mins < -840) mins += 1440;
      return mins;
    } catch (e) {
      return null;
    }
  }
  function renderZones() {
    var d = new Date();
    var myOff = offsetMinutes(d);
    var ul = $('zones');
    ul.innerHTML = '';
    ZONES.forEach(function (z) {
      var off = zoneDiff(z[1], d);
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = z[0];
      var time = document.createElement('span');
      time.className = 'zt';
      time.textContent = zoneTime(z[1], d).replace(/^\d+\//, '');
      var delta = document.createElement('span');
      delta.className = 'zd';
      delta.textContent = off == null ? '' : (off === myOff ? '与本地相同' : fmtOffset(off));
      li.appendChild(name); li.appendChild(time); li.appendChild(delta);
      ul.appendChild(li);
    });
  }

  /* ---------- 主循环 ---------- */
  var raf = null;
  var lastSec = -1;
  var lastZone = 0;
  function loop() {
    var now = Date.now();
    if (current === 'clock') {
      // 毫秒档逐帧；其余档位秒数变了才重排 DOM，省一点开销
      if (clkMode === 'ms' || Math.floor(now / 1000) !== lastSec) { lastSec = Math.floor(now / 1000); clkTick(); }
    } else if (current === 'stopwatch') {
      if (sw.running) swRender();
    } else if (current === 'timer') {
      if (tm.running) {
        var r = tmRemain();
        if (r <= 0) tmDone();
        else tmRender();
      }
    } else if (current === 'countdown') {
      cdRender();
    } else if (current === 'zones' && now - lastZone >= 1000) {
      lastZone = now; renderZones();
    }
    raf = requestAnimationFrame(loop);
  }

  /* 切回页面时立即对齐一次，避免显示停留后台前的旧值 */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      lastSec = -1;
      lastZone = 0;
      if (current === 'stopwatch') swRender();
      if (current === 'timer' && tm.running && tmRemain() <= 0) tmDone();
    }
  });

  /* ---------- 初始化 ---------- */
  applyColor(loadColor());
  $('clk-mode').querySelector('button').classList.add('on');
  // 默认目标：3 天后此刻
  (function () {
    var d = new Date(Date.now() + 3 * 86400000);
    $('cd-at').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  })();
  show(T.firstTab('clock'));
  tm.total = tm.remain = tmRead();
  $('tm-preset').querySelector('button[data-sec="300"]').classList.add('on');
  clkTick();
  swRender();
  tmRender();
  cdRender();
  renderZones();
  raf = requestAnimationFrame(loop);

  // 供测试脚本直接调用内部函数，不污染页面行为
  window.__clock = {
    split: split, hms: hms, dayOfYear: dayOfYear, fmtOffset: fmtOffset, shade: shade, isDST: isDST,
    formatDur: formatDur, zoneDiff: zoneDiff, zoneTime: zoneTime, tmRead: tmRead
  };
})();

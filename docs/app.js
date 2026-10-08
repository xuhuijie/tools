/* 工具页共用小工具：取元素、格式化、复制、页签切换 */
(function (global) {
  'use strict';

  // 复制到剪贴板：HTTPS/本地才用异步 API，其余回退到 execCommand
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(text); });
    }
    return Promise.resolve(legacy(text));
  }

  function legacy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  // 保留 digits 位小数并去掉长浮点尾巴
  function fmt(n, digits) {
    if (!isFinite(n)) return '—';
    var d = digits == null ? 4 : digits;
    return Number(n.toFixed(d)).toLocaleString('zh-CN', { maximumFractionDigits: d });
  }

  // 写回输入框的数值，避免 0.30000000000000004 这类尾巴
  function fmtInput(n, digits) {
    if (!isFinite(n)) return '';
    return String(Number(n.toFixed(digits == null ? 6 : digits)));
  }

  // 页面 id 查找：散装单页就是全局 getElementById；多页合一（整站单文件）时先在本页
  // section 里找。各页原本共用同一套 id（tabs、input、output…），合到一份文档里会互相
  // 抢，所以查找必须限定在当前显示的那页——这样各页脚本一字不改也能各找各的。
  function $(id) {
    var scope = global.__PAGE__;
    if (scope) {
      var hit = scope.querySelector('[id="' + id + '"]');
      if (hit) return hit;
    }
    return document.getElementById(id);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // 在容器内渲染 label/value 网格
  function cells(container, pairs) {
    container.innerHTML = '';
    pairs.forEach(function (p) {
      var cell = el('div');
      cell.appendChild(el('div', 'k', p[0]));
      cell.appendChild(el('div', 'v', p[1]));
      container.appendChild(cell);
    });
  }

  // 复制按钮通用绑定：btn 复制 target 的文本，成功后短暂改文案
  function bindCopy(btn, getText, doneText) {
    if (!btn) return;
    var original = btn.textContent;
    btn.addEventListener('click', function () {
      var text = getText();
      if (!text) return;
      copy(text).then(function () {
        btn.textContent = doneText || '已复制';
        setTimeout(function () { btn.textContent = original; }, 1200);
      });
    });
  }

  // 页签：buttons 为一组按钮，onPick 收到 data-tab
  function tabs(container, onPick) {
    var btns = [].slice.call(container.querySelectorAll('button'));
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (o) { o.classList.toggle('on', o === b); });
        syncHash(b.dataset.tab);
        onPick(b.dataset.tab, b);
      });
    });
    return btns;
  }

  // 把按钮高亮对齐到 name。点击时 tabs() 已经切过，但初始化是从 hash 进来的，
  // 未必等于 HTML 里写死 class="on" 的那个，所以各页的 setTab 里要再调一次。
  function markTab(name) {
    // 多页合一文档里 #tabs 会出现很多个，只能标当前页那个
    var scope = global.__PAGE__ || document;
    [].forEach.call(scope.querySelectorAll('#tabs button'), function (b) {
      b.classList.toggle('on', b.dataset.tab === name);
    });
  }

  // 切页签时把页签名写回地址，刷新与分享都能停在同一个工具上
  function syncHash(name) {
    if (!global.history || !global.history.replaceState) return;
    global.history.replaceState(null, '', '#' + name);
  }

  // 地址 hash 指定页签：#<页签名>，如 number.html#divisor。
  // 首页每条工具都带着 href="./page.html#tab" 过来，没有它就永远落回默认页签。
  function hashTab() {
    var h = String(global.location && global.location.hash || '').replace(/^#/, '');
    return /^[a-z0-9]+$/i.test(h) ? h : null;
  }

  // 打开页面时该选哪个页签：优先地址 hash（且必须是本页真实存在的页签），否则 defaultTab。
  function firstTab(defaultTab) {
    var want = hashTab();
    if (!want) return defaultTab;
    var btns = [].slice.call((global.__PAGE__ || document).querySelectorAll('#tabs button'));
    var ok = btns.some(function (b) { return b.dataset.tab === want; });
    return ok ? want : defaultTab;
  }

  // ---- 整站单文件（多页合一）支持 ----
  // 手机从「下载 / 文件管理器」打开时走 content:// URI：页面里 ./xxx.html 这类「跳到另一个
  // 文件」的链接会被拦下，报「文件找不到」。内联只解决了 css/js 子资源，解决不了跨页跳转。
  // 于是把全部页面装进同一个文档、每个页面一个 <section class="page" id="page-xxx.html">，
  // 点链接改成文档内切 section。散装单页里没有这些 section，一切维持原样。
  // 页面状态只放内存，不写地址栏：#<页签名> 这个通道被页面自己的页签逻辑占着
  //（如 checksum.html 会把它改写成 #crc），占用它会让页签与切页互相踩。
  var PAGE_SEL = 'main > section.page';

  function isHost() { return !!document.querySelector(PAGE_SEL); }

  function pageEl(name) { return document.querySelector(PAGE_SEL + '[data-name="' + name + '"]'); }

  // 切到某页：只显示这一页、把它的脚本拉起来一次（首访），并同步 hash 与标题。
  function go(name) {
    if (!isHost()) return true;
    name = String(name || '').toLowerCase();
    var want = pageEl(name);
    if (!want) return true;                 // 不认识的页，交回浏览器
    [].slice.call(document.querySelectorAll(PAGE_SEL)).forEach(function (sec) {
      var on = sec === want;
      sec.hidden = !on;
      if ('inert' in sec) sec.inert = !on;
    });
    global.__PAGE__ = want;
    document.title = (want.dataset.title || name) + ' · 工具合集';
    global.scrollTo(0, 0);
    // 本页脚本在合成时收进了 <script type="text/plain" data-for="page">，首访才执行：
    // 不执行的话，页里那些 document.getElementById 会先撞上别页的同名元素。
    var lazy = want.querySelector('script[type="text/x-page-init"]');
    if (lazy && !want.dataset.ready) {
      want.dataset.ready = '1';
      var run = document.createElement('script');
      run.textContent = lazy.textContent;
      document.body.appendChild(run);
      run.remove();
    }
    return false;
  }

  // 文档内所有「去某页」的点击：带 data-page 的链接、./xxx.html 链接都接管
  function bindNav() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a');
      if (!a) return;
      var name = a.dataset.page ||
        ((a.getAttribute('href') || '').match(/([a-z0-9_-]+\.html)(?:$|#)/i) || [])[1];
      if (name && go(name) === false) e.preventDefault();
    });
  }

  // 首屏落首页：单文件里没有「外部直接进来」的入口，一律从首页开始
  function boot() {
    if (!isHost()) return;
    if (global.__PAGE__) return;            // 已有活动页，别覆盖
    go(pageEl('index.html') ? 'index.html' : document.querySelector(PAGE_SEL).dataset.name);
    bindNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.T = { $: $, el: el, fmt: fmt, fmtInput: fmtInput, cells: cells, copy: copy, bindCopy: bindCopy, tabs: tabs, hashTab: hashTab, firstTab: firstTab, syncHash: syncHash, markTab: markTab, go: go };
})(window);

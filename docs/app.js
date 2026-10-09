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

  // 切页签时把页签名写回地址，刷新与分享都能停在同一个工具上。
  // 整站单文件里 No-op：地址栏归页面导航用（见 applyPageHash），页签只活在内存里，
  // 免得「这一页的 #ssl」被带到下一页去抢页签。
  function syncHash(name) {
    if (isHost()) return;
    if (!global.history || !global.history.replaceState) return;
    global.history.replaceState(null, '', '#' + name);
  }

  // 地址 hash 指定页签：#<页签名>，如 number.html#divisor。
  // 首页每条工具都带着 href="./page.html#tab" 过来，没有它就永远落回默认页签。
  function hashTab() {
    var h = String(global.location && global.location.hash || '').replace(/^#/, '');
    return /^[a-z0-9]+$/i.test(h) ? h : null;
  }

  // 页面「认不认」这个页签：不带页签按钮的页面（首页、放假日历、专项页）一律不认，
  // 别让上一条留在地址里的 #source 之类被它们接了去。
  function hasTab(name) {
    var scope = global.__PAGE__ || document;
    return [].slice.call(scope.querySelectorAll('#tabs button'))
      .some(function (b) { return b.dataset.tab === name; });
  }

  // 打开页面时该选哪个页签：优先地址 hash（且必须是本页真实存在的页签），否则 defaultTab。
  // 只有「本页真的有这个页签」时才算数：#<页签名> 在整站单文件里是全局的，切页/返回首页
  // 都会把它带过去，本页没有同名页签就当成没写过——否则上一页的 #ssl 能把这一页顶到默认页签。
  function firstTab(defaultTab) {
    var want = hashTab();
    if (!want) return defaultTab;
    return hasTab(want) ? want : defaultTab;
  }

  // ---- 整站单文件（多页合一）支持 ----
  // 手机从「下载 / 文件管理器」打开时走 content:// URI：页面里 ./xxx.html 这类「跳到另一个
  // 文件」的链接会被拦下，报「文件找不到」。内联只解决了 css/js 子资源，解决不了跨页跳转。
  // 于是把全部页面装进同一个文档、每个页面一个 <section class="page" id="page-xxx.html">，
  // 点链接改成文档内切 section。散装单页里没有这些 section，一切维持原样。
  // 地址栏只记「在哪一页」（#page=web.html），页签状态不写地址：#<页签名> 这个通道被
  // 各页自己的页签逻辑占着（如 checksum.html 会把它改写成 #crc），争它只会互相踩。
  var PAGE_SEL = 'main > section.page';

  function isHost() { return !!document.querySelector(PAGE_SEL); }

  function pageEl(name) { return document.querySelector(PAGE_SEL + '[data-name="' + name + '"]'); }

  // 单文件里页签只放内存，地址栏改记「当前在哪一页」：#page=web.html。
  // 记它有两个用处：一是把上一页残留的 #ssl 这类页签顶掉，二是在手机上切后台被浏览器
  // 回收后重新加载，还能落回原来那一页，而不是一起回到首页。不写也不会坏，只是回到首页。
  function hashPage() {
    var h = String(global.location && global.location.hash || '').replace(/^#/, '');
    var m = /^(?:page=|\/)?([a-z0-9_-]+\.html)$/i.exec(h);
    return m ? m[1].toLowerCase() : null;
  }

  function applyPageHash(name) {
    if (!isHost() || !global.history || !global.history.replaceState) return;
    global.history.replaceState(null, '', '#page=' + name);
  }

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
    applyPageHash(name);
    // 左上角的「首页」入口：首页自己在最上面，这一条只在别的页面上出现
    var homeNav = document.getElementById('site-nav');
    if (homeNav) homeNav.className = name === 'index.html' ? 'on-home' : '';
    global.scrollTo(0, 0);
    // 本页脚本在合成时收进了 type 非 JS 的 script 标签，首访才按顺序逐条执行：
    // 不执行的话，页里那些 document.getElementById 会先撞上别页的同名元素。
    // 注意是「逐条」：随页面内联进来的第三方库（DOMPurify、marked、bwip-js）在本页脚本
    // 之前各占一条，只跑第一条的话，本页脚本永远轮不到，按钮点了没反应、页签也切不动。
    var lazy = [].slice.call(want.querySelectorAll('script[type="text/x-page-init"]'));
    if (lazy.length && !want.dataset.ready) {
      want.dataset.ready = '1';
      lazy.forEach(function (src) {
        var run = document.createElement('script');
        run.textContent = src.textContent;
        document.body.appendChild(run);
        run.remove();
      });
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
    // 整站导航的「首页」入口：没有 JS 也能回首页，这里只是把首页自己那一屏的它收起来
    var nav = document.getElementById('site-nav');
    if (nav && !document.querySelector(PAGE_SEL + ':not([hidden])')) nav.className = 'on-home';
    if (global.__PAGE__) return;            // 已有活动页，别覆盖
    var want = hashPage();
    if (!want || !pageEl(want)) want = pageEl('index.html') ? 'index.html'
      : document.querySelector(PAGE_SEL).dataset.name;
    go(want);
    bindNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.T = { $: $, el: el, fmt: fmt, fmtInput: fmtInput, cells: cells, copy: copy, bindCopy: bindCopy, tabs: tabs, hashTab: hashTab, firstTab: firstTab, syncHash: syncHash, markTab: markTab, hasTab: hasTab, go: go };
})(window);

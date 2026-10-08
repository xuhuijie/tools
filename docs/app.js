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

  function $(id) { return document.getElementById(id); }

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
    [].forEach.call(document.querySelectorAll('#tabs button'), function (b) {
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
    var btns = [].slice.call(document.querySelectorAll('#tabs button'));
    var ok = btns.some(function (b) { return b.dataset.tab === want; });
    return ok ? want : defaultTab;
  }

  global.T = { $: $, el: el, fmt: fmt, fmtInput: fmtInput, cells: cells, copy: copy, bindCopy: bindCopy, tabs: tabs, hashTab: hashTab, firstTab: firstTab, syncHash: syncHash, markTab: markTab };
})(window);

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
        onPick(b.dataset.tab, b);
      });
    });
    return btns;
  }

  global.T = { $: $, el: el, fmt: fmt, fmtInput: fmtInput, cells: cells, copy: copy, bindCopy: bindCopy, tabs: tabs };
})(window);

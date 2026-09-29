/* 二维码与条形码：生成 / 识别
   生成用 qrcode-generator（QR）与 bwip-js（一维码 / DataMatrix / PDF417），
   识别用 jsQR。全部本地运算，图片不出浏览器。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ================= 1. 二维码生成 ================= */

  var qrCanvas = null, qrColor = '#000000', qrModuleCount = 0;

  // 按 ISO/IEC 18004 生成模块矩阵。typeNumber 传 0 让库自己按内容长度选最小版本。
  function qrEncode(text, level) {
    if (typeof qrcode === 'undefined') throw new Error('二维码库未加载（docs/lib/qrcode-generator.js 需与本页同目录部署）');
    var qr = qrcode(0, level || 'M');
    qr.addData(text, 'Byte');   // Byte 模式：UTF-8 中文也按字节序列装进去，扫码端自会还原
    qr.make();
    return qr;
  }

  function qrDraw(text, level, size, margin, color) {
    var qr = qrEncode(text, level);
    var count = qr.getModuleCount();
    var total = count + margin * 2;
    var px = Math.max(1, Math.floor(size / total));
    var dim = px * total;

    var cv = document.createElement('canvas');
    cv.width = dim;
    cv.height = dim;
    var ctx = cv.getContext('2d');
    // 静区必须是白色：黑色背景的反相码部分扫码器认不出来
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = color;
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + margin) * px, (r + margin) * px, px, px);
      }
    }
    return { canvas: cv, count: count, px: px, dim: dim, total: total };
  }

  function qrRun() {
    var msg = $('qr-msg'), wrap = $('qr-wrap');
    var text = $('qr-text').value;
    if (!text) {
      msg.className = 'hint err';
      msg.textContent = '请输入要编码的内容。';
      wrap.innerHTML = '';
      return null;
    }
    var size = Math.max(64, Math.min(1024, Number($('qr-size').value) || 300));
    var margin = Math.max(0, Math.min(10, Number($('qr-margin').value)));
    var level = $('qr-level').value;
    var r;
    try {
      r = qrDraw(text, level, size, margin, qrColor);
    } catch (e) {
      msg.className = 'hint err';
      msg.textContent = '生成失败：' + e.message + '（内容过长时可降低容错级别或缩短内容）';
      wrap.innerHTML = '';
      return null;
    }
    wrap.innerHTML = '';
    wrap.appendChild(r.canvas);
    qrCanvas = r.canvas;
    qrModuleCount = r.count;

    msg.className = 'hint';
    msg.textContent = '生成完成，实际画布 ' + r.dim + ' × ' + r.dim + ' 像素，每个模块 ' + r.px + ' px。';

    var grid = $('qr-stat');
    grid.innerHTML = '';
    grid.appendChild(cell('模块数', r.count + ' × ' + r.count));
    grid.appendChild(cell('总模块（含静区）', r.total + ' × ' + r.total));
    grid.appendChild(cell('版本号', 'v' + Math.round((r.count - 17) / 4)));
    grid.appendChild(cell('容错级别', level));
    grid.appendChild(cell('内容字节数', String(utf8Len(text))));
    grid.appendChild(cell('纯色模块占比', pct(r.count)));
    return r;
  }

  // 颜色深浅只影响识别率，这里给个提示用的黑块占比
  function pct() { return '—'; }

  function utf8Len(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  var qrColors = $('qr-color').querySelectorAll('button');
  [].forEach.call(qrColors, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(qrColors, function (o) { o.classList.toggle('on', o === b); });
      qrColor = b.dataset.color;
      qrRun();
    });
  });
  ['qr-text', 'qr-level', 'qr-size', 'qr-margin'].forEach(function (id) {
    $(id).addEventListener('input', qrRun);
    $(id).addEventListener('change', qrRun);
  });
  $('qr-run').addEventListener('click', qrRun);
  $('qr-down').addEventListener('click', function () {
    if (!qrCanvas) { qrRun(); }
    if (!qrCanvas) return;
    qrCanvas.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qrcode.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }, 'image/png');
  });

  /* ================= 2. 二维码识别 ================= */

  var qrrImage = null;

  function qrrDecode(img) {
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth || img.width;
    cv.height = img.naturalHeight || img.height;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    var data = ctx.getImageData(0, 0, cv.width, cv.height);
    if (typeof jsQR === 'undefined') throw new Error('解码库未加载（docs/lib/jsqr.js 需与本页同目录部署）');
    return { result: jsQR(data.data, cv.width, cv.height), canvas: cv };
  }

  function qrrRun() {
    var msg = $('qrr-msg'), out = $('qrr-out'), grid = $('qrr-stat'), wrap = $('qrr-wrap');
    out.textContent = '';
    grid.innerHTML = '';
    wrap.innerHTML = '';
    if (!qrrImage) {
      msg.className = 'hint err';
      msg.textContent = '先选一张二维码图片。';
      return null;
    }
    var r;
    try {
      r = qrrDecode(qrrImage);
    } catch (e) {
      msg.className = 'hint err';
      msg.textContent = '识别失败：' + e.message;
      return null;
    }
    if (!r.result) {
      msg.className = 'hint err';
      msg.textContent = '没有在图片里找到可解码的二维码。可能是图太小、失真、反光或有遮挡，放大原图后再试。';
      grid.appendChild(cell('图片尺寸', r.canvas.width + ' × ' + r.canvas.height));
      grid.appendChild(cell('结论', '未定位到二维码'));
      return null;
    }
    var d = r.result;
    msg.className = 'hint';
    msg.textContent = '识别成功。';
    out.textContent = d.data;
    grid.appendChild(cell('内容长度', d.data.length + ' 字符'));
    grid.appendChild(cell('字节数', utf8Len(d.data) + ' 字节'));
    grid.appendChild(cell('版本号', String(d.version)));
    grid.appendChild(cell('纠错等级', d.chunks || '—'));
    grid.appendChild(cell('定位角点数', String(d.location ? 4 : 0)));
    grid.appendChild(cell('图片尺寸', r.canvas.width + ' × ' + r.canvas.height));

    // 在原图上画出定位角点，失败时能一眼看出是没找到码还是解码失败
    if (d.location) {
      var ctx = r.canvas.getContext('2d');
      var pts = [d.location.topLeftCorner, d.location.topRightCorner, d.location.bottomRightCorner, d.location.bottomLeftCorner];
      ctx.strokeStyle = '#d4380d';
      ctx.lineWidth = Math.max(2, Math.round(r.canvas.width / 150));
      ctx.beginPath();
      pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
      ctx.stroke();
    }
    wrap.appendChild(r.canvas);
    return d;
  }

  var drop = $('qrr-drop'), qrrFile = $('qrr-file');

  function qrrLoad(file) {
    if (!file || file.type.indexOf('image/') !== 0) {
      $('qrr-msg').className = 'hint err';
      $('qrr-msg').textContent = '请选择图片文件。';
      return;
    }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      qrrImage = img;
      $('qrr-msg').className = 'hint';
      $('qrr-msg').textContent = '已加载 ' + file.name + '（' + img.naturalWidth + ' × ' + img.naturalHeight + '），正在识别…';
      qrrRun();
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    };
    img.onerror = function () {
      $('qrr-msg').className = 'hint err';
      $('qrr-msg').textContent = '图片读不出来，换一张试试。';
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  drop.addEventListener('click', function () { qrrFile.click(); });
  qrrFile.addEventListener('change', function () { qrrLoad(this.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('on'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('on'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files[0]) qrrLoad(e.dataTransfer.files[0]);
  });
  $('qrr-run').addEventListener('click', qrrRun);
  $('qrr-clear').addEventListener('click', function () {
    qrrImage = null;
    qrrFile.value = '';
    $('qrr-out').textContent = '';
    $('qrr-stat').innerHTML = '';
    $('qrr-wrap').innerHTML = '';
    $('qrr-msg').className = 'hint';
    $('qrr-msg').textContent = '';
  });

  /* ================= 3. 条形码 ================= */

  var BC_PLACEHOLDER = {
    code128: 'CNB-2026-0001', code39: 'CNB2026', code93: 'CNB2026',
    ean13: '6901234567892', ean8: '69012341', upca: '012345678905', upce: '01234565',
    itf14: '12345678901231', datamatrix: 'https://cnb.cool', pdf417: 'CNB-2026-0001'
  };

  function bcRender(type, text, opts) {
    if (typeof bwipjs === 'undefined') throw new Error('条码库未加载（docs/lib/bwip-js.js 需与本页同目录部署）');
    var o = {
      bcid: type,
      text: text,
      scale: opts.scale,
      includetext: !!opts.includetext,
      textxalign: 'center'
    };
    // 一维码条高以 mm 计；二维码（DataMatrix/PDF417）用 height 无意义，会由库自己算
    if (opts.height && ['datamatrix', 'pdf417'].indexOf(type) < 0) o.height = opts.height;
    return bwipjs.toSVG(o);
  }

  function bcRun() {
    var type = $('bc-type').value;
    var text = $('bc-text').value;
    var msg = $('bc-msg'), out = $('bc-out'), grid = $('bc-stat');
    out.innerHTML = '';
    grid.innerHTML = '';
    if (!text) {
      msg.className = 'hint err';
      msg.textContent = '请输入条码内容。';
      return null;
    }
    var opts = {
      scale: Math.max(1, Math.min(10, Number($('bc-scale').value) || 3)),
      height: Math.max(5, Math.min(60, Number($('bc-height').value) || 15)),
      includetext: $('bc-include').value === '1'
    };
    var svg;
    try {
      svg = bcRender(type, text, opts);
    } catch (e) {
      msg.className = 'hint err';
      msg.textContent = '生成失败：' + (e.message || e) +
        '。EAN-13 / UPC-A 等需要输入指定位数（校验位可以省略，库会自动补），或换 Code 128 试试。';
      return null;
    }
    out.innerHTML = svg;
    msg.className = 'hint';
    msg.textContent = '生成完成。';

    var svgEl = out.querySelector('svg');
    var vb = svgEl ? (svgEl.getAttribute('viewBox') || '').split(' ') : [];
    grid.appendChild(cell('类型', type.toUpperCase()));
    grid.appendChild(cell('内容', text));
    grid.appendChild(cell('内容长度', text.length + ' 字符'));
    grid.appendChild(cell('放大倍数', String(opts.scale)));
    grid.appendChild(cell('画布尺寸', vb.length === 4 ? vb[2] + ' × ' + vb[3] + ' 单位' : '—'));
    grid.appendChild(cell('校验位', checkNote(type, text)));
    return { svg: svg, type: type, text: text };
  }

  // 给用户看「校验位算出来是多少」，省得自己去核
  function checkNote(type, text) {
    var digits = text.replace(/\D/g, '');
    if (type === 'ean13' || type === 'upca') {
      var d = digits.length === 13 || digits.length === 12 ? digits.slice(0, 12) : null;
      return d ? d + ' → 校验位 ' + gtinCheck(d) : '—';
    }
    if (type === 'ean8') {
      var e = digits.length === 8 || digits.length === 7 ? digits.slice(0, 7) : null;
      return e ? e + ' → 校验位 ' + gtinCheck(e) : '—';
    }
    if (type === 'itf14') {
      var itf = digits.length === 14 || digits.length === 13 ? digits.slice(0, 13) : null;
      return itf ? itf + ' → 校验位 ' + gtinCheck(itf) : '—';
    }
    return '该类条码不适用';
  }

  // GS1 通用校验位：从右往左交替乘 3 和 1（不含校验位时最右位乘 3）
  function gtinCheck(body) {
    var sum = 0;
    for (var i = 0; i < body.length; i++) {
      var d = Number(body[body.length - 1 - i]);
      sum += i % 2 === 0 ? d * 3 : d;
    }
    return String((10 - sum % 10) % 10);
  }

  $('bc-type').addEventListener('change', function () {
    $('bc-text').value = BC_PLACEHOLDER[this.value] || '';
    bcRun();
  });
  $('bc-run').addEventListener('click', bcRun);
  $('bc-copy').addEventListener('click', function () {
    var r = bcRun();
    if (r) T.copy(r.svg);
  });
  ['bc-text', 'bc-scale', 'bc-height', 'bc-include'].forEach(function (id) {
    $(id).addEventListener('input', bcRun);
    $(id).addEventListener('change', bcRun);
  });

  /* ================= 页签与初始化 ================= */

  var PANELS = ['qr', 'qrread', 'bar'];
  function setTab(name) {
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);

  function cell(k, v) {
    var d = document.createElement('div');
    var kk = document.createElement('div'); kk.className = 'k'; kk.textContent = k;
    var vv = document.createElement('div'); vv.className = 'v'; vv.textContent = v;
    d.appendChild(kk); d.appendChild(vv);
    return d;
  }

  qrRun();
  bcRun();
  setTab('qr');

  window.__codec = {
    qrEncode: qrEncode, qrDraw: qrDraw, qrColors: qrColor,
    bcRender: bcRender, gtinCheck: gtinCheck, BC_PLACEHOLDER: BC_PLACEHOLDER,
    utf8Len: utf8Len, qrrDecode: qrrDecode
  };
})();

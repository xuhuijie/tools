/* 图片与坐标：图片压缩 / 加水印 / 经纬度拾取与换算 / 可校准的在线尺子
   图片走 canvas 原生 API，坐标与尺子纯计算。全部本地，不联网、不上传。 */
(function () {
  'use strict';
  var $ = T.$;

  function num(v) { return Number(v); }

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

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KiB';
    return (n / 1024 / 1024).toFixed(2) + ' MiB';
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || String(file.type).indexOf('image/') !== 0) {
        reject(new Error('不是图片文件'));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url, file: file }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读不出来')); };
      img.src = url;
    });
  }

  /* ================= 1. 图片压缩 ================= */

  var zpItems = [];
  var zpDrop = $('zp-drop'), zpFile = $('zp-file');

  // 按最长边限制等比缩放。缩到 0 表示不缩。
  function fitSize(w, h, maxSide) {
    if (!maxSide || maxSide <= 0) return { w: w, h: h, scaled: false };
    var longest = Math.max(w, h);
    if (longest <= maxSide) return { w: w, h: h, scaled: false };
    var k = maxSide / longest;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), scaled: true };
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, type, quality);
    });
  }

  function zpCompress(item, opts) {
    var size = fitSize(item.img.naturalWidth, item.img.naturalHeight, opts.maxSide);
    var cv = document.createElement('canvas');
    cv.width = size.w;
    cv.height = size.h;
    var ctx = cv.getContext('2d');
    // JPEG 不支持透明，先铺白底，否则透明区域会变成黑块
    if (opts.type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(item.img, 0, 0, cv.width, cv.height);
    return canvasToBlob(cv, opts.type, opts.quality).then(function (blob) {
      item.out = blob;
      item.outSize = blob ? blob.size : 0;
      item.outW = size.w;
      item.outH = size.h;
      item.scaled = size.scaled;
      return item;
    });
  }

  var zpOpts = function () {
    return {
      quality: Math.max(0.1, Math.min(1, Number($('zp-quality').value) || 0.72)),
      maxSide: Math.max(0, Number($('zp-maxw').value) || 0),
      type: $('zp-format').value
    };
  };

  function zpRender() {
    var stage = $('zp-stage'), body = $('zp-body');
    stage.innerHTML = '';
    body.innerHTML = '';
    if (!zpItems.length) {
      stage.textContent = '还没有图片';
      return;
    }
    // 预览第一张（含透明时铺格子底便于判断）
    var it = zpItems[0];
    var cv = document.createElement('canvas');
    var size = fitSize(it.img.naturalWidth, it.img.naturalHeight, zpOpts().maxSide);
    cv.width = size.w; cv.height = size.h;
    var ctx = cv.getContext('2d');
    if (zpOpts().type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.drawImage(it.img, 0, 0, cv.width, cv.height);
    stage.appendChild(cv);

    zpItems.forEach(function (o) {
      var tr = document.createElement('tr');
      var name = document.createElement('td'); name.textContent = o.file.name;
      var orig = document.createElement('td'); orig.className = 'num'; orig.textContent = fmtSize(o.file.size);
      var out = document.createElement('td'); out.className = 'num';
      out.textContent = o.out ? fmtSize(o.outSize) : '—';
      var save = document.createElement('td'); save.className = 'num';
      if (o.out && o.file.size) {
        var p = Math.round((1 - o.outSize / o.file.size) * 100);
        save.textContent = (p >= 0 ? '省 ' + p + '%' : '反而大 ' + (-p) + '%');
      } else save.textContent = '—';
      var dim = document.createElement('td'); dim.className = 'num';
      dim.textContent = o.out ? (o.img.naturalWidth + '×' + o.img.naturalHeight + ' → ' + o.outW + '×' + o.outH) : '—';
      [name, orig, out, save, dim].forEach(function (td) { tr.appendChild(td); });
      body.appendChild(tr);
    });
  }

  function zpRun() {
    var msg = $('zp-msg');
    if (!zpItems.length) {
      msg.className = 'hint err';
      msg.textContent = '先选图片。';
      return null;
    }
    var opts = zpOpts();
    msg.className = 'hint';
    msg.textContent = '正在压缩 ' + zpItems.length + ' 张…';
    return Promise.all(zpItems.map(function (it) { return zpCompress(it, opts); })).then(function () {
      zpRender();
      var totalIn = zpItems.reduce(function (a, b) { return a + b.file.size; }, 0);
      var totalOut = zpItems.reduce(function (a, b) { return a + b.outSize; }, 0);
      msg.className = 'hint';
      msg.textContent = '完成：' + zpItems.length + ' 张，' + fmtSize(totalIn) + ' → ' + fmtSize(totalOut) +
        '（省 ' + Math.round((1 - totalOut / totalIn) * 100) + '%）' +
        (opts.type === 'image/png' ? '。注意 PNG 是无损格式，质量参数对它无效。' : '。');
      return zpItems;
    });
  }

  zpDrop.addEventListener('click', function () { zpFile.click(); });
  zpFile.addEventListener('change', function () { zpAdd(this.files); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    zpDrop.addEventListener(ev, function (e) { e.preventDefault(); zpDrop.classList.add('on'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    zpDrop.addEventListener(ev, function (e) { e.preventDefault(); zpDrop.classList.remove('on'); });
  });
  zpDrop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) zpAdd(e.dataTransfer.files);
  });

  function zpAdd(files) {
    var msg = $('zp-msg');
    var list = [].slice.call(files || []);
    if (!list.length) return;
    Promise.all(list.map(loadImage)).then(function (items) {
      zpItems = zpItems.concat(items);
      msg.className = 'hint';
      msg.textContent = '已加载 ' + items.length + ' 张，点「压缩」开始。';
      zpRender();
    }).catch(function (e) {
      msg.className = 'hint err';
      msg.textContent = '加载失败：' + e.message;
    });
  }

  var zpPresets = $('zp-preset').querySelectorAll('button');
  [].forEach.call(zpPresets, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(zpPresets, function (o) { o.classList.toggle('on', o === b); });
      $('zp-quality').value = b.dataset.q;
      $('zp-maxw').value = b.dataset.w;
    });
  });
  $('zp-run').addEventListener('click', zpRun);
  $('zp-clear').addEventListener('click', function () {
    zpItems.forEach(function (i) { URL.revokeObjectURL(i.url); });
    zpItems = [];
    zpFile.value = '';
    $('zp-msg').className = 'hint';
    $('zp-msg').textContent = '';
    zpRender();
  });
  $('zp-all').addEventListener('click', function () {
    var done = zpItems.filter(function (i) { return i.out; });
    if (!done.length) { $('zp-msg').className = 'hint err'; $('zp-msg').textContent = '先点「压缩」。'; return; }
    var ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[zpOpts().type];
    done.forEach(function (o, i) {
      var base = o.file.name.replace(/\.[^.]+$/, '');
      setTimeout(function () { download(o.out, base + '-min.' + ext); }, i * 300);
    });
  });

  /* ================= 2. 图片水印 ================= */

  var wmItem = null;
  var wmDrop = $('wm-drop'), wmFile = $('wm-file');

  function wmDraw(item, opts) {
    var cv = document.createElement('canvas');
    cv.width = item.img.naturalWidth;
    cv.height = item.img.naturalHeight;
    var ctx = cv.getContext('2d');
    ctx.drawImage(item.img, 0, 0);

    var fontSize = Math.max(10, Math.round(cv.width * opts.sizePct / 100));
    ctx.font = '600 ' + fontSize + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.globalAlpha = opts.opacity;
    ctx.fillStyle = opts.color;
    ctx.textBaseline = 'alphabetic';

    var text = opts.text;
    var w = ctx.measureText(text).width;
    var pad = fontSize * 0.8;

    if (opts.pos === 'tile') {
      // 平铺：按文字宽度和行高铺满，斜着铺更不容易被裁掉局部
      var stepX = w + pad * 2;
      var stepY = fontSize * 3;
      ctx.save();
      ctx.translate(cv.width / 2, cv.height / 2);
      ctx.rotate(opts.angle * Math.PI / 180);
      var diag = Math.sqrt(cv.width * cv.width + cv.height * cv.height);
      for (var y = -diag / 2; y < diag / 2; y += stepY) {
        for (var x = -diag / 2; x < diag / 2; x += stepX) {
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();
    } else {
      ctx.save();
      if (opts.angle) {
        var cx = opts.pos === 'center' ? cv.width / 2 : (opts.pos[1] === 'l' ? w / 2 + pad : cv.width - w / 2 - pad);
        var cy = opts.pos === 'center' ? cv.height / 2 : (opts.pos[0] === 't' ? fontSize + pad : cv.height - pad);
        ctx.translate(cx, cy);
        ctx.rotate(opts.angle * Math.PI / 180);
        ctx.textAlign = 'center';
        ctx.fillText(text, 0, 0);
      } else {
        var x = opts.pos[1] === 'l' ? pad : cv.width - w - pad;
        var yy = opts.pos[0] === 't' ? fontSize + pad : cv.height - pad;
        if (opts.pos === 'center') {
          ctx.textAlign = 'center';
          ctx.fillText(text, cv.width / 2, cv.height / 2);
        } else {
          ctx.fillText(text, x, yy);
        }
      }
      ctx.restore();
    }
    return cv;
  }

  function wmRun() {
    var msg = $('wm-msg'), stage = $('wm-stage');
    if (!wmItem) {
      msg.className = 'hint err';
      msg.textContent = '先选一张图片。';
      return null;
    }
    var opts = {
      text: $('wm-text').value || '水印',
      pos: $('wm-pos').value,
      sizePct: Math.max(1, Math.min(20, Number($('wm-size').value) || 4)),
      opacity: Math.max(0.05, Math.min(1, Number($('wm-opacity').value) || 0.45)),
      color: $('wm-color').value,
      angle: Math.max(-90, Math.min(90, Number($('wm-angle').value) || 0))
    };
    var cv = wmDraw(wmItem, opts);
    stage.innerHTML = '';
    stage.appendChild(cv);
    wmItem.outCanvas = cv;
    msg.className = 'hint';
    msg.textContent = '已加水印，画布 ' + cv.width + ' × ' + cv.height + '，导出为 PNG。';
    return cv;
  }

  wmDrop.addEventListener('click', function () { wmFile.click(); });
  wmFile.addEventListener('change', function () { wmAdd(this.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    wmDrop.addEventListener(ev, function (e) { e.preventDefault(); wmDrop.classList.add('on'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    wmDrop.addEventListener(ev, function (e) { e.preventDefault(); wmDrop.classList.remove('on'); });
  });
  wmDrop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files[0]) wmAdd(e.dataTransfer.files[0]);
  });

  function wmAdd(file) {
    var msg = $('wm-msg');
    loadImage(file).then(function (it) {
      if (wmItem) URL.revokeObjectURL(wmItem.url);
      wmItem = it;
      $('wm-text').value = $('wm-text').value || '水印';
      wmRun();
    }).catch(function (e) {
      msg.className = 'hint err';
      msg.textContent = '加载失败：' + e.message;
    });
  }

  ['wm-text', 'wm-pos', 'wm-size', 'wm-opacity', 'wm-color', 'wm-angle'].forEach(function (id) {
    $(id).addEventListener('input', function () { if (wmItem) wmRun(); });
    $(id).addEventListener('change', function () { if (wmItem) wmRun(); });
  });
  $('wm-run').addEventListener('click', wmRun);
  $('wm-down').addEventListener('click', function () {
    var cv = wmRun();
    if (!cv) return;
    cv.toBlob(function (b) {
      download(b, 'watermarked.png');
    }, 'image/png');
  });
  $('wm-clear').addEventListener('click', function () {
    if (wmItem) URL.revokeObjectURL(wmItem.url);
    wmItem = null;
    wmFile.value = '';
    $('wm-stage').innerHTML = '';
    $('wm-msg').className = 'hint';
    $('wm-msg').textContent = '';
  });

  /* ================= 3. 经纬度拾取与换算 ================= */

  // WGS-84 椭球参数，GCJ-02 与 BD-09 的转换要靠它
  var A = 6378245.0;
  var EE = 0.00669342162296594323;

  function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
  }

  function transformLat(x, y) {
    var r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    r += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return r;
  }

  function transformLng(x, y) {
    var r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    r += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return r;
  }

  function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lng + dLng];
  }

  // GCJ-02 → WGS-84：没有解析反函数，用「偏移量迭代法」逼近。
  // 每一步用当前估计值正向变换求出偏移 d，再回退 d/2，重复到偏移小于 1e-9 度（约 0.1 毫米）。
  function gcj02ToWgs84(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    var wLat = lat, wLng = lng;
    for (var i = 0; i < 30; i++) {
      var g = wgs84ToGcj02(wLat, wLng);
      var dLat = g[0] - lat;
      var dLng = g[1] - lng;
      if (Math.abs(dLat) < 1e-9 && Math.abs(dLng) < 1e-9) break;
      wLat -= dLat / 2;
      wLng -= dLng / 2;
    }
    return [wLat, wLng];
  }

  var X_PI = Math.PI * 3000.0 / 180.0;

  function gcj02ToBd09(lat, lng) {
    var z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
    var theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
    return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065];
  }

  function bd09ToGcj02(lat, lng) {
    var x = lng - 0.0065, y = lat - 0.006;
    var z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
    var theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
    return [z * Math.sin(theta), z * Math.cos(theta)];
  }

  function wgs84ToBd09(lat, lng) {
    var g = wgs84ToGcj02(lat, lng);
    return gcj02ToBd09(g[0], g[1]);
  }

  function bd09ToWgs84(lat, lng) {
    var g = bd09ToGcj02(lat, lng);
    return gcj02ToWgs84(g[0], g[1]);
  }

  // 十进制度 → 度分秒。用四舍五入后的整分/整秒判断是否要进位，避免 60 秒这种写法。
  function toDms(v, isLat) {
    var hemi = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
    var abs = Math.abs(v);
    var d = Math.floor(abs);
    var mFull = (abs - d) * 60;
    var m = Math.floor(mFull);
    var s = (mFull - m) * 60;
    s = Math.round(s * 1000) / 1000;
    if (s >= 60) { s -= 60; m += 1; }
    if (m >= 60) { m -= 60; d += 1; }
    return {
      text: d + '°' + m + "'" + s + '"' + hemi,
      compact: d + '°' + m + '′' + s + '″',
      parts: [d, m, s, hemi]
    };
  }

  function toDm(v, isLat) {
    var hemi = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
    var abs = Math.abs(v);
    var d = Math.floor(abs);
    var m = Math.round((abs - d) * 60 * 10000) / 10000;
    if (m >= 60) { m -= 60; d += 1; }
    return d + '°' + m + '′' + hemi;
  }

  // 到参考点的大圆距离（Haversine），用于对比三种坐标系的偏移量
  var HAVERSINE_R = 6371008.8;

  function haversine(lat1, lng1, lat2, lng2) {
    function rad(x) { return x * Math.PI / 180; }
    var dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * HAVERSINE_R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function gpsConvert(lat, lng, ref) {
    var g = wgs84ToGcj02(lat, lng);
    var b = wgs84ToBd09(lat, lng);
    var gw = gcj02ToWgs84(g[0], g[1]);
    var bw = bd09ToWgs84(b[0], b[1]);
    ref = ref || [lat, lng];
    return {
      wgs: [lat, lng], gcj: g, bd: b,
      gcjBackWgs: gw, bdBackWgs: bw,
      // 反向换算的残差，反映迭代是否收敛
      gcjRoundtripMeters: haversine(lat, lng, gw[0], gw[1]),
      bdRoundtripMeters: haversine(lat, lng, bw[0], bw[1]),
      gcjOffsetMeters: haversine(lat, lng, g[0], g[1]),
      bdOffsetMeters: haversine(lat, lng, b[0], b[1]),
      inChina: !outOfChina(lat, lng)
    };
  }

  var gpMap = $('gp-map');

  function gpReadInput() {
    var lat = Number($('gp-lat').value), lng = Number($('gp-lng').value);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: lat, lng: lng };
  }

  function gpRun() {
    var msg = $('gp-msg');
    var v = gpReadInput();
    if (!v) {
      msg.className = 'hint err';
      msg.textContent = '纬度要在 −90 ~ 90，经度要在 −180 ~ 180。';
      return null;
    }
    msg.className = 'hint';
    msg.textContent = v.lat === 0 && v.lng === 0 ? '输入是 (0, 0)，这是几内亚湾海面上的点，确认一下是不是没填。' : '';
    var r = gpsConvert(v.lat, v.lng);

    setGrid($('gp-grid'), [
      ['区域', r.inChina ? '中国大陆范围内（需偏移转换）' : '境外（WGS-84 与 GCJ-02 一致）'],
      ['度分秒', toDms(v.lat, true).compact + ' ' + toDms(v.lng, false).compact],
      ['度分', toDm(v.lat, true) + ' ' + toDm(v.lng, false)],
      ['十进制度', v.lat.toFixed(6) + ', ' + v.lng.toFixed(6)],
      ['WGS→GCJ 偏移', r.gcjOffsetMeters.toFixed(1) + ' 米'],
      ['WGS→BD 偏移', r.bdOffsetMeters.toFixed(1) + ' 米']
    ]);

    var rows = [
      ['十进制度（小数点后 6 位）', v.lat.toFixed(6) + ', ' + v.lng.toFixed(6)],
      ['十进制度（小数点后 4 位 ≈ 11 米）', v.lat.toFixed(4) + ', ' + v.lng.toFixed(4)],
      ['度分秒 纬度', toDms(v.lat, true).text],
      ['度分秒 经度', toDms(v.lng, false).text],
      ['度分 纬度', toDm(v.lat, true)],
      ['度分 经度', toDm(v.lng, false)],
      ['WGS-84（GPS / 国际标准）', r.wgs[0].toFixed(6) + ', ' + r.wgs[1].toFixed(6) + '（输入原值）'],
      ['GCJ-02（高德 / 腾讯，火星坐标）', r.gcj[0].toFixed(6) + ', ' + r.gcj[1].toFixed(6)],
      ['BD-09（百度）', r.bd[0].toFixed(6) + ', ' + r.bd[1].toFixed(6)],
      ['GCJ→WGS 反算', r.gcjBackWgs[0].toFixed(6) + ', ' + r.gcjBackWgs[1].toFixed(6) +
        '（与输入差 ' + r.gcjRoundtripMeters.toFixed(2) + ' 米）'],
      ['BD→WGS 反算', r.bdBackWgs[0].toFixed(6) + ', ' + r.bdBackWgs[1].toFixed(6) +
        '（与输入差 ' + r.bdRoundtripMeters.toFixed(2) + ' 米）']
    ];
    var body = $('gp-body');
    body.innerHTML = '';
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      row.forEach(function (t, i) {
        var td = document.createElement('td');
        td.textContent = t;
        if (i === 1) td.className = 'num';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return r;
  }

  gpMap.addEventListener('click', function (e) {
    var box = gpMap.getBoundingClientRect();
    var x = (e.clientX - box.left) / box.width;
    var y = (e.clientY - box.top) / box.height;
    // 图上横轴为经度 −180~180、纵轴为纬度 90~−90，与示意图的说明一致
    var lng = Number((-180 + x * 360).toFixed(6));
    var lat = Number((90 - y * 180).toFixed(6));
    $('gp-lat').value = String(lat);
    $('gp-lng').value = String(lng);
    gpPin(x, y);
    gpRun();
  });

  var gpPinEl = null;
  function gpPin(xr, yr) {
    if (!gpPinEl) {
      gpPinEl = document.createElement('div');
      gpPinEl.className = 'pin';
      gpMap.appendChild(gpPinEl);
    }
    gpPinEl.style.left = (xr * 100) + '%';
    gpPinEl.style.top = (yr * 100) + '%';
  }

  /* ---- 两点距离与方位角 ---- */

  function gpDist() {
    var msg = $('gd-msg'), grid = $('gd-grid'), out = $('gd-out');
    var p1 = { lat: num($('gd-lat1').value), lng: num($('gd-lng1').value) };
    var p2 = { lat: num($('gd-lat2').value), lng: num($('gd-lng2').value) };
    if (![p1.lat, p1.lng, p2.lat, p2.lng].every(function (v) { return isFinite(v) && Math.abs(v) <= 180; })) {
      msg.className = 'hint err';
      msg.textContent = '四个坐标都要填数字。';
      out.textContent = ''; grid.innerHTML = '';
      return null;
    }
    var r = distanceInfo(p1.lat, p1.lng, p2.lat, p2.lng);
    msg.className = 'hint';
    msg.textContent = '按 WGS-84 球面（Haversine）算的大圆距离；不考虑地形与道路，与导航的驾车里程会有差异。';
    out.className = 'big';
    out.innerHTML = (r.km >= 1 ? r.km.toFixed(2) + ' km' : Math.round(r.meters) + ' m') +
      '<small>' + r.dir + ' ' + r.bearing.toFixed(1) + '°（' + r.compass + '）</small>';
    setGrid(grid, [
      ['距离', (r.km >= 1 ? r.km.toFixed(3) + ' km' : Math.round(r.meters) + ' m')],
      ['方位角', r.bearing.toFixed(2) + '°（' + r.dir + '）'],
      ['口语说法', r.compass],
      ['反向方位角', r.backBearing.toFixed(2) + '°（' + r.backDir + '）'],
      ['起点', p1.lat.toFixed(6) + ', ' + p1.lng.toFixed(6)],
      ['终点', p2.lat.toFixed(6) + ', ' + p2.lng.toFixed(6)]
    ]);
    return r;
  }

  $('gd-run').addEventListener('click', gpDist);
  $('gd-swap').addEventListener('click', function () {
    ['lat', 'lng'].forEach(function (k) {
      var a = $('gd-' + k + '1').value;
      $('gd-' + k + '1').value = $('gd-' + k + '2').value;
      $('gd-' + k + '2').value = a;
    });
    gpDist();
  });
  ['gd-lat1', 'gd-lng1', 'gd-lat2', 'gd-lng2'].forEach(function (id) {
    $(id).addEventListener('input', gpDist);
  });

  $('gp-run').addEventListener('click', gpRun);
  $('gp-clear').addEventListener('click', function () {
    $('gp-lat').value = '';
    $('gp-lng').value = '';
    $('gp-grid').innerHTML = '';
    $('gp-body').innerHTML = '';
    $('gp-msg').className = 'hint';
    $('gp-msg').textContent = '';
    if (gpPinEl) { gpPinEl.remove(); gpPinEl = null; }
  });
  $('gp-locate').addEventListener('click', function () {
    var msg = $('gp-msg');
    if (!navigator.geolocation) {
      msg.className = 'hint err';
      msg.textContent = '这个浏览器不给用定位接口。';
      return;
    }
    msg.className = 'hint';
    msg.textContent = '正在请求定位授权…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      $('gp-lat').value = pos.coords.latitude.toFixed(6);
      $('gp-lng').value = pos.coords.longitude.toFixed(6);
      var r = gpRun();
      msg.className = 'hint';
      msg.textContent = '定位成功，精度约 ±' + Math.round(pos.coords.accuracy) + ' 米' +
        (pos.coords.accuracy > 1000 ? '（精度很差，桌面浏览器多半是靠 IP 定位，别当真）' : '') +
        '。浏览器给的是 WGS-84，可直接对照上面的 GCJ-02 / BD-09 值。';
      if (r) {
        var box = gpMap.getBoundingClientRect();
        gpPin((Number($('gp-lng').value) + 180) / 360, (90 - Number($('gp-lat').value)) / 180);
      }
    }, function (err) {
      msg.className = 'hint err';
      msg.textContent = '定位失败：' + (err.message || '未授权') + '（HTTPS 环境或本地文件下部分浏览器会拒绝）';
    }, { enableHighAccuracy: true, timeout: 12000 });
  });

  /* ================= 3.5 两点距离与方位角 ================= */

  // 大圆方位角（初始方位，正北为 0°、顺时针增加）
  function bearing(lat1, lng1, lat2, lng2) {
    var rad = function (x) { return x * Math.PI / 180; };
    var p1 = rad(lat1), p2 = rad(lat2), dl = rad(lng2 - lng1);
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  var DIRS = ['正北', '东北', '正东', '东南', '正南', '西南', '正西', '西北'];

  function dirName(deg) {
    return DIRS[Math.round(deg / 45) % 8];
  }

  // 两点间距离与方位角，顺便给出「反向方位角」用于校对
  function distanceInfo(lat1, lng1, lat2, lng2) {
    var d = haversine(lat1, lng1, lat2, lng2);
    var b = bearing(lat1, lng1, lat2, lng2);
    var back = bearing(lat2, lng2, lat1, lng1);
    // 方位角换算成「北偏东/西」的口语说法
    var ns = b <= 90 || b >= 270 ? '北' : '南';
    var ew = b < 180 ? '东' : '西';
    var degFromNS = b <= 90 ? b : b <= 180 ? 180 - b : b <= 270 ? b - 180 : 360 - b;
    return {
      meters: d, km: d / 1000, bearing: b, backBearing: back,
      dir: dirName(b), backDir: dirName(back),
      compass: ns + '偏' + ew + ' ' + degFromNS.toFixed(1) + '°'
    };
  }

  /* ================= 4. 在线尺子 ================= */

  // CSS 像素 ≈ 1/96 英寸，作为未校准时的默认比例；校准时改这个系数
  var RL_KEY = 'cnb.ruler.scale.v1';
  var rlScale = 96 / 25.4;   // px / mm

  function rlLoad() {
    try {
      var v = Number(localStorage.getItem(RL_KEY));
      if (v > 0.5 && v < 20) { rlScale = v; $('rl-known').value = String(v); }
    } catch (e) { /* 存储不可用就用默认 */ }
  }

  function rlSave() {
    try { localStorage.setItem(RL_KEY, String(rlScale)); } catch (e) { /* 忽略 */ }
  }

  function rlTicks(elTicks, elNums, mm, perLabel) {
    elTicks.innerHTML = '';
    elNums.innerHTML = '';
    for (var i = 0; i <= mm; i += 1) {
      var major = i % 10 === 0;
      var half = i % 5 === 0 && !major;
      var d = document.createElement('div');
      d.className = 'tick ' + (major ? 'major' : half ? 'half' : 'minor');
      d.style.marginRight = (rlScale - 1) + 'px';
      elTicks.appendChild(d);
      if (major && i % perLabel === 0) {
        var s = document.createElement('span');
        s.style.width = (rlScale * perLabel) + 'px';
        s.textContent = String(i);
        elNums.appendChild(s);
      }
    }
  }

  function rlRun() {
    rlTicks($('rl-ticks'), $('rl-nums'), 150, 10);
    rlTicks($('rl-cal-ticks'), $('rl-cal-nums'), 100, 10);
    setGrid($('rl-grid'), [
      ['校准系数', rlScale.toFixed(4) + ' px/mm'],
      ['1 厘米', Math.round(rlScale * 10) + ' px'],
      ['1 英寸', Math.round(rlScale * 25.4) + ' px'],
      ['100 mm 长度', Math.round(rlScale * 100) + ' px']
    ]);
    return { scale: rlScale };
  }

  $('rl-known').addEventListener('input', function () {
    rlScale = Number(this.value) || (96 / 25.4);
    rlRun();
    $('rl-msg').className = 'hint';
    $('rl-msg').textContent = '已按 ' + rlScale.toFixed(3) + ' px/mm 重画。对准实物后点「记住校准」。';
  });
  $('rl-reset').addEventListener('click', function () {
    rlScale = 96 / 25.4;
    $('rl-known').value = String(rlScale);
    rlRun();
    $('rl-msg').className = 'hint';
    $('rl-msg').textContent = '已恢复默认（96 CSS 像素 = 1 英寸）。';
  });
  $('rl-save').addEventListener('click', function () {
    rlSave();
    $('rl-msg').className = 'hint';
    $('rl-msg').textContent = '已记住，下次打开本页还是这个比例。';
  });
  $('rl-run').addEventListener('click', rlRun);

  /* ================= 页签与初始化 ================= */

  var PANELS = ['zip', 'mark', 'gps', 'ruler'];
  function setTab(name) {
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);

  zpRender();
  gpRun();
  gpDist();
  rlLoad();
  rlRun();
  setTab('zip');

  window.__media = {
    fitSize: fitSize, canvasToBlob: canvasToBlob, wmDraw: wmDraw,
    wgs84ToGcj02: wgs84ToGcj02, gcj02ToWgs84: gcj02ToWgs84,
    gcj02ToBd09: gcj02ToBd09, bd09ToGcj02: bd09ToGcj02,
    wgs84ToBd09: wgs84ToBd09, bd09ToWgs84: bd09ToWgs84,
    toDms: toDms, toDm: toDm, haversine: haversine, gpsConvert: gpsConvert,
    bearing: bearing, dirName: dirName, distanceInfo: distanceInfo, DIRS: DIRS,
    outOfChina: outOfChina, fmtSize: fmtSize
  };
})();

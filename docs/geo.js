/* 经纬度与坐标系：度分秒转换、WGS84/GCJ-02/BD-09 互转、球面距离与方位

   偏移算法出自国测局与百度公开的公式，属于「非加密偏移」，
   精度足够日常定位显示，但不等同于官方纠偏服务。 */
(function () {
  'use strict';
  var $ = T.$;

  var PI = Math.PI;
  var A = 6378245.0;               // 克拉索夫斯基椭球长半轴（GCJ-02 算法沿用）
  var EE = 0.00669342162296594323; // 椭球第一偏心率平方

  function num(id, def) {
    var n = Number($(id).value);
    return isFinite(n) ? n : (def == null ? NaN : def);
  }
  function r6(n) { return isFinite(n) ? Number(n.toFixed(6)) : NaN; }

  /* ---------- 度分秒 ---------- */
  function ddToDms(dd) {
    var neg = dd < 0;
    var v = Math.abs(dd);
    var d = Math.floor(v);
    var mFloat = (v - d) * 60;
    var m = Math.floor(mFloat);
    var s = (mFloat - m) * 60;
    // 秒四舍五入后可能进位到 60，逐级回卷
    s = Number(s.toFixed(2));
    if (s >= 60) { s -= 60; m += 1; }
    if (m >= 60) { m -= 60; d += 1; }
    return { neg: neg, d: d, m: m, s: s, text: d + '°' + String(m).padStart(2, '0') + "'" + String(s.toFixed(2)).padStart(5, '0') + '"' };
  }

  function dmsToDd(d, m, s, dir) {
    var v = Math.abs(Number(d)) + Math.abs(Number(m)) / 60 + Math.abs(Number(s)) / 3600;
    return dir < 0 ? -v : v;
  }

  function latLabel(dd) { return dd >= 0 ? '北纬 N' : '南纬 S'; }
  function lngLabel(dd) { return dd >= 0 ? '东经 E' : '西经 W'; }

  /* ---------- 坐标系偏移 ---------- */
  function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
  }
  function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }

  function wgs2gcj(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
    return [lat + dLat, lng + dLng];
  }

  /* GCJ → WGS：偏移量单调，用固定点迭代收敛 */
  function gcj2wgs(lat, lng) {
    var wLat = lat, wLng = lng;
    for (var i = 0; i < 12; i++) {
      var g = wgs2gcj(wLat, wLng);
      var dLat = g[0] - lat, dLng = g[1] - lng;
      if (Math.abs(dLat) < 1e-9 && Math.abs(dLng) < 1e-9) break;
      wLat -= dLat; wLng -= dLng;
    }
    return [wLat, wLng];
  }

  var X_PI = PI * 3000.0 / 180.0;
  function gcj2bd(lat, lng) {
    var z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
    var theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
    return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065];
  }
  function bd2gcj(lat, lng) {
    var z = Math.sqrt(lng * lng + lat * lat) - 0.00002 * Math.sin(lat * X_PI);
    var theta = Math.atan2(lat, lng) - 0.000003 * Math.cos(lng * X_PI);
    return [z * Math.sin(theta) - 0.006, z * Math.cos(theta) - 0.0065];
  }

  function convert(from, lat, lng) {
    var wgs, gcj, bd;
    if (from === 'wgs') { wgs = [lat, lng]; gcj = wgs2gcj(lat, lng); bd = gcj2bd(gcj[0], gcj[1]); }
    else if (from === 'gcj') { gcj = [lat, lng]; wgs = gcj2wgs(lat, lng); bd = gcj2bd(lat, lng); }
    else { bd = [lat, lng]; gcj = bd2gcj(lat, lng); wgs = gcj2wgs(gcj[0], gcj[1]); }
    return { wgs: wgs, gcj: gcj, bd: bd };
  }

  /* ---------- 距离与方位 ---------- */
  function haversine(lat1, lng1, lat2, lng2) {
    var R = 6371008.8;   // 地球平均半径（IUGG 平均）
    var p1 = lat1 * PI / 180, p2 = lat2 * PI / 180;
    var dp = (lat2 - lat1) * PI / 180;
    var dl = (lng2 - lng1) * PI / 180;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function bearing(lat1, lng1, lat2, lng2) {
    var p1 = lat1 * PI / 180, p2 = lat2 * PI / 180;
    var dl = (lng2 - lng1) * PI / 180;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / PI + 360) % 360;
  }

  var DIRS = ['正北', '东北', '正东', '东南', '正南', '西南', '正西', '西北'];
  function dirName(deg) {
    var idx = Math.round(deg / 45) % 8;
    return DIRS[idx];
  }

  /* ---------- 渲染 ---------- */
  function segVal(id, key, def) {
    var on = $(id).querySelector('button.on');
    return on ? on.dataset[key] : def;
  }

  function runDms() {
    var lat = num('dm-lat'), lng = num('dm-lng');
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      $('dm-big').textContent = '—';
      $('dm-out').innerHTML = '';
      $('dm-note').textContent = '纬度需在 −90~90，经度需在 −180~180。';
      return;
    }
    var la = ddToDms(lat), lo = ddToDms(lng);
    $('dm-big').textContent = (lat >= 0 ? 'N ' : 'S ') + la.text + '  ' + (lng >= 0 ? 'E ' : 'W ') + lo.text;
    T.cells($('dm-out'), [
      ['纬度（DD）', r6(lat)],
      ['纬度（DMS）', (lat >= 0 ? 'N' : 'S') + la.text],
      ['经度（DD）', r6(lng)],
      ['经度（DMS）', (lng >= 0 ? 'E' : 'W') + lo.text],
      ['半球', latLabel(lat) + ' / ' + lngLabel(lng)],
      ['度分秒文本', la.d + '°' + la.m + "'" + la.s + '" N, ' + lo.d + '°' + lo.m + "'" + lo.s + '" E']
    ]);
    $('dm-note').innerHTML = '<b>说明</b>　度分秒之间是 60 进制。负值表示南纬或西经，换算时先取绝对值再定半球。' +
      '十进制度保留 6 位小数约合 0.11 米，日常定位足够。';
  }

  function runConv() {
    var lat = num('cv-lat'), lng = num('cv-lng');
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      $('cv-out').innerHTML = '';
      $('cv-note').textContent = '请填写合理的经纬度（纬度 ±90、经度 ±180）。';
      return;
    }
    var from = segVal('cv-from', 'cs', 'wgs');
    var r = convert(from, lat, lng);
    var inChina = !outOfChina(lat, lng);
    T.cells($('cv-out'), [
      ['WGS84', r6(r.wgs[0]) + ', ' + r6(r.wgs[1])],
      ['GCJ-02（高德/腾讯）', r6(r.gcj[0]) + ', ' + r6(r.gcj[1])],
      ['BD-09（百度）', r6(r.bd[0]) + ', ' + r6(r.bd[1])],
      ['GCJ 相对 WGS 偏移', Math.round(haversine(r.wgs[0], r.wgs[1], r.gcj[0], r.gcj[1])) + ' 米'],
      ['是否落在国测局偏移范围', inChina ? '是（国内）' : '否（境外，不做偏移）']
    ]);
    $('cv-note').innerHTML = '<b>说明</b>　WGS84 是 GPS 原始坐标；GCJ-02 是国内非加密偏移坐标（高德、腾讯、Google 中国）；' +
      'BD-09 是百度在其上加的二次偏移。偏移公式来自公开算法，与官方纠偏服务可能存在米级差异。' +
      '反向换算用迭代逼近，一般 4~5 次即收敛。';
  }

  function runDist() {
    var lat1 = num('ds-lat1'), lng1 = num('ds-lng1'), lat2 = num('ds-lat2'), lng2 = num('ds-lng2');
    if (![lat1, lng1, lat2, lng2].every(isFinite)) {
      $('ds-big').textContent = '—';
      $('ds-out').innerHTML = '';
      $('ds-note').textContent = '四个坐标都需填写。';
      return;
    }
    var m = haversine(lat1, lng1, lat2, lng2);
    var b = bearing(lat1, lng1, lat2, lng2);
    $('ds-big').innerHTML = (m >= 1000 ? (m / 1000).toFixed(3) + ' 公里' : Math.round(m) + ' 米');
    T.cells($('ds-out'), [
      ['大圆距离', Math.round(m).toLocaleString('zh-CN') + ' 米'],
      ['折合公里', (m / 1000).toFixed(3) + ' km'],
      ['方位角', b.toFixed(2) + '°（' + dirName(b) + '）'],
      ['纬度差', (lat2 - lat1).toFixed(6) + '°'],
      ['经度差', (lng2 - lng1).toFixed(6) + '°']
    ]);
    $('ds-note').innerHTML = '<b>说明</b>　距离按地球平均半径 6371.0088 km 用 Haversine 公式算大圆距离，' +
      '在不考虑地形与道路的情况下，与地图上的实际行车距离会有差异。方位角以正北为 0°、顺时针增加。';
  }

  $('dm-run').addEventListener('click', runDms);
  $('dm-swap').addEventListener('click', function () {
    $('dm-rev').hidden = !$('dm-rev').hidden;
    if (!$('dm-rev').hidden) {
      var r = dmsToDd(num('rv-lat-d'), num('rv-lat-m'), num('rv-lat-s'), Number($('rv-lat-dir').value));
      $('dm-lat').value = r;
      var r2 = dmsToDd(num('rv-lng-d'), num('rv-lng-m'), num('rv-lng-s'), Number($('rv-lng-dir').value));
      $('dm-lng').value = r2;
      runDms();
    }
  });
  ['rv-lat-s', 'rv-lat-m', 'rv-lat-d', 'rv-lng-s', 'rv-lng-m', 'rv-lng-d'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if ($('dm-rev').hidden) return;
      $('dm-lat').value = dmsToDd(num('rv-lat-d'), num('rv-lat-m'), num('rv-lat-s'), Number($('rv-lat-dir').value));
      $('dm-lng').value = dmsToDd(num('rv-lng-d'), num('rv-lng-m'), num('rv-lng-s'), Number($('rv-lng-dir').value));
      runDms();
    });
  });
  ['rv-lat-dir', 'rv-lng-dir'].forEach(function (id) { $(id).addEventListener('change', function () { $('dm-swap').click(); $('dm-swap').click(); }); });

  T.$('cv-from').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    runConv();
  });
  ['dm-lat', 'dm-lng'].forEach(function (id) { $(id).addEventListener('input', runDms); });
  ['cv-lat', 'cv-lng'].forEach(function (id) { $(id).addEventListener('input', runConv); });
  ['ds-lat1', 'ds-lng1', 'ds-lat2', 'ds-lng2'].forEach(function (id) { $(id).addEventListener('input', runDist); });
  $('cv-run').addEventListener('click', runConv);
  $('ds-run').addEventListener('click', runDist);
  $('cv-reset').addEventListener('click', function () { $('cv-lat').value = '39.9087'; $('cv-lng').value = '116.3975'; runConv(); });
  $('ds-reset').addEventListener('click', function () {
    $('ds-lat1').value = '39.9087'; $('ds-lng1').value = '116.3975';
    $('ds-lat2').value = '31.2304'; $('ds-lng2').value = '121.4737'; runDist();
  });

  T.tabs($('tabs'), function (name) {
    ['dms', 'conv', 'dist'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
    if (name === 'dms') runDms();
    if (name === 'conv') runConv();
    if (name === 'dist') runDist();
  });

  runDms(); runConv(); runDist();

  window.__geo = {
    ddToDms: ddToDms, dmsToDd: dmsToDd, wgs2gcj: wgs2gcj, gcj2wgs: gcj2wgs,
    gcj2bd: gcj2bd, bd2gcj: bd2gcj, convert: convert, haversine: haversine,
    bearing: bearing, dirName: dirName, outOfChina: outOfChina
  };
})();

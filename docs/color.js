/* 颜色转换：HEX / RGB / HSL / HSV / CMYK，附 WCAG 对比度 */
(function () {
  'use strict';
  var $ = T.$;
  var grid = $('grid'), swatch = $('swatch');

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }

  function hexToRgb(hex) {
    var h = String(hex).trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [Math.round(h * 360), Math.round((max === 0 ? 0 : d / max) * 100), Math.round(max * 100)];
  }

  function rgbToCmyk(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var k = 1 - Math.max(r, g, b);
    if (k === 1) return [0, 0, 0, 100];
    return [
      Math.round((1 - r - k) / (1 - k) * 100),
      Math.round((1 - g - k) / (1 - k) * 100),
      Math.round((1 - b - k) / (1 - k) * 100),
      Math.round(k * 100)
    ];
  }

  // WCAG 2.1 相对亮度：先按 sRGB 反伽马到线性空间，再按 0.2126/0.7152/0.0722 加权
  function luminance(r, g, b) {
    var chan = [r, g, b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  }

  function contrast(rgb1, rgb2) {
    var l1 = luminance.apply(null, rgb1), l2 = luminance.apply(null, rgb2);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function render(r, g, b) {
    var hex = rgbToHex(r, g, b);
    var hsl = rgbToHsl(r, g, b), hsv = rgbToHsv(r, g, b), cmyk = rgbToCmyk(r, g, b);
    var white = contrast([r, g, b], [255, 255, 255]).toFixed(2);
    var black = contrast([r, g, b], [0, 0, 0]).toFixed(2);

    $('hex').value = hex;
    $('r').value = Math.round(r); $('g').value = Math.round(g); $('b').value = Math.round(b);
    $('picker').value = hex.toLowerCase();
    swatch.style.background = hex;
    swatch.style.color = Number(white) >= Number(black) ? '#fff' : '#000';
    swatch.textContent = hex + '  文字自动选' + (Number(white) >= Number(black) ? '白' : '黑');

    T.cells(grid, [
      ['HEX', hex],
      ['RGB', 'rgb(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b) + ')'],
      ['HSL', 'hsl(' + hsl[0] + ', ' + hsl[1] + '%, ' + hsl[2] + '%)'],
      ['HSV', 'hsv(' + hsv[0] + ', ' + hsv[1] + '%, ' + hsv[2] + '%)'],
      ['CMYK', cmyk[0] + '%, ' + cmyk[1] + '%, ' + cmyk[2] + '%, ' + cmyk[3] + '%'],
      ['对白对比度', white + ':1' + (Number(white) >= 4.5 ? '（正文可用）' : Number(white) >= 3 ? '（大字可用）' : '（偏低）')],
      ['对黑对比度', black + ':1' + (Number(black) >= 4.5 ? '（正文可用）' : Number(black) >= 3 ? '（大字可用）' : '（偏低）')]
    ]);
  }

  function fromHex() {
    var rgb = hexToRgb($('hex').value);
    if (!rgb) { $('hint').className = 'hint err'; $('hint').textContent = 'HEX 格式不正确，应形如 #1668dc 或 #16c'; return; }
    $('hint').className = 'hint';
    $('hint').textContent = HINT_TEXT;
    render(rgb[0], rgb[1], rgb[2]);
  }

  function fromRgb() {
    var r = Number($('r').value), g = Number($('g').value), b = Number($('b').value);
    if ([r, g, b].some(function (v) { return isNaN(v) || v < 0 || v > 255; })) {
      $('hint').className = 'hint err'; $('hint').textContent = 'R/G/B 需为 0–255 的数字';
      return;
    }
    $('hint').className = 'hint';
    $('hint').textContent = HINT_TEXT;
    render(r, g, b);
  }

  var HINT_TEXT = '支持 #RGB 缩写与 #RRGGBB；RGB 三通道改动即时换算；对比度按 WCAG 2.1，4.5:1 为正文达标线。';

  $('hex').addEventListener('input', fromHex);
  ['r', 'g', 'b'].forEach(function (id) { $(id).addEventListener('input', fromRgb); });
  $('picker').addEventListener('input', function () {
    $('hex').value = $('picker').value;
    fromHex();
  });
  $('random').addEventListener('click', function () {
    var bytes = new Uint8Array(3);
    crypto.getRandomValues(bytes);
    render(bytes[0], bytes[1], bytes[2]);
    $('hint').className = 'hint';
    $('hint').textContent = HINT_TEXT;
  });
  T.bindCopy($('copy'), function () { return $('hex').value; });

  $('hint').textContent = HINT_TEXT;
  render(22, 104, 220);
})();

/* 几何与电子计算：平面图形、立体图形、三角函数、电阻网络
   纯函数先集中定义，便于 tools/check_algos.mjs 直接取向量验证。 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var PI = Math.PI;

  function num(v) {
    if (v === '' || v == null) return NaN;
    var n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  // 保留 6 位有效小数并去尾零，避免 1.2000000000000002
  function r6(n) {
    if (!isFinite(n)) return '—';
    var v = Number(n.toPrecision(12));
    return String(Number(v.toFixed(6)));
  }
  function r6n(n) { return Number(Number(n.toPrecision(12)).toFixed(6)); }

  /* ---------- 平面图形 ----------
     每个图形给出输入字段与 compute，compute 返回 [标签, 值, 代入说明][] */
  var PLANE = {
    square: {
      name: '正方形 / 矩形',
      fields: [{ id: 'a', label: '边长 a' }, { id: 'b', label: '边长 b（正方形时与 a 相同）', def: 1 }],
      svg: '<svg viewBox="0 0 96 96"><rect class="f" x="14" y="20" width="68" height="56"/><rect class="o" x="14" y="20" width="68" height="56"/>' +
        '<text x="44" y="88">a</text><text x="88" y="52">b</text></svg>',
      formula: '面积 = a × b，周长 = 2 × (a + b)，对角线 = √(a² + b²)',
      compute: function (v) {
        var a = num(v.a), b = num(v.b);
        if (!(a > 0) || !(b > 0)) return null;
        var area = a * b, peri = 2 * (a + b), diag = Math.sqrt(a * a + b * b);
        return {
          rows: [['面积', r6(area), ''], ['周长', r6(peri), ''], ['对角线', r6(diag), '']],
          steps: ['S = ' + r6(a) + ' × ' + r6(b) + ' = ' + r6(area),
            'C = 2 × (' + r6(a) + ' + ' + r6(b) + ') = ' + r6(peri),
            'd = √(' + r6(a) + '² + ' + r6(b) + '²) = ' + r6(diag)]
        };
      }
    },
    parallelogram: {
      name: '平行四边形',
      fields: [{ id: 'a', label: '底边 a' }, { id: 'h', label: '高 h', def: 1 }, { id: 'b', label: '邻边 b（算周长用）', def: 1 }],
      svg: '<svg viewBox="0 0 96 96"><path class="f" d="M20 26 L72 26 L76 78 L24 78 Z"/>' +
        '<path class="o" d="M20 26 L72 26 L76 78 L24 78 Z"/><path class="l" d="M20 26 L20 78"/>' +
        '<text x="46" y="20">a</text><text x="12" y="56">h</text></svg>',
      formula: '面积 = 底 × 高，周长 = 2 × (底 + 邻边)',
      compute: function (v) {
        var a = num(v.a), h = num(v.h), b = num(v.b);
        if (!(a > 0) || !(h > 0)) return null;
        var area = a * h;
        var out = {
          rows: [['面积', r6(area), '']],
          steps: ['S = ' + r6(a) + ' × ' + r6(h) + ' = ' + r6(area)]
        };
        if (b > 0) {
          var peri = 2 * (a + b);
          out.rows.push(['周长', r6(peri), '']);
          out.steps.push('C = 2 × (' + r6(a) + ' + ' + r6(b) + ') = ' + r6(peri));
        }
        return out;
      }
    },
    trapezoid: {
      name: '梯形',
      fields: [{ id: 'a', label: '上底 a', def: 1 }, { id: 'b', label: '下底 b', def: 2 }, { id: 'h', label: '高 h', def: 1 }, { id: 'c', label: '腰 c（算周长用）', def: 0 }, { id: 'd', label: '腰 d（算周长用）', def: 0 }],
      svg: '<svg viewBox="0 0 96 96"><path class="f" d="M32 24 L64 24 L78 76 L18 76 Z"/>' +
        '<path class="o" d="M32 24 L64 24 L78 76 L18 76 Z"/><path class="l" d="M32 24 L32 76"/>' +
        '<text x="44" y="18">a</text><text x="44" y="90">b</text><text x="26" y="52">h</text></svg>',
      formula: '面积 = (上底 + 下底) × 高 ÷ 2，周长 = 上底 + 下底 + 两腰',
      compute: function (v) {
        var a = num(v.a), b = num(v.b), h = num(v.h);
        if (!(a > 0) || !(b > 0) || !(h > 0)) return null;
        var area = (a + b) * h / 2;
        var out = {
          rows: [['面积', r6(area), ''], ['中位线', r6((a + b) / 2), '']],
          steps: ['S = (' + r6(a) + ' + ' + r6(b) + ') × ' + r6(h) + ' ÷ 2 = ' + r6(area)]
        };
        var c = num(v.c), d = num(v.d);
        if (c > 0 && d > 0) {
          var peri = a + b + c + d;
          out.rows.push(['周长', r6(peri), '']);
          out.steps.push('C = ' + r6(a) + ' + ' + r6(b) + ' + ' + r6(c) + ' + ' + r6(d) + ' = ' + r6(peri));
        }
        return out;
      }
    }
  };

  /* ---------- 立体图形 ---------- */
  var SOLID = {
    cube: {
      name: '正方体',
      fields: [{ id: 'a', label: '棱长 a' }],
      svg: '<svg viewBox="0 0 96 96"><path class="f" d="M20 34 L56 34 L56 76 L20 76 Z"/>' +
        '<path class="o" d="M20 34 L56 34 L56 76 L20 76 Z M20 34 L34 20 L70 20 L56 34 M56 76 L70 62 L70 20 M70 62 L34 62 L34 20"/>' +
        '<text x="34" y="88">a</text></svg>',
      formula: '表面积 = 6a²，体积 = a³，体对角线 = √3·a',
      compute: function (v) {
        var a = num(v.a);
        if (!(a > 0)) return null;
        return {
          rows: [['表面积', r6(6 * a * a), 'm²'], ['体积', r6(a * a * a), 'm³'],
            ['单面面积', r6(a * a), 'm²'], ['体对角线', r6(Math.sqrt(3) * a), 'm']],
          steps: ['S = 6 × ' + r6(a) + '² = ' + r6(6 * a * a),
            'V = ' + r6(a) + '³ = ' + r6(a * a * a)]
        };
      }
    },
    cuboid: {
      name: '长方体',
      fields: [{ id: 'a', label: '长 a' }, { id: 'b', label: '宽 b', def: 1 }, { id: 'c', label: '高 c', def: 1 }],
      svg: '<svg viewBox="0 0 96 96"><path class="f" d="M16 40 L52 40 L52 78 L16 78 Z"/>' +
        '<path class="o" d="M16 40 L52 40 L52 78 L16 78 Z M16 40 L32 24 L68 24 L52 40 M52 78 L68 62 L68 24 M68 62 L32 62 L32 24"/>' +
        '<text x="30" y="90">a</text></svg>',
      formula: '表面积 = 2(ab + bc + ac)，体积 = abc，体对角线 = √(a² + b² + c²)',
      compute: function (v) {
        var a = num(v.a), b = num(v.b), c = num(v.c);
        if (!(a > 0) || !(b > 0) || !(c > 0)) return null;
        return {
          rows: [['表面积', r6(2 * (a * b + b * c + a * c)), 'm²'], ['体积', r6(a * b * c), 'm³'],
            ['体对角线', r6(Math.sqrt(a * a + b * b + c * c)), 'm']],
          steps: ['S = 2 × (' + r6(a * b) + ' + ' + r6(b * c) + ' + ' + r6(a * c) + ') = ' + r6(2 * (a * b + b * c + a * c)),
            'V = ' + r6(a) + ' × ' + r6(b) + ' × ' + r6(c) + ' = ' + r6(a * b * c)]
        };
      }
    },
    cylinder: {
      name: '圆柱体',
      fields: [{ id: 'r', label: '底面半径 r' }, { id: 'h', label: '高 h', def: 1 }],
      svg: '<svg viewBox="0 0 96 96"><path class="f" d="M22 34 L22 70 A26 12 0 0 0 74 70 L74 34 Z"/>' +
        '<ellipse class="f" cx="48" cy="34" rx="26" ry="12"/>' +
        '<path class="o" d="M22 34 L22 70 A26 12 0 0 0 74 70 L74 34"/><ellipse class="o" cx="48" cy="34" rx="26" ry="12"/>' +
        '<path class="l" d="M48 34 L74 34"/><text x="56" y="30">r</text><text x="78" y="54">h</text></svg>',
      formula: '侧面积 = 2πrh，表面积 = 2πr² + 2πrh，体积 = πr²h',
      compute: function (v) {
        var r = num(v.r), h = num(v.h);
        if (!(r > 0) || !(h > 0)) return null;
        var lat = 2 * PI * r * h, base = PI * r * r, area = 2 * base + lat, vol = base * h;
        return {
          rows: [['表面积', r6(area), 'm²'], ['侧面积', r6(lat), 'm²'], ['底面积', r6(base), 'm²'],
            ['体积', r6(vol), 'm³'], ['底面周长', r6(2 * PI * r), 'm']],
          steps: ['S侧 = 2π × ' + r6(r) + ' × ' + r6(h) + ' = ' + r6(lat),
            'S = 2π × ' + r6(r) + '² + ' + r6(lat) + ' = ' + r6(area),
            'V = π × ' + r6(r) + '² × ' + r6(h) + ' = ' + r6(vol)]
        };
      }
    },
    cone: {
      name: '圆锥',
      fields: [{ id: 'r', label: '底面半径 r' }, { id: 'h', label: '高 h', def: 1 }],
      svg: '<svg viewBox="0 0 96 96"><path class="f" d="M48 16 L74 70 A26 12 0 0 1 22 70 Z"/>' +
        '<path class="o" d="M48 16 L74 70 A26 12 0 0 1 22 70 Z"/><ellipse class="o" cx="48" cy="70" rx="26" ry="12"/>' +
        '<path class="l" d="M48 70 L48 16"/><path class="l" d="M48 70 L74 70"/>' +
        '<text x="56" y="50">h</text><text x="62" y="80">r</text></svg>',
      formula: '母线 l = √(r² + h²)，侧面积 = πrl，表面积 = πr² + πrl，体积 = πr²h ÷ 3',
      compute: function (v) {
        var r = num(v.r), h = num(v.h);
        if (!(r > 0) || !(h > 0)) return null;
        var l = Math.sqrt(r * r + h * h), base = PI * r * r, lat = PI * r * l;
        return {
          rows: [['表面积', r6(base + lat), 'm²'], ['侧面积', r6(lat), 'm²'], ['底面积', r6(base), 'm²'],
            ['母线长', r6(l), 'm'], ['体积', r6(base * h / 3), 'm³']],
          steps: ['l = √(' + r6(r) + '² + ' + r6(h) + '²) = ' + r6(l),
            'S侧 = π × ' + r6(r) + ' × ' + r6(l) + ' = ' + r6(lat),
            'S = ' + r6(base) + ' + ' + r6(lat) + ' = ' + r6(base + lat),
            'V = π × ' + r6(r) + '² × ' + r6(h) + ' ÷ 3 = ' + r6(base * h / 3)]
        };
      }
    }
  };

  /* ---------- 三角函数 ---------- */
  function deg2rad(d) { return d * PI / 180; }
  function rad2deg(r) { return r * 180 / PI; }

  var TRIG = {
    sin: { label: '正弦 sin', formula: 'sin θ = 对边 ÷ 斜边', need: ['角度 θ（度）'] },
    cos: { label: '余弦 cos', formula: 'cos θ = 邻边 ÷ 斜边', need: ['角度 θ（度）'] },
    tan: { label: '正切 tan', formula: 'tan θ = 对边 ÷ 邻边', need: ['角度 θ（度）'] },
    atan: { label: '反正切 arctan', formula: 'arctan(x) 返回 −90° ~ 90° 之间的角度；x 可写成「对边/邻边」的分式', need: ['x 值（可填分式如 3/4）'] },
    asin: { label: '反正弦 arcsin', formula: 'arcsin(x) 返回 −90° ~ 90°，x 需在 −1 ~ 1', need: ['x 值'] },
    acos: { label: '反余弦 arccos', formula: 'arccos(x) 返回 0° ~ 180°，x 需在 −1 ~ 1', need: ['x 值'] }
  };

  // 支持 "3/4" 这类分式，省得先自己除一遍
  function parseFraction(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return NaN;
    if (s.indexOf('/') >= 0) {
      var p = s.split('/');
      if (p.length !== 2) return NaN;
      var a = Number(p[0]), b = Number(p[1]);
      if (!isFinite(a) || !isFinite(b) || b === 0) return NaN;
      return a / b;
    }
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function trigCompute(kind, v) {
    var x;
    if (kind === 'atan' || kind === 'asin' || kind === 'acos') {
      x = parseFraction(v.x);
      if (!isFinite(x)) return null;
      var rad, note;
      if (kind === 'atan') { rad = Math.atan(x); note = x + ' 对应 ' + r6(rad) + ' 弧度'; }
      else if (kind === 'asin') {
        if (x < -1 || x > 1) return null;
        rad = Math.asin(x); note = 'x 在 −1~1 内';
      } else {
        if (x < -1 || x > 1) return null;
        rad = Math.acos(x); note = 'x 在 −1~1 内';
      }
      var deg = rad2deg(rad);
      var out = {
        rows: [['角度', r6(deg) + '°', ''], ['弧度', r6(rad), 'rad'], ['说明', note, '']],
        steps: [(kind === 'atan' ? 'arctan(' : kind === 'asin' ? 'arcsin(' : 'arccos(') + r6(x) + ') = ' + r6(deg) + '° = ' + r6(rad) + ' rad']
      };
      if (kind === 'atan') {
        // 补个常用表达，工程上三角形求角常用
        out.rows.push(['比值', r6(x), '']);
      }
      return out;
    }
    x = num(v.x);
    if (!isFinite(x)) return null;
    var rad2 = deg2rad(x);
    var val;
    if (kind === 'sin') val = Math.sin(rad2);
    else if (kind === 'cos') val = Math.cos(rad2);
    else {
      var c = Math.cos(rad2);
      if (Math.abs(c) < 1e-12) {
        return { rows: [['值', '未定义', ''], ['说明', 'cos θ = 0，tan θ 不存在', '']], steps: ['θ = ' + r6(x) + '° 时 cos θ = 0，tan θ 无定义'] };
      }
      val = Math.tan(rad2);
    }
    return {
      rows: [['函数值', r6(val), ''], ['角度', r6(x) + '°', ''], ['弧度', r6(rad2), 'rad']],
      steps: [kind + '(' + r6(x) + '°) = ' + r6(val)]
    };
  }

  /* ---------- 电阻网络 ---------- */
  function resistors(v) {
    var list = [];
    for (var i = 0; i < 4; i++) {
      var r = num(v['r' + (i + 1)]);
      if (r > 0) list.push({ n: i + 1, r: r });
    }
    if (!list.length) return null;
    return list;
  }

  function resCompute(kind, v) {
    var list = resistors(v);
    if (!list) return null;
    var u = num(v.u);
    var rows = [], steps = [];

    if (kind === 'series') {
      var sum = list.reduce(function (a, x) { return a + x.r; }, 0);
      rows.push(['串联总阻值', r6(sum) + ' Ω', '']);
      steps.push('R串 = ' + list.map(function (x) { return r6(x.r); }).join(' + ') + ' = ' + r6(sum) + ' Ω');
      if (u > 0) {
        var cur = u / sum;
        rows.push(['总电流', r6(cur) + ' A', '']);
        steps.push('I = U ÷ R = ' + r6(u) + ' ÷ ' + r6(sum) + ' = ' + r6(cur) + ' A');
        list.forEach(function (x) {
          rows.push(['R' + x.n + ' 分压', r6(cur * x.r) + ' V', '']);
        });
        rows.push(['功率', r6(u * cur) + ' W', '']);
      }
    } else if (kind === 'parallel') {
      var inv = list.reduce(function (a, x) { return a + 1 / x.r; }, 0);
      var rp = 1 / inv;
      rows.push(['并联总阻值', r6(rp) + ' Ω', '']);
      steps.push('1/R并 = ' + list.map(function (x) { return '1/' + r6(x.r); }).join(' + ') + ' ⇒ R并 = ' + r6(rp) + ' Ω');
      if (u > 0) {
        var total = u / rp;
        rows.push(['总电流', r6(total) + ' A', '']);
        steps.push('I总 = ' + r6(u) + ' ÷ ' + r6(rp) + ' = ' + r6(total) + ' A');
        list.forEach(function (x) {
          rows.push(['R' + x.n + ' 分流', r6(u / x.r) + ' A', '']);
        });
        rows.push(['总功率', r6(u * total) + ' W', '']);
      }
    } else if (kind === 'divider') {
      // 分压：按顺序串联，逐个算出对地电压
      if (list.length < 2) return null;
      if (!(u >= 0)) return null;
      var tot = list.reduce(function (a, x) { return a + x.r; }, 0);
      var cur2 = u / tot;
      rows.push(['回路电流', r6(cur2) + ' A', '']);
      // 从电源正极往下累计，逐个给出该节点对地电压
      var acc = 0;
      list.forEach(function (x) {
        acc += x.r;
        rows.push(['R' + x.n + ' 分压', r6(cur2 * x.r) + ' V', '']);
        rows.push(['R' + x.n + ' 后对地电压', r6(u - cur2 * acc) + ' V', '']);
      });
      steps.push('I = ' + r6(u) + ' ÷ ' + r6(tot) + ' = ' + r6(cur2) + ' A');
      list.forEach(function (x) { steps.push('U_R' + x.n + ' = I × ' + r6(x.r) + ' = ' + r6(cur2 * x.r) + ' V'); });
    }
    return { rows: rows, steps: steps, list: list };
  }

  /* ---------- 界面装配 ---------- */
  var TAB = 'plane';
  var SHAPE = { plane: 'square', solid: 'cube', trig: 'sin', res: 'series' };
  var TRIG_FIELD = { x: '角度 θ（度）' };

  function fieldsOf() {
    if (TAB === 'plane') return PLANE[SHAPE.plane].fields;
    if (TAB === 'solid') return SOLID[SHAPE.solid].fields;
    if (TAB === 'trig') return TRIG[SHAPE.trig].need.map(function (t, i) { return { id: 'x', label: t }; });
    return [
      { id: 'u', label: '电压 U（伏，可留空只算阻值）', def: 12 },
      { id: 'r1', label: 'R1（欧姆）', def: 100 },
      { id: 'r2', label: 'R2（欧姆）', def: 200 },
      { id: 'r3', label: 'R3（欧姆，可留空）' },
      { id: 'r4', label: 'R4（欧姆，可留空）' }
    ];
  }

  function buildFields() {
    var box = $('fields');
    box.innerHTML = '';
    fieldsOf().forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'row';
      var lab = document.createElement('label');
      lab.textContent = f.label;
      var wrap = document.createElement('div');
      wrap.className = 'input-wrap';
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.id = f.id;
      inp.inputMode = 'decimal';
      inp.placeholder = f.hint || '';
      if (f.def != null) inp.value = String(f.def);
      wrap.appendChild(inp);
      row.appendChild(lab); row.appendChild(wrap);
      box.appendChild(row);
    });
  }

  function readValues() {
    var v = {};
    fieldsOf().forEach(function (f) { v[f.id] = $(f.id).value; });
    return v;
  }

  function setPreset(sel, map, box) {
    box.innerHTML = '';
    Object.keys(map).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.key = k;
      b.textContent = map[k].name || map[k].label;
      if (k === SHAPE[sel]) b.classList.add('on');
      box.appendChild(b);
    });
  }

  function renderShape() {
    var box = $('shape');
    var svg = '', cap = '';
    if (TAB === 'plane') { svg = PLANE[SHAPE.plane].svg; cap = PLANE[SHAPE.plane].formula; }
    else if (TAB === 'solid') { svg = SOLID[SHAPE.solid].svg; cap = SOLID[SHAPE.solid].formula; }
    else if (TAB === 'trig') {
      svg = '<svg viewBox="0 0 96 96"><path class="f" d="M14 76 L82 76 L82 30 Z"/>' +
        '<path class="o" d="M14 76 L82 76 L82 30 Z"/><path class="l" d="M26 76 L26 68 L34 68 L34 76"/>' +
        '<text x="40" y="90">邻边</text><text x="84" y="56">对边</text><text x="30" y="42">斜边</text></svg>';
      cap = TRIG[SHAPE.trig].formula;
    } else {
      svg = '<svg viewBox="0 0 96 96"><rect class="f" x="8" y="30" width="26" height="36"/><path class="o" d="M8 30 h26 v36 h-26 Z"/>' +
        '<path class="o" d="M60 30 h26 M60 48 h26 M60 66 h26 M60 30 v36 M86 30 v36"/></svg>';
      cap = '串联 R = R1 + R2 + …；并联 1/R = 1/R1 + 1/R2 + …；分压 U_i = U × R_i ÷ ΣR';
    }
    box.innerHTML = svg + '<div class="cap">' + cap + '</div>';
  }

  function buildPickers() {
    var host = $('fields').parentNode;
    var old = host.querySelector('#pickers');
    if (old) old.remove();
    var map = TAB === 'plane' ? PLANE : TAB === 'solid' ? SOLID : TAB === 'trig' ? TRIG :
      { series: { name: '串联' }, parallel: { name: '并联' }, divider: { name: '分压' } };
    var box = document.createElement('div');
    box.className = 'chips';
    box.id = 'pickers';
    setPreset(TAB, map, box);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      SHAPE[TAB] = b.dataset.key;
      [].forEach.call(box.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
      buildFields();
      renderShape();
      titleOf();
      run();
    });
    host.insertBefore(box, $('fields'));
  }

  function titleOf() {
    var t = '';
    if (TAB === 'plane') t = '平面图形面积与周长 · ' + PLANE[SHAPE.plane].name;
    else if (TAB === 'solid') t = '立体图形表面积与体积 · ' + SOLID[SHAPE.solid].name;
    else if (TAB === 'trig') t = '三角函数计算 · ' + TRIG[SHAPE.trig].label;
    else t = '电阻网络计算 · ' + ({ series: '串联', parallel: '并联', divider: '分压' }[SHAPE.res]);
    $('panel-title').textContent = t;
  }

  function run() {
    var v = readValues();
    var res, formula = '';
    if (TAB === 'plane') { res = PLANE[SHAPE.plane].compute(v); formula = PLANE[SHAPE.plane].formula; }
    else if (TAB === 'solid') { res = SOLID[SHAPE.solid].compute(v); formula = SOLID[SHAPE.solid].formula; }
    else if (TAB === 'trig') { res = trigCompute(SHAPE.trig, v); formula = TRIG[SHAPE.trig].formula; }
    else { res = resCompute(SHAPE.res, v); formula = '串联 R = ΣR；并联 1/R = Σ(1/Ri)；分压 U_i = I × R_i'; }

    $('formula').innerHTML = '<b>公式</b>　' + formula;
    var grid = $('grid'), out = $('output');

    if (!res) {
      grid.innerHTML = '';
      out.className = 'out err';
      out.textContent = TAB === 'trig' ? '请输入有效数值（arcsin/arccos 的 x 需在 −1 ~ 1）。' : '请输入大于 0 的数值。';
      return;
    }
    T.cells(grid, res.rows.map(function (r) { return [r[0], r[1] + (r[2] ? ' ' + r[2] : '')]; }));
    out.className = 'out';
    out.textContent = '';
    res.steps.forEach(function (s, i) {
      var b = document.createElement('div');
      b.textContent = (i === 0 ? '① ' : i === 1 ? '② ' : i === 2 ? '③ ' : '· ') + s;
      out.appendChild(b);
    });
    $('hint').textContent = '';
  }

  /* 页签 */
  function setTab(name) {
    TAB = name;
    T.markTab(name);
    buildPickers();
    buildFields();
    renderShape();
    titleOf();
    run();
  }
  T.tabs($('tabs'), setTab);

  $('run').addEventListener('click', run);
  $('reset').addEventListener('click', function () {
    buildFields();
    run();
  });
  $('fields').addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });

  setTab(T.firstTab('plane'));

  // 供测试脚本取纯函数
  window.__geometry = {
    PLANE: PLANE, SOLID: SOLID, TRIG: TRIG, parseFraction: parseFraction,
    trigCompute: trigCompute, resCompute: resCompute, deg2rad: deg2rad, rad2deg: rad2deg, r6: r6
  };
})();

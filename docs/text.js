/* 文字与文本：排版、全半角、去重、字数统计、大小写、同义词替换

   全是本地字符串处理。同义词表只收常见口语与书面语的互换，
   不做「AI 改写」——那需要模型，跟零依赖的定位不符。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ---------- 全角 / 半角 ---------- */
  // 全角字符区间 0xFF01..0xFF5E 与半角 0x21..0x7E 一一对应；空格单独处理
  function toHalf(s) {
    return String(s).replace(/[\uFF01-\uFF5E]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');
  }
  function toFull(s) {
    return String(s).replace(/[!-~]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) + 0xFEE0);
    }).replace(/ /g, '\u3000');
  }

  /* ---------- 排版 ---------- */
  function typeset(text) {
    return String(text).split('\n').map(function (line) {
      return '\u3000\u3000' + line.trim();
    }).join('\n\n');
  }
  function trimEnd(text) {
    return String(text).split('\n').map(function (l) { return l.replace(/[ \t\u3000]+$/, ''); }).join('\n');
  }
  function trimEach(text) {
    return String(text).split('\n').map(function (l) { return l.trim(); }).join('\n');
  }
  function dropBlank(text) {
    return String(text).split('\n').filter(function (l) { return l.trim() !== ''; }).join('\n');
  }

  /* ---------- 字数统计 ---------- */
  function countText(text) {
    var s = String(text);
    var han = (s.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) || []).length;
    var letters = (s.match(/[A-Za-z]/g) || []).length;
    var digits = (s.match(/[0-9]/g) || []).length;
    var spaces = (s.match(/\s/g) || []).length;
    var punct = (s.match(/[^\u4E00-\u9FFF\u3400-\u4DBF\w\s]/g) || []).length;
    var lines = s === '' ? 0 : s.split('\n').length;
    var words = s.trim() === '' ? 0 : s.trim().split(/\s+/).length;
    var bytes = new TextEncoder().encode(s).length;
    return [
      ['总字符数', s.length],
      ['汉字', han],
      ['英文字母', letters],
      ['数字', digits],
      ['标点符号', punct],
      ['空格与换行', spaces],
      ['行数', lines],
      ['词数（按空白切分）', words],
      ['UTF-8 字节', bytes]
    ];
  }

  /* ---------- 去重 ---------- */
  function dedup(text, trim) {
    var seen = Object.create(null);
    var out = [];
    var removed = [];
    String(text).split('\n').forEach(function (line) {
      var key = trim ? line.trim() : line;
      if (key === '') { out.push(line); return; }
      if (seen[key]) { removed.push(line); return; }
      seen[key] = true;
      out.push(line);
    });
    return { text: out.join('\n'), removed: removed.length, kept: out.length };
  }

  /* ---------- 大小写 ---------- */
  function changeCase(text, mode) {
    var s = String(text);
    if (mode === 'upper') return s.toUpperCase();
    if (mode === 'lower') return s.toLowerCase();
    if (mode === 'title') {
      return s.replace(/[A-Za-z]+/g, function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
    }
    if (mode === 'sentence') {
      // 句首字母大写：以 . ! ? 加空白切分
      return s.replace(/(^|[.!?]\s+)([a-z])/g, function (_, a, b) { return a + b.toUpperCase(); });
    }
    if (mode === 'toggle') {
      return s.split('').map(function (c) {
        return c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
      }).join('');
    }
    return s;
  }

  /* ---------- 同义词 ----------
     只做常见词的互换，方向可选。命中时按词边界或直接替换，
     中文没有词边界，按最长匹配优先。 */
  var SYNONYMS = [
    ['的', '之'], ['和', '与'], ['但是', '然而'], ['因为', '由于'], ['所以', '因此'],
    ['可以', '能够'], ['非常', '十分'], ['很多', '许多'], ['马上', '立刻'],
    ['立刻', '马上'], ['现在', '目前'], ['以前', '从前'], ['后来', '之后'],
    ['帮助', '协助'], ['使用', '运用'], ['方法', '方式'], ['问题', '难题'],
    ['提高', '提升'], ['增加', '增多'], ['减少', '降低'], ['知道', '了解'],
    ['觉得', '认为'], ['希望', '期望'], ['喜欢', '喜爱'], ['漂亮', '好看'],
    ['难过', '伤心'], ['开心', '高兴'], ['努力', '用功'], ['简单', '容易'],
    ['困难', '艰难'], ['开始', '起初'], ['结束', '完结'], ['重要', '关键'],
    ['特别', '特殊'], ['经常', '时常'], ['有时', '偶尔'], ['全部', '所有']
  ];

  function makeSynMap() {
    var fwd = Object.create(null), back = Object.create(null);
    SYNONYMS.forEach(function (p) {
      if (!fwd[p[0]]) fwd[p[0]] = p[1];
      if (!back[p[1]]) back[p[1]] = p[0];
    });
    return { fwd: fwd, back: back };
  }
  var SYN_MAP = makeSynMap();

  function replaceSynonyms(text, dir) {
    var map = dir === 'back' ? SYN_MAP.back : SYN_MAP.fwd;
    var keys = Object.keys(map).sort(function (a, b) { return b.length - a.length; });
    var hits = [];
    var out = String(text);
    keys.forEach(function (k) {
      if (out.indexOf(k) < 0) return;
      var n = out.split(k).length - 1;
      hits.push([k, map[k], n]);
      out = out.split(k).join(map[k]);
    });
    return { text: out, hits: hits };
  }

  /* ---------- 面板定义 ---------- */
  var PANELS = {
    typeset: {
      title: '排版动作',
      hint: '一键排版会在每段前加两个全角空格、段间留空行，适合公众号与文档粘贴。',
      acts: [
        ['all', '一键排版'], ['trimEnd', '去行尾空格'], ['trimEach', '去首尾空格'],
        ['dropBlank', '删除空行'], ['half', '半角转全角'], ['full', '全角转半角']
      ],
      opts: { all: 'typeset', trimEnd: 'trimEnd', trimEach: 'trimEach', dropBlank: 'dropBlank', half: 'toFull', full: 'toHalf' }
    },
    count: { title: '统计', hint: '按 Unicode 区间分类统计，汉字包含基本区与扩展 A 区。', acts: [['run', '统计']], opts: {} },
    dedup: {
      title: '去重方式',
      hint: '按行去重，保留首次出现的顺序。',
      acts: [['exact', '整行精确匹配'], ['trim', '忽略行首尾空格']],
      opts: { exact: 'exact', trim: 'trim' }
    },
    case: {
      title: '转换方式',
      hint: '句首大写只认 . ! ? 后的第一个字母；切换大小写就是把大小写对调。',
      acts: [['upper', '全部大写'], ['lower', '全部小写'], ['title', '词首大写'],
        ['sentence', '句首大写'], ['toggle', '切换大小写']],
      opts: { upper: 'upper', lower: 'lower', title: 'title', sentence: 'sentence', toggle: 'toggle' }
    },
    syn: {
      title: '替换方向',
      hint: '同义词表只收常见口语/书面语互换，不做整句改写。命中的词会在结果里统计出来。',
      acts: [['fwd', '正向替换'], ['back', '反向替换']],
      opts: { fwd: 'fwd', back: 'back' }
    }
  };

  var current = 'typeset';
  var pick = {};

  function buildPanel(name) {
    var cfg = PANELS[name];
    $('opt-title').textContent = cfg.title;
    $('hint').textContent = cfg.hint;
    $('opt-note').hidden = true;
    var box = $('acts');
    box.innerHTML = '';
    if (!cfg.acts.length) { $('opt-card').hidden = true; return; }
    $('opt-card').hidden = false;
    var defaultKey = pick[name] || cfg.acts[0][0];
    if (!cfg.acts.some(function (a) { return a[0] === defaultKey; })) defaultKey = cfg.acts[0][0];
    cfg.acts.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.k = a[0];
      b.textContent = a[1];
      b.classList.toggle('on', a[0] === defaultKey);
      b.addEventListener('click', function () {
        pick[name] = a[0];
        [].forEach.call(box.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
      });
      box.appendChild(b);
    });
    pick[name] = defaultKey;
  }

  function currentAction() {
    var cfg = PANELS[current];
    var box = $('acts');
    var on = box.querySelector('button.on');
    var key = on ? on.dataset.k : cfg.acts[0][0];
    return cfg.opts[key] || key;
  }

  function run() {
    var out = $('out'), err = $('err'), stats = $('stats');
    out.textContent = ''; err.hidden = true; stats.hidden = true; stats.innerHTML = '';
    var text = $('in').value;
    if (!text) { err.hidden = false; err.textContent = '先输入一点文本。'; return; }
    var act = currentAction();

    if (current === 'count') {
      var rows = countText(text);
      stats.hidden = false;
      stats.innerHTML = '';
      rows.forEach(function (r) {
        var d = document.createElement('div');
        var k = document.createElement('div'); k.className = 'k'; k.textContent = r[0];
        var v = document.createElement('div'); v.className = 'v'; v.textContent = r[1];
        d.appendChild(k); d.appendChild(v);
        stats.appendChild(d);
      });
      return;
    }

    if (current === 'typeset') {
      if (act === 'typeset') out.textContent = typeset(text);
      else if (act === 'trimEnd') out.textContent = trimEnd(text);
      else if (act === 'trimEach') out.textContent = trimEach(text);
      else if (act === 'dropBlank') out.textContent = dropBlank(text);
      else if (act === 'toFull') out.textContent = toFull(text);
      else if (act === 'toHalf') out.textContent = toHalf(text);
      return;
    }

    if (current === 'dedup') {
      var r = dedup(text, act === 'trim');
      out.textContent = r.text;
      $('opt-note').hidden = false;
      $('opt-note').textContent = '共 ' + r.kept + ' 行，去掉重复 ' + r.removed + ' 行。';
      return;
    }

    if (current === 'case') {
      out.textContent = changeCase(text, act);
      return;
    }

    if (current === 'syn') {
      var s = replaceSynonyms(text, act === 'back' ? 'back' : 'fwd');
      out.textContent = s.text;
      $('opt-note').hidden = false;
      if (!s.hits.length) {
        $('opt-note').textContent = '没有命中同义词表里的词。表内共 ' + Object.keys(SYN_MAP.fwd).length + ' 组常见词。';
      } else {
        $('opt-note').textContent = '替换了 ' + s.hits.length + ' 组：' +
          s.hits.map(function (h) { return h[0] + '→' + h[1] + '(' + h[2] + ')'; }).join('、');
      }
      return;
    }
  }

  function switchTab(name) {
    current = name;
    buildPanel(name);
    if (name === 'syn') { $('run').textContent = '替换'; }
    else if (name === 'count') { $('run').textContent = '统计'; }
    else { $('run').textContent = '处理'; }
    run();
  }

  $('run').addEventListener('click', run);
  $('swap').addEventListener('click', function () {
    var out = $('out');
    if (out.textContent) { $('in').value = out.textContent; out.textContent = ''; }
  });
  T.bindCopy($('copy'), function () { return $('out').textContent; });
  T.tabs($('tabs'), switchTab);

  $('in').value = '在线文字排版，可对文字自动进行排版\n可以添加行首缩进，行之间增加空行\n\n也可以删除空行，删除行首尾空格';
  switchTab('typeset');

  window.__text = {
    toHalf: toHalf, toFull: toFull, typeset: typeset, trimEnd: trimEnd, trimEach: trimEach,
    dropBlank: dropBlank, countText: countText, dedup: dedup, changeCase: changeCase,
    replaceSynonyms: replaceSynonyms, SYNONYMS: SYNONYMS
  };
})();

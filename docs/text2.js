/* 文本与敏感词：敏感词检测 / 同义词替换 / 字数统计 / 行去重 / 一键排版
   敏感词表与同义词表都是内置静态数据，不联网、不上传。
   检测逻辑是「按词表匹配 + 变形归一」，不做语义判断，命中与否只作参考。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ================= 静态词表 ================= */

  // 分级：block = 建议直接改；risk = 营销/极限词，平台可能限流或判违规
  var SENSITIVE = {
    block: [
      '赌博', '赌场', '博彩', '六合彩', '时时彩', '私彩', '开盘口',
      '毒品', '冰毒', '海洛因', '大麻', '摇头丸', '麻黄素',
      '枪支', '弹药', '仿真枪', '军用刀具', '管制刀具',
      '色情', '成人视频', '裸聊', '招嫖', '一夜情', '约炮',
      '代开票', '发票代开', '假证', '办证', '刻章办证', '黑客服务', '刷单', '代练', '外挂',
      '洗钱', '跑分', '套现', '信用卡套现', '薅羊毛', '撸货',
      '加微信', '加V', '微信号', '加QQ', '联系方式QQ', '私聊我', '添加好友',
      '微信同号', '加客服', '扫码加', '私信领取'
    ],
    risk: [
      '绝对', '第一', '最', '最佳', '最好', '最便宜', '最低价', '最先进', '最强',
      '国家级', '世界级', '全球首发', '全国首家', '顶级', '顶尖', '极致', '唯一', '独家',
      '包治百病', '疗效显著', '无副作用', '根治', '特效', '纯天然无添加',
      '100%', '百分百', '零风险', '稳赚', '必赚', '保本', '高回报', '一夜暴富',
      '免费领取', '限时抢购', '最后一天', '仅此一次', '错过不再', '点击链接', '立即购买',
      '全网最低', '假一赔十', '正品保证', '绝对正品', '永久有效', '终身免费'
    ]
  };

  // 同义词轮换表：每个词给多个候选，替换时按出现顺序轮流用
  var SYNONYMS = {
    1: {
      '非常': ['很', '十分'], '很好': ['不错'], '不错': ['还行'], '便宜': ['实惠'],
      '很好用': ['挺顺手'], '好用': ['顺手']
    },
    2: {
      '产品': ['商品', '货品'], '价格': ['售价', '价钱'], '质量': ['品质', '做工'],
      '物流': ['快递', '配送'], '客服': ['售后', '服务人员'], '态度': ['服务态度'],
      '建议': ['推荐'], '问题': ['疑问'], '回答': ['答复'], '方法': ['办法', '做法'],
      '需要': ['要', '得'], '可以': ['能', '能够'], '因为': ['由于'], '所以': ['因此'],
      '如果': ['要是', '假如'], '但是': ['不过', '只是'], '并且': ['而且'], '或者': ['或是'],
      '完成': ['做完', '搞定'], '开始': ['着手'], '结束': ['收尾'],
      '非常': ['很', '十分', '特别'], '很好': ['不错', '挺好'], '不错': ['还行', '还可以'],
      '便宜': ['实惠', '划算'], '好用': ['顺手', '好使'], '很快': ['挺快']
    },
    3: {
      '这个': ['该', '此'], '那个': ['该', '其'], '产品': ['商品', '货品', '物件'],
      '价格': ['售价', '价钱', '价位'], '质量': ['品质', '做工', '成色'],
      '物流': ['快递', '配送', '寄递'], '客服': ['售后', '服务人员', '客服人员'],
      '态度': ['服务态度', '待客'], '建议': ['推荐', '提议'], '问题': ['疑问', '难点'],
      '回答': ['答复', '回复'], '方法': ['办法', '做法', '路子'],
      '需要': ['要', '得', '需'], '可以': ['能', '能够', '可'], '因为': ['由于', '鉴于'],
      '所以': ['因此', '故而'], '如果': ['要是', '假如', '倘若'], '但是': ['不过', '只是', '然而'],
      '并且': ['而且', '并且也'], '或者': ['或是', '抑或'], '完成': ['做完', '搞定', '办妥'],
      '开始': ['着手', '启动'], '结束': ['收尾', '完结'],
      '非常': ['很', '十分', '特别', '格外'], '很好': ['不错', '挺好', '蛮好'],
      '不错': ['还行', '还可以', '不赖'], '便宜': ['实惠', '划算', '不贵'],
      '好用': ['顺手', '好使', '省事'], '很快': ['挺快', '飞快'], '喜欢': ['偏爱', '中意']
    }
  };

  /* ================= 1. 敏感词检测 ================= */

  // 变形归一：把常见的绕审写法还原回正常字形，再拿词表去比
  var NORM_MAP = {
    '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
    '⓪': '0', '❶': '1', '❷': '2', '❸': '3',
    'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g',
    '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6',
    '７': '7', '８': '8', '９': '9',
    'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F'
  };

  // 常见的字间插入符：赌★博、加-微-信
  var GAP_RE = /[\s\-_.·*~^+/,|\\'"]+/g;

  // 拼音 / 谐音变形（简表，只覆盖高频绕审写法）
  var PINYIN_ALIAS = {
    'wx': '微信', 'vx': '微信', 'v信': '微信', '薇信': '微信', '威信': '微信',
    '抠抠': 'QQ', '扣扣': 'QQ', '企鹅号': 'QQ',
    'dubo': '赌博', 'bo彩': '博彩',
    'jiawei': '加微信'
  };

  function normalize(text, mode) {
    var s = String(text || '');
    Object.keys(NORM_MAP).forEach(function (k) {
      s = s.split(k).join(NORM_MAP[k]);
    });
    if (mode === 'loose' || mode === 'pinyin') {
      // 宽松模式：把间隔符整体去掉，再比对；匹配位置会偏，所以只用于判断「有没有」
      s = s.replace(GAP_RE, '');
    }
    if (mode === 'pinyin') {
      // 拼音与谐音变形：把别名还原成中文，才能拿词表比对
      Object.keys(PINYIN_ALIAS).forEach(function (k) {
        if (s.indexOf(k) >= 0) s = s.split(k).join(PINYIN_ALIAS[k]);
      });
    }
    return s;
  }

  function detectSensitive(text, mode) {
    mode = mode || 'strict';
    var raw = String(text || '');
    var norm = normalize(raw, mode);
    var hits = [];
    var seen = {};

    ['block', 'risk'].forEach(function (level) {
      SENSITIVE[level].forEach(function (w) {
        var idx = norm.indexOf(w);
        if (idx < 0) return;
        if (seen[level + w]) return;
        seen[level + w] = true;
        hits.push({ word: w, level: level, index: idx });
      });
    });

    // 重叠命中里只保留最长的那个，避免「赌场」同时报「赌场」和别的
    hits = hits.filter(function (h) {
      return !hits.some(function (o) {
        return o !== h && o.level === h.level && o.word.length > h.word.length &&
          o.index <= h.index && h.index + h.word.length <= o.index + o.word.length;
      });
    });

    hits.sort(function (a, b) { return a.index - b.index; });

    var stat = {
      block: hits.filter(function (h) { return h.level === 'block'; }).length,
      risk: hits.filter(function (h) { return h.level === 'risk'; }).length,
      chars: raw.length,
      density: raw.length ? Math.round(hits.length / raw.length * 1000) / 10 : 0
    };

    return { text: raw, norm: norm, hits: hits, stat: stat, mode: mode };
  }

  function markSensitive(text, hits, mode) {
    if (!hits.length) return esc(text);
    if (mode !== 'strict') {
      // 宽松/拼音模式下归一化后位置对不上原文，改成整体标注 + 词表列出
      return esc(text);
    }
    var out = '', last = 0;
    hits.slice().sort(function (a, b) { return a.index - b.index; }).forEach(function (h) {
      if (h.index < last) return;
      out += esc(text.slice(last, h.index));
      out += '<span class="hit' + (h.level === 'risk' ? ' hit-risk' : ' hit-block') + '">' +
        esc(text.substr(h.index, h.word.length)) + '</span>';
      last = h.index + h.word.length;
    });
    out += esc(text.slice(last));
    return out;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var snMode = 'strict';

  function snRun() {
    var r = detectSensitive($('sn-in').value, snMode);
    var stat = $('sn-stat');
    stat.innerHTML = '';
    [['命中总数', r.hits.length], ['违禁词', r.stat.block], ['营销/极限词', r.stat.risk], ['密度‰', r.stat.density]].forEach(function (p) {
      var d = document.createElement('div');
      var b = document.createElement('b'); b.textContent = p[1];
      var s = document.createElement('span'); s.textContent = p[0];
      d.appendChild(b); d.appendChild(s);
      stat.appendChild(d);
    });

    var wbox = $('sn-words');
    wbox.innerHTML = '';
    if (!r.hits.length) {
      var ok = document.createElement('span');
      ok.className = 'ok';
      ok.textContent = '未命中内置词表';
      wbox.appendChild(ok);
    } else {
      r.hits.forEach(function (h) {
        var s = document.createElement('span');
        if (h.level === 'risk') s.className = 'risk';
        s.textContent = h.word;
        s.title = h.level === 'block' ? '违禁 / 风险词' : '营销 / 极限词';
        wbox.appendChild(s);
      });
    }

    $('sn-mark').innerHTML = markSensitive(r.text, r.hits, r.mode);

    var grid = $('sn-grid');
    grid.innerHTML = '';
    [['检测模式', { strict: '严格', loose: '宽松', pinyin: '含拼音变形' }[r.mode]],
     ['原文长度', r.text.length + ' 字符'],
     ['归一化后', r.norm.length + ' 字符'],
     ['命中词表', '违禁 ' + SENSITIVE.block.length + ' 条 / 营销 ' + SENSITIVE.risk.length + ' 条']
    ].forEach(function (p) { grid.appendChild(cell(p[0], p[1])); });

    $('sn-note').textContent = r.mode === 'strict'
      ? '严格模式按原文逐字匹配，命中位置会在上面标红。'
      : '当前模式已把空格、符号等间隔符去掉后再比对，因此只能判断「有没有」，无法在原文里精确定位——见到命中的词请人工确认。';
    return r;
  }

  function cell(k, v) {
    var d = document.createElement('div');
    var kk = document.createElement('div'); kk.className = 'k'; kk.textContent = k;
    var vv = document.createElement('div'); vv.className = 'v'; vv.textContent = v;
    d.appendChild(kk); d.appendChild(vv);
    return d;
  }

  var snBtns = $('sn-mode').querySelectorAll('button');
  [].forEach.call(snBtns, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(snBtns, function (o) { o.classList.toggle('on', o === b); });
      snMode = b.dataset.mode;
      snRun();
    });
  });
  $('sn-in').addEventListener('input', snRun);

  /* ================= 2. 同义词替换 ================= */

  function synonymReplace(text, level) {
    var table = SYNONYMS[level] || SYNONYMS[2];
    var keys = Object.keys(table).sort(function (a, b) { return b.length - a.length; });
    var out = String(text || '');
    var used = [];
    var counts = {};
    keys.forEach(function (k) {
      var cands = table[k];
      var n = 0;
      // 逐次查找并替换，第 i 次用候选表里第 i 个，形成轮换
      while (true) {
        var i = out.indexOf(k);
        if (i < 0) break;
        var rep = cands[n % cands.length];
        if (rep === k) { n++; break; }
        out = out.slice(0, i) + rep + out.slice(i + k.length);
        n++;
        counts[k] = (counts[k] || 0) + 1;
        if (n > 200) break; // 防御：极端输入不至于卡死
      }
      if (counts[k]) used.push([k, counts[k]]);
    });
    return { text: out, used: used, level: level };
  }

  function syRun() {
    var level = Number($('sy-level').value) || 2;
    var r = synonymReplace($('sy-in').value, level);
    $('sy-out').textContent = r.text;

    var grid = $('sy-grid');
    grid.innerHTML = '';
    grid.appendChild(cell('替换总量', r.used.reduce(function (a, b) { return a + b[1]; }, 0) + ' 处'));
    grid.appendChild(cell('涉及词条', r.used.length + ' 个'));
    grid.appendChild(cell('强度', { 1: '轻度', 2: '中度', 3: '重度' }[r.level]));
    grid.appendChild(cell('词表规模', Object.keys(SYNONYMS[r.level] || {}).length + ' 条'));

    $('sy-hint').textContent = r.used.length
      ? '替换明细：' + r.used.map(function (u) { return u[0] + '×' + u[1]; }).join('、')
      : '没有可替换的词条，或原文未出现词表里的词。';
    return r;
  }

  $('sy-run').addEventListener('click', syRun);
  $('sy-level').addEventListener('change', syRun);
  $('sy-clear').addEventListener('click', function () { $('sy-in').value = ''; syRun(); });
  $('sy-in').addEventListener('input', syRun);

  /* ================= 3. 字数统计 ================= */

  function countText(text) {
    var s = String(text || '');
    var chars = s.length;
    var han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    var cjkPunct = (s.match(/[\u3000-\u303f\uff00-\uffef]/g) || []).length;
    var letters = (s.match(/[A-Za-z]/g) || []).length;
    var digits = (s.match(/[0-9]/g) || []).length;
    var spaces = (s.match(/[ \t]/g) || []).length;
    var newlines = (s.match(/[\n\r]/g) || []).length;
    var lines = s.length ? s.split('\n').length : 0;
    var paragraphs = s.trim() ? s.trim().split(/\n\s*\n/).filter(function (x) { return x.trim(); }).length : 0;
    // 英文单词 + 数字串；中文按字计
    var words = (s.match(/[A-Za-z0-9']+/g) || []).length;
    var tabs = (s.match(/\t/g) || []).length;
    var bytes = utf8Len(s);
    // others 是扣掉已分类字符后的余量，负数说明分类有重叠，钳到 0
    var others = chars - han - cjkPunct - letters - digits - spaces - newlines;

    return {
      chars: chars, han: han, cjkPunct: cjkPunct, letters: letters, digits: digits,
      spaces: spaces, newlines: newlines, tabs: tabs, lines: lines, paragraphs: paragraphs,
      words: words, bytes: bytes, others: Math.max(0, others)
    };
  }

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

  function ctRun() {
    var r = countText($('ct-in').value);
    var stat = $('ct-stat');
    stat.innerHTML = '';
    [['总字符', r.chars], ['汉字', r.han], ['英文单词', r.words], ['总字节', r.bytes]].forEach(function (p) {
      var d = document.createElement('div');
      var b = document.createElement('b'); b.textContent = p[1];
      var s = document.createElement('span'); s.textContent = p[0];
      d.appendChild(b); d.appendChild(s);
      stat.appendChild(d);
    });

    var grid = $('ct-grid');
    grid.innerHTML = '';
    var noWs = r.chars - r.spaces - r.newlines;
    [['行数', r.lines], ['段落数', r.paragraphs], ['不含空白字符', noWs]].forEach(function (p) {
      grid.appendChild(cell(p[0], p[1]));
    });

    var rows = [
      ['汉字', r.han, r.han * 3],
      ['中文标点 / 全角符号', r.cjkPunct, r.cjkPunct * 3],
      ['英文字母', r.letters, r.letters],
      ['数字', r.digits, r.digits],
      ['空白（空格 / 制表）', r.spaces, r.spaces],
      ['其他符号', r.others, r.others]
    ];
    var body = $('ct-body');
    body.innerHTML = '';
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      row.forEach(function (v, i) {
        var td = document.createElement('td');
        td.textContent = v;
        if (i) td.className = 'num';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return r;
  }

  $('ct-run').addEventListener('click', ctRun);
  $('ct-clear').addEventListener('click', function () { $('ct-in').value = ''; ctRun(); });
  $('ct-in').addEventListener('input', ctRun);

  /* ================= 4. 行去重 ================= */

  var ddOpts = { trim: true, case: false, blank: true };

  function dedupeLines(text, opts) {
    var raw = String(text || '').split('\n');
    var seen = {}, counts = {}, keep = [];
    var keepIndex = {};   // 记录某个 key 在 keep 里的位置，便于保留空行的每个实例
    raw.forEach(function (l) {
      var v = opts.trim ? l.trim() : l;
      if (opts.blank && v === '') return;
      var key = opts.case ? v.toLowerCase() : v;
      counts[key] = (counts[key] || 0) + 1;
      if (seen[key]) return;   // 保留首次出现的原始写法，大小写不同视为同一行
      seen[key] = true;
      keepIndex[key] = keep.length;
      keep.push(v);
    });
    var counter = Object.keys(counts).map(function (k) {
      return { text: k, count: counts[k] };
    }).sort(function (a, b) { return b.count - a.count || a.text.localeCompare(b.text); });
    return { lines: keep, text: keep.join('\n'), counter: counter, before: raw.length, after: keep.length };
  }

  function ddRun() {
    var src = $('dd-in').value;
    var r = dedupeLines(src, ddOpts);
    $('dd-out').textContent = r.text;
    var grid = $('dd-grid');
    grid.innerHTML = '';
    grid.appendChild(cell('去重前行数', String(r.before)));
    grid.appendChild(cell('去重后行数', String(r.after)));
    grid.appendChild(cell('删除行数', String(r.before - r.after)));
    grid.appendChild(cell('重复组数', String(r.counter.filter(function (c) { return c.count > 1; }).length)));
    return r;
  }

  var ddBtns = $('dd-opts').querySelectorAll('button');
  [].forEach.call(ddBtns, function (b) {
    b.addEventListener('click', function () {
      b.classList.toggle('on');
      ddOpts[b.dataset.opt] = b.classList.contains('on');
      ddRun();
    });
  });
  $('dd-run').addEventListener('click', ddRun);
  $('dd-in').addEventListener('input', ddRun);
  $('dd-copy').addEventListener('click', function () { T.copy(ddRun().text); });
  $('dd-count').addEventListener('click', function () {
    var r = ddRun();
    var t = $('dd-table');
    if (!t.hidden) { t.hidden = true; this.classList.remove('on'); return; }
    this.classList.add('on');
    var body = $('dd-body');
    body.innerHTML = '';
    r.counter.slice(0, 200).forEach(function (c) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td'); td1.textContent = c.text;
      var td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = String(c.count);
      tr.appendChild(td1); tr.appendChild(td2);
      body.appendChild(tr);
    });
    t.hidden = false;
  });
  $('dd-reset').addEventListener('click', function () {
    ddOpts = { trim: true, case: false, blank: true };
    [].forEach.call(ddBtns, function (b) {
      b.classList.toggle('on', !!ddOpts[b.dataset.opt]);
    });
    $('dd-table').hidden = true;
    ddRun();
  });

  /* ================= 4.5 全半角互转 ================= */

  // 全角 ASCII（U+FF01~U+FF5E）与半角 ASCII（U+0021~U+007E）相差固定的 0xFEE0，
  // 全角空格 U+3000 与半角空格 U+0020 单独处理。这是最省事的换法，不需查表。
  function toHalfWidth(s) {
    return String(s).replace(/[\uFF01-\uFF5E]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');
  }

  function toFullWidth(s) {
    return String(s).replace(/[!-~]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) + 0xFEE0);
    }).replace(/ /g, '\u3000');
  }

  /* ================= 4.6 大小写转换 ================= */

  function changeCase(text, mode) {
    var s = String(text);
    if (mode === 'upper') return s.toUpperCase();
    if (mode === 'lower') return s.toLowerCase();
    if (mode === 'title') {
      // 标题式：每个单词首字母大写，其余小写
      return s.replace(/[A-Za-z]+/g, function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
    }
    if (mode === 'sentence') {
      // 句首大写：句号 / 叹号 / 问号加空白之后的首字母
      return s.replace(/(^|[.!?]\s+)([a-z])/g, function (_, a, b) { return a + b.toUpperCase(); });
    }
    if (mode === 'toggle') {
      // 逐字符反转大小写
      return s.split('').map(function (c) {
        return c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
      }).join('');
    }
    return s;
  }

  /* ================= 5. 一键排版 ================= */

  var tdOpts = { blank: true, space: true, fullwidth: true, indent: true, trim: true, cjk: true, punct: true };

  // 中文标点 → 全角。只处理夹在中文之间的 ASCII 标点，避免误伤代码与网址。
  var PUNCT_MAP = { ',': '，', '.': '。', ';': '；', ':': '：', '?': '？', '!': '！', '(': '（', ')': '）' };

  function tidyText(text, opts) {
    var s = String(text || '');
    var before = { chars: s.length, blanks: (s.match(/\n{2,}/g) || []).length };
    if (opts.fullwidth) s = s.replace(/\u3000/g, ' ');
    if (opts.blank) s = s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
    if (opts.space) s = s.replace(/[ \t]{2,}/g, ' ');
    if (opts.indent) s = s.replace(/^[ \t]+/gm, '');
    if (opts.trim) s = s.replace(/[ \t]+$/gm, '').replace(/^\n+/, '').replace(/\n+$/, '');
    if (opts.punct) {
      s = s.replace(/([\u4e00-\u9fff])([,.;:?!()])/g, function (m, a, b) { return a + PUNCT_MAP[b]; });
      s = s.replace(/([,.;:?!()])([\u4e00-\u9fff])/g, function (m, b, a) { return PUNCT_MAP[b] + a; });
    }
    if (opts.cjk) {
      // 中文与拉丁字母/数字之间补一个空格；已有空格的不重复加
      s = s.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2');
      s = s.replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
    }
    s = s.replace(/\n{3,}/g, '\n\n');
    return { text: s, before: before, after: { chars: s.length, blanks: (s.match(/\n{2,}/g) || []).length } };
  }

  function tdRun() {
    var r = tidyText($('td-in').value, tdOpts);
    $('td-out').textContent = r.text;
    var grid = $('td-grid');
    grid.innerHTML = '';
    grid.appendChild(cell('字符数', r.before.chars + ' → ' + r.after.chars));
    grid.appendChild(cell('连续空行段', r.before.blanks + ' → ' + r.after.blanks));
    grid.appendChild(cell('生效项', Object.keys(tdOpts).filter(function (k) { return tdOpts[k]; }).length + ' / ' + Object.keys(tdOpts).length));
    return r;
  }

  var tdBtns = $('td-opts').querySelectorAll('button');
  [].forEach.call(tdBtns, function (b) {
    b.addEventListener('click', function () {
      b.classList.toggle('on');
      tdOpts[b.dataset.opt] = b.classList.contains('on');
      tdRun();
    });
  });
  $('td-run').addEventListener('click', tdRun);
  $('td-in').addEventListener('input', tdRun);
  $('td-reset').addEventListener('click', function () {
    Object.keys(tdOpts).forEach(function (k) { tdOpts[k] = true; });
    [].forEach.call(tdBtns, function (b) { b.classList.add('on'); });
    tdRun();
  });

  /* ================= 4.7 全半角 / 大小写面板 ================= */

  var cwMode = 'upper';   // 大小写模式

  function widthRun(dir) {
    var src = $('wd-in').value;
    var out = dir === 'half' ? toHalfWidth(src) : toFullWidth(src);
    $('wd-out').textContent = out;
    var grid = $('wd-grid');
    grid.innerHTML = '';
    var fullCount = (String(src).match(/[\uFF01-\uFF5E\u3000]/g) || []).length;
    var halfCount = (String(src).match(/[!-~ ]/g) || []).length;
    grid.appendChild(cell('原文长度', String(src).length + ' 字符'));
    grid.appendChild(cell('全角字符数', String(fullCount)));
    grid.appendChild(cell('半角字符数', String(halfCount)));
    grid.appendChild(cell('结果长度', out.length + ' 字符'));
    return out;
  }

  function caseRun(mode) {
    mode = mode || cwMode;
    var src = $('cs-in').value;
    var out = changeCase(src, mode);
    $('cs-out').textContent = out;
    var grid = $('cs-grid');
    grid.innerHTML = '';
    grid.appendChild(cell('模式', {
      upper: '全部大写', lower: '全部小写', title: '标题式',
      sentence: '句首大写', toggle: '反转大小写'
    }[mode]));
    grid.appendChild(cell('原文', src.length + ' 字符'));
    grid.appendChild(cell('结果', out.length + ' 字符'));
    grid.appendChild(cell('是否变化', out === src ? '未变' : '已转换'));
    return out;
  }

  var csBtns = $('cs-mode').querySelectorAll('button');
  [].forEach.call(csBtns, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(csBtns, function (o) { o.classList.toggle('on', o === b); });
      cwMode = b.dataset.mode;
      caseRun(cwMode);
    });
  });
  $('wd-in').addEventListener('input', function () { widthRun('half'); });
  $('wd-copy').addEventListener('click', function () { T.copy($('wd-out').textContent); });
  $('cs-copy').addEventListener('click', function () { T.copy($('cs-out').textContent); });
  ['wd-half', 'wd-full'].forEach(function (id) {
    $(id).addEventListener('click', function () { widthRun(id === 'wd-half' ? 'half' : 'full'); });
  });
  $('cs-in').addEventListener('input', function () { caseRun(cwMode); });
  $('cs-run').addEventListener('click', function () { caseRun(cwMode); });

  /* ================= 页签 ================= */

  var PANELS = ['sens', 'syn', 'count', 'dedup', 'tidy', 'width', 'case'];
  function setTab(name) {
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
  }
  T.tabs($('tabs'), setTab);

  /* ================= 初始化 ================= */

  snRun(); syRun(); ctRun(); ddRun(); tdRun();
  widthRun('half');
  caseRun('upper');
  setTab('sens');

  window.__text2 = {
    SENSITIVE: SENSITIVE, SYNONYMS: SYNONYMS, PINYIN_ALIAS: PINYIN_ALIAS,
    normalize: normalize, detectSensitive: detectSensitive, synonymReplace: synonymReplace,
    countText: countText, utf8Len: utf8Len, dedupeLines: dedupeLines, tidyText: tidyText,
    toHalfWidth: toHalfWidth, toFullWidth: toFullWidth, changeCase: changeCase
  };
})();

/* 开发工具：JSON 格式化、SQL 格式化、文本对比、JWT 解析
   全部本地计算。纯函数集中在文件前部，便于测试脚本取向量。 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 通用：去掉注释与尾逗号，让 JSON 更宽容 ----------
     JSON5 风格。逐字符扫描，字符串内的 // 和 , 不动。 */
  function stripJsonLoose(src) {
    var out = '';
    var i = 0;
    var inStr = false, quote = '', esc = false;
    while (i < src.length) {
      var c = src[i];
      if (inStr) {
        out += c;
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === quote) inStr = false;
        i++;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; quote = c; out += c; i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      out += c; i++;
    }
    // 尾逗号：, 后面（含空白）紧跟 } 或 ]
    out = out.replace(/,(\s*[}\]])/g, '$1');
    return out;
  }

  /* 统计 JSON 嵌套层数（不含最外层） */
  function jsonDepth(v) {
    if (v === null || typeof v !== 'object') return 0;
    var child = 0;
    var arr = Array.isArray(v) ? v : Object.keys(v).map(function (k) { return v[k]; });
    arr.forEach(function (x) { child = Math.max(child, jsonDepth(x)); });
    return child + 1;
  }

  function byteLen(s) { return new TextEncoder().encode(s).length; }
  function utf8Len(s) { return byteLen(s); }

  var JSON_INDENT = 2;

  function fmtJson(src, indent) {
    var text = stripJsonLoose(String(src == null ? '' : src).trim());
    if (!text) return { err: '请先粘贴 JSON 内容。' };
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 带出出错位置，便于定位
      var m = /position (\d+)/.exec(e.message);
      var at = m ? '（第 ' + (+m[1] + 1) + ' 个字符附近）' : '';
      return { err: '不是合法 JSON' + at + '：' + e.message };
    }
    var pad;
    if (indent === 0) pad = null;
    else if (indent === 'tab') pad = '\t';
    else pad = indent;
    var out = pad === null ? JSON.stringify(data) : JSON.stringify(data, null, pad);
    return { text: out, value: data, depth: jsonDepth(data) };
  }

  /* 转成 JS 对象字面量：给键加引号与否都行，这里保持 JSON 形式但对 Date 类字符串不动 */
  function jsonToJsObject(src) {
    var r = fmtJson(src, 2);
    if (r.err) return r;
    var t = r.text;
    // 已经是合法 JSON，JS 字面量可直接解析；仅把顶层无引号的键情形忽略
    return { text: 'const data = ' + t + ';', value: r.value };
  }

  /* ---------- SQL 格式化 ----------
     思路：先把字符串字面量与注释挖出来存成占位符，避免关键字替换误伤，
     替换完再还原。这是 SQL 美化能不能用的关键。 */
  var SQL_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX',
    'VIEW', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'AS', 'GROUP', 'BY',
    'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'ASC', 'DESC', 'EXISTS', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
    'DEFAULT', 'UNIQUE', 'CHECK', 'WITH', 'TOP', 'OVER', 'PARTITION', 'ROW_NUMBER'];

  var SQL_NEWLINE_BEFORE = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
    'UNION', 'UNION ALL', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'AND', 'OR', 'JOIN'];

  function sqlTokens(src, breakFields) {
    var text = String(src == null ? '' : src);
    var holes = [];
    function stash(s) {
      holes.push(s);
      return '\u0001' + (holes.length - 1) + '\u0001';
    }
    // 挖字符串、反引号标识符、注释
    text = text.replace(/'(?:[^'\\]|\\.|'')*'/g, function (m) { return stash(m); });
    text = text.replace(/"(?:[^"\\]|\\.)*"/g, function (m) { return stash(m); });
    text = text.replace(/`[^`]*`/g, function (m) { return stash(m); });
    text = text.replace(/--[^\n]*/g, function (m) { return stash(m); });
    text = text.replace(/\/\*[\s\S]*?\*\//g, function (m) { return stash(m); });

    text = text.replace(/\s+/g, ' ').trim();
    // 把多字关键字先合成一个标记
    var MULTI = ['UNION ALL', 'GROUP BY', 'ORDER BY', 'INSERT INTO', 'DELETE FROM', 'CREATE TABLE',
      'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'OUTER JOIN', 'IS NOT', 'NOT IN', 'NOT LIKE'];
    MULTI.forEach(function (m) {
      text = text.replace(new RegExp('\\b' + m.replace(/ /g, '\\s+') + '\\b', 'gi'), '\u0002' + m + '\u0002');
    });
    return { text: text, holes: holes };
  }

  function fmtSql(src, opts) {
    opts = opts || {};
    var cased = opts.caseMode || 'upper';
    var breakFields = !!opts.breakFields;
    var text = String(src == null ? '' : src).trim();
    if (!text) return { err: '请先粘贴 SQL 语句。' };

    var st = sqlTokens(text);
    var t = st.text;

    // 关键字大小写
    if (cased !== 'keep') {
      var kwRe = new RegExp('\\b(' + SQL_KEYWORDS.join('|') + ')\\b', 'gi');
      t = t.replace(kwRe, function (m) {
        return cased === 'upper' ? m.toUpperCase() : m.toLowerCase();
      });
      // 多字标记内的两段也一并处理
      t = t.replace(/\u0002([^\u0002]+)\u0002/g, function (_, m) {
        return m.split(/\s+/).map(function (w) {
          return SQL_KEYWORDS.indexOf(w.toUpperCase()) >= 0 ? (cased === 'upper' ? w.toUpperCase() : w.toLowerCase()) : w;
        }).join(' ');
      });
    } else {
      t = t.replace(/\u0002([^\u0002]+)\u0002/g, '$1');
    }

    // 主关键字前换行
    var NEWLINE_RE = /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION ALL|UNION|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|AND|OR|LEFT JOIN|RIGHT JOIN|INNER JOIN|FULL JOIN|JOIN)\b/g;
    t = t.replace(/\s+/g, ' ');
    // 统一在逗号后加空格
    t = t.replace(/\s*,\s*/g, ', ');
    // 括号内侧不留空格
    t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

    if (breakFields) {
      t = t.replace(/\s*,\s*/g, ',\n  ');
      var lines = t.split('\n');
      lines = lines.map(function (ln) { return ln.trim(); });
      t = lines.join('\n');
    }

    t = t.replace(NEWLINE_RE, function (m, kw) { return '\n' + kw; });
    // 缩进：主关键字顶格，其余缩进两格
    var out = t.split('\n').map(function (ln) {
      ln = ln.replace(/\s+/g, ' ').trim();
      if (!ln) return '';
      var isMain = /^(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION|UNION ALL|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE)\b/i.test(ln);
      return (isMain ? '' : '  ') + ln;
    }).filter(function (ln, i, a) { return !(ln === '' && a[i - 1] === ''); }).join('\n');

    // 还原占位符
    out = out.replace(/\u0001(\d+)\u0001/g, function (_, n) { return st.holes[+n]; });
    out = out.replace(/\u0002([^\u0002]+)\u0002/g, function (_, m) { return m; });
    return { text: out.trim() };
  }

  function minSql(src) {
    var text = String(src == null ? '' : src);
    var st = sqlTokens(text);
    var t = st.text.replace(/\s+/g, ' ').trim();
    t = t.replace(/\s*,\s*/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    // 运算符两侧不留空格（字符串与注释已被占位符保护）
    t = t.replace(/\s*([=<>!+\-*\/%|&]+)\s*/g, '$1');
    t = t.replace(/\u0001(\d+)\u0001/g, function (_, n) { return st.holes[+n]; });
    t = t.replace(/\u0002([^\u0002]+)\u0002/g, '$1');
    return { text: t };
  }

  /* ---------- 文本对比：LCS + 回溯 ----------
     行级对比用 LCS 最直观；词/字符级复用同一套，只要换切分方式。 */
  function tokenize(s, mode) {
    if (mode === 'char') return s.split('');
    if (mode === 'word') return s.split(/(\s+)/).filter(function (x) { return x !== ''; });
    return s.split('\n');
  }

  function lcsDiff(a, b) {
    var n = a.length, m = b.length;
    // 超长输入建表会炸内存，先做个上限保护
    if (n * m > 4e6) return null;
    // 滚动数组存长度，另开一维用于回溯（Uint32 省内存）
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var res = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { res.push({ t: 'same', v: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { res.push({ t: 'del', v: a[i] }); i++; }
      else { res.push({ t: 'add', v: b[j] }); j++; }
    }
    while (i < n) { res.push({ t: 'del', v: a[i] }); i++; }
    while (j < m) { res.push({ t: 'add', v: b[j] }); j++; }
    return res;
  }

  /* 词/字符级时把连续同类合并成一段，避免输出碎片化 */
  function mergeRuns(ops) {
    var out = [];
    ops.forEach(function (op) {
      var last = out[out.length - 1];
      if (last && last.t === op.t) last.v += op.v;
      else out.push({ t: op.t, v: op.v });
    });
    return out;
  }

  function diffText(a, b, opts) {
    opts = opts || {};
    var A = tokenize(a, opts.mode);
    var B = tokenize(b, opts.mode);
    function norm(x) {
      var s = x;
      if (opts.trim) s = s.trim();
      if (opts.case) s = s.toLowerCase();
      return s;
    }
    if (opts.blank && opts.mode !== 'line') {
      A = A.filter(function (x) { return x.trim() !== ''; });
      B = B.filter(function (x) { return x.trim() !== ''; });
      opts = Object.assign({}, opts, { blank: false });
    }
    var na = A.map(norm), nb = B.map(norm);
    if (opts.blank) {
      /* 空行不参与匹配，但两侧的空行本质上是等价内容：
         先把空行剔出去做 LCS，再把空行当成 same 插回去，展示上就不丢行。 */
      var ia = [], ib = [];
      na.forEach(function (v, i) { if (v.trim() !== '') ia.push(i); });
      nb.forEach(function (v, i) { if (v.trim() !== '') ib.push(i); });
      var opsIn = lcsDiff(ia.map(function (i) { return na[i]; }), ib.map(function (i) { return nb[i]; }));
      if (!opsIn) return { err: '内容过长，按行对比的结果可能不准确，请缩小范围。' };
      // LCS 结果按顺序还原成「原行 + 中间空行」
      var res = [], ka = 0, kb = 0;
      function flushBlank(side, from, to) {
        for (var k = from; k < to; k++) {
          if ((side === 'a' ? na[k] : nb[k]).trim() === '') res.push({ t: 'same', v: side === 'a' ? A[k] : B[k] });
        }
      }
      var lastA = 0, lastB = 0;
      opsIn.forEach(function (op) {
        if (op.t === 'same') {
          flushBlank('a', lastA, ia[ka]); flushBlank('b', lastB, ib[kb]);
          res.push({ t: 'same', v: A[ia[ka]] });
          lastA = ia[ka] + 1; lastB = ib[kb] + 1; ka++; kb++;
        } else if (op.t === 'del') {
          flushBlank('a', lastA, ia[ka]);
          res.push({ t: 'del', v: A[ia[ka]] });
          lastA = ia[ka] + 1; ka++;
        } else {
          flushBlank('b', lastB, ib[kb]);
          res.push({ t: 'add', v: B[ib[kb]] });
          lastB = ib[kb] + 1; kb++;
        }
      });
      flushBlank('a', lastA, A.length); flushBlank('b', lastB, B.length);
      return { ops: res, a: A, b: B, mode: opts.mode };
    }
    var ops = lcsDiff(na, nb);
    if (!ops) return { err: '内容过长（超过 400 万格），请缩小对比范围或改用按行。' };
    // LCS 跑在归一化后的内容上，展示时换回原文
    var ai = 0, bi = 0;
    var disp = ops.map(function (op) {
      if (op.t === 'same') { var v = A[ai]; ai++; bi++; return { t: 'same', v: v }; }
      if (op.t === 'del') { var v2 = A[ai]; ai++; return { t: 'del', v: v2 }; }
      var v3 = B[bi]; bi++; return { t: 'add', v: v3 };
    });
    if (opts.mode !== 'line') disp = mergeRuns(disp);
    return { ops: disp, a: A, b: B, mode: opts.mode };
  }

  /* ---------- JWT ---------- */
  function b64urlDecode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    // 处理 UTF-8 多字节
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64DecodeInput(s) {
    try { return b64urlDecode(s); } catch (e) { return null; }
  }
  /* 从 base64 原文读出头部 alg/kid，不解 JSON，用于字段缺失时的兜底 */
  function jwtParse(token) {
    var parts = String(token == null ? '' : token).trim().split('.');
    if (parts.length < 2) return { err: 'JWT 至少要有「头部.载荷」两段，当前 ' + parts.length + ' 段。' };
    if (parts.length > 3) return { err: 'JWT 最多三段（头部.载荷.签名），当前 ' + parts.length + ' 段。' };
    var headTxt = b64DecodeInput(parts[0]);
    var payTxt = b64DecodeInput(parts[1]);
    if (headTxt === null) return { err: '头部不是合法的 Base64URL。' };
    if (payTxt === null) return { err: '载荷不是合法的 Base64URL。' };
    var head, pay;
    try { head = JSON.parse(headTxt); } catch (e) { return { err: '头部不是合法 JSON：' + e.message }; }
    try { pay = JSON.parse(payTxt); } catch (e) { return { err: '载荷不是合法 JSON：' + e.message }; }
    var out = { header: head, payload: pay, sig: parts[2] || '', raw: parts };
    // 常用声明
    var claims = [];
    if (pay.iss) claims.push(['签发者 iss', pay.iss]);
    if (pay.sub) claims.push(['主体 sub', pay.sub]);
    if (pay.aud) claims.push(['接收方 aud', Array.isArray(pay.aud) ? pay.aud.join(', ') : pay.aud]);
    if (pay.exp != null) {
      var d = new Date(pay.exp * 1000);
      claims.push(['过期时间 exp', d.toLocaleString('zh-CN', { hour12: false }) + (Date.now() > pay.exp * 1000 ? '（已过期）' : '（有效）')]);
    }
    if (pay.nbf != null) claims.push(['生效时间 nbf', new Date(pay.nbf * 1000).toLocaleString('zh-CN', { hour12: false })]);
    if (pay.iat != null) claims.push(['签发时间 iat', new Date(pay.iat * 1000).toLocaleString('zh-CN', { hour12: false })]);
    if (pay.jti) claims.push(['编号 jti', pay.jti]);
    out.claims = claims;
    out.expired = pay.exp != null ? Date.now() > pay.exp * 1000 : null;
    // 生成新 token 用：把某段换成改写后的 JSON
    return out;
  }
  /* 便于自测：伪造一个未签名 token */
  function jwtBuild(header, payload, sig) {
    return b64urlEncode(JSON.stringify(header)) + '.' + b64urlEncode(JSON.stringify(payload)) + '.' + (sig || '');
  }

  /* ---------- 界面 ---------- */
  var TAB = 'json';

  function showTab(name) {
    TAB = name;
    [].forEach.call($('tabs').querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.tab === name);
    });
    ['json', 'sql', 'diff', 'jwt'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
  }
  T.tabs($('tabs'), showTab);

  /* JSON 面板 */
  function jsonRun() {
    var r = fmtJson($('json-in').value, JSON_INDENT);
    var err = $('json-err');
    if (r.err) {
      $('json-out').value = '';
      err.className = 'hint err';
      err.textContent = r.err;
      $('js-size-in').textContent = String(utf8Len($('json-in').value));
      $('js-size-out').textContent = '0';
      $('js-depth').textContent = '0';
      return;
    }
    $('json-out').value = r.text;
    err.className = 'hint';
    err.textContent = '解析成功，字段树共 ' + countNodes(r.value) + ' 个节点。';
    $('js-size-in').textContent = String(utf8Len($('json-in').value));
    $('js-size-out').textContent = String(utf8Len(r.text));
    $('js-depth').textContent = String(r.depth);
  }
  function countNodes(v) {
    if (v === null || typeof v !== 'object') return 1;
    var n = 1;
    var arr = Array.isArray(v) ? v : Object.keys(v).map(function (k) { return v[k]; });
    arr.forEach(function (x) { n += countNodes(x); });
    return n;
  }
  $('json-run').addEventListener('click', jsonRun);
  $('json-min').addEventListener('click', function () {
    JSON_INDENT = 0;
    jsonRun();
    [].forEach.call($('json-indent').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.ind === '0'); });
  });
  $('json-indent').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var v = b.dataset.ind;
    JSON_INDENT = v === 'tab' ? 'tab' : Number(v);
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    jsonRun();
  });
  T.bindCopy($('json-copy'), function () { return $('json-out').value; });
  $('json-to-js').addEventListener('click', function () {
    var r = jsonToJsObject($('json-in').value);
    var err = $('json-err');
    if (r.err) { err.className = 'hint err'; err.textContent = r.err; return; }
    $('json-out').value = r.text;
    err.className = 'hint';
    err.textContent = '已转为可直接粘贴进 JS 的字面量。';
  });
  $('json-in').addEventListener('input', jsonRun);

  /* SQL 面板 */
  var SQL_OPT = { caseMode: 'upper', breakFields: false };
  function sqlRun() {
    var r = fmtSql($('sql-in').value, SQL_OPT);
    var err = $('sql-err');
    if (r.err) { err.className = 'hint err'; err.textContent = r.err; return; }
    err.className = 'hint';
    err.textContent = '';
    $('sql-out').value = r.text;
  }
  $('sql-run').addEventListener('click', sqlRun);
  $('sql-min').addEventListener('click', function () {
    var r = minSql($('sql-in').value);
    $('sql-out').value = r.text;
    $('sql-err').textContent = '';
  });
  $('sql-case').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    SQL_OPT.caseMode = b.dataset.case;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    sqlRun();
  });
  $('sql-break').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    SQL_OPT.breakFields = b.dataset.break === '1';
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    sqlRun();
  });
  T.bindCopy($('sql-copy'), function () { return $('sql-out').value; });
  $('sql-in').addEventListener('input', sqlRun);

  /* 对比面板 */
  var DIFF_OPT = { mode: 'line', trim: true, case: false, blank: true };
  function diffRun() {
    var r = diffText($('diff-a').value, $('diff-b').value, DIFF_OPT);
    var box = $('diff-out');
    if (r.err) { box.textContent = r.err; $('d-add').textContent = $('d-del').textContent = $('d-same').textContent = '0'; return; }
    var add = 0, del = 0, same = 0;
    box.innerHTML = '';
    var lineNo = 0, lastEnd = '';
    r.ops.forEach(function (op) {
      var row = document.createElement('div');
      row.className = 'ln ' + (op.t === 'same' ? 'same' : op.t === 'add' ? 'add' : 'del');
      var no = document.createElement('span');
      no.className = 'no';
      var tx = document.createElement('span');
      tx.className = 'tx';
      var text = op.v;
      if (DIFF_OPT.mode !== 'line') {
        // 词/字符级：把换行显示成可见符号，避免行号错乱
        tx.textContent = text === '\n' ? '⏎\n' : text;
        no.textContent = op.t === 'add' ? '+' : op.t === 'del' ? '−' : '';
      } else {
        if (op.t === 'add') { no.textContent = '+'; }
        else if (op.t === 'del') { no.textContent = '−'; }
        else { lineNo++; no.textContent = String(lineNo); }
        tx.textContent = text === '' ? '\u00a0' : text;
      }
      if (op.t === 'same') same++;
      else if (op.t === 'add') add++;
      else del++;
      row.appendChild(no); row.appendChild(tx);
      box.appendChild(row);
    });
    $('d-add').textContent = String(add);
    $('d-del').textContent = String(del);
    $('d-same').textContent = String(same);
    if (!r.ops.length) box.textContent = '两侧都为空。';
  }
  $('diff-run').addEventListener('click', diffRun);
  $('diff-swap').addEventListener('click', function () {
    var t = $('diff-a').value; $('diff-a').value = $('diff-b').value; $('diff-b').value = t;
    diffRun();
  });
  $('diff-mode').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    DIFF_OPT.mode = b.dataset.mode;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    diffRun();
  });
  $('diff-opt').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var k = b.dataset.opt;
    DIFF_OPT[k] = !DIFF_OPT[k];
    b.classList.toggle('on', DIFF_OPT[k]);
    diffRun();
  });
  ['diff-a', 'diff-b'].forEach(function (id) { $(id).addEventListener('input', diffRun); });

  /* JWT 面板 */
  function jwtRun() {
    var box = $('jwt-parts'), grid = $('jwt-grid'), out = $('jwt-out');
    var r = jwtParse($('jwt-in').value);
    box.innerHTML = ''; grid.innerHTML = ''; out.className = 'out';
    if (r.err) {
      out.className = 'out err';
      out.textContent = r.err;
      return;
    }
    function part(label, text, cls) {
      var d = document.createElement('div');
      var s = document.createElement('span');
      s.className = 'k'; s.textContent = label;
      d.appendChild(s);
      d.appendChild(document.createTextNode(text));
      if (cls) d.className = cls;
      box.appendChild(d);
    }
    part('头部 header（红）', r.raw[0], 'p1');
    part('载荷 payload（紫）', r.raw[1], 'p2');
    part('签名 signature（蓝）' + (r.sig ? '' : ' — 无'), r.sig || '(空，未签名的 JWT)', 'p3');

    T.cells(grid, [
      ['算法 alg', r.header.alg || '—'],
      ['类型 typ', r.header.typ || '—'],
      ['密钥 ID kid', r.header.kid || '—'],
      ['状态', r.expired === null ? '无 exp 声明' : r.expired ? '已过期' : '未过期']
    ]);
    var lines = [];
    r.claims.forEach(function (c) { lines.push(c[0] + '：' + c[1]); });
    lines.push('');
    lines.push('头部（展开）');
    lines.push(JSON.stringify(r.header, null, 2));
    lines.push('载荷（展开）');
    lines.push(JSON.stringify(r.payload, null, 2));
    out.textContent = lines.join('\n');
  }
  $('jwt-run').addEventListener('click', jwtRun);
  $('jwt-clear').addEventListener('click', function () { $('jwt-in').value = ''; jwtRun(); });
  $('jwt-in').addEventListener('input', jwtRun);

  /* 初始示例，打开即可看到效果 */
  $('json-in').value = '{"site":"计量计算工具","version":2,"tags":["离线","零依赖"],"nested":{"ok":true,"level":{"deep":1}}, "count": 142}';
  $('sql-in').value = "select u.id, u.name, count(o.id) as cnt from users u left join orders o on o.uid=u.id where u.age>18 and u.city='北京' group by u.id order by cnt desc limit 10;";
  $('diff-a').value = ['计量工具集合', '支持校准', '支持黄金换算', '结束'].join('\n');
  $('diff-b').value = ['计量工具集合', '支持流量点校准', '支持黄金换算', '新增在线时钟', '结束'].join('\n');
  $('jwt-in').value = jwtBuild({ alg: 'HS256', typ: 'JWT' },
    { sub: '1234567890', name: '徐惠杰', iss: 'cnb.cool', iat: 1735689600, exp: 4070908800 }, 'c2lnbmF0dXJl');
  jsonRun(); sqlRun(); diffRun(); jwtRun();

  window.__dev = {
    stripJsonLoose: stripJsonLoose, fmtJson: fmtJson, jsonDepth: jsonDepth, jsonToJsObject: jsonToJsObject,
    fmtSql: fmtSql, minSql: minSql, diffText: diffText, lcsDiff: lcsDiff, mergeRuns: mergeRuns,
    jwtParse: jwtParse, jwtBuild: jwtBuild, b64urlDecode: b64urlDecode, b64urlEncode: b64urlEncode, byteLen: byteLen
  };
})();

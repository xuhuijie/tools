/* 网页与站长工具：源码查看 / Markdown / HTML 编辑器 / 定时刷新 / 短链 / robots / 备案 / DNS
   需要联网的两个功能（抓源码、短链）都做了降级提示，且失败不假装成功。
   其余全部纯本地：解析与生成逻辑不碰网络，也不把输入发出去。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ================= 1. 网页源码 ================= */

  // 公开只读代理。浏览器直连别的站点会被 CORS 拦，只有 https 的公开代理能兜底。
  var PROXIES = [
    { name: '直连', url: function (u) { return u; } },
    { name: 'r.jina.ai', url: function (u) { return 'https://r.jina.ai/' + u; } },
    { name: 'allorigins', url: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } }
  ];

  function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    // 已有协议头时先验协议，别把 ftp:// 之类补成 https://ftp//
    var scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
    if (scheme) {
      if (!/^https?$/i.test(scheme[1])) return null;
    } else {
      s = 'https://' + s;
    }
    try {
      var u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.href;
    } catch (e) { return null; }
  }

  function fetchSource(url, timeoutMs) {
    timeoutMs = timeoutMs || 15000;
    var i = 0;
    function next() {
      if (i >= PROXIES.length) return Promise.reject(new Error('所有通道都拿不到内容（多为对方站点或网络环境限制）'));
      var p = PROXIES[i++];
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs);
      return fetch(p.url(url), { signal: ctl ? ctl.signal : undefined, redirect: 'follow', cache: 'no-store' })
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text().then(function (t) {
            if (!t) throw new Error('返回内容为空');
            return { text: t, via: p.name, status: r.status };
          });
        })
        .catch(function () { clearTimeout(timer); return next(); });
    }
    return next();
  }

  var srcMsg = $('src-msg'), srcOut = $('src-out'), srcFrame = $('src-frame');

  function srcRun() {
    var url = normalizeUrl($('src-url').value);
    srcOut.textContent = '';
    srcFrame.removeAttribute('srcdoc');
    if (!url) { srcMsg.textContent = '网址格式不对，请输入 http(s):// 开头的地址。'; return; }
    srcMsg.className = 'hint';
    srcMsg.textContent = '正在获取…';
    $('src-run').disabled = true;
    fetchSource(url).then(function (r) {
      srcOut.textContent = r.text;
      srcFrame.setAttribute('srcdoc', r.text);
      srcMsg.className = 'hint';
      srcMsg.textContent = '已获取 ' + r.text.length + ' 个字符，通道：' + r.via +
        '（共 ' + r.text.split('\n').length + ' 行）。预览在内嵌沙箱中渲染。';
    }).catch(function (e) {
      srcMsg.className = 'hint err';
      srcMsg.textContent = '获取失败：' + e.message + '。可改用「下载后用浏览器查看源码」，或把源码粘贴到 Markdown 页签里看。';
    }).then(function () { $('src-run').disabled = false; });
  }

  $('src-run').addEventListener('click', srcRun);
  $('src-clear').addEventListener('click', function () {
    srcOut.textContent = ''; $('src-url').value = ''; srcFrame.removeAttribute('srcdoc');
    srcMsg.className = 'hint'; srcMsg.textContent = '';
  });
  $('src-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') srcRun(); });

  /* ================= 2. Markdown ================= */

  var MD_SAMPLES = {
    basic: [
      '# 一级标题', '',
      '## 二级标题', '',
      '正文支持 **加粗**、*斜体*、~~删除线~~、`行内代码`，以及 [链接](https://cnb.cool)。', '',
      '> 引用要写在一行的开头。', '',
      '- 无序列表', '- 第二项', '', '1. 有序列表', '2. 第二项', '',
      '---', '', '结尾段落。'
    ].join('\n'),
    table: [
      '## 表格', '',
      '| 工具 | 依赖 | 说明 |',
      '| --- | --- | --- |',
      '| 编码解码 | 无 | Base64 / URL / Hex |',
      '| 二维码 | qrcode-generator | 本地渲染 |', '',
      '## 代码块', '',
      '```js',
      'function add(a, b) {',
      '  return a + b;',
      '}',
      '```', '',
      '行内代码：`npm test`。'
    ].join('\n'),
    xss: [
      '## XSS 载荷（应被全部剥掉）', '',
      '<script>alert("script 标签")</script>', '',
      '<img src=x onerror="alert(\'onerror\')">', '',
      '<a href="javascript:alert(\'href\')">javascript: 链接</a>', '',
      '<iframe src="https://example.com"></iframe>', '',
      '<svg onload="alert(1)"></svg>', '',
      'Markdown 注入：<a href="#" onclick="alert(1)">onclick</a>', '',
      '正常内容应当保留：**加粗**、[安全链接](https://cnb.cool)。'
    ].join('\n')
  };

  var mdIn = $('md-in'), mdOut = $('md-out');
  var lastHtml = '';

  function sanitize(html) {
    if (typeof DOMPurify === 'undefined') return '';
    return DOMPurify.sanitize(html, {
      FORBID_TAGS: ['style', 'form', 'input', 'button'],
      FORBID_ATTR: ['style'],
      ALLOW_DATA_ATTR: false
    });
  }

  function mdRender() {
    var src = mdIn.value;
    if (!src.trim()) { mdOut.innerHTML = ''; lastHtml = ''; return; }
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
      mdOut.textContent = 'Markdown 解析库未加载（docs/lib/marked.js、docs/lib/dompurify.js 需与本页同目录部署）。';
      return;
    }
    var raw;
    try {
      raw = marked.parse(src, { gfm: true, breaks: true });
    } catch (e) {
      mdOut.textContent = '解析失败：' + e.message;
      return;
    }
    var clean = sanitize(raw);
    mdOut.innerHTML = clean;
    lastHtml = clean;
  }

  function mdDownload() {
    if (!lastHtml) { mdRender(); }
    var doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<title>Markdown 导出</title>\n<style>\n' +
      'body{max-width:720px;margin:0 auto;padding:24px 16px;color:#1f2329;' +
      'font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}\n' +
      'pre{background:#f5f6f8;border-radius:8px;padding:10px 12px;overflow:auto}\n' +
      'code{font-family:ui-monospace,Menlo,Consolas,monospace;background:#f0f1f3;border-radius:4px;padding:1px 4px}\n' +
      'pre code{background:none;padding:0}\n' +
      'table{border-collapse:collapse;width:100%}\n' +
      'th,td{border:1px solid #e8eaed;padding:6px 8px}\n' +
      'blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #e8eaed;color:#8a9099}\n' +
      '</style>\n</head>\n<body>\n' + lastHtml + '\n</body>\n</html>\n';
    download('markdown.html', doc, 'text/html');
  }

  var mdBtns = $('md-demo').querySelectorAll('button');
  [].forEach.call(mdBtns, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(mdBtns, function (o) { o.classList.toggle('on', o === b); });
      mdIn.value = MD_SAMPLES[b.dataset.demo];
      mdRender();
    });
  });
  $('md-run').addEventListener('click', mdRender);
  $('md-clear').addEventListener('click', function () {
    mdIn.value = ''; mdOut.innerHTML = ''; lastHtml = '';
    [].forEach.call(mdBtns, function (o) { o.classList.remove('on'); });
  });
  $('md-sample').addEventListener('click', function () {
    mdIn.value = MD_SAMPLES.basic; mdRender();
  });
  $('md-file').addEventListener('click', mdDownload);
  mdIn.addEventListener('input', mdRender);

  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* ================= 3. HTML 编辑器 ================= */

  var heEdit = $('he-edit'), heOut = $('he-out');
  var heSource = false;

  function heHtml() { return heSource ? heOut.textContent : heEdit.innerHTML; }

  var cmdBtns = $('he-tools').querySelectorAll('button');
  [].forEach.call(cmdBtns, function (b) {
    b.addEventListener('click', function () {
      if (heSource) return;
      [].forEach.call(cmdBtns, function (o) { o.classList.toggle('on', o === b); });
      heEdit.focus();
      try { document.execCommand(b.dataset.cmd, false, null); } catch (e) { /* 老浏览器不支持该命令就忽略 */ }
    });
  });

  var colBtns = $('he-colors').querySelectorAll('button');
  [].forEach.call(colBtns, function (b) {
    b.addEventListener('click', function () {
      if (heSource) return;
      [].forEach.call(colBtns, function (o) { o.classList.toggle('on', o === b); });
      heEdit.focus();
      // 后两个参数：useCSS=false 让浏览器直接写 <font style> 之外的行内样式，便于复制
      try { document.execCommand('foreColor', false, b.dataset.color); } catch (e) { /* 忽略 */ }
    });
  });

  $('he-preview').addEventListener('click', function () {
    heSource = !heSource;
    if (heSource) {
      heOut.textContent = heEdit.innerHTML;
      heOut.hidden = false;
      heEdit.hidden = true;
      this.textContent = '写回并预览';
    } else {
      heEdit.innerHTML = heOut.textContent;
      heOut.hidden = true;
      heEdit.hidden = false;
      this.textContent = '切换源码 / 预览';
    }
  });

  $('he-copy').addEventListener('click', function () {
    T.copy(heHtml());
    this.textContent = '已复制';
    var btn = this;
    setTimeout(function () { btn.textContent = '复制 HTML'; }, 1200);
  });

  $('he-file').addEventListener('click', function () {
    var doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>编辑器导出</title>\n' +
      '</head>\n<body>\n' + heHtml() + '\n</body>\n</html>\n';
    download('editor.html', doc, 'text/html');
  });

  /* ================= 4. 网址定时刷新 ================= */

  var rfTimer = null, rfLeft = 0, rfCount = 0;
  var rfUrl = $('rf-url'), rfSec = $('rf-sec'), rfFrame = $('rf-frame');

  function rfPaint() {
    $('rf-count').textContent = rfCount + ' 次';
    $('rf-next').textContent = rfTimer ? rfLeft + ' 秒' : '—';
  }

  function rfStop(reason) {
    if (rfTimer) { clearInterval(rfTimer); rfTimer = null; }
    $('rf-toggle').textContent = '开始刷新';
    $('rf-state').textContent = reason || '已停止';
    rfPaint();
  }

  function rfOpen() {
    var url = normalizeUrl(rfUrl.value);
    if (!url) { $('rf-state').textContent = '网址格式不对'; return false; }
    // 每次重设 src 都是整页重新加载，属于无缓存刷新
    rfFrame.setAttribute('src', url);
    return true;
  }

  function rfTick() {
    rfLeft -= 1;
    if (rfLeft <= 0) {
      rfCount += 1;
      var url = normalizeUrl(rfUrl.value);
      if (url) {
        // 加时间参数绕开浏览器缓存，保证拿到的是新内容
        rfFrame.setAttribute('src', url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now());
      }
      rfLeft = Math.max(5, Math.round(Number(rfSec.value) || 30));
    }
    rfPaint();
  }

  $('rf-open').addEventListener('click', function () {
    if (rfOpen()) { $('rf-state').textContent = '已加载，未开始定时刷新'; }
  });

  $('rf-toggle').addEventListener('click', function () {
    if (rfTimer) { rfStop('已暂停'); return; }
    if (!$('rf-frame').getAttribute('src')) { if (!rfOpen()) return; }
    var sec = Math.max(5, Math.round(Number(rfSec.value) || 30));
    rfSec.value = String(sec);
    rfLeft = sec;
    rfTimer = setInterval(rfTick, 1000);
    this.textContent = '暂停刷新';
    $('rf-state').textContent = '刷新中，每 ' + sec + ' 秒一次';
    rfPaint();
  });

  $('rf-stop').addEventListener('click', function () { rfStop('已停止'); rfCount = 0; rfPaint(); });

  var rfPresets = $('rf-presets').querySelectorAll('button');
  [].forEach.call(rfPresets, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(rfPresets, function (o) { o.classList.toggle('on', o === b); });
      rfSec.value = b.dataset.sec;
      if (rfTimer) { rfStop('已按新间隔停止，请重新开始'); }
    });
  });

  /* ================= 5. 短链 ================= */

  var SHORT_API = {
    isgd: { name: 'is.gd', make: function (u) { return 'https://is.gd/create.php?format=json&url=' + encodeURIComponent(u); }, pick: function (d) { return d.shorturl; } },
    vgd: { name: 'v.gd', make: function (u) { return 'https://v.gd/create.php?format=json&url=' + encodeURIComponent(u); }, pick: function (d) { return d.shorturl; } },
    tinyurl: { name: 'tinyurl.com', make: function (u) { return 'https://tinyurl.com/api-create.php?url=' + encodeURIComponent(u); }, pick: function (d) { return d; } }
  };

  var shWay = 'isgd';

  // 本地兜底：不是一个真短链，只把长 URL 折成可分享的短参数形式，明确标注不缩址
  function localShort(url) {
    var b = '';
    for (var i = 0; i < url.length; i++) {
      b += url.charCodeAt(i).toString(36) + '.';
    }
    return b.replace(/\.$/, '');
  }

  function shOut(code, msg) {
    $('sh-out').textContent = code || '';
    $('sh-msg').className = msg && msg.err ? 'hint err' : 'hint';
    $('sh-msg').textContent = msg ? msg.text : '';
  }

  $('sh-run').addEventListener('click', function () {
    var url = normalizeUrl($('sh-url').value);
    if (!url) { shOut('', { text: '网址格式不对。', err: true }); return; }
    if (shWay === 'local') {
      shOut(localShort(url), {
        text: '本地短参已生成。注意：这不是真正的短链服务，参数仍然很长，只是把原地址编码成可粘贴的形式；' +
          '要真正缩短请选上面的在线服务。'
      });
      return;
    }
    var svc = SHORT_API[shWay];
    shOut('', { text: '正在请求 ' + svc.name + '…' });
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    fetch(svc.make(url), { signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var ct = r.headers.get('content-type') || '';
        return ct.indexOf('json') >= 0 ? r.json().then(svc.pick) : r.text();
      })
      .then(function (short) {
        short = String(short || '').trim();
        if (!/^https?:\/\//i.test(short)) throw new Error('接口没返回短链');
        shOut(short, { text: '由 ' + svc.name + ' 生成：' + short });
      })
      .catch(function (e) {
        shOut('', {
          text: '生成失败：' + e.message + '。短链服务需要联网且可能限流；可换一个服务商再试，或选「本地短参」用不联网的兜底形式。',
          err: true
        });
      });
  });

  $('sh-clear').addEventListener('click', function () { shOut('', null); });

  var shWays = $('sh-ways').querySelectorAll('button');
  [].forEach.call(shWays, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(shWays, function (o) { o.classList.toggle('on', o === b); });
      shWay = b.dataset.way;
      shOut('', null);
    });
  });

  /* ================= 6. robots.txt ================= */

  function robotsBuild(o) {
    var agents = String(o.agent || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!agents.length) agents = ['*'];
    var disallow = lines(o.disallow);
    var allow = lines(o.allow);
    var sitemaps = lines(o.sitemap);
    var delay = String(o.delay == null ? '' : o.delay).trim();

    var out = [];
    out.push('# robots.txt generated by 计量计算工具 · 网页与站长工具');
    out.push('# 语法参考 https://www.rfc-editor.org/rfc/rfc9309');
    out.push('');
    out.push('User-agent: ' + agents.join('\nUser-agent: '));
    // RFC 9309：同一组内 Allow 与 Disallow 的先后不影响匹配（最长匹配优先），这里先写 Allow 便于阅读
    allow.forEach(function (p) { out.push('Allow: ' + p); });
    disallow.forEach(function (p) { out.push('Disallow: ' + p); });
    if (!allow.length && !disallow.length) out.push('Disallow:');
    if (delay) out.push('Crawl-delay: ' + delay);
    if (sitemaps.length) {
      out.push('');
      sitemaps.forEach(function (s) { out.push('Sitemap: ' + s); });
    }
    return out.join('\n') + '\n';
  }

  function lines(v) {
    return String(v == null ? '' : v).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function robotsRun() {
    var text = robotsBuild({
      agent: $('rb-agent').value,
      disallow: $('rb-disallow').value,
      allow: $('rb-allow').value,
      delay: $('rb-delay').value,
      sitemap: $('rb-sitemap').value
    });
    $('rb-out').textContent = text;
    return text;
  }

  var RB_DEFAULTS = { agent: '*', disallow: '/admin/\n/tmp/\n/*.pdf$', allow: '/admin/public/', delay: '1', sitemap: 'https://example.com/sitemap.xml' };
  $('rb-run').addEventListener('click', robotsRun);
  $('rb-reset').addEventListener('click', function () {
    Object.keys(RB_DEFAULTS).forEach(function (k) { $(k === 'agent' ? 'rb-agent' : 'rb-' + k).value = RB_DEFAULTS[k]; });
    robotsRun();
  });
  $('rb-copy').addEventListener('click', function () { T.copy(robotsRun()); });
  $('rb-file').addEventListener('click', function () { download('robots.txt', robotsRun(), 'text/plain'); });
  ['rb-agent', 'rb-disallow', 'rb-allow', 'rb-delay', 'rb-sitemap'].forEach(function (id) {
    $(id).addEventListener('input', robotsRun);
  });

  /* ================= 7. 备案号解析 ================= */

  // 省级行政区简称，备案号首字用的就是这一套。认不出来说明首字写错了。
  var PROVINCES = ['京', '津', '冀', '晋', '蒙', '辽', '吉', '黑', '沪', '苏', '浙', '皖', '闽', '赣',
    '鲁', '豫', '鄂', '湘', '粤', '桂', '琼', '渝', '川', '黔', '滇', '藏', '陕', '甘', '青', '宁', '新'];

  var ICP_TYPES = [
    { key: 'ICP备', desc: '经营性/非经营性网站备案（最常见）' },
    { key: 'ICP证', desc: '经营性互联网信息服务许可（增值电信业务经营许可证）' },
    { key: '公网安备', desc: '公安网备（公安部网络安全保卫局）' }
  ];

  function icpParse(raw) {
    var s = String(raw || '').trim();
    if (!s) return { err: '请输入备案号' };
    s = s.replace(/\s+/g, '');

    var province = null, type = null, num = null, seq = null;

    var m = /^([\u4e00-\u9fa5]{1,3})?(ICP备|ICP证|公网安备)(\d+)(?:号)?(?:-(\d+))?$/.exec(s);
    if (!m) {
      // 也允许只给数字部分（用户常常只记得编号）
      var only = /^(\d+)(?:号)?(?:-(\d+))?$/.exec(s);
      if (!only) return { err: '看不懂这个写法，示例：京ICP备12345678号-1、沪ICP证000000号、京公网安备11010502000000号' };
      return {
        province: null, type: null, number: only[1], seq: only[2] || null,
        partial: true,
        note: '只识别到编号，没有省份简称与备案类型，无法判断省局与主体性质。'
      };
    }

    province = m[1] || null;
    type = m[2];
    num = m[3];
    seq = m[4] || null;

    var known = !province || PROVINCES.indexOf(province) >= 0;
    var typeInfo = ICP_TYPES.filter(function (t) { return t.key === type; })[0] || null;

    var rows = [];
    rows.push(['省份简称', province || '（缺失）']);
    rows.push(['备案类型', type]);
    rows.push(['类型含义', typeInfo ? typeInfo.desc : '未知']);
    rows.push(['备案编号', num]);
    rows.push(['网站序号', seq || '（无，通常表示主体备案号或唯一网站）']);
    rows.push(['编号位数', String(num.length) + ' 位']);
    rows.push(['格式检查', known ? '通过' : '省份简称「' + province + '」不在常见简称表内，请核对']);

    var link = '';
    if (type === '公网安备') {
      link = '全国互联网安全管理服务平台：https://beian.mps.gov.cn/#/query/webSearch';
    } else {
      link = '工信部备案查询：https://beian.miit.gov.cn/#/Integrated/recordQuery';
    }

    return {
      province: province, type: type, number: num, seq: seq,
      rows: rows, known: known,
      link: link,
      query: province && type === 'ICP备' ? 'https://beian.miit.gov.cn/#/Integrated/recordQuery' : link
    };
  }

  function icpRun() {
    var r = icpParse($('icp-in').value);
    var out = $('icp-out'), msg = $('icp-msg'), linkBox = $('icp-link');
    out.innerHTML = '';
    linkBox.textContent = '';
    if (r.err) {
      msg.className = 'hint err';
      msg.textContent = r.err;
      return null;
    }
    msg.className = r.known === false ? 'hint err' : 'hint';
    msg.textContent = r.partial ? r.note : '解析按格式进行，不代表该备案号真实存在，需到官方入口核验。';
    var rows = r.rows || [];
    rows.forEach(function (row) {
      var d = document.createElement('div');
      var k = document.createElement('div'); k.className = 'k'; k.textContent = row[0];
      var v = document.createElement('div'); v.className = 'v'; v.textContent = row[1];
      d.appendChild(k); d.appendChild(v);
      out.appendChild(d);
    });
    linkBox.textContent = '官方查询入口：' + r.link;
    return r;
  }

  $('icp-run').addEventListener('click', icpRun);
  $('icp-clear').addEventListener('click', function () {
    $('icp-in').value = ''; $('icp-out').innerHTML = ''; $('icp-link').textContent = '';
    $('icp-msg').className = 'hint'; $('icp-msg').textContent = '';
  });

  /* ================= 8. DNS 清单 ================= */

  // 静态清单：运营商公开的递归解析地址，不联网查询。实测可用性随地域与时间变化。
  var DNS_LIST = [
    { op: '公共', org: '阿里云公共 DNS', p: '223.5.5.5', s: '223.6.6.6', note: '免注册，国内多节点' },
    { op: '公共', org: 'DNSPod / 腾讯', p: '119.29.29.29', s: '182.254.116.116', note: '国内解析速度快' },
    { op: '公共', org: '114 DNS', p: '114.114.114.114', s: '114.114.115.115', note: '南京信风，老牌公共 DNS' },
    { op: '公共', org: '114 DNS（安全版）', p: '114.114.114.119', s: '114.114.115.119', note: '拦截钓鱼、木马站点' },
    { op: '公共', org: '百度公共 DNS', p: '180.76.76.76', s: '—', note: '免费公共解析' },
    { op: '公共', org: 'CNNIC sDNS', p: '1.2.4.8', s: '210.2.4.8', note: '国家授时与解析节点' },
    { op: '公共', org: 'Google Public DNS', p: '8.8.8.8', s: '8.8.4.4', note: '境外，国内访问可能不稳定' },
    { op: '公共', org: 'Cloudflare', p: '1.1.1.1', s: '1.0.0.1', note: '境外，隐私优先，不记录查询内容' },
    { op: '公共', org: 'Quad9', p: '9.9.9.9', s: '149.112.112.112', note: '境外，自动屏蔽已知恶意域名' },
    { op: '公共', org: 'OpenDNS', p: '208.67.222.222', s: '208.67.220.220', note: '境外，可自选家长控制策略' },
    { op: '公共', org: 'IPv6 公共解析（阿里）', p: '2400:3200::1', s: '2400:3200:baba::1', note: 'IPv6 单栈环境用' },
    { op: '公共', org: 'IPv6 公共解析（Cloudflare）', p: '2606:4700:4700::1111', s: '2606:4700:4700::1001', note: '境外 IPv6' },
    { op: '电信', org: '中国电信（全国通用）', p: '219.141.136.10', s: '219.141.140.10', note: '北京节点' },
    { op: '电信', org: '中国电信（华东）', p: '202.96.209.133', s: '202.96.209.5', note: '上海节点' },
    { op: '电信', org: '中国电信（华南）', p: '202.96.128.86', s: '202.96.128.166', note: '广东节点' },
    { op: '电信', org: '中国电信（华中）', p: '202.103.24.68', s: '202.103.0.68', note: '湖北节点' },
    { op: '电信', org: '中国电信（西南）', p: '61.139.2.69', s: '61.139.2.70', note: '四川节点' },
    { op: '联通', org: '中国联通（全国通用）', p: '123.123.123.123', s: '123.123.123.124', note: '北京节点，老牌联通 DNS' },
    { op: '联通', org: '中国联通（华北）', p: '202.106.0.20', s: '202.106.196.115', note: '北京节点' },
    { op: '联通', org: '中国联通（华东）', p: '210.22.70.3', s: '210.22.84.3', note: '上海节点' },
    { op: '联通', org: '中国联通（华南）', p: '221.5.88.88', s: '210.21.196.6', note: '广东节点' },
    { op: '移动', org: '中国移动（全国通用）', p: '211.136.192.6', s: '211.138.180.2', note: '移动自有递归' },
    { op: '移动', org: '中国移动（华东）', p: '211.140.13.188', s: '211.140.188.188', note: '浙江节点' },
    { op: '移动', org: '中国移动（华南）', p: '211.136.192.6', s: '211.136.112.200', note: '广东节点' },
    { op: '移动', org: '中国移动（华北）', p: '211.137.160.185', s: '211.137.160.188', note: '北京节点' },
    { op: '移动', org: '中国移动（西南）', p: '211.137.96.205', s: '211.137.96.206', note: '四川节点' },
    { op: '教育网', org: 'CERNET（清华）', p: '101.6.6.6', s: '101.6.6.7', note: '教育网主干，校园网首选' },
    { op: '教育网', org: 'CERNET（备用）', p: '202.112.0.33', s: '202.112.0.34', note: '教育网传统节点' },
    { op: '教育网', org: 'CERNET2（IPv6）', p: '2001:da8::666', s: '2001:da8:1:2::1', note: '教育网 IPv6' },
    { op: '安全', org: '腾讯 DNSPod 家庭防护', p: '119.29.29.29', s: '119.29.29.29', note: '同时屏蔽恶意域名，可用 Norton ConnectSafe 替代（境外）' },
    { op: '安全', org: 'OpenDNS FamilyShield', p: '208.67.222.123', s: '208.67.220.123', note: '境外，默认拦截成人内容' },
    { op: '安全', org: 'Quad9（安全）', p: '9.9.9.10', s: '149.112.112.10', note: '境外，不记录 IP 的变体' },
    { op: '安全', org: '114 DNS（家庭版）', p: '114.114.114.110', s: '114.114.115.110', note: '拦截色情与不良站点' },
    { op: '安全', org: 'AdGuard DNS', p: '94.140.14.14', s: '94.140.15.15', note: '境外，默认去广告与追踪' }
  ];

  var dnsFilter = 'all';

  function dnsRender() {
    var kw = $('dns-q').value.trim().toLowerCase();
    var rows = DNS_LIST.filter(function (r) {
      var inOp = dnsFilter === 'all' || r.op === dnsFilter;
      var text = (r.org + r.p + r.s + r.note + r.op).toLowerCase();
      var inKw = !kw || text.indexOf(kw) >= 0;
      return inOp && inKw;
    });
    var body = $('dns-body');
    body.innerHTML = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.org, r.p, r.s, r.note].forEach(function (v, i) {
        var td = document.createElement('td');
        td.textContent = v;
        if (i === 1 || i === 2) td.className = 'num';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $('dns-count').textContent = '共 ' + rows.length + ' 条（清单总计 ' + DNS_LIST.length + ' 条）';
  }

  var dnsBtns = $('dns-filter').querySelectorAll('button');
  [].forEach.call(dnsBtns, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(dnsBtns, function (o) { o.classList.toggle('on', o === b); });
      dnsFilter = b.dataset.op;
      dnsRender();
    });
  });
  $('dns-q').addEventListener('input', dnsRender);

  /* ================= 页签 ================= */

  var PANELS = ['source', 'markdown', 'html', 'refresh', 'short', 'robots', 'icp', 'dns'];

  function setTab(name) {
    T.markTab(name);
    PANELS.forEach(function (p) { $('panel-' + p).hidden = p !== name; });
    if (name !== 'refresh') rfStop('未开始');
  }

  T.tabs($('tabs'), setTab);

  /* ================= 初始化 ================= */

  mdIn.value = MD_SAMPLES.basic;
  mdRender();
  robotsRun();
  icpRun();
  dnsRender();
  setTab(T.firstTab('source'));

  // 供测试脚本直接调用，不污染页面行为
  window.__web = {
    normalizeUrl: normalizeUrl, PROXIES: PROXIES,
    robotsBuild: robotsBuild, icpParse: icpParse, DNS_LIST: DNS_LIST,
    localShort: localShort, sanitize: sanitize, mdSamples: MD_SAMPLES
  };
})();

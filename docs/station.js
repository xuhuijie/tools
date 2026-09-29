/* 站长工具：HTTP 状态码速查、User-Agent 分析、robots.txt 生成、公共 DNS 清单

   四块都是纯本地查表与字符串处理，不联网。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ---------- 1. HTTP 状态码 ---------- */
  var HTTP = [
    [1, '消息响应', [
      [100, 'Continue', '客户端应继续发送请求，服务器已收到请求头'],
      [101, 'Switching Protocol', '服务器按 Upgrade 头切换协议，如升级到 WebSocket'],
      [102, 'Processing', 'WebDAV：请求已收到，正在处理但尚无结果'],
      [103, 'Early Hints', '在最终响应前先返回部分响应头，便于预加载资源']
    ]],
    [2, '成功响应', [
      [200, 'OK', '请求成功，响应体为请求的资源或处理结果'],
      [201, 'Created', '请求成功且新建了资源，Location 头指向新资源'],
      [202, 'Accepted', '请求已接受但尚未处理完成，适合异步任务'],
      [203, 'Non-Authoritative Information', '返回内容来自第三方副本，非源服务器原始响应'],
      [204, 'No Content', '请求成功但没有响应体，常用于保存/删除接口'],
      [205, 'Reset Content', '请求成功，客户端应重置文档视图，如清空表单'],
      [206, 'Partial Content', '返回部分内容，配合 Range 头做分段下载与断点续传'],
      [207, 'Multi-Status', 'WebDAV：响应体里对多个子请求分别给状态'],
      [208, 'Already Reported', 'WebDAV：同一集合的元素已在前面的响应里报过'],
      [226, 'IM Used', '服务器已完成对资源的实例操作，返回增量更新结果']
    ]],
    [3, '重定向', [
      [300, 'Multiple Choice', '请求有多个可选响应，需客户端自行选择'],
      [301, 'Moved Permanently', '资源已永久移动，新地址在 Location；搜索引擎会更新索引'],
      [302, 'Found', '资源临时移动，后续请求仍应用原地址（历史实现差异较大）'],
      [303, 'See Other', '客户端应改用 GET 访问 Location 指向的地址'],
      [304, 'Not Modified', '资源未修改，客户端可直接用本地缓存，不返回响应体'],
      [305, 'Use Proxy', '必须通过代理访问（现已废弃）'],
      [307, 'Temporary Redirect', '临时重定向，且要求方法不变、请求体重发'],
      [308, 'Permanent Redirect', '永久重定向，且要求方法不变、请求体重发']
    ]],
    [4, '客户端错误', [
      [400, 'Bad Request', '请求语法或参数有误，服务器无法理解'],
      [401, 'Unauthorized', '需要身份验证；注意它指「未认证」而非「无权限」'],
      [402, 'Payment Required', '预留状态码，目前基本未使用'],
      [403, 'Forbidden', '已认证但无权访问，服务器拒绝执行'],
      [404, 'Not Found', '找不到请求的资源，最常见的一类错误'],
      [405, 'Method Not Allowed', '资源存在但不支持该 HTTP 方法，响应会带 Allow 头'],
      [406, 'Not Acceptable', '无法提供符合 Accept 头要求的内容'],
      [407, 'Proxy Authentication Required', '需先通过代理的身份验证'],
      [408, 'Request Timeout', '客户端未在服务器等待时限内完成请求'],
      [409, 'Conflict', '请求与服务器当前状态冲突，如版本号不匹配'],
      [410, 'Gone', '资源已被删除且不会再恢复，比 404 更明确'],
      [411, 'Length Required', '缺少 Content-Length 头，服务器拒绝接收'],
      [412, 'Precondition Failed', 'If-Match 等前置条件不满足'],
      [413, 'Payload Too Large', '请求体超过服务器允许的大小'],
      [414, 'URI Too Long', '请求地址过长，服务器拒绝处理'],
      [415, 'Unsupported Media Type', '请求体的媒体类型不受支持'],
      [416, 'Range Not Satisfiable', 'Range 头请求的范围无法满足'],
      [417, 'Expectation Failed', 'Expect 头里的期望无法满足'],
      [418, 'I\'m a teapot', '愚人节玩笑状态码，部分框架仍会实现'],
      [421, 'Misdirected Request', '请求被发到了无法响应该请求的服务器'],
      [422, 'Unprocessable Entity', '语法正确但语义有误，接口校验失败常用它'],
      [423, 'Locked', 'WebDAV：资源被锁定'],
      [424, 'Failed Dependency', 'WebDAV：因前置请求失败而无法完成'],
      [425, 'Too Early', '服务器不愿处理可能被重放的请求，防重放攻击'],
      [426, 'Upgrade Required', '客户端需升级到其他协议，如 HTTP/1.1 → TLS'],
      [428, 'Precondition Required', '服务器要求请求带前置条件，防并发覆盖'],
      [429, 'Too Many Requests', '请求过于频繁被限流，响应会带 Retry-After'],
      [431, 'Request Header Fields Too Large', '请求头过大，服务器拒绝处理'],
      [451, 'Unavailable For Legal Reasons', '因法律要求无法提供，如内容被审查']
    ]],
    [5, '服务器端错误', [
      [500, 'Internal Server Error', '服务器内部错误，笼统的兜底状态'],
      [501, 'Not Implemented', '服务器不支持该请求方法'],
      [502, 'Bad Gateway', '网关或代理从上游收到无效响应'],
      [503, 'Service Unavailable', '服务暂时不可用，常见于过载或维护，响应带 Retry-After'],
      [504, 'Gateway Timeout', '网关或代理等待上游响应超时'],
      [505, 'HTTP Version Not Supported', '不支持请求所用的 HTTP 版本'],
      [506, 'Variant Also Negotiates', '内容协商配置有循环，服务器内部错误'],
      [507, 'Insufficient Storage', 'WebDAV：存储空间不足'],
      [508, 'Loop Detected', 'WebDAV：处理请求时检测到无限循环'],
      [510, 'Not Extended', '访问资源需要进一步扩展请求'],
      [511, 'Network Authentication Required', '需要先通过网络的认证，如连公共 WiFi']
    ]]
  ];

  function renderHttp(kw) {
    var list = $('http-list');
    list.innerHTML = '';
    var q = (kw || '').trim().toLowerCase();
    var shown = 0;
    HTTP.forEach(function (group) {
      var rows = group[2].filter(function (r) {
        if (!q) return true;
        return String(r[0]).indexOf(q) >= 0 || r[1].toLowerCase().indexOf(q) >= 0 || r[2].indexOf(q) >= 0;
      });
      if (!rows.length) return;
      var head = document.createElement('tr');
      var th = document.createElement('td');
      th.colSpan = 3;
      th.className = 'grp';
      th.textContent = group[0] + 'xx ' + group[1];
      head.appendChild(th);
      list.appendChild(head);
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.title = '点一下复制 ' + r[0];
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function () {
          T.copy(String(r[0])).then(function () {
            var old = tr.querySelector('.c').textContent;
            tr.querySelector('.c').textContent = '已复制';
            setTimeout(function () { tr.querySelector('.c').textContent = old; }, 900);
          });
        });
        [r[0], r[1], r[2]].forEach(function (v, i) {
          var td = document.createElement('td');
          if (i === 0) td.className = 'c';
          td.textContent = v;
          tr.appendChild(td);
        });
        list.appendChild(tr);
        shown++;
      });
    });
    $('http-empty').hidden = shown > 0;
  }

  /* ---------- 2. UA 分析 ---------- */
  var BROWSERS = [
    ['Edg/', 'Edge'], ['OPR/', 'Opera'], ['Opera/', 'Opera'], ['MicroMessenger', '微信内置浏览器'],
    ['DingTalk', '钉钉内置浏览器'], ['AlipayClient', '支付宝内置浏览器'], ['QQBrowser', 'QQ 浏览器'],
    ['UCBrowser', 'UC 浏览器'], ['Quark', '夸克浏览器'], ['HuaweiBrowser', '华为浏览器'],
    ['MiuiBrowser', '小米浏览器'], ['VivoBrowser', 'vivo 浏览器'], ['HeyTapBrowser', 'OPPO 浏览器'],
    ['SamsungBrowser', '三星浏览器'], ['Firefox/', 'Firefox'], ['FxiOS', 'Firefox iOS'],
    ['CriOS', 'Chrome iOS'], ['Chrome/', 'Chrome'], ['Chromium/', 'Chromium'],
    ['Safari/', 'Safari'], ['MSIE', 'IE'], ['Trident/', 'IE'], ['curl/', 'curl'], ['python-requests', 'python-requests']
  ];
  var ENGINES = [
    ['Blink', function (ua) { return /Chrome\/|Chromium\/|Edg\//.test(ua); }],
    ['WebKit', function (ua) { return /AppleWebKit/.test(ua) || /Safari\//.test(ua); }],
    ['Gecko', function (ua) { return /Gecko\/|Firefox\//.test(ua); }],
    ['Trident', function (ua) { return /Trident\/|MSIE/.test(ua); }],
    ['Presto', function (ua) { return /Presto/.test(ua); }]
  ];
  var OSES = [
    ['Windows', /Windows NT ([\d.]+)/, { '10.0': '10 / 11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' }],
    ['Android', /Android[ /]([\d.]+)/, null],
    ['iOS', /(?:iPhone|iPad|iPod).*?OS (\d+[_\d]*)/, null],
    ['macOS', /Mac OS X (\d+[_.\d]*)/, null],
    ['HarmonyOS', /HarmonyOS[ /]([\d.]+)/, null],
    ['Linux', /Linux/, null],
    ['Windows Phone', /Windows Phone(?: OS)? ([\d.]+)/, null]
  ];

  function versionOf(ua, token) {
    var re = new RegExp(token.replace(/[/.]/g, '\\$&') + '([\\d._]+)');
    var m = re.exec(ua);
    return m ? m[1].replace(/_/g, '.') : '';
  }

  function analyzeUa(ua) {
    ua = String(ua || '').trim();
    if (!ua) return null;
    var browser = '', bver = '';
    for (var i = 0; i < BROWSERS.length; i++) {
      if (ua.indexOf(BROWSERS[i][0]) >= 0) {
        browser = BROWSERS[i][1];
        bver = BROWSERS[i][0] === 'Trident/' ? versionOf(ua, 'rv:') : versionOf(ua, BROWSERS[i][0]);
        break;
      }
    }
    var engine = '';
    for (var e = 0; e < ENGINES.length; e++) {
      if (ENGINES[e][1](ua)) { engine = ENGINES[e][0]; break; }
    }
    var os = '', osVer = '';
    for (var o = 0; o < OSES.length; o++) {
      var m = OSES[o][1].exec(ua);
      if (m) {
        os = OSES[o][0];
        osVer = m[1] ? m[1].replace(/_/g, '.') : '';
        if (OSES[o][2] && OSES[o][2][osVer]) osVer = OSES[o][2][osVer];
        break;
      }
    }
    var device = /iPad|Tablet/.test(ua) ? '平板'
      : /Mobile|iPhone|Android.*Mobile|Windows Phone/.test(ua) ? '手机'
      : /Windows NT|Macintosh|X11|CrOS/.test(ua) ? '桌面' : '未知';
    var brand = /(?:iPhone|iPad|Macintosh)/.test(ua) ? 'Apple'
      : /HUAWEI|HONOR/i.test(ua) ? '华为 / 荣耀'
      : /Xiaomi|Redmi|MI /i.test(ua) ? '小米 / 红米'
      : /OPPO|OnePlus|realme/i.test(ua) ? 'OPPO 系'
      : /vivo|iQOO/i.test(ua) ? 'vivo 系'
      : /Samsung|SM-/i.test(ua) ? '三星' : '';
    return { browser: browser, bver: bver, engine: engine, os: os, osVer: osVer, device: device, brand: brand };
  }

  function renderUa() {
    var out = $('ua-out'), err = $('ua-err');
    out.innerHTML = ''; err.hidden = true;
    var r = analyzeUa($('ua-in').value);
    if (!r) { err.hidden = false; err.textContent = '先粘贴一段 User-Agent。'; return; }
    T.cells(out, [
      ['浏览器', r.browser + (r.bver ? ' ' + r.bver : '') || '未识别'],
      ['内核', r.engine || '未识别'],
      ['操作系统', r.os + (r.osVer ? ' ' + r.osVer : '') || '未识别'],
      ['设备类别', r.device],
      ['厂商', r.brand || '未识别'],
      ['UA 长度', String($('ua-in').value.trim().length) + ' 字符']
    ]);
  }

  var UA_EXAMPLES = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  ];

  /* ---------- 3. robots.txt ---------- */
  var BOTS = [
    ['Baiduspider', '百度'], ['Sogou web spider', '搜狗'], ['360Spider', '360 好搜'],
    ['YisouSpider', '神马'], ['YodaoBot', '有道'], ['bingbot', '必应'],
    ['Googlebot', 'Google'], ['Teoma', 'Teoma'], ['ia_archiver', 'Wayback'],
    ['Twiceler', 'Cuil'], ['Robozilla', 'DMOZ'], ['Gigabot', 'GigaBlast'],
    ['Googlebot-Image', 'Google 图片'], ['Googlebot-Mobile', 'Google 移动']
  ];

  function renderBots() {
    var box = $('rb-bots');
    box.innerHTML = '';
    BOTS.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.bot = b[0];
      btn.textContent = b[1];
      btn.addEventListener('click', function () { btn.classList.toggle('on'); });
      box.appendChild(btn);
    });
  }

  function buildRobots() {
    var lines = [];
    var deny = $('rb-deny').value.split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s.charAt(0) === '/'; });
    var maps = $('rb-map').value.split('\n').map(function (s) { return s.trim(); })
      .filter(function (s) { return /^https?:\/\//i.test(s); });
    var rate = $('rb-rate').value;
    var def = $('rb-default').value;
    var picked = [].slice.call($('rb-bots').querySelectorAll('button.on')).map(function (b) { return b.dataset.bot; });

    lines.push('User-agent: *');
    lines.push(def === 'allow' ? 'Allow: /' : 'Disallow: /');
    deny.forEach(function (d) { lines.push('Disallow: ' + d); });
    if (rate) lines.push('Crawl-delay: ' + rate);

    picked.forEach(function (bot) {
      lines.push('');
      lines.push('User-agent: ' + bot);
      lines.push(def === 'allow' ? 'Disallow: /' : 'Allow: /');
      deny.forEach(function (d) { lines.push('Disallow: ' + d); });
    });

    maps.forEach(function (m) {
      lines.push('');
      lines.push('Sitemap: ' + m);
    });
    return lines.join('\n') + '\n';
  }

  /* ---------- 4. 公共 DNS ---------- */
  var DNS = [
    ['public', '阿里 DNS', '223.5.5.5', '223.6.6.6'],
    ['public', '百度 DNS', '180.76.76.76', '2400:da00::6666'],
    ['public', '腾讯 DNSPod', '119.29.29.29', '182.254.116.116'],
    ['public', '114 DNS', '114.114.114.114', '114.114.115.115'],
    ['public', 'Google DNS', '8.8.8.8', '8.8.4.4'],
    ['public', 'Cloudflare', '1.1.1.1', '1.0.0.1'],
    ['public', 'OpenDNS', '208.67.222.222', '208.67.220.220'],
    ['public', 'IBM Quad9', '9.9.9.9', '149.112.112.112'],
    ['public', 'Comodo DNS', '8.26.56.26', '8.20.247.20'],
    ['public', 'CNNIC SDNS', '1.2.4.8', '210.2.4.8'],
    ['isp', '电信（上海）', '202.96.209.133', '202.96.209.5'],
    ['isp', '电信（广东）', '202.96.128.86', '202.96.134.33'],
    ['isp', '电信（四川）', '61.139.2.69', '202.98.96.68'],
    ['isp', '联通（北京）', '202.106.0.20', '202.106.196.115'],
    ['isp', '联通（河南）', '202.102.224.68', '202.102.227.68'],
    ['isp', '移动（广东）', '211.136.192.6', '211.136.20.203'],
    ['isp', '移动（浙江）', '211.140.13.188', '211.140.188.188'],
    ['edu', '北京教育网', '202.112.0.6', '202.112.0.7'],
    ['edu', '上海教育网', '202.120.0.6', '202.120.0.7'],
    ['edu', '天津教育网', '202.113.0.6', '202.113.0.7'],
    ['edu', '河北教育网', '202.206.0.6', '202.206.0.7'],
    ['edu', '江苏教育网', '202.195.0.6', '202.195.0.7'],
    ['edu', '浙江教育网', '202.193.0.6', '202.193.0.7'],
    ['edu', '湖北教育网', '202.188.0.6', '202.188.0.7'],
    ['edu', '广东教育网', '202.186.0.6', '202.186.0.7'],
    ['edu', '四川教育网', '202.115.32.36', '202.115.32.37']
  ];

  function renderDns(group, kw) {
    var list = $('dns-list');
    list.innerHTML = '';
    var q = (kw || '').trim().toLowerCase();
    var shown = 0;
    DNS.forEach(function (d) {
      if (group !== 'all' && d[0] !== group) return;
      if (q && (d[1] + ' ' + d[2] + ' ' + d[3]).toLowerCase().indexOf(q) < 0) return;
      var tr = document.createElement('tr');
      var name = document.createElement('td');
      name.textContent = d[1];
      tr.appendChild(name);
      [d[2], d[3]].forEach(function (ip) {
        var td = document.createElement('td');
        td.className = 'num';
        td.style.cursor = 'pointer';
        td.textContent = ip;
        td.title = '复制 ' + ip;
        td.addEventListener('click', function () {
          T.copy(ip).then(function () {
            var old = td.textContent;
            td.textContent = '已复制';
            setTimeout(function () { td.textContent = old; }, 900);
          });
        });
        tr.appendChild(td);
      });
      list.appendChild(tr);
      shown++;
    });
    $('dns-empty').hidden = shown > 0;
  }

  /* ---------- 初始化与绑定 ---------- */
  renderHttp('');
  renderBots();
  renderDns('all', '');
  $('rb-out').textContent = '';

  (function () {
    var self = analyzeUa(navigator.userAgent);
    $('ua-self').textContent = navigator.userAgent;
    T.cells($('ua-self-out'), [
      ['浏览器', (self.browser + (self.bver ? ' ' + self.bver : '')) || '未识别'],
      ['内核', self.engine || '未识别'],
      ['操作系统', (self.os + (self.osVer ? ' ' + self.osVer : '')) || '未识别'],
      ['设备类别', self.device]
    ]);
    $('ua-in').value = UA_EXAMPLES[1];
    renderUa();
  })();

  $('http-q').addEventListener('input', function () { renderHttp(this.value); });
  $('ua-run').addEventListener('click', renderUa);
  $('ua-in').addEventListener('input', renderUa);
  $('ua-clear').addEventListener('click', function () { $('ua-in').value = ''; $('ua-out').innerHTML = ''; });
  $('rb-gen').addEventListener('click', function () { $('rb-out').textContent = buildRobots(); });
  $('rb-clear').addEventListener('click', function () {
    $('rb-deny').value = ''; $('rb-map').value = ''; $('rb-rate').value = '';
    $('rb-default').value = 'allow';
    [].forEach.call($('rb-bots').querySelectorAll('button'), function (b) { b.classList.remove('on'); });
    $('rb-out').textContent = '';
  });
  T.bindCopy($('rb-copy'), function () { return $('rb-out').textContent; });

  T.tabs($('dns-tabs'), function (g) { renderDns(g, $('dns-q').value); });
  $('dns-q').addEventListener('input', function () {
    var on = $('dns-tabs').querySelector('button.on');
    renderDns(on ? on.dataset.g : 'all', this.value);
  });
  T.tabs($('tabs'), function (name) {
    ['http', 'ua', 'robots', 'dns'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
  });

  window.__station = {
    HTTP: HTTP, analyzeUa: analyzeUa, buildRobots: buildRobots, DNS: DNS,
    BOTS: BOTS, versionOf: versionOf
  };
})();

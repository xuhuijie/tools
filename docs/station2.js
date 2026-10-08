/* 站点诊断：HTTP 状态码速查 / User-Agent 分析 / 端口自查清单
   状态码与端口表都是内置静态数据，UA 分析是纯本地字符串匹配，全部不联网。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ================= 1. HTTP 状态码 ================= */

  var HTTP_CODES = [
    [100, 'Continue', '继续', '客户端已发送请求头，服务端表示可以继续发送请求体'],
    [101, 'Switching Protocols', '切换协议', '服务端同意升级协议，最常见的是升级到 WebSocket'],
    [102, 'Processing', '处理中', 'WebDAV，服务端已收到但还在处理，防止客户端超时'],
    [103, 'Early Hints', '早期提示', '在最终响应前先返回一部分响应头，常用于提前推送 CSS/JS'],
    [200, 'OK', '成功', '请求成功，响应体包含结果'],
    [201, 'Created', '已创建', '请求成功且新建了资源，响应头里通常带 Location'],
    [202, 'Accepted', '已接受', '请求已受理但还没处理完，常见于异步任务提交'],
    [203, 'Non-Authoritative Information', '非授权信息', '返回的元信息来自副本而非源站'],
    [204, 'No Content', '无内容', '成功但没有响应体，常用于 PUT/DELETE 或心跳接口'],
    [205, 'Reset Content', '重置内容', '成功且要求客户端重置表单'],
    [206, 'Partial Content', '部分内容', '断点续传或分片下载，响应头带 Content-Range'],
    [207, 'Multi-Status', '多状态', 'WebDAV，响应体里为多个资源分别给状态'],
    [208, 'Already Reported', '已报告', 'WebDAV，避免重复枚举同一资源'],
    [226, 'IM Used', 'IM 已使用', '服务端对资源做了增量编码（Delta 编码）'],
    [300, 'Multiple Choices', '多种选择', '一个请求对应多个可选的响应'],
    [301, 'Moved Permanently', '永久重定向', '资源永久换了地址，浏览器与搜索引擎会长期记牢'],
    [302, 'Found', '临时重定向', '临时跳转，历史实现五花八门，要明确语义请用 303 或 307'],
    [303, 'See Other', '查看其他位置', '要求用 GET 去另一个地址取结果，常用于表单提交后跳转'],
    [304, 'Not Modified', '未修改', '带缓存校验头请求时命中缓存，不返回响应体'],
    [305, 'Use Proxy', '使用代理', '必须经过指定代理访问，因安全问题已废弃'],
    [307, 'Temporary Redirect', '临时重定向', '临时跳转且保持原方法，POST 仍是 POST'],
    [308, 'Permanent Redirect', '永久重定向', '永久跳转且保持原方法'],
    [400, 'Bad Request', '错误请求', '请求语法有问题，服务端看不出该怎么处理'],
    [401, 'Unauthorized', '未认证', '没带或带了无效的凭据；注意语义是「未认证」而非「无权」'],
    [402, 'Payment Required', '需要付款', '保留给支付场景，实际很少用'],
    [403, 'Forbidden', '禁止访问', '身份没问题但没权限；与 401 的区别就在这里'],
    [404, 'Not Found', '未找到', '资源不存在；也有站点用它掩盖 403 以避免暴露资源存在'],
    [405, 'Method Not Allowed', '方法不允许', '资源存在但不支持这个 HTTP 方法'],
    [406, 'Not Acceptable', '不可接受', '服务端产出的类型与客户端的 Accept 头对不上'],
    [407, 'Proxy Authentication Required', '需要代理认证', '要先通过代理的认证'],
    [408, 'Request Timeout', '请求超时', '服务端等请求等太久了，主动断开'],
    [409, 'Conflict', '冲突', '请求与资源当前状态冲突，如并发更新同一记录'],
    [410, 'Gone', '已删除', '资源曾在这里但已永久移除，且不打算再提供'],
    [411, 'Length Required', '需要内容长度', '缺 Content-Length 且服务端不接受分块传输'],
    [412, 'Precondition Failed', '前置条件失败', 'If-Match 一类条件请求没通过'],
    [413, 'Content Too Large', '内容过大', '请求体超出服务端上限，改小或用分片'],
    [414, 'URI Too Long', 'URI 过长', 'URL 太长，常见于把大量参数塞进 query'],
    [415, 'Unsupported Media Type', '不支持的媒体类型', '请求体的 Content-Type 服务端不认识'],
    [416, 'Range Not Satisfiable', '范围不满足', '请求的字节范围超出了资源长度'],
    [417, 'Expectation Failed', '期望失败', 'Expect 头里的期望无法满足'],
    [418, 'I\'m a teapot', '我是茶壶', '愚人节玩笑（RFC 2324），现在常被用来标识「反爬拦截」'],
    [421, 'Misdirected Request', '请求被误导', '连接复用到不处理该域名的服务端上'],
    [422, 'Unprocessable Content', '无法处理的内容', '语法没问题但语义有错，校验失败常用它'],
    [423, 'Locked', '已锁定', 'WebDAV，资源被锁'],
    [424, 'Failed Dependency', '依赖失败', 'WebDAV，因前一个请求失败而放弃'],
    [425, 'Too Early', '过早', '服务端不愿处理可能被重放的早期请求（TLS 0-RTT）'],
    [426, 'Upgrade Required', '需要升级', '要求客户端换用更高版本协议'],
    [428, 'Precondition Required', '需要前置条件', '要求请求必须带条件头，防止更新丢失'],
    [429, 'Too Many Requests', '请求过多', '限流了，看 Retry-After 决定等多久'],
    [431, 'Request Header Fields Too Large', '请求头过大', '请求头总量超限，常见于 Cookie 堆积'],
    [451, 'Unavailable For Legal Reasons', '因法律原因不可用', '因法律要求无法提供，如内容审查'],
    [500, 'Internal Server Error', '服务端内部错误', '服务端出异常了，看日志，前端拿不到细节'],
    [501, 'Not Implemented', '未实现', '服务端不支持该功能'],
    [502, 'Bad Gateway', '网关错误', '网关/代理从上游收到无效响应，上游挂了或没起来'],
    [503, 'Service Unavailable', '服务不可用', '暂时过载或维护中，看 Retry-After'],
    [504, 'Gateway Timeout', '网关超时', '网关等上游超时，通常是上游慢而不是网关本身'],
    [505, 'HTTP Version Not Supported', 'HTTP 版本不支持', '服务端不支持请求里的 HTTP 版本'],
    [506, 'Variant Also Negotiates', '变体也协商', '内容协商配置成环了'],
    [507, 'Insufficient Storage', '存储不足', 'WebDAV，服务端存储空间不够'],
    [508, 'Loop Detected', '检测到循环', 'WebDAV，处理时遇到无限循环'],
    [510, 'Not Extended', '未扩展', '需要对请求做进一步扩展'],
    [511, 'Network Authentication Required', '需要网络认证', '如公共 WiFi 的强制门户']
  ];

  var CLASS_DESC = {
    1: '信息响应：请求已收到，继续处理',
    2: '成功：请求已被正常处理',
    3: '重定向：需要客户端再做一步',
    4: '客户端错误：请求本身有问题',
    5: '服务端错误：服务端处理失败'
  };

  var htCls = 'all';

  function htRender() {
    var kw = $('ht-q').value.trim().toLowerCase();
    var list = HTTP_CODES.filter(function (c) {
      var inCls = htCls === 'all' || String(c[0])[0] === htCls;
      var text = (String(c[0]) + c[1] + c[2] + c[3]).toLowerCase();
      return inCls && (!kw || text.indexOf(kw) >= 0);
    });
    var box = $('ht-list');
    box.innerHTML = '';
    list.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'status';
      var b = document.createElement('b');
      b.className = 's' + String(c[0])[0];
      b.textContent = String(c[0]);
      var mid = document.createElement('div');
      mid.className = 'd';
      mid.textContent = c[2] + ' · ' + c[3];
      var u = document.createElement('div');
      u.className = 'u';
      u.textContent = c[1];
      d.appendChild(b); d.appendChild(mid); d.appendChild(u);
      box.appendChild(d);
    });
    $('ht-count').textContent = list.length
      ? '共 ' + list.length + ' 条' + (htCls === 'all' ? '' : '（' + CLASS_DESC[htCls] + '）')
      : '没有匹配的状态码。';
    return list;
  }

  var htBtns = $('ht-class').querySelectorAll('button');
  [].forEach.call(htBtns, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(htBtns, function (o) { o.classList.toggle('on', o === b); });
      htCls = b.dataset.cls;
      htRender();
    });
  });
  $('ht-q').addEventListener('input', htRender);

  /* ================= 2. User-Agent 分析 ================= */

  // 按「越具体的特征串越先匹配」排序，否则 Edge 会被认成 Chrome、Chrome 会被认成 Safari
  var UA_BROWSERS = [
    { name: 'Edge', re: /Edg(?:e|A|iOS)?\/([\d.]+)/ },
    { name: 'Opera', re: /(?:OPR|Opera)\/([\d.]+)/ },
    { name: 'QQ 浏览器', re: /QQBrowser\/([\d.]+)/ },
    { name: 'UC 浏览器', re: /UCBrowser\/([\d.]+)/ },
    { name: '360 浏览器', re: /(?:QihooBrowser|QHBrowser|360SE|360EE)\/?([\d.]*)/ },
    { name: '夸克', re: /Quark\/([\d.]+)/ },
    { name: '搜狗浏览器', re: /MetaSr\s([\d.]+)|SogouMobileBrowser\/([\d.]+)/ },
    { name: 'Firefox', re: /(?:Firefox|FxiOS)\/([\d.]+)/ },
    { name: 'Chrome', re: /(?:Chrome|CriOS)\/([\d.]+)/ },
    { name: 'Safari', re: /Version\/([\d.]+).*Safari/ },
    { name: 'IE', re: /(?:MSIE\s([\d.]+)|Trident\/.*rv:([\d.]+))/ }
  ];

  var UA_OS = [
    { name: 'Windows 11 / 10', re: /Windows NT 10\.0/ },
    { name: 'Windows 8.1', re: /Windows NT 6\.3/ },
    { name: 'Windows 8', re: /Windows NT 6\.2/ },
    { name: 'Windows 7', re: /Windows NT 6\.1/ },
    { name: 'Windows Vista', re: /Windows NT 6\.0/ },
    { name: 'Windows XP', re: /Windows NT 5\.1/ },
    { name: 'Windows', re: /Windows/ },
    { name: 'Android', re: /Android\s?([\d.]+)?/ },
    { name: 'iOS', re: /(?:iPhone|iPad|iPod).*OS\s([\d_]+)/ },
    { name: 'iPadOS', re: /Macintosh.*Mobile/ },
    { name: 'macOS', re: /Mac OS X\s([\d_.]+)/ },
    { name: 'Chrome OS', re: /CrOS/ },
    { name: 'HarmonyOS', re: /HarmonyOS/ },
    { name: 'Linux', re: /Linux/ }
  ];

  // 常见爬虫与工具，做 SEO 日志分析时要能一眼认出来
  var UA_BOTS = [
    { name: 'Googlebot', re: /Googlebot|Google-InspectionTool/ },
    { name: 'Bingbot', re: /bingbot/ },
    { name: 'Baiduspider', re: /Baiduspider/i },
    { name: 'Sogou 蜘蛛', re: /Sogou web spider|Sogou Pic Spider/i },
    { name: '360Spider', re: /360Spider|HaosouSpider/i },
    { name: 'YandexBot', re: /YandexBot/i },
    { name: 'DuckDuckBot', re: /DuckDuckBot/i },
    { name: 'curl', re: /^curl\// },
    { name: 'Wget', re: /^Wget\// },
    { name: 'Python 请求', re: /python-requests|aiohttp|httpx/i },
    { name: 'Go 请求', re: /Go-http-client/ },
    { name: 'Node 请求', re: /node-fetch|axios|undici/i },
    { name: 'Postman', re: /PostmanRuntime/ },
    { name: '微信内置浏览器', re: /MicroMessenger/i },
    { name: '钉钉内置浏览器', re: /DingTalk/i },
    { name: '支付宝内置浏览器', re: /AlipayClient/i }
  ];

  function uaAnalyze(ua) {
    ua = String(ua || '').trim();
    var r = {
      raw: ua, browser: '未知', browserVer: '', engine: '', os: '未知', osVer: '',
      device: '桌面', bot: null, mobile: /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
    };
    if (!ua) return r;

    UA_BROWSERS.forEach(function (b) {
      if (r.browser !== '未知') return;   // 顺序即优先级，认出来就停
      var m = b.re.exec(ua);
      if (m) {
        r.browser = b.name;
        r.browserVer = (m[1] || m[2] || '').replace(/_/g, '.');
      }
    });

    UA_OS.forEach(function (o) {
      if (r.os !== '未知') return;
      var m = o.re.exec(ua);
      if (m) {
        r.os = o.name;
        r.osVer = (m[1] || '').replace(/_/g, '.');
      }
    });

    UA_BOTS.forEach(function (b) {
      if (b.re.test(ua)) r.bot = b.name;
    });

    if (/iPhone|iPod/.test(ua)) r.device = '手机';
    else if (/iPad|Tablet|PlayBook|Silk/.test(ua) && !/Mobile/.test(ua)) r.device = '平板';
    else if (/Android/.test(ua)) r.device = /Mobile/.test(ua) ? '手机' : '平板';
    else if (/Mobile/.test(ua)) r.device = '手机';

    // 引擎：WebKit 系都在 UA 里留了 AppleWebKit，Gecko 系有 Gecko/，老 IE 是 Trident
    if (/Trident/.test(ua)) r.engine = 'Trident';
    else if (/Gecko\/\d/.test(ua) && !/like Gecko/.test(ua)) r.engine = 'Gecko';
    else if (/AppleWebKit/.test(ua)) {
      r.engine = /Chrome|Edg/.test(ua) ? 'Blink' : 'WebKit';
    } else if (/Presto/.test(ua)) r.engine = 'Presto';

    return r;
  }

  function uaRun() {
    var ua = $('ua-in').value;
    if (!ua.trim() && navigator.userAgent) ua = navigator.userAgent;
    var r = uaAnalyze(ua);
    $('ua-out').textContent = r.raw || '（空）';

    var grid = $('ua-grid');
    grid.innerHTML = '';
    [['浏览器', r.browser + (r.browserVer ? ' ' + r.browserVer : '')],
     ['操作系统', r.os + (r.osVer ? ' ' + r.osVer : '')],
     ['渲染引擎', r.engine || '未知'],
     ['设备类型', r.device]
    ].forEach(function (p) {
      grid.appendChild(cell(p[0], p[1]));
    });

    var body = $('ua-body');
    body.innerHTML = '';
    [
      ['识别的爬虫 / 工具', r.bot || '未识别'],
      ['是否移动端', r.mobile ? '是' : '否'],
      ['UA 长度', r.raw.length + ' 字符'],
      ['是否可疑', uaSuspicion(r)]
    ].forEach(function (row) {
      var tr = document.createElement('tr');
      row.forEach(function (t, i) {
        var td = document.createElement('td');
        td.textContent = t;
        if (i === 0) td.style.color = 'var(--sub)';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });

    var chips = [];
    if (r.bot) chips.push(['识别的自动程序：' + r.bot, 'warn']);
    if (!r.browserVer && !r.bot) chips.push(['没解析出浏览器版本，可能是伪造或裁剪过的 UA', 'warn']);
    if (/HeadlessChrome/.test(r.raw)) chips.push(['Headless Chrome：无头浏览器特征明显', 'bad']);
    if (/PhantomJS|Selenium|puppeteer/i.test(r.raw)) chips.push(['自动化框架特征串', 'bad']);
    if (r.raw.length < 30) chips.push(['UA 异常短，通常是脚本伪装的', 'warn']);

    $('ua-msg').innerHTML = chips.length
      ? chips.map(function (c) { return '<span class="chip ' + c[1] + '"></span>'; }).join('')
      : '<span class="chip">未发现明显的伪造或自动化特征</span>';
    // innerHTML 的 chip 文本单独填，避免拼接注入
    var spans = $('ua-msg').querySelectorAll('.chip');
    chips.forEach(function (c, i) { if (spans[i]) spans[i].textContent = c[0]; });
    return r;
  }

  function uaSuspicion(r) {
    var score = 0;
    if (/HeadlessChrome/.test(r.raw)) score += 3;
    if (/PhantomJS|Selenium|puppeteer|playwright/i.test(r.raw)) score += 3;
    if (r.raw.length < 30) score += 1;
    if (!r.browserVer && !r.bot) score += 1;
    if (r.raw.split(' ').length > 30) score += 1;
    return score === 0 ? '正常' : score <= 2 ? '轻微可疑' : '高度可疑（疑似脚本伪造）';
  }

  $('ua-run').addEventListener('click', uaRun);
  $('ua-mine').addEventListener('click', function () {
    $('ua-in').value = navigator.userAgent || '';
    uaRun();
  });
  $('ua-in').addEventListener('input', uaRun);
  var uaPresets = $('ua-presets').querySelectorAll('button');
  [].forEach.call(uaPresets, function (b) {
    b.addEventListener('click', function () {
      $('ua-in').value = b.dataset.ua;
      uaRun();
    });
  });

  /* ================= 3. 端口清单 ================= */

  var PORTS = [
    { port: 21, proto: 'TCP', name: 'FTP', note: '明文传输，尽量换 SFTP（22）', risk: '高' },
    { port: 22, proto: 'TCP', name: 'SSH / SFTP', note: '禁用密码登录、只留密钥，改非默认端口可减少扫描噪音', risk: '高' },
    { port: 23, proto: 'TCP', name: 'Telnet', note: '全程明文，必须关掉', risk: '极高' },
    { port: 25, proto: 'TCP', name: 'SMTP', note: '开放中继会被滥用发垃圾邮件', risk: '高' },
    { port: 53, proto: 'TCP/UDP', name: 'DNS', note: '对外开放会被用做 DNS 放大攻击', risk: '中' },
    { port: 80, proto: 'TCP', name: 'HTTP', note: '建议 301 跳转到 443', risk: '低' },
    { port: 110, proto: 'TCP', name: 'POP3', note: '明文收信，用 995（POP3S）替代', risk: '中' },
    { port: 143, proto: 'TCP', name: 'IMAP', note: '明文收信，用 993（IMAPS）替代', risk: '中' },
    { port: 443, proto: 'TCP', name: 'HTTPS', note: '对外主入口，注意证书与 TLS 版本', risk: '低' },
    { port: 445, proto: 'TCP', name: 'SMB', note: '绝不要暴露到公网，勒索软件最爱', risk: '极高' },
    { port: 587, proto: 'TCP', name: 'SMTP 提交', note: '带认证的邮件提交端口', risk: '中' },
    { port: 873, proto: 'TCP', name: 'rsync', note: '常被匿名访问，务必加认证', risk: '高' },
    { port: 1433, proto: 'TCP', name: 'SQL Server', note: '数据库不应直接对外', risk: '极高' },
    { port: 1521, proto: 'TCP', name: 'Oracle', note: '数据库不应直接对外', risk: '极高' },
    { port: 2049, proto: 'TCP', name: 'NFS', note: '配置不当可被任意挂载', risk: '高' },
    { port: 2375, proto: 'TCP', name: 'Docker API（未加密）', note: '开放等于给出 root shell', risk: '极高' },
    { port: 2376, proto: 'TCP', name: 'Docker API（TLS）', note: '要配客户端证书', risk: '高' },
    { port: 3000, proto: 'TCP', name: 'Node / 前端 dev', note: '开发端口不要上线', risk: '中' },
    { port: 3306, proto: 'TCP', name: 'MySQL', note: '只允许内网或跳板机访问', risk: '极高' },
    { port: 3389, proto: 'TCP', name: 'RDP', note: '暴破重灾区，务必走 VPN + 二次验证', risk: '极高' },
    { port: 5432, proto: 'TCP', name: 'PostgreSQL', note: '只允许内网访问', risk: '极高' },
    { port: 5601, proto: 'TCP', name: 'Kibana', note: '历史上多个未授权访问漏洞', risk: '高' },
    { port: 5672, proto: 'TCP', name: 'RabbitMQ', note: '默认 guest/guest 只能本地登录', risk: '高' },
    { port: 5900, proto: 'TCP', name: 'VNC', note: '多为弱口令，走 SSH 隧道', risk: '极高' },
    { port: 6379, proto: 'TCP', name: 'Redis', note: '默认无密码，暴露即被写 SSH 公钥', risk: '极高' },
    { port: 7001, proto: 'TCP', name: 'WebLogic', note: '反序列化漏洞重灾区', risk: '极高' },
    { port: 8080, proto: 'TCP', name: 'HTTP 备用', note: 'Tomcat/中间件控制台常在此，注意默认口令', risk: '中' },
    { port: 8081, proto: 'TCP', name: 'HTTP 备用', note: 'Nexus 等制品库默认端口', risk: '中' },
    { port: 8443, proto: 'TCP', name: 'HTTPS 备用', note: '管理后台常见，建议只开内网', risk: '中' },
    { port: 8888, proto: 'TCP', name: 'Jupyter', note: '默认无认证时可直接执行代码', risk: '极高' },
    { port: 9000, proto: 'TCP', name: 'PHP-FPM / Portainer', note: 'FPM 暴露可导致任意代码执行', risk: '高' },
    { port: 9200, proto: 'TCP', name: 'Elasticsearch', note: '历史上大量数据裸奔事件', risk: '极高' },
    { port: 11211, proto: 'TCP', name: 'Memcached', note: 'UDP 开放会被放大攻击利用', risk: '高' },
    { port: 27017, proto: 'TCP', name: 'MongoDB', note: '旧版本默认无认证', risk: '极高' },
    { port: 50000, proto: 'TCP', name: 'SAP', note: '企业内网组件，不应对外', risk: '高' }
  ];

  function ptRender() {
    var kw = $('pt-q').value.trim().toLowerCase();
    var list = PORTS.filter(function (p) {
      var t = (String(p.port) + p.name + p.note + p.proto + p.risk).toLowerCase();
      return !kw || t.indexOf(kw) >= 0;
    });
    var box = $('pt-list');
    box.innerHTML = '';
    list.forEach(function (p) {
      var d = document.createElement('div');
      d.className = 'port';
      var b = document.createElement('b');
      b.textContent = String(p.port) + '/' + p.proto;
      var n = document.createElement('div');
      n.style.fontSize = '13px';
      n.textContent = p.name;
      var s = document.createElement('span');
      s.textContent = p.risk + '风险 · ' + p.note;
      d.appendChild(b); d.appendChild(n); d.appendChild(s);
      box.appendChild(d);
    });
    $('pt-count').textContent = '共 ' + list.length + ' 项（清单合计 ' + PORTS.length + ' 项）';
    return list;
  }

  $('pt-q').addEventListener('input', ptRender);

  /* ================= 页签与初始化 ================= */

  var PANELS = ['http', 'ua', 'port'];
  function setTab(name) {
    T.markTab(name);
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

  htRender();
  uaRun();
  ptRender();
  setTab(T.firstTab('http'));

  window.__station2 = {
    HTTP_CODES: HTTP_CODES, PORTS: PORTS, CLASS_DESC: CLASS_DESC,
    uaAnalyze: uaAnalyze, uaSuspicion: uaSuspicion,
    UA_BROWSERS: UA_BROWSERS, UA_OS: UA_OS, UA_BOTS: UA_BOTS
  };
})();

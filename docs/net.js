/* 网络计算：IPv4 子网划分 / MAC 地址解析 */
(function () {
  'use strict';
  var $ = T.$, fields = $('fields'), out = $('out'), table = $('table'), hint = $('hint'), current = 'subnet';

  // ---------- IPv4 子网 ----------
  function parseIp(s) {
    var parts = String(s).trim().split('.');
    if (parts.length !== 4) return null;
    var nums = parts.map(function (p) {
      if (!/^\d{1,3}$/.test(p)) return NaN;
      return Number(p);
    });
    if (nums.some(function (n) { return isNaN(n) || n < 0 || n > 255; })) return null;
    return nums;
  }

  function ipToInt(parts) {
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }
  function intToIp(n) {
    return [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
  }

  // 掩码字符串 → 前缀长度；支持 255.255.255.0、/24、24、24 位
  function parseMask(s) {
    var raw = String(s).trim().replace(/^\/|位$/g, '');
    if (/^\d{1,2}$/.test(raw)) {
      var p = Number(raw);
      if (p < 0 || p > 32) return null;
      return p;
    }
    var ip = parseIp(raw);
    if (!ip) return null;
    var mask = ipToInt(ip);
    // 校验掩码连续 1：反转后加 1 应为 2 的幂
    var inv = (~mask) >>> 0;
    if (((inv + 1) & inv) !== 0) return null;
    var prefix = 0, m = mask;
    while (m) { prefix += m & 1; m >>>= 1; }
    return prefix;
  }

  function subnet(ipStr, maskStr) {
    var ip = parseIp(ipStr);
    if (!ip) throw new Error('IP 地址格式不正确，应形如 192.168.1.10');
    var prefix = parseMask(maskStr);
    if (prefix === null) throw new Error('掩码不正确，可填 24、/24 或 255.255.255.0');
    var addr = ipToInt(ip);
    var mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
    var network = (addr & mask) >>> 0;
    var broadcast = (network | (~mask >>> 0)) >>> 0;
    var total = Math.pow(2, 32 - prefix);
    // /31 与 /32 按 RFC 3021 不预留网络号与广播地址
    var usable = prefix >= 31 ? (prefix === 32 ? 1 : 2) : total - 2;
    var first = prefix >= 31 ? network : network + 1;
    var last = prefix >= 31 ? broadcast : broadcast - 1;

    var rows = [
      ['IP 地址', intToIp(addr)],
      ['网络地址', intToIp(network) + '/' + prefix],
      ['子网掩码', intToIp(mask)],
      ['反掩码（wildcard）', intToIp((~mask) >>> 0)],
      ['广播地址', intToIp(broadcast)],
      ['地址总数', T.fmt(total, 0)],
      ['可用主机数', usable <= 0 ? '0' : T.fmt(usable, 0)],
      ['可用地址范围', prefix >= 31 ? intToIp(network) + ' – ' + intToIp(broadcast) : intToIp(first) + ' – ' + intToIp(last)],
      ['私有地址', isPrivate(network) ? '是（RFC 1918）' : '否'],
      ['地址类别', ipClass(ip[0])]
    ];
    return { rows: rows, prefix: prefix, network: network, total: total };
  }

  function isPrivate(n) {
    return (n >= ipToInt([10, 0, 0, 0]) && n <= ipToInt([10, 255, 255, 255])) ||
      (n >= ipToInt([172, 16, 0, 0]) && n <= ipToInt([172, 31, 255, 255])) ||
      (n >= ipToInt([192, 168, 0, 0]) && n <= ipToInt([192, 168, 255, 255]));
  }

  function ipClass(first) {
    if (first < 128) return 'A 类（1–126）';
    if (first < 192) return 'B 类（128–191）';
    if (first < 224) return 'C 类（192–223）';
    if (first < 240) return 'D 类（组播）';
    return 'E 类（保留）';
  }

  // 按当前掩码给出可继续细分的网段（最多列 8 个，避免刷屏）
  function renderSubnetTable(prefix, network) {
    var newPrefix = prefix + 1;
    if (prefix >= 32) { table.innerHTML = ''; return; }
    var count = Math.pow(2, 32 - newPrefix);
    var shown = Math.min(count, 8);
    var html = '<tr><th>细分（/' + newPrefix + '）</th><th>网络地址</th><th>可用范围</th><th>可用数</th></tr>';
    var size = Math.pow(2, 32 - newPrefix);
    for (var i = 0; i < shown; i++) {
      var base = (network + i * size) >>> 0;
      var bcast = (base + size - 1) >>> 0;
      var usable = newPrefix >= 31 ? (newPrefix === 32 ? 1 : 2) : size - 2;
      var first = newPrefix >= 31 ? base : base + 1;
      var last = newPrefix >= 31 ? bcast : bcast - 1;
      html += '<tr><td class="num">' + (i + 1) + '</td><td class="num">' + intToIp(base) + '/' + newPrefix +
        '</td><td class="num">' + intToIp(first) + ' – ' + intToIp(last) + '</td><td class="num">' + usable + '</td></tr>';
    }
    if (count > shown) html += '<tr><td colspan="4">…共 ' + count + ' 个子网，仅列出前 ' + shown + ' 个</td></tr>';
    table.innerHTML = html;
  }

  // ---------- MAC 解析 ----------
  function parseMac(s) {
    var clean = String(s).replace(/[^0-9a-fA-F]/g, '');
    if (clean.length !== 12) throw new Error('MAC 地址需为 12 位十六进制，如 00:1A:2B:3C:4D:5E');
    var bytes = [];
    for (var i = 0; i < 12; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16));
    var first = bytes[0];
    var rows = [
      ['冒号分隔', bytes.map(fmt1).join(':')],
      ['短横分隔', bytes.map(fmt1).join('-')],
      ['点分（Cisco）', bytes.slice(0, 2).map(fmt1).join('') + '.' + bytes.slice(2, 4).map(fmt1).join('') + '.' + bytes.slice(4).map(fmt1).join('')],
      ['连续无分隔', bytes.map(fmt1).join('')],
      ['OUI（厂商前缀）', bytes.slice(0, 3).map(fmt1).join(':')],
      ['NIC 特定部分', bytes.slice(3).map(fmt1).join(':')],
      ['单播 / 组播', (first & 0x01) ? '组播（bit0 = 1）' : '单播（bit0 = 0）'],
      ['全局 / 本地管理', (first & 0x02) ? '本地管理（bit1 = 1，常用于虚拟化随机地址）' : '全局唯一（bit1 = 0）'],
      ['十进制', bytes.join('.')]
    ];
    return rows;
  }
  function fmt1(b) { return b.toString(16).toUpperCase().padStart(2, '0'); }

  // ---------- 表单 ----------
  var FORMS = {
    subnet: {
      hint: '掩码可填前缀长度（24 或 /24）或点分形式（255.255.255.0）。下方同时按 +1 位给出可细分网段。',
      fields: [
        { id: 'ip', label: 'IP 地址', value: '192.168.1.10' },
        { id: 'mask', label: '子网掩码', value: '24' }
      ],
      run: function () { return subnet($('ip').value, $('mask').value); }
    },
    mac: {
      hint: '解析 MAC 地址的多种写法、OUI 前缀与单播/组播、全局/本地管理位含义。',
      fields: [{ id: 'mac', label: 'MAC 地址', value: '00:1A:2B:3C:4D:5E' }],
      run: function () { return { rows: parseMac($('mac').value) }; }
    }
  };

  function buildFields(form) {
    fields.innerHTML = '';
    form.fields.forEach(function (f) {
      var row = T.el('div', 'row');
      var lab = T.el('label', null, f.label);
      lab.setAttribute('for', f.id);
      row.appendChild(lab);
      var inp = document.createElement('input');
      inp.type = 'text'; inp.id = f.id; inp.value = f.value || '';
      row.appendChild(inp);
      fields.appendChild(row);
    });
  }

  function run() {
    try {
      var res = FORMS[current].run();
      out.innerHTML = '';
      var grid = T.el('div', 'grid');
      res.rows.forEach(function (r) {
        var cell = T.el('div');
        cell.appendChild(T.el('div', 'k', r[0]));
        cell.appendChild(T.el('div', 'v', r[1]));
        grid.appendChild(cell);
      });
      out.appendChild(grid);
      hint.className = 'hint';
      hint.textContent = FORMS[current].hint;
      if (current === 'subnet') renderSubnetTable(res.prefix, res.network);
      else table.innerHTML = '';
    } catch (e) {
      out.innerHTML = '';
      table.innerHTML = '';
      hint.className = 'hint err';
      hint.textContent = '计算失败：' + e.message;
    }
  }

  function setTab(name) {
    current = name;
    T.markTab(name);
    buildFields(FORMS[name]);
    hint.className = 'hint';
    hint.textContent = FORMS[name].hint;
    out.innerHTML = ''; table.innerHTML = '';
  }

  T.tabs($('tabs'), setTab);
  $('run').addEventListener('click', run);
  $('reset').addEventListener('click', function () { setTab(current); });
  fields.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });

  setTab(T.firstTab('subnet'));
})();

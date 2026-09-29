/* 信息查询：身份证解析、百家姓排名、尺码对照

   身份证按 GB 11643 的加权模 11 校验；籍贯取前 6 位行政区划码的省级前缀。
   所有数据内置在页面里，不联网。 */
(function () {
  'use strict';
  var $ = T.$;

  /* ---------- 1. 身份证 ---------- */
  var WEIGHT = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var CHECK = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

  // 省级行政区划前两位
  var PROVINCE = {
    11: '北京市', 12: '天津市', 13: '河北省', 14: '山西省', 15: '内蒙古自治区',
    21: '辽宁省', 22: '吉林省', 23: '黑龙江省', 31: '上海市', 32: '江苏省',
    33: '浙江省', 34: '安徽省', 35: '福建省', 36: '江西省', 37: '山东省',
    41: '河南省', 42: '湖北省', 43: '湖南省', 44: '广东省', 45: '广西壮族自治区',
    46: '海南省', 50: '重庆市', 51: '四川省', 52: '贵州省', 53: '云南省',
    54: '西藏自治区', 61: '陕西省', 62: '甘肃省', 63: '青海省', 64: '宁夏回族自治区',
    65: '新疆维吾尔自治区', 71: '台湾省', 81: '香港特别行政区', 82: '澳门特别行政区'
  };

  function idCheckCode(id17) {
    var sum = 0;
    for (var i = 0; i < 17; i++) sum += Number(id17.charAt(i)) * WEIGHT[i];
    return CHECK[sum % 11];
  }

  function parseId(raw) {
    var id = String(raw || '').trim().toUpperCase().replace(/\s/g, '');
    if (!/^\d{17}[\dX]$/.test(id)) return { err: '身份证应为 18 位，前 17 位为数字，末位为数字或 X。' };
    var expect = idCheckCode(id.slice(0, 17));
    var birth = null;
    try {
      birth = new Date(Number(id.slice(6, 10)), Number(id.slice(10, 12)) - 1, Number(id.slice(12, 14)));
      if (isNaN(birth.getTime())) throw new Error('bad');
      if (birth.getMonth() !== Number(id.slice(10, 12)) - 1 || birth.getDate() !== Number(id.slice(12, 14))) throw new Error('bad');
    } catch (e) { return { err: '第 7~14 位的出生日期不合法。' }; }

    var today = new Date();
    var age = today.getFullYear() - birth.getFullYear();
    var m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;

    var gender = Number(id.charAt(16)) % 2 === 1 ? '男' : '女';
    var prov = PROVINCE[Number(id.slice(0, 2))] || '未知（区划码不在常见表中）';
    return {
      id: id, valid: expect === id.charAt(17), expect: expect,
      birth: birth, age: age, gender: gender, province: prov,
      region: id.slice(0, 6), seq: id.slice(14, 17)
    };
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function runId() {
    var out = $('id-out'), note = $('id-note'), big = $('id-big');
    out.innerHTML = '';
    var r = parseId($('id-in').value);
    if (r.err) {
      big.textContent = '—';
      note.className = 'note bad';
      note.textContent = r.err;
      return;
    }
    big.innerHTML = r.gender + ' · ' + r.age + ' 岁 <small>' + r.province + '</small>';
    T.cells(out, [
      ['校验结果', r.valid ? '校验位正确' : '校验位应为 ' + r.expect + '，实际 ' + r.id.charAt(17)],
      ['出生日期', fmtDate(r.birth)],
      ['年龄', r.age + ' 岁'],
      ['性别', r.gender],
      ['籍贯（省级）', r.province],
      ['区划码 / 顺序码', r.region + ' / ' + r.seq]
    ]);
    note.className = 'note ' + (r.valid ? 'ok' : 'bad');
    note.innerHTML = r.valid
      ? '<b>校验通过</b>　前 17 位按权重 7 9 10 5 8 4 2 1 6 3 7 9 10 5 8 4 2 加权求和，对 11 取模后按 1 0 X 9 8 7 6 5 4 3 2 映射得到校验位。'
      : '<b>校验不通过</b>　按 GB 11643 规则，这位应是 <b>' + r.expect + '</b>，请核对号码是否抄错。' +
        '注意：校验通过只说明格式合规，不代表号码真实存在。';
  }

  /* ---------- 2. 百家姓 ---------- */
  var BAIJIAXING = ('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜' +
    '戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛' +
    '雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪' +
    '祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危' +
    '江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫').split('');

  var COMPOUND = ['欧阳', '太史', '端木', '上官', '司马', '东方', '独孤', '南宫', '万俟', '闻人',
    '夏侯', '诸葛', '尉迟', '公羊', '赫连', '澹台', '皇甫', '宗政', '濮阳', '公冶',
    '太叔', '申屠', '公孙', '慕容', '仲孙', '钟离', '长孙', '宇文', '司徒', '鲜于',
    '司空', '闾丘', '子车', '亓官', '司寇', '巫马', '公西', '颛孙', '壤驷', '公良',
    '漆雕', '乐正', '宰父', '谷梁', '拓跋', '夹谷', '轩辕', '令狐', '段干', '百里',
    '呼延', '东郭', '南门', '羊舌', '微生', '梁丘', '左丘', '东门', '西门', '南宫'
  ];

  function surnameRank(s) {
    s = String(s || '').trim();
    if (!s) return { err: '请输入一个姓氏。' };
    if (s.length > 1) {
      var ci = COMPOUND.indexOf(s);
      if (ci >= 0) return { name: s, rank: null, compound: true, note: '复姓，常见于百家姓中后段，不参与单姓排名。' };
      s = s.charAt(0);
    }
    var idx = BAIJIAXING.indexOf(s);
    if (idx < 0) return { err: '"' + s + '" 不在本页收录的常见姓氏里。' };
    return { name: s, rank: idx + 1, total: BAIJIAXING.length, compound: false, char: s };
  }

  function runBjs() {
    var out = $('bj-out'), err = $('bj-err');
    out.innerHTML = ''; err.hidden = true;
    var r = surnameRank($('bj-q').value);
    if (r.err) { err.hidden = false; err.textContent = r.err; return; }
    if (r.compound) {
      T.cells(out, [['姓氏', r.name], ['类型', '复姓'], ['说明', r.note]]);
      return;
    }
    T.cells(out, [
      ['姓氏', r.name],
      ['在本表顺序', '第 ' + r.rank + ' 位'],
      ['收录总数', r.total + ' 个单姓'],
      ['类型', '单姓'],
      ['频次档位', r.rank <= 10 ? '特大姓（前十）' : r.rank <= 30 ? '常见大姓' : r.rank <= 100 ? '较常见' : '一般常见']
    ]);
  }

  function renderBjsList() {
    var box = $('bj-list');
    box.innerHTML = '';
    BAIJIAXING.slice(0, 100).forEach(function (c, i) {
      var d = document.createElement('div');
      var s = document.createElement('span');
      s.textContent = i + 1;
      d.appendChild(s);
      d.appendChild(document.createTextNode(c));
      box.appendChild(d);
    });
  }

  /* ---------- 3. 尺码对照 ---------- */
  var SIZE_TABLES = {
    'cloth-f': {
      label: '身高 / 胸围',
      unit: ['cm', 'cm'],
      note: '女装上衣常见国标：155/80A(XS)、160/84A(S)、165/88A(M)、170/92A(L)、175/96A(XL)。',
      pick: function (h, b) {
        var specs = [[155, 80, 'XS'], [160, 84, 'S'], [165, 88, 'M'], [170, 92, 'L'], [175, 96, 'XL'], [180, 100, 'XXL']];
        return nearest(specs, h, b, '女装');
      }
    },
    'cloth-m': {
      label: '身高 / 胸围',
      unit: ['cm', 'cm'],
      note: '男装上衣常见国标：165/88A(S)、170/92A(M)、175/96A(L)、180/100A(XL)、185/104A(XXL)。',
      pick: function (h, b) {
        var specs = [[165, 88, 'S'], [170, 92, 'M'], [175, 96, 'L'], [180, 100, 'XL'], [185, 104, 'XXL'], [190, 108, 'XXXL']];
        return nearest(specs, h, b, '男装');
      }
    },
    pants: {
      label: '腰围 / 臀围',
      unit: ['cm', 'cm'],
      note: '裤子尺码按「市寸 × 10」标示，如 2 尺 2 ≈ 29 英寸 ≈ 74cm 腰围。',
      pick: function (w, hip) {
        var specs = [[66, 90, '26'], [70, 94, '27'], [74, 98, '28'], [78, 102, '29'], [82, 106, '30'],
          [86, 110, '31'], [90, 114, '32'], [94, 118, '34'], [98, 122, '36']];
        return nearest(specs, w, hip, '裤子');
      }
    },
    'shoes-f': {
      label: '脚长 / 脚宽（可选）',
      unit: ['mm', 'mm'],
      note: '女鞋码数 = 脚长(mm) ÷ 10 × 2 − 10，取最接近的欧码。',
      pick: function (len, width) { return shoes(len, '女鞋'); }
    },
    'shoes-m': {
      label: '脚长 / 脚宽（可选）',
      unit: ['mm', 'mm'],
      note: '男鞋码数 = 脚长(mm) ÷ 10 × 2 − 10，取最接近的欧码。',
      pick: function (len, width) { return shoes(len, '男鞋'); }
    }
  };

  function nearest(specs, a, b, kind) {
    var best = specs[0], bestD = Infinity;
    specs.forEach(function (s) {
      var d = Math.abs(s[0] - a) + Math.abs(s[1] - (isFinite(b) ? b : s[1])) * 0.5;
      if (d < bestD) { bestD = d; best = s; }
    });
    return { size: best[2], height: best[0], chest: best[1], kind: kind };
  }

  var SHOE_EU = [[220, 34], [225, 35], [230, 36], [235, 37], [240, 38], [245, 39], [250, 40],
    [255, 41], [260, 42], [265, 43], [270, 44], [275, 45], [280, 46], [285, 47], [290, 48]];
  function shoes(len, kind) {
    var best = SHOE_EU[0], bestD = Infinity;
    SHOE_EU.forEach(function (s) {
      var d = Math.abs(s[0] - len);
      if (d < bestD) { bestD = d; best = s; }
    });
    return { size: best[1] + ' 码', len: best[0], kind: kind, foot: len };
  }

  function runSize() {
    var kind = segVal('sz-kind', 'kind', 'cloth-f');
    var cfg = SIZE_TABLES[kind];
    var a = Number($('sz-a').value), b = Number($('sz-b').value);
    if (!isFinite(a) || a <= 0) { $('sz-big').textContent = '—'; $('sz-out').innerHTML = ''; $('sz-note').textContent = '请填写有效数值。'; return; }
    var r = cfg.pick(a, isFinite(b) ? b : NaN);
    $('sz-big').textContent = r.size;
    T.cells($('sz-out'), Object.keys(r).filter(function (k) {
      return k !== 'size' && k !== 'kind';
    }).map(function (k) {
      var labels = { height: '身高', chest: '胸围', len: '脚长', foot: '脚长' };
      return [labels[k] || k, r[k] + (k === 'foot' || k === 'len' ? ' mm' : ' cm')];
    }).concat([['类别', r.kind], ['推荐码', r.size]]));
    $('sz-note').innerHTML = '<b>说明</b>　' + cfg.note + '不同品牌版型差异较大，线上购买建议结合评价里的实际尺寸，最终以试穿为准。';
  }

  function segVal(id, key, def) {
    var on = $(id).querySelector('button.on');
    return on ? on.dataset[key] : def;
  }

  /* ---------- 绑定 ---------- */
  $('id-run').addEventListener('click', runId);
  $('id-in').addEventListener('input', runId);
  $('id-clear').addEventListener('click', function () { $('id-in').value = ''; runId(); });
  $('bj-run').addEventListener('click', runBjs);
  $('bj-q').addEventListener('input', runBjs);
  $('bj-clear').addEventListener('click', function () { $('bj-q').value = ''; $('bj-out').innerHTML = ''; $('bj-err').hidden = true; });

  $('sz-kind').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    [].forEach.call(this.querySelectorAll('button'), function (o) { o.classList.toggle('on', o === b); });
    var cfg = SIZE_TABLES[b.dataset.kind];
    $('sz-label').textContent = cfg.label;
    $('sz-a').placeholder = cfg.unit[0];
    $('sz-b').placeholder = cfg.unit[1];
    if (b.dataset.kind === 'shoes-f' || b.dataset.kind === 'shoes-m') { $('sz-a').value = '235'; $('sz-b').value = ''; }
    else if (b.dataset.kind === 'pants') { $('sz-a').value = '74'; $('sz-b').value = '98'; }
    else { $('sz-a').value = '165'; $('sz-b').value = '88'; }
    runSize();
  });
  ['sz-a', 'sz-b'].forEach(function (id) { $(id).addEventListener('input', runSize); });
  $('sz-run').addEventListener('click', runSize);
  $('sz-reset').addEventListener('click', function () { $('sz-a').value = '160'; $('sz-b').value = '84'; runSize(); });

  T.tabs($('tabs'), function (name) {
    ['id', 'bjs', 'size'].forEach(function (k) { $('panel-' + k).hidden = k !== name; });
    if (name === 'id') runId();
    if (name === 'bjs') renderBjsList();
    if (name === 'size') runSize();
  });

  renderBjsList();
  runId(); runBjs(); runSize();

  window.__info = {
    WEIGHT: WEIGHT, CHECK: CHECK, idCheckCode: idCheckCode, parseId: parseId,
    BAIJIAXING: BAIJIAXING, COMPOUND: COMPOUND, surnameRank: surnameRank,
    SIZE_TABLES: SIZE_TABLES, nearest: nearest, shoes: shoes, SHOE_EU: SHOE_EU, fmtDate: fmtDate
  };
})();

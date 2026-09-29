/* 日期与时间：年龄 / 日期间隔 / 第几周 / 时间戳互转 */
(function () {
  'use strict';
  var $ = T.$, fields = $('fields'), grid = $('grid'), output = $('output'), hint = $('hint'), current = 'age';

  var MS_DAY = 86400000;

  function parseDate(s) {
    var m = String(s).trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // 回读校验，挡掉 2024-02-31 这类不存在的日期
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
    return d;
  }
  function parseDateTime(s) {
    var raw = String(s).trim().replace(' ', 'T');
    var d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtDateTime(d) {
    return fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function pad(n) { return String(n).padStart(2, '0'); }

  // 按「整年 + 整月 + 余日」算年龄，避免按天数除法被闰年带偏
  function ageBetween(birth, now) {
    var years = now.getFullYear() - birth.getFullYear();
    var months = now.getMonth() - birth.getMonth();
    var days = now.getDate() - birth.getDate();
    if (days < 0) {
      months--;
      // 取上一个月的天数作为借位
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    if (months < 0) { years--; months += 12; }
    return { years: years, months: months, days: days };
  }

  function nextBirthday(birth, now) {
    var y = now.getFullYear();
    var d = new Date(y, birth.getMonth(), birth.getDate());
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(y + 1);
    return d;
  }

  // ISO 8601 周号：周一为一周开始，含当年第一个周四的那周为第 1 周
  function isoWeek(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // 转到本周四，用周四所在年份定归属
    var day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day + 3);
    var isoYear = d.getFullYear();
    var jan4 = new Date(isoYear, 0, 4);
    var jan4Day = (jan4.getDay() + 6) % 7;
    var week1Thu = new Date(isoYear, 0, 4 - jan4Day + 3);
    var week = 1 + Math.round((d - week1Thu) / (7 * MS_DAY));
    return { year: isoYear, week: week };
  }

  function dayOfYear(date) {
    var start = new Date(date.getFullYear(), 0, 1);
    return Math.floor((date - start) / MS_DAY) + 1;
  }

  // 时间戳互转：10 位按秒、13 位按毫秒识别
  function tsConvert(ts, text) {
    if (text) {
      var d = parseDateTime(text);
      if (!d) throw new Error('时间格式不正确，应形如 2024-06-01 12:00:00');
      return [
        ['秒级时间戳', String(Math.floor(d.getTime() / 1000))],
        ['毫秒时间戳', String(d.getTime())],
        ['解析结果', fmtDateTime(d)]
      ];
    }
    var raw = String(ts).trim();
    if (!/^-?\d+$/.test(raw)) throw new Error('时间戳需为整数（秒或毫秒）');
    var n = Number(raw);
    var ms = raw.replace('-', '').length >= 13 ? n : n * 1000;
    var date = new Date(ms);
    if (isNaN(date.getTime())) throw new Error('时间戳超出可表示范围');
    var unit = raw.replace('-', '').length >= 13 ? '毫秒' : '秒';
    return [
      ['识别单位', unit],
      ['秒级时间戳', String(Math.floor(ms / 1000))],
      ['毫秒时间戳', String(ms)],
      ['北京时间', fmtDateTime(date)],
      ['UTC 时间', date.toISOString().replace('T', ' ').slice(0, 19)]
    ];
  }

  var FORMS = {
    age: {
      hint: '按公历计算周岁（整年整月余日），同时给出总天数、下个生日倒计时与生肖。',
      fields: [{ id: 'birth', label: '出生日期', value: '1995-06-15' }],
      run: function () {
        var birth = parseDate($('birth').value);
        if (!birth) throw new Error('出生日期格式不正确，应形如 1995-06-15');
        var now = new Date();
        if (birth > now) throw new Error('出生日期不能晚于今天');
        var a = ageBetween(birth, now);
        var totalDays = Math.floor((now - birth) / MS_DAY);
        var nb = nextBirthday(birth, now);
        var daysToBirthday = Math.round((new Date(nb.getFullYear(), nb.getMonth(), nb.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / MS_DAY);
        return [
          ['周岁', a.years + ' 岁 ' + a.months + ' 个月 ' + a.days + ' 天'],
          ['合计月龄', String(a.years * 12 + a.months) + ' 个月'],
          ['出生至今', T.fmt(totalDays, 0) + ' 天'],
          ['下次生日', fmtDate(nb) + '（还有 ' + daysToBirthday + ' 天）'],
          ['出生星期', '星期' + '日一二三四五六'[birth.getDay()]],
          ['生肖', zodiac(birth.getFullYear())]
        ];
      }
    },
    diff: {
      hint: '计算两个日期的间隔：按自然日计，含总天数、周数、以及年月日拆解；含首日选项影响天数。',
      fields: [
        { id: 'start', label: '开始日期', value: '' },
        { id: 'end', label: '结束日期', value: '' },
        { id: 'inclusive', label: '是否含首尾两天', type: 'select', options: [['0', '不含（差值）'], ['1', '含（+1 天）']], value: '0' }
      ],
      run: function () {
        var s = parseDate($('start').value), e = parseDate($('end').value);
        if (!s) throw new Error('开始日期格式不正确，应形如 2024-01-01');
        if (!e) throw new Error('结束日期格式不正确，应形如 2024-12-31');
        var sign = e >= s ? 1 : -1;
        var from = sign > 0 ? s : e, to = sign > 0 ? e : s;
        var days = Math.round((to - from) / MS_DAY) + ($('inclusive').value === '1' ? 1 : 0);
        var weeks = Math.floor(days / 7);
        var a = ageBetween(from, to);
        return [
          ['间隔天数', T.fmt(days * sign, 0) + ' 天'],
          ['折合周数', weeks + ' 周 ' + (days % 7) + ' 天'],
          ['年月日拆解', a.years + ' 年 ' + a.months + ' 个月 ' + a.days + ' 天'],
          ['折合小时', T.fmt(days * 24 * sign, 0) + ' 小时'],
          ['开始星期', '星期' + '日一二三四五六'[s.getDay()]],
          ['结束星期', '星期' + '日一二三四五六'[e.getDay()]],
          ['是否同年', s.getFullYear() === e.getFullYear() ? '是' : '否']
        ];
      }
    },
    week: {
      hint: 'ISO 8601 周号（周一为一周之始）。同时给出年内第几天、季度与本月第几周。',
      fields: [{ id: 'day', label: '日期', value: '' }],
      run: function () {
        var d = parseDate($('day').value);
        if (!d) throw new Error('日期格式不正确，应形如 2024-06-01');
        var iso = isoWeek(d);
        var doy = dayOfYear(d);
        var quarter = Math.floor(d.getMonth() / 3) + 1;
        var weekOfMonth = Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay() - 1) / 7);
        return [
          ['ISO 周号', iso.year + ' 年第 ' + iso.week + ' 周'],
          ['年内第几天', String(doy) + ' 天'],
          ['所在季度', '第 ' + quarter + ' 季度'],
          ['本月第几周', '第 ' + weekOfMonth + ' 周（按自然周切分）'],
          ['星期', '星期' + '日一二三四五六'[d.getDay()]],
          ['距年末', String((isLeap(d.getFullYear()) ? 366 : 365) - doy) + ' 天']
        ];
      }
    },
    ts: {
      hint: '时间戳与日期互转，10 位按秒、13 位按毫秒自动识别；日期按本地时区（东八区）解释。',
      fields: [
        { id: 'ts', label: 'Unix 时间戳（秒或毫秒）', value: '' },
        { id: 'text', label: '或填日期时间（2024-06-01 12:00:00）', value: '' }
      ],
      run: function () {
        var text = $('text').value.trim();
        var ts = $('ts').value.trim();
        if (!text && !ts) {
          // 都不填就按当前时间给样例，避免空白页
          return tsConvert(Date.now(), null);
        }
        return tsConvert(ts, text);
      }
    }
  };

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function zodiac(y) {
    var animals = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
    return animals[(y - 4) % 12] + '年';
  }

  function todayStr() { return fmtDate(new Date()); }

  function buildFields(form) {
    fields.innerHTML = '';
    form.fields.forEach(function (f) {
      var row = T.el('div', 'row');
      var lab = T.el('label', null, f.label);
      lab.setAttribute('for', f.id);
      row.appendChild(lab);
      var node;
      if (f.type === 'select') {
        node = document.createElement('select');
        f.options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0]; opt.textContent = o[1];
          if (o[0] === f.value) opt.selected = true;
          node.appendChild(opt);
        });
      } else {
        node = document.createElement('input');
        node.type = 'text';
        node.placeholder = 'YYYY-MM-DD';
        node.value = f.value === '' ? defaultFor(f.id) : f.value;
      }
      node.id = f.id;
      row.appendChild(node);
      fields.appendChild(row);
    });
  }

  // 空默认值给今天，省得每次手填
  function defaultFor(id) {
    if (id === 'start') return fmtDate(new Date(Date.now() - 30 * MS_DAY));
    if (id === 'end') return todayStr();
    if (id === 'day') return todayStr();
    return '';
  }

  function run() {
    try {
      var rows = FORMS[current].run();
      T.cells(grid, rows);
      grid.style.display = '';
      output.textContent = '';
      output.style.display = 'none';
      hint.className = 'hint';
      hint.textContent = FORMS[current].hint;
    } catch (e) {
      grid.innerHTML = '';
      grid.style.display = 'none';
      output.style.display = '';
      output.className = 'out err';
      output.textContent = '计算失败：' + e.message;
      hint.className = 'hint err';
      hint.textContent = FORMS[current].hint;
    }
  }

  function setTab(name) {
    current = name;
    buildFields(FORMS[name]);
    hint.className = 'hint';
    hint.textContent = FORMS[name].hint;
    grid.innerHTML = ''; grid.style.display = '';
    output.textContent = ''; output.style.display = 'none';
  }

  T.tabs($('tabs'), setTab);
  $('run').addEventListener('click', run);
  $('reset').addEventListener('click', function () { setTab(current); });
  fields.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });

  setTab('age');
})();

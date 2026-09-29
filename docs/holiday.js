/* 放假安排：2025 / 2026 年法定节假日、调休与补班
   数据为内置静态表（照国务院办公厅通知逐条录入），不联网。
   dates 里写 0 表示那天调休上班。 */
(function () {
  'use strict';
  var $ = T.$;

  // 每年一份：fest 是法定节假日放假区间，makeup 是要上班的周末
  var DATA = {
    2025: [
      {
        name: '元旦', tag: '元旦', days: 1,
        rest: ['2025-01-01'],
        makeup: [],
        desc: '1 月 1 日放假 1 天，不调休。'
      },
      {
        name: '春节', tag: '春节', days: 8,
        rest: ['2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04'],
        makeup: ['2025-01-26', '2025-02-08'],
        desc: '1 月 28 日（除夕）至 2 月 4 日放假调休，共 8 天。1 月 26 日（周日）、2 月 8 日（周六）上班。'
      },
      {
        name: '清明节', tag: '清明', days: 3,
        rest: ['2025-04-04', '2025-04-05', '2025-04-06'],
        makeup: [],
        desc: '4 月 4 日至 6 日放假，共 3 天，与周末连休。'
      },
      {
        name: '劳动节', tag: '劳动节', days: 5,
        rest: ['2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05'],
        makeup: ['2025-04-27'],
        desc: '5 月 1 日至 5 日放假调休，共 5 天。4 月 27 日（周日）上班。'
      },
      {
        name: '端午节', tag: '端午', days: 3,
        rest: ['2025-05-31', '2025-06-01', '2025-06-02'],
        makeup: [],
        desc: '5 月 31 日至 6 月 2 日放假，共 3 天，与周末连休。'
      },
      {
        name: '国庆节、中秋节', tag: '国庆中秋', days: 8,
        rest: ['2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08'],
        makeup: ['2025-09-28', '2025-10-11'],
        desc: '10 月 1 日至 8 日放假调休，共 8 天。9 月 28 日（周日）、10 月 11 日（周六）上班。'
      }
    ],
    2026: [
      {
        name: '元旦', tag: '元旦', days: 3,
        rest: ['2026-01-01', '2026-01-02', '2026-01-03'],
        makeup: [],
        desc: '1 月 1 日至 3 日放假，共 3 天，与周末连休。'
      },
      {
        name: '春节', tag: '春节', days: 9,
        rest: ['2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
          '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23'],
        makeup: ['2026-02-14', '2026-02-28'],
        desc: '2 月 15 日（除夕前一日）至 23 日放假调休，共 9 天。2 月 14 日（周六）、2 月 28 日（周六）上班。'
      },
      {
        name: '清明节', tag: '清明', days: 3,
        rest: ['2026-04-04', '2026-04-05', '2026-04-06'],
        makeup: [],
        desc: '4 月 4 日至 6 日放假，共 3 天，与周末连休。'
      },
      {
        name: '劳动节', tag: '劳动节', days: 5,
        rest: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
        makeup: ['2026-04-26'],
        desc: '5 月 1 日至 5 日放假调休，共 5 天。4 月 26 日（周日）上班。'
      },
      {
        name: '端午节', tag: '端午', days: 3,
        rest: ['2026-06-19', '2026-06-20', '2026-06-21'],
        makeup: [],
        desc: '6 月 19 日至 21 日放假，共 3 天，与周末连休。'
      },
      {
        name: '中秋节', tag: '中秋', days: 3,
        rest: ['2026-09-25', '2026-09-26', '2026-09-27'],
        makeup: [],
        desc: '9 月 25 日至 27 日放假，共 3 天，与周末连休。'
      },
      {
        name: '国庆节', tag: '国庆', days: 7,
        rest: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'],
        makeup: ['2026-09-27', '2026-10-10'],
        desc: '10 月 1 日至 7 日放假调休，共 7 天。9 月 27 日（周日）、10 月 10 日（周六）上班。'
      }
    ]
  };

  var FESTIVAL_DATES = {
    '元旦': '01-01',
    '春节': '农历正月初一',
    '清明节': '04-04 前后',
    '劳动节': '05-01',
    '端午节': '农历五月初五',
    '中秋节': '农历八月十五',
    '国庆节': '10-01'
  };

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // 把一年的安排展开成「日期 → 状态」的映射，日历渲染与统计都用它
  function buildIndex(year) {
    var idx = {};   // 'YYYY-MM-DD' → { state: 'fest'|'makeup', tag, name }
    var list = DATA[year] || [];
    list.forEach(function (f) {
      f.rest.forEach(function (d) {
        idx[d] = { state: 'fest', tag: f.tag, name: f.name };
      });
      f.makeup.forEach(function (d) {
        idx[d] = { state: 'makeup', tag: '班', name: f.name };
      });
    });
    return idx;
  }

  // 全年逐日分类统计，顺便核对「放假天数」与安排表是否自洽
  function yearStats(year) {
    var idx = buildIndex(year);
    var days = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
    var stat = { fest: 0, weekend: 0, makeup: 0, work: 0, total: days, festOnly: 0, makeupOnly: 0 };
    for (var i = 0; i < days; i++) {
      var d = new Date(year, 0, 1 + i);
      var key = ymd(d);
      var isWeekend = d.getDay() === 0 || d.getDay() === 6;
      var rec = idx[key];
      if (rec && rec.state === 'fest') {
        stat.fest++;
        if (!isWeekend) stat.festOnly++;   // 调休之外的「净」放假天数
      } else if (rec && rec.state === 'makeup') {
        stat.makeup++;
        stat.makeupOnly++;
      } else if (isWeekend) {
        stat.weekend++;
      } else {
        stat.work++;
      }
    }
    return stat;
  }

  // 一年里的「实际休息日总数」= 法定节假日 + 未调休的周末 - 被调休占用的周末
  function restDays(year) {
    var stat = yearStats(year);
    return stat.fest + stat.weekend;
  }

  var curYear = 2025, curMonth = 0;

  function renderSeg() {
    var seg = $('month-seg');
    seg.innerHTML = '';
    for (var m = 0; m < 12; m++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = (m + 1) + ' 月';
      b.dataset.m = String(m);
      if (m === curMonth) b.className = 'on';
      b.addEventListener('click', function () {
        curMonth = Number(this.dataset.m);
        renderCal();
      });
      seg.appendChild(b);
    }
  }

  function renderCal() {
    [].forEach.call($('month-seg').querySelectorAll('button'), function (b) {
      b.classList.toggle('on', Number(b.dataset.m) === curMonth);
    });
    var head = $('cal-head');
    head.innerHTML = '';
    WEEK.forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'h';
      d.textContent = w;
      head.appendChild(d);
    });

    var idx = buildIndex(curYear);
    var first = new Date(curYear, curMonth, 1);
    var daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
    var cal = $('cal');
    cal.innerHTML = '';
    for (var i = 0; i < first.getDay(); i++) {
      var e = document.createElement('div');
      e.className = 'd empty';
      cal.appendChild(e);
    }
    for (var day = 1; day <= daysInMonth; day++) {
      var d2 = new Date(curYear, curMonth, day);
      var key = ymd(d2);
      var rec = idx[key];
      var isWeekend = d2.getDay() === 0 || d2.getDay() === 6;
      var el = document.createElement('div');
      el.className = 'd';
      if (rec && rec.state === 'fest') el.classList.add('fest');
      else if (rec && rec.state === 'makeup') el.classList.add('work');
      else if (isWeekend) el.classList.add('rest');
      el.textContent = String(day);
      if (rec) {
        var t = document.createElement('span');
        t.className = 't';
        t.textContent = rec.state === 'makeup' ? '班' : rec.tag.slice(0, 2);
        el.appendChild(t);
      }
      cal.appendChild(el);
    }
    return { year: curYear, month: curMonth + 1, days: daysInMonth };
  }

  function renderList() {
    var box = $('list');
    box.innerHTML = '';
    (DATA[curYear] || []).forEach(function (f) {
      var d = document.createElement('div');
      d.className = 'fest';
      var hd = document.createElement('div');
      hd.className = 'hd';
      var nm = document.createElement('span');
      nm.className = 'name';
      nm.textContent = f.name;
      var dy = document.createElement('span');
      dy.className = 'days';
      dy.textContent = '放假 ' + f.days + ' 天';
      hd.appendChild(nm); hd.appendChild(dy);
      d.appendChild(hd);

      var rg = document.createElement('div');
      rg.className = 'range';
      rg.textContent = shortRange(f.rest);
      d.appendChild(rg);

      if (f.makeup.length) {
        var mk = document.createElement('div');
        mk.className = 'work';
        mk.textContent = '调休上班：' + f.makeup.map(shortDate).join('、');
        d.appendChild(mk);
      }

      var ds = document.createElement('div');
      ds.className = 'desc';
      ds.textContent = f.desc;
      d.appendChild(ds);
      box.appendChild(d);
    });
  }

  function shortDate(s) {
    var p = s.split('-');
    return Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日';
  }

  function shortRange(arr) {
    if (!arr.length) return '';
    return shortDate(arr[0]) + ' 至 ' + shortDate(arr[arr.length - 1]) + '（共 ' + arr.length + ' 天）';
  }

  function renderCount() {
    var stat = yearStats(curYear);
    var box = $('count');
    box.innerHTML = '';
    [['法定节假日', stat.fest], ['调休上班', stat.makeup], ['全年休息日', restDays(curYear)]].forEach(function (p) {
      var d = document.createElement('div');
      var b = document.createElement('b'); b.textContent = String(p[1]);
      var s = document.createElement('span'); s.textContent = p[0];
      d.appendChild(b); d.appendChild(s);
      box.appendChild(d);
    });
    return stat;
  }

  function renderAll() {
    renderSeg();
    renderCal();
    renderList();
    renderCount();
  }

  var yearBtns = $('year-seg').querySelectorAll('button');
  [].forEach.call(yearBtns, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(yearBtns, function (o) { o.classList.toggle('on', o === b); });
      curYear = Number(b.dataset.year);
      curMonth = 0;
      renderAll();
    });
  });

  renderAll();

  window.__holiday = {
    DATA: DATA, FESTIVAL_DATES: FESTIVAL_DATES,
    buildIndex: buildIndex, yearStats: yearStats, restDays: restDays,
    ymd: ymd, shortRange: shortRange
  };
})();

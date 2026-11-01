let analyticsView = params.get('view') === 'grades' ? 'grades' : 'stats';

// 분석 탭: 통계와 성적을 한 탭에서 전환
function renderAnalytics() {
  const seg = `<div class="seg">
    <button class="${analyticsView === 'stats' ? 'on' : ''}" data-action="analytics-view" data-view="stats">통계</button>
    <button class="${analyticsView === 'grades' ? 'on' : ''}" data-action="analytics-view" data-view="grades">성적</button></div>`;
  return `<div class="toolbar" style="margin:0">${seg}</div>${analyticsView === 'grades' ? renderGrades() : renderStats()}`;
}

function weekChart(wk) {
  const max = Math.max(1, ...wk.days.map((d) => Math.max(d.load, d.avail)));
  return wk.days.map((d) => hRow(fmtDay(d.date), d.load, max, `${d.load.toFixed(1)}h / 가능 ${+d.avail.toFixed(1)}h`, d.crunch)).join('')
    + '<p class="muted small">막대 = 그날 마감 작업 · 빨강 = 시간 부족</p>';
}

function futureWeeks() {
  const s = startOfDay(new Date());
  const rows = [0, 1, 2, 3].map((i) => ({ start: addDays(s, 7 * i), w: weekLoad(addDays(s, 7 * i)) }));
  const max = Math.max(1, ...rows.map(({ w }) => Math.max(w.total, w.avail)));
  return rows.map(({ start, w }, i) => hRow(i === 0 ? '오늘~' : `${start.getMonth() + 1}/${start.getDate()}~`, w.total, max, `${w.total.toFixed(1)}h / ${w.avail}h`, w.over)).join('');
}

function calibrationPanel() {
  const cal = calibration();
  const rows = Object.entries(cal.byType).filter(([, c]) => c.n);
  return `<div class="cal-box">
    <b>내 예상 보정</b> <span class="muted small">실제 ÷ 예상 · 자동 예상 시간에 반영</span>
    <div class="chips" style="margin-top:6px">${rows.length ? rows.map(([type, c]) => `<span class="chip-tag">${esc(type)} ×${c.ratio.toFixed(2)} <span class="muted small">(${c.n}건)</span></span>`).join('')
      : '<span class="muted small">완료 기록 없음 · 기본 ×1.00</span>'}
      <span class="chip-tag">전체 ×${cal.overall.toFixed(2)}</span></div>
  </div>`;
}

function renderStats() {
  const all = state.tasks;
  const done = all.filter((t) => t.done);
  const now = Date.now();
  if (!all.length) return '<section class="panel"><p class="empty">통계를 표시할 데이터가 없습니다.</p></section>';

  const rate = Math.round((done.length / all.length) * 100);
  const overdue = all.filter((t) => !t.done && new Date(t.due) < now).length;
  const late = done.filter((t) => t.doneAt && t.doneAt > new Date(t.due).getTime()).length;

  const subjects = [...new Set(all.map((t) => t.subject))];
  const bySub = subjects.map((s) => {
    const ts = all.filter((t) => t.subject === s);
    return { label: s, value: ts.filter((t) => t.done).length, total: ts.length };
  });


  const logMap = {};
  all.forEach((t) => t.logs.forEach((l) => { logMap[l.date] = (logMap[l.date] || 0) + l.ms; }));
  const last14 = [...Array(14)].map((_, i) => addDays(startOfDay(new Date()), -(13 - i)));
  const daily = last14.map((d) => ({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: hours(logMap[ymd(d)] || 0) }));
  const weekFrom = ymd(startOfWeek(new Date()));
  const weekMs = Object.entries(logMap).filter(([d]) => d >= weekFrom).reduce((a, [, ms]) => a + ms, 0);

  const cmp = done.filter((t) => actualMs(t) > 0).map((t) => ({ t, est: t.estHours, act: hours(actualMs(t)) }));
  const totEst = +cmp.reduce((a, c) => a + c.est, 0).toFixed(1);
  const totAct = +cmp.reduce((a, c) => a + c.act, 0).toFixed(1);

  return `
  <section class="cards">
    <div class="card stat"><div class="num">${rate}%</div><div>전체 완료율 (${done.length}/${all.length})</div></div>
    <div class="card stat"><div class="num">${hours(weekMs)}h</div><div>이번 주 집중 시간</div></div>
    <div class="card stat"><div class="num ${overdue ? 'red' : ''}">${overdue}</div><div>미제출 · 지연 완료 ${late}</div></div>
    <div class="card stat"><div class="num">×${calibration().overall.toFixed(2)}</div><div title="실제 ÷ 예상 · 1에 가까울수록 정확">예상 정확도</div></div>
  </section>
  <section class="grid2">
    <div class="panel"><h3>앞으로 7일 작업량 vs 공부 가능 시간</h3>${weekChart(weekLoad(startOfDay(new Date())))}</div>
    <div class="panel"><h3>향후 4주 작업량 (7일 단위)</h3>${futureWeeks()}<p class="muted small">남은 작업 / 공부 가능</p></div>
  </section>
  <section class="grid2">
    <div class="panel"><h3>최근 14일 학습 시간</h3>${vChart(daily, 'h')}</div>
    <div class="panel"><h3>과목별 완료</h3>${bySub.map((r) => hRow(r.label, r.value, r.total, `${r.value}/${r.total}`)).join('')}</div>
  </section>
  <section class="panel">
    <h3>완료한 과제의 예상 시간 vs 실제 작업 시간</h3>
    ${calibrationPanel()}
    ${cmp.length ? `<table class="table">
      <thead><tr><th>과제</th><th>과목</th><th>예상</th><th>실제</th><th>차이</th></tr></thead>
      <tbody>${cmp.map((c) => {
        const diff = +(c.act - c.est).toFixed(1);
        return `<tr><td>${esc(c.t.title)}</td><td>${esc(c.t.subject)}</td><td>${c.est}h</td><td>${c.act}h</td>
          <td class="${diff > 0 ? 'red' : 'green'}">${diff > 0 ? '+' : ''}${diff}h</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="empty">뽀모도로로 기록한 과제를 완료하면 비교표가 표시됩니다.</p>'}
  </section>`;
}

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

  const ws = startOfWeek(new Date());
  const weekly = [...Array(6)].map((_, i) => {
    const s = addDays(ws, -7 * (5 - i)), e = addDays(s, 7);
    return { label: `${s.getMonth() + 1}/${s.getDate()}주`, value: done.filter((t) => t.doneAt >= s.getTime() && t.doneAt < e.getTime()).length };
  });
  const monthly = [...Array(6)].map((_, i) => {
    const d = new Date();
    const s = new Date(d.getFullYear(), d.getMonth() - (5 - i), 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return { label: `${s.getMonth() + 1}월`, value: done.filter((t) => t.doneAt >= s.getTime() && t.doneAt < e.getTime()).length };
  });

  const logMap = {};
  all.forEach((t) => t.logs.forEach((l) => { logMap[l.date] = (logMap[l.date] || 0) + l.ms; }));
  const daily = [...Array(14)].map((_, i) => {
    const d = addDays(startOfDay(new Date()), -(13 - i));
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, value: hours(logMap[ymd(d)] || 0) };
  });

  const cmp = all.filter((t) => actualMs(t) > 0).map((t) => ({ t, est: t.estHours, act: hours(actualMs(t)) }));
  const totEst = +cmp.reduce((a, c) => a + c.est, 0).toFixed(1);
  const totAct = +cmp.reduce((a, c) => a + c.act, 0).toFixed(1);

  return `
  <section class="cards">
    <div class="card stat"><div class="num">${rate}%</div><div>전체 완료율 (${done.length}/${all.length})</div></div>
    <div class="card stat"><div class="num red">${overdue}</div><div>미제출 (마감 경과)</div></div>
    <div class="card stat"><div class="num orange">${late}</div><div>지연 완료</div></div>
    <div class="card stat"><div class="num">${totAct}h</div><div>기록된 작업 시간 (해당 과제 예상 ${totEst}h)</div></div>
  </section>
  <section class="grid2">
    <div class="panel"><h3>과목별 완료 현황</h3>${bySub.map((r) => hRow(r.label, r.value, r.total, `${r.value}/${r.total} 완료`)).join('')}</div>
    <div class="panel"><h3>최근 14일 학습 시간</h3>${vChart(daily, 'h')}</div>
  </section>
  <section class="grid2">
    <div class="panel"><h3>주간 완료 과제 수</h3>${vChart(weekly)}</div>
    <div class="panel"><h3>월간 완료 과제 수</h3>${vChart(monthly)}</div>
  </section>
  <section class="panel">
    <h3>예상 시간 vs 실제 작업 시간</h3>
    ${cmp.length ? `<table class="table">
      <thead><tr><th>과제</th><th>과목</th><th>예상</th><th>실제</th><th>차이</th></tr></thead>
      <tbody>${cmp.map((c) => {
        const diff = +(c.act - c.est).toFixed(1);
        return `<tr><td>${esc(c.t.title)}</td><td>${esc(c.t.subject)}</td><td>${c.est}h</td><td>${c.act}h</td>
          <td class="${diff > 0 ? 'red' : 'green'}">${diff > 0 ? '+' : ''}${diff}h</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="empty">타이머로 작업 시간을 기록하면 비교표가 표시됩니다.</p>'}
  </section>`;
}

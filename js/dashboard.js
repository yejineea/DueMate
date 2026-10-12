function miniList(list) {
  if (!list.length) return '<p class="muted small">없음</p>';
  return `<ul class="mini">${list.map((t) => `
    <li class="${t.done ? 'done' : ''}"><span>${esc(t.title)} <span class="muted small">${esc(t.subject)}</span></span>
    <span class="small ${!t.done && new Date(t.due) < Date.now() ? 'red' : ''}">${t.done ? '완료' : remainText(t.due)}</span></li>`).join('')}</ul>`;
}

function buildAlerts(wk) {
  const now = Date.now();
  const todo = state.tasks.filter((t) => !t.done);
  const alerts = [];
  const overdue = todo.filter((t) => new Date(t.due) < now);
  if (overdue.length) alerts.push({ type: 'danger', msg: `⛔ 마감이 지난 미완료 과제 ${overdue.length}개: ${overdue.map((t) => esc(t.title)).join(', ')}` });

  todo.filter((t) => { const h = (new Date(t.due) - now) / 36e5; return h > 0 && h <= state.settings.alertHours; })
    .forEach((t) => alerts.push({ type: 'warn', msg: `⏰ '${esc(t.title)}' 마감까지 ${remainText(t.due)} — 남은 작업 약 ${remainingWork(t).toFixed(1)}h` }));

  if (wk.over) {
    alerts.push({ type: 'danger', msg: `⚠️ 과부하: 이번 주 예상 작업량은 ${wk.total.toFixed(1)}시간이며, 설정한 공부 가능 시간은 ${wk.avail}시간입니다. ${(wk.total - wk.avail).toFixed(1)}시간이 부족합니다.` });
  }
  wk.days.filter((d) => d.crunch).forEach((d) => alerts.push({
    type: 'warn',
    msg: `📌 ${fmtDay(d.date)}까지 마감 과제의 누적 작업 ${d.cumLoad.toFixed(1)}h가 그때까지의 공부 가능 시간 ${d.cumAvail.toFixed(1)}h를 초과합니다. 분산 필요: ${d.tasks.map((t) => esc(t.title)).join(', ')}`,
  }));
  return alerts;
}

function weekChart(wk) {
  const max = Math.max(1, ...wk.days.map((d) => Math.max(d.load, d.avail)));
  return wk.days.map((d) => hRow(fmtDay(d.date), d.load, max, `${d.load.toFixed(1)}h / 가능 ${d.avail}h`, d.crunch)).join('')
    + '<p class="muted small">막대: 그날 마감인 과제의 남은 예상 작업 시간 · 빨간색: 마감 전까지 시간이 부족한 날짜</p>';
}

function futureWeeks() {
  const s = startOfWeek(new Date());
  const rows = [0, 1, 2, 3].map((i) => weekLoad(addDays(s, 7 * i)));
  const max = Math.max(1, ...rows.map((w) => Math.max(w.total, w.avail)));
  return rows.map((w, i) => hRow(i === 0 ? '이번 주' : `${i}주 후`, w.total, max, `${w.total.toFixed(1)}h / ${w.avail}h`, w.over)).join('');
}

function renderDashboard() {
  const now = new Date();
  const all = state.tasks;
  const todo = all.filter((t) => !t.done);
  const done = all.filter((t) => t.done);
  const todayDue = all.filter((t) => ymd(new Date(t.due)) === ymd(now));
  const upcoming = todo.filter((t) => { const h = (new Date(t.due) - now) / 36e5; return h > 0 && h <= 168; })
    .sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 6);
  const avgProg = all.length ? Math.round(all.reduce((a, t) => a + progress(t), 0) / all.length) : 0;
  const recs = recommend().slice(0, 3);
  const wk = weekLoad(startOfWeek(now));
  const alerts = buildAlerts(wk);
  const { plan, avail } = todayPlan();

  if (!all.length) {
    return `<section class="panel"><p class="empty">아직 등록된 과제가 없습니다.<br>
      상단 <b>+ 과제 추가</b>를 누르거나, 설정 탭에서 <b>샘플 데이터</b>를 불러와 보세요.</p></section>`;
  }

  return `
  ${alerts.length ? `<section class="alerts">${alerts.map((a) => `<div class="alert ${a.type}">${a.msg}</div>`).join('')}</section>` : ''}
  <section class="cards">
    <div class="card stat"><div class="num">${avgProg}%</div><div>전체 과제 진행률</div><div class="bar"><span style="width:${avgProg}%"></span></div></div>
    <div class="card stat"><div class="num">${todo.length}</div><div>미완료 과제</div></div>
    <div class="card stat"><div class="num">${done.length}</div><div>완료 과제</div></div>
    <div class="card stat"><div class="num ${wk.over ? 'red' : ''}">${wk.total.toFixed(1)}h</div><div>이번 주 작업량 / 가능 ${wk.avail}h</div></div>
  </section>
  <section class="grid2">
    <div class="panel">
      <h3>🔥 우선 처리 추천</h3>
      ${recs.length ? recs.map((r, i) => `
        <div class="rec lv-${r.p.level}">
          <b>${i + 1}. ${esc(r.t.title)}</b> <span class="badge lv-${r.p.level}">P${r.p.score}</span>
          <span class="muted small"> ${esc(r.t.subject)} · ${remainText(r.t.due)}</span>
          <p>${esc(priorityText(r.t))}</p>
        </div>`).join('') : '<p class="empty">남은 과제가 없습니다 🎉</p>'}
      <h3>🗓 오늘의 공부 계획 (가능 ${avail}h)</h3>
      ${plan.length ? `<ul class="mini">${plan.map((x) => `<li><span>${esc(x.t.title)}</span><b>${x.h.toFixed(1)}h</b></li>`).join('')}</ul>` : '<p class="muted small">배정할 작업이 없습니다.</p>'}
    </div>
    <div class="panel">
      <h3>📌 오늘 마감</h3>${miniList(todayDue)}
      <h3>⏳ 다가오는 마감 (7일)</h3>${miniList(upcoming)}
    </div>
  </section>
  <section class="panel"><h3>📅 이번 주 작업량 요약</h3>${weekChart(wk)}</section>
  <section class="panel"><h3>📈 향후 4주 작업량 vs 공부 가능 시간</h3>${futureWeeks()}</section>`;
}

// "오늘" 화면: 지금 할 일 1개 → 오늘의 시간대별 계획 → 핵심 경고 → 다음 순위·7일 내 마감
// 통계 카드와 작업량 차트는 분석 탭으로 옮겨, 첫 화면에서는 결정과 실행에 필요한 것만 보여준다.

function miniList(list) {
  if (!list.length) return '<p class="muted small">없음</p>';
  return `<ul class="mini">${list.map((t) => `
    <li><span>${esc(t.title)} <span class="muted small">${esc(t.subject)}</span></span>
    <span class="small ${new Date(t.due) < Date.now() ? 'red' : ''}">${remainText(t.due)}</span></li>`).join('')}</ul>`;
}

function buildAlerts(wk, skipId) {
  const now = Date.now();
  const todo = state.tasks.filter((t) => !t.done);
  const alerts = [];
  const overdue = todo.filter((t) => new Date(t.due) < now);
  if (overdue.length) alerts.push({ type: 'danger', msg: `마감이 지난 미완료 과제 ${overdue.length}개: ${overdue.map((t) => esc(t.title)).join(', ')}` });
  if (wk.over) {
    alerts.push({ type: 'danger', msg: `앞으로 7일 안에 마감인 작업 ${wk.total.toFixed(1)}h가 공부 가능 시간 ${wk.avail}h보다 ${(wk.total - wk.avail).toFixed(1)}h 많습니다.` });
  }
  wk.days.filter((d) => d.crunch).forEach((d) => alerts.push({
    type: 'warn',
    msg: `${fmtDay(d.date)}까지 마감 과제의 작업 ${d.cumLoad.toFixed(1)}h가 그때까지의 공부 가능 시간 ${d.cumAvail.toFixed(1)}h를 넘습니다: ${d.tasks.map((t) => esc(t.title)).join(', ')}`,
  }));
  todo.filter((t) => { const h = (new Date(t.due) - now) / 36e5; return t.id !== skipId && h > 0 && h <= state.settings.alertHours; })
    .forEach((t) => alerts.push({ type: 'warn', msg: `'${esc(t.title)}' 마감까지 ${remainText(t.due)} · 남은 작업 약 ${remainingWork(t).toFixed(1)}h` }));
  return alerts;
}

function taskPicker(recs, cur) {
  return `<label class="picker"><span class="small muted">과제 바꾸기</span>
    <select data-pick>${recs.map(({ t, p }, i) => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${i === 0 ? '★ ' : ''}${esc(t.title)} · ${esc(t.subject)} · ${remainText(t.due)} (P${p.score})</option>`).join('')}</select></label>`;
}

function heroCard(rec, recs) {
  if (!rec) {
    return `<section class="panel hero"><div class="hero-label">지금 할 일</div>
      <h2>남은 과제가 없습니다 🎉</h2><p class="muted">새 과제가 생기면 <b>+ 과제 추가</b>로 등록하세요.</p></section>`;
  }
  const { t, p } = rec;
  const next = t.subtasks.find((s) => !s.done);
  return `
  <section class="panel hero">
    <div class="hero-main">
      <div class="hero-text">
        <div class="hero-label">${rec.label} <span class="badge lv-${p.level}">P${p.score}</span></div>
        <h2>${esc(t.title)}</h2>
        <div class="muted">${esc(t.subject)} · ${fmtDue(t.due)} · <b class="${p.hoursLeft <= 0 ? 'red' : p.hoursLeft <= 24 ? 'orange' : ''}">${remainText(t.due)}</b> · 남은 작업 약 ${p.work.toFixed(1)}h</div>
        <p class="hero-why">${esc(priorityText(t))}</p>
        ${next ? `<div class="small">다음 단계: <b>${esc(next.text)}</b></div>` : ''}
        <div class="hero-tools">
          ${taskPicker(recs, t.id)}
          <button class="btn sm" data-action="toggle-done" data-id="${t.id}">완료 처리</button>
        </div>
        ${state.timer ? '<p class="muted small" style="margin:6px 0 0">집중 중에 과제를 바꾸면 지금까지의 시간은 이전 과제에 기록되고, 남은 시간은 새 과제로 이어집니다.</p>' : ''}
      </div>
      ${pomoRing(t.id)}
    </div>
  </section>`;
}

function planPanel(tp) {
  const pm = state.settings.pomodoro;
  const head = `
    <div class="toolbar">
      <h3 style="margin:0">오늘 계획</h3>
      <span class="muted small">남은 공부 가능 ${(tp.capMin / 60).toFixed(1)}h (${hm(todayEnd())}까지 · 자동 계산) · 집중 ${tp.used}회 배정 · 오늘 완료 ${todayPomos()}회</span>
      <span class="spacer"></span>
      <button class="btn xs" data-tab="settings">계산 기준</button>
    </div>`;
  const body = tp.slots.length
    ? `<div class="slots">${tp.slots.map((s) => `
      <div class="slot ${state.timer && state.timer.taskId === s.t.id ? 'active' : ''}">
        <span class="slot-time">${hm(s.start)}–${hm(s.end)}</span>
        <span class="slot-title">${esc(s.t.title)} <span class="muted small">${esc(s.t.subject)}</span></span>
        <span class="slot-pomo" title="${pm.focus}분 집중 ${s.pomos}회">🍅×${s.pomos}</span>
        <button class="btn xs" data-action="pick-task" data-id="${s.t.id}">선택</button>
      </div>`).join('')}</div>`
    : `<p class="muted small">${tp.capMin < pm.focus ? '오늘 남은 공부 가능 시간이 없습니다. 내일 계획은 자정 이후 다시 계산됩니다.' : '배정할 작업이 없습니다.'}</p>`;
  const short = tp.short.map((x) => `<div class="alert danger">'${esc(x.t.title)}' 오늘 마감까지 집중 ${x.missing}회(약 ${((x.missing * pm.focus) / 60).toFixed(1)}h)가 부족합니다. 범위를 줄이거나 다른 일정을 조정하세요.</div>`).join('');
  return `<section class="panel">${head}${body}${short ? `<div class="alerts" style="margin-top:10px">${short}</div>` : ''}
    <p class="muted small" style="margin-bottom:0">🍅 1개 = ${pm.focus}분 집중 + ${pm.short}분 휴식. 오늘 남은 공부 가능 시간을 이 단위로 나눠, 마감까지 고르게 했을 때 오늘 해야 할 몫을 먼저 배정하고 남는 시간은 우선순위가 높은 과제에 줍니다.</p></section>`;
}

// 카드에 보여 줄 과제: 집중 중인 과제 > 직접 고른 과제 > 오늘 계획 첫 슬롯 > 우선순위 1위
function focusTarget(recs, tp) {
  const find = (id) => recs.find((r) => r.t.id === id);
  if (state.timer && find(state.timer.taskId)) return { ...find(state.timer.taskId), label: '집중 중인 과제' };
  if (focusPick && find(focusPick)) return { ...find(focusPick), label: '선택한 과제' };
  focusPick = null;
  const first = tp && tp.slots.length && recs.find((r) => r.t === tp.slots[0].t);
  const top = first || recs.find((r) => r.p.work > 0) || recs[0];
  return top && { ...top, label: '지금 할 일' };
}

// 뽀모도로 탭: 지금 할 일과 원형 타이머 → 오늘 계획 → 핵심 경고 → 다음 순위·7일 내 마감 → 뽀모도로 설정
function renderFocus() {
  const all = state.tasks;
  if (!all.length) {
    return `<section class="panel hero"><div class="hero-label">시작하기</div>
      <h2>과제를 등록하면 지금 할 일을 골라 드립니다</h2>
      <p class="muted">마감일·유형·난이도를 입력하면, 시간표를 뺀 실제 빈 시간에 맞춰 오늘의 뽀모도로 계획을 짭니다.</p>
      <div class="toolbar"><button class="btn primary" data-action="new-task">+ 과제 추가</button>
      <button class="btn" data-action="load-sample">샘플 데이터로 체험</button></div></section>
      ${pomodoroSection()}`;
  }
  const now = new Date();
  const recs = recommend();
  const tp = recs.length ? planToday(Date.now(), recs) : null;
  const top = focusTarget(recs, tp);
  const rest = recs.filter((r) => !top || r.t !== top.t).slice(0, 4);
  const upcoming = all.filter((t) => { const h = (new Date(t.due) - now) / 36e5; return !t.done && h > 0 && h <= 168; })
    .sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 5);
  const alerts = buildAlerts(weekLoad(startOfDay(now)), top && top.t.id);
  const shown = alerts.slice(0, 3);

  return `
  ${heroCard(top, recs)}
  ${tp ? planPanel(tp) : ''}
  ${shown.length ? `<section class="alerts">${shown.map((a) => `<div class="alert ${a.type}">${a.msg}</div>`).join('')}
    ${alerts.length > shown.length ? `<div class="muted small">외 경고 ${alerts.length - shown.length}건 · 리포트 탭에서 주간 작업량을 확인하세요</div>` : ''}</section>` : ''}
  <section class="grid2">
    <div class="panel">
      <h3>다음 순위</h3>
      ${rest.length ? `<ul class="mini">${rest.map(({ t, p }) => `
        <li><span>${esc(t.title)} <span class="badge lv-${p.level}">P${p.score}</span> <span class="muted small">${esc(t.subject)} · ${remainText(t.due)}</span></span>
        <button class="btn xs" data-action="pick-task" data-id="${t.id}">선택</button></li>`).join('')}</ul>` : '<p class="muted small">없음</p>'}
    </div>
    <div class="panel"><h3>7일 내 마감</h3>${miniList(upcoming)}</div>
  </section>
  ${pomodoroSection()}`;
}

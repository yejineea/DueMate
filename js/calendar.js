const cal = { cursor: new Date(), mode: 'month', selected: ymd(new Date()) };

const tasksOn = (dateStr) => state.tasks.filter((t) => ymd(new Date(t.due)) === dateStr);

function calMove(dir) {
  const c = cal.cursor;
  cal.cursor = cal.mode === 'month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, 7 * dir);
  render();
}
function calToday() { cal.cursor = new Date(); cal.selected = ymd(new Date()); render(); }
function calSetMode(mode) { cal.mode = mode; cal.cursor = new Date(`${cal.selected}T00:00`); render(); }

function renderCalendar() {
  const c = cal.cursor;
  const days = [];
  let title;
  if (cal.mode === 'month') {
    const start = startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1));
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
    title = `${c.getFullYear()}년 ${c.getMonth() + 1}월`;
  } else {
    const s = startOfWeek(c);
    for (let i = 0; i < 7; i++) days.push(addDays(s, i));
    title = `${fmtDay(s)} ~ ${fmtDay(addDays(s, 6))}`;
  }
  const today = ymd(new Date());
  const limit = cal.mode === 'month' ? 3 : 12;
  const selected = tasksOn(cal.selected);

  const cells = days.map((d) => {
    const ds = ymd(d);
    const ts = tasksOn(ds).sort((a, b) => new Date(a.due) - new Date(b.due));
    const pending = ts.filter((t) => !t.done).length;
    const other = cal.mode === 'month' && d.getMonth() !== c.getMonth();
    return `
      <div class="cal-cell ${other ? 'other' : ''} ${ds === today ? 'today' : ''} ${ds === cal.selected ? 'selected' : ''} ${pending >= 2 ? 'clash' : ''}"
           data-action="cal-select" data-date="${ds}">
        <div class="cal-date">${d.getDate()} ${pending >= 2 ? '<span class="clash-tag">겹침</span>' : ''}</div>
        ${ts.slice(0, limit).map((t) => `<div class="chip ${t.done ? 'done' : ''} ${t.type === '시험' ? 'exam' : ''}" title="${esc(t.title)}">${esc(t.title)}</div>`).join('')}
        ${ts.length > limit ? `<div class="muted small">+${ts.length - limit}개</div>` : ''}
      </div>`;
  }).join('');

  return `
  <section class="panel">
    <div class="toolbar">
      <button class="btn" data-action="cal-prev">◀</button>
      <h3 class="cal-title">${title}</h3>
      <button class="btn" data-action="cal-next">▶</button>
      <button class="btn" data-action="cal-today">오늘</button>
      <span class="spacer"></span>
      <button class="btn ${cal.mode === 'month' ? 'primary' : ''}" data-action="cal-mode" data-mode="month">월간</button>
      <button class="btn ${cal.mode === 'week' ? 'primary' : ''}" data-action="cal-mode" data-mode="week">주간</button>
    </div>
    <div class="cal-grid ${cal.mode}">
      ${WEEKDAYS.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    <p class="muted small">파란색: 과제 · 빨간색: 시험 · 회색 취소선: 완료 · <span class="orange">겹침</span>: 미완료 마감이 2개 이상</p>
  </section>
  <section class="panel">
    <div class="toolbar">
      <h3 style="margin:0">${fmtDay(new Date(`${cal.selected}T00:00`))} 일정</h3>
      <span class="spacer"></span>
      <button class="btn sm" data-action="new-task" data-date="${cal.selected}">+ 이 날짜에 과제/시험 추가</button>
    </div>
    ${selected.length ? `<div class="task-list">${selected.map(taskCard).join('')}</div>` : '<p class="empty">이 날짜에 일정이 없습니다.</p>'}
  </section>`;
}

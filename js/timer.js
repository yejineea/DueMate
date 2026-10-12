function timerElapsed() {
  const tm = state.timer;
  if (!tm) return 0;
  return tm.acc + (tm.startedAt ? Date.now() - tm.startedAt : 0);
}

function timerStart(id) {
  if (state.timer && state.timer.taskId !== id) {
    if (!confirm('진행 중인 타이머를 기록·종료하고 새 타이머를 시작할까요?')) return;
    timerStop();
  }
  if (!state.timer) state.timer = { taskId: id, startedAt: Date.now(), acc: 0 };
  else if (!state.timer.startedAt) state.timer.startedAt = Date.now();
  save(); renderTimerBar();
}

function timerPause() {
  const tm = state.timer;
  if (tm && tm.startedAt) {
    tm.acc += Date.now() - tm.startedAt;
    tm.startedAt = null;
    save(); renderTimerBar();
  }
}

function timerStop() {
  const tm = state.timer;
  if (!tm) return;
  const ms = timerElapsed();
  const t = getTask(tm.taskId);
  if (t && ms >= 1000) {
    t.logs.push({ date: ymd(new Date()), ms });
    toast(`${fmtDur(ms)} 작업 시간이 기록되었습니다`);
  }
  state.timer = null;
  save(); render();
}

function renderTimerBar() {
  const bar = $('#timerbar');
  const tm = state.timer;
  if (!tm) { bar.classList.add('hidden'); return; }
  const t = getTask(tm.taskId);
  if (!t) { state.timer = null; save(); bar.classList.add('hidden'); return; }
  const total = actualMs(t) + timerElapsed();
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <span>⏱ <b>${esc(t.title)}</b></span>
    <span id="timer-time" class="mono">${fmtDur(timerElapsed())}</span>
    <span class="muted small" id="timer-total">누적 ${hours(total)}h / 예상 ${t.estHours}h</span>
    ${tm.startedAt
      ? '<button class="btn sm" data-action="timer-pause">일시정지</button>'
      : `<button class="btn sm primary" data-action="timer-start" data-id="${t.id}">재개</button>`}
    <button class="btn sm danger" data-action="timer-stop">종료·기록</button>`;
}

setInterval(() => {
  const el = $('#timer-time');
  if (el && state.timer && state.timer.startedAt) el.textContent = fmtDur(timerElapsed());
}, 1000);

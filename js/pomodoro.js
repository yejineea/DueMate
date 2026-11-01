// 뽀모도로: 집중 → 짧은 휴식 → … → (N회마다) 긴 휴식.
// 집중 시간은 과제의 작업 기록(logs)에 자동 저장되어 남은 작업량과 추천 순위에 바로 반영된다.
// state.timer = { taskId, phase, dur, endsAt(진행 중) | left(일시정지), count(이번 세션 완료 집중 수) }

const PHASES = { focus: '집중', short: '짧은 휴식', long: '긴 휴식' };
const phaseMs = (phase) => state.settings.pomodoro[phase] * MIN;

function pomoLeft(now = Date.now()) {
  const tm = state.timer;
  if (!tm) return 0;
  return tm.endsAt ? Math.max(0, tm.endsAt - now) : tm.left;
}

function pomoBegin(taskId, now = Date.now()) {
  const dur = phaseMs('focus');
  state.timer = { taskId, phase: 'focus', dur, endsAt: now + dur, left: null, count: 0 };
}

function pomoPause(now = Date.now()) {
  const tm = state.timer;
  if (!tm || !tm.endsAt) return;
  tm.left = pomoLeft(now);
  tm.endsAt = null;
}

function pomoResume(now = Date.now()) {
  const tm = state.timer;
  if (!tm || tm.endsAt) return;
  tm.endsAt = now + tm.left;
  tm.left = null;
}

function logFocus(taskId, ms, now, pomo) {
  const t = getTask(taskId);
  if (!t || ms < MIN) return 0;
  t.logs.push(pomo ? { date: ymd(new Date(now)), ms: Math.round(ms), pomo: 1 } : { date: ymd(new Date(now)), ms: Math.round(ms) });
  return ms;
}

// 현재 단계를 끝내고 다음 단계로 넘어간다. 집중이 끝나면 기록하고 휴식을 바로 시작한다.
// 숨긴 탭은 브라우저가 타이머를 최대 1분까지 늦추므로 그 정도 지연은 원래 종료 시각에 이어서 진행하고,
// 탭이 닫혀 있는 동안 끝난 경우(3분 이상 지남)에는 다음 단계를 자동으로 시작하지 않는다.
const LATE_MS = 3 * MIN;
function pomoAdvance(now = Date.now()) {
  const tm = state.timer;
  const pm = state.settings.pomodoro;
  const endedAt = tm.endsAt ? Math.min(now, tm.endsAt) : now;
  const late = now - endedAt > LATE_MS;
  const from = tm.phase;
  let logged = 0;
  if (from === 'focus') {
    logged = logFocus(tm.taskId, tm.dur - pomoLeft(now), endedAt, true);
    tm.count++;
    tm.phase = tm.count % pm.longEvery === 0 ? 'long' : 'short';
  } else {
    tm.phase = 'focus';
  }
  tm.dur = phaseMs(tm.phase);
  const auto = !late && (tm.phase !== 'focus' || pm.autoFocus);
  tm.endsAt = auto ? endedAt + tm.dur : null;
  tm.left = auto ? null : tm.dur;
  return { from, to: tm.phase, logged };
}

// 과제별 타이머: 각 과제는 자기 타이머를 가진다. 다른 과제를 시작하면 지금 타이머는 남은 시간 그대로
// 일시정지되어 보관(state.timers)되고, 그 과제로 돌아와 재개하면 이어서 진행된다. 동시에 도는 타이머는 하나뿐이다.
const timerOf = (id) => (state.timer && state.timer.taskId === id ? state.timer : state.timers[id] || null);

function activateTimer(id, now = Date.now()) {
  const cur = state.timer;
  if (cur && cur.taskId === id) return cur;
  if (cur) { pomoPause(now); state.timers[cur.taskId] = cur; }
  state.timer = state.timers[id] || null;
  delete state.timers[id];
  return state.timer;
}

// 특정 과제의 타이머 중지 (보관 중인 타이머도). 진행 중인 다른 과제 타이머에는 영향 없음
function stopTimerOf(id, now = Date.now()) {
  if (state.timer && state.timer.taskId === id) return pomoStop(now);
  const tm = state.timers[id];
  if (!tm) return 0;
  const ms = tm.phase === 'focus' ? logFocus(id, tm.dur - tm.left, now, false) : 0;
  delete state.timers[id];
  return ms;
}

// 중단: 집중 중이었다면 지금까지 집중한 시간(1분 이상)만 기록한다
function pomoStop(now = Date.now()) {
  const tm = state.timer;
  if (!tm) return 0;
  const ms = tm.phase === 'focus' ? logFocus(tm.taskId, tm.dur - pomoLeft(now), now, false) : 0;
  state.timer = null;
  return ms;
}

// 집중을 마친 과제에 남은 단계가 있으면 "이 단계 끝냈나요?"를 슬라이드에 띄운다
function askStep(taskId) {
  const t = getTask(taskId);
  const next = t && t.subtasks.find((s) => !s.done);
  stepAsk = next ? { taskId, sid: next.id } : null;
}

const todayPomos = () => state.tasks.reduce((a, t) => a + pomoCount(t, ymd(new Date())), 0);

// ---- 화면 · 알림 ----

let audioCtx = null;
function primeAlerts() {
  const pm = state.settings.pomodoro;
  try {
    if (pm.sound && !audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { audioCtx = null; }
  if (pm.notify && 'Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) { /* 지원하지 않는 환경 */ }
  }
}

function beep() {
  if (!state.settings.pomodoro.sound || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  [0, 0.35, 0.7].forEach((d) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t0 + d);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.25);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0 + d);
    osc.stop(t0 + d + 0.3);
  });
}

function notifyPhase(ev) {
  const pm = state.settings.pomodoro;
  const msg = ev.from === 'focus'
    ? `집중 ${pm.focus}분 완료! ${PHASES[ev.to]} ${pm[ev.to]}분${state.timer.endsAt ? '을 시작합니다' : ''}`
    : '휴식이 끝났습니다. 다음 집중을 시작하세요';
  toast(msg);
  beep();
  if (pm.notify && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('DueMate 뽀모도로', { body: msg }); } catch (e) { /* 모바일 등 미지원 */ }
  }
}

// 시작·재개: 그 과제의 타이머를 꺼내 진행 (다른 과제 타이머는 일시정지해 보관). 뽀모도로 탭으로 이동한다.
function startPomodoro(id) {
  const prev = state.timer && state.timer.endsAt && state.timer.taskId !== id ? getTask(state.timer.taskId) : null;
  if (activateTimer(id)) pomoResume();
  else pomoBegin(id);
  if (prev) toast(`'${prev.title}' 타이머는 남은 시간 그대로 일시정지해 두었습니다`);
  focusPick = id;
  primeAlerts();
  currentTab = 'pomodoro';
  save(); render();
}

let focusPick = null; // 뽀모도로 탭에서 보고 있는 과제 (없으면 오늘 계획 첫 과제)

function pickTask(id) {
  if (!id) return;
  focusPick = id;
  currentTab = 'pomodoro';
  render();
}

function pausePomodoro() { pomoPause(); save(); render(); }
function resumePomodoro(id) { startPomodoro(id || state.timer.taskId); }
function skipBreak() { pomoAdvance(); save(); render(); }

function stopPomodoro(id) {
  const ms = stopTimerOf(id || (state.timer && state.timer.taskId));
  if (ms) toast(`집중한 ${Math.round(ms / MIN)}분이 기록되었습니다`);
  save(); render();
}

const RING_R = 118, RING_C = 2 * Math.PI * RING_R, OUTER_R = 134, OUTER_C = 2 * Math.PI * OUTER_R;

// 과제 슬라이드 가운데의 큰 원형 타이머. 버튼은 원 안에 있고, 바깥 얇은 링은 그 과제의 '기록 ÷ 예상' 진행률이다.
function pomoRing(taskId) {
  const pm = state.settings.pomodoro;
  const t = getTask(taskId);
  const tm = timerOf(taskId);
  const phase = tm ? tm.phase : 'focus';
  const dur = tm ? tm.dur : phaseMs('focus');
  const left = tm ? (tm === state.timer ? pomoLeft() : tm.left) : dur;
  const running = !!(tm && tm.endsAt);
  const waiting = tm && phase === 'focus' && !running && tm.left === tm.dur && tm.count > 0;
  const label = !tm ? `${pm.focus}분 집중`
    : running ? (phase === 'focus' ? `집중 · ${tm.count + 1}회차` : PHASES[phase])
    : waiting ? '휴식 끝' : `${PHASES[phase]} · 일시정지`;
  const btn = (action, text, main = false) => `<button class="ring-btn ${main ? 'main' : ''}" data-action="${action}" data-id="${taskId}">${text}</button>`;
  let buttons = btn('pomo-start', '▶ 시작', true);
  if (tm) {
    buttons = running
      ? (phase === 'focus' ? btn('pomo-pause', '❚❚ 일시정지') : btn('pomo-skip', '⏭ 건너뛰기')) + btn('pomo-stop', '■ 중지')
      : btn('pomo-resume', waiting ? '▶ 집중 시작' : '▶ 재개', true) + btn('pomo-stop', '■ 중지');
  }
  const doneH = actualMs(t) / HOUR;
  const prog = t.estHours > 0 ? Math.min(1, doneH / t.estHours) : 0;
  return `
    <div class="pomo phase-${tm ? phase : 'idle'} ${running ? 'running' : ''}">
      <div class="pomo-ring">
        <svg viewBox="0 0 280 280" aria-hidden="true">
          <circle class="ring-outer-bg" cx="140" cy="140" r="${OUTER_R}"></circle>
          <circle class="ring-outer" cx="140" cy="140" r="${OUTER_R}" stroke-dasharray="${OUTER_C}" stroke-dashoffset="${OUTER_C * (1 - prog)}"></circle>
          <circle class="ring-bg" cx="140" cy="140" r="${RING_R}"></circle>
          <circle class="ring-fg" data-ring-fg="${taskId}" cx="140" cy="140" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C * (left / dur)}"></circle>
        </svg>
        <div class="pomo-center">
          <span class="pomo-label">${label}</span>
          <span class="pomo-time" data-ring-time="${taskId}">${fmtClock(left)}</span>
          <div class="ring-btns">${buttons}</div>
        </div>
      </div>
      <div class="pomo-meta">🍅 ${pomoCount(t)}회 · 기록 ${hours(actualMs(t))}h / 예상 ${t.estHours}h${t.estAuto ? ' (자동)' : ''}</div>
    </div>`;
}

// 다른 탭에 있을 때는 상단에 남은 시간만 작게 보여 주고, 누르면 "오늘" 화면으로 간다
function renderPomoChip() {
  if (state.timer && !getTask(state.timer.taskId)) { state.timer = null; save(); }
  const chip = $('#pomo-chip');
  if (chip) chip.hidden = !state.timer || currentTab === 'pomodoro';
  if (!state.timer) return;
  updateTimerClock();
}

function updateTimerClock() {
  const tm = state.timer;
  if (!tm) return;
  const left = pomoLeft();
  const text = fmtClock(left);
  const el = $(`[data-ring-time="${tm.taskId}"]`);
  if (el) el.textContent = text;
  const ring = $(`[data-ring-fg="${tm.taskId}"]`);
  if (ring) ring.style.strokeDashoffset = RING_C * (left / tm.dur);
  const chip = $('#pomo-chip');
  if (chip) { chip.textContent = `🍅 ${text} ${PHASES[tm.phase]}`; chip.className = `pomo-chip phase-${tm.phase}`; }
}

setInterval(() => {
  const tm = state.timer;
  if (!tm) return;
  if (tm.endsAt && Date.now() >= tm.endsAt) {
    const ev = pomoAdvance();
    if (ev.from === 'focus') askStep(tm.taskId);
    save();
    notifyPhase(ev);
    const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
    if (typing) renderPomoChip(); else render();
    return;
  }
  updateTimerClock();
}, 1000);

// 뽀모도로: 집중 → 짧은 휴식 → … → (N회마다) 긴 휴식.
// 집중 시간은 과제의 작업 기록(logs)에 자동 저장되어 남은 작업량과 추천 순위에 바로 반영된다.
// state.timer = { taskId, phase, dur, endsAt(진행 중) | left(일시정지), count(이번 세션 완료 집중 수) }

const PHASES = { focus: '집중', short: '짧은 휴식', long: '긴 휴식' };
const BASE_TITLE = document.title;
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

// 과제 전환: 지금까지 집중한 시간은 이전 과제에 기록하고, 남은 시간은 새 과제의 집중으로 이어 간다
function pomoSwitch(taskId, now = Date.now()) {
  const tm = state.timer;
  if (!tm || tm.taskId === taskId) return 0;
  let ms = 0;
  if (tm.phase === 'focus') {
    const left = pomoLeft(now);
    ms = logFocus(tm.taskId, tm.dur - left, now, false);
    tm.dur = left;
    if (!tm.endsAt) tm.left = left;
  }
  tm.taskId = taskId;
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

// 시작하면 원형 타이머가 있는 뽀모도로 탭으로 이동한다. 다른 과제가 진행 중이면 남은 시간을 이어서 전환한다.
function startPomodoro(id) {
  const tm = state.timer;
  if (tm && tm.taskId === id) pomoResume();
  else if (tm) switchTask(id, false);
  else pomoBegin(id);
  focusPick = id;
  primeAlerts();
  currentTab = 'pomodoro';
  save(); render();
}

let focusPick = null; // 뽀모도로 탭에서 사용자가 고른 과제 (없으면 오늘 계획 첫 슬롯)

function switchTask(id, rerender = true) {
  const ms = pomoSwitch(id);
  toast(ms ? `이전 과제에 ${Math.round(ms / MIN)}분을 기록하고, 남은 시간은 이 과제로 이어 갑니다` : '남은 시간을 이 과제로 이어 갑니다');
  if (rerender) { save(); render(); }
}

// 과제 선택: 타이머가 돌고 있으면 바로 전환, 아니면 시작할 과제로 지정
function pickTask(id) {
  if (!id) return;
  if (state.timer && state.timer.taskId !== id) switchTask(id, false);
  focusPick = id;
  currentTab = 'pomodoro';
  save(); render();
}

function pausePomodoro() { pomoPause(); save(); render(); }
function resumePomodoro() { pomoResume(); primeAlerts(); save(); render(); }
function skipBreak() { pomoAdvance(); save(); render(); }

function stopPomodoro() {
  const ms = pomoStop();
  if (ms) toast(`집중한 ${Math.round(ms / MIN)}분이 기록되었습니다`);
  save(); render();
}

const RING_C = 2 * Math.PI * 54;

// "지금 할 일" 카드 오른쪽의 원형 타이머와 시작·일시정지·중지 버튼
function pomoRing(taskId) {
  const pm = state.settings.pomodoro;
  const tm = state.timer && state.timer.taskId === taskId ? state.timer : null;
  const phase = tm ? tm.phase : 'focus';
  const dur = tm ? tm.dur : phaseMs('focus');
  const left = tm ? pomoLeft() : dur;
  const running = !!(tm && tm.endsAt);
  const waiting = tm && phase === 'focus' && !running && tm.left === tm.dur && tm.count > 0;
  const label = !tm ? `${pm.focus}분 집중`
    : `${PHASES[phase]}${phase === 'focus' ? ` · ${tm.count + 1}회차` : ''}${running || waiting ? '' : ' · 일시정지'}`;
  let buttons = `<button class="btn primary" data-action="pomo-start" data-id="${taskId}">▶ 시작</button>`;
  if (tm) {
    const main = running
      ? (phase === 'focus' ? '<button class="btn" data-action="pomo-pause">일시정지</button>'
        : '<button class="btn" data-action="pomo-skip">휴식 건너뛰기</button>')
      : `<button class="btn primary" data-action="pomo-resume">▶ ${waiting ? '집중 시작' : '재개'}</button>`;
    buttons = `${main}<button class="btn danger" data-action="pomo-stop">중지</button>`;
  }
  return `
    <div class="pomo phase-${tm ? phase : 'idle'}">
      <div class="pomo-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-bg" cx="60" cy="60" r="54"></circle>
          <circle id="timer-ring" class="ring-fg" cx="60" cy="60" r="54" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C * (left / dur)}"></circle>
        </svg>
        <div class="pomo-center">
          <span id="timer-time" class="pomo-time">${fmtClock(left)}</span>
          <span class="pomo-label">${label}</span>
        </div>
      </div>
      <div class="pomo-buttons">${buttons}</div>
      <div class="muted small">오늘 완료 🍅 ${todayPomos()}</div>
    </div>`;
}

// 다른 탭에 있을 때는 상단에 남은 시간만 작게 보여 주고, 누르면 "오늘" 화면으로 간다
function renderPomoChip() {
  if (state.timer && !getTask(state.timer.taskId)) { state.timer = null; save(); }
  const chip = $('#pomo-chip');
  if (chip) chip.hidden = !state.timer || currentTab === 'pomodoro';
  if (!state.timer) { document.title = BASE_TITLE; return; }
  updateTimerClock();
}

function updateTimerClock() {
  const tm = state.timer;
  if (!tm) return;
  const left = pomoLeft();
  const text = fmtClock(left);
  const el = $('#timer-time');
  if (el) el.textContent = text;
  const ring = $('#timer-ring');
  if (ring) ring.style.strokeDashoffset = RING_C * (left / tm.dur);
  const chip = $('#pomo-chip');
  if (chip) { chip.textContent = `🍅 ${text} ${PHASES[tm.phase]}`; chip.className = `pomo-chip phase-${tm.phase}`; }
  document.title = `${tm.endsAt ? '' : '⏸ '}${text} ${PHASES[tm.phase]} · DueMate`;
}

setInterval(() => {
  const tm = state.timer;
  if (!tm) return;
  if (tm.endsAt && Date.now() >= tm.endsAt) {
    const ev = pomoAdvance();
    save();
    notifyPhase(ev);
    const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
    if (typing) renderPomoChip(); else render();
    return;
  }
  updateTimerClock();
}, 1000);

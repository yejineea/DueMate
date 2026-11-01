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
// 탭이 닫혀 있는 동안 끝났다면(1분 이상 지남) 다음 단계는 자동으로 시작하지 않는다.
function pomoAdvance(now = Date.now()) {
  const tm = state.timer;
  const pm = state.settings.pomodoro;
  const late = tm.endsAt && now - tm.endsAt > MIN;
  const from = tm.phase;
  let logged = 0;
  if (from === 'focus') {
    logged = logFocus(tm.taskId, tm.dur - pomoLeft(now), now, true);
    tm.count++;
    tm.phase = tm.count % pm.longEvery === 0 ? 'long' : 'short';
  } else {
    tm.phase = 'focus';
  }
  tm.dur = phaseMs(tm.phase);
  const auto = !late && (tm.phase !== 'focus' || pm.autoFocus);
  tm.endsAt = auto ? now + tm.dur : null;
  tm.left = auto ? null : tm.dur;
  return { from, to: tm.phase, logged };
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

function startPomodoro(id) {
  const tm = state.timer;
  if (tm && tm.taskId === id) { pomoResume(); primeAlerts(); save(); render(); return; }
  if (tm && !confirm('진행 중인 뽀모도로를 끝내고 이 과제로 시작할까요? (집중한 시간은 기록됩니다)')) return;
  if (tm) pomoStop();
  pomoBegin(id);
  primeAlerts();
  save(); render();
}

function pausePomodoro() { pomoPause(); save(); renderTimerBar(); }
function resumePomodoro() { pomoResume(); primeAlerts(); save(); renderTimerBar(); }
function skipBreak() { pomoAdvance(); save(); render(); }

function stopPomodoro() {
  const ms = pomoStop();
  if (ms) toast(`집중한 ${Math.round(ms / MIN)}분이 기록되었습니다`);
  save(); render();
}

function renderTimerBar() {
  const bar = $('#timerbar');
  const tm = state.timer;
  const t = tm && getTask(tm.taskId);
  if (tm && !t) { state.timer = null; save(); }
  if (!t) { bar.classList.add('hidden'); document.title = BASE_TITLE; return; }
  const running = !!tm.endsAt;
  const waiting = tm.phase === 'focus' && !running && tm.left === tm.dur && tm.count > 0;
  const next = tm.phase === 'focus' ? t.subtasks.find((s) => !s.done) : null;
  bar.className = `timerbar phase-${tm.phase}`;
  bar.innerHTML = `
    <div class="tb-info">
      <span class="tb-phase">${PHASES[tm.phase]}${tm.phase === 'focus' ? ` · ${tm.count + 1}회차` : ''}</span>
      <b class="tb-title">${esc(t.title)}</b>
      ${next ? `<span class="muted small">다음 할 일: ${esc(next.text)}</span>` : ''}
    </div>
    <div class="tb-clock">
      <span id="timer-time" class="mono">${fmtClock(pomoLeft())}</span>
      <div class="tb-track"><div id="timer-prog"></div></div>
    </div>
    <span class="muted small">오늘 🍅 ${todayPomos()}</span>
    <div class="tb-actions">
      ${running ? '<button class="btn sm" data-action="pomo-pause">일시정지</button>'
        : `<button class="btn sm primary" data-action="pomo-resume">${waiting ? '집중 시작' : '재개'}</button>`}
      ${tm.phase !== 'focus' ? '<button class="btn sm" data-action="pomo-skip">휴식 건너뛰기</button>' : ''}
      <button class="btn sm danger" data-action="pomo-stop">종료</button>
    </div>`;
  updateTimerClock();
}

function updateTimerClock() {
  const tm = state.timer;
  const el = $('#timer-time');
  if (!tm || !el) return;
  const left = pomoLeft();
  el.textContent = fmtClock(left);
  $('#timer-prog').style.width = `${100 - (left / tm.dur) * 100}%`;
  document.title = `${tm.endsAt ? '' : '⏸ '}${fmtClock(left)} ${PHASES[tm.phase]} · DueMate`;
}

setInterval(() => {
  const tm = state.timer;
  if (!tm) return;
  if (tm.endsAt && Date.now() >= tm.endsAt) {
    const ev = pomoAdvance();
    save();
    notifyPhase(ev);
    const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
    if (typing) renderTimerBar(); else render();
    return;
  }
  updateTimerClock();
}, 1000);

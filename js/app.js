const VIEWS = { pomodoro: 'renderFocus', todo: 'renderTodo', report: 'renderAnalytics', settings: 'renderSettings' };
const TAB_ALIAS = { today: 'pomodoro', tasks: 'todo', calendar: 'todo', analytics: 'report' };
let currentTab = TAB_ALIAS[params.get('tab')] || (VIEWS[params.get('tab')] ? params.get('tab') : 'pomodoro');

function render() {
  const fn = window[VIEWS[currentTab]];
  $('#view').innerHTML = typeof fn === 'function' ? fn() : '<section class="panel"><p class="empty">준비 중인 기능입니다.</p></section>';
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
  renderPomoChip();
}

function applyTheme() { document.documentElement.dataset.theme = state.settings.theme; }
function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').classList.remove('hidden'); $('#modal-box input')?.focus(); }
function closeModal() { $('#modal').classList.add('hidden'); }

const actions = {
  'new-task': (el) => openTaskForm(null, el.dataset.date),
  'edit-task': (el) => openTaskForm(el.dataset.id),
  'delete-task': (el) => deleteTask(el.dataset.id),
  'toggle-done': (el) => toggleDone(el.dataset.id),
  'toggle-open': (el) => { const id = el.dataset.id; taskUI.open.has(id) ? taskUI.open.delete(id) : taskUI.open.add(id); render(); },
  'toggle-sub': (el) => toggleSub(el.dataset.id, el.dataset.sid),
  'edit-sub': (el) => editSub(el.dataset.id, el.dataset.sid),
  'del-sub': (el) => delSub(el.dataset.id, el.dataset.sid),
  'fill-template': () => fillTemplate(),
  'close-modal': () => closeModal(),
  'pomo-start': (el) => startPomodoro(el.dataset.id),
  'pomo-pause': () => pausePomodoro(),
  'pomo-resume': () => resumePomodoro(),
  'pomo-skip': () => skipBreak(),
  'pomo-stop': () => stopPomodoro(),
  'cal-prev': () => calMove(-1),
  'cal-next': () => calMove(1),
  'cal-today': () => calToday(),
  'cal-mode': (el) => calSetMode(el.dataset.mode),
  'cal-select': (el) => { cal.selected = el.dataset.date; render(); },
  'del-grade': (el) => delGrade(el.dataset.gid),
  'del-schedule': (el) => delSchedule(el.dataset.sid),
  'hours-mode': (el) => setHoursMode(el.dataset.mode),
  'analytics-view': (el) => { analyticsView = el.dataset.view; render(); },
  'todo-view': (el) => { todoView = el.dataset.view; render(); },
  'pick-task': (el) => pickTask(el.dataset.id),
  'del-subject': (el) => delSubject(el.dataset.name),
  'export-json': () => exportJSON(),
  'export-csv': () => exportCSV(),
  'import-json': () => $('#import-file').click(),
  'load-sample': () => loadSample(),
  'reset-data': () => resetData(),
};

const forms = {
  task: (f) => saveTaskForm(f),
  'add-sub': (f) => addSub(f.dataset.id, new FormData(f).get('text')),
  'add-grade': (f) => addGrade(f),
  'add-schedule': (f) => addSchedule(f),
  'add-subject': (f) => addSubject(new FormData(f).get('subject')),
};

function onFilterChange(el) {
  const key = el.dataset.filter;
  if (key === 'grade-subject') gradeSubject = el.value;
  else taskUI[key] = el.value;
  render();
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { currentTab = tab.dataset.tab; render(); return; }
  if (e.target.id === 'modal') { closeModal(); return; }
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});

document.addEventListener('submit', (e) => {
  const kind = e.target.dataset.form;
  if (!kind || !forms[kind]) return;
  e.preventDefault();
  forms[kind](e.target);
});

// 과제 입력 화면의 자동 예상 시간 갱신
document.addEventListener('input', (e) => { if (e.target.form && e.target.form.dataset.form === 'task') onTaskFormInput(e.target); });

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.form && el.form.dataset.form === 'task') return onTaskFormInput(el);
  if (el.dataset.pick !== undefined) return pickTask(el.value);
  if (el.dataset.filter) return onFilterChange(el);
  if (el.dataset.grade) return onGradeChange(el);
  if (el.dataset.setting) return onSettingChange(el);
  if (el.id === 'import-file') return importJSON(el.files[0]);
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// 남은 시간 표시 갱신 (입력 중이거나 모달이 열려 있으면 건너뜀)
setInterval(() => {
  const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
  if (['pomodoro', 'todo'].includes(currentTab) && $('#modal').classList.contains('hidden') && !typing) render();
}, 60000);

// 데모 + &pomo: 지금 할 일(오늘 계획 첫 슬롯)의 뽀모도로가 진행 중인 화면 (스크린샷·체험용)
if (DEMO && params.has('pomo') && recommend().length) {
  const first = planToday().slots[0];
  pomoBegin(first ? first.t.id : recommend()[0].t.id, Date.now() - 12 * MIN);
  state.timer.count = 2;
}

if (DEMO) $('.topbar h1').insertAdjacentHTML('beforeend', ' <span class="badge" title="샘플 데이터로 보여주며 변경 사항은 저장되지 않습니다">데모 · 저장 안 됨</span>');
applyTheme();
render();
// 데모 + &form: 과제 추가 화면을 연 상태 (자동 예상 시간 확인·스크린샷용)
if (DEMO && params.has('form')) openTaskForm(null);

let currentTab = 'dashboard';
const VIEWS = {
  dashboard: 'renderDashboard', tasks: 'renderTasks', calendar: 'renderCalendar',
  stats: 'renderStats', grades: 'renderGrades', settings: 'renderSettings',
};

function render() {
  const fn = window[VIEWS[currentTab]];
  $('#view').innerHTML = typeof fn === 'function' ? fn() : '<section class="panel"><p class="empty">준비 중인 기능입니다.</p></section>';
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
  if (typeof renderTimerBar === 'function') renderTimerBar();
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
  'timer-start': (el) => timerStart(el.dataset.id),
  'timer-pause': () => timerPause(),
  'timer-stop': () => timerStop(),
  'cal-prev': () => calMove(-1),
  'cal-next': () => calMove(1),
  'cal-today': () => calToday(),
  'cal-mode': (el) => calSetMode(el.dataset.mode),
  'cal-select': (el) => { cal.selected = el.dataset.date; render(); },
  'del-grade': (el) => delGrade(el.dataset.gid),
  'del-schedule': (el) => delSchedule(el.dataset.sid),
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

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.filter) return onFilterChange(el);
  if (el.dataset.grade) return onGradeChange(el);
  if (el.dataset.setting) return onSettingChange(el);
  if (el.id === 'import-file') return importJSON(el.files[0]);
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// 남은 시간 표시 갱신 (입력 중이거나 모달이 열려 있으면 건너뜀)
setInterval(() => {
  const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
  if (['dashboard', 'tasks', 'calendar'].includes(currentTab) && $('#modal').classList.contains('hidden') && !typing) render();
}, 60000);

applyTheme();
render();

const fmtH = (h) => `${+h.toFixed(1)}h`;

function studyTimeSection() {
  const s = state.settings;
  const manual = s.hoursMode === 'manual';
  const ws = startOfWeek(new Date());
  const days = WEEKDAYS.map((d, i) => ({ d, i, c: dayCapacity(addDays(ws, i)) }));
  const recent = recentStudyAvg();
  const sched = [...state.schedule].sort((a, b) => a.start.localeCompare(b.start));
  return `
  <section class="panel">
    <div class="toolbar">
      <h3 style="margin:0">공부 가능 시간</h3>
      <span class="spacer"></span>
      <div class="seg">
        <button class="${manual ? '' : 'on'}" data-action="hours-mode" data-mode="auto">자동 계산</button>
        <button class="${manual ? 'on' : ''}" data-action="hours-mode" data-mode="manual">직접 입력</button>
      </div>
    </div>
    ${manual ? '<p class="muted small">요일별 공부 가능 시간을 직접 입력합니다. 마감 전 가용 시간은 아래 시간표를 뺀 빈 시간에 나눠 계산됩니다.</p>' : `
    <p class="muted small">하루 활동 시간에서 아래 시간표의 수업·알바를 빼고, 식사·이동·휴식 시간을 뺀 나머지를 공부 가능 시간으로 계산합니다.</p>
    <div class="row">
      <label class="form">하루 활동 시간
        <span class="inline" style="margin:0"><input type="time" data-setting="dayStart" value="${s.dayStart}"> ~ <input type="time" data-setting="dayEnd" value="${s.dayEnd}"></span>
        <span class="muted small">종료가 시작보다 이르면 다음 날 새벽까지로 계산</span>
      </label>
      <label class="form">식사·이동·휴식 (h/일)<input type="number" min="0" max="12" step="0.5" data-setting="lifeHours" value="${s.lifeHours}"></label>
      <label class="form">하루 최대 공부 (h)<input type="number" min="0.5" max="16" step="0.5" data-setting="maxStudy" value="${s.maxStudy}"></label>
    </div>`}
    <div class="table-wrap"><table class="table cap-table">
      <thead><tr><th>요일 (이번 주)</th><th>활동</th><th>수업·알바·일정</th><th>빈 시간</th><th>생활</th><th>공부 가능</th></tr></thead>
      <tbody>${days.map(({ d, i, c }) => `<tr>
        <td>${d}</td><td>${fmtH(c.winH)}</td><td>${c.fixedH ? fmtH(c.fixedH) : '—'}</td><td>${fmtH(c.freeH)}</td>
        <td>${manual ? '—' : fmtH(c.lifeH)}</td>
        <td>${manual ? `<input type="number" min="0" max="24" step="0.5" data-setting="day" data-i="${i}" value="${s.dailyHours[i]}">`
          : `<b>${fmtH(c.study)}</b>${c.study < c.freeH - c.lifeH - 0.01 ? ' <span class="muted small">(최대)</span>' : ''}`}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5">주간 합계</td><td><b>${fmtH(weeklyHours(ws))}</b></td></tr></tfoot>
    </table></div>
    ${recent ? `<p class="muted small">참고: 최근 14일 동안 기록이 있는 ${recent.days}일의 평균 학습 시간은 <b>${fmtH(recent.avg)}</b>입니다.</p>` : ''}

    <h4>수업·아르바이트 시간표</h4>
    ${sched.length ? `<div class="sched">${WEEKDAYS.map((d, i) => {
      const items = sched.filter((x) => Number(x.day) === i);
      return items.length ? `<div class="sched-row"><b>${d}</b><div class="chips">${items.map((x) => `
        <span class="chip-tag">${x.start}~${x.end} ${esc(x.label)} <button class="btn xs" data-action="del-schedule" data-sid="${x.id}" title="삭제">✕</button></span>`).join('')}</div></div>` : '';
    }).join('')}</div>` : '<p class="muted small">등록된 고정 일정이 없습니다. 수업·알바를 등록하면 공부 가능 시간에 바로 반영됩니다.</p>'}
    <form class="inline" data-form="add-schedule">
      <span class="daychks">${WEEKDAYS.map((d, i) => `<label class="daychk"><input type="checkbox" name="days" value="${i}"><span>${d}</span></label>`).join('')}</span>
      <input type="time" name="start" required><input type="time" name="end" required>
      <input name="label" placeholder="예: 자료구조 수업 / 카페 알바" required maxlength="30">
      <button class="btn sm">추가</button>
    </form>
    <p class="muted small" style="margin:4px 0 0">요일을 여러 개 고르면 한 번에 추가됩니다 (예: 월·수 수업).</p>

    <h4>하루 일정 (약속·행사 등 반복되지 않는 일정)</h4>
    ${upcomingEvents().length ? `<div class="chips">${upcomingEvents().map((x) => `
      <span class="chip-tag">${fmtDay(new Date(`${x.date}T00:00`))} ${x.start}~${x.end} ${esc(x.label)} <button class="btn xs" data-action="del-event" data-eid="${x.id}" title="삭제">✕</button></span>`).join('')}</div>`
      : '<p class="muted small">등록된 하루 일정이 없습니다. 그날의 공부 가능 시간에서 자동으로 빠집니다.</p>'}
    <form class="inline" data-form="add-event">
      <input type="date" name="date" value="${ymd(new Date())}" required>
      <input type="time" name="start" required><input type="time" name="end" required>
      <input name="label" placeholder="예: 동아리 모임 / 가족 행사" required maxlength="30">
      <button class="btn sm">추가</button>
    </form>
  </section>`;
}

function pomodoroSection() {
  const pm = state.settings.pomodoro;
  const num = (key, label, min, max) => `<label class="form">${label}<input type="number" min="${min}" max="${max}" step="1" data-setting="pomo.${key}" value="${pm[key]}"></label>`;
  const check = (key, label) => `<label class="check"><input type="checkbox" data-setting="pomo.${key}" ${pm[key] ? 'checked' : ''}> ${label}</label>`;
  return `
  <details class="panel pomo-settings">
    <summary>뽀모도로 설정 <span class="muted small">집중 ${pm.focus}분 · 휴식 ${pm.short}분 · ${pm.longEvery}회마다 긴 휴식 ${pm.long}분</span></summary>
    <div class="row" style="margin-top:12px">${num('focus', '집중 (분)', 5, 90)}${num('short', '짧은 휴식 (분)', 1, 30)}${num('long', '긴 휴식 (분)', 5, 60)}${num('longEvery', '긴 휴식 간격 (회)', 2, 8)}</div>
    <div class="inline">${check('autoFocus', '휴식이 끝나면 다음 집중 자동 시작')}${check('sound', '종료 알림음')}${check('notify', '브라우저 알림')}</div>
  </details>`;
}

const backupDays = () => (state.lastBackup ? Math.floor((Date.now() - state.lastBackup) / 864e5) : null);
const backupText = () => (state.lastBackup ? `마지막 백업: ${backupDays() ? `${backupDays()}일 전` : '오늘'}` : '아직 백업하지 않았습니다');

// 일주일 넘게 백업하지 않았으면 설정 맨 위에 알림
function backupReminder() {
  if (DEMO || !state.tasks.length || (state.lastBackup && backupDays() < 7)) return '';
  return `<div class="alert warn backup-alert"><b>백업</b> · ${backupText()} · 브라우저 기록을 지우면 데이터가 사라집니다
    <button class="btn xs" data-action="export-json">지금 백업</button></div>`;
}

function renderSettings() {
  const s = state.settings;
  return `
  ${backupReminder()}
  ${studyTimeSection()}

  <section class="panel">
    <h3>과목</h3>
    <div class="chips">${state.subjects.map((x) => `<span class="chip-tag">${esc(x)} <button class="btn xs" data-action="del-subject" data-name="${esc(x)}">삭제</button></span>`).join('') || '<span class="muted small">과목이 없습니다.</span>'}</div>
    <form class="inline" data-form="add-subject">
      <input name="subject" placeholder="새 과목명" required maxlength="30"><button class="btn sm">추가</button>
    </form>
  </section>

  <section class="panel">
    <h3>알림 · 테마</h3>
    <div class="row">
      <label class="form">임박 마감 경고 기준
        <select data-setting="alertHours">${[6, 12, 24, 48, 72].map((h) => `<option value="${h}" ${h === s.alertHours ? 'selected' : ''}>마감 ${h}시간 전</option>`).join('')}</select>
        <label class="check"><input type="checkbox" data-setting="deadlineNotify" ${s.deadlineNotify ? 'checked' : ''}> 브라우저 알림도 보내기 (이 기준 시점 + 1시간 전)</label>
      </label>
      <label class="form">테마
        <select data-setting="theme">
          <option value="light" ${s.theme === 'light' ? 'selected' : ''}>라이트</option>
          <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>다크</option>
        </select>
      </label>
    </div>
  </section>

  <section class="panel">
    <h3>데이터</h3>
    <div class="toolbar">
      <button class="btn" data-action="export-json">JSON 백업</button>
      <button class="btn" data-action="export-csv">과제 CSV 내보내기</button>
      <button class="btn" data-action="import-json">JSON 복원</button>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
      <button class="btn" data-action="load-sample">샘플 데이터 불러오기</button>
      <button class="btn danger" data-action="reset-data">데이터 초기화</button>
    </div>
    <p class="muted small">${backupText()} · 모든 데이터는 이 브라우저에만 저장됩니다. 다른 기기에서 쓰려면 JSON 백업 파일을 그 기기에서 "JSON 복원"으로 불러오세요.</p>
  </section>`;
}

const NUM_SETTINGS = { weeklyGoal: [1, 200], lifeHours: [0, 12], maxStudy: [0.5, 16], 'pomo.focus': [5, 90], 'pomo.short': [1, 30], 'pomo.long': [5, 60], 'pomo.longEvery': [2, 8] };

function onSettingChange(el) {
  const key = el.dataset.setting;
  const s = state.settings;
  if (key === 'day') {
    const v = Number(el.value);
    if (Number.isNaN(v) || v < 0 || v > 24) { toast('0~24 사이로 입력하세요'); render(); return; }
    s.dailyHours[Number(el.dataset.i)] = v;
  } else if (NUM_SETTINGS[key]) {
    const [lo, hi] = NUM_SETTINGS[key];
    const v = Number(el.value);
    if (el.value === '' || Number.isNaN(v) || v < lo || v > hi) { toast(`${lo}~${hi} 사이로 입력하세요`); render(); return; }
    if (key.startsWith('pomo.')) s.pomodoro[key.slice(5)] = v; else s[key] = v;
  } else if (key.startsWith('pomo.')) {
    s.pomodoro[key.slice(5)] = el.checked;
  } else if (key === 'dayStart' || key === 'dayEnd') {
    if (!el.value) { render(); return; }
    s[key] = el.value;
    if (s.dayStart === s.dayEnd) toast('활동 시간이 24시간으로 계산됩니다');
  } else if (key === 'deadlineNotify') {
    s.deadlineNotify = el.checked;
    if (el.checked && 'Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) { /* 미지원 */ }
    }
  } else if (key === 'alertHours') {
    s.alertHours = Number(el.value);
  } else if (key === 'theme') {
    s.theme = el.value;
    applyTheme();
  }
  save(); render();
}

function setHoursMode(mode) {
  state.settings.hoursMode = mode;
  save(); render();
}

function addSchedule(form) {
  const fd = new FormData(form);
  const d = Object.fromEntries(fd);
  const days = fd.getAll('days').map(Number);
  if (!days.length) return toast('요일을 하나 이상 고르세요');
  if (toMin(d.end) <= toMin(d.start)) return toast('종료 시간이 시작 시간보다 늦어야 합니다');
  days.forEach((day) => state.schedule.push({ id: uid(), day, start: d.start, end: d.end, label: d.label.trim() }));
  save(); render();
  toast(`${days.map((i) => WEEKDAYS[i]).join('·')} 일정을 추가했습니다`);
}

// 하루 일정: 지난 일정은 목록에서 숨긴다
const upcomingEvents = () => state.events.filter((x) => x.date >= ymd(new Date())).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

function addEvent(form) {
  const d = Object.fromEntries(new FormData(form));
  if (!d.date) return toast('날짜를 고르세요');
  if (toMin(d.end) <= toMin(d.start)) return toast('종료 시간이 시작 시간보다 늦어야 합니다');
  state.events.push({ id: uid(), date: d.date, start: d.start, end: d.end, label: d.label.trim() });
  save(); render();
}

function delEvent(eid) {
  state.events = state.events.filter((x) => x.id !== eid);
  save(); render();
}

function delSchedule(sid) {
  state.schedule = state.schedule.filter((x) => x.id !== sid);
  save(); render();
}

function addSubject(name) {
  const v = (name || '').trim();
  if (!v) return;
  if (state.subjects.includes(v)) return toast('이미 있는 과목입니다');
  state.subjects.push(v);
  save(); render();
}

function delSubject(name) {
  const used = state.tasks.filter((t) => t.subject === name).length;
  if (!confirm(`'${name}' 과목을 삭제할까요?${used ? ` (과제 ${used}개는 유지되고, 성적 항목은 삭제됩니다)` : ''}`)) return;
  state.subjects = state.subjects.filter((s) => s !== name);
  delete state.grades[name];
  save(); render();
}

function exportJSON() {
  state.lastBackup = Date.now();
  save(); render();
  download(`duemate-backup-${ymd(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
}

function exportCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['과목', '제목', '유형', '마감', '예상시간(h)', '실제시간(h)', '뽀모도로', '중요도', '난이도', '진행률(%)', '상태'];
  const rows = state.tasks.map((t) => [t.subject, t.title, t.type, t.due.replace('T', ' '), t.estHours, hours(actualMs(t)), pomoCount(t),
    t.importance, t.difficulty, progress(t), t.done ? '완료' : '미완료'].map(q).join(','));
  download(`duemate-tasks-${ymd(new Date())}.csv`, '\uFEFF' + [header.map(q).join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
}

function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.tasks)) throw new Error('invalid');
      if (!confirm('현재 데이터를 백업 파일 내용으로 덮어쓸까요?')) return;
      state = normalize(data);
      save(); applyTheme(); render(); toast('복원이 완료되었습니다');
    } catch (e) {
      toast('올바른 DueMate 백업 파일이 아닙니다');
    }
  };
  reader.readAsText(file);
}

function loadSample() {
  if (state.tasks.length && !confirm('현재 데이터를 샘플 데이터로 덮어쓸까요?')) return;
  state = sampleState();
  save(); applyTheme(); render(); toast('샘플 데이터를 불러왔습니다');
}

function resetData() {
  if (!confirm('모든 데이터를 삭제할까요? 되돌릴 수 없습니다.')) return;
  state = defaultState();
  save(); applyTheme(); render(); toast('초기화되었습니다');
}

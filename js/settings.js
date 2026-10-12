const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fixedHours = (day) => +(state.schedule.filter((s) => Number(s.day) === day)
  .reduce((a, s) => a + (toMin(s.end) - toMin(s.start)) / 60, 0)).toFixed(1);

function renderSettings() {
  const s = state.settings;
  const sched = [...state.schedule].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  return `
  <section class="panel">
    <h3>요일별 공부 가능 시간</h3>
    <div class="days">${WEEKDAYS.map((d, i) => `
      <label>${d} <span class="muted small">고정 일정 ${fixedHours(i)}h</span>
        <input type="number" min="0" max="24" step="0.5" data-setting="day" data-i="${i}" value="${s.dailyHours[i]}">
      </label>`).join('')}</div>
    <p>주간 공부 가능 시간: <b>${weeklyHours()}시간</b> <span class="muted small">— 우선순위 추천과 과부하 분석에 사용됩니다.</span></p>
  </section>

  <section class="panel">
    <h3>수업·아르바이트 시간표</h3>
    ${sched.length ? `<table class="table"><thead><tr><th>요일</th><th>시간</th><th>내용</th><th></th></tr></thead><tbody>
      ${sched.map((x) => `<tr><td>${WEEKDAYS[x.day]}</td><td>${x.start} ~ ${x.end}</td><td>${esc(x.label)}</td>
        <td><button class="btn xs danger" data-action="del-schedule" data-sid="${x.id}">삭제</button></td></tr>`).join('')}
    </tbody></table>` : '<p class="muted small">등록된 고정 일정이 없습니다.</p>'}
    <form class="inline" data-form="add-schedule">
      <select name="day">${WEEKDAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
      <input type="time" name="start" required><input type="time" name="end" required>
      <input name="label" placeholder="예: 자료구조 수업 / 카페 알바" required maxlength="30">
      <button class="btn sm">추가</button>
    </form>
  </section>

  <section class="panel">
    <h3>알림 · 테마</h3>
    <div class="row">
      <label class="form">임박 마감 알림 기준
        <select data-setting="alertHours">${[6, 12, 24, 48, 72].map((h) => `<option value="${h}" ${h === s.alertHours ? 'selected' : ''}>마감 ${h}시간 전</option>`).join('')}</select>
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
    <h3>과목 관리</h3>
    <div class="chips">${state.subjects.map((x) => `<span class="chip-tag">${esc(x)} <button class="btn xs" data-action="del-subject" data-name="${esc(x)}">삭제</button></span>`).join('') || '<span class="muted small">과목이 없습니다.</span>'}</div>
    <form class="inline" data-form="add-subject">
      <input name="subject" placeholder="새 과목명" required maxlength="30"><button class="btn sm">추가</button>
    </form>
  </section>

  <section class="panel">
    <h3>데이터 관리</h3>
    <div class="toolbar">
      <button class="btn" data-action="export-json">JSON 백업</button>
      <button class="btn" data-action="export-csv">과제 CSV 내보내기</button>
      <button class="btn" data-action="import-json">JSON 복원</button>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
      <button class="btn" data-action="load-sample">샘플 데이터 불러오기</button>
      <button class="btn danger" data-action="reset-data">데이터 초기화</button>
    </div>
    <p class="muted small">모든 데이터는 이 브라우저의 localStorage에만 저장됩니다. 브라우저를 바꾸기 전에 백업하세요.</p>
  </section>`;
}

function onSettingChange(el) {
  const key = el.dataset.setting;
  if (key === 'day') {
    const v = Number(el.value);
    if (Number.isNaN(v) || v < 0 || v > 24) { toast('0~24 사이로 입력하세요'); render(); return; }
    state.settings.dailyHours[Number(el.dataset.i)] = v;
  } else if (key === 'alertHours') {
    state.settings.alertHours = Number(el.value);
  } else if (key === 'theme') {
    state.settings.theme = el.value;
    applyTheme();
  }
  save(); render();
}

function addSchedule(form) {
  const d = Object.fromEntries(new FormData(form));
  if (toMin(d.end) <= toMin(d.start)) return toast('종료 시간이 시작 시간보다 늦어야 합니다');
  state.schedule.push({ id: uid(), day: Number(d.day), start: d.start, end: d.end, label: d.label.trim() });
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
  download(`duemate-backup-${ymd(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
}

function exportCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['과목', '제목', '유형', '마감', '예상시간(h)', '실제시간(h)', '중요도', '난이도', '진행률(%)', '상태'];
  const rows = state.tasks.map((t) => [t.subject, t.title, t.type, t.due.replace('T', ' '), t.estHours, hours(actualMs(t)),
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

const taskUI = { subject: 'all', status: 'todo', sort: 'priority', open: new Set() };

const TEMPLATES = {
  발표: ['자료 조사', '자료 정리', 'PPT 제작', '발표 연습', '제출'],
  보고서: ['주제 선정', '자료 조사', '초안 작성', '퇴고', '제출'],
  코딩: ['요구사항 분석', '설계', '구현', '테스트', '제출'],
  '시험 공부': ['범위 정리', '1회독', '문제 풀이', '오답 정리'],
  시험: ['범위 정리', '1회독', '문제 풀이', '오답 정리'],
};

function sortTasks(list, key) {
  const byDue = (a, b) => new Date(a.due) - new Date(b.due);
  if (key === 'priority') {
    const score = new Map(list.map((t) => [t, t.done ? -1 : priorityOf(t).score]));
    return [...list].sort((a, b) => score.get(b) - score.get(a) || byDue(a, b));
  }
  const sorters = {
    due: byDue,
    importance: (a, b) => b.importance - a.importance || byDue(a, b),
    progress: (a, b) => progress(a) - progress(b) || byDue(a, b),
  };
  return [...list].sort(sorters[key] || byDue);
}

let todoView = params.get('tab') === 'calendar' || params.get('view') === 'calendar' ? 'calendar' : 'list';

// ToDo 탭: 과제 목록과 캘린더를 상단 버튼으로 전환
function renderTodo() {
  const seg = `<div class="seg">
    <button class="${todoView === 'list' ? 'on' : ''}" data-action="todo-view" data-view="list">목록</button>
    <button class="${todoView === 'calendar' ? 'on' : ''}" data-action="todo-view" data-view="calendar">캘린더</button></div>`;
  return `<div class="toolbar" style="margin:0">${seg}</div>${todoView === 'calendar' ? renderCalendar() : renderTasks()}`;
}

function renderTasks() {
  let list = state.tasks;
  if (taskUI.subject !== 'all') list = list.filter((t) => t.subject === taskUI.subject);
  if (taskUI.status === 'todo') list = list.filter((t) => !t.done);
  if (taskUI.status === 'done') list = list.filter((t) => t.done);
  if (taskUI.status === 'overdue') list = list.filter((t) => !t.done && new Date(t.due) < Date.now());
  list = sortTasks(list, taskUI.sort);
  const subjects = [...new Set([...state.subjects, ...state.tasks.map((t) => t.subject)])];
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;

  return `
  <section class="panel">
    <div class="toolbar">
      <select data-filter="subject">${opt('all', '전체 과목', taskUI.subject)}${subjects.map((s) => opt(s, s, taskUI.subject)).join('')}</select>
      <select data-filter="status">
        ${opt('all', '전체 상태', taskUI.status)}${opt('todo', '미완료', taskUI.status)}${opt('done', '완료', taskUI.status)}${opt('overdue', '마감 지남', taskUI.status)}
      </select>
      <select data-filter="sort">
        ${opt('priority', '추천 우선순위순', taskUI.sort)}${opt('due', '마감일순', taskUI.sort)}${opt('importance', '중요도순', taskUI.sort)}${opt('progress', '진행률 낮은순', taskUI.sort)}
      </select>
      <span class="spacer"></span>
      <span class="muted small">${list.length}개 · 제목을 누르면 하위 작업이 열립니다</span>
    </div>
    <div class="task-list">${list.length ? list.map(taskCard).join('') : '<p class="empty">조건에 맞는 과제가 없습니다.</p>'}</div>
  </section>`;
}

function taskCard(t) {
  const p = progress(t);
  const pr = priorityOf(t);
  const overdue = !t.done && pr.hoursLeft <= 0;
  const urgent = !t.done && pr.hoursLeft > 0 && pr.hoursLeft <= state.settings.alertHours;
  return `
  <article class="task ${t.done ? 'done' : ''} ${overdue ? 'overdue' : ''} ${urgent ? 'urgent' : ''}">
    <div class="task-head">
      <input type="checkbox" data-action="toggle-done" data-id="${t.id}" ${t.done ? 'checked' : ''} title="완료 상태 변경">
      <div class="task-main" data-action="toggle-open" data-id="${t.id}">
        <div class="task-title">${esc(t.title)}
          <span class="badge">${esc(t.type)}</span>
          ${t.done ? '' : `<span class="badge lv-${pr.level}">P${pr.score}</span>`}
        </div>
        <div class="task-meta">
          ${esc(t.subject)} · ${fmtDue(t.due)} · <b class="${overdue ? 'red' : urgent ? 'orange' : ''}">${t.done ? '완료' : remainText(t.due)}</b>
          <span class="meta-sub">· 진행 ${p}% · 기록 ${hours(actualMs(t))}h / 예상 ${t.estHours}h${t.estAuto && !t.done ? '(자동)' : ''} · 🍅 ${pomoCount(t)}</span>
        </div>
        <div class="bar"><span style="width:${p}%"></span></div>
      </div>
      <div class="task-actions">
        ${t.done ? '' : `<button class="btn sm" data-action="pomo-start" data-id="${t.id}" title="뽀모도로 시작">🍅 시작</button>`}
        <button class="btn sm" data-action="edit-task" data-id="${t.id}">수정</button>
      </div>
    </div>
    ${taskUI.open.has(t.id) ? taskDetail(t) : ''}
  </article>`;
}

function taskDetail(t) {
  const doneCnt = t.subtasks.filter((s) => s.done).length;
  return `
  <div class="task-detail grid2">
    <div>
      <h4>하위 작업 ${doneCnt}/${t.subtasks.length} 완료 · 남은 작업 ${t.subtasks.length - doneCnt}개</h4>
      <ul class="subtasks">${t.subtasks.map((s) => `
        <li class="${s.done ? 'done' : ''}">
          <input type="checkbox" data-action="toggle-sub" data-id="${t.id}" data-sid="${s.id}" ${s.done ? 'checked' : ''}>
          ${taskUI.editSub === s.id ? `
          <form class="inline sub-edit" data-form="edit-sub" data-id="${t.id}" data-sid="${s.id}">
            <input name="text" value="${esc(s.text)}" required maxlength="60">
            <button class="btn xs primary">저장</button><button type="button" class="btn xs" data-action="cancel-sub">취소</button>
          </form>` : `
          <span>${esc(s.text)}</span>
          <button class="btn xs" data-action="edit-sub" data-id="${t.id}" data-sid="${s.id}" title="수정">✎</button>
          <button class="btn xs" data-action="del-sub" data-id="${t.id}" data-sid="${s.id}" title="삭제">✕</button>`}
        </li>`).join('')}</ul>
      <form class="inline" data-form="add-sub" data-id="${t.id}">
        <input name="text" placeholder="하위 작업 추가" required maxlength="60">
        <button class="btn sm">추가</button>
      </form>
    </div>
    <div>
      ${t.done ? '' : `<h4>추천 이유</h4>${priorityTags(t)}`}
      <p class="small muted">중요도 ${'★'.repeat(t.importance)}${'☆'.repeat(5 - t.importance)} · 난이도 ${t.difficulty}/5 · ${esc(t.type)}</p>
      <h4>설명</h4><p class="pre small">${esc(t.desc) || '—'}</p>
      <h4>메모</h4><p class="pre small">${esc(t.memo) || '—'}</p>
      <h4>작업 기록</h4>
      ${t.logs.length ? `<ul class="logs">${t.logs.slice(-8).reverse().map((l) => `<li>${l.date} · ${fmtDur(l.ms)}${l.pomo ? ' 🍅' : ''}</li>`).join('')}</ul>` : '<p class="muted small">기록 없음 (🍅 시작 버튼으로 집중하면 자동 기록)</p>'}
    </div>
  </div>`;
}

function openTaskForm(id, date) {
  const t = id ? getTask(id) : null;
  const d = t || {
    subject: state.subjects[0] || '', title: '', type: '보고서',
    due: `${date || ymd(addDays(new Date(), 3))}T23:59`,
    importance: 3, difficulty: 3, desc: '', memo: '', estAuto: true, subtasks: [],
  };
  const auto = !!d.estAuto;
  const e = estimateFor({ type: d.type, difficulty: d.difficulty, subCount: d.subtasks.length });
  const est = auto ? e.hours : d.estHours;
  const levels = (name, cur) => `<select name="${name}">${[1, 2, 3, 4, 5].map((n) => `<option ${n === Number(cur) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  openModal(`
    <h3>${t ? '과제 수정' : '과제 / 시험 추가'}</h3>
    <form class="form" data-form="task" data-id="${t ? t.id : ''}">
      <div class="row">
        <label>과목
          <input name="subject" list="subject-list" value="${esc(d.subject)}" required maxlength="30">
          <datalist id="subject-list">${state.subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        </label>
        <label>유형<select name="type">${TYPES.map((x) => `<option ${x === d.type ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      </div>
      <label>제목<input name="title" value="${esc(d.title)}" required maxlength="80"></label>
      <div class="row">
        <label>마감 일시<input type="datetime-local" name="due" value="${d.due}" required></label>
        <label>중요도 (1~5)${levels('importance', d.importance)}</label>
        <label>난이도 (1~5)${levels('difficulty', d.difficulty)}</label>
      </div>
      <div class="est-box" data-subs="${d.subtasks.length}">
        <div class="est-row">
          <span class="small">예상 소요 시간</span>
          <input type="number" name="estHours" min="0.5" max="300" step="0.5" value="${est}" required> <span class="small">시간</span>
          <label class="check"><input type="checkbox" name="estAuto" ${auto ? 'checked' : ''}> 자동 계산</label>
        </div>
        <div class="muted small" id="est-basis">${auto ? esc(estimateBasis(e)) : '직접 입력 · 자동 계산을 켜면 다시 계산'}</div>
      </div>
      <details class="more">
        <summary>하위 작업 · 설명 · 메모 (선택)</summary>
        ${t ? '' : `
          <div class="toolbar" style="margin:8px 0 0"><span class="small">하위 작업 (한 줄에 하나)</span>
            <button type="button" class="btn xs" data-action="fill-template">유형별 템플릿 채우기</button></div>
          <textarea name="subs" rows="4" placeholder="예) 자료 조사&#10;PPT 제작&#10;발표 연습"></textarea>`}
        <label>과제 설명<textarea name="desc" rows="2">${esc(d.desc)}</textarea></label>
        <label>개인 메모<textarea name="memo" rows="2">${esc(d.memo)}</textarea></label>
      </details>
      <div class="modal-actions">
        ${t ? `<button type="button" class="btn danger" data-action="delete-task" data-id="${t.id}" style="margin-right:auto">삭제</button>` : ''}
        <button type="button" class="btn" data-action="close-modal">취소</button>
        <button class="btn primary">저장</button>
      </div>
    </form>`);
}

function fillTemplate() {
  const form = $('form[data-form="task"]');
  const list = TEMPLATES[form.elements.namedItem('type').value];
  if (!list) return toast('이 유형은 템플릿이 없습니다');
  form.elements.namedItem('subs').value = list.join('\n');
  updateFormEstimate(form);
}

// 입력 화면: 유형·난이도·하위 작업이 바뀌면 자동 예상 시간을 다시 계산, 숫자를 직접 고치면 자동 계산을 끈다
function formSubCount(form) {
  const subs = form.elements.namedItem('subs');
  return subs ? subs.value.split('\n').filter((x) => x.trim()).length : Number($('.est-box', form).dataset.subs);
}

function updateFormEstimate(form) {
  const f = form.elements;
  const basis = $('#est-basis', form);
  if (!f.estAuto.checked) { basis.textContent = '직접 입력 · 자동 계산을 켜면 다시 계산'; return; }
  const e = estimateFor({ type: f.type.value, difficulty: f.difficulty.value, subCount: formSubCount(form) });
  f.estHours.value = e.hours;
  basis.textContent = estimateBasis(e);
}

function onTaskFormInput(el) {
  const form = el.form;
  if (el.name === 'estHours') { form.elements.estAuto.checked = false; updateFormEstimate(form); return; }
  if (['type', 'difficulty', 'subs', 'estAuto'].includes(el.name)) updateFormEstimate(form);
}

function saveTaskForm(form) {
  const f = Object.fromEntries(new FormData(form));
  const est = Number(f.estHours);
  if (!f.title.trim() || !f.subject.trim()) return toast('과목과 제목을 입력하세요');
  if (Number.isNaN(est) || est < 0) return toast('예상 소요 시간이 올바르지 않습니다');
  if (Number.isNaN(new Date(f.due).getTime())) return toast('마감 일시를 확인하세요');

  const data = {
    subject: f.subject.trim(), title: f.title.trim(), type: f.type, due: f.due, estHours: est, estAuto: f.estAuto === 'on',
    importance: Number(f.importance), difficulty: Number(f.difficulty), desc: f.desc || '', memo: f.memo || '',
  };
  if (!state.subjects.includes(data.subject)) state.subjects.push(data.subject);

  const id = form.dataset.id;
  if (id) {
    Object.assign(getTask(id), data);
  } else {
    const subtasks = (f.subs || '').split('\n').map((s) => s.trim()).filter(Boolean).map((text) => ({ id: uid(), text, done: false }));
    state.tasks.push({ id: uid(), ...data, done: false, doneAt: null, createdAt: Date.now(), subtasks, logs: [] });
  }
  save(); closeModal(); render();
  toast(id ? '수정되었습니다' : '추가되었습니다');
}

function deleteTask(id) {
  const t = getTask(id);
  if (!t) return;
  askConfirm(`'${t.title}' 삭제`, '기록과 하위 작업도 함께 지워집니다', '삭제', () => {
    if (state.timer && state.timer.taskId === id) state.timer = null;
    delete state.timers[id];
    state.tasks = state.tasks.filter((x) => x.id !== id);
    save(); render(); toast('삭제했습니다');
  });
}

function toggleDone(id) {
  const t = getTask(id);
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  if (t.done) stopTimerOf(id);
  save(); render();
  if (t.done) toast(`'${t.title}' 완료`, () => { t.done = false; t.doneAt = null; save(); render(); });
}

function toggleSub(id, sid) {
  const t = getTask(id);
  const s = t.subtasks.find((x) => x.id === sid);
  s.done = !s.done;
  const allDone = t.subtasks.every((x) => x.done);
  const finished = allDone && !t.done;
  if (finished) { t.done = true; t.doneAt = Date.now(); stopTimerOf(id); }
  else if (!allDone && t.done) { t.done = false; t.doneAt = null; }
  save(); render();
  if (finished) toast('모든 단계 완료! 과제를 완료 처리했습니다 🎉', () => { s.done = false; t.done = false; t.doneAt = null; save(); render(); });
}

function addSub(id, text) {
  const t = getTask(id);
  if (!text.trim()) return;
  t.subtasks.push({ id: uid(), text: text.trim(), done: false });
  if (t.done) { t.done = false; t.doneAt = null; }
  save(); render();
}

// 하위 작업 수정: 브라우저 입력창 대신 그 자리에 입력칸을 연다
function editSub(id, sid) {
  taskUI.editSub = sid;
  render();
  const input = $('.sub-edit input');
  if (input) { input.focus(); input.select(); }
}

function saveSub(form) {
  const s = getTask(form.dataset.id).subtasks.find((x) => x.id === form.dataset.sid);
  const v = new FormData(form).get('text').trim();
  if (s && v) s.text = v;
  taskUI.editSub = null;
  save(); render();
}

function delSub(id, sid) {
  const t = getTask(id);
  t.subtasks = t.subtasks.filter((x) => x.id !== sid);
  save(); render();
}

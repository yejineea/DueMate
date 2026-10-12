let gradeSubject = null;

function calcGrade(items) {
  const errors = [];
  const pending = [];
  const wsum = +items.reduce((a, i) => a + Number(i.weight || 0), 0).toFixed(2);
  if (items.length && Math.abs(wsum - 100) > 0.01) errors.push(`반영 비율 합계가 ${wsum}%입니다. 합계가 100%가 되도록 조정하세요.`);
  let earned = 0, scoredW = 0;
  items.forEach((i) => {
    const max = Number(i.max), w = Number(i.weight);
    if (!(w >= 0 && w <= 100)) { errors.push(`'${esc(i.name)}' 반영 비율은 0~100 사이여야 합니다.`); return; }
    if (!(max > 0)) { errors.push(`'${esc(i.name)}' 만점은 0보다 커야 합니다.`); return; }
    if (i.score === null || i.score === '') { pending.push(i.name); return; }
    const s = Number(i.score);
    if (Number.isNaN(s) || s < 0 || s > max) { errors.push(`'${esc(i.name)}' 취득 점수는 0~${max} 사이여야 합니다.`); return; }
    earned += (s / max) * w;
    scoredW += w;
  });
  return { errors, pending, wsum, earned, scoredW, current: scoredW ? (earned / scoredW) * 100 : null };
}

function renderGrades() {
  const subjects = state.subjects;
  if (!gradeSubject || !subjects.includes(gradeSubject)) gradeSubject = subjects[0] || null;
  if (!gradeSubject) return '<section class="panel"><p class="empty">설정 탭에서 과목을 먼저 추가하세요.</p></section>';

  const items = state.grades[gradeSubject] || [];
  const r = calcGrade(items);
  const cell = (it, key, type = 'number') =>
    `<input type="${type}" data-grade="${key}" data-gid="${it.id}" value="${it[key] === null ? '' : esc(it[key])}" ${type === 'number' ? 'step="0.1"' : ''}>`;

  return `
  <section class="panel">
    <div class="toolbar">
      <select data-filter="grade-subject">${subjects.map((s) => `<option value="${esc(s)}" ${s === gradeSubject ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <span class="muted small">점수를 비워두면 '미입력' 항목으로 분류됩니다.</span>
    </div>
    <table class="table">
      <thead><tr><th>평가 항목</th><th>반영 비율(%)</th><th>만점</th><th>취득 점수</th><th>환산 점수</th><th></th></tr></thead>
      <tbody>${items.map((it) => `
        <tr>
          <td>${cell(it, 'name', 'text')}</td><td>${cell(it, 'weight')}</td><td>${cell(it, 'max')}</td><td>${cell(it, 'score')}</td>
          <td>${it.score === null ? '<span class="muted">미입력</span>' : ((Number(it.score) / Number(it.max)) * Number(it.weight)).toFixed(2)}</td>
          <td><button class="btn xs danger" data-action="del-grade" data-gid="${it.id}">✕</button></td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty">평가 항목을 추가하세요 (예: 중간고사 30%, 과제 30%, 출석 10%)</td></tr>'}
      </tbody>
    </table>
    <form class="inline" data-form="add-grade">
      <input name="name" placeholder="항목명 (예: 중간고사)" required maxlength="30">
      <input name="weight" type="number" placeholder="비율(%)" min="0" max="100" step="0.1" required>
      <input name="max" type="number" placeholder="만점" min="0.1" step="0.1" value="100" required>
      <input name="score" type="number" placeholder="점수 (선택)" min="0" step="0.1">
      <button class="btn sm primary">항목 추가</button>
    </form>
    <div class="alerts" style="margin-top:12px">${r.errors.map((e) => `<div class="alert danger">${e}</div>`).join('')}</div>
    <div class="cards" style="margin-top:12px">
      <div class="card stat"><div class="num">${r.earned.toFixed(1)}</div><div>확보한 점수 (100점 만점)</div></div>
      <div class="card stat"><div class="num">${r.current === null ? '—' : r.current.toFixed(1)}</div><div>현재 성적 (입력 항목 기준 환산)</div></div>
      <div class="card stat"><div class="num">${r.wsum}%</div><div>반영 비율 합계</div></div>
      <div class="card stat"><div class="num">${r.pending.length}</div><div>미입력: ${r.pending.map(esc).join(', ') || '없음'}</div></div>
    </div>
  </section>
  <section class="panel">
    <h3>과목별 성적 현황</h3>
    <table class="table">
      <thead><tr><th>과목</th><th>비율 합계</th><th>확보 점수</th><th>현재 환산</th><th>미입력 항목</th></tr></thead>
      <tbody>${subjects.map((s) => {
        const list = state.grades[s] || [];
        const g = calcGrade(list);
        return `<tr><td>${esc(s)}</td><td class="${list.length && g.wsum !== 100 ? 'red' : ''}">${g.wsum}%</td>
          <td>${g.earned.toFixed(1)}</td><td>${g.current === null ? '—' : `${g.current.toFixed(1)}점`}</td>
          <td>${g.pending.map(esc).join(', ') || '—'}</td></tr>`;
      }).join('')}</tbody>
    </table>
  </section>`;
}

function addGrade(form) {
  const d = Object.fromEntries(new FormData(form));
  const w = Number(d.weight), m = Number(d.max);
  const score = d.score === '' ? null : Number(d.score);
  if (!d.name.trim()) return toast('항목명을 입력하세요');
  if (!(w >= 0 && w <= 100)) return toast('반영 비율은 0~100 사이여야 합니다');
  if (!(m > 0)) return toast('만점은 0보다 커야 합니다');
  if (score !== null && (score < 0 || score > m)) return toast(`점수는 0~${m} 사이여야 합니다`);
  const list = state.grades[gradeSubject] || (state.grades[gradeSubject] = []);
  if (list.reduce((a, i) => a + Number(i.weight), 0) + w > 100) toast('주의: 반영 비율 합계가 100%를 넘습니다');
  list.push({ id: uid(), name: d.name.trim(), weight: w, max: m, score });
  save(); render();
}

function onGradeChange(el) {
  const it = (state.grades[gradeSubject] || []).find((x) => x.id === el.dataset.gid);
  if (!it) return;
  const key = el.dataset.grade;
  if (key === 'name') it.name = el.value.trim() || it.name;
  else if (key === 'score') it.score = el.value === '' ? null : Number(el.value);
  else it[key] = Number(el.value);
  save(); render();
}

function delGrade(gid) {
  state.grades[gradeSubject] = (state.grades[gradeSubject] || []).filter((x) => x.id !== gid);
  save(); render();
}
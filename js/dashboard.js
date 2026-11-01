// 뽀모도로 탭: 과제를 옆으로 넘기는 슬라이드 + 과제별 타이머, 오늘 계획, 핵심 경고
// 통계 카드와 작업량 차트는 리포트 탭에 두고, 첫 화면에서는 결정과 실행에 필요한 것만 보여준다.

function miniList(list) {
  if (!list.length) return '<p class="muted small">없음</p>';
  return `<ul class="mini">${list.map((t) => `
    <li><span>${esc(t.title)} <span class="muted small">${esc(t.subject)}</span></span>
    <span class="small ${new Date(t.due) < Date.now() ? 'red' : ''}">${remainText(t.due)}</span></li>`).join('')}</ul>`;
}

function buildAlerts(wk, skipId) {
  const now = Date.now();
  const todo = state.tasks.filter((t) => !t.done);
  const alerts = [];
  const overdue = todo.filter((t) => new Date(t.due) < now);
  if (overdue.length) alerts.push({ type: 'danger', msg: `<b>마감 지남</b> · ${overdue.map((t) => esc(t.title)).join(', ')}` });
  if (wk.over) {
    alerts.push({ type: 'danger', msg: `<b>7일 과부하</b> · 작업 ${wk.total.toFixed(1)}h / 가능 ${wk.avail}h · ${(wk.total - wk.avail).toFixed(1)}h 부족` });
  }
  wk.days.filter((d) => d.crunch).forEach((d) => alerts.push({
    type: 'warn',
    msg: `<b>${fmtDay(d.date)}까지 시간 부족</b> · 작업 ${d.cumLoad.toFixed(1)}h / 가능 ${d.cumAvail.toFixed(1)}h · ${d.tasks.map((t) => esc(t.title)).join(', ')}`,
  }));
  todo.filter((t) => { const h = (new Date(t.due) - now) / 36e5; return t.id !== skipId && h > 0 && h <= state.settings.alertHours; })
    .forEach((t) => alerts.push({ type: 'warn', msg: `<b>임박</b> · ${esc(t.title)} · ${remainText(t.due)} · 남은 작업 ${remainingWork(t).toFixed(1)}h` }));
  return alerts;
}

// ---- 과제 슬라이드: 옆으로 넘겨 과제를 바꾼다. 각 슬라이드 가운데에 그 과제의 타이머가 있다 ----
let slideIds = [];
let slideKeep = null; // { date, ids } 그날의 슬라이드 순서
let curSlide = 0;

// 슬라이드 순서: 오늘 계획에 들어간 과제(시간 순) → 나머지 과제(우선순위 순)
function slideOrder(recs, tp) {
  const planned = tp ? [...new Set(tp.slots.map((s) => s.t))] : [];
  return [...planned.map((t) => recs.find((r) => r.t === t)), ...recs.filter((r) => !planned.includes(r.t))];
}

function slideHtml(r, i, n, isPlanFirst) {
  const { t, p } = r;
  const tm = timerOf(t.id);
  const next = t.subtasks.find((s) => !s.done);
  const label = tm && tm.endsAt ? '집중 중' : tm ? '일시정지됨' : isPlanFirst ? '지금 할 일' : '다음 과제';
  return `
    <div class="slide ${i === curSlide ? 'current' : ''}" data-id="${t.id}">
      <div class="slide-head">
        <div class="hero-label">${label} <span class="badge lv-${p.level}">P${p.score}</span> <span class="muted small">${i + 1} / ${n}</span></div>
        <h2>${esc(t.title)}</h2>
        <div class="muted small">${esc(t.subject)} · ${fmtDue(t.due)} 마감 · 남은 작업 ${p.work.toFixed(1)}h</div>
        ${priorityTags(t, p)}
      </div>
      ${pomoRing(t.id)}
      ${stepAsk && stepAsk.taskId === t.id && next && next.id === stepAsk.sid ? `
      <div class="step-ask">
        <span>🍅 끝! <b>${esc(next.text)}</b> 끝냈나요?</span>
        <button class="btn sm primary" data-action="step-yes" data-id="${t.id}" data-sid="${next.id}">끝냈어요</button>
        <button class="btn sm" data-action="step-no">아직이에요</button>
      </div>` : ''}
      <div class="slide-foot">
        ${next ? `<span class="step">
          <span class="step-count">단계 ${t.subtasks.indexOf(next) + 1}/${t.subtasks.length}</span>
          <span class="small">다음 단계 <b>${esc(next.text)}</b></span>
          <button class="btn xs" data-action="step-yes" data-id="${t.id}" data-sid="${next.id}" title="이 단계를 끝내고 다음 단계로">✓ 끝냄</button>
        </span>` : t.subtasks.length ? '' : '<span class="small muted">단계 없음</span>'}
        <button class="btn sm" data-action="toggle-done" data-id="${t.id}">완료 처리</button>
      </div>
    </div>`;
}

// 단계 완료: 하위 작업을 체크하고 다음 단계로 (마지막 단계면 과제 완료)
let stepAsk = null; // 집중이 끝난 직후 "이 단계 끝냈나요?"를 물을 과제·단계
function stepDone(id, sid) {
  stepAsk = null;
  const t = getTask(id);
  const s = t && t.subtasks.find((x) => x.id === sid);
  if (!s || s.done) return render();
  toggleSub(id, sid);
  const next = t.subtasks.find((x) => !x.done);
  if (next) toast(`'${s.text}' 완료 → 다음 단계: ${next.text}`);
}

function carousel(slides, firstPlanned) {
  const n = slides.length;
  return `
  <section class="panel hero carousel">
    <button class="car-nav prev" data-action="slide" data-dir="-1" aria-label="이전 과제" ${curSlide === 0 ? 'disabled' : ''}>‹</button>
    <div class="car-viewport">
      <div class="car-track" style="transform: translateX(-${curSlide * 100}%)">
        ${slides.map((r, i) => slideHtml(r, i, n, r.t === firstPlanned)).join('')}
      </div>
    </div>
    <button class="car-nav next" data-action="slide" data-dir="1" aria-label="다음 과제" ${curSlide === n - 1 ? 'disabled' : ''}>›</button>
    <div class="car-dots">${slides.map((r, i) => `<button class="dot ${i === curSlide ? 'on' : ''}" data-action="slide-to" data-i="${i}" title="${esc(r.t.title)}"></button>`).join('')}</div>
  </section>`;
}

// 다시 그리지 않고 슬라이드만 이동 (애니메이션 유지)
function goSlide(i) {
  const track = $('.car-track');
  if (!track || !slideIds.length) return;
  curSlide = Math.max(0, Math.min(slideIds.length - 1, i));
  focusPick = slideIds[curSlide];
  track.style.transition = '';
  track.style.transform = `translateX(-${curSlide * 100}%)`;
  $$('.slide').forEach((el, k) => el.classList.toggle('current', k === curSlide));
  $$('.car-dots .dot').forEach((el, k) => el.classList.toggle('on', k === curSlide));
  $('.car-nav.prev').disabled = curSlide === 0;
  $('.car-nav.next').disabled = curSlide === slideIds.length - 1;
}

// 스와이프·드래그 (터치와 마우스 모두). 버튼을 누른 경우는 드래그로 보지 않는다.
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const vp = e.target.closest('.car-viewport');
  if (!vp || e.target.closest('button, select, input, a')) return;
  drag = { x: e.clientX, dx: 0, w: vp.clientWidth };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.dx = e.clientX - drag.x;
  const track = $('.car-track');
  if (track && Math.abs(drag.dx) > 5) {
    track.style.transition = 'none';
    track.style.transform = `translateX(calc(-${curSlide * 100}% + ${drag.dx}px))`;
  }
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  const { dx, w } = drag;
  drag = null;
  const th = w ? Math.min(60, w / 5) : 60; // 넘기는 기준: 화면 폭의 1/5 (최대 60px)
  goSlide(curSlide + (dx < -th ? 1 : dx > th ? -1 : 0));
});
document.addEventListener('pointercancel', () => { if (drag) { drag = null; goSlide(curSlide); } });

function planPanel(tp, recs) {
  const pm = state.settings.pomodoro;
  const head = `
    <div class="toolbar">
      <h3 style="margin:0">오늘 계획</h3>
      <span class="plan-mode ${tp.edited ? 'edited' : ''}">${tp.edited ? '직접 수정됨' : '자동'}</span>
      <span class="spacer"></span>
      ${tp.edited ? '<button class="btn xs" data-action="plan-reset">자동으로 되돌리기</button>' : ''}
      <button class="btn xs" data-tab="settings">계산 기준</button>
    </div>
    <div class="muted small" style="margin:-4px 0 8px">남은 공부 가능 ${(tp.capMin / 60).toFixed(1)}h (${hm(todayEnd())}까지) · 🍅 ${tp.used}/${tp.total}개 배정 · 오늘 모은 🍅 ${todayPomos()}개</div>`;
  const ctl = (id) => `
    <span class="plan-ctl">
      <button class="icon-btn" data-action="plan-dec" data-id="${id}" title="🍅 하나 빼기">−</button>
      <span class="slot-pomo">🍅×${planCount(tp, id)}</span>
      <button class="icon-btn" data-action="plan-inc" data-id="${id}" title="🍅 하나 더">+</button>
    </span>
    <span class="plan-ctl">
      <button class="icon-btn" data-action="plan-up" data-id="${id}" title="앞으로">▲</button>
      <button class="icon-btn" data-action="plan-down" data-id="${id}" title="뒤로">▼</button>
      <button class="icon-btn" data-action="plan-exclude" data-id="${id}" title="오늘 제외">✕</button>
    </span>`;
  const seen = new Set();
  const body = tp.slots.length
    ? `<div class="slots">${tp.slots.map((s) => {
      const first = !seen.has(s.t.id); seen.add(s.t.id);
      return `
      <div class="slot plan-slot ${state.timer && state.timer.taskId === s.t.id ? 'active' : ''}">
        <span class="slot-time">${hm(s.start)}–${hm(s.end)}</span>
        <span class="slot-title" data-action="pick-task" data-id="${s.t.id}" title="이 과제 보기">${esc(s.t.title)} <span class="muted small">${esc(s.t.subject)}${first ? '' : ' (이어서)'}</span></span>
        ${first ? ctl(s.t.id) : `<span class="slot-pomo muted">🍅×${s.pomos}</span><span></span>`}
      </div>`;
    }).join('')}</div>`
    : `<p class="muted small">${tp.capMin < pm.focus ? '남은 공부 시간 없음 · 내일 다시 계산' : '배정할 작업 없음'}</p>`;
  const inPlan = new Set(tp.items.map((it) => it.t.id));
  const addable = recs.filter((r) => !inPlan.has(r.t.id));
  const extra = `
    <div class="plan-extra">
      ${tp.excluded.length ? `<span class="small muted">오늘 제외:</span> ${tp.excluded.map((t) => `<span class="chip-tag">${esc(t.title)} <button class="btn xs" data-action="plan-restore" data-id="${t.id}" title="다시 자동 배정">되돌리기</button></span>`).join('')}` : ''}
      ${addable.length ? `<select data-plan-add class="plan-add"><option value="">+ 오늘 계획에 과제 추가</option>${addable.map((r) => `<option value="${r.t.id}">${esc(r.t.title)} (${esc(r.t.subject)})</option>`).join('')}</select>` : ''}
    </div>`;
  const warn = [
    ...tp.short.map((x) => `<div class="alert danger"><b>부족</b> · ${esc(x.t.title)} · 오늘 마감까지 🍅 ${x.missing}개 (${((x.missing * pm.focus) / 60).toFixed(1)}h)</div>`),
    tp.overflow > 0 ? `<div class="alert warn"><b>시간 초과</b> · 🍅 ${tp.overflow}개는 오늘 남은 빈 시간에 들어가지 않아 빠졌습니다</div>` : '',
  ].join('');
  return `<section class="panel">${head}${body}${extra}${warn ? `<div class="alerts" style="margin-top:10px">${warn}</div>` : ''}
    <p class="muted small" style="margin-bottom:0">🍅 = ${pm.focus}분 집중 + ${pm.short}분 휴식 · 바꾼 개수는 고정, 나머지 자동 · 수정은 오늘만</p></section>`;
}

// 처음 사용 안내: ① 일정 → ② 과제 → ③ 첫 🍅. 모두 끝내거나 닫으면 다시 보이지 않는다
function onboarding() {
  if (state.onboardDone) return '';
  const steps = [
    ['일정 등록', '수업·알바를 넣으면 공부 시간이 정확해져요', state.schedule.length > 0, '<button class="btn sm" data-tab="settings">일정 넣기</button>'],
    ['과제 추가', '마감·유형만 넣으면 계획을 짜요', state.tasks.length > 0, '<button class="btn sm primary" data-action="new-task">+ 과제</button>'],
    ['첫 🍅 집중', '25분 집중을 끝까지 마쳐 보세요', state.tasks.some((t) => pomoCount(t) > 0), ''],
  ];
  if (steps.every((x) => x[2])) return '';
  return `<section class="panel onboard">
    <div class="toolbar" style="margin-bottom:8px"><h3 style="margin:0">시작하기</h3><span class="muted small">${steps.filter((x) => x[2]).length}/3</span>
      <span class="spacer"></span><button class="btn xs" data-action="onboard-skip">닫기</button></div>
    <ol class="steps">${steps.map(([name, desc, done, btn], i) => `
      <li class="${done ? 'done' : ''}"><span class="step-no">${done ? '✓' : i + 1}</span>
        <span class="step-text"><b>${name}</b><span class="muted small">${desc}</span></span>${done ? '' : btn}</li>`).join('')}</ol>
    ${state.tasks.length ? '' : '<button class="btn xs" data-action="load-sample">샘플 데이터로 먼저 둘러보기</button>'}
  </section>`;
}

// 뽀모도로 탭: 왼쪽 과제 슬라이드(가운데 타이머) | 오른쪽 오늘 계획 → 핵심 경고 → 7일 내 마감 → 뽀모도로 설정
function renderFocus() {
  const all = state.tasks;
  const recs = recommend();
  if (!recs.length) {
    slideIds = [];
    return `${onboarding()}${all.length ? `<section class="panel hero"><div class="hero-label">모두 끝냈습니다</div>
      <h2>남은 과제 없음 🎉</h2><div class="toolbar"><button class="btn primary" data-action="new-task">+ 과제 추가</button></div></section>` : ''}
      ${pomodoroSection()}`;
  }
  const now = new Date();
  const tp = planToday(Date.now(), recs);
  // 슬라이드 순서는 그날 처음 정한 순서로 고정 (타이머 시작으로 계획이 다시 계산돼도 섞이지 않게).
  // 완료된 과제는 빠지고 새 과제는 뒤에 붙는다. 오늘 계획을 직접 고치면 다시 정한다.
  const fresh = slideOrder(recs, tp).map((r) => r.t.id);
  const day = ymd(activeDay());
  if (!slideKeep || slideKeep.date !== day) slideKeep = { date: day, ids: fresh };
  else slideKeep.ids = [...slideKeep.ids.filter((id) => fresh.includes(id)), ...fresh.filter((id) => !slideKeep.ids.includes(id))];
  const slides = slideKeep.ids.map((id) => recs.find((r) => r.t.id === id));
  slideIds = slideKeep.ids;
  // 보고 있던 과제 > 진행 중인 타이머의 과제 > 첫 슬라이드(오늘 계획 첫 과제)
  const want = [focusPick, state.timer && state.timer.taskId].find((id) => id && slideIds.includes(id));
  curSlide = want ? slideIds.indexOf(want) : 0;
  if (!want) focusPick = null;
  const shownId = slideIds[curSlide];
  const upcoming = all.filter((t) => { const h = (new Date(t.due) - now) / 36e5; return !t.done && h > 0 && h <= 168; })
    .sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 5);
  const alerts = buildAlerts(weekLoad(startOfDay(now)), shownId);
  const shown = alerts.slice(0, 3);

  // 왼쪽: 과제 슬라이드와 타이머(스크롤해도 고정) / 오른쪽: 오늘 계획·경고·7일 내 마감·뽀모도로 설정
  return `
  <div class="focus-layout">
    <div class="focus-main">${carousel(slides, tp.slots.length ? tp.slots[0].t : null)}</div>
    <div class="focus-side">
      ${onboarding()}
      ${planPanel(tp, recs)}
      ${shown.length ? `<section class="alerts">${shown.map((a) => `<div class="alert ${a.type}">${a.msg}</div>`).join('')}
        ${alerts.length > shown.length ? `<div class="muted small">외 경고 ${alerts.length - shown.length}건 · 리포트 탭에서 주간 작업량 확인</div>` : ''}</section>` : ''}
      <section class="panel"><h3>7일 내 마감</h3>${miniList(upcoming)}</section>
      ${pomodoroSection()}
    </div>
  </div>`;
}

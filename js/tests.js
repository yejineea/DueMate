// tests.html 전용: 브라우저에서 핵심 계산 로직과 실제 화면 조작을 검증한다. 저장은 막고 메모리 상태만 쓴다.

const groups = [];
let group = null;
function describe(name, fn) { group = { name, cases: [] }; groups.push(group); fn(); }
function test(name, fn) {
  try { fn(); group.cases.push({ name, ok: true }); }
  catch (e) { group.cases.push({ name, ok: false, msg: e.message }); }
}
function eq(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${msg} 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`);
}
function near(actual, expected, msg = '', eps = 0.01) {
  if (!(Math.abs(actual - expected) <= eps)) throw new Error(`${msg} 기대 ${expected}, 실제 ${actual}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

// 2026-11-02는 월요일
const MON = new Date('2026-11-02T00:00');
const at = (day, time) => new Date(`${ymd(addDays(MON, day))}T${time}`).getTime();
const task = (over) => ({ id: uid(), subject: '과목', type: '보고서', importance: 3, difficulty: 3, estHours: 2,
  desc: '', memo: '', subtasks: [], logs: [], done: false, doneAt: null, ...over });
function fresh(settings = {}, extra = {}) {
  state = normalize({ settings: { dayStart: '09:00', dayEnd: '00:00', lifeHours: 3, maxStudy: 8, ...settings }, ...extra });
}
const fixed = (day, start, end) => ({ id: uid(), day, start, end, label: '고정' });

describe('공부 가능 시간 자동 계산', () => {
  test('겹치거나 맞닿은 구간을 병합한다', () => {
    eq(mergeIntervals([[5, 8], [1, 3], [3, 4], [7, 10]]), [[1, 4], [5, 10]]);
  });
  test('활동 15h − 겹치는 수업 4h(병합) − 생활 3h = 8h', () => {
    fresh({ maxStudy: 12 }, { schedule: [fixed(0, '09:00', '12:00'), fixed(0, '11:00', '13:00')] });
    const c = dayCapacity(MON);
    near(c.winH, 15, '활동'); near(c.fixedH, 4, '고정'); near(c.freeH, 11, '빈 시간'); near(c.study, 8, '공부');
  });
  test('하루 최대 공부 시간으로 상한을 둔다', () => {
    fresh({ maxStudy: 6 });
    near(dayCapacity(MON).study, 6);
  });
  test('종료가 시작보다 이르면 자정을 넘는 활동 시간으로 본다 (10:00~02:00 = 16h)', () => {
    fresh({ dayStart: '10:00', dayEnd: '02:00' });
    near(dayCapacity(MON).winH, 16);
  });
  test('자정 넘는 활동 시간에는 다음 날 새벽 일정도 뺀다', () => {
    fresh({ dayStart: '10:00', dayEnd: '02:00' }, { schedule: [fixed(1, '00:00', '01:00')] });
    near(dayCapacity(MON).fixedH, 1);
  });
  test('활동 시간 밖의 일정과 다른 요일 일정은 무시한다', () => {
    fresh({}, { schedule: [fixed(0, '07:00', '08:00'), fixed(3, '10:00', '12:00')] });
    near(dayCapacity(MON).fixedH, 0);
  });
  test('자정을 넘는 활동 시간의 새벽에는 전날 활동일의 남은 시간만 오늘로 본다', () => {
    fresh({ dayStart: '10:00', dayEnd: '02:00' });
    const now = at(1, '01:00');
    eq(hm(todayEnd(now)), '02:00');
    eq(freeSlotsToday(now).map(([s, e]) => [hm(s), hm(e)]), [['01:00', '02:00']]);
  });
  test('직접 입력 모드에서는 요일별 입력값을 쓴다', () => {
    fresh({ hoursMode: 'manual', dailyHours: [1.5, 2, 2, 2, 2, 3, 3] });
    near(dailyAvail(MON), 1.5);
    near(weeklyHours(MON), 15.5);
  });
  test('하루 중간부터의 가용 시간은 남은 빈 시간 비율만큼만 센다', () => {
    fresh({ maxStudy: 12 }, { schedule: [fixed(0, '09:00', '13:00')] }); // 빈 시간 13~24시 11h, 공부 8h
    near(availableBetween(at(0, '13:00'), at(1, '00:00')), 8, '13시부터');
    near(availableBetween(at(0, '18:30'), at(1, '00:00')), 4, '18:30부터 (5.5h × 8/11)');
    near(availableBetween(at(0, '09:00'), at(0, '13:00')), 0, '수업 시간');
  });
  test('여러 날에 걸친 가용 시간을 합산하고, 지난 마감은 0이다', () => {
    fresh({ maxStudy: 12 });
    near(availableUntil(at(3, '00:00'), at(0, '00:00')), 36, '3일');
    near(availableUntil(at(0, '10:00'), at(0, '12:00')), 0, '지난 마감');
  });
});

describe('남은 작업량', () => {
  test('하위 작업이 없으면 기록된 작업 시간만큼 줄어든다', () => {
    near(remainingWork(task({ estHours: 4, logs: [{ date: '2026-11-02', ms: HOUR }] })), 3);
  });
  test('예상보다 오래 걸려도 완료 전까지는 10%를 남긴다', () => {
    near(remainingWork(task({ estHours: 4, logs: [{ date: '2026-11-02', ms: 5 * HOUR }] })), 0.4);
  });
  test('하위 작업 진행률과 기록 시간 중 작은 값을 쓴다', () => {
    const subtasks = [{ id: 1, text: 'a', done: true }, { id: 2, text: 'b', done: false }];
    near(remainingWork(task({ estHours: 4, subtasks, logs: [{ date: '2026-11-02', ms: HOUR }] })), 2);
  });
});

describe('우선순위', () => {
  test('마감이 지난 과제는 임박도 최대점과 이유를 받는다', () => {
    fresh();
    const p = priorityOf(task({ due: `${ymd(MON)}T08:00` }), at(0, '10:00'));
    ok(p.score >= 60, `점수 ${p.score}`);
    ok(p.reasons.includes('마감이 이미 지났습니다'), p.reasons.join());
  });
  test('남은 작업이 마감 전 가용 시간보다 많으면 경고 이유가 붙는다', () => {
    fresh({ maxStudy: 12 });
    const p = priorityOf(task({ estHours: 10, due: `${ymd(MON)}T23:00` }), at(0, '18:00'));
    ok(p.ratio >= 1, `비율 ${p.ratio}`);
    ok(p.reasons.some((r) => r.includes('공부 가능 시간')), p.reasons.join());
  });
});

describe('7일 과부하 분석', () => {
  test('가용 시간은 지금 이후만 센다 (오늘 남은 4h + 6일 × 12h = 76h)', () => {
    fresh({ maxStudy: 12 }, { schedule: [fixed(0, '09:00', '13:00')] });
    near(weekLoad(MON, at(0, '18:30')).avail, 76);
  });
  test('날짜별 가능 시간도 지금 이후만 센다 (오늘은 남은 4h)', () => {
    fresh({ maxStudy: 12 }, { schedule: [fixed(0, '09:00', '13:00')] });
    const w = weekLoad(MON, at(0, '18:30'));
    near(w.days[0].avail, 4); near(w.days[1].avail, 12);
  });
  test('7일 안에 마감인 작업이 가용 시간보다 많으면 과부하다', () => {
    fresh({ maxStudy: 2 });
    state.tasks = [task({ estHours: 20, due: `${ymd(addDays(MON, 2))}T23:59` })];
    const w = weekLoad(MON, at(0, '09:00'));
    ok(w.over, `작업 ${w.total} / 가용 ${w.avail}`);
    ok(w.days.some((d) => d.crunch), '마감일까지 부족한 날 표시');
  });
});

describe('오늘 계획', () => {
  function setup(estA) {
    fresh({ maxStudy: 12 }, { schedule: [fixed(0, '09:00', '13:00')] });
    state.tasks = [
      task({ title: 'A', estHours: estA, due: `${ymd(MON)}T23:00` }),
      task({ title: 'B', estHours: 10, due: `${ymd(addDays(MON, 5))}T23:59` }),
    ];
    return planToday(at(0, '18:30'));
  }
  test('남은 4h를 30분(집중 25+휴식 5) 단위 뽀모도로 8개로 나눈다', () => {
    const r = setup(1);
    eq(r.total, 8); eq(r.used, 8);
  });
  test('오늘 마감 과제에 필요한 몫을 먼저 배정하고, 남는 시간은 다음 순위에 준다', () => {
    const r = setup(1);
    eq(r.items.map((x) => [x.t.title, x.pomos]), [['A', 3], ['B', 5]]);
    eq(r.short, []);
  });
  test('빈 시간 구간에 시간 슬롯으로 배치하고 4회마다 긴 휴식을 넣는다', () => {
    const r = setup(1);
    eq(r.slots.map((s) => [s.t.title, hm(s.start), hm(s.end), s.pomos]), [['A', '18:30', '19:55', 3], ['B', '20:00', '22:35', 5]]);
  });
  test('오늘 시간이 부족하면 부족한 뽀모도로 수를 알려준다', () => {
    const r = setup(10);
    eq(r.items.map((x) => [x.t.title, x.pomos]), [['A', 8]]);
    eq(r.short.map((x) => [x.t.title, x.missing]), [['A', 16]]);
  });
  test('빈 시간이 25분보다 잘게 쪼개져 있으면 배치하지 못한 뽀모도로는 세지 않고 부족으로 알린다', () => {
    fresh({ dayStart: '18:00', dayEnd: '19:20', lifeHours: 0, maxStudy: 12 },
      { schedule: [fixed(0, '18:20', '18:30'), fixed(0, '18:50', '19:00')] }); // 빈 시간 20분 × 3
    state.tasks = [task({ title: 'A', estHours: 1, due: `${ymd(MON)}T23:00` })];
    const r = planToday(at(0, '18:00'));
    eq(r.total, 2); eq(r.used, 0); eq(r.slots, []);
    eq(r.short.map((x) => x.t.title), ['A']);
  });
  test('뽀모도로가 진행 중이면 그 집중과 휴식이 끝난 뒤부터 계획한다', () => {
    fresh({ maxStudy: 12 }, { schedule: [fixed(0, '09:00', '13:00')] });
    state.tasks = [task({ title: 'A', estHours: 1, due: `${ymd(MON)}T23:00` })];
    pomoBegin(state.tasks[0].id, at(0, '18:20')); // 18:45 집중 종료, 18:50 휴식 종료
    const r = planToday(at(0, '18:30'));
    eq(hm(r.slots[0].start), '18:50');
    state.timer = null;
  });
});

describe('뽀모도로', () => {
  const T0 = at(0, '14:00');
  function begin(settings = {}) {
    fresh();
    Object.assign(state.settings.pomodoro, settings);
    state.tasks = [task({ title: 'P', estHours: 4 })];
    pomoBegin(state.tasks[0].id, T0);
    return state.tasks[0];
  }
  test('시작하면 집중 25분이 흐른다', () => {
    begin();
    eq(state.timer.phase, 'focus'); eq(pomoLeft(T0 + 5 * MIN), 20 * MIN);
  });
  test('일시정지한 동안은 시간이 줄지 않는다', () => {
    begin();
    pomoPause(T0 + 10 * MIN);
    eq(pomoLeft(T0 + 40 * MIN), 15 * MIN);
    pomoResume(T0 + 40 * MIN);
    eq(state.timer.endsAt, T0 + 55 * MIN);
  });
  test('집중이 끝나면 25분이 뽀모도로로 기록되고 짧은 휴식이 바로 시작된다', () => {
    const t = begin();
    const ev = pomoAdvance(T0 + 25 * MIN);
    eq([ev.from, ev.to], ['focus', 'short']);
    eq(t.logs.map((l) => [l.ms, l.pomo]), [[25 * MIN, 1]]);
    eq(state.timer.endsAt, T0 + 30 * MIN);
  });
  test('4회째 집중 뒤에는 긴 휴식이다', () => {
    begin();
    let now = T0;
    for (let i = 0; i < 3; i++) { now += 25 * MIN; pomoAdvance(now); now += 5 * MIN; pomoAdvance(now); pomoResume(now); }
    now += 25 * MIN;
    eq(pomoAdvance(now).to, 'long');
    eq(state.timer.dur, 15 * MIN);
  });
  test('휴식이 끝나면 집중은 사용자가 시작할 때까지 기다린다 (자동 시작 끔)', () => {
    begin();
    pomoAdvance(T0 + 25 * MIN);
    pomoAdvance(T0 + 30 * MIN);
    eq(state.timer.phase, 'focus'); eq(state.timer.endsAt, null); eq(state.timer.left, 25 * MIN);
  });
  test('자동 시작을 켜면 휴식 뒤 집중이 바로 시작된다', () => {
    begin({ autoFocus: true });
    pomoAdvance(T0 + 25 * MIN);
    pomoAdvance(T0 + 30 * MIN);
    eq(state.timer.endsAt, T0 + 55 * MIN);
  });
  test('중간에 종료하면 집중한 시간만 기록하고 뽀모도로 수에는 넣지 않는다', () => {
    const t = begin();
    eq(pomoStop(T0 + 12 * MIN), 12 * MIN);
    eq(state.timer, null);
    eq(pomoCount(t), 0); near(actualMs(t), 12 * MIN);
  });
  test('1분 미만으로 집중하고 종료하면 기록하지 않는다', () => {
    const t = begin();
    pomoStop(T0 + 30e3);
    eq(t.logs.length, 0);
  });
  test('탭을 닫아둔 사이 끝난 집중은 기록하되 휴식은 자동 시작하지 않는다', () => {
    const t = begin();
    pomoAdvance(T0 + 3 * HOUR);
    eq(pomoCount(t), 1); eq(state.timer.endsAt, null); eq(state.timer.phase, 'short');
  });
  test('숨긴 탭에서 타이머가 1분 남짓 늦게 처리돼도 휴식은 원래 종료 시각부터 자동 시작된다', () => {
    begin();
    pomoAdvance(T0 + 25 * MIN + 90e3);
    eq(state.timer.endsAt, T0 + 30 * MIN);
  });
  test('밤늦게 끝난 집중을 자정 이후에 처리해도 끝난 날짜로 기록한다', () => {
    const t = begin();
    state.timer.endsAt = at(0, '23:50');
    pomoAdvance(at(1, '00:30'));
    eq(t.logs[0].date, ymd(MON));
  });
  test('뽀모도로 기록이 남은 작업량과 오늘 계획에 반영된다', () => {
    const t = begin();
    const before = remainingWork(t);
    pomoAdvance(T0 + 25 * MIN);
    near(before - remainingWork(t), 25 / 60);
  });
  state.timer = null;
});

describe('성적 계산', () => {
  test('입력된 항목만으로 현재 성적을 환산한다', () => {
    const r = calcGrade([{ id: 1, name: '중간', weight: 30, max: 100, score: 80 }, { id: 2, name: '기말', weight: 70, max: 100, score: null }]);
    near(r.earned, 24); near(r.current, 80); eq(r.pending, ['기말']); eq(r.errors, []);
  });
  test('반영 비율 합계가 100%가 아니면 오류를 낸다', () => {
    const r = calcGrade([{ id: 1, name: '중간', weight: 50, max: 100, score: 80 }]);
    eq(r.errors.length, 1);
  });
});

describe('v1 데이터 호환', () => {
  const v1 = {
    tasks: [{ id: 't1', title: '리포트', subject: '경영', type: '보고서', due: '2026-11-05T23:59', estHours: 3, importance: 3, difficulty: 2,
      subtasks: [], logs: [{ date: '2026-10-30', ms: HOUR }], done: false, doneAt: null }],
    subjects: ['경영'], schedule: [{ id: 's1', day: 0, start: '09:00', end: '12:00', label: '수업' }], grades: {},
    timer: { taskId: 't1', startedAt: null, acc: 10 * MIN },
    settings: { dailyHours: [1, 1, 1, 1, 1, 4, 4], alertHours: 12, theme: 'dark' },
  };
  test('v1 설정은 유지하고 새 설정은 기본값으로 채운다', () => {
    const s = normalize(JSON.parse(JSON.stringify(v1)));
    eq(s.settings.dailyHours, [1, 1, 1, 1, 1, 4, 4]); eq(s.settings.alertHours, 12); eq(s.settings.theme, 'dark');
    eq(s.settings.pomodoro.focus, 25); eq(s.settings.dayStart, '09:00');
  });
  test('v1에서 요일별 시간을 직접 바꿔 둔 사용자는 직접 입력 모드로 옮겨 값이 바뀌지 않는다', () => {
    eq(normalize(JSON.parse(JSON.stringify(v1))).settings.hoursMode, 'manual');
  });
  test('v1 기본값 그대로인 사용자는 자동 계산 모드로 시작한다', () => {
    eq(normalize({ ...JSON.parse(JSON.stringify(v1)), settings: { dailyHours: [2, 2, 2, 2, 2, 3, 3] } }).settings.hoursMode, 'auto');
  });
  test('측정 중이던 v1 스톱워치 시간은 작업 기록으로 옮기고 타이머를 끈다', () => {
    const s = normalize(JSON.parse(JSON.stringify(v1)));
    eq(s.timer, null);
    eq(s.tasks[0].logs.map((l) => l.ms), [HOUR, 10 * MIN]);
  });
  test('뽀모도로 설정 일부만 저장돼 있어도 나머지는 기본값을 쓴다', () => {
    const s = normalize({ settings: { pomodoro: { focus: 50 } } });
    eq([s.settings.pomodoro.focus, s.settings.pomodoro.short, s.settings.pomodoro.longEvery], [50, 5, 4]);
  });
});

describe('화면 렌더링', () => {
  const views = { 오늘: () => renderToday(), 과제: () => renderTasks(), 캘린더: () => renderCalendar(),
    통계: () => renderStats(), 성적: () => renderGrades(), 설정: () => renderSettings() };
  Object.entries(views).forEach(([name, fn]) => {
    test(`${name} 화면이 샘플 데이터와 빈 데이터에서 오류 없이 그려진다`, () => {
      state = sampleState();
      ok(fn().length > 100, '샘플 데이터 화면이 비어 있음');
      state = defaultState();
      ok(typeof fn() === 'string', '빈 데이터 화면 실패');
    });
  });
  {
    state = sampleState();
    for (let i = 0; i < 40; i++) state.tasks.push(task({ title: `과제${i}`, estHours: 3 + (i % 5), due: `${ymd(addDays(new Date(), i * 3))}T23:59` }));
    const times = Object.entries(views).map(([name, fn]) => { const t0 = performance.now(); fn(); return [name, Math.round(performance.now() - t0)]; });
    test(`과제 46개(마감 최대 4개월 뒤)에서도 화면마다 200ms 안에 그려진다 — ${times.map(([n, ms]) => `${n} ${ms}ms`).join(', ')}`, () => {
      const slow = times.filter(([, ms]) => ms > 200);
      ok(!slow.length, `느린 화면: ${JSON.stringify(slow)}`);
    });
  }
  test('직접 입력 모드에서도 설정 화면이 그려진다', () => {
    state = sampleState();
    state.settings.hoursMode = 'manual';
    ok(renderSettings().includes('data-setting="day"'), '요일별 입력칸 없음');
  });
  state = defaultState();
});

describe('화면 조작 (실제 클릭·입력)', () => {
  window.confirm = () => true;
  const click = (sel) => { const el = $(sel); if (!el) throw new Error(`${sel} 없음`); el.click(); };
  const change = (sel, value) => { const el = $(sel); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
  function show(tab) { state = sampleState(); currentTab = tab; render(); }

  test('오늘 화면의 집중 시작 버튼을 누르면 지금 할 일 과제의 뽀모도로가 시작된다', () => {
    show('today');
    const id = $('.hero [data-action="pomo-start"]').dataset.id;
    click('.hero [data-action="pomo-start"]');
    eq(state.timer.taskId, id);
    ok(!$('#timerbar').classList.contains('hidden'), '타이머 바가 보여야 함');
    ok(document.title.includes('집중'), `탭 제목: ${document.title}`);
    ok($('.hero').textContent.includes('집중 중'), '시작 후 버튼 문구');
  });
  test('타이머 바에서 일시정지 → 재개 → 종료할 수 있다', () => {
    click('#timerbar [data-action="pomo-pause"]');
    eq(state.timer.endsAt, null);
    ok(document.title.startsWith('⏸'), document.title);
    click('#timerbar [data-action="pomo-resume"]');
    ok(state.timer.endsAt > Date.now(), '재개 후 진행');
    click('#timerbar [data-action="pomo-stop"]');
    eq(state.timer, null);
    ok($('#timerbar').classList.contains('hidden'), '종료 후 숨김');
  });
  test('다른 과제에서 시작하면 진행 중인 뽀모도로를 끝내고 바꾼다', () => {
    show('tasks');
    const btns = $$('#view [data-action="pomo-start"]');
    btns[0].click();
    $$('#view [data-action="pomo-start"]')[1].click();
    eq(state.timer.taskId, btns[1].dataset.id);
    pomoStop();
  });
  test('과제 추가 모달에서 저장하면 목록과 오늘 계획에 반영된다', () => {
    show('tasks');
    openTaskForm(null);
    const f = $('form[data-form="task"]');
    f.elements.title.value = '테스트 과제';
    f.elements.subject.value = '테스트 과목';
    f.elements.due.value = `${ymd(new Date())}T23:59`;
    f.elements.importance.value = '5';
    f.requestSubmit();
    ok(state.tasks.some((t) => t.title === '테스트 과제'), '상태에 추가');
    ok($('#modal').classList.contains('hidden'), '모달 닫힘');
    ok($('#view').textContent.includes('테스트 과제'), '목록에 표시');
  });
  test('수정 화면의 삭제 버튼으로 과제를 지운다', () => {
    const t = state.tasks.find((x) => x.title === '테스트 과제');
    openTaskForm(t.id);
    click('#modal-box [data-action="delete-task"]');
    ok(!state.tasks.includes(t), '삭제됨');
  });
  test('휴식 중에는 오늘 화면 버튼이 집중 중이라고 표시하지 않는다', () => {
    show('today');
    click('.hero [data-action="pomo-start"]');
    pomoAdvance(state.timer.endsAt);
    render();
    ok($('.hero').textContent.includes('휴식 중'), $('.hero .hero-actions').textContent.trim());
    pomoStop();
  });
  test('탭 버튼과 분석의 통계/성적 전환이 동작한다', () => {
    show('today');
    click('#tabs [data-tab="analytics"]');
    eq(currentTab, 'analytics');
    click('[data-action="analytics-view"][data-view="grades"]');
    ok($('#view').textContent.includes('평가 항목'), '성적 화면');
    click('[data-action="analytics-view"][data-view="stats"]');
  });
  test('설정에서 활동 시간을 바꾸면 공부 가능 시간이 다시 계산된다', () => {
    show('settings');
    change('[data-setting="dayStart"]', '13:00');
    eq(state.settings.dayStart, '13:00');
    near(dayCapacity(new Date()).winH, 11);
    click('[data-action="hours-mode"][data-mode="manual"]');
    eq(state.settings.hoursMode, 'manual');
    ok($('[data-setting="day"]'), '직접 입력칸 표시');
  });
  test('잘못된 뽀모도로 길이는 거부한다', () => {
    show('settings');
    change('[data-setting="pomo.focus"]', '0');
    eq(state.settings.pomodoro.focus, 25);
  });
  state = defaultState(); state.timer = null; currentTab = 'today'; closeModal(); render();
});

(function report() {
  const all = groups.flatMap((g) => g.cases);
  const failed = all.filter((c) => !c.ok);
  $('#results').innerHTML = groups.map((g) => `<h2>${esc(g.name)}</h2><ul>${g.cases.map((c) =>
    `<li class="${c.ok ? 'pass' : 'fail'}">${c.ok ? '✔' : '✘'} ${esc(c.name)}${c.ok ? '' : ` — ${esc(c.msg)}`}</li>`).join('')}</ul>`).join('');
  $('#summary').textContent = `${all.length}개 중 ${all.length - failed.length}개 통과, ${failed.length}개 실패`;
  document.body.dataset.result = failed.length ? 'fail' : 'pass';
})();

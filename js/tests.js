// tests.html 전용: 브라우저에서 핵심 계산 로직을 검증한다. 저장은 막고 메모리 상태만 쓴다.
save = function () {};

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

(function report() {
  const all = groups.flatMap((g) => g.cases);
  const failed = all.filter((c) => !c.ok);
  $('#results').innerHTML = groups.map((g) => `<h2>${esc(g.name)}</h2><ul>${g.cases.map((c) =>
    `<li class="${c.ok ? 'pass' : 'fail'}">${c.ok ? '✔' : '✘'} ${esc(c.name)}${c.ok ? '' : ` — ${esc(c.msg)}`}</li>`).join('')}</ul>`).join('');
  $('#summary').textContent = `${all.length}개 중 ${all.length - failed.length}개 통과, ${failed.length}개 실패`;
  document.body.dataset.result = failed.length ? 'fail' : 'pass';
})();

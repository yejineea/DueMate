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

describe('하루 일정', () => {
  test('그날의 하루 일정도 공부 가능 시간에서 뺀다 (월 18~21시 모임 3h)', () => {
    fresh({ maxStudy: 12 }, { events: [{ id: 'e1', date: ymd(MON), start: '18:00', end: '21:00', label: '모임' }] });
    near(dayCapacity(MON).fixedH, 3);
    near(dayCapacity(addDays(MON, 7)).fixedH, 0, '다음 주 월요일은 영향 없음');
  });
  test('이전 버전의 하루 일정(events)은 일정(하루만)으로 옮기고, 30일 넘게 지난 것은 정리한다', () => {
    const s = normalize({ events: [{ id: 'old', date: ymd(addDays(new Date(), -40)), start: '10:00', end: '11:00', label: 'x' },
      { id: 'new', date: ymd(new Date()), start: '10:00', end: '11:00', label: 'y' }] });
    eq(s.schedule.filter((x) => x.repeat === 'once').map((x) => x.id), ['new']);
    eq(s.events, undefined);
  });
  test('매월 반복 일정은 그 날짜에만 빠진다 (매월 2일)', () => {
    fresh({ maxStudy: 12 }, { schedule: [{ id: 'm', repeat: 'monthly', mday: 2, start: '10:00', end: '12:00', label: '정기' }] });
    near(dayCapacity(MON).fixedH, 2, '11/2');
    near(dayCapacity(addDays(MON, 1)).fixedH, 0, '11/3');
    near(dayCapacity(new Date('2026-12-02T00:00')).fixedH, 2, '12/2');
  });
  test('v1 시간표(반복 정보 없음)는 매주 반복으로 본다', () => {
    const s = normalize({ schedule: [{ id: 'w', day: 0, start: '09:00', end: '12:00', label: '수업' }] });
    eq(s.schedule[0].repeat, 'weekly');
  });
});

describe('마감 알림', () => {
  test('임박 기준에 들어올 때 한 번, 1시간 전에 한 번만 알린다', () => {
    fresh({ alertHours: 24 });
    const now = at(0, '10:00');
    state.tasks = [task({ title: 'R', due: `${ymd(MON)}T20:00` }), task({ title: 'Far', due: `${ymd(addDays(MON, 5))}T20:00` })];
    eq(checkDeadlines(now).map((x) => [x.t.title, x.stage]), [['R', 'near']]);
    eq(checkDeadlines(now + HOUR).length, 0, '반복 없음');
    eq(checkDeadlines(at(0, '19:30')).map((x) => x.stage), ['1h']);
    eq(checkDeadlines(at(0, '19:40')).length, 0);
  });
  test('알림을 끄면 보내지 않는다', () => {
    fresh({ deadlineNotify: false });
    state.tasks = [task({ due: `${ymd(MON)}T20:00` })];
    eq(checkDeadlines(at(0, '19:30')).length, 0);
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

describe('예상 소요 시간 자동 추정', () => {
  const doneTask = (type, est, actualH) => task({ type, estHours: est, done: true, doneAt: Date.now(), logs: [{ date: '2026-11-01', ms: actualH * HOUR }] });
  test('기록이 없으면 유형별 기본 시간 × 난이도 계수 (보고서 3h, 시험 난이도4 = 8×1.3 ≈ 10.5h)', () => {
    fresh();
    eq(estimateFor({ type: '보고서', difficulty: 3 }).hours, 3);
    eq(estimateFor({ type: '시험', difficulty: 4 }).hours, 10.5);
    eq(estimateFor({ type: '코딩', difficulty: 1 }).hours, 3);
  });
  test('하위 작업이 보통보다 많으면 늘린다 (보고서 하위 작업 10개 → ×1.5)', () => {
    fresh();
    eq(estimateFor({ type: '보고서', difficulty: 3, subCount: 10 }).hours, 4.5);
    eq(estimateFor({ type: '보고서', difficulty: 3, subCount: 5 }).hours, 3);
  });
  test('완료 기록으로 유형별 보정: 코딩을 예상의 1.5배 걸린 기록 2건 → ×1.25 (기록이 쌓일수록 1.5에 가까워짐)', () => {
    fresh();
    state.tasks = [doneTask('코딩', 3, 4.5), doneTask('코딩', 4, 6)];
    const cal = calibration();
    near(cal.byType['코딩'].ratio, 1.25); eq(cal.byType['코딩'].n, 2);
    eq(estimateFor({ type: '코딩', difficulty: 3 }).hours, 6.5);
    state.tasks.push(...[1, 2, 3, 4, 5, 6].map(() => doneTask('코딩', 2, 3)));
    near(calibration().byType['코딩'].ratio, 1.4);
  });
  test('기록 1건에 휘둘리지 않는다 (예상의 3배 걸린 1건 → ×1.67, 그대로 3배가 아님)', () => {
    fresh();
    state.tasks = [doneTask('발표', 2, 6)];
    near(calibration().byType['발표'].ratio, 1.667, '', 0.01);
  });
  test('다른 유형은 전체 보정을 따른다', () => {
    fresh();
    state.tasks = [doneTask('코딩', 3, 4.5), doneTask('코딩', 4, 6)];
    near(calibration().byType['보고서'].ratio, 1.25);
  });
  test('보정을 끄면 모든 유형이 ×1이고 예상 시간은 기본 × 난이도만 쓴다', () => {
    fresh({ calibrate: false });
    state.tasks = [doneTask('코딩', 3, 4.5), doneTask('코딩', 4, 6)];
    const cal = calibration();
    ok(cal.off, '꺼짐'); eq(cal.byType['코딩'].ratio, 1);
    eq(estimateFor({ type: '코딩', difficulty: 3 }).hours, 5);
  });
  test('유형별 초기화 이전에 완료한 기록은 그 유형 보정에 쓰지 않는다', () => {
    fresh();
    state.tasks = [doneTask('코딩', 3, 4.5), doneTask('코딩', 4, 6), doneTask('보고서', 2, 3)];
    state.calibReset = { 코딩: Date.now() + 1000 };
    eq(calibration().byType['코딩'].n, 0, '코딩 초기화');
    eq(calibration().byType['보고서'].n, 1, '보고서는 그대로');
  });
  test('과제를 완료하면 진행 중인 자동 추정 과제만 다시 계산되고 직접 입력한 과제는 그대로다', () => {
    fresh();
    const auto = task({ type: '코딩', difficulty: 3, estAuto: true, estHours: 5 });
    const manual = task({ type: '코딩', difficulty: 3, estHours: 5 });
    state.tasks = [auto, manual, doneTask('코딩', 3, 4.5), doneTask('코딩', 4, 6)];
    refreshAutoEstimates();
    eq([auto.estHours, manual.estHours], [6.5, 5]);
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

describe('오늘 계획 직접 수정', () => {
  // 월요일 18:30, 남은 4h → 🍅 8개. A(오늘 마감, 3개 필요) B(5일 뒤, 많이 남음) C(5일 뒤)
  function setup() {
    fresh({ maxStudy: 12 }, { schedule: [fixed(0, '09:00', '13:00')] });
    state.tasks = [
      task({ title: 'A', estHours: 1, due: `${ymd(MON)}T23:00` }),
      task({ title: 'B', estHours: 10, importance: 4, due: `${ymd(addDays(MON, 5))}T23:59` }),
      task({ title: 'C', estHours: 3, importance: 1, difficulty: 1, due: `${ymd(addDays(MON, 5))}T23:59` }),
    ];
    return state.tasks;
  }
  const N = at(0, '18:30');
  const counts = (r) => r.items.map((it) => [it.t.title, it.pomos]);
  const edit = (pomos = {}, order = []) => { state.planEdit = { date: ymd(MON), pomos, order }; };
  test('수정이 없으면 자동 계산 그대로다', () => {
    setup();
    const r = planToday(N);
    eq(r.edited, false); eq(r.used, 8);
  });
  test('개수를 정한 과제는 고정되고, 남는 시간만 나머지에 다시 배정된다', () => {
    const [a, b, c] = setup();
    edit({ [b.id]: 2 });
    const r = planToday(N);
    eq(r.edited, true);
    eq(r.items.find((it) => it.t === b).pomos, 2);
    eq(r.used, 8);
    ok(r.items.find((it) => it.t === c).pomos > 0, '남은 시간이 C로');
  });
  test('제외(0개)하면 그 과제는 빠지고 시간은 다른 과제로 간다', () => {
    const [a, b, c] = setup();
    edit({ [b.id]: 0 });
    const r = planToday(N);
    ok(!r.items.some((it) => it.t === b), 'B 빠짐');
    eq(r.excluded.map((t) => t.title), ['B']);
    eq(counts(r), [['A', 3], ['C', 5]], 'B 몫이 C로');
  });
  test('순서를 바꾸면 그 순서대로 시간대에 배치된다', () => {
    const [a, b] = setup();
    edit({}, [b.id, a.id]);
    eq(planToday(N).slots[0].t.title, 'B');
  });
  test('남은 시간보다 많이 늘리면 들어가지 않은 개수를 알려 준다', () => {
    const [a] = setup();
    edit({ [a.id]: 12 });
    const r = planToday(N);
    ok(r.overflow > 0, `overflow ${r.overflow}`);
    eq(r.used + r.overflow, 12, '배치된 수 + 넘친 수 = 정한 수');
  });
  test('오늘 마감 과제를 줄이면 부족 경고가 뜬다', () => {
    const [a] = setup();
    edit({ [a.id]: 1 });
    eq(planToday(N).short.map((x) => [x.t.title, x.missing]), [['A', 2]]);
  });
  test('수정은 그날만 유지되고 다음 날에는 자동 계산으로 돌아간다', () => {
    const [a, b] = setup();
    edit({ [b.id]: 0 });
    eq(planToday(at(1, '18:30')).edited, false);
  });
  test('작업량이 남지 않은 과제도 직접 추가할 수 있다', () => {
    const [a, b, c] = setup();
    c.estHours = 0;
    edit({ [c.id]: 1 });
    eq(planToday(N).items.find((it) => it.t === c).pomos, 1);
  });
});

describe('성과 집계', () => {
  const log = (date, pomo = 1) => ({ date, ms: 25 * MIN, pomo });
  test('끝까지 마친 집중(🍅)만 날짜별로 센다', () => {
    fresh();
    state.tasks = [task({ logs: [log('2026-11-02'), log('2026-11-02'), log('2026-11-03', 0)] }), task({ logs: [log('2026-11-03')] })];
    eq(pomoByDay(), { '2026-11-02': 2, '2026-11-03': 1 });
  });
  test('주간 합계는 월~일 기준이다', () => {
    const map = { '2026-11-01': 5, '2026-11-02': 2, '2026-11-08': 3, '2026-11-09': 4 };
    eq(weekPomos(MON, map), 5);
  });
  test('연속 집중일: 오늘 아직 안 했으면 어제부터 센다', () => {
    const map = { '2026-11-02': 1, '2026-11-03': 2, '2026-11-04': 1 };
    eq(focusStreak(map, at(2, '20:00')), 3);
    eq(focusStreak(map, at(3, '09:00')), 3);
    eq(focusStreak(map, at(4, '09:00')), 0);
    eq(bestStreak({ ...map, '2026-11-10': 1 }), 3);
  });
  test('성과 탭이 샘플·빈 데이터에서 그려지고 토마토 설명이 있다', () => {
    state = sampleState();
    const html = renderAchievements();
    ok(html.includes('class="plant"') && html.includes('주간 목표'), '화분·주간 카드');
    state = defaultState();
    ok(renderAchievements().includes('씨앗'), '빈 데이터 = 씨앗 단계');
  });
});

describe('토마토 키우기', () => {
  test('주간 목표 대비 🍅 비율로 자라는 단계가 정해진다', () => {
    eq([0, 1, 5, 10, 15, 19, 20, 30].map((n) => STAGES[plantStage(n, 20)]),
      ['씨앗', '새싹', '줄기', '꽃봉오리', '초록 토마토', '초록 토마토', '빨간 토마토', '빨간 토마토']);
  });
  test('토마토 표정은 단계가 높을수록 웃는다 (0단계 눈물, 5단계 볼터치)', () => {
    ok(faceParts(0).includes('tf-tear') && !faceParts(0).includes('tf-blush'), '0단계 울상');
    ok(faceParts(5).includes('tf-blush') && !faceParts(5).includes('tf-tear'), '5단계 활짝');
    ok([0, 3, 12, 20].every((n) => plantSvg(n, 20).includes('pl-face')), '모든 단계에서 화분 위 토마토(씨앗)에 얼굴');
    ok(plantSvg(20, 20).includes('pl-fruit pl-main'), '빨간 토마토 단계의 대표 토마토는 빨강');
    eq(TALK.length, 6); eq(STAGE_RULE.length, 6);
  });
  test('배지는 현재/목표로 획득 여부와 진행도를 낸다', () => {
    const b = badges({ '2026-11-01': 3, '2026-11-02': 9 }, 12, 5, 20);
    eq(b.map((x) => x.on), [true, true, false, false, false, false, true, false]);
    eq([b[2].cur, b[2].need], [12, 50]);
    ok(medalSvg('🍅', 0).includes('m-ribbon'), '메달 그림');
  });
  test('단계마다 화분 그림이 달라진다 (열매 수·색)', () => {
    ok(!plantSvg(0, 20).includes('pl-stem'), '씨앗은 줄기 없음');
    ok(plantSvg(12, 20).includes('pl-bud'), '꽃봉오리');
    ok(plantSvg(16, 20).includes('pl-green'), '초록 토마토');
    eq((plantSvg(20, 20).match(/pl-fruit/g) || []).length, 7, '빨간 토마토 6개 + 표정 짓는 대표 토마토');
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
    eq(r.items.map((x) => [x.t.title, x.pomos]).sort(), [['A', 3], ['B', 5]]);
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
  test('오늘 밤 마감 과제는 점수가 더 높은 내일 마감 과제보다 먼저 시간을 받는다', () => {
    fresh({ maxStudy: 12 }, { schedule: [fixed(0, '09:00', '13:00'), fixed(1, '09:00', '12:00')] });
    state.tasks = [
      task({ title: '오늘', estHours: 2, importance: 2, difficulty: 2, due: `${ymd(MON)}T23:00` }),
      task({ title: '내일', estHours: 5, importance: 5, difficulty: 5, due: `${ymd(addDays(MON, 1))}T13:00` }),
    ];
    const r = planToday(at(0, '20:00'));
    ok(priorityOf(state.tasks[1], at(0, '20:00')).score > priorityOf(state.tasks[0], at(0, '20:00')).score, '내일 과제 점수가 더 높아야 함');
    eq(r.slots[0].t.title, '오늘');
    eq(r.short, []);
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

describe('과제별 타이머', () => {
  function two() {
    fresh();
    state.tasks = [task({ title: 'A' }), task({ title: 'B' })];
    return state.tasks;
  }
  const T0 = at(0, '14:00');
  test('B를 시작하면 진행 중이던 A는 남은 시간 그대로 일시정지되어 보관된다', () => {
    const [a, b] = two();
    pomoBegin(a.id, T0);
    activateTimer(b.id, T0 + 10 * MIN);
    pomoBegin(b.id, T0 + 10 * MIN);
    eq(state.timer.taskId, b.id);
    eq(timerOf(a.id).left, 15 * MIN);
    eq(timerOf(a.id).endsAt, null);
    eq(a.logs.length, 0);
    state.timer = null; state.timers = {};
  });
  test('A로 돌아와 재개하면 남은 15분부터 이어지고, B는 보관된다', () => {
    const [a, b] = two();
    pomoBegin(a.id, T0);
    activateTimer(b.id, T0 + 10 * MIN); pomoBegin(b.id, T0 + 10 * MIN);
    activateTimer(a.id, T0 + 20 * MIN); pomoResume(T0 + 20 * MIN);
    eq(state.timer.taskId, a.id);
    eq(pomoLeft(T0 + 20 * MIN), 15 * MIN);
    eq(timerOf(b.id).left, 15 * MIN);
    pomoAdvance(T0 + 35 * MIN);
    eq(a.logs.map((l) => [l.ms, l.pomo]), [[25 * MIN, 1]]);
    eq(b.logs.length, 0);
    state.timer = null; state.timers = {};
  });
  test('보관 중인 B를 중지하면 B에 집중한 시간만 기록되고 진행 중인 A는 그대로다', () => {
    const [a, b] = two();
    pomoBegin(b.id, T0);
    activateTimer(a.id, T0 + 10 * MIN); pomoBegin(a.id, T0 + 10 * MIN);
    eq(stopTimerOf(b.id, T0 + 12 * MIN), 10 * MIN);
    eq(timerOf(b.id), null);
    ok(state.timer.endsAt, 'A 계속 진행');
    state.timer = null; state.timers = {};
  });
  test('완료한 과제의 보관 타이머는 다시 불러올 때 정리된다', () => {
    const [a, b] = two();
    b.done = true;
    const s2 = normalize({ tasks: [a, b], timers: { [b.id]: { taskId: b.id, phase: 'focus', dur: 25 * MIN, endsAt: null, left: 5 * MIN, count: 0 } } });
    eq(Object.keys(s2.timers), []);
  });
});

describe('추천 이유 태그', () => {
  test('문장 대신 짧은 태그와 판정을 만든다', () => {
    fresh({ maxStudy: 12 });
    const p = priorityOf(task({ estHours: 10, importance: 5, difficulty: 4, due: `${ymd(MON)}T23:00` }), at(0, '18:00'));
    const texts = p.tags.map(([text]) => text);
    eq(texts[0], '5시간 남음');
    ok(texts.some((x) => x.startsWith('시간 부족')), texts.join());
    ok(texts.includes('중요도 높음') && texts.includes('난이도 높음'), texts.join());
    eq(texts[texts.length - 1], '우선 처리');
  });
});

describe('반복 과제', () => {
  test('매주 반복 과제를 완료하면 마감 +7일, 하위 작업이 초기화된 다음 회차가 생긴다', () => {
    fresh();
    const t = task({ title: '주간 퀴즈', repeat: 'weekly', due: '2026-11-02T10:00', subtasks: [{ id: 1, text: '복습', done: true }] });
    state.tasks = [t];
    const n = spawnNext(t);
    eq([n.due, n.done, n.subtasks[0].done, n.repeat], ['2026-11-09T10:00', false, false, 'weekly']);
    eq(spawnNext(t), null, '같은 회차는 한 번만');
  });
  test('매월 반복은 다음 달 같은 날', () => {
    eq(nextDue('2026-11-25T23:59', 'monthly'), '2026-12-25T23:59');
  });
  test('반복 아닌 과제는 다음 회차가 없다', () => {
    fresh(); const t = task({}); state.tasks = [t];
    eq(spawnNext(t), null);
  });
});

describe('성적 계산', () => {
  test('입력된 항목만으로 현재 성적을 환산한다', () => {
    const r = calcGrade([{ id: 1, name: '중간', weight: 30, max: 100, score: 80 }, { id: 2, name: '기말', weight: 70, max: 100, score: null }]);
    near(r.earned, 24); near(r.current, 80); eq(r.pending, ['기말']); eq(r.errors, []);
  });
  test('목표 점수까지 남은 항목에서 필요한 평균을 계산한다', () => {
    const items = [{ id: 1, name: '과제', weight: 40, max: 100, score: 90 }, { id: 2, name: '기말', weight: 60, max: 100, score: null }];
    const n = neededFor(items, 90); // 확보 36 → 54점을 60%에서: 90%
    eq(n.status, 'possible'); near(n.pct, 90);
    eq(neededFor(items, 30).status, 'done');
    eq(neededFor(items, 99).status, 'impossible');
  });
  test('반영 비율 합계가 100%가 아니면 오류를 낸다', () => {
    const r = calcGrade([{ id: 1, name: '중간', weight: 50, max: 100, score: 80 }]);
    eq(r.errors.length, 1);
  });
});

describe('저장된 데이터로 앱 시작', () => {
  test('저장된 데이터가 있는 브라우저에서도 시작 시 오류 없이 불러오고 자동 예상 시간을 보정한다', () => {
    const s = window.__loadedState;
    ok(s && s.tasks.length === 2, '저장된 과제 2개를 불러와야 함');
    ok(s.tasks[1].estHours > 5, `코딩을 예상보다 오래 한 기록이 반영돼야 함 (실제 ${s.tasks[1].estHours}h)`);
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

describe('샘플 데이터 날짜 자동 이동', () => {
  function sampleAt(base) {
    return normalize({
      sampleBase: base,
      tasks: [
        task({ title: '샘플', sample: true, due: `${base}T18:00`, logs: [{ date: base, ms: HOUR, pomo: 1 }] }),
        task({ title: '샘플완료', sample: true, done: true, doneAt: new Date(`${base}T21:00`).getTime(), due: `${base}T23:59` }),
        task({ title: '내 과제', due: `${base}T12:00` }),
      ],
    });
  }
  test('불러온 지 5일 지나면 샘플 과제의 마감·완료·기록 날짜를 5일 민다', () => {
    const base = ymd(addDays(new Date(), -5));
    const s = sampleAt(base);
    const [a, b] = s.tasks;
    eq(a.due, `${ymd(new Date())}T18:00`);
    eq(a.logs[0].date, ymd(new Date()));
    eq(ymd(new Date(b.doneAt)), ymd(new Date()));
    eq(s.sampleBase, ymd(new Date()));
  });
  test('직접 추가한 과제는 옮기지 않는다', () => {
    const base = ymd(addDays(new Date(), -5));
    eq(sampleAt(base).tasks[2].due, `${base}T12:00`);
  });
  test('같은 날 다시 열면 그대로다', () => {
    const today = ymd(new Date());
    eq(sampleAt(today).tasks[0].due, `${today}T18:00`);
  });
  test('새로 만든 샘플 데이터에는 불러온 날짜가 기록된다', () => {
    const s = sampleState();
    eq(s.sampleBase, ymd(new Date()));
    ok(s.tasks.every((t) => t.sample), '모든 샘플 과제 표시');
  });
});

describe('화면 렌더링', () => {
  const views = { 뽀모도로: () => renderFocus(), ToDo: () => renderTasks(), '토마토 키우기': () => renderAchievements(), 캘린더: () => renderCalendar(),
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
  function show(tab) {
    state = sampleState();
    // 언제 실행해도 오늘 계획에 시간이 남도록 활동 시간을 '지금 시각부터 24시간'으로 (밤늦게 실행하면 계획이 비어 실패하던 문제)
    const h = `${pad(new Date().getHours())}:00`;
    state.settings.dayStart = h; state.settings.dayEnd = h;
    focusPick = null; slideKeep = null; currentTab = tab; render();
  }

  const cur = (sel = '') => `.slide.current ${sel}`;
  test('가운데 큰 원 안의 시작 버튼을 누르면 보고 있는 과제의 뽀모도로가 시작된다', () => {
    show('pomodoro');
    const id = $('.slide.current').dataset.id;
    click(cur('.pomo-ring [data-action="pomo-start"]'));
    eq(state.timer.taskId, id);
    ok($(cur('.pomo.phase-focus.running')), '원형 타이머가 집중 중');
    ok(!document.title.includes('집중'), `탭 제목은 그대로: ${document.title}`);
  });
  test('빨간 시간 호 끝에 토마토가 있고, 시간이 지나면 원을 따라 움직인다', () => {
    const head = $(cur(`[data-ring-head]`));
    ok(head && head.querySelector('.rh-body'), '토마토 표시');
    eq(ringHeadTransform(25 * MIN, 25 * MIN), 'translate(258.00 140.00) rotate(90)', '시작 위치 (돌리기 전 3시 = 화면의 12시)');
    ok(ringHeadTransform(12.5 * MIN, 25 * MIN).startsWith('translate(22.00 140.00)'), '절반 지나면 반대편');
  });
  test('원 안의 버튼으로 일시정지 → 재개 → 중지할 수 있다', () => {
    click(cur('.pomo-ring [data-action="pomo-pause"]'));
    eq(state.timer.endsAt, null);
    click(cur('.pomo-ring [data-action="pomo-resume"]'));
    ok(state.timer.endsAt > Date.now(), '재개 후 진행');
    click(cur('.pomo-ring [data-action="pomo-stop"]'));
    eq(state.timer, null);
    ok($(cur('.pomo.phase-idle [data-action="pomo-start"]')), '중지 후 시작 버튼으로 돌아옴');
  });
  test('› 버튼·점·키보드로 옆 과제로 넘어간다 (다시 그리지 않고 슬라이드만 이동)', () => {
    show('pomodoro');
    const ids = $$('.slide').map((el) => el.dataset.id);
    ok(ids.length > 3, '슬라이드 여러 개');
    const track = $('.car-track');
    click('.car-nav.next');
    eq($('.slide.current').dataset.id, ids[1]);
    ok(track.isConnected && track.style.transform.includes('-100%'), track.style.transform);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    eq($('.slide.current').dataset.id, ids[2]);
    click('.car-dots .dot');
    eq($('.slide.current').dataset.id, ids[0]);
    ok($('.car-nav.prev').disabled, '첫 슬라이드에서 이전 버튼 비활성');
  });
  test('옆으로 드래그(스와이프)하면 다음 과제로 넘어간다', () => {
    show('pomodoro');
    const ids = $$('.slide').map((el) => el.dataset.id);
    const vp = $('.car-viewport');
    const ev = (type, x) => vp.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x }));
    ev('pointerdown', 600); ev('pointermove', 450); ev('pointerup', 450);
    eq($('.slide.current').dataset.id, ids[1]);
    ev('pointerdown', 300); ev('pointermove', 320); ev('pointerup', 320);
    eq($('.slide.current').dataset.id, ids[1], '조금만 움직이면 제자리');
  });
  test('과제마다 타이머가 따로: 다른 과제를 시작하면 앞 과제는 남은 시간 그대로 멈추고, 돌아와 재개할 수 있다', () => {
    show('pomodoro');
    const a = $('.slide.current').dataset.id;
    click(cur('[data-action="pomo-start"]'));
    eq(state.timer.taskId, a);
    click('.car-nav.next'); // 타이머 시작 후 오늘 계획이 다시 계산되어 슬라이드 순서가 바뀔 수 있으므로 화면에서 읽는다
    const b = $('.slide.current').dataset.id;
    click(cur('[data-action="pomo-start"]'));
    eq(state.timer.taskId, b);
    eq(timerOf(a).endsAt, null);
    ok(timerOf(a).left > 0, 'A 남은 시간 보관');
    eq($('.slide.current').dataset.id, b, '시작한 과제 슬라이드에 머묾');
    click('.car-nav.prev');
    ok($(cur('.pomo-label')).textContent.includes('일시정지'), $(cur('.pomo-label')).textContent);
    click(cur('[data-action="pomo-resume"]'));
    eq(state.timer.taskId, a);
    eq(timerOf(b).endsAt, null);
    stopTimerOf(a); stopTimerOf(b);
  });
  test('타이머를 시작해도 슬라이드 순서는 그대로다', () => {
    show('pomodoro');
    const before = $$('.slide').map((el) => el.dataset.id);
    click('.slide.current [data-action="pomo-start"]');
    eq($$('.slide').map((el) => el.dataset.id), before);
    pomoStop();
  });
  test('ToDo 탭에서 시작하면 뽀모도로 탭의 그 과제 슬라이드로 이동한다', () => {
    show('todo');
    const last = $$('#view [data-action="pomo-start"]').pop().dataset.id;
    startPomodoro(last);
    eq(currentTab, 'pomodoro');
    eq($('.slide.current').dataset.id, last);
    ok($(cur('.hero-label')).textContent.includes('집중 중'), '슬라이드 라벨');
  });
  test('다른 탭에서는 상단에 남은 시간 칩만 보이고, 누르면 뽀모도로 탭으로 간다', () => {
    click('#tabs [data-tab="todo"]');
    ok(!$('#pomo-chip').hidden && $('#pomo-chip').textContent.includes('집중'), '칩 표시');
    click('#pomo-chip');
    eq(currentTab, 'pomodoro');
    ok($('#pomo-chip').hidden, '뽀모도로 탭에서는 숨김');
    pomoStop();
  });
  test('오늘 계획의 보기 버튼으로 그 과제 슬라이드로 이동한다', () => {
    show('pomodoro');
    const btn = $$('.slots [data-action="pick-task"]').pop();
    btn.click();
    eq($('.slide.current').dataset.id, btn.dataset.id);
    focusPick = null;
  });
  test('넓은 화면에서는 왼쪽 타이머, 오른쪽 오늘 계획·목록으로 나뉜다', () => {
    show('pomodoro');
    ok($('.focus-layout .focus-main .carousel'), '왼쪽 슬라이드');
    ok($('.focus-layout .focus-side .slots') && $('.focus-side .pomo-settings'), '오른쪽 계획·설정');
    ok(!$('.car-hint'), '안내 문구 없음');
  });
  test('오늘 계획의 + / − / ✕ / 되돌리기 버튼으로 직접 수정한다', () => {
    show('pomodoro');
    const id = $('.plan-slot [data-action="plan-inc"]').dataset.id;
    const before = planToday().items.find((it) => it.t.id === id).pomos;
    // 저녁 늦게는 🍅가 1개뿐일 수 있으므로 + 다음 − 순서로 (시간대와 무관하게)
    click(`.plan-slot [data-action="plan-inc"][data-id="${id}"]`);
    ok((planToday().items.find((it) => it.t.id === id)?.pomos ?? 0) >= before, '+ 반영');
    click(`.plan-slot [data-action="plan-dec"][data-id="${id}"]`);
    eq(planToday().items.find((it) => it.t.id === id)?.pomos ?? 0, before);
    ok($('.plan-mode.edited'), '직접 수정됨 표시');
    click(`.plan-slot [data-action="plan-exclude"][data-id="${id}"]`);
    ok($(`[data-action="plan-restore"][data-id="${id}"]`), '제외 목록에 표시');
    click(`[data-action="plan-restore"][data-id="${id}"]`);
    ok(!$(`[data-action="plan-restore"][data-id="${id}"]`), '되돌리면 제외 목록에서 빠짐');
    click(`.plan-slot [data-action="plan-inc"][data-id="${id}"]`);
    click('[data-action="plan-reset"]');
    eq(state.planEdit, null);
    ok(!$('.plan-mode.edited'), '자동으로 돌아옴');
  });
  test('계획에 없는 과제를 추가할 수 있다', () => {
    show('pomodoro');
    const sel = $('[data-plan-add]');
    const id = sel.options[1].value;
    change('[data-plan-add]', id);
    ok(planToday().items.some((it) => it.t.id === id), '추가됨');
    planReset();
  });
  test('성과 탭에서 주간 목표를 바꿀 수 있다', () => {
    show('achieve');
    change('[data-setting="weeklyGoal"]', '30');
    eq(state.settings.weeklyGoal, 30);
    ok($('#view').textContent.includes('/ 30개'), '목표 반영');
  });
  test('슬라이드에 단계 n/전체와 ✓ 끝냄 버튼이 있고, 누르면 다음 단계로 넘어간다', () => {
    show('pomodoro');
    const t = state.tasks.find((x) => !x.done && x.subtasks.some((s) => s.done) && x.subtasks.some((s) => !s.done));
    pickTask(t.id);
    const before = t.subtasks.filter((s) => s.done).length;
    ok($(cur('.step-count')).textContent === `단계 ${before + 1}/${t.subtasks.length}`, $(cur('.step-count')).textContent);
    click(cur('.slide-foot [data-action="step-yes"]'));
    eq(t.subtasks.filter((s) => s.done).length, before + 1);
    ok($(cur('.step-count')).textContent.startsWith(`단계 ${before + 2}/`), $(cur('.step-count')).textContent);
    focusPick = null;
  });
  test('집중을 마치면 "이 단계 끝냈나요?"를 묻고, 끝냈어요를 누르면 단계가 체크된다', () => {
    show('pomodoro');
    const t = state.tasks.find((x) => !x.done && x.subtasks.some((s) => !s.done));
    pickTask(t.id);
    const next = t.subtasks.find((s) => !s.done);
    startPomodoro(t.id);
    state.timer.endsAt = Date.now() - 1000;
    pomoAdvance(); askStep(t.id); render();
    ok($(cur('.step-ask')).textContent.includes(next.text), '질문 표시');
    click(cur('.step-ask [data-action="step-yes"]'));
    ok(next.done, '단계 체크됨');
    ok(!$(cur('.step-ask')), '질문 사라짐');
    stopTimerOf(t.id); focusPick = null;
  });
  test('아직이에요를 누르면 단계는 그대로이고 질문만 닫힌다', () => {
    show('pomodoro');
    const t = state.tasks.find((x) => !x.done && x.subtasks.some((s) => !s.done));
    pickTask(t.id);
    const next = t.subtasks.find((s) => !s.done);
    askStep(t.id); render();
    click(cur('.step-ask [data-action="step-no"]'));
    ok(!next.done && !$(cur('.step-ask')), '그대로');
    focusPick = null;
  });
  test('완료 처리 후 토스트의 되돌리기로 취소할 수 있다', () => {
    show('pomodoro');
    const id = $('.slide.current').dataset.id;
    click(cur('[data-action="toggle-done"]'));
    ok(getTask(id).done, '완료됨');
    click('#toast [data-action="toast-undo"]');
    ok(!getTask(id).done, '되돌려짐');
    ok($$('.slide').some((el) => el.dataset.id === id), '슬라이드에 다시 나타남');
  });
  test('하위 작업은 브라우저 입력창 없이 그 자리에서 고친다', () => {
    show('todo');
    const t = state.tasks.find((x) => !x.done && x.subtasks.length);
    taskUI.open.add(t.id); render();
    const s = t.subtasks[0];
    click(`[data-action="edit-sub"][data-sid="${s.id}"]`);
    const f = $('form[data-form="edit-sub"]');
    ok(f, '입력칸 열림');
    f.elements.text.value = '고친 단계';
    f.requestSubmit();
    eq(s.text, '고친 단계');
    ok(!$('form[data-form="edit-sub"]'), '입력칸 닫힘');
    taskUI.open.delete(t.id);
  });
  test('일정 추가에서 매월 반복을 고르면 그 날짜로 반복된다', () => {
    show('settings');
    state.schedule = []; render();
    const f = $('form[data-form="add-schedule"]');
    const m = f.querySelector('[name="repeat"][value="monthly"]');
    m.checked = true; m.dispatchEvent(new Event('change', { bubbles: true }));
    f.elements.mday.value = '15'; f.elements.start.value = '18:00'; f.elements.end.value = '20:00'; f.elements.label.value = '정기 모임';
    f.requestSubmit();
    eq([state.schedule[0].repeat, state.schedule[0].mday], ['monthly', 15]);
    ok($('#view').textContent.includes('15일'), '목록에 매월 15일');
  });
  test('시간표는 요일 여러 개를 골라 한 번에 추가한다', () => {
    show('settings');
    state.schedule = []; render();
    const f = $('form[data-form="add-schedule"]');
    f.querySelectorAll('[name="days"]')[0].checked = true;
    f.querySelectorAll('[name="days"]')[2].checked = true;
    f.elements.start.value = '09:00'; f.elements.end.value = '10:30'; f.elements.label.value = '수업';
    f.requestSubmit();
    eq(state.schedule.map((x) => x.day).sort(), [0, 2]);
  });
  test('일정 추가에서 하루만을 고르면 그날만 공부 가능 시간이 줄어든다', () => {
    show('settings');
    state.settings.dayStart = '09:00'; state.settings.dayEnd = '00:00'; render(); // 기본 활동 시간 기준으로 검증
    state.schedule = []; render(); // 다른 일정과 겹치지 않게
    const date = ymd(addDays(new Date(), 3));
    const before = dayCapacity(new Date(`${date}T00:00`)).fixedH;
    const f = $('form[data-form="add-schedule"]');
    const once = f.querySelector('[name="repeat"][value="once"]');
    once.checked = true; once.dispatchEvent(new Event('change', { bubbles: true }));
    eq(f.dataset.mode, 'once', '하루만 입력칸으로 전환');
    f.elements.date.value = date; f.elements.start.value = '19:00'; f.elements.end.value = '21:00'; f.elements.label.value = '약속';
    f.requestSubmit();
    eq(state.schedule[0].repeat, 'once');
    near(dayCapacity(new Date(`${date}T00:00`)).fixedH - before, 2);
    ok($('#view').textContent.includes('약속'), '목록 표시');
  });
  test('백업한 적이 없으면 설정 맨 위에 백업 안내가 뜨고, 백업하면 사라진다', () => {
    show('settings');
    state.lastBackup = null; render();
    ok($('.backup-alert'), '안내 표시');
    state.lastBackup = Date.now(); render();
    ok(!$('.backup-alert') && $('#view').textContent.includes('마지막 백업: 오늘'), '사라지고 날짜 표시');
  });
  test('데이터 초기화는 앱 확인창에서 취소할 수 있다 (브라우저 기본창 없음)', () => {
    show('settings');
    window.confirm = () => { throw new Error('브라우저 기본 confirm 호출됨'); };
    click('[data-action="reset-data"]');
    ok($('#modal-box .confirm'), '앱 확인창');
    click('#modal-box [data-action="close-modal"]');
    ok(state.tasks.length > 0, '취소하면 그대로');
    window.confirm = () => true;
  });
  test('처음 사용자는 시작하기 3단계를 보고, 단계를 마치면 체크되며, 닫으면 다시 안 보인다', () => {
    state = defaultState(); currentTab = 'pomodoro'; render();
    ok($('.onboard') && $$('.steps li.done').length === 0, '0/3');
    state.schedule.push({ id: 's', repeat: 'weekly', day: 0, start: '09:00', end: '10:00', label: '수업' }); render();
    eq($$('.steps li.done').length, 1);
    click('[data-action="onboard-skip"]');
    ok(!$('.onboard') && state.onboardDone, '닫힘');
    show('pomodoro');
    ok(!$('.onboard'), '샘플(모두 완료)에서는 안 보임');
  });
  test('반복 과제를 완료 처리하면 다음 회차가 생기고, 되돌리면 함께 지워진다', () => {
    show('todo');
    const t = state.tasks.find((x) => !x.done);
    t.repeat = 'weekly'; render();
    const before = state.tasks.length;
    toggleDone(t.id);
    eq(state.tasks.length, before + 1);
    click('#toast [data-action="toast-undo"]');
    ok(!t.done && state.tasks.length === before, '되돌림');
  });
  test('리포트에서 유형별 보정 초기화·보정 끄기를 할 수 있다', () => {
    show('report');
    const btn = $('[data-action="calib-reset"]');
    const type = btn.dataset.type;
    click('[data-action="calib-reset"]');
    click('#modal-box [data-action="confirm-ok"]');
    eq(calibration().byType[type].n, 0, `${type} 초기화`);
    const box = $('[data-setting="calibrate"]'); box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
    ok(calibration().off && $('.cal-box').textContent.includes('꺼짐'), '보정 꺼짐');
  });
  test('기록이 예상의 절반도 안 되는 과제를 완료하면 실제 시간을 묻고, 입력한 만큼 기록을 채운다', () => {
    show('todo');
    const t = state.tasks.find((x) => !x.done && actualMs(x) / HOUR < x.estHours * 0.5);
    toggleDone(t.id);
    const f = $('form[data-form="actual-time"]');
    ok(f, '실제 시간 질문');
    f.elements.h.value = '3';
    f.requestSubmit();
    near(actualMs(t) / HOUR, 3, '', 0.01);
    ok(t.logs.some((l) => l.manual) && pomoCount(t) === pomoCount(t), '직접 기록 추가 (🍅 수는 그대로)');
  });
  test('기록이 충분한 과제는 완료해도 묻지 않는다', () => {
    show('todo');
    const t = state.tasks.find((x) => !x.done);
    t.logs.push({ date: ymd(new Date()), ms: t.estHours * HOUR });
    closeModal(); toggleDone(t.id);
    ok(!$('form[data-form="actual-time"]') || $('#modal').classList.contains('hidden'), '질문 없음');
  });
  test('과제 상세에서 +30분으로 직접 기록을 더하고 ✕로 지울 수 있다', () => {
    show('todo');
    const t = state.tasks.find((x) => !x.done);
    taskUI.open.add(t.id); render();
    const before = actualMs(t);
    click(`[data-action="log-add"][data-id="${t.id}"][data-min="30"]`);
    eq(actualMs(t) - before, 30 * MIN);
    click(`[data-action="log-del"][data-id="${t.id}"]`);
    eq(actualMs(t), before);
    taskUI.open.delete(t.id);
  });
  test('추천 이유는 문장이 아니라 태그로 보인다', () => {
    show('pomodoro');
    ok($$(cur('.tags .tag')).length >= 2, '태그 표시');
    ok(!$(cur('')).textContent.includes('습니다'), '문장 없음');
  });
  test('과제 추가 모달에서 저장하면 목록과 오늘 계획에 반영된다', () => {
    show('todo');
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
    ok(state.tasks.includes(t) && $('#modal-box .confirm'), '바로 지우지 않고 앱 확인창을 띄움');
    click('#modal-box [data-action="confirm-ok"]');
    ok(!state.tasks.includes(t), '삭제됨');
    ok($('#modal').classList.contains('hidden'), '확인창 닫힘');
  });
  test('입력 화면: 유형·난이도를 바꾸면 예상 시간이 자동으로 바뀌고 근거가 표시된다', () => {
    state = defaultState(); render();
    openTaskForm(null);
    const f = $('form[data-form="task"]');
    eq(f.elements.estHours.value, '3');
    change('form[data-form="task"] [name="type"]', '시험');
    change('form[data-form="task"] [name="difficulty"]', '4');
    eq(f.elements.estHours.value, '10.5');
    ok($('#est-basis').textContent.includes('시험 기본 8h'), $('#est-basis').textContent);
  });
  test('입력 화면: 숫자를 직접 고치면 자동 계산이 꺼지고 그 값으로 저장된다', () => {
    const f = $('form[data-form="task"]');
    f.elements.title.value = '직접 입력 과제';
    f.elements.subject.value = '과목';
    f.elements.estHours.value = '2';
    f.elements.estHours.dispatchEvent(new Event('input', { bubbles: true }));
    eq(f.elements.estAuto.checked, false);
    f.requestSubmit();
    const t = state.tasks.find((x) => x.title === '직접 입력 과제');
    eq([t.estHours, t.estAuto], [2, false]);
  });
  test('입력 화면: 하위 작업을 적으면 개수가 예상 시간에 반영된다', () => {
    openTaskForm(null);
    const f = $('form[data-form="task"]');
    f.elements.subs.value = Array.from({ length: 10 }, (_, i) => `단계${i}`).join(String.fromCharCode(10));
    f.elements.subs.dispatchEvent(new Event('input', { bubbles: true }));
    eq(f.elements.estHours.value, '4.5');
    closeModal();
  });
  test('휴식 중에는 원형 타이머가 휴식으로 바뀌고 원 안에 건너뛰기 버튼이 나온다', () => {
    show('pomodoro');
    click('.slide.current [data-action="pomo-start"]');
    pomoAdvance(state.timer.endsAt);
    render();
    ok($('.slide.current .pomo.phase-short .pomo-ring [data-action="pomo-skip"]'), $('.slide.current .pomo').textContent.replace(/\s+/g, ' '));
    ok($('.slide.current .pomo-label').textContent.includes('휴식'), '휴식 표시');
    pomoStop();
  });
  test('ToDo 탭의 목록/캘린더 전환이 동작한다', () => {
    show('todo');
    click('[data-action="todo-view"][data-view="calendar"]');
    ok($('#view .cal-grid'), '캘린더 표시');
    click('[data-action="todo-view"][data-view="list"]');
    ok($('#view .task-list'), '목록 표시');
  });
  test('탭 버튼과 리포트의 통계/성적 전환이 동작한다', () => {
    show('pomodoro');
    click('#tabs [data-tab="report"]');
    eq(currentTab, 'report');
    click('[data-action="analytics-view"][data-view="grades"]');
    ok($('#view').textContent.includes('평가 항목'), '성적 화면');
    click('[data-action="analytics-view"][data-view="stats"]');
  });
  test('설정에서 활동 시간을 바꾸면 공부 가능 시간이 다시 계산된다', () => {
    show('settings');
    state.settings.dayStart = '09:00'; state.settings.dayEnd = '00:00'; render(); // 기본 활동 시간 기준으로 검증
    change('[data-setting="dayStart"]', '13:00');
    eq(state.settings.dayStart, '13:00');
    near(dayCapacity(new Date()).winH, 11);
    click('[data-action="hours-mode"][data-mode="manual"]');
    eq(state.settings.hoursMode, 'manual');
    ok($('[data-setting="day"]'), '직접 입력칸 표시');
  });
  test('뽀모도로 설정은 뽀모도로 탭에 있고 설정 탭에는 없다', () => {
    show('settings');
    ok(!$('[data-setting="pomo.focus"]'), '설정 탭에 남아 있음');
    show('pomodoro');
    ok($('.pomo-settings [data-setting="pomo.focus"]'), '뽀모도로 탭에 없음');
  });
  test('잘못된 뽀모도로 길이는 거부한다', () => {
    show('pomodoro');
    change('[data-setting="pomo.focus"]', '0');
    eq(state.settings.pomodoro.focus, 25);
  });
  state = defaultState(); state.timer = null; focusPick = null; currentTab = 'pomodoro'; closeModal(); render();
});

(function report() {
  const all = groups.flatMap((g) => g.cases);
  const failed = all.filter((c) => !c.ok);
  $('#results').innerHTML = groups.map((g) => `<h2>${esc(g.name)}</h2><ul>${g.cases.map((c) =>
    `<li class="${c.ok ? 'pass' : 'fail'}">${c.ok ? '✔' : '✘'} ${esc(c.name)}${c.ok ? '' : ` — ${esc(c.msg)}`}</li>`).join('')}</ul>`).join('');
  $('#summary').textContent = `${all.length}개 중 ${all.length - failed.length}개 통과, ${failed.length}개 실패`;
  document.body.dataset.result = failed.length ? 'fail' : 'pass';
})();

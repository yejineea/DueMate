const STORAGE_KEY = 'duemate-v1';
const TYPES = ['보고서', '발표', '코딩', '시험 공부', '시험', '기타'];
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

function defaultState() {
  return {
    tasks: [],
    subjects: [],
    schedule: [],
    grades: {},
    timer: null, // 지금 다루는 타이머 (진행 중이거나 방금 멈춘 것)
    notified: [], // 보낸 마감 알림 키 (같은 알림 반복 방지)
    lastBackup: null,
    calibReset: {}, // 유형별 예상 보정 초기화 시각
    planEdit: null, // 오늘 계획 직접 수정 { date, pomos: {과제 id: 개수(0=제외)}, order: [과제 id] }
    timers: {}, // 다른 과제의 일시정지된 타이머 { 과제 id: 타이머 }
    settings: {
      hoursMode: 'auto', dayStart: '09:00', dayEnd: '00:00', lifeHours: 3, maxStudy: 8,
      dailyHours: [2, 2, 2, 2, 2, 3, 3], alertHours: 24, deadlineNotify: true, theme: 'light', weeklyGoal: 20, calibrate: true,
      pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4, autoFocus: false, sound: true, notify: true },
    },
  };
}

function normalize(data) {
  const d = defaultState();
  const ds = data.settings || {};
  const s = { ...d, ...data, settings: { ...d.settings, ...ds, pomodoro: { ...d.settings.pomodoro, ...(ds.pomodoro || {}) } } };
  s.tasks = (s.tasks || []).map((t) => ({ desc: '', memo: '', subtasks: [], logs: [], done: false, doneAt: null, ...t }));
  if (!Array.isArray(s.settings.dailyHours) || s.settings.dailyHours.length !== 7) s.settings.dailyHours = d.settings.dailyHours;
  // v1 사용자가 요일별 시간을 직접 바꿔 두었다면 그 값을 그대로 쓰도록 '직접 입력' 모드로 옮긴다
  if (data.settings && !ds.hoursMode && s.settings.dailyHours.join() !== d.settings.dailyHours.join()) s.settings.hoursMode = 'manual';
  // v1 스톱워치 타이머 → 측정 중이던 시간을 기록으로 옮기고 종료
  if (s.timer && !s.timer.phase) {
    const ms = (s.timer.acc || 0) + (s.timer.startedAt ? Date.now() - s.timer.startedAt : 0);
    const t = s.tasks.find((x) => x.id === s.timer.taskId);
    if (t && ms >= 1000) t.logs = [...t.logs, { date: ymd(new Date()), ms }];
    s.timer = null;
  }
  // 없어졌거나 완료된 과제의 보관 타이머 정리
  s.timers = Object.fromEntries(Object.entries(s.timers || {}).filter(([id]) => s.tasks.some((t) => t.id === id && !t.done)));
  // 일정 하나로 통합: v1 시간표 = 매주, 이전 버전 하루 일정(events) = 하루만. 30일 지난 하루 일정은 정리
  s.schedule = [...(s.schedule || []).map((x) => ({ repeat: 'weekly', ...x })), ...(s.events || []).map((x) => ({ ...x, repeat: 'once' }))]
    .filter((x) => x.repeat !== 'once' || x.date >= ymd(addDays(new Date(), -30)));
  delete s.events;
  rollSample(s);
  refreshAutoEstimates(s);
  return s;
}

// 샘플 과제는 불러온 날(sampleBase) 기준으로 만들어진다. 며칠 뒤에 열어도 지난 과제가 되지 않도록
// 지난 일수만큼 샘플 과제의 마감·완료·기록 날짜를 함께 앞으로 민다. 사용자가 직접 추가한 과제는 그대로 둔다.
function rollSample(s, now = Date.now()) {
  if (!s.sampleBase) return;
  const days = Math.round((startOfDay(new Date(now)) - new Date(`${s.sampleBase}T00:00`)) / 864e5);
  if (days <= 0) return;
  const shiftDay = (date) => ymd(addDays(new Date(`${date}T00:00`), days));
  s.tasks.filter((t) => t.sample).forEach((t) => {
    const d = new Date(t.due);
    t.due = `${shiftDay(ymd(d))}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (t.doneAt) t.doneAt = addDays(new Date(t.doneAt), days).getTime();
    t.logs = t.logs.map((l) => ({ ...l, date: shiftDay(l.date) }));
  });
  s.sampleBase = ymd(new Date(now));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : defaultState();
  } catch (e) {
    console.error('데이터 로드 실패', e);
    return defaultState();
  }
}

// ?demo: 샘플 데이터를 메모리에만 올려 체험 (사용자 데이터는 읽거나 덮어쓰지 않음)
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
let state = null; // 이 파일 맨 아래에서 초기화 (load·sampleState가 아래쪽 함수들을 쓰기 때문)

function save() {
  refreshAutoEstimates();
  if (DEMO) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('저장 공간이 부족합니다. 데이터를 백업 후 정리하세요.');
  }
}

const getTask = (id) => state.tasks.find((t) => t.id === id);

function progress(t) {
  if (t.done) return 100;
  if (!t.subtasks.length) return 0;
  return Math.round((t.subtasks.filter((s) => s.done).length / t.subtasks.length) * 100);
}
const actualMs = (t) => (t.logs || []).reduce((a, l) => a + l.ms, 0);
const pomoCount = (t, date) => (t.logs || []).filter((l) => l.pomo && (!date || l.date === date)).length;

// 남은 작업량: 하위 작업 진행률 기준과 기록된 작업 시간 기준 중 작은 값.
// 예상보다 오래 걸려도 완료 전까지는 예상 시간의 10%를 남겨 계획에서 사라지지 않게 한다.
function remainingWork(t) {
  if (t.done) return 0;
  const bySub = t.estHours * (1 - progress(t) / 100);
  const byLog = Math.max(t.estHours - actualMs(t) / 36e5, t.estHours * 0.1);
  return Math.min(bySub, byLog);
}

function sampleState() {
  const due = (days, h = 23, m = 59) => `${ymd(addDays(new Date(), days))}T${pad(h)}:${pad(m)}`;
  const subs = (arr, doneN = 0) => arr.map((text, i) => ({ id: uid(), text, done: i < doneN }));
  const pomos = (list) => list.flatMap(([ago, n]) => [...Array(n)].map(() => ({ date: ymd(addDays(new Date(), -ago)), ms: 25 * 6e4, pomo: 1 })));
  const s = defaultState();
  // 모든 날짜는 불러오는 날 기준 상대값이라, 언제 불러와도 "이번 주~3주 뒤" 일정으로 보인다
  const doneAt = (days, h = 21) => new Date(`${ymd(addDays(new Date(), -days))}T${pad(h)}:00`).getTime();
  s.subjects = ['자료구조', '웹프로그래밍', '경영학원론', '영어회화', '통계학'];
  s.tasks = [
    // 진행 중
    { title: '영어 에세이 초안', subject: '영어회화', type: '보고서', due: due(0, 23, 0), estHours: 2, importance: 3, difficulty: 2,
      subtasks: subs(['주제 정하기', '개요 작성', '초안 쓰기', '맞춤법 검토']), logs: pomos([[0, 1]]) },
    { title: '팀 발표 준비', subject: '경영학원론', type: '발표', due: due(1, 13, 0), estHours: 5, importance: 5, difficulty: 4,
      subtasks: subs(['자료 조사', '자료 정리', 'PPT 제작', '발표 연습', '제출'], 2), logs: pomos([[1, 3], [2, 2], [0, 1]]) },
    { title: '스피킹 녹음 과제', subject: '영어회화', type: '기타', due: due(2, 12, 0), estHours: 1, importance: 2, difficulty: 1 },
    { title: '연결 리스트 구현', subject: '자료구조', type: '코딩', due: due(3, 18, 0), estHours: 6, importance: 4, difficulty: 4,
      subtasks: subs(['요구사항 분석', '구현', '테스트', '보고서 작성'], 1), logs: pomos([[3, 2], [4, 2]]) },
    { title: '회귀분석 문제 풀이 4장', subject: '통계학', type: '보고서', due: due(4), estHours: 3, importance: 3, difficulty: 3,
      logs: pomos([[2, 1]]) },
    { title: '반응형 포트폴리오 페이지', subject: '웹프로그래밍', type: '코딩', due: due(5), estHours: 4, importance: 3, difficulty: 3,
      subtasks: subs(['레이아웃 설계', '모바일 대응', '배포']), logs: pomos([[5, 2]]) },
    { title: '마케팅 사례 분석 보고서', subject: '경영학원론', type: '보고서', due: due(7), estHours: 4, importance: 4, difficulty: 3,
      subtasks: subs(['사례 선정', '자료 조사', '초안 작성', '퇴고', '제출']) },
    { title: '자료구조 중간고사', subject: '자료구조', type: '시험', due: due(9, 10, 0), estHours: 10, importance: 5, difficulty: 4,
      subtasks: subs(['범위 정리', '1회독', '문제 풀이', '오답 정리'], 1), logs: pomos([[6, 3], [8, 2]]) },
    { title: '통계학 중간고사', subject: '통계학', type: '시험', due: due(11, 13, 0), estHours: 8, importance: 5, difficulty: 4,
      subtasks: subs(['범위 정리', '1회독', '문제 풀이', '오답 정리']) },
    { title: '웹프로그래밍 중간 프로젝트 기획서', subject: '웹프로그래밍', type: '보고서', due: due(14), estHours: 3, importance: 3, difficulty: 2 },
    { title: '경영학원론 중간고사', subject: '경영학원론', type: '시험', due: due(16, 10, 0), estHours: 6, importance: 4, difficulty: 3 },
    // 최근 완료 (통계·학습 기록용)
    { title: '영어 단어 퀴즈 준비', subject: '영어회화', type: '시험 공부', due: due(-1, 10, 0), estHours: 1, importance: 2, difficulty: 1,
      done: true, doneAt: doneAt(2), logs: pomos([[2, 2]]) },
    { title: '자료구조 실습 3: 스택', subject: '자료구조', type: '코딩', due: due(-2), estHours: 3, importance: 3, difficulty: 3,
      done: true, doneAt: doneAt(3), logs: pomos([[3, 4], [4, 3], [5, 3]]) },
    { title: '통계학 과제 3장', subject: '통계학', type: '보고서', due: due(-4), estHours: 2, importance: 3, difficulty: 2,
      done: true, doneAt: doneAt(5), logs: pomos([[5, 2], [6, 3]]) },
    { title: '웹 과제 2: 폼 검증', subject: '웹프로그래밍', type: '코딩', due: due(-6), estHours: 3, importance: 3, difficulty: 3,
      done: true, doneAt: doneAt(6, 23), logs: pomos([[7, 4], [8, 3], [9, 3]]) },
    { title: '경영학원론 1주차 리포트', subject: '경영학원론', type: '보고서', due: due(-10), estHours: 2, importance: 3, difficulty: 2,
      done: true, doneAt: doneAt(9), logs: pomos([[10, 3], [12, 2]]) },
    // 몇 주 전 완료 (성과 탭의 주별 추이용)
    { title: '자료구조 과제 1: 배열', subject: '자료구조', type: '코딩', due: due(-20), estHours: 4, importance: 3, difficulty: 3,
      done: true, doneAt: doneAt(21), logs: pomos([[22, 3], [23, 4], [25, 3]]) },
    { title: '경영학원론 퀴즈 준비', subject: '경영학원론', type: '시험 공부', due: due(-28), estHours: 2, importance: 2, difficulty: 2,
      done: true, doneAt: doneAt(28), logs: pomos([[29, 3], [30, 2]]) },
    { title: '통계학 과제 1장', subject: '통계학', type: '보고서', due: due(-35), estHours: 2, importance: 3, difficulty: 2,
      done: true, doneAt: doneAt(36), logs: pomos([[36, 2], [37, 3], [39, 2]]) },
    { title: '영어 자기소개 발표', subject: '영어회화', type: '발표', due: due(-42), estHours: 3, importance: 3, difficulty: 3,
      done: true, doneAt: doneAt(42), logs: pomos([[43, 4], [45, 3]]) },
    { title: '웹 과제 1: HTML 기초', subject: '웹프로그래밍', type: '코딩', due: due(-48), estHours: 3, importance: 2, difficulty: 2,
      done: true, doneAt: doneAt(48), logs: pomos([[49, 3], [51, 3]]) },
  ].map((t) => ({ id: uid(), desc: '', memo: '', done: false, doneAt: null, createdAt: Date.now(), subtasks: [], logs: [], sample: true, estAuto: !t.done, ...t }));
  s.sampleBase = ymd(new Date());
  s.grades = {
    자료구조: [
      { id: uid(), name: '중간고사', weight: 30, max: 100, score: null },
      { id: uid(), name: '기말고사', weight: 30, max: 100, score: null },
      { id: uid(), name: '과제', weight: 30, max: 100, score: 92 },
      { id: uid(), name: '출석', weight: 10, max: 10, score: 10 },
    ],
    통계학: [
      { id: uid(), name: '중간고사', weight: 35, max: 100, score: null },
      { id: uid(), name: '기말고사', weight: 35, max: 100, score: null },
      { id: uid(), name: '과제', weight: 20, max: 60, score: 54 },
      { id: uid(), name: '퀴즈', weight: 10, max: 20, score: 17 },
    ],
  };
  const fixed = (day, start, end, label) => ({ id: uid(), day, start, end, label });
  s.schedule = [
    fixed(0, '09:00', '12:00', '자료구조 수업'), fixed(0, '13:00', '15:00', '경영학원론 수업'),
    fixed(1, '10:30', '12:00', '웹프로그래밍 수업'), fixed(1, '13:30', '15:00', '통계학 수업'), fixed(1, '15:00', '16:30', '영어회화 수업'),
    fixed(2, '09:00', '12:00', '자료구조 실습'), fixed(2, '18:00', '22:00', '카페 아르바이트'),
    fixed(3, '10:30', '12:00', '웹프로그래밍 수업'), fixed(3, '13:00', '15:00', '경영학원론 수업'),
    fixed(4, '10:30', '12:00', '통계학 수업'), fixed(4, '18:00', '22:00', '카페 아르바이트'), fixed(5, '12:00', '18:00', '카페 아르바이트'),
  ];
  s.schedule.forEach((x) => { x.repeat = 'weekly'; });
  s.schedule.push({ id: uid(), repeat: 'once', date: ymd(addDays(new Date(), 2)), start: '18:00', end: '21:00', label: '동아리 모임' });
  s.schedule.push({ id: uid(), repeat: 'monthly', mday: 25, start: '19:00', end: '21:00', label: '학회 정기 모임' });
  refreshAutoEstimates(s);
  return s;
}

// 초기 상태: 위의 함수·상수가 모두 정의된 뒤에 만든다
state = DEMO ? sampleState() : load();

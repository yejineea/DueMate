const STORAGE_KEY = 'duemate-v1';
const TYPES = ['보고서', '발표', '코딩', '시험 공부', '시험', '기타'];
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

function defaultState() {
  return {
    tasks: [],
    subjects: [],
    schedule: [],
    grades: {},
    timer: null,
    settings: {
      hoursMode: 'auto', dayStart: '09:00', dayEnd: '00:00', lifeHours: 3, maxStudy: 8,
      dailyHours: [2, 2, 2, 2, 2, 3, 3], alertHours: 24, theme: 'light',
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
  // v1 스톱워치 타이머 → 측정 중이던 시간을 기록으로 옮기고 종료
  if (s.timer && !s.timer.phase) {
    const ms = (s.timer.acc || 0) + (s.timer.startedAt ? Date.now() - s.timer.startedAt : 0);
    const t = s.tasks.find((x) => x.id === s.timer.taskId);
    if (t && ms >= 1000) t.logs.push({ date: ymd(new Date()), ms });
    s.timer = null;
  }
  return s;
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
let state = DEMO ? sampleState() : load();

function save() {
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
  s.subjects = ['자료구조', '웹프로그래밍', '경영학원론', '영어회화'];
  s.tasks = [
    { title: '팀 발표 준비', subject: '경영학원론', type: '발표', due: due(1), estHours: 5, importance: 5, difficulty: 4,
      subtasks: subs(['자료 조사', '자료 정리', 'PPT 제작', '발표 연습', '제출'], 2), logs: pomos([[1, 3], [2, 2]]) },
    { title: '연결 리스트 구현', subject: '자료구조', type: '코딩', due: due(3, 18, 0), estHours: 6, importance: 4, difficulty: 4,
      subtasks: subs(['요구사항 분석', '구현', '테스트', '보고서 작성'], 1), logs: pomos([[0, 2], [3, 2]]) },
    { title: '반응형 포트폴리오 페이지', subject: '웹프로그래밍', type: '코딩', due: due(3), estHours: 4, importance: 3, difficulty: 3,
      logs: pomos([[4, 2]]) },
    { title: '영어 에세이', subject: '영어회화', type: '보고서', due: due(0, 23, 0), estHours: 2, importance: 2, difficulty: 2 },
    { title: '자료구조 중간고사', subject: '자료구조', type: '시험', due: due(9, 10, 0), estHours: 8, importance: 5, difficulty: 4,
      subtasks: subs(['범위 정리', '1회독', '문제 풀이', '오답 정리']), logs: pomos([[5, 3], [6, 2]]) },
    { title: '1주차 리포트', subject: '경영학원론', type: '보고서', due: due(-6), estHours: 2, importance: 3, difficulty: 2,
      done: true, doneAt: Date.now() - 5 * 864e5, logs: pomos([[7, 4], [8, 2]]) },
  ].map((t) => ({ id: uid(), desc: '', memo: '', done: false, doneAt: null, createdAt: Date.now(), subtasks: [], logs: [], ...t }));
  s.grades = {
    자료구조: [
      { id: uid(), name: '중간고사', weight: 30, max: 100, score: null },
      { id: uid(), name: '기말고사', weight: 30, max: 100, score: null },
      { id: uid(), name: '과제', weight: 30, max: 100, score: 92 },
      { id: uid(), name: '출석', weight: 10, max: 10, score: 10 },
    ],
  };
  const fixed = (day, start, end, label) => ({ id: uid(), day, start, end, label });
  s.schedule = [
    fixed(0, '09:00', '12:00', '자료구조 수업'), fixed(0, '13:00', '15:00', '경영학원론 수업'),
    fixed(1, '10:30', '12:00', '웹프로그래밍 수업'), fixed(1, '15:00', '16:30', '영어회화 수업'),
    fixed(2, '09:00', '12:00', '자료구조 실습'), fixed(2, '18:00', '22:00', '카페 아르바이트'),
    fixed(3, '10:30', '12:00', '웹프로그래밍 수업'), fixed(3, '13:00', '15:00', '경영학원론 수업'),
    fixed(4, '18:00', '22:00', '카페 아르바이트'), fixed(5, '12:00', '18:00', '카페 아르바이트'),
  ];
  return s;
}

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
    settings: { dailyHours: [2, 2, 2, 2, 2, 3, 3], alertHours: 24, theme: 'light' },
  };
}

function normalize(data) {
  const d = defaultState();
  const s = { ...d, ...data, settings: { ...d.settings, ...(data.settings || {}) } };
  s.tasks = (s.tasks || []).map((t) => ({ desc: '', memo: '', subtasks: [], logs: [], done: false, doneAt: null, ...t }));
  if (!Array.isArray(s.settings.dailyHours) || s.settings.dailyHours.length !== 7) s.settings.dailyHours = d.settings.dailyHours;
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

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('저장 공간이 부족합니다. 데이터를 백업 후 정리하세요.');
  }
}

const getTask = (id) => state.tasks.find((t) => t.id === id);
const weeklyHours = () => state.settings.dailyHours.reduce((a, b) => a + Number(b || 0), 0);
const dailyAvail = (date) => Number(state.settings.dailyHours[(date.getDay() + 6) % 7] || 0);

function progress(t) {
  if (t.done) return 100;
  if (!t.subtasks.length) return 0;
  return Math.round((t.subtasks.filter((s) => s.done).length / t.subtasks.length) * 100);
}
const actualMs = (t) => (t.logs || []).reduce((a, l) => a + l.ms, 0);
const remainingWork = (t) => (t.done ? 0 : t.estHours * (1 - progress(t) / 100));

function sampleState() {
  const due = (days, h = 23, m = 59) => `${ymd(addDays(new Date(), days))}T${pad(h)}:${pad(m)}`;
  const subs = (arr, doneN = 0) => arr.map((text, i) => ({ id: uid(), text, done: i < doneN }));
  const s = defaultState();
  s.subjects = ['자료구조', '웹프로그래밍', '경영학원론', '영어회화'];
  s.tasks = [
    { title: '팀 발표 준비', subject: '경영학원론', type: '발표', due: due(1), estHours: 5, importance: 5, difficulty: 4,
      subtasks: subs(['자료 조사', '자료 정리', 'PPT 제작', '발표 연습', '제출'], 2) },
    { title: '연결 리스트 구현', subject: '자료구조', type: '코딩', due: due(3, 18, 0), estHours: 6, importance: 4, difficulty: 4,
      subtasks: subs(['요구사항 분석', '구현', '테스트', '보고서 작성'], 1), logs: [{ date: ymd(new Date()), ms: 1.2 * 36e5 }] },
    { title: '반응형 포트폴리오 페이지', subject: '웹프로그래밍', type: '코딩', due: due(3), estHours: 4, importance: 3, difficulty: 3 },
    { title: '영어 에세이', subject: '영어회화', type: '보고서', due: due(0, 23, 0), estHours: 2, importance: 2, difficulty: 2 },
    { title: '자료구조 중간고사', subject: '자료구조', type: '시험', due: due(9, 10, 0), estHours: 8, importance: 5, difficulty: 4,
      subtasks: subs(['범위 정리', '1회독', '문제 풀이', '오답 정리']) },
    { title: '1주차 리포트', subject: '경영학원론', type: '보고서', due: due(-6), estHours: 2, importance: 3, difficulty: 2,
      done: true, doneAt: Date.now() - 5 * 864e5, logs: [{ date: ymd(addDays(new Date(), -7)), ms: 2.6 * 36e5 }] },
  ].map((t) => ({ id: uid(), desc: '', memo: '', done: false, doneAt: null, createdAt: Date.now(), subtasks: [], logs: [], ...t }));
  s.grades = {
    자료구조: [
      { id: uid(), name: '중간고사', weight: 30, max: 100, score: null },
      { id: uid(), name: '기말고사', weight: 30, max: 100, score: null },
      { id: uid(), name: '과제', weight: 30, max: 100, score: 92 },
      { id: uid(), name: '출석', weight: 10, max: 10, score: 10 },
    ],
  };
  s.schedule = [
    { id: uid(), day: 0, start: '09:00', end: '12:00', label: '자료구조 수업' },
    { id: uid(), day: 2, start: '18:00', end: '22:00', label: '카페 아르바이트' },
  ];
  return s;
}

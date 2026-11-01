// 예상 소요 시간 자동 추정
// 예상 = 유형별 기본 시간 × 난이도 계수 × 하위 작업 수 계수 × 내 기록 보정
// - 사용자가 고르는 유형·난이도·하위 작업만으로 계산하므로 따로 입력할 것이 없다.
// - 내 기록 보정: 완료한 과제의 "실제 기록 시간 ÷ 예상 시간"을 유형별로 평균 낸다.
//   기록이 적을 때 한두 건에 휘둘리지 않도록 가상의 1배 표본(PRIOR)을 섞어 1배 쪽으로 당긴다.
// - 과제를 끝낼 때마다 보정이 갱신되고, 진행 중인 자동 추정 과제의 예상 시간도 다시 계산된다.

const BASE_HOURS = { 보고서: 3, 발표: 4, 코딩: 5, '시험 공부': 6, 시험: 8, 기타: 2 };
const DIFF_FACTOR = [1, 0.6, 0.8, 1, 1.3, 1.6];
const TEMPLATE_SIZE = { 보고서: 5, 발표: 5, 코딩: 5, '시험 공부': 4, 시험: 4 };
const PRIOR = 2;
const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function calibration(s = state) {
  const samples = s.tasks
    .filter((t) => t.done && t.estHours > 0 && actualMs(t) > 0)
    .map((t) => ({ type: t.type, r: clampNum(actualMs(t) / HOUR / t.estHours, 0.3, 3) }));
  const shrink = (list, prior) => (list.reduce((a, x) => a + x.r, 0) + PRIOR * prior) / (list.length + PRIOR);
  const overall = clampNum(shrink(samples, 1), 0.5, 2);
  const byType = {};
  Object.keys(BASE_HOURS).forEach((type) => {
    const list = samples.filter((x) => x.type === type);
    // 이 유형의 기준점은 '다른 유형' 기록으로 정한다 (같은 기록을 두 번 세지 않도록)
    const others = clampNum(shrink(samples.filter((x) => x.type !== type), 1), 0.5, 2);
    byType[type] = { ratio: clampNum(shrink(list, others), 0.5, 2), n: list.length };
  });
  return { overall, n: samples.length, byType };
}

// 하위 작업이 보통(유형별 템플릿 개수)보다 많으면 늘리고 적으면 줄인다 (0.7~1.5배)
function subFactor(type, subCount) {
  const m = TEMPLATE_SIZE[type];
  if (!m || !subCount) return 1;
  return clampNum(1 + 0.5 * (subCount / m - 1), 0.7, 1.5);
}

function estimateFor({ type, difficulty, subCount = 0 }, s = state, cal = calibration(s)) {
  const base = BASE_HOURS[type] ?? 3;
  const diff = DIFF_FACTOR[Number(difficulty) || 3];
  const sub = subFactor(type, subCount);
  const c = cal.byType[type] || { ratio: cal.overall, n: 0 };
  const hours = Math.max(0.5, Math.round(base * diff * sub * c.ratio * 2) / 2);
  return { hours, base, diff, sub, ratio: c.ratio, n: c.n, type, difficulty: Number(difficulty) || 3, subCount };
}

function estimateBasis(e) {
  const parts = [`${e.type} 기본 ${e.base}h`, `난이도 ${e.difficulty} ×${e.diff}`];
  if (e.sub !== 1) parts.push(`하위 작업 ${e.subCount}개 ×${+e.sub.toFixed(2)}`);
  parts.push(e.n ? `내 기록 보정 ×${e.ratio.toFixed(2)} (완료 ${e.n}건)` : `내 기록 보정 ×${e.ratio.toFixed(2)} (이 유형 기록 없음)`);
  return `${parts.join(' · ')} → ${e.hours}h`;
}

function refreshAutoEstimates(s = state) {
  const cal = calibration(s);
  s.tasks.filter((t) => t.estAuto && !t.done).forEach((t) => {
    t.estHours = estimateFor({ type: t.type, difficulty: t.difficulty, subCount: t.subtasks.length }, s, cal).hours;
  });
}

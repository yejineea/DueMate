// 공부 가능 시간 자동 계산
// 활동 시간대 − 고정 일정(수업·알바) = 빈 시간, 빈 시간 − 생활 시간(식사·이동·휴식) = 공부 가능 시간.
// 공부 가능 시간은 그날의 빈 시간 구간에 고르게 퍼져 있다고 보고, 특정 시각까지의 가용 시간을 구간 단위로 계산한다.

const span = (list) => list.reduce((a, [s, e]) => a + (e - s), 0) / HOUR;

// 활동 시간대: 종료가 시작보다 이르면(예: 10:00~02:00) 다음 날 새벽까지로 본다
function dayWindow(date) {
  const base = startOfDay(date).getTime();
  const s = toMin(state.settings.dayStart), e = toMin(state.settings.dayEnd);
  return [base + s * MIN, base + (e > s ? e : e + 1440) * MIN];
}

function mergeIntervals(list) {
  const out = [];
  list.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]).forEach(([s, e]) => {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  });
  return out;
}

function subtractIntervals([ws, we], holes) {
  const out = [];
  let cur = ws;
  holes.forEach(([s, e]) => {
    if (s > cur) out.push([cur, Math.min(s, we)]);
    cur = Math.max(cur, e);
  });
  if (cur < we) out.push([cur, we]);
  return out.filter(([s, e]) => e > s);
}

// 그날 활동 시간대에 걸치는 고정 일정(매주 시간표 + 그날의 하루 일정). 자정을 넘는 활동 시간대면 다음 날 새벽 일정도 포함
function fixedIntervals(date) {
  const [ws, we] = dayWindow(date);
  const list = [];
  [0, 1].forEach((offset) => {
    const d = addDays(startOfDay(date), offset);
    const base = d.getTime();
    const dayStr = ymd(d);
    [...state.schedule.filter((x) => Number(x.day) === weekdayIdx(d)), ...(state.events || []).filter((x) => x.date === dayStr)].forEach((x) => {
      list.push([Math.max(ws, base + toMin(x.start) * MIN), Math.min(we, base + toMin(x.end) * MIN)]);
    });
  });
  return mergeIntervals(list);
}

function dayCapacity(date) {
  const s = state.settings;
  const win = dayWindow(date);
  const fixed = fixedIntervals(date);
  const free = subtractIntervals(win, fixed);
  const winH = span([win]), fixedH = span(fixed), freeH = span(free);
  const lifeH = Math.min(freeH, Number(s.lifeHours) || 0);
  const auto = Math.max(0, Math.min(Number(s.maxStudy) || 24, freeH - lifeH));
  const manual = s.hoursMode === 'manual';
  return {
    win, free, winH, fixedH, freeH, lifeH, auto, manual,
    study: manual ? Number(s.dailyHours[weekdayIdx(date)] || 0) : auto,
  };
}

const dailyAvail = (date) => dayCapacity(date).study;
const weeklyHours = (weekStart = startOfWeek(new Date())) =>
  +[...Array(7)].reduce((a, _, i) => a + dailyAvail(addDays(weekStart, i)), 0).toFixed(1);

// from~to 사이의 공부 가능 시간(h)
function availableBetween(from, to) {
  let total = 0;
  const end = Math.min(to, from + 400 * 864e5);
  for (let d = addDays(startOfDay(new Date(from)), -1); d.getTime() < end; d = addDays(d, 1)) {
    const c = dayCapacity(d);
    const slots = c.freeH > 0 ? c.free : [c.win];
    const slotH = span(slots);
    if (!slotH || !c.study) continue;
    const rate = c.study / slotH;
    slots.forEach(([s, e]) => {
      const a = Math.max(s, from), b = Math.min(e, end);
      if (b > a) total += ((b - a) / HOUR) * rate;
    });
  }
  return total;
}

const availableUntil = (end, now = Date.now()) => availableBetween(now, new Date(end).getTime());

// 지금 속한 활동일: 자정을 넘는 활동 시간대(예: 10:00~02:00)의 새벽 01시는 전날 활동일이다
function activeDay(now = Date.now()) {
  const yesterday = addDays(startOfDay(new Date(now)), -1);
  return now < dayWindow(yesterday)[1] ? yesterday : startOfDay(new Date(now));
}

// 지금부터 오늘 활동 시간이 끝날 때까지 남은 빈 시간 구간
function freeSlotsToday(now = Date.now()) {
  const c = dayCapacity(activeDay(now));
  const slots = c.freeH > 0 ? c.free : [c.win];
  return slots.map(([s, e]) => [Math.max(s, now), e]).filter(([s, e]) => e > s);
}
const todayEnd = (now = Date.now()) => dayWindow(activeDay(now))[1];

// 최근 기록 기반 참고치: 최근 14일 중 기록이 있는 날의 평균 학습 시간
function recentStudyAvg(now = Date.now()) {
  const byDay = {};
  const from = ymd(addDays(new Date(now), -14));
  state.tasks.forEach((t) => t.logs.forEach((l) => { if (l.date >= from) byDay[l.date] = (byDay[l.date] || 0) + l.ms; }));
  const days = Object.values(byDay);
  return days.length ? { avg: days.reduce((a, b) => a + b, 0) / days.length / HOUR, days: days.length } : null;
}

// 오늘 계획: 남은 공부 가능 시간을 뽀모도로 단위로 나눠 우선순위 순서대로 배정하고, 빈 시간 구간에 시간 슬롯으로 배치한다.
// 1차) 마감까지 고르게 나눠 했을 때 "오늘 해야 하는 몫"을 우선순위 순서로 배정
// 2차) 남는 뽀모도로는 우선순위가 높은 과제부터 남은 작업량만큼 추가 배정

function planToday(now = Date.now(), recs = recommend(now)) {
  const pm = state.settings.pomodoro;
  const end = todayEnd(now);
  // 뽀모도로가 진행 중이면 그 단계(집중이면 뒤따르는 휴식까지)가 끝난 뒤부터 계획한다
  const tm = state.timer;
  const from = tm ? now + pomoLeft(now) + (tm.phase === 'focus' ? pm.short * MIN : 0) : now;
  const capMin = availableBetween(from, end) * 60;
  let left = Math.floor(capMin / (pm.focus + pm.short));
  const total = left;

  const items = recs.filter(({ p }) => p.work > 0).map(({ t, p }) => {
    const need = Math.ceil((p.work * 60) / pm.focus - 1e-9);
    const dueMs = new Date(t.due).getTime();
    const todayPart = availableBetween(from, Math.min(dueMs, end));
    const untilDue = availableBetween(from, dueMs);
    const share = untilDue > 0 ? todayPart / untilDue : 1;
    // 오늘 이후 마감 전까지 공부할 시간이 더 없으면 모자란 몫을 내일로 넘길 수 없다
    const lastDay = dueMs > now && untilDue - todayPart < 0.01;
    return { t, p, need, lastDay, required: Math.min(need, Math.ceil(need * share - 1e-9)), pomos: 0 };
  });
  items.forEach((it) => { const n = Math.min(it.required, left); it.pomos += n; left -= n; });
  items.forEach((it) => { const n = Math.min(it.need - it.pomos, left); it.pomos += n; left -= n; });

  // 긴 휴식·수업 사이 짧은 빈틈 때문에 실제로 들어가지 못한 뽀모도로는 빼고 센다
  const slots = layoutSlots(items.filter((it) => it.pomos > 0), from);
  const placed = new Map();
  slots.forEach((s) => placed.set(s.t, (placed.get(s.t) || 0) + s.pomos));
  items.forEach((it) => { it.pomos = placed.get(it.t) || 0; });
  // 모자란 몫을 내일로 넘길 수 있는 과제는 경고하지 않는다 (장기 부족은 7일 과부하 경고가 담당)
  const short = items.filter((it) => it.lastDay && it.pomos < it.required)
    .map((it) => ({ t: it.t, missing: it.required - it.pomos }));
  const planned = items.filter((it) => it.pomos > 0);
  return { items: planned, slots, total, used: planned.reduce((a, it) => a + it.pomos, 0), capMin, short };
}

// 뽀모도로를 빈 시간 구간에 차례로 배치. 같은 과제가 이어지면 한 슬롯으로 묶는다.
function layoutSlots(items, now = Date.now()) {
  const pm = state.settings.pomodoro;
  const free = freeSlotsToday(Math.ceil(now / (5 * MIN)) * 5 * MIN);
  const slots = [];
  let i = 0, cur = free.length ? free[0][0] : now, count = 0;
  const place = (ms) => {
    for (; i < free.length; i++) {
      const s = Math.max(cur, free[i][0]);
      if (s + ms <= free[i][1]) { cur = s + ms; return [s, cur]; }
    }
    return null;
  };
  for (const it of items) {
    for (let k = 0; k < it.pomos; k++) {
      const blk = place(pm.focus * MIN);
      if (!blk) return slots;
      const last = slots[slots.length - 1];
      if (last && last.t === it.t && blk[0] - last.end <= pm.long * MIN) { last.end = blk[1]; last.pomos++; }
      else slots.push({ t: it.t, start: blk[0], end: blk[1], pomos: 1 });
      count++;
      cur += (count % pm.longEvery ? pm.short : pm.long) * MIN;
    }
  }
  return slots;
}

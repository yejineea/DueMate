// 오늘 계획: 남은 공부 가능 시간을 뽀모도로 단위로 나눠 우선순위 순서대로 배정하고, 빈 시간 구간에 시간 슬롯으로 배치한다.
// 1차) 마감까지 고르게 나눠 했을 때 "오늘 해야 하는 몫"을 우선순위 순서로 배정
// 2차) 남는 뽀모도로는 우선순위가 높은 과제부터 남은 작업량만큼 추가 배정

function planToday(now = Date.now()) {
  const pm = state.settings.pomodoro;
  const end = todayEnd(now);
  const capMin = availableBetween(now, end) * 60;
  let left = Math.floor(capMin / (pm.focus + pm.short));
  const total = left;

  const items = recommend(now).filter(({ p }) => p.work > 0).map(({ t, p }) => {
    const need = Math.ceil((p.work * 60) / pm.focus - 1e-9);
    const todayPart = availableBetween(now, Math.min(new Date(t.due).getTime(), end));
    const share = p.avail > 0 ? todayPart / p.avail : 1;
    return { t, p, need, dueToday: new Date(t.due).getTime() <= end, required: Math.min(need, Math.ceil(need * share - 1e-9)), pomos: 0 };
  });
  items.forEach((it) => { const n = Math.min(it.required, left); it.pomos += n; left -= n; });
  // 내일 이후 마감 과제의 모자란 몫은 다음 날로 넘어가므로, 오늘 마감인 과제만 부족 경고를 띄운다
  const short = items.filter((it) => it.dueToday && it.pomos < it.required)
    .map((it) => ({ t: it.t, missing: it.required - it.pomos }));
  items.forEach((it) => { const n = Math.min(it.need - it.pomos, left); it.pomos += n; left -= n; });

  const planned = items.filter((it) => it.pomos > 0);
  return { items: planned, slots: layoutSlots(planned, now), total, used: total - left, capMin, short };
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

// 오늘 계획: 남은 공부 가능 시간을 뽀모도로 단위로 나눠 우선순위 순서대로 배정하고, 빈 시간 구간에 시간 슬롯으로 배치한다.
// 1차) 마감까지 고르게 나눠 했을 때 "오늘 해야 하는 몫"을 배정 (오늘이 마지막 기회인 과제 먼저, 그다음 우선순위 순)
// 2차) 남는 뽀모도로는 우선순위가 높은 과제부터 남은 작업량만큼 추가 배정
// 직접 수정: 사용자가 개수를 정한 과제(0 = 오늘 제외)는 그 값으로 고정하고, 남는 시간만 나머지 과제에 자동 배정한다.
//           순서를 바꾼 경우 그 순서대로 시간대에 배치한다. 수정 내용은 그날(활동일) 하루만 유지된다.

function planEditFor(now = Date.now()) {
  const day = ymd(activeDay(now));
  const e = state.planEdit;
  return e && e.date === day ? e : { date: day, pomos: {}, order: [] };
}

function planToday(now = Date.now(), recs = recommend(now)) {
  const pm = state.settings.pomodoro;
  const end = todayEnd(now);
  const edit = planEditFor(now);
  // 뽀모도로가 진행 중이면 그 단계(집중이면 뒤따르는 휴식까지)가 끝난 뒤부터 계획한다
  const tm = state.timer;
  const from = tm ? now + pomoLeft(now) + (tm.phase === 'focus' ? pm.short * MIN : 0) : now;
  const capMin = availableBetween(from, end) * 60;
  const total = Math.floor(capMin / (pm.focus + pm.short));

  const items = recs.filter(({ t, p }) => p.work > 0 || t.id in edit.pomos).map(({ t, p }) => {
    const need = Math.ceil((p.work * 60) / pm.focus - 1e-9);
    const dueMs = new Date(t.due).getTime();
    const todayPart = availableBetween(from, Math.min(dueMs, end));
    const untilDue = availableBetween(from, dueMs);
    const share = untilDue > 0 ? todayPart / untilDue : 1;
    // 오늘 이후 마감 전까지 공부할 시간이 더 없으면 모자란 몫을 내일로 넘길 수 없다
    const lastDay = dueMs > now && untilDue - todayPart < 0.01;
    const manual = t.id in edit.pomos;
    return { t, p, need, lastDay, manual, required: Math.min(need, Math.ceil(need * share - 1e-9)), pomos: manual ? edit.pomos[t.id] : 0 };
  });
  const auto = items.filter((it) => !it.manual);
  let left = Math.max(0, total - items.filter((it) => it.manual).reduce((a, it) => a + it.pomos, 0));
  // 오늘이 아니면 할 수 없는 몫(마감 전 남은 날이 없는 과제)을 가장 먼저, 그다음 나머지 과제의 오늘 몫
  const ordered = [...items.filter((it) => it.lastDay), ...items.filter((it) => !it.lastDay)];
  ordered.filter((it) => !it.manual).forEach((it) => { const n = Math.min(it.required, left); it.pomos += n; left -= n; });
  auto.forEach((it) => { const n = Math.min(it.need - it.pomos, left); it.pomos += n; left -= n; });

  // 배치 순서: 사용자가 정한 순서 → 나머지는 기본 순서
  const assigned = ordered.filter((it) => it.pomos > 0);
  const byOrder = edit.order.map((id) => assigned.find((it) => it.t.id === id)).filter(Boolean);
  const layoutOrder = [...byOrder, ...assigned.filter((it) => !byOrder.includes(it))];
  const assignedSum = assigned.reduce((a, it) => a + it.pomos, 0);

  // 긴 휴식·수업 사이 짧은 빈틈 때문에 실제로 들어가지 못한 뽀모도로는 빼고 센다
  const slots = layoutSlots(layoutOrder, from);
  const placed = new Map();
  slots.forEach((s) => placed.set(s.t, (placed.get(s.t) || 0) + s.pomos));
  items.forEach((it) => { it.pomos = placed.get(it.t) || 0; });
  // 모자란 몫을 내일로 넘길 수 있는 과제는 경고하지 않는다 (장기 부족은 7일 과부하 경고가 담당)
  const short = items.filter((it) => it.lastDay && it.pomos < it.required)
    .map((it) => ({ t: it.t, missing: it.required - it.pomos }));
  const planned = layoutOrder.filter((it) => it.pomos > 0);
  const used = planned.reduce((a, it) => a + it.pomos, 0);
  return {
    items: planned, slots, total, used, capMin, short,
    edited: Object.keys(edit.pomos).length > 0 || edit.order.length > 0,
    excluded: items.filter((it) => it.manual && edit.pomos[it.t.id] === 0).map((it) => it.t),
    overflow: assignedSum - used, // 시간 안에 들어가지 못한 뽀모도로 (직접 늘린 경우 등)
  };
}

// ---- 직접 수정 ----
function editPlan(fn) {
  slideKeep = null; // 계획을 바꾸면 슬라이드 순서도 새 계획대로
  const e = planEditFor();
  state.planEdit = { date: e.date, pomos: { ...e.pomos }, order: [...e.order] };
  fn(state.planEdit, planToday());
  save(); render();
}

const planCount = (tp, id) => (tp.items.find((it) => it.t.id === id) || { pomos: 0 }).pomos;

function planAdjust(id, delta) {
  editPlan((e, tp) => { e.pomos[id] = Math.max(0, Math.min(20, planCount(tp, id) + delta)); });
}
function planExclude(id) { editPlan((e) => { e.pomos[id] = 0; }); }
function planRestore(id) { editPlan((e) => { delete e.pomos[id]; }); }
function planAdd(id) { if (id) editPlan((e, tp) => { e.pomos[id] = Math.max(1, planCount(tp, id)); }); }
function planMove(id, dir) {
  editPlan((e, tp) => {
    const ids = tp.items.map((it) => it.t.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    e.order = ids;
  });
}
function planReset() { state.planEdit = null; slideKeep = null; save(); render(); toast('오늘 계획을 자동 계산으로 되돌렸습니다'); }

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

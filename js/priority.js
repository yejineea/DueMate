function priorityOf(t, now = Date.now()) {
  const hoursLeft = (new Date(t.due) - now) / 36e5;
  const work = remainingWork(t);
  const avail = availableUntil(t.due, now);
  const reasons = [];
  let score = 0;

  // 1) 마감 임박도 (최대 60)
  if (hoursLeft <= 0) { score += 60; reasons.push('마감이 이미 지났습니다'); }
  else if (hoursLeft <= 24) { score += 45; reasons.push(`마감까지 ${Math.max(1, Math.round(hoursLeft))}시간 남았습니다`); }
  else if (hoursLeft <= 72) { score += 30; reasons.push(`마감까지 ${Math.ceil(hoursLeft / 24)}일 남았습니다`); }
  else if (hoursLeft <= 168) { score += 15; reasons.push('이번 주 안에 마감입니다'); }
  else score += 5;

  // 2) 작업 압박도 = 남은 작업 시간 / 마감 전 공부 가능 시간 (최대 30)
  const ratio = avail > 0 ? work / avail : work > 0 ? 2 : 0;
  score += Math.min(ratio, 2) * 15;
  if (ratio >= 1) reasons.push(`남은 작업(${work.toFixed(1)}h)이 마감 전 공부 가능 시간(${avail.toFixed(1)}h)보다 많습니다`);
  else if (ratio >= 0.6) reasons.push(`마감 전 가용 시간의 ${Math.round(ratio * 100)}%가 필요합니다`);
  else if (work >= 3) reasons.push(`예상 작업 시간이 ${work.toFixed(1)}시간 남았습니다`);

  // 3) 중요도(최대 20) · 난이도(최대 10)
  score += t.importance * 4 + t.difficulty * 2;
  if (t.importance >= 4) reasons.push('중요도가 높습니다');
  if (t.difficulty >= 4) reasons.push('난이도가 높아 미리 시작해야 합니다');

  score = Math.round(score);
  return { score, hoursLeft, work, avail, ratio, reasons, level: score >= 70 ? 'high' : score >= 45 ? 'mid' : 'low' };
}

function priorityText(t) {
  const p = priorityOf(t);
  const tail = { high: '우선 처리하세요.', mid: '오늘 중 시작하는 것이 좋습니다.', low: '여유가 있으니 계획적으로 진행하세요.' }[p.level];
  return p.reasons.length ? `${p.reasons.join(' · ')} → ${tail}` : tail;
}

function recommend(now = Date.now()) {
  return state.tasks.filter((t) => !t.done)
    .map((t) => ({ t, p: priorityOf(t, now) }))
    .sort((a, b) => b.p.score - a.p.score || new Date(a.t.due) - new Date(b.t.due));
}

// 7일 과부하 분석: 과제 개수가 아니라 '남은 예상 작업 시간'으로 판단. 가용 시간은 지금 이후만 센다.
function weekLoad(weekStart, now = Date.now()) {
  const end = addDays(weekStart, 7);
  const days = [...Array(7)].map((_, i) => {
    const date = addDays(weekStart, i);
    const [ws, we] = dayWindow(date);
    return { date, load: 0, avail: availableBetween(Math.max(now, ws), we), tasks: [] };
  });
  let total = 0;
  state.tasks.filter((t) => !t.done).forEach((t) => {
    const due = new Date(t.due);
    if (due >= weekStart && due < end) {
      const i = Math.round((startOfDay(due) - weekStart) / 864e5);
      const w = remainingWork(t);
      days[i].load += w;
      days[i].tasks.push(t);
      total += w;
    }
  });
  let cum = 0;
  const today = startOfDay(new Date(now));
  days.forEach((d) => {
    cum += d.load;
    d.cumLoad = cum;
    d.cumAvail = availableUntil(addDays(d.date, 1), now);
    d.crunch = d.date >= today && d.load > 0 && cum > d.cumAvail;
  });
  const avail = +availableBetween(Math.max(weekStart.getTime(), now), end.getTime()).toFixed(1);
  return { days, total, avail, over: total > avail };
}

function priorityOf(t, now = Date.now()) {
  const hoursLeft = (new Date(t.due) - now) / 36e5;
  const work = remainingWork(t);
  const avail = availableUntil(t.due, now);
  const reasons = [];
  const tags = []; // 화면용 짧은 태그 [텍스트, 종류]
  let score = 0;

  // 1) 마감 임박도 (최대 60)
  if (hoursLeft <= 0) { score += 60; reasons.push('마감이 이미 지났습니다'); tags.push(['마감 지남', 'danger']); }
  else if (hoursLeft <= 24) { score += 45; reasons.push(`마감까지 ${Math.max(1, Math.round(hoursLeft))}시간 남았습니다`); tags.push([`${Math.max(1, Math.round(hoursLeft))}시간 남음`, 'danger']); }
  else if (hoursLeft <= 72) { score += 30; reasons.push(`마감까지 ${Math.ceil(hoursLeft / 24)}일 남았습니다`); tags.push([`${Math.ceil(hoursLeft / 24)}일 남음`, 'warn']); }
  else if (hoursLeft <= 168) { score += 15; reasons.push('이번 주 안에 마감입니다'); tags.push(['이번 주 마감', '']); }
  else score += 5;

  // 2) 작업 압박도 = 남은 작업 시간 / 마감 전 공부 가능 시간 (최대 30)
  const ratio = avail > 0 ? work / avail : work > 0 ? 2 : 0;
  score += Math.min(ratio, 2) * 15;
  if (ratio >= 1) { reasons.push(`남은 작업(${work.toFixed(1)}h)이 마감 전 공부 가능 시간(${avail.toFixed(1)}h)보다 많습니다`); tags.push([`시간 부족 ${work.toFixed(1)}h/${avail.toFixed(1)}h`, 'danger']); }
  else if (ratio >= 0.6) { reasons.push(`마감 전 가용 시간의 ${Math.round(ratio * 100)}%가 필요합니다`); tags.push([`가용 시간 ${Math.round(ratio * 100)}% 필요`, 'warn']); }
  else if (work >= 3) { reasons.push(`예상 작업 시간이 ${work.toFixed(1)}시간 남았습니다`); tags.push([`작업 ${work.toFixed(1)}h`, '']); }

  // 3) 중요도(최대 20) · 난이도(최대 10)
  score += t.importance * 4 + t.difficulty * 2;
  if (t.importance >= 4) { reasons.push('중요도가 높습니다'); tags.push(['중요도 높음', '']); }
  if (t.difficulty >= 4) { reasons.push('난이도가 높아 미리 시작해야 합니다'); tags.push(['난이도 높음', '']); }

  score = Math.round(score);
  const level = score >= 70 ? 'high' : score >= 45 ? 'mid' : 'low';
  tags.push([{ high: '우선 처리', mid: '오늘 시작', low: '여유 있음' }[level], `verdict-${level}`]);
  return { score, hoursLeft, work, avail, ratio, reasons, tags, level };
}

// 추천 이유를 문장 대신 짧은 태그로
function priorityTags(t, p = priorityOf(t)) {
  return `<div class="tags">${p.tags.map(([text, kind]) => `<span class="tag ${kind}">${esc(text)}</span>`).join('')}</div>`;
}

// 마감 알림: 임박 기준(설정) 안에 들어올 때 한 번, 1시간 전에 한 번. 보낸 알림은 기억해 반복하지 않는다.
function checkDeadlines(now = Date.now()) {
  if (!state.settings.deadlineNotify || DEMO) return [];
  const sent = [];
  state.tasks.filter((t) => !t.done).forEach((t) => {
    const h = (new Date(t.due) - now) / HOUR;
    const stage = h <= 0 ? null : h <= 1 ? '1h' : h <= state.settings.alertHours ? 'near' : null;
    const key = stage && `${t.id}|${t.due}|${stage}`;
    if (!key || state.notified.includes(key)) return;
    state.notified.push(key);
    sent.push({ t, stage });
  });
  if (!sent.length) return sent;
  state.notified = state.notified.slice(-200);
  save();
  sent.forEach(({ t, stage }) => {
    const msg = `마감 ${stage === '1h' ? '1시간 전' : remainText(t.due).replace(' 남음', ' 전')} · ${t.title}`;
    let shown = false;
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('DueMate 마감 알림', { body: msg }); shown = true; } catch (e) { /* 미지원 */ }
    }
    if (!shown) toast(msg);
  });
  return sent;
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

// 성과 탭: 모은 🍅(끝까지 마친 집중)로 이번 주 목표 달성, 요일별·주별 추이, 과목별 분포, 연속 집중일, 배지를 보여준다.

function pomoByDay(s = state) {
  const map = {};
  s.tasks.forEach((t) => t.logs.forEach((l) => { if (l.pomo) map[l.date] = (map[l.date] || 0) + 1; }));
  return map;
}

const weekDates = (weekStart) => [...Array(7)].map((_, i) => ymd(addDays(weekStart, i)));
const weekPomos = (weekStart, map) => weekDates(weekStart).reduce((a, d) => a + (map[d] || 0), 0);

// 연속 집중일: 오늘(또는 아직 안 했다면 어제)부터 거꾸로 🍅가 하나라도 있는 날이 이어진 수
function focusStreak(map, now = Date.now()) {
  let d = startOfDay(new Date(now));
  if (!map[ymd(d)]) d = addDays(d, -1);
  let n = 0;
  while (map[ymd(d)]) { n++; d = addDays(d, -1); }
  return n;
}

function bestStreak(map) {
  const days = Object.keys(map).filter((d) => map[d]).sort();
  let best = 0, run = 0, prev = null;
  days.forEach((d) => {
    run = prev && ymd(addDays(new Date(`${prev}T00:00`), 1)) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  });
  return best;
}

function badges(map, total, weekGoalHit) {
  const streak = bestStreak(map);
  const bestDay = Math.max(0, ...Object.values(map));
  return [
    ['🌱', '첫 토마토', '처음으로 집중 1회 완료', total >= 1],
    ['🍅', '토마토 10개', '누적 10개', total >= 10],
    ['🧺', '토마토 50개', '누적 50개', total >= 50],
    ['🏆', '토마토 100개', '누적 100개', total >= 100],
    ['🔥', '3일 연속', '3일 연속 집중', streak >= 3],
    ['⚡', '7일 연속', '7일 연속 집중', streak >= 7],
    ['💪', '하루 8개', '하루에 8개 (약 4시간 집중)', bestDay >= 8],
    ['🎯', '주간 목표 달성', '이번 주 목표 달성', weekGoalHit],
  ];
}

function renderAchievements() {
  const map = pomoByDay();
  const now = new Date();
  const ws = startOfWeek(now);
  const goal = state.settings.weeklyGoal;
  const thisWeek = weekPomos(ws, map);
  const lastWeek = weekPomos(addDays(ws, -7), map);
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  const focusMin = state.settings.pomodoro.focus;
  const streak = focusStreak(map);
  const diff = thisWeek - lastWeek;
  const pct = Math.min(100, Math.round((thisWeek / goal) * 100));

  const days = weekDates(ws).map((d, i) => ({ d, i, n: map[d] || 0, future: d > ymd(now) }));
  const maxDay = Math.max(1, ...days.map((x) => x.n));
  const weeks = [...Array(8)].map((_, i) => {
    const s = addDays(ws, -7 * (7 - i));
    return { label: i === 7 ? '이번 주' : `${s.getMonth() + 1}/${s.getDate()}`, value: weekPomos(s, map) };
  });
  const wk = new Set(weekDates(ws));
  const bySubject = {};
  state.tasks.forEach((t) => t.logs.forEach((l) => { if (l.pomo && wk.has(l.date)) bySubject[t.subject] = (bySubject[t.subject] || 0) + 1; }));
  const subjRows = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
  const maxSubj = Math.max(1, ...subjRows.map(([, n]) => n));

  return `
  <section class="panel tomato-guide">
    <div class="tg-icon">🍅</div>
    <div>
      <h3 style="margin:0 0 6px">토마토(🍅)란?</h3>
      <p class="small" style="margin:0">뽀모도로(pomodoro)는 이탈리아어로 <b>토마토</b>입니다. <b>${focusMin}분 집중 + ${state.settings.pomodoro.short}분 휴식</b>을 끝까지 마치면 🍅 1개를 모읍니다.
      중간에 멈추면 집중한 시간은 과제에 기록되지만 🍅는 생기지 않습니다. ${state.settings.pomodoro.longEvery}개마다 긴 휴식이 들어갑니다.
      오늘 계획의 "🍅×3"은 그 과제를 ${focusMin}분씩 3번 집중하라는 뜻입니다.</p>
    </div>
  </section>

  <section class="grid2">
    <div class="panel week-goal">
      <div class="toolbar" style="margin-bottom:6px">
        <h3 style="margin:0">이번 주 모은 토마토</h3>
        <span class="spacer"></span>
        <label class="small muted">주간 목표 <input type="number" min="1" max="200" data-setting="weeklyGoal" value="${goal}" style="width:70px"> 개</label>
      </div>
      <div class="big-count"><span class="tomato">🍅</span> <b>${thisWeek}</b> <span class="muted">/ ${goal}개</span></div>
      <div class="bar goal-bar"><span style="width:${pct}%"></span></div>
      <div class="small muted" style="margin-top:6px">
        ${thisWeek >= goal ? '<b class="green">이번 주 목표 달성! 🎉</b>' : `목표까지 ${goal - thisWeek}개`} ·
        지난주 ${lastWeek}개 (${diff >= 0 ? `+${diff}` : diff}) · 집중 ${+(thisWeek * focusMin / 60).toFixed(1)}시간
      </div>
      <div class="week-days">${days.map(({ d, i, n, future }) => `
        <div class="wd ${d === ymd(now) ? 'today' : ''} ${future ? 'future' : ''}">
          <div class="wd-bar"><span style="height:${(n / maxDay) * 100}%"></span></div>
          <b>${n || ''}</b><span>${WEEKDAYS[i]}</span>
        </div>`).join('')}</div>
    </div>
    <div class="panel">
      <h3>기록</h3>
      <div class="stat-grid">
        <div><div class="num">${streak}<small>일</small></div><div class="muted small">연속 집중일</div></div>
        <div><div class="num">${bestStreak(map)}<small>일</small></div><div class="muted small">최장 연속</div></div>
        <div><div class="num">${total}<small>개</small></div><div class="muted small">누적 토마토</div></div>
        <div><div class="num">${+(total * focusMin / 60).toFixed(1)}<small>h</small></div><div class="muted small">누적 집중 시간</div></div>
      </div>
      <h4>이번 주 과목별</h4>
      ${subjRows.length ? subjRows.map(([s, n]) => hRow(s, n, maxSubj, `🍅 ${n}`)).join('') : '<p class="muted small">이번 주에 모은 토마토가 아직 없습니다.</p>'}
    </div>
  </section>

  <section class="panel"><h3>주별 토마토 (최근 8주)</h3>${vChart(weeks)}</section>

  <section class="panel">
    <h3>배지</h3>
    <div class="badges">${badges(map, total, thisWeek >= goal).map(([icon, name, desc, on]) => `
      <div class="badge-card ${on ? 'on' : ''}" title="${esc(desc)}"><div class="bi">${icon}</div><b>${name}</b><span class="muted small">${desc}</span></div>`).join('')}</div>
  </section>`;
}

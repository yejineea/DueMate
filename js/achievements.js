// 토마토 키우기 탭 (재미 요소): 이번 주 모은 🍅만큼 화분의 토마토가 자란다. 주간 목표·요일별·8주 추이·연속 집중일·배지.

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

// 자라는 단계: 주간 목표 대비 이번 주 🍅 비율
const STAGES = ['씨앗', '새싹', '줄기', '꽃봉오리', '초록 토마토', '빨간 토마토'];
const STAGE_RULE = ['0개', '1개~', '25%~', '50%~', '75%~', '100%'];
const TALK = ['물 좀 주세요… 🍅 하나만요', '싹이 났어요! 조금만 더', '쑥쑥 크는 중이에요', '곧 꽃이 펴요!', '거의 다 익었어요!', '빨갛게 익었어요! 최고예요'];

// 표정(눈·눈썹·눈물·볼·입)만: 반지름 26, 중심 (30,34) 좌표계. 단계가 높을수록 웃는다 (0 울상 → 5 활짝)
function faceParts(stage) {
  const curve = [-7, -5, -1, 3, 6, 9][stage]; // 입꼬리: 음수면 처진 입
  const eyes = stage >= 4
    ? '<path class="tf-line" d="M17 27 q4 -4 8 0 M35 27 q4 -4 8 0"></path>'
    : '<circle class="tf-eye" cx="21" cy="27" r="2.8"></circle><circle class="tf-eye" cx="39" cy="27" r="2.8"></circle>';
  const tear = stage === 0 ? '<path class="tf-tear" d="M41 31 q-2.5 5 0 7 q2.5 -2 0 -7"></path>' : '';
  const brow = stage <= 1 ? '<path class="tf-line" d="M16 21 l8 2 M44 21 l-8 2"></path>' : '';
  const blush = stage >= 3 ? '<ellipse class="tf-blush" cx="14" cy="35" rx="4" ry="2.5"></ellipse><ellipse class="tf-blush" cx="46" cy="35" rx="4" ry="2.5"></ellipse>' : '';
  return `${brow}${eyes}${tear}${blush}<path class="tf-line" d="M22 ${40 - Math.min(0, curve) / 2} q8 ${curve} 16 0"></path>`;
}

// 화분 위 대표 토마토(또는 씨앗)에 얼굴을 그린다
function faceOn(x, y, r, stage) {
  const k = r / 26;
  return `<g class="pl-face" transform="translate(${x - 30 * k} ${y - 34 * k}) scale(${k})">${faceParts(stage)}</g>`;
}

function plantStage(count, goal) {
  const r = count / goal;
  return count === 0 ? 0 : r < 0.25 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : r < 1 ? 4 : 5;
}

function plantSvg(count, goal) {
  const stage = plantStage(count, goal);
  const r = Math.min(1, count / goal);
  const ground = 168, h = stage ? 26 + 110 * r : 0, top = ground - h;
  const parts = [];
  if (!stage) parts.push(`<circle class="pl-seed" cx="100" cy="${ground - 10}" r="12"></circle>${faceOn(100, ground - 10, 12, 0)}`);
  else {
    parts.push(`<path class="pl-stem" d="M100 ${ground} Q 94 ${ground - h / 2} 100 ${top}"></path>`);
    const leaves = Math.min(6, 1 + Math.floor(r * 6));
    for (let i = 0; i < leaves; i++) {
      const y = ground - ((i + 1) * h) / (leaves + 1), side = i % 2 ? 1 : -1;
      parts.push(`<ellipse class="pl-leaf" cx="${100 + side * 15}" cy="${y}" rx="14" ry="6" transform="rotate(${side * -28} ${100 + side * 15} ${y})"></ellipse>`);
    }
    parts.push(`<ellipse class="pl-leaf" cx="93" cy="${top}" rx="9" ry="4" transform="rotate(30 93 ${top})"></ellipse>
      <ellipse class="pl-leaf" cx="107" cy="${top}" rx="9" ry="4" transform="rotate(-30 107 ${top})"></ellipse>`);
    if (stage >= 3) {
      const spots = [[78, 0.35], [122, 0.45], [80, 0.6], [124, 0.25], [76, 0.82], [100, 0.6]]; // 오른쪽 위는 대표 토마토 자리
      const n = stage === 3 ? 3 : stage === 4 ? 5 : 6;
      const reds = stage === 5 ? n : stage === 4 ? Math.round(((r - 0.75) / 0.25) * n) : 0;
      spots.slice(0, n).forEach(([x, f], i) => {
        const y = ground - h * f;
        parts.push(stage === 3
          ? `<circle class="pl-bud" cx="${x}" cy="${y}" r="4"></circle>`
          : `<circle class="${i < reds ? 'pl-fruit' : 'pl-green'}" cx="${x}" cy="${y}" r="${stage === 5 ? 10 : 8}"></circle>
             <path class="pl-cap" d="M${x - 4} ${y - 7} L${x} ${y - 4} L${x + 4} ${y - 7}"></path>`);
      });
    }
    // 대표 토마토: 꼭대기 오른쪽 가지에 매달려 단계별 표정을 짓는다 (빨간 토마토 단계에서만 빨강)
    const mr = [0, 10, 12, 13, 15, 17][stage];
    const mx = 142, my = top + Math.max(mr + 10, h * 0.22);
    parts.push(`<path class="pl-stem thin" d="M101 ${my - mr - 12} Q ${mx - 12} ${my - mr - 16} ${mx} ${my - mr}"></path>
      <circle class="${stage === 5 ? 'pl-fruit' : 'pl-green'} pl-main" cx="${mx}" cy="${my}" r="${mr}"></circle>
      <path class="pl-cap" d="M${mx - 6} ${my - mr - 1} L${mx} ${my - mr + 4} L${mx + 6} ${my - mr - 1}"></path>
      ${faceOn(mx, my, mr, stage)}`);
  }
  return `<svg class="plant" viewBox="0 0 200 220" aria-hidden="true">
    ${parts.join('')}
    <rect class="pl-soil" x="58" y="${ground - 2}" width="84" height="8" rx="3"></rect>
    <path class="pl-pot" d="M56 ${ground + 4} H144 L134 212 H66 Z"></path>
  </svg>`;
}

function badges(map, total, weekGoalHit) {
  const streak = bestStreak(map);
  const bestDay = Math.max(0, ...Object.values(map));
  return [
    ['🌱', '첫 토마토', '집중 1회 완료', total >= 1],
    ['🍅', '토마토 10개', '누적 10개', total >= 10],
    ['🧺', '토마토 50개', '누적 50개', total >= 50],
    ['🏆', '토마토 100개', '누적 100개', total >= 100],
    ['🔥', '3일 연속', '3일 연속 집중', streak >= 3],
    ['⚡', '7일 연속', '7일 연속 집중', streak >= 7],
    ['💪', '하루 8개', '하루 8개 (약 4시간)', bestDay >= 8],
    ['🎯', '주간 목표', '이번 주 목표 달성', weekGoalHit],
  ];
}

function renderAchievements() {
  const map = pomoByDay();
  const now = new Date();
  const ws = startOfWeek(now);
  const goal = state.settings.weeklyGoal;
  const pm = state.settings.pomodoro;
  const thisWeek = weekPomos(ws, map);
  const lastWeek = weekPomos(addDays(ws, -7), map);
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  const stage = plantStage(thisWeek, goal);
  const nextAt = [1, 0.25, 0.5, 0.75, 1].map((f, i) => (i === 0 ? 1 : Math.ceil(goal * f)))[stage];
  const diff = thisWeek - lastWeek;
  const pct = Math.min(100, Math.round((thisWeek / goal) * 100));

  const days = weekDates(ws).map((d, i) => ({ d, i, n: map[d] || 0, future: d > ymd(now) }));
  const maxDay = Math.max(1, ...days.map((x) => x.n));
  const weeks = [...Array(8)].map((_, i) => {
    const s = addDays(ws, -7 * (7 - i));
    return { label: i === 7 ? '이번 주' : `${s.getMonth() + 1}/${s.getDate()}`, value: weekPomos(s, map) };
  });

  return `
  <section class="grid2">
    <div class="panel plant-card">
      <div class="toolbar" style="margin-bottom:0">
        <h3 style="margin:0">이번 주 토마토</h3>
        <span class="spacer"></span>
        <span class="muted small" title="${pm.focus}분 집중 + ${pm.short}분 휴식을 끝까지 마치면 🍅 1개">🍅 = ${pm.focus}분 집중 완료</span>
      </div>
      <div class="plant-wrap">
        ${plantSvg(thisWeek, goal)}
        <div class="bubble">${TALK[stage]}</div>
      </div>
      <div class="plant-stage"><b>${STAGES[stage]}</b>${stage < 5 ? ` · 다음 단계까지 🍅 ${Math.max(1, nextAt - thisWeek)}개` : ' · 수확 완료! 🎉'}</div>
      <div class="stage-rule">${STAGES.map((n, i) => `<span class="${i === stage ? 'on' : i < stage ? 'past' : ''}">${n}<small>${STAGE_RULE[i]}</small></span>`).join('')}</div>
      <div class="muted small">기준: 주간 목표 대비 이번 주 🍅</div>
    </div>
    <div class="panel week-goal">
      <div class="toolbar" style="margin-bottom:6px">
        <h3 style="margin:0">주간 목표</h3>
        <span class="spacer"></span>
        <label class="small muted"><input type="number" min="1" max="200" data-setting="weeklyGoal" value="${goal}" style="width:64px"> 개</label>
      </div>
      <div class="big-count"><b>${thisWeek}</b> <span class="muted">/ ${goal}개</span></div>
      <div class="bar goal-bar"><span style="width:${pct}%"></span></div>
      <div class="small muted" style="margin-top:6px">${thisWeek >= goal ? '<b class="green">목표 달성</b>' : `남은 🍅 ${goal - thisWeek}개`} · 지난주 대비 ${diff >= 0 ? `+${diff}` : diff}</div>
      <div class="week-days">${days.map(({ d, i, n, future }) => `
        <div class="wd ${d === ymd(now) ? 'today' : ''} ${future ? 'future' : ''}">
          <div class="wd-bar"><span style="height:${(n / maxDay) * 100}%"></span></div>
          <b>${n || ''}</b><span>${WEEKDAYS[i]}</span>
        </div>`).join('')}</div>
      <div class="stat-grid" style="margin-top:14px">
        <div><div class="num">${focusStreak(map)}<small>일</small></div><div class="muted small">연속 집중</div></div>
        <div><div class="num">${bestStreak(map)}<small>일</small></div><div class="muted small">최장 연속</div></div>
        <div><div class="num">${total}<small>개</small></div><div class="muted small">누적 🍅</div></div>
        <div><div class="num">${+((total * pm.focus) / 60).toFixed(1)}<small>h</small></div><div class="muted small">누적 집중</div></div>
      </div>
    </div>
  </section>

  <section class="panel"><h3>주별 토마토</h3>${vChart(weeks)}</section>

  <section class="panel">
    <h3>배지</h3>
    <div class="badges">${badges(map, total, thisWeek >= goal).map(([icon, name, desc, on]) => `
      <div class="badge-card ${on ? 'on' : ''}" title="${esc(desc)}"><div class="bi">${icon}</div><b>${name}</b><span class="muted small">${desc}</span></div>`).join('')}</div>
  </section>`;
}

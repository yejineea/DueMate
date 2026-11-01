// 데모 전용: ?demo&at=15:00 (또는 at=2026-11-02T15:00) 이면 그 시각인 것처럼 시계를 옮긴다 (README 스크린샷용, 실제 데이터와 무관)
(() => {
  const q = new URLSearchParams(location.search);
  const at = q.has('demo') && q.get('at');
  if (!at) return;
  const RealDate = Date;
  const target = at.includes('T') ? new RealDate(at) : new RealDate(`${new RealDate().toISOString().slice(0, 10)}T${at}`);
  if (Number.isNaN(target.getTime())) return;
  const offset = target - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
    static now() { return RealDate.now() + offset; }
  }
  window.Date = ShiftedDate;
})();

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const DOW = '일월화수목금토';
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hours = (ms) => +(ms / 36e5).toFixed(1);
const MIN = 6e4, HOUR = 36e5;
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const weekdayIdx = (d) => (d.getDay() + 6) % 7; // 월=0 ... 일=6

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function fmtDay(d) { return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; }
function fmtDue(due) { const d = new Date(due); return `${fmtDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function fmtClock(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1e3));
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
}

function fmtDur(ms) {
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function remainText(due) {
  const ms = new Date(due) - Date.now();
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 864e5), h = Math.floor((abs % 864e5) / 36e5), m = Math.floor((abs % 36e5) / 6e4);
  const t = d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  return ms < 0 ? `${t} 지남` : `${t} 남음`;
}

let toastTimer;
let toastUndo = null; // 토스트의 "되돌리기" 버튼이 실행할 함수
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = esc(msg) + (undo ? ' <button class="toast-btn" data-action="toast-undo">되돌리기</button>' : '');
  toastUndo = undo || null;
  el.classList.toggle('actionable', !!undo);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); toastUndo = null; }, undo ? 6000 : 2200);
}

function runToastUndo() {
  const fn = toastUndo;
  toastUndo = null;
  $('#toast').classList.remove('show');
  if (fn) fn();
}

function hRow(label, value, max, text, over = false) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="hrow"><span>${esc(label)}</span><div class="htrack"><div class="hfill ${over ? 'over' : ''}" style="width:${w}%"></div></div><span>${text}</span></div>`;
}

function vChart(rows, unit = '') {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="vchart">${rows.map((r) => `
    <div class="vcol">
      <div class="vbar-wrap"><div class="vbar" style="height:${(r.value / max) * 100}%"></div></div>
      <div class="vval">${r.value}${unit}</div>
      <div class="vlabel">${esc(r.label)}</div>
    </div>`).join('')}</div>`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

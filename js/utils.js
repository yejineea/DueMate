const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const DOW = '일월화수목금토';
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hours = (ms) => +(ms / 36e5).toFixed(1);

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function fmtDay(d) { return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; }
function fmtDue(due) { const d = new Date(due); return `${fmtDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

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
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
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

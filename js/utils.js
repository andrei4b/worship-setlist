/* utils.js — DOM helper, JSON (de)serialization, toasts. */
(function () {

// ---- Tiny DOM builder ----
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
    }
  }
  if ((tag === 'input' || tag === 'textarea') && !node.hasAttribute('autocomplete')) {
    node.setAttribute('autocomplete', 'off');
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

// ---- Diacritic-insensitive search ----
// So searching "a" also matches "ă"/"â", "s" matches "ș"/"ş", "t" matches "ț"/"ţ", etc.
function normalizeForSearch(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't');
}

// ---- Toast ----
function toast(message, opts = {}) {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'toast' + (opts.variant ? ' toast--' + opts.variant : '') }, message);
  root.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--in'));
  setTimeout(() => {
    t.classList.remove('toast--in');
    setTimeout(() => t.remove(), 250);
  }, opts.duration || 2200);
}

// ---- Debounce ----
function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function normalizePace(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'slow') return 'Slow';
  if (v === 'medium') return 'Medium';
  if (v === 'fast') return 'Fast';
  return '';
}

function songsToJSON(songs) {
  return JSON.stringify({ type: 'worship-planner-songs', version: 1, songs }, null, 2);
}

function jsonToSongs(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data.songs || []);
  return list.map(s => ({
    id: s.id && typeof s.id === 'string' ? s.id : DB.uid(),
    title: s.title || 'Untitled',
    key: s.key || '',
    tempo: s.tempo || '',
    link: s.link || '',
    pace: normalizePace(s.pace),
    createdAt: s.createdAt || Date.now()
  }));
}

function dateStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- Setlist naming from a date (Romanian day/month names) ----
const RO_MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const RO_DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

// dateInputValue is a "YYYY-MM-DD" string, as produced by <input type="date">.
// Parsed as local calendar values (not UTC) so the date never shifts a day
// depending on the browser's timezone.
function parseDateInput(dateInputValue) {
  const [y, m, d] = String(dateInputValue || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function setlistNameFromDate(dateInputValue) {
  const date = parseDateInput(dateInputValue);
  return `${date.getDate()} ${RO_MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
}

function weekdayNameFromJSDate(date) {
  const day = RO_DAYS[date.getDay()];
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function weekdayNameFromDate(dateInputValue) {
  return weekdayNameFromJSDate(parseDateInput(dateInputValue));
}

// Capitalized Romanian weekday names, indexed like Date#getDay() (0 = Sunday).
const WEEKDAY_NAMES = RO_DAYS.map(d => d.charAt(0).toUpperCase() + d.slice(1));

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback
    const ta = el('textarea', { style: 'position:fixed;left:-9999px' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  }
}

window.UI = { el, clear, escapeHtml, toast, debounce, normalizeForSearch, setlistNameFromDate, weekdayNameFromDate, weekdayNameFromJSDate, weekdayNames: WEEKDAY_NAMES, parseDateInput };
window.JSONUtil = { songsToJSON, jsonToSongs };
window.FileUtil = { downloadFile, copyToClipboard, dateStamp };

})();

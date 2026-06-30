/* utils.js — DOM helper, CSV/JSON (de)serialization, toasts. */
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

// ---- CSV ----
const SONG_FIELDS = ['title', 'key', 'tempo', 'link', 'structure', 'tags', 'pace'];

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function songsToCSV(songs) {
  const header = SONG_FIELDS.join(',');
  const rows = songs.map(s => SONG_FIELDS.map(f => {
    const v = f === 'tags' ? (s.tags || []).join('|') : s[f];
    return csvEscape(v);
  }).join(','));
  return [header, ...rows].join('\n');
}

function parseCSV(text) {
  // Simple RFC4180-ish parser supporting quoted fields with commas/newlines.
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && !(r.length === 1 && r[0] === ''));
}

function csvToSongs(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const dataRows = rows.slice(1);
  return dataRows.map(r => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return {
      id: DB.uid(),
      title: obj.title || 'Untitled',
      key: obj.key || '',
      tempo: obj.tempo || '',
      link: obj.link || '',
      structure: obj.structure || '',
      tags: obj.tags ? obj.tags.split('|').map(t => t.trim()).filter(Boolean) : [],
      pace: normalizePace(obj.pace),
      createdAt: Date.now()
    };
  });
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
    structure: s.structure || '',
    tags: Array.isArray(s.tags) ? s.tags : (typeof s.tags === 'string' ? s.tags.split('|').map(t => t.trim()).filter(Boolean) : []),
    pace: normalizePace(s.pace),
    createdAt: s.createdAt || Date.now()
  }));
}

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

window.UI = { el, clear, escapeHtml, toast, debounce };
window.CSVUtil = { songsToCSV, csvToSongs };
window.JSONUtil = { songsToJSON, jsonToSongs };
window.FileUtil = { downloadFile, copyToClipboard };

})();

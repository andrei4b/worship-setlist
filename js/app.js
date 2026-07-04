/* app.js — shell: tab switching, shared sheet (modal) manager, boot */
(function () {

const { el: $el, clear: $clear } = UI;

// ---- Keep sheets clear of the on-screen keyboard ----
// The visual viewport shrinks (and can shift) when the keyboard opens, but
// fixed-position elements stay sized to the full layout viewport by default.
// Mirror the visual viewport into CSS vars so the sheet backdrop tracks it.
function syncViewportInsets() {
  const vv = window.visualViewport;
  const root = document.documentElement.style;
  root.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px');
  root.setProperty('--vv-top', (vv ? vv.offsetTop : 0) + 'px');
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncViewportInsets);
  window.visualViewport.addEventListener('scroll', syncViewportInsets);
}
syncViewportInsets();

// ---- Shared sheet/modal manager (supports stacking) ----
const _sheetStack = [];

// One page-level "back" action (e.g. a tab's own detail view) can be
// registered at a time; the phone's back button/gesture closes sheets
// first (one at a time), and only runs this once no sheet is open.
let _pageBackHandler = null;
function setPageBackHandler(fn) { _pageBackHandler = fn; }

function openSheet(title, bodyEl, footerEl) {
  // Dim/hide the previous sheet (if any) instead of destroying it, so it
  // survives underneath and we can return to it when this one closes.
  if (_sheetStack.length) {
    const prev = _sheetStack[_sheetStack.length - 1];
    prev.style.visibility = 'hidden';
  }

  const backdrop = $el('div', { class: 'sheet-backdrop' });
  const sheet = $el('div', { class: 'sheet' },
    $el('div', { class: 'sheet-handle' }),
    $el('div', { class: 'sheet-header' },
      $el('h2', null, title),
      $el('button', { class: 'sheet-close', onclick: () => closeSheet() }, '✕')
    ),
    $el('div', { class: 'sheet-body' }, bodyEl),
    footerEl || null
  );
  backdrop.appendChild(sheet);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => backdrop.classList.add('is-open'));

  _sheetStack.push(backdrop);
  history.pushState({ sheet: true }, '');
  return backdrop;
}

// When we close a sheet (or a page) ourselves and just need to consume the
// history entry it pushed, the resulting popstate must be a no-op — the UI
// is already correct. This counter tells the popstate listener how many
// upcoming events to swallow silently, as opposed to a genuine back-button
// press (which still needs to run the real close/back logic).
let _skipNextPopstates = 0;
function silentHistoryBack(steps) {
  const n = steps || 1;
  _skipNextPopstates++;
  if (n > 1) history.go(-n); else history.back();
}

function closeSheet(closeAll, _fromPopstate) {
  if (!_sheetStack.length) return;

  if (closeAll === true) {
    const count = _sheetStack.length;
    while (_sheetStack.length) {
      const b = _sheetStack.pop();
      b.remove();
    }
    document.body.style.overflow = '';
    if (!_fromPopstate) silentHistoryBack(count);
    return;
  }

  const top = _sheetStack.pop();
  top.classList.remove('is-open');
  setTimeout(() => top.remove(), 220);

  if (_sheetStack.length) {
    // Reveal the sheet underneath again.
    _sheetStack[_sheetStack.length - 1].style.visibility = 'visible';
  } else {
    document.body.style.overflow = '';
  }
  if (!_fromPopstate) silentHistoryBack();
}

// Phone back button/gesture: close the topmost sheet first, one per press;
// only once no sheet is open does the active tab's own page handler run.
window.addEventListener('popstate', () => {
  if (_skipNextPopstates > 0) {
    _skipNextPopstates--;
    return;
  }
  if (_sheetStack.length) {
    closeSheet(false, true);
    return;
  }
  if (_pageBackHandler) {
    const handler = _pageBackHandler;
    _pageBackHandler = null;
    handler();
  }
});

// Action menu (e.g. for setlist item options) — small bottom sheet of buttons
function openActionMenu(items) {
  const body = $el('div', { class: 'menu-list' },
    ...items.map(item => $el('button', {
      class: 'menu-item' + (item.danger ? ' is-danger' : ''),
      onclick: () => {
        closeSheet();
        // Let the close (and its history.back()) fully settle before
        // running the action — doing it synchronously races an in-flight
        // back() against anything the action pushes (e.g. a follow-up
        // sheet), corrupting the history stack.
        setTimeout(() => item.onClick(), 220);
      }
    },
      $el('span', { class: 'icon' }, item.icon || ''),
      item.label
    ))
  );
  openSheet(' ', body, null);
}

window.openSheet = openSheet;
window.closeSheet = closeSheet;
window.openActionMenu = openActionMenu;
window.setPageBackHandler = setPageBackHandler;
window.silentHistoryBack = silentHistoryBack;

// ---- Tab bar icons (inline SVG, no deps) ----
const ICONS = {
  songs: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  setlists: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>`
};

// ---- App shell ----
function boot() {
  const appRoot = document.getElementById('app');
  $clear(appRoot);

  const songsContainer = $el('div', { style: 'display:flex; flex-direction:column; flex:1;' });
  const setlistsContainer = $el('div', { style: 'display:none; flex-direction:column; flex:1;' });

  const tabbar = $el('div', { class: 'tabbar' },
    $el('button', { class: 'tabbar-btn is-active', id: 'tab-songs-btn', onclick: () => switchTab('songs') },
      $el('span', { html: ICONS.songs }), 'Songs'),
    $el('button', { class: 'tabbar-btn', id: 'tab-setlists-btn', onclick: () => switchTab('setlists') },
      $el('span', { html: ICONS.setlists }), 'Setlists')
  );

  appRoot.appendChild(songsContainer);
  appRoot.appendChild(setlistsContainer);
  appRoot.appendChild(tabbar);

  const songsApi = createSongsTab(songsContainer, {
    refreshSetlists: () => setlistsApi.load()
  });
  const setlistsApi = createSetlistsTab(setlistsContainer, {
    getSongs: () => songsApi.getSongs(),
    refreshSongs: () => songsApi.load()
  });

  songsApi.load();
  setlistsApi.load();

  function switchTab(which) {
    const showSongs = which === 'songs';
    songsContainer.style.display = showSongs ? 'flex' : 'none';
    setlistsContainer.style.display = showSongs ? 'none' : 'flex';
    document.getElementById('tab-songs-btn').classList.toggle('is-active', showSongs);
    document.getElementById('tab-setlists-btn').classList.toggle('is-active', !showSongs);
    if (!showSongs) setlistsApi.refresh();
  }
}

document.addEventListener('DOMContentLoaded', boot);

})();

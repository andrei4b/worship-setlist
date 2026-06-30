/* app.js — shell: tab switching, shared sheet (modal) manager, boot */
(function () {

const { el: $el, clear: $clear } = UI;

// ---- Shared sheet/modal manager (supports stacking) ----
const _sheetStack = [];

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
  return backdrop;
}

function closeSheet(closeAll) {
  if (!_sheetStack.length) return;

  if (closeAll === true) {
    while (_sheetStack.length) {
      const b = _sheetStack.pop();
      b.remove();
    }
    document.body.style.overflow = '';
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
}

// Action menu (e.g. for setlist item options) — small bottom sheet of buttons
function openActionMenu(items) {
  const body = $el('div', { class: 'menu-list' },
    ...items.map(item => $el('button', {
      class: 'menu-item' + (item.danger ? ' is-danger' : ''),
      onclick: () => { closeSheet(); item.onClick(); }
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

  const songsApi = createSongsTab(songsContainer, {});
  const setlistsApi = createSetlistsTab(setlistsContainer, { getSongs: () => songsApi.getSongs() });

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

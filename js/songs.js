/* songs.js — Songs tab: list, search, sort, CRUD, import/export */
(function () {

const { el, clear, escapeHtml, toast, debounce, normalizeForSearch, setlistNameFromDate, parseDateInput, describeDbError } = UI;

const PACE_OPTIONS = ['Slow', 'Medium', 'Fast'];
const INDEX_LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

function groupLetter(title) {
  const c = (title || '').trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

// Matches setlists.js's own sort — most recent setlist date first, falling
// back to last-modified time for setlists saved before the date field
// existed.
function setlistSortKey(sl) {
  const date = sl.date ? parseDateInput(sl.date) : new Date(sl.updatedAt || sl.createdAt || Date.now());
  return date.getTime();
}

// Matches setlists.js's own canManage — admins can add to any setlist,
// everyone else only their own. Keeps the "add to setlist" picker from
// listing setlists a tap would just silently fail to write to.
function canManageSetlist(sl) {
  const user = Auth.currentUser();
  return Auth.isAdmin() || !!(user && sl.ownerId === user.uid);
}

function createSongsTab(container, ctx) {
  let songs = [];
  let query = '';
  let paceFilter = null;

  const root = el('div');
  container.appendChild(root);

  async function load() {
    songs = await DB.getSongs();
    render();
  }

  function getFiltered() {
    let list = songs;
    if (query.trim()) {
      const q = normalizeForSearch(query.trim());
      list = list.filter(s => normalizeForSearch(s.title).includes(q));
    }
    if (paceFilter) list = list.filter(s => s.pace === paceFilter);
    list = [...list];
    list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }

  function render() {
    clear(root);

    const header = el('div', { class: 'app-header' },
      el('div', { class: 'app-header-top' },
        el('h1', { class: 'app-title' },
          el('span', { class: 'mark' }, '♪'),
          'Songs',
          el('span', { class: 'title-count' }, `(${songs.length})`)
        ),
        el('button', { class: 'kebab-btn', title: 'More options', onclick: openSongsMenu }, '⋮')
      ),
      el('div', { class: 'searchbar' },
        el('input', {
          type: 'search',
          placeholder: 'Search songs…',
          value: query,
          oninput: debounce((e) => { query = e.target.value; renderList(); }, 150)
        })
      ),
      el('div', { class: 'sort-row' },
        ...PACE_OPTIONS.map(pace =>
          el('button', {
            class: `chip-btn chip-btn--pace-${pace.toLowerCase()}` + (paceFilter === pace ? ' is-active' : ''),
            onclick: () => { paceFilter = paceFilter === pace ? null : pace; renderList(); updatePaceChips(); }
          }, pace)
        )
      )
    );
    root.appendChild(header);

    const main = el('div', { class: 'app-main' });
    root.appendChild(main);

    const listWrap = el('div');
    main.appendChild(listWrap);

    const scrubberWrap = el('div', { class: 'index-scrubber-wrap' });
    root.appendChild(scrubberWrap);

    // Single FAB: add song — admin-only, songs are curated by admins.
    if (Auth.isAdmin()) {
      root.appendChild(el('button', { class: 'fab', title: 'Add song', onclick: () => openSongForm(null) }, '+'));
    }

    function renderList() {
      const list = getFiltered();
      renderListInto(listWrap, list);
      renderScrubber(scrubberWrap, listWrap, list);
    }
    function updatePaceChips() {
      header.querySelectorAll('.chip-btn').forEach((btn, i) => {
        btn.classList.toggle('is-active', PACE_OPTIONS[i] === paceFilter);
      });
    }

    renderList();
    root._renderList = renderList;
  }

  function renderListInto(wrap, list) {
    clear(wrap);

    if (songs.length === 0) {
      wrap.appendChild(emptyState(
        '♪',
        'No songs yet',
        'Add your first song, or import a list from a JSON file.'
      ));
      return;
    }
    if (list.length === 0) {
      wrap.appendChild(emptyState('🔍', 'No matches', 'Try a different search term.'));
      return;
    }

    const listEl = el('div', { class: 'list' });
    list.forEach(song => listEl.appendChild(songCard(song)));
    wrap.appendChild(listEl);
  }

  // ---- A–Z index scrubber ----
  function renderScrubber(container, listWrap, list) {
    clear(container);
    if (!list.length) return;

    const available = new Set(list.map(s => groupLetter(s.title)));
    const popover = el('div', { class: 'index-popover' });
    const bar = el('div', { class: 'index-scrubber' },
      ...INDEX_LETTERS.map(letter =>
        el('span', { class: 'index-letter' + (available.has(letter) ? '' : ' is-dim') }, letter)
      )
    );
    container.appendChild(bar);
    container.appendChild(popover);

    function letterAtY(clientY) {
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(0.999, Math.max(0, (clientY - rect.top) / rect.height));
      return INDEX_LETTERS[Math.floor(ratio * INDEX_LETTERS.length)];
    }
    function nearestAvailable(letter) {
      if (available.has(letter)) return letter;
      const idx = INDEX_LETTERS.indexOf(letter);
      for (let d = 1; d < INDEX_LETTERS.length; d++) {
        if (idx - d >= 0 && available.has(INDEX_LETTERS[idx - d])) return INDEX_LETTERS[idx - d];
        if (idx + d < INDEX_LETTERS.length && available.has(INDEX_LETTERS[idx + d])) return INDEX_LETTERS[idx + d];
      }
      return null;
    }
    function activate(clientY) {
      const letter = letterAtY(clientY);
      const target = nearestAvailable(letter);
      popover.textContent = letter;
      // Offset well above the touch point so a finger doesn't cover the bubble.
      const popoverY = Math.max(clientY - 80, 40);
      popover.style.top = popoverY + 'px';
      popover.classList.add('is-visible');
      if (target) {
        const rowEl = listWrap.querySelector(`[data-letter="${target}"]`);
        if (rowEl) {
          // The page (not .app-main) is what actually scrolls, and the sticky
          // header overlays the top of it, so scrollIntoView alone would land
          // the row underneath the header instead of just below it.
          const header = document.querySelector('.app-header');
          const headerHeight = header ? header.getBoundingClientRect().height : 0;
          const rowTop = rowEl.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: Math.max(0, rowTop - headerHeight - 8), behavior: 'auto' });
        }
      }
    }
    function clientYFromEvent(e) {
      return e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
    }
    function onMove(e) { activate(clientYFromEvent(e)); }
    function onEnd() {
      popover.classList.remove('is-visible');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    }
    bar.addEventListener('touchstart', onMove, { passive: true });
    bar.addEventListener('touchmove', (e) => { onMove(e); e.preventDefault(); }, { passive: false });
    bar.addEventListener('touchend', onEnd);
    bar.addEventListener('mousedown', (e) => {
      onMove(e);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
    });
  }

  function songCard(song) {
    const chips = [];
    if (song.key) chips.push(el('span', { class: 'mini-chip mini-chip--key' }, song.key));
    if (song.tempo) chips.push(el('span', { class: 'mini-chip mini-chip--tempo' }, song.tempo));

    const cardClass = 'song-card' + (song.pace ? ' song-card--pace-' + song.pace.toLowerCase() : '');
    const cardEl = el('div', { class: cardClass, title: song.pace || undefined },
      el('div', { class: 'song-card-top' },
        el('h3', { class: 'song-card-title' },
          song.link ? el('a', {
            class: 'song-card-title-link',
            href: song.link,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: 'Open link',
            onclick: (e) => e.stopPropagation()
          }, song.title) : song.title
        ),
        el('div', { class: 'song-card-chips' }, ...chips)
      )
    );

    const actionEl = el('div', { class: 'song-swipe-action' }, '+ Add');
    const wrap = el('div', { class: 'song-swipe-wrap', 'data-letter': groupLetter(song.title) },
      actionEl,
      cardEl
    );
    attachSwipeGestures(cardEl, actionEl, song);
    return wrap;
  }

  // ---- Swipe right = add to setlist, swipe left = edit ----
  function attachSwipeGestures(cardEl, actionEl, song) {
    const THRESHOLD = 88;
    const MAX_REVEAL = 120;
    let dragging = false, decided = false, isHorizontal = false, swiped = false;
    let startX = 0, startY = 0, dx = 0;

    function setTransform(x) { cardEl.style.transform = x ? `translateX(${x}px)` : ''; }
    function updateAction(x) {
      if (x > 0) {
        actionEl.textContent = '+ Add';
        actionEl.classList.remove('is-edit');
      } else if (x < 0) {
        actionEl.textContent = '✎ Edit';
        actionEl.classList.add('is-edit');
      }
    }
    function settle() {
      cardEl.classList.add('is-swipe-animating');
      cardEl.classList.remove('is-swiping');
      setTransform(0);
    }
    function onStart(clientX, clientY) {
      dragging = true; decided = false; isHorizontal = false;
      startX = clientX; startY = clientY; dx = 0;
      cardEl.classList.remove('is-swipe-animating');
    }
    function onMove(clientX, clientY) {
      if (!dragging) return false;
      const rawDx = clientX - startX;
      const rawDy = clientY - startY;
      if (!decided) {
        if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return false;
        decided = true;
        isHorizontal = Math.abs(rawDx) > Math.abs(rawDy);
        if (!isHorizontal) { dragging = false; return false; }
      }
      if (!isHorizontal) return false;
      cardEl.classList.add('is-swiping');
      // Left-swipe reveals "Edit", which only admins can do — clamp it away
      // entirely for everyone else so the row simply doesn't swipe that way.
      const minReveal = Auth.isAdmin() ? -MAX_REVEAL : 0;
      dx = Math.max(minReveal, Math.min(MAX_REVEAL, rawDx));
      if (Math.abs(dx) > 4) swiped = true;
      updateAction(dx);
      setTransform(dx);
      return true;
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      const commitAdd = dx >= THRESHOLD;
      const commitEdit = dx <= -THRESHOLD;
      settle();
      if (commitAdd) openAddToSetlistSheet(song);
      else if (commitEdit) openSongForm(song);
    }

    cardEl.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }, { passive: true });
    cardEl.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (onMove(t.clientX, t.clientY)) e.preventDefault();
    }, { passive: false });
    cardEl.addEventListener('touchend', onEnd);
    cardEl.addEventListener('touchcancel', onEnd);

    cardEl.addEventListener('mousedown', (e) => {
      onStart(e.clientX, e.clientY);
      const onMouseMove = (e2) => onMove(e2.clientX, e2.clientY);
      const onMouseUp = () => {
        onEnd();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    cardEl.addEventListener('click', (e) => {
      if (swiped) { e.preventDefault(); e.stopPropagation(); swiped = false; }
    });
  }

  // ---- Add to setlist ----
  async function openAddToSetlistSheet(song) {
    const allSetlists = (await DB.getSetlists()).sort((a, b) => setlistSortKey(b) - setlistSortKey(a));
    // Only setlists you can actually write to — showing others' setlists
    // here would just be a tap that silently fails against the rules.
    const setlists = allSetlists.filter(canManageSetlist);

    async function addToSetlist(sl) {
      sl.items = sl.items || [];
      sl.items.push({ type: 'song', songId: song.id });
      sl.updatedAt = Date.now();
      try {
        await DB.saveSetlist(sl);
      } catch (err) { toast(describeDbError(err), { variant: 'danger' }); return; }
      if (ctx.refreshSetlists) ctx.refreshSetlists();
      closeSheet(true);
      toast(`Added to "${sl.name || 'Untitled setlist'}"`);
    }

    function openNewSetlistPrompt() {
      const todayStr = FileUtil.dateStamp();
      let sundayService = null;

      const dateInput = el('input', {
        type: 'date',
        value: todayStr,
        onchange: () => { nameInput.value = setlistNameFromDate(dateInput.value || todayStr); syncSundayField(); }
      });
      const nameInput = el('input', { type: 'text', placeholder: 'e.g. Sunday Morning', value: setlistNameFromDate(todayStr) });
      const bandInput = el('input', { type: 'text', placeholder: 'e.g. Youth Band' });

      const amBtn = el('button', { type: 'button', class: 'segmented-btn', onclick: () => { sundayService = 'AM'; updateSundayButtons(); } }, 'AM');
      const pmBtn = el('button', { type: 'button', class: 'segmented-btn', onclick: () => { sundayService = 'PM'; updateSundayButtons(); } }, 'PM');
      function updateSundayButtons() {
        amBtn.classList.toggle('is-active', sundayService === 'AM');
        pmBtn.classList.toggle('is-active', sundayService === 'PM');
      }
      const sundayField = formField('Service', el('div', { class: 'segmented-toggle' }, amBtn, pmBtn));

      function syncSundayField() {
        const isSunday = parseDateInput(dateInput.value || todayStr).getDay() === 0;
        sundayField.style.display = isSunday ? '' : 'none';
        if (isSunday && !sundayService) sundayService = 'AM';
        updateSundayButtons();
      }
      syncSundayField();

      const body = el('div', null,
        formField('Date', dateInput),
        sundayField,
        formField('Setlist name', nameInput),
        formField('Band name', bandInput, 'Optional')
      );
      const footer = el('div', { class: 'sheet-footer' },
        el('button', {
          class: 'btn btn--primary btn--block',
          onclick: () => {
            const date = dateInput.value;
            const name = nameInput.value.trim();
            const band = bandInput.value.trim();
            if (!date) { toast('Date is required', { variant: 'danger' }); return; }
            if (!name) { toast('Setlist name is required', { variant: 'danger' }); return; }
            const isSunday = parseDateInput(date).getDay() === 0;
            if (isSunday && !sundayService) { toast('Please select AM or PM', { variant: 'danger' }); return; }
            addToSetlist({ id: DB.uid(), name, date, band, sundayService: isSunday ? sundayService : null, items: [], createdAt: Date.now(), updatedAt: Date.now() });
          }
        }, 'Create & Add')
      );
      openSheet('New setlist', body, footer);
    }

    const newRow = el('button', { class: 'chip-btn picker-new-btn', onclick: openNewSetlistPrompt }, '+ New setlist');

    const listEl = el('div', { class: 'picker-list' },
      newRow,
      ...setlists.map(sl => el('div', {
        class: 'picker-row',
        onclick: () => addToSetlist(sl)
      },
        el('div', { class: 'picker-row-title' }, sl.name || 'Untitled setlist'),
        el('div', { class: 'picker-row-meta' }, `${(sl.items || []).length} item${(sl.items || []).length === 1 ? '' : 's'}`)
      ))
    );
    openSheet(`Add "${song.title}" to a setlist`, listEl, null);
  }

  function emptyState(glyph, title, body) {
    return el('div', { class: 'empty-state' },
      el('div', { class: 'glyph' }, glyph),
      el('h3', null, title),
      el('p', null, body)
    );
  }

  // ---- Song form sheet ----
  function openSongForm(song) {
    const isEdit = !!song;
    const draft = song ? { ...song } : {
      title: '', key: '', tempo: '', link: '', pace: ''
    };

    const titleInput = el('input', { type: 'text', value: draft.title, placeholder: 'e.g. Amazing Grace' });
    const keyInput = el('input', { type: 'text', value: draft.key, placeholder: 'e.g. G' });
    const tempoInput = el('input', { type: 'text', value: draft.tempo, placeholder: 'e.g. 72' });
    const linkInput = el('input', { type: 'url', value: draft.link, placeholder: 'https://…' });
    const paceSelect = el('select', null,
      el('option', { value: '' }, 'None'),
      el('option', { value: 'Slow', selected: draft.pace === 'Slow' }, 'Slow'),
      el('option', { value: 'Medium', selected: draft.pace === 'Medium' }, 'Medium'),
      el('option', { value: 'Fast', selected: draft.pace === 'Fast' }, 'Fast')
    );
    paceSelect.value = draft.pace || '';

    const body = el('div', null,
      formField('Title', titleInput),
      el('div', { class: 'field-row' },
        formField('Key', keyInput),
        formField('Tempo (BPM)', tempoInput)
      ),
      formFieldWithAction('Link', linkInput, 'Chord chart, video, or audio reference', () => {
        const url = linkInput.value.trim();
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      }),
      formField('Pace', paceSelect, 'Slow, Medium, or Fast')
    );

    const footer = el('div', { class: 'sheet-footer' },
      isEdit ? el('button', {
        class: 'btn btn--danger',
        onclick: async () => {
          if (!confirm(`Delete "${draft.title}"? This can't be undone.`)) return;
          try {
            await DB.deleteSong(draft.id);
          } catch (err) { toast(describeDbError(err), { variant: 'danger' }); return; }
          songs = songs.filter(s => s.id !== draft.id);
          closeSheet();
          render();
          toast('Song deleted');
        }
      }, 'Delete') : null,
      el('button', {
        class: 'btn btn--primary',
        onclick: async () => {
          const title = titleInput.value.trim();
          if (!title) { toast('Title is required', { variant: 'danger' }); return; }
          const toSave = {
            id: draft.id || DB.uid(),
            title,
            key: keyInput.value.trim(),
            tempo: tempoInput.value.trim(),
            link: linkInput.value.trim(),
            pace: paceSelect.value,
            createdAt: draft.createdAt || Date.now()
          };
          try {
            await DB.saveSong(toSave);
          } catch (err) { toast(describeDbError(err), { variant: 'danger' }); return; }
          const idx = songs.findIndex(s => s.id === toSave.id);
          if (idx >= 0) songs[idx] = toSave; else songs.push(toSave);
          closeSheet();
          render();
          toast(isEdit ? 'Song updated' : 'Song added');
        }
      }, isEdit ? 'Save changes' : 'Add song')
    );

    openSheet(isEdit ? 'Edit song' : 'New song', body, footer);
  }

  // ---- 3-dot menu ----
  function openSongsMenu() {
    openActionMenu([
      ...(Auth.isAdmin() ? [{ icon: '⬇', label: 'Import songs', onClick: openImportSheet }] : []),
      { icon: '⬆', label: 'Export all songs', onClick: exportSongsJSON },
      ...(Auth.isAdmin() ? [{ icon: '🗑', label: 'Delete all songs', danger: true, onClick: confirmDeleteAllSongs }] : []),
      ...(window.accountMenuItems ? window.accountMenuItems() : []),
    ]);
  }

  async function confirmDeleteAllSongs() {
    if (!songs.length) { toast('No songs to delete', { variant: 'danger' }); return; }
    if (!confirm(`Delete all ${songs.length} song${songs.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    try {
      await DB.clearSongs();
    } catch (err) { toast(describeDbError(err), { variant: 'danger' }); return; }
    songs = [];
    render();
    toast('All songs deleted');
  }

  // ---- Import ----
  function openImportSheet() {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    document.body.appendChild(fileInput);
    fileInput.addEventListener('cancel', () => fileInput.remove());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.remove();
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSONUtil.jsonToSongs(text);
        if (!imported.length) { toast('No songs found in file', { variant: 'danger' }); return; }
        await DB.bulkSaveSongs(imported);
        songs = [...songs, ...imported];
        render();
        toast(`Imported ${imported.length} song${imported.length === 1 ? '' : 's'}`);
      } catch (err) {
        console.error(err);
        const msg = err && err.code === 'permission-denied' ? describeDbError(err) : 'Could not read that file';
        toast(msg, { variant: 'danger' });
      }
    });

    fileInput.click();
  }

  function exportSongsJSON() {
    if (!songs.length) { toast('No songs to export', { variant: 'danger' }); return; }
    const filename = `songs-${FileUtil.dateStamp()}.json`;
    FileUtil.downloadFile(filename, JSONUtil.songsToJSON(songs), 'application/json');
    toast('Saved ' + filename);
  }

  function formField(label, inputEl, hint) {
    return el('div', { class: 'field' },
      el('label', null, label),
      inputEl,
      hint ? el('div', { class: 'field-hint' }, hint) : null
    );
  }

  function formFieldWithAction(label, inputEl, hint, onOpen) {
    return el('div', { class: 'field' },
      el('label', null, label),
      el('div', { class: 'field-with-action' },
        inputEl,
        el('button', {
          type: 'button',
          class: 'field-action-btn',
          title: 'Open link',
          onclick: onOpen
        }, '↗')
      ),
      hint ? el('div', { class: 'field-hint' }, hint) : null
    );
  }

  // Public refresh hook (e.g. after setlist tab modifies nothing, but for future use)
  return {
    load,
    getSongs: () => songs
  };
}

window.createSongsTab = createSongsTab;

})();

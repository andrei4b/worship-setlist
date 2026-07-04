/* setlists.js — Setlists tab: list + full detail page with drag reorder, auto-save */
(function () {

function createSetlistsTab(container, ctx) {
  const { el, clear, toast, debounce, normalizeForSearch } = UI;

  let setlists = [];
  let query = '';

  // Two child views inside container: list and detail
  const listView  = el('div', { class: 'page-view' });
  const detailView = el('div', { class: 'page-view page-view--hidden' });
  container.appendChild(listView);
  container.appendChild(detailView);

  async function load() {
    setlists = await DB.getSetlists();
    renderList();
  }

  function refresh() { renderList(); }

  function getSongById(id) {
    return ctx.getSongs().find(s => s.id === id) || null;
  }

  // ── Auto-save ──────────────────────────────────────────────────────────
  async function autoSave(setlist) {
    setlist.updatedAt = Date.now();
    await DB.saveSetlist(setlist);
    const idx = setlists.findIndex(s => s.id === setlist.id);
    if (idx >= 0) setlists[idx] = setlist; else setlists.push(setlist);
  }

  // ── Page transitions ───────────────────────────────────────────────────
  function showDetail(setlist) {
    renderDetail(setlist);
    listView.classList.add('page-view--hidden');
    detailView.classList.remove('page-view--hidden');
    detailView.classList.add('page-view--slide-in');
    requestAnimationFrame(() => detailView.classList.remove('page-view--slide-in'));
  }

  function showList() {
    listView.classList.remove('page-view--hidden');
    detailView.classList.add('page-view--slide-out');
    setTimeout(() => {
      detailView.classList.add('page-view--hidden');
      detailView.classList.remove('page-view--slide-out');
      clear(detailView);
    }, 260);
    renderList(); // refresh list (name/date may have changed)
  }

  // ── List view ──────────────────────────────────────────────────────────
  function getFiltered() {
    let list = setlists;
    if (query.trim()) {
      const q = normalizeForSearch(query.trim());
      list = list.filter(sl => normalizeForSearch(sl.name).includes(q));
    }
    list = [...list];
    list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return list;
  }

  function renderList() {
    clear(listView);

    const header = el('div', { class: 'app-header' },
      el('div', { class: 'app-header-top' },
        el('h1', { class: 'app-title' }, el('span', { class: 'mark' }, '☰'), 'Setlists'),
        el('button', { class: 'kebab-btn', title: 'More options', onclick: openSetlistsMenu }, '⋮')
      ),
      el('div', { class: 'searchbar' },
        el('input', {
          type: 'search',
          placeholder: 'Search setlists…',
          value: query,
          oninput: debounce((e) => { query = e.target.value; renderListItems(); }, 150)
        })
      )
    );
    listView.appendChild(header);

    const main = el('div', { class: 'app-main' });
    listView.appendChild(main);
    const listWrap = el('div');
    main.appendChild(listWrap);
    renderListItemsInto(listWrap);

    listView.appendChild(
      el('button', { class: 'fab', title: 'New setlist', onclick: createNewSetlist }, '+')
    );

    function renderListItems() { renderListItemsInto(listWrap); }
  }

  function renderListItemsInto(wrap) {
    clear(wrap);
    const list = getFiltered();
    if (setlists.length === 0) {
      wrap.appendChild(emptyState('☰', 'No setlists yet', 'Create your first setlist from songs you\u2019ve added.'));
      return;
    }
    if (list.length === 0) {
      wrap.appendChild(emptyState('🔍', 'No matches', 'Try a different search term.'));
      return;
    }
    const listEl = el('div', { class: 'list' });
    list.forEach(sl => listEl.appendChild(setlistCard(sl)));
    wrap.appendChild(listEl);
  }

  function setlistCard(sl) {
    const items = sl.items || [];
    const songCount = items.filter(i => i.type === 'song').length;
    const date = new Date(sl.updatedAt || sl.createdAt || Date.now());
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return el('div', { class: 'setlist-card', onclick: () => showDetail(sl) },
      el('h3', { class: 'setlist-card-title' }, sl.name || 'Untitled setlist'),
      el('div', { class: 'setlist-card-sub' }, `${songCount} song${songCount === 1 ? '' : 's'} · ${dateStr}`)
    );
  }

  async function createNewSetlist() {
    const sl = { id: DB.uid(), name: 'New setlist', items: [], createdAt: Date.now(), updatedAt: Date.now() };
    await DB.saveSetlist(sl);
    setlists.push(sl);
    showDetail(sl);
  }

  function emptyState(glyph, title, body) {
    return el('div', { class: 'empty-state' },
      el('div', { class: 'glyph' }, glyph),
      el('h3', null, title),
      el('p', null, body)
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────
  function renderDetail(setlist) {
    clear(detailView);

    // Working copy
    const draft = { ...setlist, items: (setlist.items || []).map(i => ({ ...i })) };
    let activeIdx = null;

    // ---- Top bar ----
    const titleEl = el('span', { class: 'detail-title-text' }, draft.name || 'Untitled setlist');
    const titleInput = el('input', {
      class: 'detail-title-input',
      type: 'text',
      value: draft.name,
      placeholder: 'Setlist name'
    });
    titleInput.style.display = 'none';

    // Toggle inline edit on title click
    titleEl.addEventListener('click', () => {
      titleEl.style.display = 'none';
      titleInput.style.display = '';
      titleInput.focus();
      titleInput.select();
    });

    async function commitTitleEdit() {
      const val = titleInput.value.trim();
      if (val) draft.name = val;
      titleEl.textContent = draft.name || 'Untitled setlist';
      titleEl.style.display = '';
      titleInput.style.display = 'none';
      await autoSave(draft);
    }
    titleInput.addEventListener('blur', commitTitleEdit);
    titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') titleInput.blur(); });

    async function handleBack() {
      if (draft.items.length === 0) {
        await DB.deleteSetlist(draft.id);
        setlists = setlists.filter(s => s.id !== draft.id);
      }
      showList();
    }

    const topBar = el('div', { class: 'detail-topbar' },
      el('button', { class: 'detail-back-btn', onclick: handleBack, title: 'Back' },
        el('span', null, '←')
      ),
      el('div', { class: 'detail-title-wrap' }, titleEl, titleInput),
      el('div', { class: 'detail-topbar-actions' },
        el('button', {
          class: 'kebab-btn',
          title: 'More options',
          onclick: () => openDetailMenu(draft)
        }, '⋮')
      )
    );
    detailView.appendChild(topBar);

    // ---- Items list ----
    const itemsWrap = el('div', { class: 'detail-items' });
    detailView.appendChild(itemsWrap);

    // ---- Add bar ----
    const addBar = el('div', { class: 'detail-add-bar' },
      el('button', { class: 'btn btn--secondary', style: 'flex:1', onclick: openAddSongPicker }, '+ Song'),
      el('button', { class: 'btn btn--secondary', style: 'flex:1', onclick: openAddTextEntry }, '+ Text entry')
    );
    detailView.appendChild(addBar);

    renderItems();

    // ── Render items ───────────────────────────────────────────────────
    function renderItems() {
      clear(itemsWrap);
      if (!draft.items.length) {
        itemsWrap.appendChild(el('p', { class: 'detail-empty', style: 'padding:24px 20px; color:var(--ink-faint); font-size:14px;' },
          'No items yet. Add a song or a text entry below.'));
        return;
      }
      draft.items.forEach((item, idx) => itemsWrap.appendChild(buildItemRow(item, idx)));
      initDragSort(itemsWrap, draft, async () => { await autoSave(draft); renderItems(); });
    }

    function buildItemRow(item, idx) {
      let titleLine, subLine = null;

      if (item.type === 'song') {
        const song = getSongById(item.songId);
        const title = song ? song.title : '(song removed)';
        const effectiveKey = item.keyOverride || (song ? song.key : '');
        const effectiveTempo = song ? song.tempo : '';

        const titleBits = [el('span', { class: 'setlist-item-title' }, title)];
        if (effectiveKey) {
          titleBits.push(el('span', {
            class: 'setlist-item-inline-meta' + (item.keyOverride ? ' is-overridden' : '')
          }, effectiveKey));
        }
        if (effectiveTempo) titleBits.push(el('span', { class: 'setlist-item-inline-meta' }, effectiveTempo));
        titleLine = el('div', { class: 'setlist-item-titleline' }, ...titleBits);

        if (item.notes) {
          subLine = el('div', { class: 'setlist-item-meta' }, el('span', null, '\u201C' + item.notes + '\u201D'));
        }
      } else {
        titleLine = el('div', { class: 'setlist-item-titleline' },
          el('span', { class: 'setlist-item-title is-text' }, item.text || '(empty)')
        );
      }

      const body = subLine
        ? el('div', { class: 'setlist-item-body' }, titleLine, subLine)
        : el('div', { class: 'setlist-item-body' }, titleLine);

      const row = el('div', { class: 'drag-item', 'data-idx': String(idx) },
        el('div', { class: 'drag-handle', title: 'Drag to reorder' },
          el('span', { class: 'drag-dots' }, '⠿')
        ),
        body,
        el('div', { class: 'setlist-item-actions' },
          el('button', { class: 'icon-btn', title: 'Edit', onclick: (e) => { e.stopPropagation(); editItem(idx); } }, '✎'),
          el('button', { class: 'icon-btn is-danger', title: 'Remove', onclick: (e) => { e.stopPropagation(); removeItem(idx); } }, '✕')
        )
      );
      if (idx === activeIdx) row.classList.add('is-active');
      row.addEventListener('click', () => setActiveIdx(idx));
      return row;
    }

    function setActiveIdx(idx) {
      const next = activeIdx === idx ? null : idx;
      activeIdx = next;
      itemsWrap.querySelectorAll('.drag-item').forEach(row => {
        row.classList.toggle('is-active', parseInt(row.getAttribute('data-idx'), 10) === next);
      });
    }

    async function removeItem(idx) {
      draft.items.splice(idx, 1);
      await autoSave(draft);
      renderItems();
    }

    function editItem(idx) {
      const item = draft.items[idx];
      if (item.type === 'song') openSongOverrideEditor(item, async () => { await autoSave(draft); renderItems(); });
      else openTextEntryEditor(item, async () => { await autoSave(draft); renderItems(); });
    }

    // ── Song override editor ───────────────────────────────────────────
    function openSongOverrideEditor(item, onSave) {
      const song = getSongById(item.songId);
      const keyInput = el('input', { type: 'text', value: item.keyOverride || '', placeholder: song ? `Default: ${song.key || '—'}` : '' });
      const notesInput = el('textarea', { placeholder: 'Optional notes (e.g. capo 2, start quiet)' }, item.notes || '');
      const body = el('div', null,
        el('p', { style: 'font-weight:600;margin:0 0 14px;font-family:var(--font-display);font-size:16px;' }, song ? song.title : '(song removed)'),
        formField('Key override', keyInput, 'Leave blank to use the song\u2019s default key'),
        formField('Notes', notesInput)
      );
      const footer = el('div', { class: 'sheet-footer' },
        el('button', { class: 'btn btn--primary btn--block', onclick: () => {
          item.keyOverride = keyInput.value.trim();
          item.notes = notesInput.value.trim();
          closeSheet(); onSave();
        }}, 'Save')
      );
      openSheet('Edit entry', body, footer);
    }

    function openTextEntryEditor(item, onSave) {
      const textInput = el('textarea', { placeholder: 'e.g. Welcome, Offering, Scripture reading…' }, item.text || '');
      const body = el('div', null, formField('Text', textInput));
      const footer = el('div', { class: 'sheet-footer' },
        el('button', { class: 'btn btn--primary btn--block', onclick: () => {
          const val = textInput.value.trim();
          if (!val) { toast('Text can\u2019t be empty', { variant: 'danger' }); return; }
          item.text = val; closeSheet(); onSave();
        }}, 'Save')
      );
      openSheet('Edit text entry', body, footer);
    }

    // ── Song picker ────────────────────────────────────────────────────
    function openAddSongPicker() {
      const allSongs = ctx.getSongs();
      let pq = '';
      const searchInput = el('input', { type: 'search', placeholder: 'Search songs…' });
      const listEl = el('div', { class: 'picker-list' });

      function renderPicker() {
        clear(listEl);
        const filtered = pq.trim()
          ? allSongs.filter(s => normalizeForSearch(s.title).includes(normalizeForSearch(pq.trim())))
          : allSongs;
        if (!filtered.length) {
          listEl.appendChild(el('p', { class: 'field-hint', style: 'padding:14px 0' },
            allSongs.length ? 'No songs match your search.' : 'Add songs in the Songs tab first.'));
          return;
        }
        filtered.forEach(song => {
          listEl.appendChild(el('div', { class: 'picker-row', onclick: async () => {
            draft.items.push({ type: 'song', songId: song.id, keyOverride: '', notes: '' });
            closeSheet();
            await autoSave(draft);
            renderItems();
          }},
            el('div', null,
              el('div', { class: 'picker-row-title' }, song.title),
              el('div', { class: 'picker-row-meta' }, [song.key, song.tempo ? song.tempo + ' bpm' : ''].filter(Boolean).join(' · '))
            ),
            el('span', { style: 'color:var(--accent);font-size:20px;font-weight:600;' }, '+')
          ));
        });
      }
      searchInput.addEventListener('input', debounce((e) => { pq = e.target.value; renderPicker(); }, 120));
      renderPicker();
      openSheet('Add a song', el('div', null, el('div', { class: 'field' }, searchInput), listEl), null);
    }

    function openAddTextEntry() {
      const textInput = el('textarea', { placeholder: 'e.g. Welcome & Announcements, Offering, Scripture reading…' });
      const body = el('div', null, formField('Text', textInput));
      const footer = el('div', { class: 'sheet-footer' },
        el('button', { class: 'btn btn--primary btn--block', onclick: async () => {
          const val = textInput.value.trim();
          if (!val) { toast('Text can\u2019t be empty', { variant: 'danger' }); return; }
          draft.items.push({ type: 'text', text: val });
          closeSheet();
          await autoSave(draft);
          renderItems();
        }}, 'Add')
      );
      openSheet('Add text entry', body, footer);
    }
  }

  // ── Drag-to-reorder ────────────────────────────────────────────────────
  function initDragSort(container, draft, onDrop) {
    let dragging = null;
    let placeholder = null;
    let startY = 0;
    let startIdx = 0;
    let containerRect = null;

    function getRows() { return Array.from(container.querySelectorAll('.drag-item')); }

    function getIdx(el) { return parseInt(el.getAttribute('data-idx'), 10); }

    function makePlaceholder(height) {
      const ph = document.createElement('div');
      ph.className = 'drag-placeholder';
      ph.style.height = height + 'px';
      return ph;
    }

    container.querySelectorAll('.drag-handle').forEach(handle => {
      handle.addEventListener('touchstart', onTouchStart, { passive: false });
      handle.addEventListener('mousedown', onMouseDown);
    });

    function startDrag(row, clientY) {
      dragging = row;
      startIdx = getIdx(row);
      startY = clientY;
      containerRect = container.getBoundingClientRect();

      const rect = row.getBoundingClientRect();
      placeholder = makePlaceholder(rect.height);

      row.classList.add('drag-item--dragging');
      row.style.width = rect.width + 'px';
      row.style.top = (rect.top - containerRect.top + container.scrollTop) + 'px';
      row.style.left = (rect.left - containerRect.left) + 'px';

      container.insertBefore(placeholder, row);
      container.appendChild(row); // move to end so it renders on top
    }

    function moveDrag(clientY) {
      if (!dragging) return;
      const dy = clientY - startY;
      const rect = dragging.getBoundingClientRect();
      const rowTop = parseFloat(dragging.style.top) + dy;
      dragging.style.top = rowTop + 'px';
      startY = clientY;

      // Find where placeholder should go
      const rows = getRows().filter(r => r !== dragging);
      const midY = dragging.getBoundingClientRect().top + dragging.offsetHeight / 2;

      let insertBefore = null;
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        if (midY < r.top + r.height / 2) { insertBefore = row; break; }
      }
      if (insertBefore) container.insertBefore(placeholder, insertBefore);
      else container.appendChild(placeholder);
    }

    async function endDrag() {
      if (!dragging) return;
      dragging.classList.remove('drag-item--dragging');
      dragging.style.cssText = '';

      // Determine new index from placeholder position
      const rows = Array.from(container.querySelectorAll('.drag-item, .drag-placeholder'));
      const phIdx = rows.indexOf(placeholder);
      let newIdx = 0;
      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i] === placeholder) { newIdx = count; break; }
        if (rows[i].classList.contains('drag-item')) count++;
      }

      placeholder.remove();
      placeholder = null;

      // Re-insert dragging element at correct DOM position
      const remainingRows = Array.from(container.querySelectorAll('.drag-item'));
      if (newIdx >= remainingRows.length) container.appendChild(dragging);
      else container.insertBefore(dragging, remainingRows[newIdx]);

      // Update draft items array
      if (newIdx !== startIdx) {
        const [moved] = draft.items.splice(startIdx, 1);
        draft.items.splice(newIdx, 0, moved);
        await onDrop();
      }

      dragging = null;
    }

    function onTouchStart(e) {
      const row = e.target.closest('.drag-item');
      if (!row) return;
      e.preventDefault();
      startDrag(row, e.touches[0].clientY);
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    }
    function onTouchMove(e) { e.preventDefault(); moveDrag(e.touches[0].clientY); }
    function onTouchEnd() {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      endDrag();
    }

    function onMouseDown(e) {
      const row = e.target.closest('.drag-item');
      if (!row) return;
      startDrag(row, e.clientY);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    function onMouseMove(e) { moveDrag(e.clientY); }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      endDrag();
    }
  }

  // ── Clipboard export ───────────────────────────────────────────────────
  async function copySetlistText(setlist) {
    const lines = (setlist.items || []).map(item => {
      if (item.type === 'text') return `--${item.text}`;
      const song = getSongById(item.songId);
      if (!song) return '(song removed)';
      return `${song.title} (${item.keyOverride || song.key || '—'}) - ${song.tempo || '—'}`;
    });
    const text = (setlist.name ? setlist.name + '\n\n' : '') + lines.join('\n');
    const ok = await FileUtil.copyToClipboard(text);
    toast(ok ? 'Copied to clipboard' : 'Could not copy — try again');
  }

  // ── Bundle format helpers ──────────────────────────────────────────────
  // A bundle = { type, version, songs: [...], setlists: [...] }
  // Songs referenced by each setlist are embedded so the file is self-contained.

  function buildBundle(setlistsToExport) {
    // Collect all unique song IDs referenced
    const songIds = new Set();
    setlistsToExport.forEach(sl => {
      (sl.items || []).forEach(item => { if (item.type === 'song') songIds.add(item.songId); });
    });
    const referencedSongs = ctx.getSongs().filter(s => songIds.has(s.id));
    return JSON.stringify({
      type: 'worship-planner-bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: referencedSongs,
      setlists: setlistsToExport
    }, null, 2);
  }

  async function importBundle(text) {
    const data = JSON.parse(text);
    // Accept both bundle format and plain setlist array
    const incomingSongs = data.songs || [];
    const incomingSetlists = Array.isArray(data) ? data : (data.setlists || [data]);

    // Merge songs (skip if ID already exists)
    const existingIds = new Set(ctx.getSongs().map(s => s.id));
    const newSongs = incomingSongs.filter(s => !existingIds.has(s.id));
    if (newSongs.length) {
      await DB.bulkSaveSongs(newSongs);
      await ctx.refreshSongs();
    }

    // Merge setlists (skip if ID already exists)
    const existingSlIds = new Set(setlists.map(s => s.id));
    const newSetlists = incomingSetlists.filter(sl => !existingSlIds.has(sl.id)).map(sl => ({
      ...sl,
      id: sl.id || DB.uid(),
      createdAt: sl.createdAt || Date.now(),
      updatedAt: sl.updatedAt || Date.now()
    }));
    for (const sl of newSetlists) await DB.saveSetlist(sl);
    setlists = [...setlists, ...newSetlists];

    return { songs: newSongs.length, setlists: newSetlists.length };
  }

  // ── Setlists list 3-dot menu ───────────────────────────────────────────
  function openSetlistsMenu() {
    openActionMenu([
      { icon: '⬇', label: 'Import setlists', onClick: openSetlistImportSheet },
      { icon: '⬆', label: 'Export all setlists', onClick: exportAllSetlists },
      { icon: '🗑', label: 'Delete all setlists', danger: true, onClick: confirmDeleteAllSetlists },
    ]);
  }

  async function confirmDeleteAllSetlists() {
    if (!setlists.length) { toast('No setlists to delete', { variant: 'danger' }); return; }
    if (!confirm(`Delete all ${setlists.length} setlist${setlists.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    await DB.clearSetlists();
    setlists = [];
    renderList();
    toast('All setlists deleted');
  }

  function exportAllSetlists() {
    if (!setlists.length) { toast('No setlists to export', { variant: 'danger' }); return; }
    const filename = `setlists-${FileUtil.dateStamp()}.json`;
    FileUtil.downloadFile(filename, buildBundle(setlists), 'application/json');
    toast('Saved ' + filename);
  }

  function openSetlistImportSheet() {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    document.body.appendChild(fileInput);
    fileInput.addEventListener('cancel', () => fileInput.remove());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.remove();
      if (!file) return;
      try {
        const text = await file.text();
        const result = await importBundle(text);
        renderList();
        toast(`Imported ${result.setlists} setlist${result.setlists === 1 ? '' : 's'}` +
          (result.songs ? ` + ${result.songs} song${result.songs === 1 ? '' : 's'}` : ''));
      } catch (err) {
        console.error(err);
        toast('Could not read that file', { variant: 'danger' });
      }
    });

    fileInput.click();
  }

  // ── Detail page 3-dot menu ─────────────────────────────────────────────
  function openDetailMenu(draft) {
    openActionMenu([
      { icon: '⧉', label: 'Copy as text', onClick: () => copySetlistText(draft) },
      { icon: '🗑', label: 'Delete setlist', danger: true, onClick: () => deleteSetlistFromDetail(draft) },
    ]);
  }

  async function deleteSetlistFromDetail(draft) {
    if (!confirm(`Delete "${draft.name || 'this setlist'}"? This can't be undone.`)) return;
    await DB.deleteSetlist(draft.id);
    setlists = setlists.filter(s => s.id !== draft.id);
    showList();
    toast('Setlist deleted');
  }

  function formField(label, inputEl, hint) {
    return UI.el('div', { class: 'field' },
      UI.el('label', null, label),
      inputEl,
      hint ? UI.el('div', { class: 'field-hint' }, hint) : null
    );
  }

  return { load, refresh };
}

window.createSetlistsTab = createSetlistsTab;

})();

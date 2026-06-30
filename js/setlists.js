/* setlists.js — Setlists tab: list, builder, song refs by ID, clipboard export */
(function () {

const SETLIST_SORT_OPTIONS = [
  { id: 'recent', label: 'Most recent' },
  { id: 'name-asc', label: 'Name A–Z' }
];

function createSetlistsTab(container, ctx) {
  const { el, clear, escapeHtml, toast, debounce } = UI;

  let setlists = [];
  let query = '';
  let sortId = 'recent';

  const root = el('div');
  container.appendChild(root);

  async function load() {
    setlists = await DB.getSetlists();
    render();
  }

  function refresh() { render(); }

  function getSongById(id) {
    return ctx.getSongs().find(s => s.id === id) || null;
  }

  function getFiltered() {
    let list = setlists;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(sl => sl.name.toLowerCase().includes(q));
    }
    list = [...list];
    switch (sortId) {
      case 'recent': list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)); break;
      case 'name-asc': list.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return list;
  }

  function render() {
    clear(root);

    const header = el('div', { class: 'app-header' },
      el('h1', { class: 'app-title' }, el('span', { class: 'mark' }, '☰'), 'Setlists'),
      el('div', { class: 'searchbar' },
        el('input', {
          type: 'search',
          placeholder: 'Search setlists…',
          value: query,
          oninput: debounce((e) => { query = e.target.value; renderList(); }, 150)
        })
      ),
      el('div', { class: 'sort-row' },
        ...SETLIST_SORT_OPTIONS.map(opt =>
          el('button', {
            class: 'chip-btn' + (sortId === opt.id ? ' is-active' : ''),
            onclick: () => { sortId = opt.id; renderList(); updateChips(); }
          }, opt.label)
        )
      )
    );
    root.appendChild(header);

    const main = el('div', { class: 'app-main' });
    root.appendChild(main);
    const listWrap = el('div');
    main.appendChild(listWrap);
    renderListInto(listWrap);

    const fab = el('button', { class: 'fab', title: 'New setlist', onclick: () => openSetlistEditor(null) }, '+');
    root.appendChild(fab);

    function renderList() { renderListInto(listWrap); }
    function updateChips() {
      header.querySelectorAll('.chip-btn').forEach((btn, i) => {
        btn.classList.toggle('is-active', SETLIST_SORT_OPTIONS[i].id === sortId);
      });
    }
  }

  function renderListInto(wrap) {
    clear(wrap);
    const list = getFiltered();

    if (setlists.length === 0) {
      wrap.appendChild(emptyState('☰', 'No setlists yet', 'Build your first setlist from songs you\u2019ve added, plus any notes or headers you need.'));
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

    return el('div', { class: 'setlist-card', onclick: () => openSetlistEditor(sl) },
      el('h3', { class: 'setlist-card-title' }, sl.name || 'Untitled setlist'),
      el('div', { class: 'setlist-card-sub' },
        `${songCount} song${songCount === 1 ? '' : 's'} · ${dateStr}`
      )
    );
  }

  function emptyState(glyph, title, body) {
    return el('div', { class: 'empty-state' },
      el('div', { class: 'glyph' }, glyph),
      el('h3', null, title),
      el('p', null, body)
    );
  }

  // ---- Setlist editor ----
  function openSetlistEditor(setlist) {
    const isEdit = !!setlist;
    const draft = setlist ? {
      ...setlist,
      items: (setlist.items || []).map(i => ({ ...i }))
    } : {
      id: DB.uid(),
      name: '',
      items: [],
      createdAt: Date.now()
    };

    const nameInput = el('input', { type: 'text', value: draft.name, placeholder: 'e.g. Sunday Service — June 30' });

    const itemsWrap = el('div', { class: 'setlist-items' });

    function renderItems() {
      clear(itemsWrap);
      if (!draft.items.length) {
        itemsWrap.appendChild(el('p', { class: 'field-hint', style: 'padding:10px 0' }, 'No items yet. Add a song or a text entry below.'));
        return;
      }
      draft.items.forEach((item, idx) => {
        itemsWrap.appendChild(itemRow(item, idx));
      });
    }

    function itemRow(item, idx) {
      const isLast = idx === draft.items.length - 1;
      let titleEl, metaEl;

      if (item.type === 'song') {
        const song = getSongById(item.songId);
        const title = song ? song.title : '(song removed)';
        const effectiveKey = item.keyOverride || (song ? song.key : '');
        const effectiveTempo = song ? song.tempo : '';

        if (song && song.link) {
          titleEl = el('a', {
            class: 'setlist-item-title setlist-item-title--link',
            href: song.link,
            target: '_blank',
            rel: 'noopener noreferrer',
            onclick: (e) => e.stopPropagation()
          }, title, el('span', { class: 'link-glyph' }, ' 🔗'));
        } else {
          titleEl = el('div', { class: 'setlist-item-title' }, title);
        }

        const metaBits = [];
        if (effectiveKey) metaBits.push(el('span', null, 'Key ' + effectiveKey));
        if (effectiveTempo) metaBits.push(el('span', null, effectiveTempo + ' bpm'));
        if (item.keyOverride) metaBits.push(el('span', { class: 'override-note' }, 'overridden'));
        if (item.notes) metaBits.push(el('span', null, '\u201C' + item.notes + '\u201D'));
        metaEl = el('div', { class: 'setlist-item-meta' }, ...metaBits);
      } else {
        titleEl = el('div', { class: 'setlist-item-title is-text' }, item.text || '(empty text)');
        metaEl = el('div', { class: 'setlist-item-meta' }, el('span', null, 'Text entry'));
      }

      const row = el('div', { class: 'setlist-item-row' },
        el('div', { class: 'order-rail' },
          el('div', { class: 'order-num' }, String(idx + 1)),
          !isLast ? el('div', { class: 'rail-line' }) : null
        ),
        el('div', { class: 'setlist-item-body' }, titleEl, metaEl),
        el('div', { class: 'setlist-item-actions' },
          el('button', { class: 'icon-btn', title: 'Move up', onclick: () => moveItem(idx, -1) }, '↑'),
          el('button', { class: 'icon-btn', title: 'Move down', onclick: () => moveItem(idx, 1) }, '↓'),
          el('button', { class: 'icon-btn', title: 'Edit', onclick: () => editItem(idx) }, '✎'),
          el('button', { class: 'icon-btn is-danger', title: 'Remove', onclick: () => removeItem(idx) }, '✕')
        )
      );
      return row;
    }

    function moveItem(idx, dir) {
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= draft.items.length) return;
      const [item] = draft.items.splice(idx, 1);
      draft.items.splice(newIdx, 0, item);
      renderItems();
    }

    function removeItem(idx) {
      draft.items.splice(idx, 1);
      renderItems();
    }

    function editItem(idx) {
      const item = draft.items[idx];
      if (item.type === 'song') openSongOverrideEditor(item, () => renderItems());
      else openTextEntryEditor(item, () => renderItems());
    }

    function openSongOverrideEditor(item, onSave) {
      const song = getSongById(item.songId);
      const keyInput = el('input', { type: 'text', value: item.keyOverride || '', placeholder: song ? `Default: ${song.key || '—'}` : '' });
      const notesInput = el('textarea', { placeholder: 'Optional notes for this setlist (e.g. capo 2, start quiet)' }, item.notes || '');

      const body = el('div', null,
        el('p', { style: 'font-weight:600; margin:0 0 14px; font-family: var(--font-display); font-size:16px;' }, song ? song.title : '(song removed)'),
        formField('Key override', keyInput, 'Leave blank to use the song\u2019s default key'),
        formField('Notes for this setlist', notesInput)
      );
      const footer = el('div', { class: 'sheet-footer' },
        el('button', {
          class: 'btn btn--primary btn--block',
          onclick: () => {
            item.keyOverride = keyInput.value.trim();
            item.notes = notesInput.value.trim();
            closeSheet();
            onSave();
          }
        }, 'Save')
      );
      openSheet('Edit entry', body, footer);
    }

    function openTextEntryEditor(item, onSave) {
      const textInput = el('textarea', { placeholder: 'e.g. Welcome & Announcements, Offering, Scripture reading…' }, item.text || '');
      const body = el('div', null, formField('Text', textInput));
      const footer = el('div', { class: 'sheet-footer' },
        el('button', {
          class: 'btn btn--primary btn--block',
          onclick: () => {
            const val = textInput.value.trim();
            if (!val) { toast('Text can\u2019t be empty', { variant: 'danger' }); return; }
            item.text = val;
            closeSheet();
            onSave();
          }
        }, 'Save')
      );
      openSheet('Edit text entry', body, footer);
    }

    function openAddSongPicker() {
      const allSongs = ctx.getSongs();
      let pq = '';
      const searchInput = el('input', { type: 'search', placeholder: 'Search songs…' });
      const listEl = el('div', { class: 'picker-list' });

      function renderPicker() {
        clear(listEl);
        const filtered = pq.trim()
          ? allSongs.filter(s => s.title.toLowerCase().includes(pq.trim().toLowerCase()))
          : allSongs;
        if (!filtered.length) {
          listEl.appendChild(el('p', { class: 'field-hint', style: 'padding:14px 0' },
            allSongs.length ? 'No songs match your search.' : 'You haven\u2019t added any songs yet. Add songs in the Songs tab first.'));
          return;
        }
        filtered.forEach(song => {
          listEl.appendChild(el('div', {
            class: 'picker-row',
            onclick: () => {
              draft.items.push({ type: 'song', songId: song.id, keyOverride: '', notes: '' });
              closeSheet();
              renderItems();
            }
          },
            el('div', null,
              el('div', { class: 'picker-row-title' }, song.title),
              el('div', { class: 'picker-row-meta' }, [song.key, song.tempo ? song.tempo + ' bpm' : ''].filter(Boolean).join(' · '))
            ),
            el('span', { style: 'color:var(--accent); font-size:20px; font-weight:600;' }, '+')
          ));
        });
      }
      searchInput.addEventListener('input', debounce((e) => { pq = e.target.value; renderPicker(); }, 120));
      renderPicker();

      const body = el('div', null, el('div', { class: 'field' }, searchInput), listEl);
      openSheet('Add a song', body, null);
    }

    function openAddTextEntry() {
      const textInput = el('textarea', { placeholder: 'e.g. Welcome & Announcements, Offering, Scripture reading…' });
      const body = el('div', null, formField('Text', textInput));
      const footer = el('div', { class: 'sheet-footer' },
        el('button', {
          class: 'btn btn--primary btn--block',
          onclick: () => {
            const val = textInput.value.trim();
            if (!val) { toast('Text can\u2019t be empty', { variant: 'danger' }); return; }
            draft.items.push({ type: 'text', text: val });
            closeSheet();
            renderItems();
          }
        }, 'Add')
      );
      openSheet('Add text entry', body, footer);
    }

    renderItems();

    const addBar = el('div', { class: 'add-item-bar' },
      el('button', { class: 'btn btn--secondary', style: 'flex:1', onclick: openAddSongPicker }, '+ Song'),
      el('button', { class: 'btn btn--secondary', style: 'flex:1', onclick: openAddTextEntry }, '+ Text entry')
    );

    const body = el('div', null,
      formField('Name', nameInput, null),
      el('div', { class: 'section-label' }, 'Order of service'),
      itemsWrap,
      addBar
    );

    const footerButtons = [];
    if (isEdit) {
      footerButtons.push(
        el('button', { class: 'btn btn--secondary', title: 'Copy as text', onclick: () => copySetlistText(draft) }, '⧉ Copy'),
        el('button', {
          class: 'btn btn--danger',
          onclick: async () => {
            if (!confirm(`Delete "${draft.name || 'this setlist'}"? This can't be undone.`)) return;
            await DB.deleteSetlist(draft.id);
            setlists = setlists.filter(s => s.id !== draft.id);
            closeSheet();
            render();
            toast('Setlist deleted');
          }
        }, 'Delete')
      );
    }
    footerButtons.push(el('button', {
      class: 'btn btn--primary',
      style: isEdit ? '' : 'flex:1',
      onclick: async () => {
        const name = nameInput.value.trim();
        if (!name) { toast('Name is required', { variant: 'danger' }); return; }
        const toSave = {
          id: draft.id,
          name,
          items: draft.items,
          createdAt: draft.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        await DB.saveSetlist(toSave);
        const idx = setlists.findIndex(s => s.id === toSave.id);
        if (idx >= 0) setlists[idx] = toSave; else setlists.push(toSave);
        closeSheet();
        render();
        toast(isEdit ? 'Setlist updated' : 'Setlist created');
      }
    }, isEdit ? 'Save' : 'Create setlist'));

    const footer = el('div', { class: 'sheet-footer', style: 'flex-wrap:wrap' }, ...footerButtons);

    openSheet(isEdit ? 'Edit setlist' : 'New setlist', body, footer);
  }

  async function copySetlistText(setlist) {
    const lines = (setlist.items || []).map(item => {
      if (item.type === 'text') return item.text;
      const song = getSongById(item.songId);
      if (!song) return '(song removed)';
      const key = item.keyOverride || song.key || '—';
      const tempo = song.tempo || '—';
      return `${song.title} - ${key} - ${tempo}`;
    });
    const finalText = (setlist.name ? setlist.name + '\n\n' : '') + lines.join('\n');
    const ok = await FileUtil.copyToClipboard(finalText);
    toast(ok ? 'Copied to clipboard' : 'Could not copy — try again');
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

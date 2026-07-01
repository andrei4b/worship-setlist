/* songs.js — Songs tab: list, search, sort, CRUD, import/export */
(function () {

const { el, clear, escapeHtml, toast, debounce } = UI;

const SORT_OPTIONS = [
  { id: 'title-asc', label: 'Title A–Z' },
  { id: 'recent', label: 'Recently added' }
];

function createSongsTab(container, ctx) {
  let songs = [];
  let query = '';
  let sortId = 'title-asc';

  const root = el('div');
  container.appendChild(root);

  async function load() {
    songs = await DB.getSongs();
    render();
  }

  function getFiltered() {
    let list = songs;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        (s.pace || '').toLowerCase().includes(q)
      );
    }
    list = [...list];
    switch (sortId) {
      case 'title-asc': list.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'recent': list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); break;
    }
    return list;
  }

  function render() {
    clear(root);

    const header = el('div', { class: 'app-header' },
      el('div', { class: 'app-header-top' },
        el('h1', { class: 'app-title' }, el('span', { class: 'mark' }, '♪'), 'Songs'),
        el('button', { class: 'kebab-btn', title: 'More options', onclick: openSongsMenu }, '⋮')
      ),
      el('div', { class: 'searchbar' },
        el('input', {
          type: 'search',
          placeholder: 'Search title or pace…',
          value: query,
          oninput: debounce((e) => { query = e.target.value; renderList(); }, 150)
        })
      ),
      el('div', { class: 'sort-row' },
        ...SORT_OPTIONS.map(opt =>
          el('button', {
            class: 'chip-btn' + (sortId === opt.id ? ' is-active' : ''),
            onclick: () => { sortId = opt.id; renderList(); updateSortChips(); }
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

    // Single FAB: add song
    root.appendChild(el('button', { class: 'fab', title: 'Add song', onclick: () => openSongForm(null) }, '+'));

    function renderList() { renderListInto(listWrap); }
    function updateSortChips() {
      header.querySelectorAll('.chip-btn').forEach((btn, i) => {
        btn.classList.toggle('is-active', SORT_OPTIONS[i].id === sortId);
      });
    }

    root._renderList = renderList;
  }

  function renderListInto(wrap) {
    clear(wrap);
    const list = getFiltered();

    if (songs.length === 0) {
      wrap.appendChild(emptyState(
        '♪',
        'No songs yet',
        'Add your first song, or import a list from a CSV or JSON file.'
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

  function songCard(song) {
    const chips = [];
    if (song.key) chips.push(el('span', { class: 'mini-chip mini-chip--key' }, song.key));
    if (song.tempo) chips.push(el('span', { class: 'mini-chip mini-chip--tempo' }, song.tempo + (isFinite(parseFloat(song.tempo)) ? ' bpm' : '')));

    const metaBits = [];
    if (song.structure) metaBits.push(el('span', null, song.structure));

    const paceClass = song.pace ? ' pace-badge--' + song.pace.toLowerCase() : '';
    const bottomRow = el('div', { class: 'song-card-bottom' },
      el('div', { class: 'song-card-meta' }, ...metaBits),
      song.pace ? el('span', { class: 'pace-badge' + paceClass }, song.pace) : null
    );

    return el('div', {
      class: 'song-card',
      onclick: () => openSongForm(song)
    },
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
      ),
      (metaBits.length || song.pace) ? bottomRow : null
    );
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
      title: '', key: '', tempo: '', link: '', structure: '', pace: ''
    };

    const titleInput = el('input', { type: 'text', value: draft.title, placeholder: 'e.g. Amazing Grace' });
    const keyInput = el('input', { type: 'text', value: draft.key, placeholder: 'e.g. G' });
    const tempoInput = el('input', { type: 'text', value: draft.tempo, placeholder: 'e.g. 72' });
    const linkInput = el('input', { type: 'url', value: draft.link, placeholder: 'https://…' });
    const structureInput = el('textarea', { placeholder: 'e.g. Intro, V1, C, V2, C, Bridge, C, Outro' }, draft.structure);
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
      formField('Structure', structureInput, 'Free text — verse/chorus order, notes, etc.'),
      formField('Pace', paceSelect, 'Slow, Medium, or Fast')
    );

    const footer = el('div', { class: 'sheet-footer' },
      isEdit ? el('button', {
        class: 'btn btn--danger',
        onclick: async () => {
          if (!confirm(`Delete "${draft.title}"? This can't be undone.`)) return;
          await DB.deleteSong(draft.id);
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
            structure: structureInput.value.trim(),
            pace: paceSelect.value,
            createdAt: draft.createdAt || Date.now()
          };
          await DB.saveSong(toSave);
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
      { icon: '⬇', label: 'Import songs', onClick: openImportSheet },
      { icon: '⬆', label: 'Export all songs', onClick: exportSongsJSON },
    ]);
  }

  // ---- Import sheet ----
  function openImportSheet() {
    const fileInput = el('input', { type: 'file', accept: '.json,application/json' });
    const drop = el('div', { class: 'import-drop' },
      el('div', null, '📄'),
      el('p', { style: 'margin:8px 0 14px' }, 'Choose a JSON file to import songs.'),
      el('button', { class: 'btn btn--secondary', onclick: () => fileInput.click() }, 'Choose file'),
      fileInput
    );
    const hint = el('div', { class: 'field-hint', style: 'margin-top:10px' },
      'Expected format: JSON exported from this app, or an array of song objects.'
    );
    const body = el('div', null, drop, hint);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSONUtil.jsonToSongs(text);
        if (!imported.length) { toast('No songs found in file', { variant: 'danger' }); return; }
        await DB.bulkSaveSongs(imported);
        songs = [...songs, ...imported];
        closeSheet(true);
        render();
        toast(`Imported ${imported.length} song${imported.length === 1 ? '' : 's'}`);
      } catch (err) {
        console.error(err);
        toast('Could not read that file', { variant: 'danger' });
      }
    });

    openSheet('Import songs', body, null);
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

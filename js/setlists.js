/* setlists.js — Setlists tab: list + full detail page with drag reorder, auto-save */
(function () {

// Sunday setlists can be tagged AM/PM; these act as day-bucket values
// distinct from plain Sunday (0), which now means "Sunday, no service set".
const SUNDAY_AM = 'sunday-am';
const SUNDAY_PM = 'sunday-pm';

// Monday-first display order for the day-filter picker (data is still
// indexed Date#getDay()-style, i.e. 0 = Sunday, under the hood) — Sunday's
// AM/PM buckets sort right before the catch-all "Sunday, no service" one.
const DAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, SUNDAY_AM, SUNDAY_PM, 0];

// Sentinel band-filter value meaning "setlists with no band set", distinct
// from null (no filter — show everything).
const NO_BAND = '__no_band__';

const SHARE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>`;

function createSetlistsTab(container, ctx) {
  const { el, clear, toast, debounce, normalizeForSearch, setlistNameFromDate, weekdayNameFromJSDate, weekdayNames, parseDateInput, describeDbError, confirmDestructive } = UI;

  let setlists = [];
  let query = '';
  let dayFilter = null;
  let bandFilter = null;

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

  // Admins can manage any setlist; everyone else only their own. A setlist
  // saved before ownership existed (ownerId missing) has no owner to match,
  // so only an admin can touch it until it's re-saved and gets one stamped.
  function canManage(sl) {
    const user = Auth.currentUser();
    return Auth.isAdmin() || !!(user && sl.ownerId === user.uid);
  }

  // ── Auto-save ──────────────────────────────────────────────────────────
  async function autoSave(setlist) {
    setlist.updatedAt = Date.now();
    try {
      await DB.saveSetlist(setlist);
    } catch (err) {
      toast(describeDbError(err), { variant: 'danger' });
      throw err;
    }
    const idx = setlists.findIndex(s => s.id === setlist.id);
    if (idx >= 0) setlists[idx] = setlist; else setlists.push(setlist);
  }

  // ── Page transitions ───────────────────────────────────────────────────
  function showDetail(setlist, opts) {
    renderDetail(setlist);
    listView.classList.add('page-view--hidden');
    detailView.classList.remove('page-view--hidden');
    detailView.classList.add('page-view--slide-in');
    requestAnimationFrame(() => detailView.classList.remove('page-view--slide-in'));
    const state = { view: 'setlist-detail' };
    // When coming from a sheet we just closed (see createNewSetlist), that
    // sheet already owns the current history entry — replace it instead of
    // pushing a new one, since pushState racing an in-flight history.back()
    // from closeSheet() corrupts the stack (one push effectively gets lost).
    if (opts && opts.replace) history.replaceState(state, '');
    else history.pushState(state, '');
  }

  function showList() {
    window.setPageBackHandler(null);
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
    if (dayFilter !== null) list = list.filter(sl => dayBucketForSetlist(sl) === dayFilter);
    if (bandFilter === NO_BAND) list = list.filter(sl => !sl.band);
    else if (bandFilter !== null) list = list.filter(sl => sl.band === bandFilter);
    list = [...list];
    list.sort((a, b) => setlistSortKey(b) - setlistSortKey(a));
    return list;
  }

  // Setlists saved before the date field existed fall back to their
  // last-modified time, so sorting/filtering/display all keep working.
  function getSetlistDate(sl) {
    return sl.date ? parseDateInput(sl.date) : new Date(sl.updatedAt || sl.createdAt || Date.now());
  }

  function setlistSortKey(sl) {
    return getSetlistDate(sl).getTime();
  }

  // Day-filter bucket: Monday..Saturday are just their Date#getDay() index;
  // Sunday splits into AM/PM when a service is set, or plain 0 otherwise.
  function dayBucketForSetlist(sl) {
    const day = getSetlistDate(sl).getDay();
    if (day === 0 && sl.sundayService === 'AM') return SUNDAY_AM;
    if (day === 0 && sl.sundayService === 'PM') return SUNDAY_PM;
    return day;
  }

  function dayBucketLabel(bucket) {
    if (bucket === SUNDAY_AM) return 'Duminică AM';
    if (bucket === SUNDAY_PM) return 'Duminică PM';
    return weekdayNames[bucket];
  }

  // "<weekday>" or "<weekday> · <band>" — used for both the list card and
  // the detail page header. Sunday setlists with a service picked show
  // "Duminică AM"/"Duminică PM" instead of the plain weekday.
  function setlistSubtitle(sl) {
    const date = getSetlistDate(sl);
    let weekday = weekdayNameFromJSDate(date);
    if (date.getDay() === 0 && sl.sundayService) weekday += ' ' + sl.sundayService;
    return sl.band ? `${weekday} · ${sl.band}` : weekday;
  }

  // The "-- " marker is a display/share-time affordance, not stored data —
  // item.text holds just the raw content. Strips any pre-existing "--"
  // prefix first (with or without a space) so entries saved by an older
  // version of the app, which did store the prefix, don't end up doubled.
  function withTextEntryPrefix(val) {
    return '-- ' + val.replace(/^--\s*/, '');
  }

  function withoutTextEntryPrefix(val) {
    return String(val || '').replace(/^--\s*/, '');
  }

  function getAvailableBands() {
    return [...new Set(setlists.map(sl => sl.band).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function getAvailableDays() {
    const present = new Set(setlists.map(dayBucketForSetlist));
    return DAY_PICKER_ORDER.filter(d => present.has(d));
  }

  function renderList() {
    clear(listView);

    const header = el('div', { class: 'app-header' },
      el('div', { class: 'app-header-top' },
        el('h1', { class: 'app-title' },
          el('span', { class: 'mark' }, '☰'),
          'Setlists',
          el('span', { class: 'title-count' }, `(${setlists.length})`)
        ),
        el('button', { class: 'kebab-btn', title: 'More options', onclick: openSetlistsMenu }, '⋮')
      ),
      el('div', { class: 'searchbar' },
        el('input', {
          type: 'search',
          placeholder: 'Search setlists…',
          value: query,
          oninput: debounce((e) => { query = e.target.value; renderListItems(); }, 150)
        })
      ),
      el('div', { class: 'sort-row' },
        el('button', {
          class: 'chip-btn' + (dayFilter !== null ? ' is-active' : ''),
          onclick: openDayFilterPicker
        }, (dayFilter !== null ? dayBucketLabel(dayFilter) : 'All days') + ' ▾'),
        el('button', {
          class: 'chip-btn' + (bandFilter !== null ? ' is-active' : ''),
          onclick: openBandFilterPicker
        }, (bandFilter === null ? 'All bands' : bandFilter === NO_BAND ? 'No band' : bandFilter) + ' ▾')
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

  // ── Day/band filter pickers ─────────────────────────────────────────────
  function openDayFilterPicker() {
    const days = getAvailableDays();
    if (!days.length) {
      openSheet('Filter by day',
        el('p', { class: 'field-hint', style: 'padding:14px 0' }, 'No setlists yet.'),
        null);
      return;
    }
    const options = [null, ...days];
    const listEl = el('div', { class: 'picker-list' },
      ...options.map(day => el('div', {
        class: 'picker-row' + (dayFilter === day ? ' is-selected' : ''),
        onclick: () => { dayFilter = day; closeSheet(); renderList(); }
      }, el('div', { class: 'picker-row-title' }, day === null ? 'All days' : dayBucketLabel(day))))
    );
    openSheet('Filter by day', listEl, null);
  }

  function openBandFilterPicker() {
    const bands = getAvailableBands();
    if (!bands.length) {
      openSheet('Filter by band',
        el('p', { class: 'field-hint', style: 'padding:14px 0' }, 'No setlists have a band name yet.'),
        null);
      return;
    }
    const hasUnbanded = setlists.some(sl => !sl.band);
    const options = [null, ...(hasUnbanded ? [NO_BAND] : []), ...bands];
    const listEl = el('div', { class: 'picker-list' },
      ...options.map(band => el('div', {
        class: 'picker-row' + (bandFilter === band ? ' is-selected' : ''),
        onclick: () => { bandFilter = band; closeSheet(); renderList(); }
      }, el('div', { class: 'picker-row-title' }, band === null ? 'All bands' : band === NO_BAND ? 'No band' : band)))
    );
    openSheet('Filter by band', listEl, null);
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
    return el('div', { class: 'setlist-card', onclick: () => showDetail(sl) },
      el('h3', { class: 'setlist-card-title' }, sl.name || 'Untitled setlist'),
      el('div', { class: 'setlist-card-sub' }, setlistSubtitle(sl))
    );
  }

  // Shared date+name sheet for both creating and editing a setlist. Both
  // fields are mandatory — onSubmit only fires once each has a value.
  function openSetlistFormSheet({ title, dateValue, nameValue, bandValue, sundayServiceValue, submitLabel, onSubmit }) {
    let sundayService = sundayServiceValue || null;

    const dateInput = el('input', {
      type: 'date',
      value: dateValue,
      onchange: () => { nameInput.value = setlistNameFromDate(dateInput.value); syncSundayField(); }
    });
    const nameInput = el('input', { type: 'text', placeholder: 'e.g. Sunday Morning', value: nameValue });
    const bandInput = el('input', { type: 'text', placeholder: 'e.g. Youth Band', value: bandValue || '' });

    const amBtn = el('button', { type: 'button', class: 'segmented-btn', onclick: () => { sundayService = 'AM'; updateSundayButtons(); } }, 'AM');
    const pmBtn = el('button', { type: 'button', class: 'segmented-btn', onclick: () => { sundayService = 'PM'; updateSundayButtons(); } }, 'PM');
    function updateSundayButtons() {
      amBtn.classList.toggle('is-active', sundayService === 'AM');
      pmBtn.classList.toggle('is-active', sundayService === 'PM');
    }
    const sundayField = formField('Service', el('div', { class: 'segmented-toggle' }, amBtn, pmBtn));

    // Only relevant when the picked date is a Sunday — hidden otherwise.
    // Defaults to AM the moment it becomes relevant, so a Sunday setlist
    // is never left ambiguous without forcing an extra tap most of the time.
    function syncSundayField() {
      const isSunday = parseDateInput(dateInput.value).getDay() === 0;
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
          onSubmit({ date, name, band, sundayService: isSunday ? sundayService : null });
        }
      }, submitLabel)
    );
    openSheet(title, body, footer);
  }

  function createNewSetlist() {
    const todayStr = FileUtil.dateStamp();
    openSetlistFormSheet({
      title: 'New setlist',
      dateValue: todayStr,
      nameValue: setlistNameFromDate(todayStr),
      submitLabel: 'Create',
      onSubmit: async ({ date, name, band, sundayService }) => {
        const sl = { id: DB.uid(), name, date, band, sundayService, items: [], createdAt: Date.now(), updatedAt: Date.now() };
        try {
          await DB.saveSetlist(sl);
        } catch (err) { toast(describeDbError(err), { variant: 'danger' }); return; }
        setlists.push(sl);
        closeSheet(true, true);
        showDetail(sl, { replace: true });
      }
    });
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
    const editable = canManage(draft);

    // ---- Header (title + weekday/band subtitle) ----
    const titleEl = el('h2', { class: 'detail-header-title' }, draft.name || 'Untitled setlist');
    const subEl = el('div', { class: 'detail-header-sub' }, setlistSubtitle(draft));

    function openEditSetlistSheet() {
      openSetlistFormSheet({
        title: 'Edit setlist',
        dateValue: draft.date || FileUtil.dateStamp(),
        nameValue: draft.name || '',
        bandValue: draft.band || '',
        sundayServiceValue: draft.sundayService || null,
        submitLabel: 'Save',
        onSubmit: async ({ date, name, band, sundayService }) => {
          draft.date = date;
          draft.name = name;
          draft.band = band;
          draft.sundayService = sundayService;
          titleEl.textContent = draft.name;
          subEl.textContent = setlistSubtitle(draft);
          closeSheet();
          await autoSave(draft);
        }
      });
    }

    function handleBack() {
      showList();
    }
    function registerBackHandler() {
      window.setPageBackHandler(function onPageBack() {
        if (container.style.display === 'none') {
          // Not the active tab — the browser still consumed a history step,
          // so push it right back or the detail view breaks once this tab
          // is shown again (an extra back press would exit the app instead
          // of the view).
          window.setPageBackHandler(onPageBack);
          history.pushState({ view: 'setlist-detail' }, '');
          return;
        }
        handleBack();
      });
    }
    registerBackHandler();

    const topBar = el('div', { class: 'detail-topbar' },
      el('button', { class: 'detail-back-btn', onclick: () => history.back(), title: 'Back' },
        el('span', null, '←')
      ),
      el('div', { class: 'detail-topbar-actions' },
        el('button', {
          class: 'kebab-btn',
          title: 'Share setlist',
          onclick: () => shareSetlist(draft)
        }, el('span', { html: SHARE_ICON })),
        // Nothing in this menu applies to a setlist you can't manage.
        editable ? el('button', {
          class: 'kebab-btn',
          title: 'More options',
          onclick: () => openDetailMenu(draft, openEditSetlistSheet)
        }, '⋮') : null
      )
    );
    detailView.appendChild(topBar);

    const detailHeader = el('div', { class: 'detail-header' }, titleEl, subEl);
    detailView.appendChild(detailHeader);

    // ---- Items list ----
    const itemsWrap = el('div', { class: 'detail-items' });
    detailView.appendChild(itemsWrap);

    // ---- Add bar ---- (view-only for a setlist you don't own/manage)
    if (editable) {
      const addBar = el('div', { class: 'detail-add-bar' },
        el('button', { class: 'btn btn--accent-soft', style: 'flex:1', onclick: openAddSongPicker }, '+ Song'),
        el('button', { class: 'btn btn--secondary', style: 'flex:1', onclick: openAddTextEntry }, '+ Text entry')
      );
      detailView.appendChild(addBar);
    }

    renderItems();

    // ── Render items ───────────────────────────────────────────────────
    function renderItems() {
      clear(itemsWrap);
      if (!draft.items.length) {
        itemsWrap.appendChild(el('p', { class: 'detail-empty', style: 'padding:24px 20px; color:var(--ink-faint); font-size:14px;' },
          editable ? 'No items yet. Add a song or a text entry below.' : 'No items yet.'));
        return;
      }
      draft.items.forEach((item, idx) => itemsWrap.appendChild(buildItemRow(item, idx)));
      if (editable) initDragSort(itemsWrap, draft, async () => { await autoSave(draft); renderItems(); });
    }

    function buildItemRow(item, idx) {
      let titleLine, subLine = null;

      if (item.type === 'song') {
        const song = getSongById(item.songId);
        const title = song ? song.title : '(song removed)';
        const effectiveKey = item.keyOverride || (song ? song.key : '');
        const effectiveTempo = song ? song.tempo : '';

        const metaBits = [];
        if (effectiveKey) {
          metaBits.push(el('span', {
            class: 'setlist-item-inline-meta' + (item.keyOverride ? ' is-overridden' : '')
          }, effectiveKey));
        }
        if (effectiveTempo) metaBits.push(el('span', { class: 'setlist-item-inline-meta' }, effectiveTempo));

        const titleBits = [el('span', { class: 'setlist-item-title' }, title)];
        if (metaBits.length) titleBits.push(el('div', { class: 'setlist-item-meta-group' }, ...metaBits));
        titleLine = el('div', { class: 'setlist-item-titleline' }, ...titleBits);

        if (item.notes) {
          subLine = el('div', { class: 'setlist-item-meta' }, el('span', null, '\u201C' + item.notes + '\u201D'));
        }
      } else {
        titleLine = el('div', { class: 'setlist-item-titleline' },
          el('span', { class: 'setlist-item-title is-text' }, item.text ? withTextEntryPrefix(item.text) : '(empty)')
        );
      }

      const body = subLine
        ? el('div', { class: 'setlist-item-body' }, titleLine, subLine)
        : el('div', { class: 'setlist-item-body' }, titleLine);

      const swipeAction = el('div', { class: 'setlist-item-swipe-action' });
      // Without the drag handle, the row loses its usual left-side spacing —
      // add it back so read-only rows don't sit flush against the edge.
      const rowContent = el('div', { class: 'setlist-item-row-content' + (editable ? '' : ' is-readonly') },
        editable ? el('div', { class: 'drag-handle', title: 'Drag to reorder' },
          el('span', { class: 'drag-dots' }, '⠿')
        ) : null,
        body
      );
      const swipeWrap = el('div', { class: 'setlist-item-swipe-wrap' }, swipeAction, rowContent);

      const row = el('div', { class: 'drag-item', 'data-idx': String(idx) }, swipeWrap);
      // Swipe is detected from touches on the body (not the drag handle, which
      // has its own vertical reorder gesture), but the whole row — handle
      // included — slides together. Not available on a setlist you can only view.
      if (editable) attachItemSwipeGestures(body, rowContent, swipeAction, idx);
      return row;
    }

    // ---- Swipe right = delete, swipe left = edit ----
    function attachItemSwipeGestures(listenEl, slideEl, actionEl, idx) {
      const THRESHOLD = 88;
      const MAX_REVEAL = 120;
      let dragging = false, decided = false, isHorizontal = false;
      let startX = 0, startY = 0, dx = 0;

      function setTransform(x) { slideEl.style.transform = x ? `translateX(${x}px)` : ''; }
      function updateAction(x) {
        if (x > 0) {
          actionEl.textContent = '✕ Delete';
          actionEl.classList.add('is-delete');
          actionEl.classList.remove('is-edit');
        } else if (x < 0) {
          actionEl.textContent = '✎ Edit';
          actionEl.classList.add('is-edit');
          actionEl.classList.remove('is-delete');
        }
      }
      function settle() {
        slideEl.classList.add('is-swipe-animating');
        setTransform(0);
      }
      function onStart(clientX, clientY) {
        dragging = true; decided = false; isHorizontal = false;
        startX = clientX; startY = clientY; dx = 0;
        slideEl.classList.remove('is-swipe-animating');
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
        dx = Math.max(-MAX_REVEAL, Math.min(MAX_REVEAL, rawDx));
        updateAction(dx);
        setTransform(dx);
        return true;
      }
      function onEnd() {
        if (!dragging) return;
        dragging = false;
        const commitDelete = dx >= THRESHOLD;
        const commitEdit = dx <= -THRESHOLD;
        settle();
        if (commitDelete) removeItem(idx);
        else if (commitEdit) editItem(idx);
      }

      listenEl.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
      }, { passive: true });
      listenEl.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (onMove(t.clientX, t.clientY)) e.preventDefault();
      }, { passive: false });
      listenEl.addEventListener('touchend', onEnd);
      listenEl.addEventListener('touchcancel', onEnd);

      listenEl.addEventListener('mousedown', (e) => {
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
    }

    async function removeItem(idx) {
      draft.items.splice(idx, 1);
      await autoSave(draft);
      renderItems();
      toast('Removed item');
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
      const textInput = el('textarea', { placeholder: 'e.g. Welcome, Offering, Scripture reading…' }, withoutTextEntryPrefix(item.text));
      const body = el('div', null, formField('Text', textInput));
      const footer = el('div', { class: 'sheet-footer' },
        el('button', { class: 'btn btn--primary btn--block', onclick: () => {
          const val = textInput.value.trim();
          if (!val) { toast('Text can\u2019t be empty', { variant: 'danger' }); return; }
          item.text = withoutTextEntryPrefix(val); closeSheet(); onSave();
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
          draft.items.push({ type: 'text', text: withoutTextEntryPrefix(val) });
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

  // ── Share / clipboard export ────────────────────────────────────────────
  function buildSetlistText(setlist) {
    const lines = (setlist.items || []).map(item => {
      if (item.type === 'text') return withTextEntryPrefix(item.text || '');
      const song = getSongById(item.songId);
      if (!song) return '(song removed)';
      return `${song.title} (${item.keyOverride || song.key || '—'}) - ${song.tempo || '—'}`;
    });
    return (setlist.name ? setlist.name + '\n\n' : '') + lines.join('\n');
  }

  async function shareSetlist(setlist) {
    const text = buildSetlistText(setlist);
    if (navigator.share) {
      try {
        await navigator.share({ title: setlist.name || 'Setlist', text });
      } catch (err) {
        if (err.name !== 'AbortError') toast('Could not share — try again', { variant: 'danger' });
      }
      return;
    }
    // No Web Share support (e.g. desktop) — fall back to a direct copy.
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
      // Cuts across ownership, so it's admin-only rather than per-owner.
      ...(Auth.isAdmin() ? [{ icon: '🗑', label: 'Delete all setlists', danger: true, onClick: confirmDeleteAllSetlists }] : []),
      ...(window.accountMenuItems ? window.accountMenuItems() : []),
    ]);
  }

  function confirmDeleteAllSetlists() {
    if (!setlists.length) { toast('No setlists to delete', { variant: 'danger' }); return; }
    confirmDestructive({
      title: 'Delete all setlists',
      message: `This deletes all ${setlists.length} setlist${setlists.length === 1 ? '' : 's'} for the whole group, including ones other people created — everyone loses access, not just you. This can’t be undone.`,
      confirmWord: 'DELETE',
      onConfirm: async () => {
        try {
          await DB.clearSetlists();
        } catch (err) { toast(describeDbError(err), { variant: 'danger' }); return; }
        setlists = [];
        renderList();
        toast('All setlists deleted');
      }
    });
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
        const msg = err && err.code === 'permission-denied' ? describeDbError(err) : 'Could not read that file';
        toast(msg, { variant: 'danger' });
      }
    });

    fileInput.click();
  }

  // ── Detail page 3-dot menu ─────────────────────────────────────────────
  function openDetailMenu(draft, onEdit) {
    openActionMenu([
      { icon: '✎', label: 'Edit setlist', onClick: onEdit },
      { icon: '🗑', label: 'Delete setlist', danger: true, onClick: () => deleteSetlistFromDetail(draft) },
    ]);
  }

  async function deleteSetlistFromDetail(draft) {
    if (!confirm(`Delete "${draft.name || 'this setlist'}"? This can't be undone.`)) return;
    try {
      await DB.deleteSetlist(draft.id);
    } catch (err) { toast(describeDbError(err), { variant: 'danger' }); return; }
    setlists = setlists.filter(s => s.id !== draft.id);
    window.setPageBackHandler(null);
    window.silentHistoryBack();
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

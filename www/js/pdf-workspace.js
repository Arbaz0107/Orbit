/* CMA Orbit - PDF study workspace (additive layer on top of the existing viewer in app.js).
   - multi-PDF tabs + Tab Manager, per-PDF session memory, optional restore after restart
   - bookmarks, page notes, study tags, progress, PDF info, thumbnails, Add to Mistake Book
   Existing data is never touched: everything new lives under the 'orbitPdfWs' localStorage key,
   annotations / last page / PDF files keep using their original stores. */
(function () {
  'use strict';
  if (typeof pdfView === 'undefined' || typeof openPdfResource !== 'function') return;

  var KEY = 'orbitPdfWs';
  var TAGS = [
    ['vimp', '🔥', 'Very important'], ['imp', '⭐', 'Important'], ['doubt', '❓', 'Doubt'],
    ['rev', '🔄', 'Revise'], ['done', '✅', 'Completed']
  ];
  var SESSION_GAP = 30 * 60 * 1000;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return escapeHtml(String(s == null ? '' : s)); }

  /* ---------- storage (safe, versioned, never throws) ---------- */
  var W = { v: 1, meta: {}, tabs: [], active: null, closed: [], restore: true, split: null };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      W.meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
      W.tabs = Array.isArray(raw.tabs) ? raw.tabs.filter(function (x) { return typeof x === 'string'; }) : [];
      W.active = typeof raw.active === 'string' ? raw.active : null;
      W.closed = Array.isArray(raw.closed) ? raw.closed.slice(0, 10) : [];
      W.restore = raw.restore !== false;
      if (raw.split && typeof raw.split.id === 'string') W.split = { id: raw.split.id, dir: raw.split.dir === 'r' ? 'r' : 'c', ratio: Math.min(80, Math.max(20, +raw.split.ratio || 55)), page: +raw.split.page || 1 };
    }
  } catch (e) { /* start clean */ }
  if (!W.restore) { W.tabs = []; W.active = null; W.split = null; }
  var saveT = 0;
  function save(now) {
    if (now) { clearTimeout(saveT); saveT = 0; wr(); return; }
    if (!saveT) saveT = setTimeout(function () { saveT = 0; wr(); }, 400);
  }
  function wr() { try { localStorage.setItem(KEY, JSON.stringify(W)); } catch (e) { /* storage full: keep working in memory */ } }
  function meta(id) {
    var m = W.meta[id] || (W.meta[id] = {});
    if (!Array.isArray(m.bm)) m.bm = [];
    if (!m.tags || typeof m.tags !== 'object') m.tags = {};
    if (!m.notes || typeof m.notes !== 'object') m.notes = {};
    if (typeof m.sessions !== 'number') m.sessions = 0;
    return m;
  }
  function rec(id) { try { return pdfRec(id); } catch (e) { return null; } }
  function titleOf(id) { var r = rec(id); return r ? r.title : 'PDF'; }
  function viewerOpen() { var m = $('pdfViewerModal'); return !!m && !m.classList.contains('hidden'); }
  function fmtDate(ts) { return ts ? new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'; }

  /* ---------- per-PDF snapshot / restore ---------- */
  function snap() {
    var id = pdfView.resId;
    if (!id || !pdfView.doc) return;
    var m = meta(id), sc = $('pdfScroller');
    m.view = { zoom: pdfView.zoom, orient: pdfView.orient, filter: pdfView.filter, rot: pdfView.rot || 0, top: sc ? sc.scrollTop : 0, left: sc ? sc.scrollLeft : 0, page: pdfView.cur };
    m.page = pdfView.cur; m.pages = pdfView.numPages;
    save();
  }
  function restoreView(id, prevStudied) {
    var m = meta(id), v = m.view;
    m.pages = pdfView.numPages;
    var now = Date.now();
    if (!prevStudied || now - prevStudied > SESSION_GAP) m.sessions++;
    m.lastOpened = now; m.lastStudied = now;
    if (v) {
      try {
        if (v.filter && v.filter !== pdfView.filter) { pdfView.filter = v.filter; $('pdfViewerModal').dataset.pf = v.filter; }
        var page = Math.min(Math.max(1, v.page || pdfView.cur), pdfView.numPages);
        if (v.rot) { setRot(v.rot, true); }
        if (v.orient && v.orient !== pdfView.orient) { pdfView.orient = v.orient; pdfRelayout(page); }
        if (v.zoom && Math.abs(v.zoom - pdfView.zoom) > 0.01) pdfZoomTo(v.zoom);
        pdfGoTo(page, false); if (window.pdfStickPage) pdfStickPage(page);
        var sc = $('pdfScroller');
        if (sc && v.page === pdfView.cur) { if (pdfView.orient === 'v') sc.scrollTop = v.top || sc.scrollTop; sc.scrollLeft = v.left || 0; }
        pdfUpdateToolbar();
      } catch (e) { console.error('restore view', e); }
    }
    save();
  }

  /* ---------- tab model ---------- */
  function prune() { W.tabs = W.tabs.filter(function (id) { return !!rec(id); }); if (W.active && W.tabs.indexOf(W.active) < 0) W.active = W.tabs[W.tabs.length - 1] || null; }
  function addTab(id) { if (W.tabs.indexOf(id) < 0) W.tabs.push(id); W.active = id; save(); }
  function rememberClosed(id) { W.closed = [id].concat(W.closed.filter(function (x) { return x !== id; })).slice(0, 10); }
  var busy = false;

  var origOpen = openPdfResource, origClose = closePdfViewer;
  openPdfResource = async function (id) {
    if (busy) return;
    if (viewerOpen() && pdfView.resId === id && pdfView.doc) return;
    busy = true;
    var modal = $('pdfViewerModal'), pgs = $('pdfPages'), swap = viewerOpen() && pdfView.doc;
    try {
      if (swap) {                       // switching PDFs: fade the old one out, keep the viewer on screen the whole time
        modal.classList.add('ws-switching');
        if (pgs) { pgs.style.transition = 'opacity .12s ease'; pgs.style.opacity = '0'; }
        await new Promise(function (r) { setTimeout(r, 130); });
      }
      if (viewerOpen() && pdfView.doc) { snap(); await origClose(); }
      if (pgs) { pgs.style.transition = 'none'; pgs.style.opacity = '0'; }
      addTab(id);
      var prevStudied = meta(id).lastStudied;
      pdfView.rot = 0; $('pdfViewerModal').classList.remove('ws-rot');
      await origOpen(id);
      if (pdfView.resId === id && pdfView.doc && viewerOpen()) { restoreView(id, prevStudied); if (ext.afterOpen) ext.afterOpen(); }
      else { W.tabs = W.tabs.filter(function (x) { return x !== id; }); if (W.active === id) W.active = W.tabs[W.tabs.length - 1] || null; save(); }
    } finally {
      busy = false; render();
      // fade the new document in as soon as its first page has been drawn (or after a short wait)
      var tries = 0;
      (function fade() {
        var ready = pgs && pgs.querySelector('canvas.pdf-canvas'), open = viewerOpen();
        if (ready || tries++ > 30 || !open) {
          if (pgs) { pgs.style.transition = 'opacity .22s ease'; pgs.style.opacity = ''; }
          modal.classList.remove('ws-switching');
        } else setTimeout(fade, 40);
      })();
    }
  };
  closePdfViewer = async function () {
    snap();
    if (ext.beforeClose) ext.beforeClose();
    await origClose();
    render();
  };
  async function closeTab(id) {
    var i = W.tabs.indexOf(id); if (i < 0) return;
    var wasActive = W.active === id && viewerOpen() && pdfView.resId === id;
    rememberClosed(id);
    if (wasActive) snap();
    W.tabs.splice(i, 1);
    if (wasActive) {
      var next = W.tabs[i] || W.tabs[i - 1] || null;
      W.active = next; save();
      if (next) { busy = true; try { await origClose(); } finally { busy = false; } await openPdfResource(next); }
      else { await closePdfViewer(); }
    } else { if (W.active === id) W.active = W.tabs[W.tabs.length - 1] || null; save(); }
    render();
  }
  async function closeMany(keep, toClose) {
    toClose.forEach(rememberClosed);
    var activeGone = toClose.indexOf(pdfView.resId) >= 0 && viewerOpen();
    W.tabs = W.tabs.filter(function (x) { return toClose.indexOf(x) < 0; });
    if (activeGone) {
      snap();
      var next = keep || null;
      W.active = next; save();
      if (next) { busy = true; try { await origClose(); } finally { busy = false; } await openPdfResource(next); }
      else await closePdfViewer();
    } else { if (toClose.indexOf(W.active) >= 0) W.active = W.tabs[W.tabs.length - 1] || null; save(); }
    render();
  }
  function reopenClosed() {
    while (W.closed.length) {
      var id = W.closed.shift();
      if (rec(id)) { save(); openPdfResource(id); return; }
    }
    save(); showToast('No recently closed PDFs');
  }

  /* ---------- tab strip + header / menu hooks ---------- */
  var strip, chip, sheet, menuBuilt = false;
  function build() {
    var top = document.querySelector('#pdfViewerModal .pdf-top'), head = top && top.querySelector('.pdf-head');
    if (!top || !head) return;
    strip = document.createElement('div');
    strip.id = 'wsTabs'; strip.className = 'pdf-chrome ws-tabs';
    strip.innerHTML = '<div id="wsTabList" class="ws-tablist" role="tablist" aria-label="Open PDFs"></div>' +
      '<button id="wsTabMgr" class="ws-tabmgr" data-a="mgr" aria-label="Open PDFs manager" title="Open PDFs"><i class="ph-bold ph-squares-four"></i><b id="wsTabCount">1</b></button>';
    head.insertAdjacentElement('afterend', strip);

    var more = head.querySelector('button[onclick*="pdfToggleMenu"]');
    var share = $('pdfShareBtn');
    if (share) share.style.display = 'none';
    var bm = document.createElement('button');
    bm.id = 'wsBmBtn'; bm.className = 'pdf-iconbtn'; bm.setAttribute('aria-label', 'Bookmark this page'); bm.title = 'Bookmark this page';
    bm.innerHTML = '<i class="ph-bold ph-bookmark-simple"></i>';
    bm.onclick = function () { toggleBookmark(); };
    if (more) head.insertBefore(bm, more); else head.appendChild(bm);

    sheet = document.createElement('div');
    sheet.id = 'wsSheet'; sheet.className = 'hidden ws-sheet';
    sheet.addEventListener('click', onSheetClick);
    sheet.addEventListener('input', onSheetInput);
    $('pdfViewerModal').appendChild(sheet);

    chip = document.createElement('button');
    chip.id = 'wsResume'; chip.className = 'hidden ws-resume';
    chip.onclick = function () { resume(); };
    document.body.appendChild(chip);

    $('wsTabMgr').addEventListener('click', function () { openMgr(); });
    var tl = $('wsTabList');
    tl.addEventListener('click', function (e) {
      if (lp.fired) { lp.fired = false; return; }
      var x = e.target.closest('[data-x]');
      if (x) { e.stopPropagation(); closeTab(x.dataset.x); return; }
      var t = e.target.closest('[data-id]');
      if (t) switchTo(t.dataset.id);
    });
    tl.addEventListener('pointerdown', function (e) {
      var t = e.target.closest('[data-id]'); if (!t || e.target.closest('[data-x]')) return;
      lp.fired = false; clearTimeout(lp.t); lp.x = e.clientX; lp.y = e.clientY;
      lp.t = setTimeout(function () { lp.fired = true; tabMenu(t.dataset.id); }, 480);
    });
    ['pointermove'].forEach(function (n) { tl.addEventListener(n, function (e) { if (Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) clearTimeout(lp.t); }); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { tl.addEventListener(n, function () { clearTimeout(lp.t); }); });
    tl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    var menu = $('pdfMenu');
    if (menu) {
      menu.insertAdjacentHTML('afterbegin',
        '<div class="pdf-menu-lbl">Study</div>' + [
          ['lib', 'ph-books', 'PDF library', 'Open, search, sort, favourites'],
          ['split', 'ph-columns', 'Split view', 'Read two PDFs together'],
          ['bm', 'ph-bookmark-simple', 'Bookmarks', 'Saved pages in this PDF'],
          ['marks', 'ph-pencil-line', 'Annotations', 'List, edit, delete, clear page'],
          ['notes', 'ph-note-pencil', 'Notes', 'Your note for the current page'],
          ['tags', 'ph-tag', 'Study tags', 'Important, doubt, revise...'],
          ['mistake', 'ph-warning-circle', 'Add to Mistake Book', 'From this PDF page'],
          ['thumbs', 'ph-squares-four', 'Page thumbnails', 'Jump to any page'],
          ['info', 'ph-info', 'PDF info', 'Size, pages, progress']
        ].map(function (r) { return '<button class="pdf-menu-item" data-ws="' + r[0] + '"><i class="ph-bold ' + r[1] + '"></i><span><b>' + r[2] + '</b><small>' + r[3] + '</small></span></button>'; }).join('') +
        '<div class="pdf-menu-lbl">Zoom to</div><div class="pdf-modeseg wide"><button data-ws="fitw"><span>Fit width</span></button><button data-ws="fitp"><span>Fit page</span></button><button data-ws="actual"><span>Actual</span></button></div>' +
        '<div class="pdf-menu-lbl">Rotate</div><div class="pdf-modeseg wide"><button data-ws="rot"><span>Rotate 90\u00B0</span></button><button data-ws="rot0"><span>Reset</span></button></div>' +
        '<div class="pdf-menu-lbl">Page tone</div><div class="pdf-modeseg wide" id="wsTone"><button data-ws="tone-none"><span>Normal</span></button><button data-ws="tone-sepia"><span>Sepia</span></button><button data-ws="tone-night"><span>Night</span></button></div>');
      menu.insertAdjacentHTML('beforeend',
        '<button class="pdf-menu-item" data-ws="full"><i class="ph-bold ph-corners-out"></i><span><b>Full screen</b><small>Hide controls, tap to show</small></span></button>' +
        '<button class="pdf-menu-item" data-ws="share"><i class="ph-bold ph-share-network"></i><span><b>Share PDF</b><small>Includes your annotations</small></span></button>' +
        '<button class="pdf-menu-item" data-ws="closepdf"><i class="ph-bold ph-x-circle"></i><span><b>Close this PDF</b><small>Closes its tab</small></span></button>');
      menu.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ws]'); if (!b) return;
        var a = b.dataset.ws; pdfToggleMenu(false);
        if (a === 'bm' || a === 'notes' || a === 'tags' || a === 'info') openPanel(a);
        else if (a === 'mistake') openMistake();
        else if (a === 'thumbs') openThumbs();
        else if (a === 'fitw') fit('w'); else if (a === 'fitp') fit('p'); else if (a === 'actual') fit('a');
        else if (a.indexOf('tone-') === 0) setTone(a.slice(5));
        else if (a === 'rot') setRot((pdfView.rot || 0) + 90);
        else if (a === 'rot0') setRot(0);
        else if (a === 'marks') openPanel('marks');
        else if (a === 'split') { if (ext.openSplit) ext.openSplit(); }
        else if (a === 'lib') { if (ext.openLib) ext.openLib(); }
        else if (a === 'full') pdfSetFocus(true);
        else if (a === 'share') pdfShare();
        else if (a === 'closepdf') closeTab(pdfView.resId);
      });
      menuBuilt = true;
    }
    dblTap();
  }
  var lp = { t: 0, fired: false, x: 0, y: 0 };

  async function switchTo(id) {
    if (busy || id === pdfView.resId) return;
    await openPdfResource(id);
  }
  function resume() {
    prune();
    var id = W.active || W.tabs[W.tabs.length - 1];
    if (id) openPdfResource(id);
  }

  function render() {
    prune();
    if (!strip) return;
    var tl = $('wsTabList');
    tl.innerHTML = W.tabs.map(function (id) {
      var on = id === pdfView.resId && viewerOpen();
      var t = titleOf(id);
      return '<div class="ws-tab' + (on ? ' on' : '') + '" role="tab" aria-selected="' + on + '" data-id="' + esc(id) + '" title="' + esc(t) + '"><span class="ws-tt">' + esc(t) + '</span><button class="ws-x" data-x="' + esc(id) + '" aria-label="Close ' + esc(t) + '"><i class="ph-bold ph-x"></i></button></div>';
    }).join('');
    var cnt = $('wsTabCount'); if (cnt) cnt.textContent = W.tabs.length;
    var on = tl.querySelector('.ws-tab.on'); if (on && on.scrollIntoView) { try { on.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {} }
    var tone = $('wsTone'); if (tone) tone.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.ws === 'tone-' + pdfView.filter); });
    chipRender(); updateBookmarkBtn();
  }
  function chipRender() {
    if (!chip) return;
    var show = W.tabs.length > 0 && !viewerOpen();
    chip.classList.toggle('hidden', !show);
    if (show) chip.innerHTML = '<i class="ph-bold ph-files"></i><span>Open PDFs</span><b>' + W.tabs.length + '</b>';
  }

  /* ---------- bookmarks / tags / notes / progress ---------- */
  function updateBookmarkBtn() {
    var b = $('wsBmBtn'); if (!b || !pdfView.resId) return;
    var has = meta(pdfView.resId).bm.some(function (x) { return x.p === pdfView.cur; });
    b.classList.toggle('on', has);
    b.setAttribute('aria-pressed', has ? 'true' : 'false');
    b.title = has ? 'Remove bookmark from this page' : 'Bookmark this page';
  }
  function toggleBookmark() {
    var id = pdfView.resId; if (!id) return;
    var m = meta(id), p = pdfView.cur, i = m.bm.findIndex(function (x) { return x.p === p; });
    if (i >= 0) { m.bm.splice(i, 1); showToast('Bookmark removed'); }
    else { m.bm.push({ p: p, t: 'Page ' + p, at: Date.now() }); m.bm.sort(function (a, b) { return a.p - b.p; }); showToast('Page ' + p + ' bookmarked'); }
    save(); updateBookmarkBtn(); if (panelOpen) openPanel(panelView);
  }
  function hasTag(m, p, k) { return (m.tags[p] || []).indexOf(k) >= 0; }
  function toggleTag(p, k) {
    var m = meta(pdfView.resId), a = m.tags[p] || [], i = a.indexOf(k);
    if (i >= 0) a.splice(i, 1); else a.push(k);
    if (a.length) m.tags[p] = a; else delete m.tags[p];
    if (k === 'done') m.lastStudied = Date.now();
    save(); pdfUpdateInfo();
  }
  function counts(id) {
    var m = meta(id), t = 0, d = 0;
    Object.keys(m.tags).forEach(function (p) { t += (m.tags[p] || []).filter(function (k) { return k !== 'done'; }).length; if (hasTag(m, p, 'done')) d++; });
    var an = 0;
    if (id === pdfView.resId) { try { an = pdfCountAnnots(); } catch (e) {} }
    var notes = Object.keys(m.notes).filter(function (p) { return (m.notes[p] || '').trim(); }).length;
    return { tags: t, done: d, notes: notes, bm: m.bm.length, annots: an };
  }
  function pct(id) { var n = (W.meta[id] && W.meta[id].pages) || (id === pdfView.resId ? pdfView.numPages : 0); return n ? Math.round(counts(id).done / n * 100) : 0; }

  /* badges beside the page counter (text/emoji, not colour only) */
  var origInfo = pdfUpdateInfo;
  pdfUpdateInfo = function () {
    origInfo();
    var id = pdfView.resId; if (!id) return;
    var m = meta(id), info = $('pdfPageInfo');
    var b = (m.tags[pdfView.cur] || []).map(function (k) { var t = TAGS.find(function (x) { return x[0] === k; }); return t ? t[1] : ''; }).join('');
    if ((m.notes[pdfView.cur] || '').trim()) b += '📝';
    if (info && b) info.textContent += '  ' + b;
  };
  var origCur = pdfSetCurrent;
  pdfSetCurrent = function (n) {
    origCur(n);
    var id = pdfView.resId; if (!id) return;
    var m = meta(id); m.page = n; m.lastStudied = Date.now(); save();
    updateBookmarkBtn();
    if (panelOpen && panelView === 'notes' && !noteFocus) openPanel('notes');
  };

  /* ---------- sheets ---------- */
  var panelOpen = false, panelView = 'tags', noteFocus = false, tagFilter = 'vimp', noteQ = '', thumbTok = 0;
  function closeSheet() { if (ext.noteReset) ext.noteReset(); saveNoteNow(); panelOpen = false; thumbTok++; sheet.classList.add('hidden'); sheet.innerHTML = ''; noteFocus = false; }
  var openedAt = 0;
  function show(html, cls) {
    if (ext.noteReset) ext.noteReset();
    openedAt = Date.now();
    sheet.innerHTML = '<div class="ws-card ' + (cls || '') + '"><div class="pdf-grab"></div>' + html + '</div>';
    sheet.classList.remove('hidden');
    sheet.classList.toggle('ws-typing', !!sheet.querySelector('textarea,input:not([type=range])'));   // keyboard about to open: skip the slide-in so it does not fight the resize
  }
  function seg() {
    return '<div class="ws-seg">' + [['bm', 'Bookmarks'], ['notes', 'Notes'], ['tags', 'Tags'], ['marks', 'Ink'], ['info', 'Info']].map(function (r) {
      return '<button data-a="panel" data-v="' + r[0] + '" class="' + (panelView === r[0] ? 'on' : '') + '">' + r[1] + '</button>';
    }).join('') + '</div>';
  }
  function openPanel(v) {
    if (!pdfView.resId) return;
    if (panelOpen && panelView === 'notes' && v !== 'notes') saveNoteNow();
    panelOpen = true; panelView = v;
    var id = pdfView.resId, m = meta(id), p = pdfView.cur, h = '';
    if (v === 'bm') {
      var has = m.bm.some(function (x) { return x.p === p; });
      h = '<div class="ws-head"><b>' + esc(titleOf(id)) + '</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' + seg() +
        '<button class="ws-primary" data-a="bmtoggle"><i class="ph-bold ph-bookmark-simple"></i>' + (has ? 'Remove bookmark from page ' + p : 'Bookmark page ' + p) + '</button>' +
        '<div class="ws-list">' + (m.bm.length ? m.bm.map(function (b, i) {
          return '<div class="ws-row"><button class="ws-main" data-a="go" data-v="' + b.p + '"><span class="ws-pg">' + b.p + '</span><span class="ws-rt">' + esc(b.t || 'Page ' + b.p) + '</span></button>' +
            '<button class="ws-ic" data-a="bmren" data-v="' + i + '" aria-label="Rename bookmark"><i class="ph-bold ph-pencil-simple"></i></button>' +
            '<button class="ws-ic" data-a="bmdel" data-v="' + i + '" aria-label="Delete bookmark"><i class="ph-bold ph-trash"></i></button></div>';
        }).join('') : '<div class="ws-empty">No bookmarks yet. Tap the bookmark icon in the header on any page.</div>') + '</div>';
    } else if (v === 'notes') {
      var all = Object.keys(m.notes).map(Number).filter(function (n) { return (m.notes[n] || '').trim(); }).sort(function (a, b) { return a - b; });
      var q = noteQ.trim().toLowerCase();
      if (q) all = all.filter(function (n) { return m.notes[n].toLowerCase().indexOf(q) >= 0; });
      h = '<div class="ws-head"><b>' + esc(titleOf(id)) + '</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' + seg() +
        '<label class="ws-lbl" for="wsNote">Page ' + p + ' note <small id="wsNoteSt">Autosaves</small></label>' +
        '<textarea id="wsNote" class="ws-ta" rows="3" maxlength="2000" placeholder="e.g. Remember this adjustment in consolidation">' + esc(m.notes[p] || '') + '</textarea>' +
        '<input id="wsNoteQ" class="ws-search" type="search" placeholder="Search all notes in this PDF" value="' + esc(noteQ) + '" autocomplete="off">' +
        '<div class="ws-list">' + (all.length ? all.map(function (n) {
          return '<button class="ws-row ws-main" data-a="go" data-v="' + n + '"><span class="ws-pg">' + n + '</span><span class="ws-rt">' + esc(m.notes[n]) + '</span></button>';
        }).join('') : '<div class="ws-empty">' + (q ? 'No notes match.' : 'No notes yet.') + '</div>') + '</div>';
    } else if (v === 'tags') {
      var pages = Object.keys(m.tags).map(Number).filter(function (n) { return hasTag(m, n, tagFilter); }).sort(function (a, b) { return a - b; });
      if (tagFilter === 'note') pages = Object.keys(m.notes).map(Number).filter(function (n) { return (m.notes[n] || '').trim(); }).sort(function (a, b) { return a - b; });
      var nOf = function (k) { return k === 'note' ? counts(id).notes : Object.keys(m.tags).filter(function (n) { return hasTag(m, n, k); }).length; };
      h = '<div class="ws-head"><b>' + esc(titleOf(id)) + '</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' + seg() +
        '<div class="ws-lbl">Mark page ' + p + '</div><div class="ws-chips">' + TAGS.map(function (t) {
          var on = hasTag(m, p, t[0]);
          return '<button class="ws-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-a="tag" data-v="' + t[0] + '"><span>' + t[1] + '</span>' + t[2] + (on ? ' ✓' : '') + '</button>';
        }).join('') + '</div>' +
        '<div class="ws-lbl">Find pages</div><div class="ws-chips sm">' + TAGS.concat([['note', '📝', 'Notes']]).map(function (t) {
          return '<button class="ws-chip' + (tagFilter === t[0] ? ' on' : '') + '" data-a="tf" data-v="' + t[0] + '"><span>' + t[1] + '</span>' + t[2] + ' <b>' + nOf(t[0]) + '</b></button>';
        }).join('') + '</div>' +
        '<div class="ws-pgs">' + (pages.length ? pages.map(function (n) { return '<button data-a="go" data-v="' + n + '">' + n + '</button>'; }).join('') : '<div class="ws-empty">No pages marked yet.</div>') + '</div>';
    } else if (v === 'marks') {
      var an = pdfView.annots || {}, pgsA = Object.keys(an).map(Number).filter(function (n) { return (an[n] || []).length; }).sort(function (a, b) { return a - b; });
      var kind = function (a) { return a.k === 't' ? ['ph-text-t', 'Text'] : a.k === 'n' ? ['ph-note', 'Sticky note'] : a.k === 'p' ? ['ph-pencil-simple-line', 'Pen'] : a.k === 'u' ? ['ph-text-underline', 'Underline'] : a.k === 's' ? ['ph-text-strikethrough', 'Strikethrough'] : ['ph-highlighter', 'Highlight']; };
      h = '<div class="ws-head"><b>' + esc(titleOf(id)) + '</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' + seg() +
        '<button class="ws-primary alt" data-a="clearpg"' + ((an[p] || []).length ? '' : ' disabled') + '><i class="ph-bold ph-eraser"></i>Clear annotations on page ' + p + '</button>' +
        '<div class="ws-list">' + (pgsA.length ? pgsA.map(function (n) {
          return an[n].map(function (a, i) {
            var kd = kind(a), label = a.k === 't' || a.k === 'n' ? (a.t || '(empty)') : kd[1];
            var edit = (a.k === 't' || a.k === 'n') ? '<button class="ws-ic" data-a="annedit" data-v="' + n + ':' + i + '" aria-label="Edit"><i class="ph-bold ph-pencil-simple"></i></button>' : '';
            return '<div class="ws-row"><button class="ws-main" data-a="go" data-v="' + n + '"><span class="ws-pg">' + n + '</span><i class="ph-bold ' + kd[0] + ' ws-ki"></i><span class="ws-rt">' + esc(label) + '</span></button>' + edit +
              '<button class="ws-ic" data-a="anndel" data-v="' + n + ':' + i + '" aria-label="Delete annotation"><i class="ph-bold ph-trash"></i></button></div>';
          }).join('');
        }).join('') : '<div class="ws-empty">No annotations yet. Pick Highlight, Pen, Text or Note in the toolbar.<br>Tip: with Text or Note selected, drag an item to move it.</div>') + '</div>';
    } else if (v === 'info') {
      var c = counts(id), r = rec(id) || {}, pr = pct(id);
      var rows = [['Name', titleOf(id)], ['File size', r.fileSize ? formatBytes(r.fileSize) : 'Unknown'], ['Pages', pdfView.numPages], ['Last opened', fmtDate(m.lastOpened)],
        ['Last studied', fmtDate(m.lastStudied)], ['Current page', p + ' / ' + pdfView.numPages], ['Progress', pr + '% (' + c.done + ' of ' + pdfView.numPages + ' pages completed)'],
        ['Study sessions', m.sessions], ['Bookmarks', c.bm], ['Annotations', c.annots], ['Study tags', c.tags], ['Page notes', c.notes]];
      h = '<div class="ws-head"><b>' + esc(titleOf(id)) + '</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' + seg() +
        '<div class="ws-bar" role="progressbar" aria-valuenow="' + pr + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pr + '%"></i></div>' +
        '<dl class="ws-info">' + rows.map(function (r2) { return '<dt>' + r2[0] + '</dt><dd>' + esc(r2[1]) + '</dd>'; }).join('') + '</dl>' +
        '<button class="ws-primary alt" data-a="done"><i class="ph-bold ph-check-circle"></i>' + (hasTag(m, p, 'done') ? 'Unmark page ' + p + ' as completed' : 'Mark page ' + p + ' completed') + '</button>';
    }
    show(h, 'tall');
    if (v === 'notes') { var ta = $('wsNote'); if (ta) { ta.addEventListener('focus', function () { noteFocus = true; }); ta.addEventListener('blur', function () { noteFocus = false; saveNoteNow(); }); } }
  }
  var noteT = 0, notePage = 0;
  function delAnn(pg, idx) {
    var arr = pdfView.annots[pg]; if (!arr || !arr[idx]) return;
    var st = arr.splice(idx, 1)[0];
    pdfView.undo.push({ t: 'erase', items: [{ pg: pg, stroke: st, index: idx }] }); pdfView.redo = [];
    pdfMarkDirty(); pdfScheduleRedraw(pg); pdfUpdateToolbar();
  }
  function clearPage(pg) {
    var arr = pdfView.annots[pg]; if (!arr || !arr.length) return;
    var items = arr.map(function (st, i) { return { pg: pg, stroke: st, index: i }; });
    arr.length = 0;
    pdfView.undo.push({ t: 'erase', items: items }); pdfView.redo = [];
    pdfMarkDirty(); pdfScheduleRedraw(pg); pdfUpdateToolbar(); showToast('Page annotations cleared (Undo restores them)');
  }
  function saveNoteNow() {
    clearTimeout(noteT); noteT = 0;
    var ta = $('wsNote'); if (!ta || !pdfView.resId) return;
    var m = meta(pdfView.resId), pg = notePage || pdfView.cur, v = ta.value;
    if (v.trim()) m.notes[pg] = v; else delete m.notes[pg];
    m.lastStudied = Date.now(); save(); pdfUpdateInfo();
    var st = $('wsNoteSt'); if (st) st.textContent = 'Saved ✓';
  }
  function onSheetInput(e) {
    if (e.target.id === 'wsNote') {
      notePage = pdfView.cur; var st = $('wsNoteSt'); if (st) st.textContent = 'Saving...';
      clearTimeout(noteT); noteT = setTimeout(saveNoteNow, 500);
    } else if (e.target.id === 'wsNoteQ') {
      noteQ = e.target.value;
      var list = sheet.querySelector('.ws-list'); if (!list) return;
      var m = meta(pdfView.resId), q = noteQ.trim().toLowerCase();
      var all = Object.keys(m.notes).map(Number).filter(function (n) { return (m.notes[n] || '').trim() && (!q || m.notes[n].toLowerCase().indexOf(q) >= 0); }).sort(function (a, b) { return a - b; });
      list.innerHTML = all.length ? all.map(function (n) { return '<button class="ws-row ws-main" data-a="go" data-v="' + n + '"><span class="ws-pg">' + n + '</span><span class="ws-rt">' + esc(m.notes[n]) + '</span></button>'; }).join('') : '<div class="ws-empty">' + (q ? 'No notes match.' : 'No notes yet.') + '</div>';
    } else if (e.target.id === 'wsMbNote' || e.target.id === 'wsMbTopic') { /* read on save */ }
  }
  function onSheetClick(e) {
    /* the click that follows the tap which opened a sheet must not hit the sheet itself */
    if (e.target === sheet) { if (Date.now() - openedAt > 450) closeSheet(); return; }
    var b = e.target.closest('[data-a]'); if (!b) return;
    var a = b.dataset.a, v = b.dataset.v, m = pdfView.resId ? meta(pdfView.resId) : null;
    if (a === 'close') closeSheet();
    else if (a === 'panel') { openPanel(v); }
    else if (a === 'go') { closeSheet(); pdfGoTo(+v, false); }
    else if (a === 'bmtoggle') toggleBookmark();
    else if (a === 'bmdel') { m.bm.splice(+v, 1); save(); updateBookmarkBtn(); openPanel('bm'); }
    else if (a === 'bmren') { var bk = m.bm[+v]; askInput('Bookmark title', 'Title for page ' + bk.p, bk.t, 'text', function (val) { bk.t = String(val || '').trim().slice(0, 80) || 'Page ' + bk.p; save(); openPanel('bm'); }); }
    else if (a === 'tag') { toggleTag(pdfView.cur, v); openPanel('tags'); }
    else if (a === 'tf') { tagFilter = v; openPanel('tags'); }
    else if (a === 'done') { toggleTag(pdfView.cur, 'done'); openPanel('info'); }
    else if (a === 'anndel') { var q1 = v.split(':'); delAnn(+q1[0], +q1[1]); openPanel('marks'); }
    else if (a === 'annedit') { var q2 = v.split(':'), an2 = pdfView.annots[+q2[0]][+q2[1]]; closeSheet(); pdfGoTo(+q2[0], false); if (an2.k === 'n' && ext.noteOpen) ext.noteOpen({ pg: +q2[0], ann: an2 }); else pdfOpenTextSheet({ pg: +q2[0], ann: an2 }); }
    else if (a === 'clearpg') { clearPage(pdfView.cur); openPanel('marks'); }
    else if (ext[a]) ext[a](v, b);
    else if (a === 'mbsave') saveMistake();
    else if (a === 'thumb') { closeSheet(); pdfGoTo(+v, false); }
    else if (a === 'tabgo') { closeSheet(); switchTo(v); }
    else if (a === 'tabx') { closeTab(v).then(function () { if (!sheet.classList.contains('hidden')) openMgr(); }); }
    else if (a === 'mgr') openMgr();
    else if (a === 'restore') { W.restore = !W.restore; save(); openMgr(); }
    else if (a === 'closeall') { closeSheet(); closeMany(null, W.tabs.slice()); }
    else if (a === 'reopen') { closeSheet(); reopenClosed(); }
    else if (a === 'm-close') { closeSheet(); closeTab(v); }
    else if (a === 'm-others') { closeSheet(); closeMany(v, W.tabs.filter(function (x) { return x !== v; })); }
    else if (a === 'm-right') { closeSheet(); var i = W.tabs.indexOf(v); closeMany(v, W.tabs.slice(i + 1)); }
    else if (a === 'm-all') { closeSheet(); closeMany(null, W.tabs.slice()); }
    else if (a === 'm-left' || a === 'm-rightmv') { var j = W.tabs.indexOf(v), k = a === 'm-left' ? j - 1 : j + 1; if (k >= 0 && k < W.tabs.length) { W.tabs.splice(k, 0, W.tabs.splice(j, 1)[0]); save(); render(); } closeSheet(); }
  }

  /* ---------- tab menu + manager ---------- */
  function tabMenu(id) {
    var i = W.tabs.indexOf(id), last = i === W.tabs.length - 1;
    var item = function (a, ic, t, dis) { return '<button class="ws-mi" data-a="' + a + '" data-v="' + esc(id) + '"' + (dis ? ' disabled' : '') + '><i class="ph-bold ' + ic + '"></i>' + t + '</button>'; };
    show('<div class="ws-head"><b>' + esc(titleOf(id)) + '</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' +
      item('m-close', 'ph-x', 'Close tab') + item('m-others', 'ph-selection-slash', 'Close other tabs', W.tabs.length < 2) + item('m-right', 'ph-arrow-line-right', 'Close tabs to the right', last) +
      item('m-all', 'ph-x-circle', 'Close all tabs') + item('reopen', 'ph-arrow-counter-clockwise', 'Reopen recently closed tab', !W.closed.some(function (c) { return !!rec(c); })) +
      item('m-left', 'ph-arrow-left', 'Move left', i < 1) + item('m-rightmv', 'ph-arrow-right', 'Move right', last), 'short');
  }
  function openMgr() {
    prune();
    var h = '<div class="ws-head"><b>Open PDFs <span class="ws-n">' + W.tabs.length + '</span></b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' +
      '<div class="ws-list" id="wsMgrList">' + (W.tabs.length ? W.tabs.map(function (id) {
        var m = meta(id), on = id === pdfView.resId && viewerOpen(), pg = (id === pdfView.resId && pdfView.doc) ? pdfView.cur : (m.page || (rec(id) || {}).lastPage || 1), tot = m.pages || '?';
        return '<div class="ws-row' + (on ? ' on' : '') + '" data-id="' + esc(id) + '"><span class="ws-grip" data-grip aria-label="Drag to reorder" title="Drag to reorder"><i class="ph-bold ph-dots-six-vertical"></i></span>' +
          '<button class="ws-main" data-a="tabgo" data-v="' + esc(id) + '"><span class="ws-rtw"><span class="ws-rt">' + esc(titleOf(id)) + '</span><small>Page ' + pg + ' / ' + tot + (pct(id) ? ' · ' + pct(id) + '% done' : '') + (on ? ' · viewing' : '') + '</small></span></button>' +
          '<button class="ws-ic" data-a="tabx" data-v="' + esc(id) + '" aria-label="Close tab"><i class="ph-bold ph-x"></i></button></div>';
      }).join('') : '<div class="ws-empty">No PDFs are open. Open one from the Library.</div>') + '</div>' +
      '<div class="ws-foot"><button class="ws-chip" data-a="reopen"' + (W.closed.some(function (c) { return !!rec(c); }) ? '' : ' disabled') + '><i class="ph-bold ph-arrow-counter-clockwise"></i> Reopen closed</button>' +
      '<button class="ws-chip" data-a="closeall"' + (W.tabs.length ? '' : ' disabled') + '><i class="ph-bold ph-x-circle"></i> Close all</button></div>' +
      '<button class="ws-toggle" data-a="restore" role="switch" aria-checked="' + W.restore + '"><span>Restore previous PDF session<small>Keep these tabs after CMA Orbit restarts</small></span><b class="' + (W.restore ? 'on' : '') + '">' + (W.restore ? 'ON' : 'OFF') + '</b></button>';
    panelOpen = false; show(h, 'tall');
    var list = $('wsMgrList');
    if (list) list.addEventListener('pointerdown', function (e) {
      var g = e.target.closest('[data-grip]'); if (!g) return;
      var row = g.closest('.ws-row'); e.preventDefault(); row.classList.add('drag'); g.setPointerCapture(e.pointerId);
      var mv = function (ev) {
        var rows = Array.prototype.slice.call(list.querySelectorAll('.ws-row'));
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] === row) continue;
          var r = rows[i].getBoundingClientRect();
          if (ev.clientY > r.top && ev.clientY < r.bottom) { if (ev.clientY < r.top + r.height / 2) list.insertBefore(row, rows[i]); else list.insertBefore(row, rows[i].nextSibling); break; }
        }
      };
      var up = function () {
        g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
        row.classList.remove('drag');
        W.tabs = Array.prototype.slice.call(list.querySelectorAll('.ws-row')).map(function (r2) { return r2.dataset.id; });
        save(); render();
      };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
  }

  /* ---------- Add to Mistake Book (re-uses AppState.mistakeBook, same record shape as o2Mb) ---------- */
  function openMistake() {
    if (!pdfView.resId) return;
    var r = rec(pdfView.resId) || {}, p = pdfView.cur, m = meta(pdfView.resId);
    panelOpen = false;
    show('<div class="ws-head"><b>Add to Mistake Book</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' +
      '<div class="ws-src"><i class="ph-bold ph-file-pdf"></i><span>' + esc(r.title || 'PDF') + ' · page ' + p + '</span></div>' +
      '<label class="ws-lbl" for="wsMbNote">What went wrong / what to remember</label>' +
      '<textarea id="wsMbNote" class="ws-ta" rows="3" maxlength="1000" placeholder="Describe the question or mistake">' + esc(m.notes[p] || '') + '</textarea>' +
      '<label class="ws-lbl" for="wsMbTopic">Topic / chapter</label>' +
      '<input id="wsMbTopic" class="ws-search" type="text" maxlength="120" value="' + esc(r.chapter || '') + '" placeholder="Optional">' +
      '<button class="ws-primary" data-a="mbsave"><i class="ph-bold ph-plus-circle"></i>Add to Mistake Book</button>', 'short');
  }
  function saveMistake() {
    var r = rec(pdfView.resId) || {}, p = pdfView.cur;
    var note = ($('wsMbNote').value || '').trim(), topic = ($('wsMbTopic').value || '').trim();
    var src = (r.title || 'PDF') + ', page ' + p;
    if (!Array.isArray(AppState.mistakeBook)) AppState.mistakeBook = [];
    AppState.mistakeBook.unshift({
      id: 'err_' + Date.now() + '_pdf', question: note || ('Review ' + src), yourAnswer: '', correctAnswer: '',
      subject: r.subject || 'General', chapter: topic || r.chapter || '', topic: topic, explanation: 'Source: ' + src,
      source: 'PDF', pdfId: pdfView.resId, pdfName: r.title || '', pdfPage: p,
      created: Date.now(), type: 'Other', status: 'New', priority: 'Medium'
    });
    if (AppState.mistakeBook.length > 300) AppState.mistakeBook = AppState.mistakeBook.slice(0, 300);
    saveState(); closeSheet(); showToast('Added to Mistake Book');
  }

  /* ---------- thumbnails (lazy, one at a time) ---------- */
  function openThumbs() {
    if (!pdfView.doc) return;
    panelOpen = false; var tok = ++thumbTok, m = meta(pdfView.resId), n = pdfView.numPages, cells = '';
    for (var i = 1; i <= n; i++) {
      var b = m.bm.some(function (x) { return x.p === i; }) ? '<i class="ph-bold ph-bookmark-simple"></i>' : '';
      var t = (m.tags[i] || []).map(function (k) { var x = TAGS.find(function (y) { return y[0] === k; }); return x ? x[1] : ''; }).join('');
      cells += '<button class="ws-th' + (i === pdfView.cur ? ' on' : '') + '" data-a="thumb" data-v="' + i + '" data-p="' + i + '" aria-label="Page ' + i + '"><div class="ws-thc"><canvas></canvas></div><span>' + i + ' ' + b + t + '</span></button>';
    }
    show('<div class="ws-head"><b>Pages <span class="ws-n">' + n + '</span></b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div><div class="ws-grid" id="wsGrid">' + cells + '</div>', 'tall');
    var grid = $('wsGrid'), queue = [], running = false, doc = pdfView.doc;
    var cur = grid.querySelector('.on'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
    var pump = async function () {
      if (running) return; running = true;
      while (queue.length && tok === thumbTok && doc === pdfView.doc) {
        var el = queue.shift(), pn = +el.dataset.p;
        try {
          var pg = await doc.getPage(pn), vp0 = pg.getViewport({ scale: 1 }), sc = 120 / vp0.width, vp = pg.getViewport({ scale: sc });
          var cv = el.querySelector('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
          await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        } catch (err) { /* page unavailable */ }
      }
      running = false;
    };
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting && !en.target.dataset.q) { en.target.dataset.q = '1'; queue.push(en.target); } });
      pump();
    }, { root: grid, rootMargin: '300px' });
    grid.querySelectorAll('.ws-th').forEach(function (c) { io.observe(c); });
  }

  /* ---------- zoom presets, tone ---------- */
  function fit(kind) {
    if (!pdfView.pages.length) return;
    var sc = $('pdfScroller'), ah = pdfView.firstH / pdfView.firstW, base = pdfPageSize(ah).w / pdfView.zoom, z = 1;
    if (kind === 'w') { if (pdfView.orient === 'h') { pdfView.orient = 'v'; pdfSavePrefs(); pdfRelayout(pdfView.cur); } z = 1; }
    else if (kind === 'p') { z = pdfView.orient === 'h' ? 1 : Math.min(1, (sc.clientHeight - 24) / (pdfView.fitW * ah)); }
    else { z = (pdfView.firstW * 4 / 3) / base; }
    pdfSetZoom(z); pdfGoTo(pdfView.cur, false);
    showToast(kind === 'w' ? 'Fit width' : kind === 'p' ? 'Fit page' : 'Actual size');
  }
  function setTone(f) {
    pdfView.filter = f; $('pdfViewerModal').dataset.pf = f; pdfSavePrefs(); pdfUpdateToolbar(); snap(); render();
  }
  /* Rotation keeps every annotation tool working: annotations are held in the frame you are looking at,
     rotated together with the page, and converted back to the PDF's own orientation when saved / shared. */
  var probeCtx = document.createElement('canvas').getContext('2d');
  function xformList(list, dir, W, H) {
    var ah = H / W;
    list.forEach(function (s) {
      var mx = function (x, y) { return dir > 0 ? [1 - y, x] : [y, 1 - x]; };
      if (s.k === 't') {
        var m = pdfTextMetrics(probeCtx, s, W), w = m.w / W, h = m.h / H;
        var c = mx(s.x + w / 2, s.y + h / 2), w2 = w / ah, h2 = h * ah;
        s.x = c[0] - w2 / 2; s.y = c[1] - h2 / 2; s.s = s.s / ah; s.r = (((s.r || 0) + 90 * dir) % 360 + 360) % 360; if (!s.r) delete s.r;
      } else if (s.k === 'n') {
        var cn = mx(s.x + 0.0225, s.y + 0.0225 / ah);
        s.x = cn[0] - 0.0225; s.y = cn[1] - 0.0225 * ah;
      } else {
        for (var i = 0; i + 1 < s.p.length; i += 2) { var q = mx(s.p[i], s.p[i + 1]); s.p[i] = q[0]; s.p[i + 1] = q[1]; }
        s.w = s.w / ah;
      }
      if (s._bb) delete s._bb;
    });
  }
  function xformAll(annots, dir, steps) {
    Object.keys(annots).forEach(function (k) {
      var pg = pdfView.pages[+k - 1]; if (!pg || !annots[k] || !annots[k].length) return;
      var W = pg.w, H = pg.h;
      for (var n = 0; n < steps; n++) { xformList(annots[k], dir, W, H); var t = W; W = H; H = t; }
    });
  }
  function setRot(r, silent) {
    r = ((r % 360) + 360) % 360;
    var steps = ((r - (pdfView.rot || 0) + 360) % 360) / 90;
    if (!steps) return;
    xformAll(pdfView.annots, +1, steps);
    for (var i = 0; i < steps; i++) {
      var t = pdfView.firstW; pdfView.firstW = pdfView.firstH; pdfView.firstH = t;
      pdfView.pages.forEach(function (pg) { if (pg.ah) { pg.ah = 1 / pg.ah; var tw = pg.w; pg.w = pg.h; pg.h = tw; } });
    }
    pdfView.rot = r; pdfView.undo = []; pdfView.redo = [];
    if (!silent && Object.keys(pdfView.annots).length) pdfMarkDirty();
    pdfRelayout(pdfView.cur); pdfUpdateToolbar();
    if (!silent) { snap(); showToast(r ? 'Rotated ' + r + '°' : 'Rotation reset'); }
  }
  /* un-rotated copy of the annotations (what gets stored / embedded in a shared PDF) */
  function unrotated() {
    var steps = ((pdfView.rot || 0) % 360) / 90, copy = JSON.parse(JSON.stringify(pdfView.annots));
    if (!steps) return copy;
    Object.keys(copy).forEach(function (k) {
      var pg = pdfView.pages[+k - 1]; if (!pg) return;
      var W = pg.w, H = pg.h;
      for (var n = 0; n < steps; n++) { xformList(copy[k], -1, W, H); var t = W; W = H; H = t; }
    });
    return copy;
  }
  var origPut = annotPut;
  annotPut = function (id, data) {
    if (pdfView.rot && id === pdfView.resId && data && data.pages) {
      var u = unrotated(), pages = {};
      Object.keys(data.pages).forEach(function (k) { if (u[k] && u[k].length) pages[k] = u[k]; });
      data = Object.assign({}, data, { pages: pages });
    }
    return origPut(id, data);
  };
  var origBuild = pdfBuildAnnotatedBytes;
  pdfBuildAnnotatedBytes = async function () {
    if (!pdfView.rot) return origBuild();
    var live = pdfView.annots; pdfView.annots = unrotated();
    try { return await origBuild(); } finally { pdfView.annots = live; }
  };
  /* double-tap zooms in / back out around the tapped point (read tool only) */
  function dblTap() {
    var sc = $('pdfScroller'), last = { t: 0, x: 0, y: 0 };
    if (!sc) return;
    sc.addEventListener('pointerup', function (e) {
      if (pdfView.tool !== 'hand' || e.isPrimary === false || pdfView.pinch || pdfView.editing) return;
      var now = Date.now();
      if (now - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
        last.t = 0;
        var target = pdfView.zoom < 1.4 ? 2 : 1;
        pdfZoomTo(target, pdfAnchorAt(e.clientX, e.clientY), e.clientX, e.clientY);
      } else { last.t = now; last.x = e.clientX; last.y = e.clientY; }
    });
  }

  /* ---------- lifecycle ---------- */
  function flush() { snap(); wr(); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  var ext = {};
  window.pdfWorkspace = null;
  build();
  render();
  setInterval(function () { if (viewerOpen() && pdfView.doc) snap(); }, 15000);
  window.pdfWorkspace = { tabs: function () { return W.tabs.slice(); }, state: function () { return W; }, openMgr: openMgr, ext: ext,
    _: { W: W, meta: meta, rec: rec, save: save, show: show, closeSheet: closeSheet, esc: esc, $: $, pct: pct, render: render, prune: prune, fmtDate: fmtDate, snap: snap, titleOf: titleOf, viewerOpen: viewerOpen, openPanel: openPanel, setRot: setRot, delAnn: delAnn, openMgr: openMgr, busy: function () { return busy; } } };
})();

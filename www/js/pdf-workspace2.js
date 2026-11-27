/* CMA Orbit - PDF workspace, part 2: sticky-note sheet, password prompt, Split View, PDF library.
   Builds on window.pdfWorkspace (js/pdf-workspace.js). */
(function () {
  'use strict';
  var API = window.pdfWorkspace;
  if (!API || !API._ || typeof pdfView === 'undefined') return;
  var X = API._, W = X.W, ext = API.ext, $ = X.$, esc = X.esc, meta = X.meta, rec = X.rec, save = X.save, show = X.show, closeSheet = X.closeSheet;
  var sheet = $('wsSheet');

  /* ---------- password prompt (used by pdfOpenDoc in app.js) ---------- */
  window.wsAskPassword = function (wrong) {
    return new Promise(function (resolve) {
      show('<div class="ws-head"><b>Password required</b></div>' +
        '<div class="ws-src"><i class="ph-bold ph-lock-key"></i><span>' + (wrong ? 'That password was not correct. Try again.' : 'This PDF is protected. Enter its password to open it.') + '</span></div>' +
        '<input id="wsPw" class="ws-search" type="password" autocomplete="off" placeholder="Password">' +
        '<div class="ws-foot"><button class="ws-chip" id="wsPwNo">Cancel</button><button class="ws-chip on" id="wsPwOk">Open</button></div>', 'short');
      var done = function (v) { sheet.classList.add('hidden'); sheet.innerHTML = ''; resolve(v); };
      $('wsPwNo').onclick = function () { done(null); };
      $('wsPwOk').onclick = function () { done($('wsPw').value); };
      $('wsPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') done($('wsPw').value); });
      setTimeout(function () { try { $('wsPw').focus({ preventScroll: true }); } catch (e) {} }, 80);
    });
  };

  /* ---------- sticky note sheet ---------- */
  var NOTE_COLS = ['#FFD60A', '#FF9EC4', '#8EE2A0', '#8CC8FF'];
  var noteCtx = null, noteCol = NOTE_COLS[0];
  ext.noteOpen = function (ctx) {
    var a = ctx.ann; noteCol = a ? (a.c || NOTE_COLS[0]) : NOTE_COLS[0];
    show('<div class="ws-head"><b>' + (a ? 'Edit note' : 'New sticky note') + '</b><button class="ws-close" data-a="notex" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' +
      '<textarea id="wsStk" class="ws-ta" rows="4" maxlength="1000" placeholder="Write your note...">' + esc(a ? a.t : '') + '</textarea>' +
      '<div class="ws-lbl">Colour</div><div class="ws-chips">' + NOTE_COLS.map(function (c) { return '<button class="ws-sw' + (c === noteCol ? ' on' : '') + '" data-a="notecol" data-v="' + c + '" style="background:' + c + '" aria-label="Note colour ' + c + '"></button>'; }).join('') + '</div>' +
      '<div class="ws-foot">' + (a ? '<button class="ws-chip" data-a="notedel"><i class="ph-bold ph-trash"></i> Delete</button>' : '') + '<button class="ws-chip on" data-a="notesave"><i class="ph-bold ph-check"></i> Save</button></div>', 'short');
    noteCtx = ctx; pdfView.editing = ctx;
    setTimeout(function () { try { $('wsStk').focus({ preventScroll: true }); } catch (e) {} }, 80);
  };
  function noteEnd() { noteCtx = null; pdfView.editing = null; sheet.classList.add('hidden'); sheet.innerHTML = ''; }
  ext.notex = function () { noteEnd(); };
  ext.noteReset = function () { if (noteCtx) { noteCtx = null; pdfView.editing = null; } };
  ext.notecol = function (v) { noteCol = v; sheet.querySelectorAll('.ws-sw').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); }); };
  ext.notedel = function () {
    var c = noteCtx; if (!c || !c.ann) return noteEnd();
    var i = (pdfView.annots[c.pg] || []).indexOf(c.ann); if (i >= 0) X.delAnn(c.pg, i); noteEnd();
  };
  ext.notesave = function () {
    var c = noteCtx; if (!c) return; var t = $('wsStk').value.trim();
    if (c.ann) {
      var before = { t: c.ann.t, c: c.ann.c }, after = { t: t, c: noteCol };
      if (before.t !== after.t || before.c !== after.c) { Object.assign(c.ann, after); pdfView.undo.push({ t: 'edit', pg: c.pg, ann: c.ann, before: before, after: after }); pdfView.redo = []; pdfMarkDirty(); }
    } else {
      var n = { k: 'n', x: Math.min(0.95, c.x), y: Math.min(0.95, c.y), t: t, c: noteCol };
      (pdfView.annots[c.pg] = pdfView.annots[c.pg] || []).push(n);
      pdfView.undo.push({ t: 'add', pg: c.pg, stroke: n }); pdfView.redo = []; pdfMarkDirty();
    }
    pdfScheduleRedraw(c.pg); pdfUpdateToolbar(); noteEnd();
  };
  window.wsNoteOpen = ext.noteOpen;

  /* ---------- Split View: a light read-only second reader (independent scroll + zoom) ---------- */
  var P2 = { id: null, doc: null, zoom: 1, pages: [], io: null, tok: 0, ah: 1.414, cur: 1 };
  var body = document.querySelector('#pdfViewerModal .pdf-body'), pane, divider;
  function dirDefault() { return window.innerWidth > window.innerHeight ? 'r' : 'c'; }
  function buildSplitDom() {
    if (pane || !body) return;
    divider = document.createElement('div');
    divider.id = 'wsDiv'; divider.className = 'ws-div hidden'; divider.setAttribute('role', 'separator'); divider.setAttribute('aria-label', 'Drag to resize split view');
    divider.innerHTML = '<span></span>';
    pane = document.createElement('div');
    pane.id = 'wsPane2'; pane.className = 'ws-pane hidden';
    pane.innerHTML = '<div class="ws-p2head"><button class="ws-p2t" data-p2="pick" title="Choose PDF"><span id="wsP2Title"></span><i class="ph-bold ph-caret-down"></i></button>' +
      '<span id="wsP2Pg" class="ws-p2pg"></span><button data-p2="zo" aria-label="Zoom out"><i class="ph-bold ph-minus"></i></button><button data-p2="zi" aria-label="Zoom in"><i class="ph-bold ph-plus"></i></button>' +
      '<button data-p2="dir" aria-label="Switch split direction" title="Switch left/right and top/bottom"><i class="ph-bold ph-columns"></i></button>' +
      '<button data-p2="x" aria-label="Close split view" title="Close split view"><i class="ph-bold ph-x"></i></button></div>' +
      '<div id="wsP2Sc" class="ws-p2sc"><div id="wsP2Pages"></div></div>';
    body.appendChild(divider); body.appendChild(pane);
    pane.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p2]'); if (!b) return; var a = b.dataset.p2;
      if (a === 'x') closeSplit(true);
      else if (a === 'dir') { W.split.dir = W.split.dir === 'r' ? 'c' : 'r'; save(); applySplit(); }
      else if (a === 'zi') p2Zoom(P2.zoom * 1.25);
      else if (a === 'zo') p2Zoom(P2.zoom / 1.25);
      else if (a === 'pick') pickSplit();
    });
    var last = 0;
    $('wsP2Sc').addEventListener('scroll', function () { p2Current(); });
    $('wsP2Sc').addEventListener('pointerup', function (e) {
      var now = Date.now();
      if (now - last < 320) { last = 0; p2Zoom(P2.zoom < 1.4 ? 2 : 1); } else last = now;
    });
    divider.addEventListener('pointerdown', function (e) {
      e.preventDefault(); divider.setPointerCapture(e.pointerId); divider.classList.add('drag');
      var mv = function (ev) {
        var r = body.getBoundingClientRect(), c = W.split.dir === 'c';
        var v = c ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width;
        W.split.ratio = Math.round(Math.min(80, Math.max(20, v * 100)));
        applySplit(true);
      };
      var up = function () {
        divider.removeEventListener('pointermove', mv); divider.removeEventListener('pointerup', up); divider.removeEventListener('pointercancel', up);
        divider.classList.remove('drag'); save(); relayoutBoth();
      };
      divider.addEventListener('pointermove', mv); divider.addEventListener('pointerup', up); divider.addEventListener('pointercancel', up);
    });
  }
  function relayoutBoth() {
    setTimeout(function () { if (pdfView.doc) { try { pdfRelayout(pdfView.cur); } catch (e) {} } p2Layout(); }, 80);
    setTimeout(p2Layout, 350);
  }
  function applySplit(live) {
    buildSplitDom();
    var on = !!(W.split && P2.id), sc = $('pdfScroller');
    body.classList.toggle('ws-split', on);
    pane.classList.toggle('hidden', !on); divider.classList.toggle('hidden', !on);
    if (on) {
      body.dataset.dir = W.split.dir;
      sc.style.flex = '0 0 ' + W.split.ratio + '%'; sc.style.minHeight = 0; sc.style.minWidth = 0;
    } else { sc.style.flex = ''; sc.style.minHeight = ''; sc.style.minWidth = ''; }
    if (!live) relayoutBoth();
  }
  function p2Unload() {
    P2.tok++;
    if (P2.io) { try { P2.io.disconnect(); } catch (e) {} P2.io = null; }
    if (P2.doc) { try { P2.doc.destroy(); } catch (e) {} }
    P2.doc = null; P2.pages = []; var pg = $('wsP2Pages'); if (pg) pg.innerHTML = '';
  }
  async function p2Open(id, page) {
    buildSplitDom(); p2Unload();
    var tok = P2.tok; P2.id = id; P2.zoom = 1;
    $('wsP2Title').textContent = X.titleOf(id);
    $('wsP2Pg').textContent = 'Loading...';
    try {
      var blob = await getPdfBlob(id); if (!blob) throw new Error('missing');
      var doc = await pdfOpenDoc(await blob.arrayBuffer());
      if (tok !== P2.tok) { try { doc.destroy(); } catch (e) {} return; }
      P2.doc = doc;
      var p1 = await doc.getPage(1), v = p1.getViewport({ scale: 1 }); P2.ah = v.height / v.width;
      var host = $('wsP2Pages'); host.innerHTML = '';
      for (var i = 1; i <= doc.numPages; i++) {
        var w = document.createElement('div'); w.className = 'ws-p2w'; w.dataset.p = i;
        var c = document.createElement('canvas'); w.appendChild(c); host.appendChild(w);
        P2.pages.push({ wrap: w, canvas: c, rendered: false, rendering: false, ah: P2.ah });
      }
      p2Layout();
      P2.io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { var i2 = +en.target.dataset.p; if (en.isIntersecting) p2Render(i2); else p2Release(i2); });
      }, { root: $('wsP2Sc'), rootMargin: '700px 0px' });
      P2.pages.forEach(function (p) { P2.io.observe(p.wrap); });
      var tgt = Math.min(doc.numPages, Math.max(1, page || 1));
      setTimeout(function () { var el = P2.pages[tgt - 1]; if (el) $('wsP2Sc').scrollTop = el.wrap.offsetTop - 8; p2Current(); }, 50);
    } catch (e) {
      if (tok !== P2.tok) return;
      showToast(e && e._wsCancel ? 'Password needed to open this PDF' : 'Could not open this PDF in split view');
      closeSplit(true);
    }
  }
  function p2Layout() {
    var sc = $('wsP2Sc'); if (!sc || !P2.pages.length) return;
    var fitW = Math.max(120, sc.clientWidth - 16), w = fitW * P2.zoom;
    P2.pages.forEach(function (p) {
      p.wrap.style.width = Math.round(w) + 'px'; p.wrap.style.height = Math.round(w * p.ah) + 'px';
      if (p.rendered) { p.rendered = false; p.canvas.width = 0; }
    });
    P2.pages.forEach(function (p, i) { var t = p.wrap.offsetTop; if (t + p.wrap.offsetHeight > sc.scrollTop - 700 && t < sc.scrollTop + sc.clientHeight + 700) p2Render(i + 1); });
  }
  async function p2Render(i) {
    var p = P2.pages[i - 1], doc = P2.doc, tok = P2.tok;
    if (!p || p.rendered || p.rendering || !doc) return;
    p.rendering = true;
    try {
      var page = await doc.getPage(i); if (tok !== P2.tok) return;
      var base = page.getViewport({ scale: 1 }); p.ah = base.height / base.width;
      var cssW = parseFloat(p.wrap.style.width) || 300, cssH = cssW * p.ah;
      if (Math.abs(parseFloat(p.wrap.style.height) - cssH) > 1) p.wrap.style.height = Math.round(cssH) + 'px';
      var dpr = Math.min(window.devicePixelRatio || 1, 2), sc = cssW / base.width * dpr;
      var px = base.width * sc * base.height * sc; if (px > 10e6) sc *= Math.sqrt(10e6 / px);
      var vp = page.getViewport({ scale: sc });
      p.canvas.width = Math.floor(vp.width); p.canvas.height = Math.floor(vp.height);
      p.canvas.style.width = Math.round(cssW) + 'px'; p.canvas.style.height = Math.round(cssH) + 'px';
      await page.render({ canvasContext: p.canvas.getContext('2d'), viewport: vp }).promise;
      if (tok === P2.tok) p.rendered = true;
    } catch (e) { /* cancelled */ } finally { p.rendering = false; }
  }
  function p2Release(i) { var p = P2.pages[i - 1]; if (!p) return; p.canvas.width = 0; p.canvas.height = 0; p.rendered = false; }
  function p2Zoom(z) {
    z = Math.min(4, Math.max(0.5, z)); if (!P2.pages.length) return;
    var sc = $('wsP2Sc'), frac = sc.scrollTop / Math.max(1, sc.scrollHeight);
    P2.zoom = z; p2Layout(); sc.scrollTop = frac * sc.scrollHeight; p2Current();
  }
  function p2Current() {
    var sc = $('wsP2Sc'); if (!sc || !P2.pages.length) return;
    var y = sc.scrollTop + sc.clientHeight * 0.35, cur = 1;
    for (var i = 0; i < P2.pages.length; i++) { if (P2.pages[i].wrap.offsetTop <= y) cur = i + 1; else break; }
    P2.cur = cur; $('wsP2Pg').textContent = cur + ' / ' + P2.pages.length;
    if (W.split) { W.split.page = cur; save(); }
  }
  function startSplit(id) {
    W.split = { id: id, dir: (W.split && W.split.dir) || dirDefault(), ratio: (W.split && W.split.ratio) || 50, page: (W.split && W.split.id === id && W.split.page) || 1 };
    P2.id = id; save(); applySplit(true); p2Open(id, W.split.page); relayoutBoth();
  }
  function closeSplit(forget) {
    p2Unload(); P2.id = null;
    if (forget) { W.split = null; save(); }
    applySplit();
  }
  function pickSplit() { libraryHtml('split'); }
  ext.openSplit = function () {
    if (W.split && P2.id) {
      show('<div class="ws-head"><b>Split view</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' +
        '<button class="ws-mi" data-a="sp-pick"><i class="ph-bold ph-files"></i>Choose another PDF</button>' +
        '<button class="ws-mi" data-a="sp-dir"><i class="ph-bold ph-columns"></i>Switch to ' + (W.split.dir === 'r' ? 'top / bottom' : 'left / right') + '</button>' +
        '<button class="ws-mi" data-a="sp-close"><i class="ph-bold ph-x-circle"></i>Close split view</button>', 'short');
    } else libraryHtml('split');
  };
  ext['sp-pick'] = function () { libraryHtml('split'); };
  ext['sp-dir'] = function () { W.split.dir = W.split.dir === 'r' ? 'c' : 'r'; save(); closeSheet(); applySplit(); };
  ext['sp-close'] = function () { closeSheet(); closeSplit(true); };
  ext.beforeClose = function () { p2Unload(); applySplit(true); };
  ext.afterOpen = function () { if (W.split && W.split.id && rec(W.split.id)) { P2.id = W.split.id; applySplit(true); p2Open(W.split.id, W.split.page); relayoutBoth(); } };
  var p2w = 0;
  window.addEventListener('resize', function () { var sc = $('wsP2Sc'); if (!P2.pages.length || !sc || Math.abs(sc.clientWidth - p2w) < 3) return; p2w = sc.clientWidth; setTimeout(p2Layout, 250); });

  /* ---------- PDF library: recent / favourites / collections / search / sort ---------- */
  var L = { q: '', filter: 'all', sort: 'recent', mode: 'open' };
  function ago(ts) {
    if (!ts) return 'never opened';
    var d = Math.floor((Date.now() - ts) / 60000);
    if (d < 1) return 'just now'; if (d < 60) return d + ' min ago'; if (d < 1440) return Math.floor(d / 60) + ' h ago';
    d = Math.floor(d / 1440); return d === 1 ? 'yesterday' : d < 30 ? d + ' days ago' : new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function bytes(n) { return n ? (typeof formatBytes === 'function' ? formatBytes(n) : Math.round(n / 1024) + ' KB') : ''; }
  function allPdfs() { return (AppState.resources || []).filter(function (r) { return r && r.type === 'pdf'; }); }
  function libraryRows() {
    var q = L.q.trim().toLowerCase();
    var rows = allPdfs().filter(function (r) {
      var m = W.meta[r.id] || {}, col = W.coll && W.coll[r.id];
      if (L.mode === 'split' && r.id === pdfView.resId) { /* allowed: same PDF on both sides is useful */ }
      if (q && (r.title || '').toLowerCase().indexOf(q) < 0 && (col || '').toLowerCase().indexOf(q) < 0) return false;
      if (L.filter === 'recent') return !!m.lastOpened;
      if (L.filter === 'fav') return !!r.starred;
      if (L.filter.indexOf('c:') === 0) return col === L.filter.slice(2);
      return true;
    });
    var key = L.filter === 'recent' ? 'recent' : L.sort;
    rows.sort(function (a, b) {
      var ma = W.meta[a.id] || {}, mb = W.meta[b.id] || {};
      if (key === 'name') return (a.title || '').localeCompare(b.title || '');
      if (key === 'size') return (b.fileSize || 0) - (a.fileSize || 0);
      if (key === 'studied') return (mb.lastStudied || 0) - (ma.lastStudied || 0);
      if (key === 'progress') return X.pct(b.id) - X.pct(a.id);
      return (mb.lastOpened || 0) - (ma.lastOpened || 0);
    });
    return rows;
  }
  function libraryHtml(mode) {
    if (mode) L.mode = mode;
    if (!W.coll) W.coll = {};
    var cols = Array.from(new Set(Object.keys(W.coll).map(function (k) { return W.coll[k]; }).filter(Boolean))).sort();
    var chips = [['all', 'All'], ['recent', 'Recent'], ['fav', '★ Favourites']].concat(cols.map(function (c) { return ['c:' + c, c]; }));
    var rows = libraryRows();
    show('<div class="ws-head"><b>' + (L.mode === 'split' ? 'Choose PDF for split view' : 'PDF library') + '</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' +
      '<input id="wsLibQ" class="ws-search" type="search" placeholder="Search PDFs or collections" value="' + esc(L.q) + '" autocomplete="off">' +
      '<div class="ws-chips sm ws-scrollx">' + chips.map(function (c) { return '<button class="ws-chip' + (L.filter === c[0] ? ' on' : '') + '" data-a="lf" data-v="' + esc(c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="ws-sortrow"><label for="wsSort">Sort by</label><select id="wsSort"><option value="recent">Recently opened</option><option value="name">Name</option><option value="size">Size</option><option value="studied">Last studied</option><option value="progress">Progress</option></select>' +
      (L.mode === 'open' ? '<button class="ws-chip" data-a="import"><i class="ph-bold ph-file-arrow-up"></i> Import PDF</button>' : '') + '</div>' +
      '<div class="ws-list" id="wsLibList">' + libRowsHtml(rows) + '</div>', 'tall');
    $('wsSort').value = L.sort;
    $('wsSort').onchange = function () { L.sort = this.value; libraryHtml(); };
    $('wsLibQ').addEventListener('input', function () { L.q = this.value; $('wsLibList').innerHTML = libRowsHtml(libraryRows()); });
  }
  function libRowsHtml(rows) {
    if (!rows.length) return '<div class="ws-empty">' + (allPdfs().length ? 'No PDFs match.' : 'No PDFs yet. Use Import PDF to add one.') + '</div>';
    return rows.map(function (r) {
      var m = W.meta[r.id] || {}, pr = X.pct(r.id), col = W.coll && W.coll[r.id], open = W.tabs.indexOf(r.id) >= 0;
      var info = [m.pages ? m.pages + ' pages' : '', bytes(r.fileSize), 'opened ' + ago(m.lastOpened), pr ? pr + '% done' : ''].filter(Boolean).join(' · ');
      return '<div class="ws-row"><button class="ws-ic ws-star' + (r.starred ? ' on' : '') + '" data-a="lstar" data-v="' + esc(r.id) + '" aria-pressed="' + !!r.starred + '" aria-label="' + (r.starred ? 'Remove from favourites' : 'Add to favourites') + '"><i class="ph-bold ph-star"></i></button>' +
        '<button class="ws-main" data-a="lopen" data-v="' + esc(r.id) + '"><span class="ws-rtw"><span class="ws-rt">' + esc(r.title) + '</span><small>' + esc(info) + (col ? ' · ' + esc(col) : '') + (open ? ' · open' : '') + '</small></span></button>' +
        '<button class="ws-ic" data-a="lmenu" data-v="' + esc(r.id) + '" aria-label="More actions"><i class="ph-bold ph-dots-three-vertical"></i></button></div>';
    }).join('');
  }
  ext.openLib = function () { libraryHtml('open'); };
  ext.lf = function (v) { L.filter = v; libraryHtml(); };
  ext.lstar = function (v) { var r = rec(v); if (!r) return; r.starred = !r.starred; if (typeof saveState === 'function') saveState(); libraryHtml(); };
  ext.lopen = function (v) {
    closeSheet();
    if (L.mode === 'split') startSplit(v); else openPdfResource(v);
  };
  ext.import = function () {
    closeSheet();
    Promise.resolve(closePdfViewer()).then(function () { try { openResourceEdit(); setResType('pdf'); } catch (e) { showToast('Open Library > Add to import a PDF'); } });
  };
  ext.lmenu = function (v) {
    var r = rec(v); if (!r) return;
    var it = function (a, ic, t) { return '<button class="ws-mi" data-a="' + a + '" data-v="' + esc(v) + '"><i class="ph-bold ' + ic + '"></i>' + t + '</button>'; };
    show('<div class="ws-head"><b>' + esc(r.title) + '</b><button class="ws-close" data-a="close" aria-label="Close"><i class="ph-bold ph-x"></i></button></div>' +
      it('lopen', 'ph-folder-open', 'Open') + it('lsplit', 'ph-columns', 'Open in split view') + it('lren', 'ph-pencil-simple', 'Rename') + it('lcol', 'ph-folders', 'Move to collection') + it('ldel', 'ph-trash', 'Delete from library'), 'short');
  };
  ext.lsplit = function (v) { closeSheet(); startSplit(v); };
  ext.lren = function (v) {
    var r = rec(v); if (!r) return;
    closeSheet();
    askInput('Rename PDF', 'New name', r.title, 'text', function (val) {
      var t = String(val || '').trim().slice(0, 120); if (!t) return;
      r.title = t; if (typeof saveState === 'function') saveState();
      try { renderLibrary(); } catch (e) {} X.render(); libraryHtml();
    });
  };
  ext.lcol = function (v) {
    closeSheet(); if (!W.coll) W.coll = {};
    askInput('Collection', 'Collection name (empty removes it)', W.coll[v] || '', 'text', function (val) {
      var t = String(val || '').trim().slice(0, 40);
      if (t) W.coll[v] = t; else delete W.coll[v];
      save(true); libraryHtml();
    });
  };
  ext.ldel = function (v) {
    if (v === pdfView.resId && X.viewerOpen()) { showToast('Close this PDF before deleting it'); return; }
    closeSheet(); deleteResource(v);
    var n = 0, iv = setInterval(function () { n++; if (!rec(v) || n > 20) { clearInterval(iv); X.prune(); X.render(); if (W.split && W.split.id === v) closeSplit(true); } }, 300);
  };
  buildSplitDom();
  var strip = $('wsTabs'), mgr = $('wsTabMgr');
  if (strip && mgr) {
    var plus = document.createElement('button');
    plus.className = 'ws-tabmgr'; plus.setAttribute('aria-label', 'PDF library: open another PDF'); plus.title = 'Open another PDF';
    plus.innerHTML = '<i class="ph-bold ph-plus"></i>';
    plus.addEventListener('click', function () { libraryHtml('open'); });
    strip.insertBefore(plus, mgr);
    var st = document.createElement('button');
    st.className = 'ws-tabmgr'; st.setAttribute('aria-label', 'Study panel: tags, notes, bookmarks, info'); st.title = 'Study panel';
    st.innerHTML = '<i class="ph-bold ph-notebook"></i>';
    st.addEventListener('click', function () { X.openPanel('tags'); });
    strip.insertBefore(st, plus);
  }
})();

/* CMA Orbit "Studio" theme - extra layout blocks. Read-only: never writes AppState. Visible only with html.rd. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function paperPct(p) { var t = 0, c = 0; (p.chapters || []).forEach(function (x) { t += x.totalLectures || 0; c += x.completedLectures || 0; }); return { t: t, c: c, pct: t > 0 ? Math.round(c / t * 100) : 0 }; }
  function todayIdx() { var d = new Date().getDay(); return (d + 6) % 7; }
  function drawProgress() {
    var tab = document.getElementById('tab-profile'); if (!tab) return;
    var box = document.getElementById('rdProgress');
    if (!box) { box = document.createElement('div'); box.id = 'rdProgress'; box.className = 'rd-prog'; var tc = document.getElementById('o2ThemeCard'); tab.insertBefore(box, tc ? tc.nextSibling : tab.firstChild); }
    var papers = [], streak = 0, wk = [0, 0, 0, 0, 0, 0, 0];
    try { papers = getScopedPapers() || []; } catch (e) {}
    try { streak = (typeof computeStreak === 'function') ? computeStreak() : 0; } catch (e) {}
    try { wk = (AppState.weeklyHours || wk).map(function (v) { return Number(v) || 0; }); } catch (e) {}
    var tot = 0, done = 0, rows = '';
    papers.forEach(function (p) { var r = paperPct(p); tot += r.t; done += r.c; rows += '<div class="rd-pr"><div class="rd-prt"><span>' + esc(p.code) + (p.name ? ' · ' + esc(p.name) : '') + '</span><b>' + r.pct + '%</b></div><div class="rd-bar"><i style="width:' + r.pct + '%"></i></div></div>'; });
    var all = tot > 0 ? Math.round(done / tot * 100) : 0;
    var mx = Math.max.apply(null, wk.concat([1])), ti = todayIdx(), L = ['M', 'T', 'W', 'T', 'F', 'S', 'S'], sum = 0;
    var bars = wk.map(function (v, i) { sum += v; var h = Math.max(8, Math.round(v / mx * 100)); return '<div class="rd-c"><i class="' + (i === ti ? 'now' : v > 0 ? 'has' : '') + '" style="height:' + h + '%"></i><span' + (i === ti ? ' class="now"' : '') + '>' + L[i] + '</span></div>'; }).join('');
    box.innerHTML =
      '<div class="rd-card rd-top"><div class="rd-ring" style="--p:' + all + '"><span>' + all + '%</span></div><div class="rd-tx"><b>Overall syllabus</b><small>' + done + ' of ' + tot + ' lectures done</small><em>' + streak + ' day streak</em></div></div>' +
      '<div class="rd-card"><div class="rd-hd"><b>Study hours this week</b><em>' + (Math.round(sum * 10) / 10) + ' h</em></div><div class="rd-bars">' + bars + '</div></div>' +
      '<div class="rd-card"><div class="rd-hd"><b>Papers</b></div>' + (rows || '<small class="rd-empty">No papers in this scope yet.</small>') + '</div>';
  }

  /* ---------- HOME (mockup layout, all themes). Mirrors live values from the existing Home elements; actions call existing handlers. ---------- */
  function T(id) { var e = document.getElementById(id); return e ? (e.textContent || '').trim() : ''; }
  function call(fn) { try { if (typeof window[fn] === 'function') window[fn].apply(null, [].slice.call(arguments, 1)); } catch (e) {} }
  window.rdCall = call;
  function drawHome() {
    var tab = document.getElementById('tab-home'); if (!tab) return;
    var box = document.getElementById('rdHome');
    if (!box) {
      box = document.createElement('div'); box.id = 'rdHome'; box.className = 'rd-home';
      box.innerHTML =
        '<div class="rd-date"><small id="rdDate"></small></div>' +
        '<button class="rd-card rd-hero" onclick="rdCall(\'openExamDateModal\')" aria-label="Set exam date"><div class="rd-r"><span class="rd-cap">Exam countdown</span><span class="rd-sp"></span><span class="rd-fl"><i class="ph-fill ph-flame"></i><b id="rdStreak">0</b> day streak</span></div><div class="rd-r rd-end"><h2 id="rdDays">0</h2><p><b>days to go</b><br><span id="rdAttempt"></span></p></div><div class="rd-hbar"><i id="rdHbar"></i></div></button>' +
        '<div class="rd-card rd-goal"><div class="rd-ring" id="rdGoalRing" style="--p:0"><span id="rdGoalPct">0%</span></div><div class="rd-tx"><b>Daily study goal</b><small id="rdGoalHrs"></small><small class="rd-lh" id="rdGoalSlots"></small></div><button class="rd-plus" onclick="rdCall(\'openAddHourlyGoalModal\')" aria-label="Add study slot"><i class="ph-bold ph-plus"></i></button></div>' +
        '<button class="rd-card rd-paper" onclick="switchTab(\'study\')"><span class="rd-ava"><i class="ph ph-book-open"></i></span><span class="rd-tx"><span class="rd-r"><em id="rdPaperTag"></em><span class="rd-sp"></span><b id="rdPaperPct"></b></span><strong id="rdPaperTitle"></strong><span class="rd-bar"><i id="rdPaperBar"></i></span><small class="rd-lh" id="rdPaperMeta"></small></span></button>' +
        '<div class="rd-tools"><p class="rd-cap">Tools</p><div class="rd-tg">' +
        '<button onclick="rdCall(\'openLibrary\')"><span class="rd-ava a1"><i class="ph ph-file-text"></i></span>Library</button>' +
        '<button onclick="rdCall(\'openNotesModal\')"><span class="rd-ava a2"><i class="ph ph-note"></i></span>Notes</button>' +
        '<button onclick="rdCall(\'openFormulaModal\')"><span class="rd-ava a3"><i class="ph ph-function"></i></span>Formulas</button>' +
        '<button onclick="rdCall(\'openPomodoroModal\')"><span class="rd-ava a4"><i class="ph ph-timer"></i></span>Focus</button>' +
        '</div></div>';
      var after = tab.querySelector('.sr-only'); tab.insertBefore(box, after ? after.nextSibling : tab.firstChild);
    }
    function set(id, v) { var e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; }
    var d = new Date();
    set('rdDate', d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));
    set('rdStreak', T('homeStreak') || '0');
    set('rdDays', String(parseInt(T('cntDays'), 10) || 0));
    set('rdAttempt', T('targetExamDisplay'));
    var pctG = parseInt(T('dailyGoalRingPct'), 10) || 0;
    set('rdGoalPct', pctG + '%'); var gr = document.getElementById('rdGoalRing'); if (gr) gr.style.setProperty('--p', pctG);
    set('rdGoalHrs', T('dailyGoalStatsLabel')); set('rdGoalSlots', T('dailyGoalTaskRatioText').replace('/', ' of ').replace(' slots', '') + ' slots checked');
    // countdown bar = days elapsed share of a 180 day window (visual only)
    var days = parseInt(T('cntDays'), 10) || 0, hb = document.getElementById('rdHbar'); if (hb) hb.style.width = Math.max(4, Math.min(100, Math.round((1 - Math.min(days, 180) / 180) * 100))) + '%';
    var rs = T('resumeSubject'), rt = T('quickResumeText'), rb = document.getElementById('resumeBar');
    set('rdPaperTag', rs || 'Next up'); set('rdPaperTitle', rt || 'Add your first chapter in the Study tab');
    var w = rb ? parseInt(rb.style.width, 10) || 0 : 0; set('rdPaperPct', w + '%'); var pb = document.getElementById('rdPaperBar'); if (pb) pb.style.width = w + '%';
    set('rdPaperMeta', T('resumeMeta') || (T('homeSyllabusPercent') + ' of syllabus done'));
  }
  setInterval(function () { try { drawHome(); } catch (e) {} }, 1000);
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { try { drawHome(); } catch (e) {} }, 250); });


  /* ---------- PRACTICE (mockup layout, all themes). Buttons call the existing handlers. ---------- */
  function drawPractice() {
    var tab = document.getElementById('tab-practice'); if (!tab || document.getElementById('rdPractice')) return;
    var box = document.createElement('div'); box.id = 'rdPractice'; box.className = 'rd-home';
    box.innerHTML =
      '<div class="rd-card rd-mock"><div class="rd-tx"><span class="rd-cap">Mock exam</span><h2>Test yourself under exam timing</h2><button class="rd-dark" onclick="rdCall(\'launchFullMockExam\')"><i class="ph-fill ph-play"></i>Start a mock</button></div><span class="rd-ava big"><i class="ph ph-target"></i></span></div>' +
      '<div class="rd-grid2">' +
      '<button class="rd-card rd-tile" onclick="rdCall(\'openMcqBank\')"><span class="rd-ava"><i class="ph ph-stack"></i></span><b>MCQ Bank</b><small>Practice by paper and chapter</small></button>' +
      '<button class="rd-card rd-tile" onclick="rdCall(\'openMistakeBookModal\')"><span class="rd-ava a4"><i class="ph ph-warning"></i></span><b>Mistake Book</b><small>Questions you got wrong</small></button>' +
      '<button class="rd-card rd-tile" onclick="rdCall(\'openRevisionList\')"><span class="rd-ava a3"><i class="ph ph-arrows-clockwise"></i></span><b>Revision Planner</b><small>1-7-15-30 day reviews</small></button>' +
      '<button class="rd-card rd-tile" onclick="rdCall(\'openFormulaModal\')"><span class="rd-ava a2"><i class="ph ph-function"></i></span><b>Formula Vault</b><small>Revise formulas fast</small></button>' +
      '</div>';
    tab.insertBefore(box, tab.firstChild);
  }
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { try { drawPractice(); } catch (e) {} }, 250); });


  /* ---------- PLANNER: "Today" ring card on top (mirrors the daily goal; read-only values) ---------- */
  function drawPlanner() {
    var tab = document.getElementById('tab-planner'); if (!tab) return;
    var box = document.getElementById('rdToday');
    if (!box) {
      box = document.createElement('div'); box.id = 'rdToday'; box.className = 'rd-card rd-goal';
      box.innerHTML = '<div class="rd-ring" id="rdTRing" style="--p:0"><span id="rdTPct">0%</span></div><div class="rd-tx"><b>Today</b><small id="rdTHrs"></small><small class="rd-lh" id="rdTSlots"></small></div>';
      tab.insertBefore(box, tab.firstChild);
    }
    function set(id, v) { var e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; }
    var pc = parseInt(T('dailyGoalRingPct'), 10) || 0; set('rdTPct', pc + '%');
    var r = document.getElementById('rdTRing'); if (r) r.style.setProperty('--p', pc);
    set('rdTHrs', T('dailyGoalStatsLabel')); set('rdTSlots', T('dailyGoalTaskRatioText').replace('/', ' of ').replace(' slots', '') + ' slots checked');
  }
  setInterval(function () { try { drawPlanner(); } catch (e) {} }, 1000);

  window.rdDrawProgress = drawProgress;
  var _r = window.renderProfileTab;
  if (typeof _r === 'function') { window.renderProfileTab = function () { var x = _r.apply(this, arguments); try { drawProgress(); } catch (e) {} return x; }; }
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { try { drawProgress(); } catch (e) {} }, 200); });
})();

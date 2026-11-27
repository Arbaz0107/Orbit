/* Full-screen / notch blending: tells the Android shell which colour to paint behind the status bar, the
   navigation bar and the camera cut-out, so they always match whatever the app is showing at that edge
   (theme, dark mode, PDF viewer, popups). No-op in a normal browser. */
(function () {
  'use strict';
  function plugin() { try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitBars; } catch (e) { return null; } }
  function bgAt(x, y) {
    var el = document.elementFromPoint(Math.max(1, Math.min(innerWidth - 2, x)), Math.max(1, Math.min(innerHeight - 2, y)));
    while (el && el.nodeType === 1) {
      var m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (m) { var p = m[1].split(',').map(parseFloat); if (p.length < 4 || p[3] > 0.92) return p; }
      el = el.parentElement;
    }
    var d = getComputedStyle(document.body).backgroundColor.match(/rgba?\(([^)]+)\)/);
    return d ? d[1].split(',').map(parseFloat) : [251, 248, 241];
  }
  function hex(p) { return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(p[i]).toString(16)).slice(-2); }).join(''); }
  /* insets (CSS px) pushed by the Android shell */
  window.__orbitInsets = function (t, r, b, l) {
    var st = document.documentElement.style;
    st.setProperty('--sa-top', t + 'px'); st.setProperty('--sa-right', r + 'px'); st.setProperty('--sa-bottom', b + 'px'); st.setProperty('--sa-left', l + 'px');
  };

  /* full-screen panels: let the card's header colour continue under the status bar */
  function paintPanels() {
    var ms = document.querySelectorAll('[id$="Modal"].fixed.inset-0:not(.hidden)');
    for (var i = 0; i < ms.length; i++) {
      var card = ms[i].firstElementChild; if (!card || card.dataset.hdr === '1') continue;
      if (!card.classList.contains('orb-pt')) { var cs = getComputedStyle(card); if (parseFloat(cs.paddingTop) > 0.5) { card.classList.add('orb-pt'); card.style.setProperty('--px', (parseFloat(cs.paddingLeft) || 0) + 'px'); card.style.setProperty('--pxr', (parseFloat(cs.paddingRight) || 0) + 'px'); } }
      var hd = card.firstElementChild, c = null;
      if (hd && !hd.classList.contains('orb-hfill')) { var hcs = getComputedStyle(hd), hm = hcs.backgroundColor.match(/rgba?\(([^)]+)\)/), ha = hm ? (hm[1].split(',').length < 4 ? 1 : parseFloat(hm[1].split(',')[3])) : 0; if (ha < 0.5 && (!hcs.backgroundImage || hcs.backgroundImage === 'none')) hd.classList.add('orb-hfill'); }
      if (hd && hd.classList.contains('orb-hfill')) { var cm = getComputedStyle(card).backgroundColor.match(/rgba?\(([^)]+)\)/); if (cm) { var cp = cm[1].split(',').map(parseFloat); if (cp.length < 4 || cp[3] > 0.5) c = hex(cp); } }
      for (var k = 0; k < 2 && !c; k++) { var el = card.children[k];
      while (el && !c) {
        var bi = getComputedStyle(el).backgroundImage, g = bi && bi.indexOf('gradient') >= 0 && bi.match(/rgba?\(([^)]+)\)/);
        if (g) { var gp = g[1].split(',').map(parseFloat); if (gp.length < 4 || gp[3] > 0.92) { c = hex(gp); break; } } var m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/); if (m) { var p = m[1].split(',').map(parseFloat); if (p.length < 4 || p[3] > 0.92) c = hex(p); } el = el === card ? null : el.parentElement; } }
      if (!c) { var m2 = getComputedStyle(card).backgroundColor.match(/rgba?\(([^)]+)\)/); if (m2) c = hex(m2[1].split(',').map(parseFloat)); }
      if (c) card.style.setProperty('--hdr-bg', c);
    }
  }
  var last = '', timer = 0, sends = 0;
  function sync() {
    paintPanels();
    var P = plugin(); if (!P || !P.set) return;
    var w = innerWidth, h = innerHeight;
    var o = { top: hex(bgAt(w / 2, 2)), bottom: hex(bgAt(w * 0.03, h - 2)), left: hex(bgAt(2, h / 2)), right: hex(bgAt(w - 3, h / 2)) };
    var key = o.top + o.bottom + o.left + o.right;
    if (key === last && sends >= 4) return;
    sends++;
    last = key;
    try { P.set(o); } catch (e) {}
  }
  function soon() { clearTimeout(timer); timer = setTimeout(function () { paintPanels(); sync(); }, 60); }
  function start() {
    sync();
    try { new MutationObserver(soon).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class', 'style', 'data-pf'] }); } catch (e) {}
    addEventListener('resize', soon); addEventListener('orientationchange', soon);
    setInterval(sync, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  setTimeout(sync, 1200);
})();

/* keyboard open flag (a field is focused) */
(function () {
  function isField(e) { return e && /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) && !/^(checkbox|radio|button|range|color|file)$/.test(e.type || ''); }
  var root = document.documentElement;
  document.addEventListener('focusin', function (e) { if (isField(e.target)) root.classList.add('orb-kb'); });
  document.addEventListener('focusout', function () { setTimeout(function () { if (!isField(document.activeElement)) root.classList.remove('orb-kb'); }, 80); });
})();

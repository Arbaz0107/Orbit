/* CMA Orbit 2.0 — style switch: Neo-Brutal (default) <-> Soft Orbit. Preference is per device. */
(function () {
  'use strict';
  function isNeo() { return document.documentElement.classList.contains('neo'); }
  function isRd() { return document.documentElement.classList.contains('rd'); }
  // set(true)=Neo, set(false)=Soft, set('rd')=Studio
  function set(v) {
    var rd = v === 'rd', neo = v === true;
    document.documentElement.classList.toggle('neo', neo);
    document.documentElement.classList.toggle('rd', rd);
    try { localStorage.setItem('o2.theme', rd ? 'rd' : neo ? 'neo' : 'orbit'); } catch (e) {}
    try { var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', rd ? '#F5F2EA' : neo ? '#FBF8F1' : '#FFFAE3'); } catch (e) {}
    draw();
  }
  function draw() {
    var tab = document.getElementById('tab-profile'); if (!tab) return;
    var c = document.getElementById('o2ThemeCard');
    if (!c) { c = document.createElement('div'); c.id = 'o2ThemeCard'; c.className = 'o2-themecard'; var b = tab.querySelector(':scope > .o2s-banner'); tab.insertBefore(c, b ? b.nextSibling : tab.firstChild); }
    c.innerHTML = '<div><b>App style</b><small>Pick how CMA Orbit looks on this device</small></div><div class="seg"><button class="' + (isNeo() ? 'on' : '') + '" onclick="o2SetStyle(true)">Neo</button><button class="' + (!isNeo() && !isRd() ? 'on' : '') + '" onclick="o2SetStyle(false)">Soft</button><button class="' + (isRd() ? 'on' : '') + '" onclick="o2SetStyle(\'rd\')">Studio</button></div>';
  }
  window.o2SetStyle = set;
  var _sw = switchTab; switchTab = function () { var r = _sw.apply(this, arguments); setTimeout(draw, 40); return r; };
  document.addEventListener('DOMContentLoaded', function () { setTimeout(draw, 120); });
})();

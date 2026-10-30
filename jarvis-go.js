/* Served by jarvis-gate.mjs as /__jarvis-go.js on every God's View page.
 * Jarvis links can carry a request after God's View's own share hash: #…&jv=street&jq=Shibuya%20Crossing
 * flies there with God's View's built-in commands (the same ones its voice agent uses), opens Google Street View
 * at the spot and, when a public traffic camera is close by, its live CCTV window on the right. */
(function () {
  var hash = location.hash || '';
  var mode = (/[#&]jv=([a-z]+)/.exec(hash) || [])[1];
  if (!mode) return;
  var place = decodeURIComponent(((/[#&]jq=([^&]*)/.exec(hash) || [])[1] || '').replace(/\+/g, ' '));
  // once: a reload shouldn't fly again
  history.replaceState(null, '', location.pathname + location.search + hash.replace(/&?j[vq]=[^&]*/g, ''));

  function note(text) {
    var el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:fixed;top:92px;left:50%;transform:translateX(-50%);z-index:2147483000;max-width:min(560px,90vw);padding:10px 16px;border-radius:12px;background:rgba(5,7,13,.92);border:1px solid #1f3b57;color:#cfe8ff;font:600 13px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.04em;text-align:center';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 7000);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function km(a, b) {
    var R = 6371, toR = Math.PI / 180, dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  var started = Date.now();
  (function wait() {
    var vc = window.__gevVoiceCommands, gev = window.__godsEyeView;
    if (!vc || typeof vc.runner !== 'function' || !gev || !gev.viewer) {
      if (Date.now() - started < 90000) setTimeout(wait, 500);
      return;
    }
    go(vc, gev).catch(function () {});
  })();

  async function go(vc, gev) {
    var run = function (name, args) { return Promise.resolve(vc.runner(name, args, {})).catch(function () { return null; }); };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));   // past the first-run card
    await sleep(1500);
    if (place) {
      var f = await run('fly_to_location', { query: place, viewMode: 'close', waitForArrival: true });
      if (!f || f.ok === false) { note('Couldn’t find ' + place + '.'); return; }
    }
    if (mode !== 'street') return;
    var c = gev.viewer.camera.positionCartographic, here = { lat: c.latitude * 180 / Math.PI, lon: c.longitude * 180 / Math.PI };

    // Street View: light Google (the Maps key covers it), then open the panorama nearest the spot
    await run('set_layer_visibility', { layerId: 'street-level', enabled: true });
    await sleep(1500);
    var chip = Array.prototype.find.call(document.querySelectorAll('#sl-provider-chips button'), function (b) { return /google/i.test(b.textContent) && b.getAttribute('aria-pressed') !== 'true'; });
    if (chip) { chip.click(); await sleep(1200); }
    var cv = gev.viewer.canvas, r = cv.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (t) {
      var Ctor = t.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
      cv.dispatchEvent(new Ctor(t, { clientX: x, clientY: y, bubbles: true, button: 0, buttons: /down$/.test(t) ? 1 : 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    });

    // the CCTV window, only if a public camera is actually near
    await run('control_cctv', { action: 'enable' });
    await sleep(2500);
    await run('control_cctv', { action: 'nearest' });
    await sleep(1500);
    var img = document.getElementById('cctv-frame'), src = img && (img.currentSrc || img.src) || '';
    var m = /[?&]lat=(-?[\d.]+)&lon=(-?[\d.]+)/.exec(src);
    if (!m || km(here, { lat: +m[1], lon: +m[2] }) > 25) {
      await run('control_cctv', { action: 'disable' });
      note('No public traffic camera near ' + (place || 'here') + ' — Street View only.');
    } else {
      await run('set_panel_open', { panelId: 'cctv-panel', open: true });
    }
  }
})();

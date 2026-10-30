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

    // Street View: light Google (the Maps key covers it), then the panorama under the screen centre
    await run('set_layer_visibility', { layerId: 'street-level', enabled: true });
    await sleep(1500);
    var chip = Array.prototype.find.call(document.querySelectorAll('#sl-provider-chips button'), function (b) { return /google/i.test(b.textContent); });
    if (chip && chip.getAttribute('aria-pressed') !== 'true') { chip.click(); await sleep(1200); }
    var sl = gev.dataManager && gev.dataManager.layers && gev.dataManager.layers.get('street-level');
    var opened = false;
    if (sl && sl.module && typeof sl.module.openNearest === 'function') {
      // the spot under the screen centre, then a ring around it (panoramas sit on streets, the pin may not)
      var cvs = gev.viewer.canvas, mid = gev.viewer.camera.pickEllipsoid({ x: cvs.clientWidth / 2, y: cvs.clientHeight / 2 });
      var c0 = mid && gev.viewer.scene.globe.ellipsoid.cartesianToCartographic(mid);
      var at = c0 ? { lat: c0.latitude * 180 / Math.PI, lon: c0.longitude * 180 / Math.PI } : here;
      var tries = [[0, 0]];
      [60, 120].forEach(function (m) { for (var a = 0; a < 360; a += 45) tries.push([m * Math.cos(a * Math.PI / 180), m * Math.sin(a * Math.PI / 180)]); });
      var shown = function () { var w = document.getElementById('sl-viewer-wrap'); return w && !w.hidden; };
      for (var i = 0; i < tries.length && !shown(); i++) {
        var pt = { lat: at.lat + tries[i][0] / 111320, lon: at.lon + tries[i][1] / (111320 * Math.cos(at.lat * Math.PI / 180)) };
        await Promise.resolve(sl.module.openNearest(pt, {})).catch(function () {});
        await sleep(1800);
      }
      opened = shown();
    }

    // the CCTV window, only for a public camera that is actually near (never fly off to a far one)
    var near = null;
    try {
      var list = await (await fetch('/api/cctv/sources')).json();
      (list.sources || []).forEach(function (cam) {
        if (!Number.isFinite(cam.lat) || !Number.isFinite(cam.lon)) return;
        var d = km(here, { lat: cam.lat, lon: cam.lon });
        if (d <= 25 && (!near || d < near.d)) near = { d: d, cam: cam };
      });
    } catch (e) { near = null; }
    if (near) {
      await run('control_cctv', { action: 'enable' });
      await sleep(1500);
      await run('control_cctv', { action: 'select', cameraQuery: near.cam.name || near.cam.id });
      await run('set_panel_open', { panelId: 'cctv-panel', open: true });
    }
    if (!near) note((opened === false ? 'No Street View right there' : 'Street View') + ' \u2014 no public traffic camera near ' + (place || 'here') + '.');
  }
})();

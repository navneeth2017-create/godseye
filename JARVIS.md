# God's View for Jarvis

This is [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu (MIT, see `LICENSE`),
copied at upstream commit `423ca3c` for Nav's Jarvis. It is the live 3D globe: aircraft, ships, satellites,
earthquakes, fires, public cameras, traffic, and the weather layers — rain radar, satellite clouds, lightning
density, wind (GFS/ECMWF) and NHC cyclone advisories, none of which needs a key.

What is different from upstream (everything else is untouched):

- `jarvis-gate.mjs` — the door. God's View is a local dev server (upstream `SECURITY.md`: put it behind your own
  auth before exposing it), so here it runs on `127.0.0.1` inside the container and the gate is the only thing the
  internet reaches. You get in with the Jarvis key: Jarvis's console posts it to `/__jarvis`, the gate checks it
  against Jarvis (`JARVIS_URL`), sets a signed 30-day session cookie and sends you to the view Jarvis asked for
  (God's View's own share link, `#lat=…&lon=…&alt=…&v=2&l=v.o.l.y`). `/__health` is open for Railway;
  `/__logout` ends the session.
- `Dockerfile` — starts the gate instead of `scripts/docker-start.mjs` (the gate starts that itself) and
  health-checks `/__health`.
- `railway.json` — Dockerfile build, `/__health`, a 5-minute first start (Vite's first dependency pass).
- `docs/media/` is left out (68 MB of demo GIFs and videos the app never loads).
- `jarvis-go.js` — served by the gate on every page. A Jarvis link ending `&jv=street&jq=<place>` flies there with
  God's View's own commands, opens Google Street View at the spot and the live CCTV window when a public camera is
  within 25 km. The gate also adds a `← JARVIS` button, an "Open with Jarvis" door, and hands God's View the http
  form of the browser's Origin (TLS ends at Railway; without it same-site endpoints such as camera frames 403).
- `src/ui/leftPanelRail.js`, `src/ui/rightPanelRail.js`, `src/ui/styles/layers.css` — at big text sizes an open
  side panel takes the whole lane instead of shrinking between the corner readouts, which fade out.

## Setting it up for another Jarvis

1. New Railway project from this repo (Dockerfile build). Variables: `JARVIS_URL` (that Jarvis), `GATE_SECRET`
   (any long random string), `GOOGLE_MAPS_API_KEY` (photoreal 3D + Street View; restrict it to Map Tiles API and
   Maps JavaScript API). Optional free keys: `FIRMS_MAP_KEY` (active fires), `AISSTREAM_API_KEY` (ships),
   `TOMTOM_API_KEY` (live traffic).
2. Generate a domain; in that Jarvis set `GODSVIEW_URL` to it.
3. Jarvis side (navneeth2017-create/jarvis): `memory/godsview.js`, `memory/skywatch.js`, the `/world/link` and
   `/sky` routes and `startSkywatch()` in `memory/service.js`, the `world`/`sky` intents in `memory/brain.js`,
   the 🌐 button and `openWorld()` in `memory/console.html`, and the `jarvis_weather` / `jarvis_gods_view_link`
   MCP tools.

Env on Railway: `GATE_SECRET` (random; keeps sessions across restarts), `JARVIS_URL`
(default `https://jarvis7.up.railway.app`), optional `GATE_HOSTS` (a custom domain), and any of God's View's own
keys from `.env.example` (Google Maps / Cesium ion for photoreal 3D, AISStream for ships, FIRMS for fires, OpenAI
for its voice agent). None is needed to start.

Updating from upstream: copy a newer upstream tree over this one (keeping the three files above and leaving
`docs/media/` out), run it locally with `node jarvis-gate.mjs`, push.

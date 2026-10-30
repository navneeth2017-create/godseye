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

Env on Railway: `GATE_SECRET` (random; keeps sessions across restarts), `JARVIS_URL`
(default `https://jarvis7.up.railway.app`), optional `GATE_HOSTS` (a custom domain), and any of God's View's own
keys from `.env.example` (Google Maps / Cesium ion for photoreal 3D, AISStream for ships, FIRMS for fires, OpenAI
for its voice agent). None is needed to start.

Updating from upstream: copy a newer upstream tree over this one (keeping the three files above and leaving
`docs/media/` out), run it locally with `node jarvis-gate.mjs`, push.

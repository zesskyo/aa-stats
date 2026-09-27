/*
 * travel-map.js — the "Travel map" on a run's page: where the player went, from Hermes' ghost file.
 * build.mjs turns logs/<N>.ghost into paths/<N>.json (columns t, d, x, z, y, h — see ghost.mjs); this draws it:
 * one map per dimension with the path as a single line, the same icons as the progress graph where things
 * happened (deaths, thunder, riptide, trident, nautilus shells, the god apple, portals), the player's head,
 * and a timeline with the dimensions coloured like the progress graph.
 * With the run's seed, the world's biomes and structures are drawn underneath (see seed-map.js): bright near
 * where the player has been so far, faded everywhere else.
 */
const travelCache = {};             // run id -> loaded path
let travelResize = null;
const TRAVEL_SEEN = 32;             // chunks around the player shown as "explored" (maximum render distance: a square)
const TRAVEL_NEAR = 64;             // a structure this close to the path counts as one the player went to

const travelCardShell = () => `
  <section class="card chartcard travel" id="travelCard">
    <div class="head-row" style="align-items:center">
      <h2>${esc(T.travelTitle)}</h2>
      <button type="button" class="btn icon" id="tvFsBtn" aria-label="${esc(T.fullScreen)}" title="${esc(T.fullScreen)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
    </div>
    <div id="travelBody"><p class="muted" style="margin:0">${esc(T.travelLoading)}</p></div>
  </section>`;

async function drawTravel(run, d) {
  const body = $("#travelBody"); if (!body) return;
  let P = travelCache[run.id];
  if (!P) {
    try { const res = await fetch(run.meta.path); if (!res.ok) throw 0; P = travelCache[run.id] = travelPrep(await res.json()); }
    catch { body.innerHTML = `<p class="muted" style="margin:0">${esc(T.travelFailed)}</p>`; return; }
  }
  if (!body.isConnected || state.runId !== run.id) return;   // moved on to another run while loading
  travelMount(run, d, P, body);
}

// Columns → points [ms, dim, x, z, y, health], plus per-dimension pieces split at teleports
function travelPrep(g) {
  const pts = g.t.map((t, i) => [t * 100, g.d[i], g.x[i], g.z[i], g.y[i], g.h[i]]);
  const pieces = {o: [], n: [], e: []};
  let cur = null;
  pts.forEach((p, i) => {
    const q = pts[i - 1];
    if (!q || q[1] !== p[1] || Math.hypot(p[2] - q[2], p[3] - q[3]) > 60) { cur = []; pieces[p[1]].push(cur); }
    cur.push(p);
  });
  return {pts, pieces};
}

// Where the player was at time t (between two points: part-way along)
function travelAt(P, t) {
  const a = P.pts; let lo = 0, hi = a.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m][0] <= t) lo = m; else hi = m - 1; }
  const p = a[lo], q = a[lo + 1];
  if (!q || q[1] !== p[1] || q[0] === p[0] || Math.hypot(q[2] - p[2], q[3] - p[3]) > 60) return p;
  const f = Math.min(1, Math.max(0, (t - p[0]) / (q[0] - p[0])));
  return [t, p[1], p[2] + (q[2] - p[2]) * f, p[3] + (q[3] - p[3]) * f, p[4] + (q[4] - p[4]) * f, p[5]];
}

// Icons (from the icons folder) as images the map can draw
const travelImg = {};
function travelIcon(key) {
  if (!okIcon(ICONS[key])) return null;
  if (!travelImg[key]) { const im = new Image(); im.src = ICONS[key]; travelImg[key] = im; }
  return travelImg[key].complete ? travelImg[key] : null;
}

function travelMount(run, d, P, body) {
  const DIMS = {o: T.overworld, n: T.nether, e: T.theEnd};
  const endT = run.finalIgt, card = $("#travelCard");
  const cssv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // ---------- things that happened, placed where they happened (same icons as the progress graph) ----------
  const place = (t, extra) => { const p = travelAt(P, t); return {t, dim: p[1], x: p[2], z: p[3], ...extra}; };
  const events = [
    ...d.deaths.map(x => place(x.t - 250, {t: x.t, k: "death", icon: "skull", text: T.deathLabel, faded: x.intentional})),
    ...(d.thunder != null ? [place(d.thunder, {k: "thunder", icon: "thunder", text: T.thunderMarker})] : []),
    ...d.riptide.map(r => place(r.start, {k: "riptide", icon: "trident", text: T.riptideMarker(r.uses, fmtShort(r.end - r.start)), end: r.end})),
    ...d.lanes.trident.slice(0, 1).map(t => place(t, {k: "trident", icon: "trident", text: T.travelTrident})),   // where it was obtained
    ...d.lanes.nautilus.map((t, i, all) => place(t, {k: "nautilus", icon: "g_nautilus", text: T.nautilusMarker(i + 1, all.length)})),
    ...(run.st.gapple != null ? [place(run.st.gapple, {k: "gapple", icon: "s_gapple", text: T.godAppleMarker})] : []),
    ...run.dims.slice(1).filter((x, i) => x[1] !== run.dims[i][1]).map(x => place(x[0] - 400, {t: x[0], k: "portal", text: T.travelTo(DIMS[x[1]]), to: x[1]})),
  ].sort((a, b) => a.t - b.t);
  const eventIcon = e => e.k === "thunder" && !okIcon(ICONS.thunder) ? `<span class="tvdot thunder"></span>` : ic(e.icon, 16);

  // ---------- the world from the seed, and where the player went ----------
  const world = seedWorld(run);
  let redraw = 0;
  if (world) world.onReady = () => { if (!redraw && card.isConnected) redraw = requestAnimationFrame(() => { redraw = 0; draw(); }); };
  // cells of 16 blocks the path went through (each with the first time it did), for "near the path so far"
  const cells = {16: {}, 128: {}}, squares = {};
  for (const k of "one") {
    const c = cells[16][k] = new Map(), cc = cells[128][k] = new Map(), q = squares[k] = new Set();
    P.pieces[k].forEach(pc => pc.forEach(p => {
      const key = Math.floor(p[2] / 16) + "," + Math.floor(p[3] / 16); if (!c.has(key)) c.set(key, p[0]);
      const k2 = Math.floor(p[2] / 128) + "," + Math.floor(p[3] / 128); if (!cc.has(k2)) cc.set(k2, p[0]);
      q.add(Math.floor(p[2] / STRUCT_TILE) + "," + Math.floor(p[3] / STRUCT_TILE));
    }));
  }
  const nearBy = (k, x, z, t, dist = TRAVEL_NEAR) => {   // was the player within `dist` blocks by time t?
    const size = dist <= TRAVEL_NEAR ? 16 : 128, m = cells[size][k], cx = Math.floor(x / size), cz = Math.floor(z / size), r = Math.round(dist / size);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { if (i * i + j * j > r * r) continue; const v = m.get((cx + i) + "," + (cz + j)); if (v != null && v <= t) return true; }
    return false;
  };
  // was this spot inside the rendered square around the player by time t? (within 32 chunks either way; 128-block cells)
  const seenBy = (k, x, z, t) => {
    const m = cells[128][k], cx = Math.floor(x / 128), cz = Math.floor(z / 128), r = TRAVEL_SEEN * 16 / 128;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const v = m.get((cx + i) + "," + (cz + j)); if (v != null && v <= t) return true; }
    return false;
  };
  const visitedOf = (k, kind) => {   // structures of one kind near the path (searched only where the path goes)
    const found = [];
    for (const sq of squares[k]) {
      const [sx, sz] = sq.split(",").map(Number);
      for (const s of world.structures(k, kind, sx * STRUCT_TILE, sz * STRUCT_TILE, sx * STRUCT_TILE + STRUCT_TILE - 1, sz * STRUCT_TILE + STRUCT_TILE - 1) || [])
        if (nearBy(k, s[0], s[1], Infinity)) found.push(s);
    }
    return found;
  };

  // ---------- the player's head (from their Minecraft skin) ----------
  let head = null;
  if (run.uuid || run.player) { head = new Image(); head.onload = () => draw(); head.src = `https://mc-heads.net/avatar/${encodeURIComponent((run.uuid || run.player).replace(/-/g, ""))}/32`; }

  let dim = "o", t = endT, view = null, playing = false, hot = [];
  const pct = v => (Math.max(0, Math.min(1, v / endT)) * 100).toFixed(3) + "%";
  const dimSegs = run.dims.map((x, i) => [x[0], (run.dims[i + 1] || [endT])[0], x[1]]).filter(s => s[1] > s[0]);
  const BASE = 60;   // playing at 1×: one minute of the run per second; fast forward / rewind double it each press
  let rate = 0;      // 0 = paused, negative = rewinding
  const hours = []; for (let h = 3600000; h < endT; h += 3600000) hours.push(h);
  body.innerHTML = `
    <div class="tvtop"><div class="tabs-inline" id="tvTabs">${"one".split("").filter(k => P.pieces[k].length).map(k => `<button type="button" data-d="${k}">${esc(DIMS[k])}</button>`).join("")}</div></div>
    <div class="tvmap"><canvas id="tvCanvas" aria-label="${esc(T.travelTitle)}"></canvas><div class="tip" id="tvTip"></div><span class="tvhover mono" id="tvHover"></span>
      <button type="button" class="tvfollow" id="tvFollow" aria-pressed="false" title="${esc(T.travelFollow)}" aria-label="${esc(T.travelFollow)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button>
      <div class="tvover"><span class="mono" id="tvWhere"></span></div></div>
    <div class="tvtl">
      <div class="tvctl">
        <button type="button" class="tvbtn" id="tvRw" aria-label="${esc(T.travelRewind)}" title="${esc(T.travelRewind)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 6v12L2.5 12zM21 6v12l-8.5-6z"/></svg></button>
        <button type="button" class="tvplay" id="tvPlay" aria-label="${esc(T.travelPlay)}"></button>
        <button type="button" class="tvbtn" id="tvFf" aria-label="${esc(T.travelForward)}" title="${esc(T.travelForward)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 6v12l8.5-6zM3 6v12l8.5-6z"/></svg></button>
        <span class="tvrate mono" id="tvRate"></span>
      </div>
      <div class="tvtrack" id="tvTrack" role="slider" tabindex="0" aria-label="${esc(T.travelTitle)}" aria-valuemin="0" aria-valuemax="${endT}">
        <div class="tvmarks">${events.filter(e => e.icon).map(e => `<span style="left:${pct(e.t)}"${e.faded ? ' class="faded"' : ""}>${eventIcon(e)}</span>`).join("")}</div>
        <div class="tvstrip">${dimSegs.map(s => `<i class="${s[2] === "n" ? "c-ne" : s[2] === "e" ? "c-en" : "c-ow"}" style="left:${pct(s[0])};width:${pct(s[1] - s[0])}"></i>`).join("")}${hours.map(h => `<u style="left:${pct(h)}"></u>`).join("")}<b class="tvlater" id="tvLater"></b></div>
        <div class="tvhead" id="tvHead"><span class="mono" id="tvNow"></span></div>
        <span class="tvpeek mono" id="tvPeek"></span>
      </div>
      <span class="mono muted tvend">${fmt(endT, 0)}</span>
    </div>`;

  const cv = $("#tvCanvas"), ctx = cv.getContext("2d"), tip = $("#tvTip");
  const mask = document.createElement("canvas"), mctx = mask.getContext("2d");
  const box = () => cv.getBoundingClientRect();
  const size = () => { const r = box(), dpr = devicePixelRatio || 1; cv.width = mask.width = Math.max(1, r.width * dpr); cv.height = mask.height = Math.max(1, r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); mctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const toS = (x, z) => { const r = box(); return [r.width / 2 + (x - view.cx) * view.s, r.height / 2 + (z - view.cz) * view.s]; };
  const toW = (sx, sz) => { const r = box(); return [view.cx + (sx - r.width / 2) / view.s, view.cz + (sz - r.height / 2) / view.s]; };

  // ---------- view: fit the path; zoom limited to between "the whole path, a bit smaller" and 8 pixels a block ----------
  let bounds = null;
  function fit() {
    const r = box(); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    P.pieces[dim].forEach(pc => pc.forEach(p => { x0 = Math.min(x0, p[2]); x1 = Math.max(x1, p[2]); z0 = Math.min(z0, p[3]); z1 = Math.max(z1, p[3]); }));
    if (!isFinite(x0)) { x0 = z0 = -100; x1 = z1 = 100; }
    const s = Math.min((r.width - 60) / Math.max(64, x1 - x0), (r.height - 60) / Math.max(64, z1 - z0));
    bounds = {x0, x1, z0, z1, min: s * .6, max: 8};
    view = {s, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2};
  }
  const clampView = () => {
    view.s = Math.min(bounds.max, Math.max(bounds.min, view.s));
    const r = box(), hw = r.width / 2 / view.s, hh = r.height / 2 / view.s;
    view.cx = Math.min(bounds.x1 + hw * .5, Math.max(bounds.x0 - hw * .5, view.cx));
    view.cz = Math.min(bounds.z1 + hh * .5, Math.max(bounds.z0 - hh * .5, view.cz));
  };
  function setDim(k, refit) {
    if (!P.pieces[k].length) return;
    dim = k;
    $("#tvTabs").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.d === k)));
    if (refit) fit();
    draw();
  }

  // ---------- drawing ----------
  function grid(faint) {
    const r = box(), steps = [16, 32, 64, 128, 256, 512, 1000, 2000, 5000, 10000], step = steps.find(v => v * view.s >= 80) || 20000;
    const [x0, z0] = toW(0, 0), [x1, z1] = toW(r.width, r.height);
    ctx.strokeStyle = cssv("--line"); ctx.globalAlpha = faint ? .35 : .6; ctx.lineWidth = 1; ctx.fillStyle = cssv("--muted"); ctx.font = "11px " + cssv("--mono");
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const [sx] = toS(x, 0); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, r.height); ctx.stroke(); if (sx > 46) ctx.fillText((x || 0).toLocaleString(), sx + 4, 13); }
    for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) { const [, sz] = toS(0, z); ctx.beginPath(); ctx.moveTo(0, sz); ctx.lineTo(r.width, sz); ctx.stroke(); if (sz > 30) ctx.fillText((z || 0).toLocaleString(), 4, sz - 4); }
    ctx.globalAlpha = 1;
  }
  // the path up to time t as one line (for the mask and for drawing)
  const pathSoFar = () => {
    const pth = new Path2D();
    for (const pc of P.pieces[dim]) {
      let started = false;
      for (const p of pc) { if (p[0] > t) break; const [x, z] = toS(p[2], p[3]); if (started) pth.lineTo(x, z); else { pth.moveTo(x, z); started = true; } }
      if (started && pc.length === 1) { const [x, z] = toS(pc[0][2], pc[0][3]); pth.lineTo(x + .1, z); }
    }
    return pth;
  };
  // biomes: tiles at the detail that suits the zoom (coarser ones underneath while those are worked out)
  const SCALES = [4, 16, 64, 256];
  const bioScale = () => SCALES.find(s => s * view.s >= 1) || 256;
  function drawTiles(c, request, faded) {
    const r = box(), want = bioScale(), [x0, z0] = toW(0, 0), [x1, z1] = toW(r.width, r.height), keys = new Set();
    c.imageSmoothingEnabled = false;
    for (const s of SCALES.filter(s => s >= want).reverse()) {
      const span = TILE * s;
      for (let tx = Math.floor(x0 / span); tx <= Math.floor(x1 / span); tx++) for (let tz = Math.floor(z0 / span); tz <= Math.floor(z1 / span); tz++) {
        if (s === want) keys.add(`${dim}|${s}|${tx}|${tz}`);
        const tl = s === want && request ? world.tile(dim, s, tx, tz) : world.peek(dim, s, tx, tz);
        if (tl) { const [sx, sz] = toS(tx * span, tz * span); c.drawImage(faded ? tl.faded : tl.canvas, sx, sz, span * view.s + .5, span * view.s + .5); }
      }
    }
    if (request) world.keepOnly(keys);
  }
  function drawBiomes(pth) {
    const r = box();
    // everywhere: faded (a greyed copy)
    drawTiles(ctx, true, true);
    // around the path so far: clear (a thick copy of the path, filled in with the biomes)
    mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mask.width, mask.height); mctx.restore();
    mctx.globalCompositeOperation = "source-over"; drawTiles(mctx, false);
    // keep them only in the squares of chunks rendered around the player so far
    mctx.globalCompositeOperation = "destination-in";
    const seen = new Path2D(), done = new Set(), side = (TRAVEL_SEEN * 2 + 1) * 16 * view.s;
    for (const pc of P.pieces[dim]) for (const p of pc) {
      if (p[0] > t) break;
      const cx = Math.floor(p[2] / 16), cz = Math.floor(p[3] / 16), k = cx + "," + cz; if (done.has(k)) continue; done.add(k);
      const [sx, sz] = toS((cx - TRAVEL_SEEN) * 16, (cz - TRAVEL_SEEN) * 16); seen.rect(sx, sz, side, side);
    }
    mctx.fillStyle = "#000"; mctx.fill(seen);
    mctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1; ctx.drawImage(mask, 0, 0, r.width, r.height);
  }
  const biomeAt = (x, z) => {
    for (const s of SCALES.filter(s => s >= bioScale())) {
      const span = TILE * s, tx = Math.floor(x / span), tz = Math.floor(z / span), tl = world.peek(dim, s, tx, tz);
      if (tl) { const id = tl.ids[Math.floor((z - tz * span) / s) * TILE + Math.floor((x - tx * span) / s)]; return BIOMES[id] ? titleCase(BIOMES[id][0].replace(/_/g, " ")) : null; }
    }
    return null;
  };
  // structures: the ones near the path so far are clear, the rest faded; zoomed out, only the ones near the path
  function drawStructures() {
    const r = box(), [x0, z0] = toW(0, 0), [x1, z1] = toW(r.width, r.height);
    ctx.font = "600 9px " + cssv("--body"); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const [kind, , badge, maxW, always] of STRUCTS[dim]) {
      const zoomedIn = x1 - x0 <= maxW;
      if (!zoomedIn && !always) continue;
      const pts = zoomedIn ? world.structures(dim, kind, x0 - 200, z0 - 200, x1 + 200, z1 + 200) || [] : visitedOf(dim, kind);
      for (const [x, z] of pts) {
        const [sx, sz] = toS(x, z); if (sx < -14 || sz < -14 || sx > r.width + 14 || sz > r.height + 14) continue;
        if (!zoomedIn && !nearBy(dim, x, z, t)) continue;
        ctx.globalAlpha = seenBy(dim, x, z, t) ? 1 : .5;
        const im = travelIcon("st_" + kind);
        if (im) { ctx.imageSmoothingQuality = "high"; ctx.drawImage(im, sx - 11, sz - 11, 22, 22); }
        else {
          const w = badge.length > 1 ? 11 : 8;
          ctx.fillStyle = cssv("--surface"); ctx.strokeStyle = cssv("--text"); ctx.lineWidth = 1.25;
          ctx.beginPath(); ctx.roundRect(sx - w, sz - 7, w * 2, 14, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = cssv("--text"); ctx.fillText(badge, sx, sz + .5);
        }
        hot.push({x: sx, z: sz, e: {text: T.travelStruct[kind]}});
      }
    }
    ctx.globalAlpha = 1; ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }
  let follow = false;
  function draw() {
    if (!view) return;
    if (follow) { const p = travelAt(P, t); if (p[1] === dim) { view.cx = p[2]; view.cz = p[3]; } }
    const r = box(); ctx.clearRect(0, 0, r.width, r.height);
    hot = [];
    const pth = pathSoFar(), bio = world && !world.failed;
    if (bio) drawBiomes(pth);
    grid(bio);
    // where the path goes later: faint; so far: one red line with a dark edge
    ctx.lineCap = ctx.lineJoin = "round";
    const later = new Path2D();
    for (const pc of P.pieces[dim]) { let on = false; for (const p of pc) { if (p[0] < t) continue; const [x, z] = toS(p[2], p[3]); if (on) later.lineTo(x, z); else { later.moveTo(x, z); on = true; } } }
    ctx.strokeStyle = bio ? "rgba(255,255,255,.55)" : cssv("--line"); ctx.lineWidth = 1.5; ctx.stroke(later);
    ctx.strokeStyle = "rgba(20,10,10,.55)"; ctx.lineWidth = 4.5; ctx.stroke(pth);
    ctx.strokeStyle = "#E0342B"; ctx.lineWidth = 2.5; ctx.stroke(pth);
    // riptide: the stretch drawn over in blue
    for (const e of events) if (e.k === "riptide" && e.dim === dim && e.t <= t) {
      const seg = new Path2D(); let on = false;
      for (const pc of P.pieces[dim]) for (const p of pc) { if (p[0] < e.t || p[0] > Math.min(e.end, t)) continue; const [x, z] = toS(p[2], p[3]); if (on) seg.lineTo(x, z); else { seg.moveTo(x, z); on = true; } }
      ctx.strokeStyle = "#3B8FD9"; ctx.lineWidth = 3; ctx.stroke(seg);
    }
    if (bio) drawStructures();
    // events: their icons
    for (const e of events) {
      if (e.dim !== dim) continue;
      const [x, z] = toS(e.x, e.z);
      if (x < -12 || z < -12 || x > r.width + 12 || z > r.height + 12) continue;
      ctx.globalAlpha = e.t <= t ? (e.faded ? .5 : 1) : .3;
      const im = e.icon && travelIcon(e.icon);
      if (im) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, x - 10, z - 10, 20, 20); ctx.imageSmoothingEnabled = true; }
      else if (e.k === "portal") { ctx.fillStyle = cssv("--s4"); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, z - 7); ctx.lineTo(x + 7, z); ctx.lineTo(x, z + 7); ctx.lineTo(x - 7, z); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = cssv("--gold"); ctx.beginPath(); ctx.arc(x, z, 6, 0, 7); ctx.fill(); }
      hot.push({x, z, e});
    }
    ctx.globalAlpha = 1;
    // the player: their head
    const p = travelAt(P, t);
    if (p[1] === dim) {
      const [x, z] = toS(p[2], p[3]);
      ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 4;
      if (head && head.complete && head.naturalWidth) { ctx.imageSmoothingEnabled = false; ctx.drawImage(head, x - 10, z - 10, 20, 20); ctx.imageSmoothingEnabled = true; }
      else { ctx.fillStyle = cssv("--text"); ctx.fillRect(x - 10, z - 10, 20, 20); }
      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    }
    $("#tvWhere").textContent = `${DIMS[p[1]]} · ${Math.round(p[2])}, ${Math.round(p[4])}, ${Math.round(p[3])}`;
    // timeline: the playhead, with what's still to come dimmed
    $("#tvNow").textContent = fmt(t, 0); $("#tvHead").style.left = pct(t);
    $("#tvLater").style.left = pct(t); $("#tvLater").style.width = `calc(100% - ${pct(t)})`;
    $("#tvTrack").setAttribute("aria-valuenow", Math.round(t)); $("#tvTrack").setAttribute("aria-valuetext", fmt(t, 0));
  }

  // ---------- time: slider, play, the progress graph, the list ----------
  const setT = (v, from) => {
    t = Math.max(0, Math.min(endT, v));
    const p = travelAt(P, t); if (p[1] !== dim) setDim(p[1], true); else draw();
  };
  // the timeline: click or drag to move through the run; arrow keys step a minute
  const track = $("#tvTrack");
  const fromX = ev => { const r = track.getBoundingClientRect(); return (ev.clientX - r.left) / r.width * endT; };
  let scrub = false;
  track.addEventListener("pointerdown", ev => { scrub = true; track.setPointerCapture(ev.pointerId); stop(); setT(fromX(ev)); });
  track.addEventListener("pointermove", ev => { if (scrub) setT(fromX(ev)); });
  track.addEventListener("pointerup", () => { scrub = false; }); track.addEventListener("pointercancel", () => { scrub = false; });
  track.addEventListener("keydown", e => {
    const step = e.shiftKey ? 600000 : 60000;
    if (e.key === "ArrowLeft") setT(t - step); else if (e.key === "ArrowRight") setT(t + step);
    else if (e.key === "Home") setT(0); else if (e.key === "End") setT(endT); else return;
    e.preventDefault();
  });
  // hovering the timeline shows the time there
  track.addEventListener("pointermove", ev => { const v = Math.max(0, Math.min(endT, fromX(ev))), pk = $("#tvPeek"); pk.textContent = fmt(v, 0); pk.style.left = pct(v); pk.style.display = "block"; });
  track.addEventListener("pointerleave", () => { $("#tvPeek").style.display = "none"; });
  // play / pause, fast forward and rewind (each press doubles the speed, up to 32×)
  let last = 0;
  const tick = now => {
    if (!rate || !card.isConnected) return;
    const dt = last ? now - last : 0; last = now;
    setT(t + dt * BASE * rate);
    if ((rate > 0 && t >= endT) || (rate < 0 && t <= 0)) return stop();
    requestAnimationFrame(tick);
  };
  const playIcon = on => `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${on ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : '<path d="M8 5v14l11-7z"/>'}</svg>`;
  const show = () => {
    playing = rate !== 0;
    $("#tvPlay").innerHTML = playIcon(playing); $("#tvPlay").setAttribute("aria-label", playing ? T.travelPause : T.travelPlay);
    $("#tvRate").textContent = rate && Math.abs(rate) !== 1 ? (rate < 0 ? "−" : "") + Math.abs(rate) + "×" : "";
  };
  const runAt = r => { const was = rate; rate = r; show(); if (!was) { last = 0; requestAnimationFrame(tick); } };
  const stop = () => { rate = 0; show(); };
  show();
  $("#tvPlay").addEventListener("click", () => { if (rate) return stop(); if (t >= endT) t = 0; runAt(1); });
  $("#tvFf").addEventListener("click", () => { if (t >= endT) t = 0; runAt(rate > 0 ? Math.min(rate * 2, 32) : 2); });
  $("#tvRw").addEventListener("click", () => { if (t <= 0) t = endT; runAt(rate < 0 ? Math.max(rate * 2, -32) : -2); });
  const setFollow = on => { follow = on; $("#tvFollow").setAttribute("aria-pressed", String(on)); if (on) { view.s = Math.max(view.s, .25); draw(); } };
  $("#tvFollow").addEventListener("click", () => setFollow(!follow));
  $("#tvTabs").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) setDim(b.dataset.d, true); });

  // ---------- hover, drag, zoom ----------
  cv.addEventListener("pointermove", ev => {
    if (drag) return;
    const r = box(), mx = ev.clientX - r.left, mz = ev.clientY - r.top;
    if (world) { const [wx, wz] = toW(mx, mz), b = biomeAt(wx, wz); $("#tvHover").textContent = b ? `${b} · ${Math.round(wx)}, ${Math.round(wz)}` : ""; }
    const near = hot.filter(h => Math.hypot(h.x - mx, h.z - mz) < 11);
    if (!near.length) { tip.style.display = "none"; return; }
    tip.innerHTML = near.slice(0, 6).map(({e}) => `<div><b>${esc(e.text)}</b></div>`).join("") + (near.length > 6 ? `<div class="muted">${esc(T.andMore(near.length - 6))}</div>` : "");
    tip.style.display = "block";
    tip.style.left = Math.max(4, Math.min(mx + 14, r.width - tip.offsetWidth - 4)) + "px"; tip.style.top = Math.max(4, mz - tip.offsetHeight - 12) + "px";
  });
  cv.addEventListener("pointerleave", () => { tip.style.display = "none"; $("#tvHover").textContent = ""; });
  let drag = null; const touches = new Map();
  cv.addEventListener("pointerdown", ev => { cv.setPointerCapture(ev.pointerId); touches.set(ev.pointerId, [ev.clientX, ev.clientY]); drag = {x: ev.clientX, y: ev.clientY, cx: view.cx, cz: view.cz, d: null}; tip.style.display = "none"; });
  cv.addEventListener("pointermove", ev => {
    if (!drag || !touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (touches.size === 2) { const [a, b] = [...touches.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag.d) view.s *= dd / drag.d; drag.d = dd; clampView(); draw(); return; }
    if (follow) setFollow(false);   // moving the map yourself stops following
    view.cx = drag.cx - (ev.clientX - drag.x) / view.s; view.cz = drag.cz - (ev.clientY - drag.y) / view.s; clampView(); draw();
  });
  const up = ev => { touches.delete(ev.pointerId); if (!touches.size) drag = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  // gentle zoom: about 10% per wheel step, towards the mouse
  cv.addEventListener("wheel", ev => {
    ev.preventDefault();
    const r = box(), mx = follow ? r.width / 2 : ev.clientX - r.left, mz = follow ? r.height / 2 : ev.clientY - r.top, [wx, wz] = toW(mx, mz);
    const dy = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
    view.s *= Math.exp(-Math.max(-300, Math.min(300, dy)) * .001);
    clampView();
    view.cx = wx - (mx - r.width / 2) / view.s; view.cz = wz - (mz - r.height / 2) / view.s; clampView(); draw();
  }, {passive: false});
  cv.addEventListener("dblclick", () => { fit(); draw(); });

  // ---------- full screen ----------
  const setFs = on => {
    card.classList.toggle("fs", on); document.body.classList.toggle("noscroll", on);
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(() => { size(); fit(); draw(); });
  };
  $("#tvFsBtn").addEventListener("click", () => { const on = !card.classList.contains("fs"); if (on && card.requestFullscreen) card.requestFullscreen().catch(() => {}); setFs(on); });
  card.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && card.classList.contains("fs")) setFs(false); });
  card.addEventListener("keydown", e => { if (e.key === "Escape" && card.classList.contains("fs")) setFs(false); });
  if (travelResize) window.removeEventListener("resize", travelResize);
  travelResize = () => { if (card.isConnected) { size(); draw(); } };
  window.addEventListener("resize", travelResize);

  // icons load in the background; draw again once they have
  ["skull", "thunder", "trident", "g_nautilus", "s_gapple", ...Object.values(STRUCTS).flat().map(s => "st_" + s[0])].forEach(k => { const im = okIcon(ICONS[k]) && (travelIcon(k) || travelImg[k]); if (im && !im.complete) im.addEventListener("load", () => draw(), {once: true}); });

  size();
  const startDim = travelAt(P, t)[1];
  setDim(P.pieces[startDim].length ? startDim : "o", true);
}

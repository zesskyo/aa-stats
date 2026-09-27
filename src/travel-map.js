/*
 * travel-map.js — the "Travel map" on a run's page: where the player went, from Hermes' ghost file.
 * build.mjs turns logs/<N>.ghost into paths/<N>.json (columns t, d, x, z, y, h — see ghost.mjs); this draws it:
 * one map per dimension, the path coloured by split, where each advancement, death and portal happened, and a
 * timeline that moves together with the progress graph (hover the graph and the player moves on the map).
 */
const travelCache = {};             // run id -> loaded path
let travelFollow = null;            // the progress graph calls this with the time under the mouse
let travelResize = null;

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

function travelMount(run, d, P, body) {
  const DIMS = {o: T.overworld, n: T.nether, e: T.theEnd}, CB = {o: "overworld", n: "nether", e: "end"};
  const endT = run.finalIgt, card = $("#travelCard");
  const cssv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // ---------- events on the map ----------
  const place = (t, extra) => { const p = travelAt(P, t); return {t, dim: p[1], x: p[2], z: p[3], ...extra}; };
  const events = [
    ...d.comp.map(e => place(e[0], {k: "adv", text: advName(e[2])})),
    ...d.deaths.map((x, i) => place(x.t - 250, {t: x.t, k: "death", text: T.deathMarker(i + 1, d.deaths.length) + " · " + x.cause, faded: x.intentional})),
    ...run.dims.slice(1).filter((x, i) => x[1] !== run.dims[i][1]).map(x => place(x[0] - 400, {t: x[0], k: "portal", text: T.travelTo(DIMS[x[1]]), to: x[1]})),
  ].sort((a, b) => a.t - b.t);

  // ---------- colour of each point: the split it's in ----------
  const bands = d.splits.flatMap((p, i) => p.segs.map(g => [g[0], g[1], i]));
  const splitAt = t => { const b = bands.find(b => t >= b[0] && t <= b[1]); return b ? b[2] : 0; };
  P.pts.forEach(p => { p[6] = splitAt(p[0]); });

  // ---------- stats per dimension ----------
  const stats = {};
  for (const dm of "one") {
    let dist = 0, time = 0, fast = 0, far = 0;
    P.pieces[dm].forEach(pc => pc.forEach((p, i) => {
      far = Math.max(far, Math.hypot(p[2], p[3]));
      if (!i) return;
      const q = pc[i - 1], step = Math.hypot(p[2] - q[2], p[3] - q[3]), dt = (p[0] - q[0]) / 1000;
      dist += step; time += dt; if (dt > 0 && step / dt > 20) fast += dt;
    }));
    stats[dm] = {dist, time, fast, far};
  }

  let dim = "o", t = endT, view = null, playing = false, hot = [];
  body.innerHTML = `
    <div class="tvtop">
      <div class="tabs-inline" id="tvTabs">${"one".split("").filter(k => P.pieces[k].length).map(k => `<button type="button" data-d="${k}">${esc(DIMS[k])}</button>`).join("")}</div>
      <div class="tvstats" id="tvStats"></div>
    </div>
    <div class="tvgrid">
      <div class="tvmap"><canvas id="tvCanvas" aria-label="${esc(T.travelTitle)}"></canvas><div class="tip" id="tvTip"></div>
        <div class="tvover"><span class="mono" id="tvWhere"></span>${run.meta.seed ? `<a class="btn" id="tvChunk" target="_blank" rel="noopener noreferrer">${esc(T.travelChunkbase)} ↗</a>` : ""}</div></div>
      <ol class="tvlist" id="tvList">${events.map((e, i) => `<li><button type="button" data-ev="${i}" class="${e.k}${e.faded ? " faded" : ""}"><span class="mono">${fmt(e.t, 0)}</span><span class="tvdot ${e.k}"></span><span>${esc(e.text)}</span></button></li>`).join("")}</ol>
    </div>
    <div class="tvbar">
      <button type="button" class="btn" id="tvPlay">▶ ${esc(T.travelPlay)}</button>
      <input type="range" id="tvTime" min="0" max="${endT}" step="1000" value="${endT}" aria-label="${esc(T.travelTime)}">
      <span class="mono" id="tvNow"></span>
    </div>
    <div class="legend">${d.splits.map((p, i) => p.segs.length ? `<span><i style="background:${SCOL[i]}"></i>${esc(p.name)}</span>` : "").join("")}
      <span><i class="tvdot adv"></i>${esc(T.travelAdv)}</span><span><i class="tvdot death"></i>${esc(T.travelDeath)}</span><span><i class="tvdot portal"></i>${esc(T.travelPortal)}</span>
      <span><i class="tvfast"></i>${esc(T.travelFast)}</span></div>
    <div class="keys"><span>${esc(T.travelKeys)}</span></div>`;

  const cv = $("#tvCanvas"), ctx = cv.getContext("2d"), tip = $("#tvTip");
  const box = () => cv.getBoundingClientRect();
  const size = () => { const r = box(), dpr = devicePixelRatio || 1; cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const toS = (x, z) => { const r = box(); return [r.width / 2 + (x - view.cx) * view.s, r.height / 2 + (z - view.cz) * view.s]; };
  const toW = (sx, sz) => { const r = box(); return [view.cx + (sx - r.width / 2) / view.s, view.cz + (sz - r.height / 2) / view.s]; };
  function fit() {
    const r = box(); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    P.pieces[dim].forEach(pc => pc.forEach(p => { x0 = Math.min(x0, p[2]); x1 = Math.max(x1, p[2]); z0 = Math.min(z0, p[3]); z1 = Math.max(z1, p[3]); }));
    if (!isFinite(x0)) { x0 = z0 = -100; x1 = z1 = 100; }
    view = {s: Math.min((r.width - 60) / Math.max(64, x1 - x0), (r.height - 60) / Math.max(64, z1 - z0)), cx: (x0 + x1) / 2, cz: (z0 + z1) / 2};
  }
  function setDim(k, refit) {
    if (!P.pieces[k].length) return;
    dim = k;
    $("#tvTabs").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.d === k)));
    const s = stats[k], km = v => (v / 1000).toFixed(1) + " km";
    $("#tvStats").innerHTML = [
      [km(s.dist) + (k === "n" ? ` <span class="muted">(${km(s.dist * 8)})</span>` : ""), T.travelDist],
      [fmtShort(s.time * 1000), T.travelTimeHere],
      [fmtShort(s.fast * 1000), T.travelFast],
      [Math.round(s.far).toLocaleString(), T.travelFar],
    ].map(([v, l]) => `<div><b class="mono">${v}</b><span>${esc(l)}</span></div>`).join("");
    if (refit) fit();
    draw();
  }

  function grid() {
    const r = box(), steps = [16, 32, 64, 128, 256, 512, 1000, 2000, 5000, 10000], step = steps.find(v => v * view.s >= 80) || 20000;
    const [x0, z0] = toW(0, 0), [x1, z1] = toW(r.width, r.height);
    ctx.strokeStyle = cssv("--line"); ctx.globalAlpha = .6; ctx.lineWidth = 1; ctx.fillStyle = cssv("--muted"); ctx.font = "11px " + cssv("--mono");
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const [sx] = toS(x, 0); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, r.height); ctx.stroke(); if (sx > 46) ctx.fillText((x || 0).toLocaleString(), sx + 4, 13); }
    for (let z = Math.ceil(z0 / step) * step; z <= z1; z += step) { const [, sz] = toS(0, z); ctx.beginPath(); ctx.moveTo(0, sz); ctx.lineTo(r.width, sz); ctx.stroke(); if (sz > 30) ctx.fillText((z || 0).toLocaleString(), 4, sz - 4); }
    ctx.globalAlpha = 1;
  }
  function draw() {
    if (!view) return;
    const r = box(); ctx.clearRect(0, 0, r.width, r.height); grid();
    const cols = SPLITS.map((_, i) => cssv("--split" + i)), faint = cssv("--line");
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const pc of P.pieces[dim]) for (let i = 1; i < pc.length; i++) {
      const a = pc[i - 1], b = pc[i], done = b[0] <= t;
      const [ax, az] = toS(a[2], a[3]), [bx, bz] = toS(b[2], b[3]);
      if (Math.abs(bx - ax) + Math.abs(bz - az) < .3 && i % 4) continue;   // too small to see at this zoom
      const fast = b[0] > a[0] && Math.hypot(b[2] - a[2], b[3] - a[3]) / ((b[0] - a[0]) / 1000) > 20;
      if (done && fast) { ctx.strokeStyle = cols[b[6]]; ctx.globalAlpha = .22; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke(); }
      ctx.strokeStyle = done ? cols[b[6]] : faint; ctx.globalAlpha = done ? .95 : .7; ctx.lineWidth = done ? 2.25 : 1.5;
      ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    hot = [];
    for (const e of events) {
      if (e.dim !== dim) continue;
      const [x, z] = toS(e.x, e.z);
      if (x < -10 || z < -10 || x > r.width + 10 || z > r.height + 10) continue;
      ctx.globalAlpha = e.t <= t ? (e.faded ? .45 : 1) : .25;
      if (e.k === "adv") { ctx.fillStyle = cssv("--accent"); ctx.strokeStyle = cssv("--surface"); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, z, 4, 0, 7); ctx.fill(); ctx.stroke(); }
      else if (e.k === "death") { ctx.strokeStyle = cssv("--death"); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 5, z - 5); ctx.lineTo(x + 5, z + 5); ctx.moveTo(x + 5, z - 5); ctx.lineTo(x - 5, z + 5); ctx.stroke(); }
      else { ctx.fillStyle = cssv("--s4"); ctx.beginPath(); ctx.moveTo(x, z - 6); ctx.lineTo(x + 6, z); ctx.lineTo(x, z + 6); ctx.lineTo(x - 6, z); ctx.closePath(); ctx.fill(); }
      hot.push({x, z, e});
    }
    ctx.globalAlpha = 1;
    const p = travelAt(P, t);
    if (p[1] === dim) {
      const [x, z] = toS(p[2], p[3]);
      ctx.fillStyle = cssv("--surface"); ctx.beginPath(); ctx.arc(x, z, 8, 0, 7); ctx.fill();
      ctx.fillStyle = cssv("--text"); ctx.beginPath(); ctx.arc(x, z, 5, 0, 7); ctx.fill();
    }
    $("#tvWhere").textContent = `${DIMS[p[1]]} · ${Math.round(p[2])}, ${Math.round(p[4])}, ${Math.round(p[3])}`;
    $("#tvNow").textContent = fmt(t, 0);
    if ($("#tvChunk")) $("#tvChunk").href = `https://www.chunkbase.com/apps/seed-map#seed=${encodeURIComponent(run.meta.seed)}&platform=java_1_16&dimension=${CB[p[1]]}&x=${Math.round(p[2])}&z=${Math.round(p[3])}&zoom=0.5`;
    // the latest event so far is marked in the list
    let cur = -1; events.forEach((e, i) => { if (e.t <= t) cur = i; });
    const list = $("#tvList"), prev = list.querySelector(".now");
    if (prev && prev.dataset.ev != cur) prev.classList.remove("now");
    const nowEl = list.querySelector(`[data-ev="${cur}"]`);
    if (nowEl && !nowEl.classList.contains("now")) { nowEl.classList.add("now"); if (playing) nowEl.scrollIntoView({block: "nearest"}); }
  }

  // ---------- time: slider, play, the progress graph, the list ----------
  const setT = (v, from) => {
    t = Math.max(0, Math.min(endT, v));
    if (from !== "slider") $("#tvTime").value = t;
    const p = travelAt(P, t); if (p[1] !== dim) setDim(p[1], true); else draw();
    if (from !== "graph" && progressCtl) progressCtl.showLine(t);
  };
  $("#tvTime").addEventListener("input", e => setT(+e.target.value, "slider"));
  travelFollow = v => { if (v != null && !playing && card.isConnected) setT(v, "graph"); };
  let last = 0;
  const tick = now => {
    if (!playing || !card.isConnected) return;
    const dt = last ? now - last : 0; last = now;
    setT(t + dt * 300);   // 5 minutes of the run per second
    if (t >= endT) return stop();
    requestAnimationFrame(tick);
  };
  const stop = () => { playing = false; $("#tvPlay").innerHTML = `▶ ${esc(T.travelPlay)}`; };
  $("#tvPlay").addEventListener("click", () => {
    if (playing) return stop();
    playing = true; last = 0; if (t >= endT) t = 0;
    $("#tvPlay").innerHTML = `❚❚ ${esc(T.travelPause)}`; requestAnimationFrame(tick);
  });
  $("#tvList").addEventListener("click", e => {
    const b = e.target.closest("[data-ev]"); if (!b) return;
    const ev = events[+b.dataset.ev]; stop(); setT(ev.t);
    if (ev.dim !== dim) setDim(ev.dim, false);
    view.cx = ev.x; view.cz = ev.z; view.s = Math.max(view.s, .6); draw();
  });
  $("#tvTabs").addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) setDim(b.dataset.d, true); });

  // ---------- hover, drag, zoom ----------
  cv.addEventListener("pointermove", ev => {
    if (drag) return;
    const r = box(), mx = ev.clientX - r.left, mz = ev.clientY - r.top;
    const near = hot.filter(h => Math.hypot(h.x - mx, h.z - mz) < 9);
    if (!near.length) { tip.style.display = "none"; return; }
    tip.innerHTML = near.slice(0, 6).map(({e}) => `<div><b>${esc(e.text)}</b> <span class="mono muted">${fmt(e.t, 0)}</span></div>`).join("") + (near.length > 6 ? `<div class="muted">${esc(T.andMore(near.length - 6))}</div>` : "");
    tip.style.display = "block";
    tip.style.left = Math.max(4, Math.min(mx + 14, r.width - tip.offsetWidth - 4)) + "px"; tip.style.top = Math.max(4, mz - tip.offsetHeight - 12) + "px";
  });
  cv.addEventListener("pointerleave", () => { tip.style.display = "none"; });
  let drag = null; const touches = new Map();
  cv.addEventListener("pointerdown", ev => { cv.setPointerCapture(ev.pointerId); touches.set(ev.pointerId, [ev.clientX, ev.clientY]); drag = {x: ev.clientX, y: ev.clientY, cx: view.cx, cz: view.cz, d: null}; tip.style.display = "none"; });
  cv.addEventListener("pointermove", ev => {
    if (!drag || !touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (touches.size === 2) { const [a, b] = [...touches.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag.d) view.s *= dd / drag.d; drag.d = dd; draw(); return; }
    view.cx = drag.cx - (ev.clientX - drag.x) / view.s; view.cz = drag.cz - (ev.clientY - drag.y) / view.s; draw();
  });
  const up = ev => { touches.delete(ev.pointerId); if (!touches.size) drag = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  const zoomAt = (mx, mz, f) => { const r = box(), [wx, wz] = toW(mx, mz); view.s = Math.min(40, Math.max(.002, view.s * f)); view.cx = wx - (mx - r.width / 2) / view.s; view.cz = wz - (mz - r.height / 2) / view.s; draw(); };
  cv.addEventListener("wheel", ev => { ev.preventDefault(); const r = box(); zoomAt(ev.clientX - r.left, ev.clientY - r.top, ev.deltaY > 0 ? .8 : 1.25); }, {passive: false});
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

  size();
  setDim(travelAt(P, t)[1] in P.pieces && P.pieces[travelAt(P, t)[1]].length ? travelAt(P, t)[1] : "o", true);
}

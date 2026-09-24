/*
 * progress-graph.js — the big "Progress over IGT" graph on the Stats page.
 * Top: advancements plus one line per multi-criteria advancement, with icons for tridents, skulls,
 * nautilus shells, the first god apple, rare biomes, deaths, thunder and riptide sessions.
 * Bottom: gold block estimate and TNT held, plus the dimension strip.
 * Both parts share zoom and the hover line. Controls: drag to zoom, + − ← → 0, F for full screen.
 */
const progressCardShell = () => `
  <section class="card chartcard" id="progressCard" style="display:flex;flex-direction:column;gap:14px">
    <div class="head-row" style="align-items:center">
      <h2>${esc(T.progressTitle)}</h2>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="zoominfo" id="zoomInfo"></span>
        <button type="button" class="btn icon" id="fsBtn" aria-label="${esc(T.fullScreen)}" title="${esc(T.fullScreen)} (F)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      </div>
    </div>
    <div class="keys">${T.keysHelp}</div>
    <div class="chartbox" id="runChart"></div>
    <div class="chartbox" id="resChart"></div>
    <div class="legend"><span><i style="background:var(--ow)"></i>${esc(T.overworld)}</span><span><i style="background:var(--ne)"></i>${esc(T.nether)}</span><span><i style="background:var(--en)"></i>${esc(T.theEnd)}</span></div>
  </section>`;

let chartKeys = null, fsResize = null;   // keyboard shortcuts and resize handler for the current run

// Everything the graph shows for one run: lines, icons, deaths, thunder, riptide, split colours and hover text.
// The Compare page uses this too, so a run looks the same there.
function progressParts(run, d) {
  // ---------- Lines ----------
  const adv = run.events.filter(e => e[4]).map((e, i) => [e[0], i + 1, e]);
  const top = d.multis.map(m => ({key: m.id, points: m.xs.map((e, k) => [e[0], k + 1, e]), color: MCOL[m.id], w: 1.75, until: m.done ?? run.finalIgt, soft: true, endLabel: () => MULTI[m.id]}));
  top.push({key: "adv", points: adv, color: MCOL.adv, w: 3, until: run.finalIgt, endLabel: () => T.lineAdvancements});
  const res = [];
  if (d.gold.length) res.push({key: "gold", points: d.gold.map(g => [g[0], Math.max(0, g[1])]), color: "var(--gold)", w: 2, until: run.finalIgt});
  if ((run.st.tntHeld || []).length) res.push({key: "tnt", points: run.st.tntHeld.map(g => [g[0], Math.max(0, g[1])]), color: "var(--bad)", w: 2, dash: "2 3", until: run.finalIgt});

  // ---------- Markers (icons) ----------
  const valueAt = pts => t => { const l = lastBefore(pts, t); return l ? l[1] : 0; };
  const advAt = valueAt(adv);
  const atAt = valueAt((d.multis.find(m => m.id === "adventure/adventuring_time") || {xs: []}).xs.map((e, k) => [e[0], k + 1]));
  const countBy = arr => t => (arr || []).filter(x => x <= t).length;
  const killsBy = countBy(run.st.ws), drownedBy = countBy(run.st.drowned);
  const onAdvLine = (times, icon, color, text) => times.map((t, k) => ({t, v: advAt(t), icon, color, text: text(k + 1, times.length, t)}));
  const markers = [
    ...onAdvLine(d.lanes.trident, "trident", "var(--s1)", (k, n, t) => T.tridentMarker(k, drownedBy(t))),
    ...onAdvLine(d.lanes.skull, "s_skulls", "var(--muted)", (k, n, t) => T.skullMarker(k, n, killsBy(t))),
    ...onAdvLine(d.lanes.nautilus, "g_nautilus", "var(--s4)", (k, n) => T.nautilusMarker(k, n)),
    ...(run.st.gapple != null ? onAdvLine([run.st.gapple], "s_gapple", "var(--gold)", () => T.godAppleMarker) : []),
    // rare biomes sit on the Adventuring Time line; faded (with "Missing …" on hover) if that visit left the group unfinished
    ...d.rare.flatMap(g => g.visits.map(v => ({t: v.t, v: atAt(v.t), icon: g.key, color: "var(--s1)", faded: !v.complete,
      text: g.name, sub: v.complete ? T.rareComplete : T.missing + " " + v.missing.map(critName).join(", ")}))),
    // each finished multi-criteria line ends on its icon
    ...d.multis.filter(m => m.done != null).map(m => ({t: m.done, v: m.tot, icon: MICON[m.id], color: MCOL[m.id], end: true, text: T.multiComplete(advName(m.id)), sub: T.multiLast(critName(m.last))})),
  ];
  const deaths = d.deaths.filter(x => !x.intentional).map((x, k, all) => ({...x, text: T.deathMarker(k + 1, all.length)}));
  const thunder = d.thunder != null ? [{t: d.thunder, text: T.thunderMarker}] : [];
  const riptide = d.riptide.map(r => ({...r, text: T.riptideMarker(r.uses, fmtShort(r.end - r.start))}));

  // ---------- Hover text ----------
  const bands = d.splits.flatMap((p, i) => p.segs.map(g => ({name: p.name, start: g[0], end: g[1], ci: i}))).sort((a, b) => a.start - b.start);
  const splitAt = t => bands.find(b => t >= b.start && t <= b.end);
  const rows = (list, t) => list
    .filter(x => { const m = MULTI[x.key] && d.multis.find(q => q.id === x.key); return !(m && m.done != null && t >= m.done); })   // hide finished multi-criteria
    .slice().reverse().map(x => {
      const l = lastBefore(x.points, t); let val = l ? l[1] : 0, lab = "";
      if (x.key === "adv") lab = l ? esc(advName(l[2][2])) : "";
      else if (MULTI[x.key]) { val += "/" + d.multis.find(m => m.id === x.key).tot; lab = l ? esc(critName(l[2][3])) : ""; }
      const name = x.key === "adv" ? T.hoverAdv : x.key === "gold" ? T.hoverGold : x.key === "tnt" ? T.hoverTnt : MULTI[x.key];
      return `<div class="trow"><span class="swatch" style="background:${x.color}"></span><span class="tname">${esc(name)}</span><b class="mono">${val}</b><span class="tlab">${lab}</span></div>`;
    }).join("");
  const riptideRow = t => { const r = riptide.find(x => t >= x.start && t <= x.end); return r ? `<div class="triptide">${ic("trident", 14)}${esc(T.hoverRiptide)}</div>` : ""; };
  const hoverText = t => { const ph = splitAt(t); return `<div class="thead"><span class="mono">${fmt(t, 0)}</span>${ph ? `<span>${esc(ph.name)}</span>` : ""}</div>` + riptideRow(t) + rows(top, t) + (res.length ? `<div class="tsep"></div>` + rows(res, t) : ""); };
  return {top, res, bands, deaths, thunder, riptide, markers, hoverText, strip: run.dims.length ? {segs: run.dims, end: run.finalIgt} : null};
}

// Draws both parts (advancements on top, gold/TNT and dimensions below) into two boxes.
// shared = zoom and size options for both; onHover(t) is told where the mouse is.
function mountProgress(pp, box, rbox, shared, Htop, Hres, onHover) {
  let cTop = null, cRes = null;
  cTop = mountChart(box, {...shared, series: pp.top, yKey: "adv", H: Htop, bands: pp.bands, deaths: pp.deaths, thunder: pp.thunder, riptide: pp.riptide, markers: pp.markers, noXAxis: true, clean: true, onHover: t => { if (cRes) cRes.showLine(t); if (onHover) onHover(t); }}, pp.hoverText);
  if (pp.res.length) cRes = mountChart(rbox, {...shared, series: pp.res, yKey: "res", H: Hres, ystepFix: Hres < 170 ? 100 : null, bands: pp.bands, bandLabels: false, padRFix: 120, strip: pp.strip, clean: true, onHover: t => { if (cTop) cTop.showLine(t); if (onHover) onHover(t); }}, pp.hoverText);
  else rbox.innerHTML = "";
  return {showLine(t) { if (cTop) cTop.showLine(t); if (cRes) cRes.showLine(t); }};
}

function drawProgress(run, d) {
  const pp = progressParts(run, d);

  // ---------- Zoom ----------
  const endT = run.finalIgt;
  if (state.zoomRun !== run) { state.zoom = null; state.zoomRun = run; }
  const card = $("#progressCard"), box = $("#runChart"), rbox = $("#resChart");
  const current = () => state.zoom || [0, endT];
  const setZoom = (a, b) => {
    const minSpan = 30000;
    if (b - a < minSpan) { const m = (a + b) / 2; a = m - minSpan / 2; b = m + minSpan / 2; }
    if (a < 0) { b -= a; a = 0; } if (b > endT) { a -= b - endT; b = endT; } a = Math.max(0, a);
    state.zoom = (a <= 0 && b >= endT) ? null : [a, b]; draw();
  };

  function draw() {
    const [za, zb] = current(), fs = card.classList.contains("fs");
    const W = fs ? Math.max(600, box.clientWidth) : 1280;
    const avail = fs ? Math.max(420, window.innerHeight - box.getBoundingClientRect().top - 60) : 0;
    const Htop = fs ? Math.round(avail * .7) : 440, Hres = fs ? Math.round(avail * .3) : 190;
    $("#zoomInfo").innerHTML = state.zoom ? `${esc(T.showing)} ${fmt(za, 0)}–${fmt(zb, 0)} <button type="button" class="linkbtn" id="zReset">${esc(T.reset)} <kbd>0</kbd></button>` : "";
    if (state.zoom) $("#zReset").addEventListener("click", () => { state.zoom = null; draw(); });
    const shared = {xmin: za, xmaxFix: zb, fitY: !!state.zoom, W, onBrush: setZoom,
      onWheel: (t, f) => { const [a, b] = current(); setZoom(t - (t - a) * f, t + (b - t) * f); }, wheelActive: () => card.classList.contains("fs")};
    mountProgress(pp, box, rbox, shared, Htop, Hres);
  }
  draw();

  // ---------- Full screen ----------
  const setFs = on => {
    card.classList.toggle("fs", on); document.body.classList.toggle("noscroll", on);
    $("#fsBtn").setAttribute("aria-label", on ? T.exitFullScreen : T.fullScreen);
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(draw);
  };
  const toggleFs = () => { const on = !card.classList.contains("fs"); if (on && card.requestFullscreen) card.requestFullscreen().catch(() => {}); setFs(on); };
  $("#fsBtn").addEventListener("click", toggleFs);
  card.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && card.classList.contains("fs")) setFs(false); });
  if (fsResize) window.removeEventListener("resize", fsResize);
  fsResize = () => { if (card.isConnected && card.classList.contains("fs")) draw(); };
  window.addEventListener("resize", fsResize);

  // ---------- Keyboard shortcuts ----------
  chartKeys = e => {
    const [a, b] = current(), span = b - a, m = (a + b) / 2, step = span * (e.shiftKey ? .8 : .25);
    if (e.key === "ArrowLeft") setZoom(a - step, b - step);
    else if (e.key === "ArrowRight") setZoom(a + step, b + step);
    else if (e.key === "+" || e.key === "=") setZoom(m - span / 4, m + span / 4);
    else if (e.key === "-" || e.key === "_") setZoom(m - span, m + span);
    else if (e.key === "0") { state.zoom = null; draw(); }
    else if (e.key === "f" || e.key === "F") toggleFs();
    else if (e.key === "[" || e.key === "]") { const list = byNumber(), i = list.indexOf(run), j = i + (e.key === "]" ? 1 : -1); if (j >= 0 && j < list.length) { state.runId = list[j].id; renderRunPage(); } }
    else if (e.key === "Escape" && card.classList.contains("fs")) setFs(false);
    else return false;
    return true;
  };
}

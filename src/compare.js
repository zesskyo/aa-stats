/*
 * compare.js — the Compare page: runs side by side.
 * Two runs: pick them from this site, or read a Hermes play.log right here in the browser (the file is never
 * uploaded anywhere). Runs read from files are remembered in this browser only, and can be saved as a
 * small .json file to send to someone (which can be read back in the same way).
 */
const CMP_COLORS = ["var(--s0)", "var(--s1)"];   // the two runs being compared
const CMP_STORE = "aa-compare-v1";

let UPLOADED = [];          // runs read from files: [{run, label}]
let cmpStatus = "";         // message under the upload button

// ---------- Remembered in this browser ----------
function cmpLoad() {
  try {
    const x = JSON.parse(localStorage.getItem(CMP_STORE) || "null"); if (!x) return;
    UPLOADED = (x.uploaded || []).map(u => ({label: String(u.label), run: decodeRun(u.run)}));
    state.cmp = (x.ids || []).filter(cmpFind);
  } catch {}
}
function cmpSave() {
  const ids = state.cmp || [];
  try { localStorage.setItem(CMP_STORE, JSON.stringify({ids, uploaded: UPLOADED.map(u => ({label: u.label, run: encodeRun(u.run)}))})); }
  catch { try { localStorage.setItem(CMP_STORE, JSON.stringify({ids})); } catch {} }   // too big to keep: remember the picks only
}

// ---------- Finding a run by id (this site's runs first, then uploaded ones) ----------
function cmpFind(id) {
  const r = findRun(id); if (r) return {run: r, label: runTitle(r), mine: true};
  const u = UPLOADED.find(x => x.run.id === id); return u ? {run: u.run, label: u.label, mine: false} : null;
}
// PB against the latest run (or the one before, if the PB is the latest)
const cmpDefault = () => { const pb = pbRun(), all = byNumber(), other = all.filter(r => r !== pb).pop(); return [pb || all[0], other].filter(Boolean).map(r => r.id); };

// ---------- Reading files ----------
async function cmpFiles(files, slot) {
  if (!files || !files.length) return;
  cmpStatus = T.cmpReading; renderCompare();
  await new Promise(res => setTimeout(res, 30));   // let "Reading…" show before the (slow) read
  const errors = [];
  for (const f of files) {
    try {
      const text = await f.text();
      let run, label = null;
      if (/\.json$/i.test(f.name)) {
        const x = JSON.parse(text); run = decodeRun(x.run || x); label = x.label || null;
        if (!run.events.length || run.finalIgt == null) throw new Error(T.cmpBadJson);
      } else run = parseLog(text, f.name);
      const mine = RUNS.find(r => r.start === run.start && r.finalIgt === run.finalIgt);
      let id;
      if (mine) id = mine.id;
      else {
        id = run.id = String(run.id || "").startsWith("up-") ? run.id : "up-" + runKey(run);
        if (!UPLOADED.some(u => u.run.id === id)) {
          let base = label || run.player || f.name, name = base, k = 2;
          while (UPLOADED.some(u => u.label === name) || RUNS.some(r => runTitle(r) === name)) name = base + " " + k++;
          UPLOADED.push({run, label: name});
        }
      }
      cmpSet(slot, id);
    } catch (e) { errors.push(f.name + ": " + (e && e.message || e)); }
  }
  cmpStatus = errors.join(" · ");
  cmpSave(); renderCompare();
}

// Puts a run in slot 0 or 1 (if it's already in the other slot, the two swap)
function cmpSet(slot, id) {
  const other = 1 - slot;
  if (state.cmp[other] === id) state.cmp[other] = state.cmp[slot];
  state.cmp[slot] = id;
  state.cmp = state.cmp.filter(Boolean);
}

// Saves an uploaded run as a small file that can be read back on the Compare page
function cmpDownload(c) {
  const blob = new Blob([JSON.stringify({label: c.label, run: encodeRun(c.run)})], {type: "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = c.label.replace(/[^A-Za-z0-9_-]+/g, "_") + ".aa-run.json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- The page ----------
const svgSave = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16"/></svg>`;
const svgFs = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;

function renderCompare() {
  const el = $("#view-compare");
  if (!state.cmp) state.cmp = cmpDefault();
  state.cmp = state.cmp.filter(cmpFind).slice(0, 2);
  const list = state.cmp.map(cmpFind).map((c, i) => ({...c, color: CMP_COLORS[i], d: derive(c.run)}));

  // One slot per run: pick a run, or upload one into it
  const options = sel => {
    const o = (id, label) => `<option value="${esc(id)}"${id === sel ? " selected" : ""}>${esc(label)}</option>`;
    const mine = byNumber().map(r => o(r.id, runTitle(r) + " · " + fmt(r.finalIgt, 0))).join("");
    const up = UPLOADED.map(u => o(u.run.id, u.label + " · " + fmt(u.run.finalIgt, 0))).join("");
    return (sel ? "" : `<option value="" selected>${esc(T.cmpAdd)}</option>`) + (mine ? `<optgroup label="${esc(T.cmpMine)}">${mine}</optgroup>` : "") + (up ? `<optgroup label="${esc(T.cmpUploadedRuns)}">${up}</optgroup>` : "");
  };
  const slot = k => {
    const c = list[k];
    return `<div class="cmp-slot" data-slot="${k}" style="--c:${CMP_COLORS[k]}">
      <span class="swatch" style="background:${CMP_COLORS[k]}"></span>
      <select class="field" data-pick="${k}" aria-label="${esc(T.cmpAdd)}">${options(c && c.run.id)}</select>
      ${c && !c.mine ? `<button type="button" class="btn icon ghost" data-save="${k}" aria-label="${esc(T.cmpSave)} ${esc(c.label)}" title="${esc(T.cmpSave)}">${svgSave}</button>` : ""}
      <button type="button" class="btn" data-upload="${k}">${esc(T.cmpUpload)}</button>
    </div>`;
  };

  el.innerHTML = `
    <section class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="cmp-slots">${slot(0)}${slot(1)}</div>
      <input type="file" id="cmpFile" accept=".log,.txt,.jsonl,.json" hidden>
      ${cmpStatus || UPLOADED.length ? `<div class="cmp-foot">${cmpStatus ? `<span class="cmp-status" role="status">${esc(cmpStatus)}</span>` : "<span></span>"}${UPLOADED.length ? `<button type="button" class="linkbtn" id="cmpForget">${esc(T.cmpForget)}</button>` : ""}</div>` : ""}
    </section>
    ${list.length ? `
    <section class="card tablewrap" style="padding:0">${cmpSplitsTable(list)}</section>
    <section class="card chartcard" id="cmpCard" style="display:flex;flex-direction:column;gap:14px">
      <div class="head-row" style="align-items:center">
        <h2>${esc(T.progressTitle)}</h2>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="zoominfo" id="cmpZoomInfo"></span>
          <button type="button" class="btn icon" id="cmpFsBtn" aria-label="${esc(T.fullScreen)}" title="${esc(T.fullScreen)} (F)">${svgFs}</button>
        </div>
      </div>
      <div class="keys">${T.cmpKeysHelp}</div>
      ${list.map((c, i) => `<div class="cmp-graph">
        <div class="cmp-graphhead"><span class="swatch" style="background:${c.color}"></span><b>${esc(c.label)}</b><span class="cat ${c.d.category.toLowerCase()}">${esc(c.d.category)}</span><span class="mono muted">${fmt(c.run.finalIgt, 0)}</span></div>
        <div class="chartbox" id="cmpTop${i}"></div><div class="chartbox" id="cmpRes${i}"></div>
      </div>`).join("")}
      <div class="legend"><span><i style="background:var(--ow)"></i>${esc(T.overworld)}</span><span><i style="background:var(--ne)"></i>${esc(T.nether)}</span><span><i style="background:var(--en)"></i>${esc(T.theEnd)}</span></div>
    </section>
    <section class="card tablewrap" style="padding:0">${cmpStatsTable(list)}</section>` : ""}`;

  // controls
  let uploadSlot = 1;
  el.querySelectorAll("[data-pick]").forEach(s => s.addEventListener("change", () => { if (s.value) { cmpSet(+s.dataset.pick, s.value); cmpSave(); renderCompare(); } }));
  el.querySelectorAll("[data-upload]").forEach(b => b.addEventListener("click", () => { uploadSlot = +b.dataset.upload; $("#cmpFile").click(); }));
  $("#cmpFile").addEventListener("change", e => cmpFiles([...e.target.files].slice(0, 1), uploadSlot));
  el.querySelectorAll("[data-save]").forEach(b => b.addEventListener("click", () => cmpDownload(list[+b.dataset.save])));
  if ($("#cmpForget")) $("#cmpForget").addEventListener("click", () => { const up = new Set(UPLOADED.map(u => u.run.id)); UPLOADED = []; state.cmp = state.cmp.filter(id => !up.has(id)); cmpStatus = ""; cmpSave(); renderCompare(); });
  el.querySelectorAll("[data-slot]").forEach(box => {   // drop a file on a slot to read it into that slot
    box.addEventListener("dragover", e => { e.preventDefault(); box.classList.add("over"); });
    box.addEventListener("dragleave", () => box.classList.remove("over"));
    box.addEventListener("drop", e => { e.preventDefault(); box.classList.remove("over"); cmpFiles([...e.dataTransfer.files].slice(0, 1), +box.dataset.slot); });
  });

  cmpKeys = null;
  if (list.length) drawCompare(list);
}

// ---------- Graphs: each run's own progress graph (same as its Stats page), one under the other ----------
// They share the time axis, zoom and hover line, so the same moment lines up. Full screen fits both on the screen.
let cmpKeys = null, cmpResize = null;
function drawCompare(list) {
  const endT = Math.max(...list.map(c => c.run.finalIgt));
  const parts = list.map(c => progressParts(c.run, c.d));
  const card = $("#cmpCard");
  if (state.cmpZoomKey !== state.cmp.join()) { state.cmpZoom = null; state.cmpZoomKey = state.cmp.join(); }
  const current = () => state.cmpZoom || [0, endT];
  const setZoom = (a, b) => {
    const minSpan = 30000;
    if (b - a < minSpan) { const m = (a + b) / 2; a = m - minSpan / 2; b = m + minSpan / 2; }
    if (a < 0) { b -= a; a = 0; } if (b > endT) { a -= b - endT; b = endT; } a = Math.max(0, a);
    state.cmpZoom = (a <= 0 && b >= endT) ? null : [a, b]; draw();
  };
  function draw() {
    const [za, zb] = current(), fs = card.classList.contains("fs");
    const first = $("#cmpTop0");
    const W = fs ? Math.max(600, first.clientWidth) : 1280;
    // full screen: split the space under the first graph between the runs (about 70% advancements, 30% gold/TNT)
    const avail = fs ? Math.max(360, window.innerHeight - first.getBoundingClientRect().top - 70 - (list.length - 1) * 50) / list.length : 0;
    const Hres = fs ? Math.round(Math.max(120, avail * .3)) : 140, Htop = fs ? Math.round(avail - Hres) : 330;
    $("#cmpZoomInfo").innerHTML = state.cmpZoom ? `${esc(T.showing)} ${fmt(za, 0)}–${fmt(zb, 0)} <button type="button" class="linkbtn" id="cmpReset">${esc(T.reset)} <kbd>0</kbd></button>` : "";
    if (state.cmpZoom) $("#cmpReset").addEventListener("click", () => { state.cmpZoom = null; draw(); });
    const shared = {xmin: za, xmaxFix: zb, fitY: !!state.cmpZoom, W, onBrush: setZoom,
      onWheel: (t, f) => { const [a, b] = current(); setZoom(t - (t - a) * f, t + (b - t) * f); }, wheelActive: () => card.classList.contains("fs")};
    const ctls = [];
    parts.forEach((pp, i) => { ctls[i] = mountProgress({...pp, hoverText: cmpHover(list, parts, i)}, $("#cmpTop" + i), $("#cmpRes" + i), shared, Htop, Hres, t => ctls.forEach((c, k) => { if (k !== i && c) c.showLine(t); })); });
  }
  draw();

  // Full screen
  const setFs = on => {
    card.classList.toggle("fs", on); document.body.classList.toggle("noscroll", on);
    $("#cmpFsBtn").setAttribute("aria-label", on ? T.exitFullScreen : T.fullScreen);
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(draw);
  };
  const toggleFs = () => { const on = !card.classList.contains("fs"); if (on && card.requestFullscreen) card.requestFullscreen().catch(() => {}); setFs(on); };
  $("#cmpFsBtn").addEventListener("click", toggleFs);
  card.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && card.classList.contains("fs")) setFs(false); });
  if (cmpResize) window.removeEventListener("resize", cmpResize);
  cmpResize = () => { if (card.isConnected && card.classList.contains("fs")) draw(); };
  window.addEventListener("resize", cmpResize);

  // Keyboard: same keys as the Stats page graph
  cmpKeys = e => {
    const [a, b] = current(), span = b - a, m = (a + b) / 2, step = span * (e.shiftKey ? .8 : .25);
    if (e.key === "ArrowLeft") setZoom(a - step, b - step);
    else if (e.key === "ArrowRight") setZoom(a + step, b + step);
    else if (e.key === "+" || e.key === "=") setZoom(m - span / 4, m + span / 4);
    else if (e.key === "-" || e.key === "_") setZoom(m - span, m + span);
    else if (e.key === "0") { state.cmpZoom = null; draw(); }
    else if (e.key === "f" || e.key === "F") toggleFs();
    else if (e.key === "Escape" && card.classList.contains("fs")) setFs(false);
    else return false;
    return true;
  };
}

// Hover text: every run at the same moment (advancements, each multi-criteria line, TNT and gold),
// with the run under the mouse in bold
function cmpHover(list, parts, me) {
  const val = (pp, key, t) => { const s = [...pp.top, ...pp.res].find(x => x.key === key); if (!s) return null; const l = lastBefore(s.points, t); return l ? l[1] : 0; };
  const orDash = v => v == null ? "—" : v;
  const rows = [
    {name: T.hoverAdv, color: MCOL.adv, v: (c, pp, t) => val(pp, "adv", t)},
    ...Object.keys(MULTI).map(id => ({name: MULTI[id], color: MCOL[id], v: (c, pp, t) => {
      const m = c.d.multis.find(q => q.id === id);
      if (!m) return "0/" + REQ[id];
      return m.done != null && t >= m.done ? "✓" : val(pp, id, t) + "/" + m.tot;
    }})),
    null,
    {name: T.hoverTnt, color: "var(--bad)", v: (c, pp, t) => orDash(val(pp, "tnt", t))},
    {name: T.hoverGold, color: "var(--gold)", v: (c, pp, t) => orDash(val(pp, "gold", t))},
  ];
  const splitAt = (c, t) => { if (t > c.run.finalIgt) return T.cmpFinished; const p = c.d.splits.find(q => q.segs.some(g => t >= g[0] && t <= g[1])); return p ? p.name : ""; };
  const cls = k => k === me ? ` class="me"` : "";
  return t => `<div class="thead"><span class="mono">${fmt(t, 0)}</span></div><table class="cmp-tip">
    <thead><tr><th></th>${list.map((c, k) => `<th${cls(k)}><span class="swatch" style="background:${c.color}"></span> ${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody><tr class="split"><td></td>${list.map((c, k) => `<td${cls(k)}>${esc(splitAt(c, t))}</td>`).join("")}</tr>
    ${rows.map(r => r ? `<tr><td><span class="swatch" style="background:${r.color}"></span> ${esc(r.name)}</td>${list.map((c, k) => `<td class="mono${k === me ? " me" : ""}">${r.v(c, parts[k], t)}</td>`).join("")}</tr>` : `<tr class="sep"><td colspan="${list.length + 1}"></td></tr>`).join("")}
    </tbody></table>`;
}

// ---------- Tables ----------
// Ahead / behind the other run, like LiveSplit: "+1:23" behind (red), "−0:45" ahead (green).
// Pale when this split lost time against the previous one while still ahead (or gained while still behind).
const cmpSigned = d => (d > 0 ? "+" : "−") + fmtShort(Math.abs(d));
const cmpDelta = (v, ref, prev) => {
  if (v == null || ref == null) return "";
  const d = v - ref; if (Math.abs(d) < 1000) return `<span class="delta">±0</span>`;
  const seg = prev != null ? d - prev : null, pale = seg != null && (d < 0 ? seg > 0 : seg < 0);
  return `<span class="delta ${d > 0 ? "pos" : "neg"}${pale ? " pale" : ""}"${seg != null ? ` title="${esc(T.cmpSegment)} ${Math.abs(seg) < 1000 ? "±0" : cmpSigned(seg)}"` : ""}>${cmpSigned(d)}</span>`;
};
const cmpHead = (list, first) => `<thead><tr><th scope="col">${esc(first)}</th>${list.map(c => `<th scope="col"><span class="swatch" style="background:${c.color};margin-right:8px"></span>${esc(c.label)} <span class="cat ${c.d.category.toLowerCase()}" style="margin-left:6px">${esc(c.d.category)}</span></th>`).join("")}</tr></thead>`;

// Splits: the time on the clock at each split (like LiveSplit; same splits and times as the Overview table),
// and how far ahead or behind the other run
function cmpSplitsTable(list) {
  const rowsDef = [
    ...SPLIT_CARDS.map(i => ({name: SPLITS[i].name, icon: SPLITS[i].icon, at: c => splitMark(c.d.splits[i], i)})),
    {name: T.timeLabel, total: true, at: c => c.run.finalIgt},
  ];
  const prev = list.map(() => null);   // last difference for each run, to tell if a split gained or lost time
  const rows = rowsDef.map(r => `<tr${r.total ? ` class="cmp-total"` : ""}><th scope="row"><span style="display:inline-flex;align-items:center;gap:8px">${r.icon ? ic(r.icon) : ""}${esc(r.name)}</span></th>${list.map((c, k) => {
    const v = r.at(c), ref = list.length > 1 ? r.at(list[1 - k]) : null;
    const cell = `<span class="mono">${v != null ? fmt(v, 0) : "—"}</span>${cmpDelta(v, ref, r.total ? null : prev[k])}`;
    if (v != null && ref != null && !r.total) prev[k] = v - ref;
    return `<td>${cell}</td>`;
  }).join("")}</tr>`).join("");
  return `<table class="cmp-table">${cmpHead(list, T.splitsTitle)}<tbody>${rows}</tbody></table>`;
}

function cmpStatsTable(list) {
  const cellOf = (f, format, delta) => (c, k) => { const v = f(c); return `<span class="mono">${v != null ? format(v) : "—"}</span>${delta && list.length > 1 ? cmpDelta(v, f(list[1 - k])) : ""}`; };
  const multiDone = id => c => { const m = c.d.multis.find(q => q.id === id); return m ? m.done : null; };
  const rows = [
    {icon: "s_skulls", name: T.cmpSkullsTime, cell: cellOf(c => c.d.skullSplit ? c.d.skullSplit.dur : null, fmtShort, true)},
    {icon: "debris", name: T.cmpDebrisTime, cell: cellOf(c => c.d.debrisSplit.start != null ? c.d.debrisSplit.dur : null, fmtShort, true)},
    {icon: MICON["husbandry/complete_catalogue"], name: advName("husbandry/complete_catalogue"), cell: cellOf(multiDone("husbandry/complete_catalogue"), t => fmt(t, 0), true)},
    {icon: MICON["adventure/adventuring_time"], name: advName("adventure/adventuring_time"), cell: cellOf(multiDone("adventure/adventuring_time"), t => fmt(t, 0), true)},
    {icon: STAT_DEFS.creepers.icon, name: STAT_DEFS.creepers.name(), cell: cellOf(c => c.run.tot.creepers, num)},
    {icon: STAT_DEFS.shulkers.icon, name: STAT_DEFS.shulkers.name(), cell: cellOf(c => c.run.tot.shulkerOpen, num)},
  ];
  return `<table class="cmp-table">${cmpHead(list, T.runStatsTitle)}<tbody>${rows.map(r => `<tr><th scope="row"><span style="display:inline-flex;align-items:center;gap:8px">${r.icon ? ic(r.icon) : ""}${esc(r.name)}</span></th>${list.map((c, k) => `<td>${r.cell(c, k)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

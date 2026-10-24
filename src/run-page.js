/*
 * run-page.js — the Stats page for one run.
 * Order on the page: run switcher, title, splits, progress graph, travel map (if there's a ghost file), run stats,
 * Debris / Skulls / Rare biomes, notes.
 */
function renderRunPage() {
  const el = $("#view-run");
  const run = findRun(state.runId) || pbRun() || byNumber()[0];
  if (!run) { el.innerHTML = `<div class="card empty">${esc(T.noRunsYet)}</div>`; return; }
  state.runId = run.id; syncUrl();
  const d = derive(run), meta = run.meta || {};

  if (run.manual) return renderManualRun(el, run, d);
  el.innerHTML = `
    ${isWr(run) || isViewed(run) ? "" : `<div class="pagerwrap">${pager(run)}</div>`}
    ${runHeader(run, d)}
    ${d.category === "Invalid" ? `<div class="card" style="border-color:var(--bad)"><b>${esc(T.invalidRun)}</b> <span class="muted">${esc(missingText(d, 99))}. ${esc(T.invalidRunNote)}</span></div>` : ""}
    ${splitsCard(d)}
    ${progressCardShell()}
    ${meta.path ? travelCardShell() : ""}
    <section class="card"><h2 style="margin-bottom:14px">${esc(T.runStatsTitle)}</h2>${runStatCards(run)}</section>
    ${statsScreenShell(run)}
    <div class="grid3">
      ${miniCard(T.debrisTitle, d.debrisSplit.start != null ? d.debrisSplit.dur : null, d.debrisSplit.start != null ? "debrisChart" : null, T.noDebris)}
      ${miniCard(T.skullsTitle, d.skullSplit ? d.skullSplit.dur : null, d.skullSplit ? "skullChart" : null, T.noSkulls)}
      ${rareCard(d.rare)}
    </div>
    ${shotCard(run)}
    ${meta.notes ? `<div class="card notes"><div style="flex:1;min-width:0"><span class="label">${esc(T.notesTitle)}</span><p style="margin:6px 0 0;white-space:pre-wrap">${esc(meta.notes)}</p></div></div>` : ""}
    ${isWr(run) ? wrHistoryCard(run) : ""}`;

  drawProgress(run, d);
  if (meta.path) drawTravel(run, d); else if (meta.inv) invOnGraph(run);
  drawDebris(run, d);
  drawSkulls(run, d);
  drawStatsScreen(run);
  bindSubPanel(run, d);
  bindPager(el);
  el.querySelectorAll(".wrhist [data-open]").forEach(b => b.addEventListener("click", () => go("run", b.dataset.open)));
  mountRunBar(run, d);
}

// ---------- A run with no log: title, splits (if any), screenshot, notes ----------
function renderManualRun(el, run, d) {
  const meta = run.meta || {};
  const anySplit = SPLIT_CARDS.some(i => splitMark(d.splits[i], i) != null);
  el.innerHTML = `
    <div class="pagerwrap">${pager(run)}</div>
    ${runHeader(run, d)}
    ${anySplit ? splitsCard(d) : ""}
    ${shotCard(run)}
    ${meta.notes ? `<div class="card notes"><div style="flex:1;min-width:0"><span class="label">${esc(T.notesTitle)}</span><p style="margin:6px 0 0;white-space:pre-wrap">${esc(meta.notes)}</p></div></div>` : ""}
    <div class="card"><b>${esc(T.noLogTitle)}</b> <span class="muted">${esc(T.noLogNote)}</span></div>`;
  bindPager(el);
  mountRunBar(run, d);
}

// ---------- A world record's page: every record so far (each opens its own page, with all its stats) ----------
function wrHistoryCard(run) {
  if (WR_HISTORY.length < 2) return "";
  const [cTime, cRunner, cDate] = T.wrHistoryCols;
  const rows = WR_HISTORY.map(h => {
    const here = h.id === run.id, who = esc(h.meta.runner || T.wrWord);
    return `<tr${here ? ' class="here"' : ""}><td class="mono">${fmt(h.finalIgt, 0)}${h === WR ? `<span class="badge">${esc(T.wrCurrent)}</span>` : ""}</td>
      <td>${here ? `<b>${who}</b>` : `<button type="button" class="linkbtn" style="padding:0" data-open="${esc(h.id)}">${who}</button>`} ${videoLink(h)}</td>
      <td class="muted">${h.meta.date ? esc(fmtDay(h.meta.date + "T12:00:00")) : "—"}</td></tr>`;
  }).join("");
  return `<section class="card wrhist" style="padding:0"><div class="tablebar"><h2>${esc(T.wrHistoryTitle)}</h2></div>
    <div class="tablewrap"><table><thead><tr><th scope="col">${esc(cTime)}</th><th scope="col">${esc(cRunner)}</th><th scope="col">${esc(cDate)}</th></tr></thead>
    <tbody>${rows}</tbody></table></div></section>`;
}

// ---------- Screenshot of the run (proof), if there is one ----------
// (a link to a page rather than an image file, e.g. an Imgur page, is shown as a button to open it)
const shotCard = run => {
  const u = shotUrl(run); if (!u) return "";
  const isImage = !okUrl(run.meta.screenshot) || /\.(png|jpe?g|webp|gif)([?#].*)?$/i.test(u);
  return `<section class="card" style="display:flex;flex-direction:column;gap:12px">
    <h2>${esc(T.screenshot)}</h2>
    ${isImage ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="shot"><img src="${esc(u)}" alt="${esc(T.screenshot + " · " + runTitle(run))}" loading="lazy"></a>`
      : `<a class="btn" style="align-self:flex-start" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(T.openScreenshot)}</a>`}
  </section>`;
};

// ---------- Title area: "Run 11", video button, Thunderless/Thunderful, date, seed, time ----------
function runHeader(run, d) {
  const meta = run.meta || {};
  return `
    <div class="head-row">
      <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><h1 id="runH1">${esc(runTitle(run))}</h1>${videoLink(run, true)}${shotLink(run, true)}${editButton(run)}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${catPill(d)}
          ${runDay(run) !== "—" ? `<span class="muted">${esc(runDay(run))}</span>` : ""}
          ${meta.seed ? `<span class="muted">· ${esc(T.seedLabel)} <span class="mono">${esc(meta.seed)}</span></span>` : ""}
        </div>
      </div>
      <div class="times">
        <div><span class="label">${esc(T.timeLabel)}</span><span class="mono" style="font-size:34px;font-weight:600;color:var(--accent)">${runTime(run)}</span></div>
      </div>
    </div>`;
}

// ---------- Splits: coloured bar (hover for durations) and the time cards ----------
function splitsCard(d) {
  const total = d.splits.reduce((a, p) => a + (p.dur || 0), 0) || 1;
  const pieces = d.splits.flatMap((p, i) => p.segs.map(g => ({p, i, g}))).sort((a, b) => a.g[0] - b.g[0]);
  const bar = pieces.map(({p, i, g}) => {
    const w = (g[1] - g[0]) / total;
    const pick = hasSubs(d, i) ? ` role="button" tabindex="0" data-si="${i}"` : "";
    return w > 0 ? `<div class="tipped${pick ? " pick" : ""}"${pick} style="flex:${w};background:${SCOL[i]}" data-tip="${esc(p.name)} · ${fmtShort(p.dur)}">${ic(p.icon)}${w > .1 ? `<span>${esc(p.name)}</span>` : ""}</div>` : "";
  }).join("");
  const cards = SPLIT_CARDS.filter(i => i !== 6 || splitMark(d.splits[6], 6) != null).map(i => {
    const p = d.splits[i], v = splitMark(p, i);
    return `<div class="splitcard${hasSubs(d, i) ? " pick" : ""}"${hasSubs(d, i) ? ` role="button" tabindex="0" data-si="${i}"` : ""}><div style="display:flex;align-items:center;gap:8px">${ic(p.icon)}<span class="label">${esc(p.name)}</span></div><span class="t">${v != null ? fmt(v, 0) : "—"}</span></div>`;
  }).join("");
  return `<section class="card" style="display:flex;flex-direction:column;gap:14px">
      <h2>${esc(T.splitsTitle)}</h2>
      ${bar ? `<div class="splitbar" role="img" aria-label="${esc(T.splitsTitle)}">${bar}</div>` : ""}
      <div class="grid-splits">${cards}</div>
      <div id="subPanel"></div>
    </section>`;
}

// ---------- Sub-splits: a split's steps, opened by clicking it in the bar or its card (see splits.js) ----------
// Each step: its icon and name, a bar for how long it took (out of the split), the time, against the average of the
// runs on the site, and when it was done. Midgame: the checklist, by where it's done.
let subOpen = null, subRun = null;   // the split whose sub-splits are open (its number in SPLITS), or null
const hasSubs = (d, i) => i === 3 ? !!d.splits[3].mid : !!(d.splits[i].subs && d.splits[i].subs.length);
function subPanel(d, i) {
  if (i == null || !hasSubs(d, i)) return `<p class="muted subhint">${esc(T.subHint)}</p>`;
  const p = d.splits[i], defs = subDefs(i), refs = subRefs(i, defs);
  const row = (icon, name, about, v, took, ref, at) => `<div class="subrow"><span class="subic">${ic(icon, 20)}</span>
    <span class="subname">${esc(name)}${about ? `<small>${about}</small>` : ""}</span>${v == null && !/^[\d:—]+$/.test(took) ? `<span class="mono wide">${took}</span>` : `<span class="mono">${took}</span><span class="mono">${vsAvg(v, ref)}</span>`}<span class="mono muted">${at}</span></div>`;
  const head = `<div class="subrow subcols"><span></span><span></span><span>${esc(T.subTook)}</span><span>${esc(T.subVsAvg)}</span><span>${esc(T.subDoneAt)}</span></div>`;
  let body;
  if (i === 3) {
    // (only the checklist's splits: what isn't timed isn't here)
    // (an old log, with no biomes in it: the biomes and where Midgame went can't be told, so they're left out)
    const secs = new Map(p.mid.sections.map(x => [x.key, x])), noBiomes = p.mid.sections.some(x => x.why === "nodata");
    body = (noBiomes ? `<p class="muted subhint" style="margin-top:10px">${esc(T.midNoBiomes)}</p>` : "") + MID_GROUPS.map(([g, keys]) => {
      const xs = keys.map(k => secs.get(k)).filter(x => x && x.split && x.why !== "nodata");
      if (!xs.length) return "";
      return `<div class="subgrp">${esc(g)}</div>` + xs.map(x => {
        const timed = x.complete, status = timed ? fmtShort(x.dur)
          : x.why ? `<span class="muted">${esc(T.whyNoSplit[x.why])}</span>` : `<span class="muted">—</span>`;
        // (not finished: what's missing, under its name)
        const miss = !timed && !x.why && x.left.length ? `<span class="bad">${esc(T.missingLabel)} ${esc(x.left.join(", "))}</span>` : "";
        return row(itemIcon(x.item), x.name, miss, timed ? x.dur : null, status, refs[x.key], x.done != null ? fmt(x.done, 0) : "");
      }).join("");
    }).join("") + (noBiomes ? "" : midTimeline(d, subRun));
  } else body = subZoom(p, i) + p.subs.map((x, j) => row(itemIcon(x.item), x.name, "", x.dur, x.dur != null ? fmtShort(x.dur) : "—", refs[j], x.t != null ? fmt(x.t, 0) : "—")).join("");
  return `<div class="subpanel" style="--sc:${SCOL[i]}">
    <div class="subphead">${ic(p.icon, 22)}<b>${esc(p.name)}</b><span class="mono">${p.dur != null ? fmtShort(p.dur) : "—"}</span>${vsAvg(p.dur, refs.split)}
      <button type="button" class="linkbtn" data-allruns="${i}">${esc(T.subAllRuns)}</button></div>
    ${head}${body}</div>`;
}

// Midgame's route: a lane for each kind of place visited during it, when they were there, and the checklist's splits
// marked where they ended
function midTimeline(d, run) {
  const p = d.splits[3], a = p.start, b = p.end, areas = (run && run.st || {}).areas || [];
  if (a == null || b == null || b <= a || !areas.length) return "";
  const X = t => (Math.max(a, Math.min(b, t)) - a) / (b - a) * 100;
  const lanes = new Map();
  areas.forEach(([t, v], k) => {
    const to = k + 1 < areas.length ? areas[k + 1][0] : b;
    if (v === "plains") v = "other";
    if (NETHER.includes(v)) v = "nether";
    if (to <= a || t >= b || !AREA_LANES[v]) return;
    const segs = lanes.get(v) || lanes.set(v, []).get(v), last = segs[segs.length - 1], x = Math.max(a, t), y = Math.min(b, to);
    if (last && x - last[1] < 10000) last[1] = y; else segs.push([x, y]);
  });
  for (const [k, segs] of lanes) { const keep = segs.filter(([x, y]) => y - x >= 3000); if (keep.length) lanes.set(k, keep); else lanes.delete(k); }
  if (!lanes.size) return "";
  const order = Object.keys(AREA_LANES).filter(k => lanes.has(k));
  const marks = p.mid.sections.filter(x => x.split && x.complete && x.end != null && x.end >= a && x.end <= b)
    .map(x => `<span class="tlmark tipped" style="left:${X(x.end)}%" data-tip="${esc(x.name)} · ${fmt(x.end, 0)}">${ic(itemIcon(x.item), 16)}</span>`).join("");
  const step = (b - a) > 2 * 3600000 ? 1800000 : (b - a) > 3600000 ? 900000 : 600000;
  const ticks = []; for (let t = Math.ceil(a / step) * step; t < b; t += step) ticks.push(`<span class="tltick" style="left:${X(t)}%">${fmt(t, 0)}</span>`);
  return `<div class="subgrp">${esc(T.midRoute)}</div>
    <div class="tl">
      <div class="tlrow"><span></span><div class="tltrack tlmarks">${marks}</div></div>
      ${order.map(k => { const [name, item, col] = AREA_LANES[k];
        return `<div class="tlrow"><span class="tllabel">${ic(itemIcon(item), 16)}${esc(name)}</span><div class="tltrack">${lanes.get(k).map(([x, y]) =>
          `<span class="tlseg tipped" style="left:${X(x)}%;width:${Math.max(.25, X(y) - X(x))}%;background:${col}" data-tip="${esc(name)} · ${fmt(x, 0)}–${fmt(y, 0)}"></span>`).join("")}</div></div>`; }).join("")}
      <div class="tlrow"><span></span><div class="tltrack tlaxis">${ticks.join("")}</div></div>
    </div>`;
}

// The open split, full width, cut where its sub-splits ended (in the order they were done)
function subZoom(p, i) {
  if (p.start == null || !p.dur) return "";
  const xs = p.subs.filter(x => x.t != null && x.dur != null).sort((a, b) => a.t - b.t);
  if (!xs.length) return "";
  return `<div class="subzoom">${xs.map((x, k) => { const w = x.dur / p.dur * 100;
    return `<div class="tipped" style="flex:${x.dur};background:${SCOL[i]};opacity:${k % 2 ? .78 : 1}" data-tip="${esc(x.name)} · ${fmtShort(x.dur)}">${ic(itemIcon(x.item), 16)}${w > 11 ? `<span>${esc(x.name)}</span>` : ""}</div>`; }).join("")}</div>`;
}

function bindSubPanel(run, d) {
  subRun = run;
  const box = $("#subPanel"); if (!box) return;
  const show = () => {
    box.innerHTML = subPanel(d, subOpen);
    document.querySelectorAll("[data-si]").forEach(b => b.classList.toggle("on", +b.dataset.si === subOpen));
    box.querySelectorAll("[data-allruns]").forEach(b => b.addEventListener("click", () => { state.split = +b.dataset.allruns; go("split"); }));
  };
  document.querySelectorAll("[data-si]").forEach(b => {
    const pick = () => { const k = +b.dataset.si; subOpen = subOpen === k ? null : k; show(); };
    b.addEventListener("click", pick);
    b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
  show();
}
// (a sub-split's or checklist item's icon: an item, "item:<name>"; or one of the site's own, like "mh:zoglin")
const itemIcon = it => !it ? "" : /^(at|mh|2x2):/.test(it) ? it : "item:" + it;

// ---------- Small cards: Debris / Skulls graphs and Rare biomes ----------
const miniCard = (title, dur, id, empty) => `<section class="card" style="display:flex;flex-direction:column;gap:10px">
    <div class="head-row" style="align-items:baseline"><h2>${esc(title)}</h2>${dur != null ? `<span class="mono muted">${fmtShort(dur)}</span>` : ""}</div>
    ${id ? `<div class="chartbox" id="${id}"></div>` : `<p class="muted" style="margin:0">${esc(empty)}</p>`}
  </section>`;

// Rare biome groups, in the order they were completed
const rareCard = rare => `<section class="card" style="display:flex;flex-direction:column;gap:10px"><h2>${esc(T.rareBiomesTitle)}</h2>
  <div class="rare">${rare.slice().sort((a, b) => (a.done ?? a.first ?? Infinity) - (b.done ?? b.first ?? Infinity)).map(g => `
    <div class="rarerow">
      <span class="rareic">${ic(g.key) || `<span class="swatch" style="background:var(--s1)"></span>`}</span>
      <span class="rarename">${esc(g.name)}${g.done == null && g.visits.length ? `<span class="note bad">${esc(T.missing)} ${g.missing.map(m => esc(critName(m))).join(", ")}</span>` : ""}</span>
      <span class="mono">${g.done != null ? fmt(g.done, 0) : g.visits.length ? esc(T.incomplete) : "—"}</span>
    </div>`).join("")}</div></section>`;

function drawDebris(run, d) {
  const dp = d.debrisSplit, box = $("#debrisChart");
  if (dp.start == null || !box) return;
  // like the skull graph, the time between debris trips is squeezed out: x is time spent on debris
  const segs = dp.segs, active = t => { let acc = 0; for (const [a, b] of segs) { if (t <= b) return acc + Math.max(0, t - a); acc += b - a; } return acc; };
  const realTime = a => { let acc = 0; for (const [s0, e0] of segs) { if (a <= acc + (e0 - s0)) return s0 + (a - acc); acc += e0 - s0; } return dp.end; };
  const inSplit = t => segs.some(g => t >= g[0] && t <= g[1]);
  const debrisT = (run.st.debris || []).filter(inSplit), debris = debrisT.map((t, i) => [active(t), i + 1]);
  const tntT = (run.st.tnt || []).filter(inSplit), tnt = tntT.map(active);
  // netherrack mined during the split (not between trips)
  let rackN = 0, prev = null; const rack = [];
  for (const p of run.st.rack || []) { if (prev != null && inSplit(p[0])) { rackN += p[1] - prev; rack.push([active(p[0]), rackN]); } prev = p[1]; }
  const series = [{points: debris, color: "var(--s3)", label: T.labelDebris + " " + debris.length}];
  if (rack.length) series.push({points: rack, color: "var(--muted)", axis: "r", w: 1.5, label: T.labelNetherrack + " " + num(rack[rack.length - 1][1])});
  let acc = 0; const vlines = [];
  segs.forEach((g, i) => { if (i) vlines.push({t: acc, label: fmtShort(g[0] - segs[i - 1][1])}); acc += g[1] - g[0]; });
  mountChart(box, {series, W: 480, H: 260, xmin: 0, xmaxFix: Math.max(1000, dp.dur), ystepFix: 5, rug: tnt, rugLabel: T.labelTnt + " " + tnt.length, noY: true, noXAxis: true, clean: true, vlines}, t => {
    const l = lastBefore(debris, t), rl = lastBefore(rack, t);
    return `<div class="thead"><span class="mono">${fmt(realTime(t), 0)}</span><span class="mono">${fmtShort(t)}</span></div><div>${T.debrisHover(l ? l[1] : 0, tnt.filter(x => x <= t).length, rack.length ? (rl ? rl[1] : 0) : null)}</div>`;
  });
}

// The skull graph squeezes out paused time, so its x-axis is "time spent farming", not IGT
function drawSkulls(run, d) {
  const sp = d.skullSplit, box = $("#skullChart");
  if (!sp || !box) return;
  const active = t => { let acc = 0; for (const [a, b] of sp.segs) { if (t <= b) return acc + Math.max(0, t - a); acc += b - a; } return acc; };
  const realTime = a => { let acc = 0; for (const [s0, e0] of sp.segs) { if (a <= acc + (e0 - s0)) return s0 + (a - acc); acc += e0 - s0; } return sp.end; };
  const kills = (run.st.ws || []).filter(t => t >= sp.start && t <= sp.end);
  const killPts = kills.map((t, i) => [active(t), i + 1, t]);
  const skulls = d.lanes.skull.filter(t => t <= sp.end).slice(0, 3);
  const killsAt = t => kills.filter(x => x <= t).length;
  const markers = skulls.map((t, i) => ({t: active(t), realT: t, v: killsAt(t), icon: "s_skulls", color: "var(--s0)", text: T.skullOnChart(i + 1, killsAt(t))}));
  // where it paused (squeezed out): a dashed line, with how long for the longer ones
  let acc = 0, lastLabel = -Infinity;
  const vlines = [];
  sp.segs.forEach((g, i) => {
    if (i) { const gap = g[0] - sp.segs[i - 1][1], far = acc - lastLabel > sp.dur * .18 && gap >= 120000; vlines.push({t: acc, label: far ? fmtShort(gap) : ""}); if (far) lastLabel = acc; }
    acc += g[1] - g[0];
  });
  // a little room either side, so the first and last skulls aren't cut off and can be hovered
  const edge = Math.max(1000, sp.dur * .04);
  mountChart(box, {series: [{points: killPts, color: "var(--muted)", w: 2, endLabel: v => T.labelWitherSkeletons + " " + v}], W: 480, H: 260, xmin: -edge, xmaxFix: Math.max(1000, sp.dur) + edge, noY: true, noXAxis: true, clean: true, markers, vlines},
    t => { t = Math.max(0, Math.min(sp.dur, t)); const l = lastBefore(killPts, t); return `<div class="thead"><span class="mono">${fmt(realTime(t), 0)}</span><span class="mono">${fmtShort(t)}</span></div><div>${T.skullsHover(l ? l[1] : 0, skulls.filter(x => active(x) <= t).length)}</div>`; });
}

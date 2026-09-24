/*
 * run-page.js — the Stats page for one run.
 * Order on the page: run switcher, title, splits, progress graph, run stats, Debris / Skulls / Rare biomes, notes.
 */
function renderRunPage() {
  const el = $("#view-run");
  const run = findRun(state.runId) || pbRun() || byNumber()[0];
  if (!run) { el.innerHTML = `<div class="card empty">${esc(T.noRunsYet)}</div>`; return; }
  state.runId = run.id;
  const d = derive(run), meta = run.meta || {};

  if (run.manual) return renderManualRun(el, run, d);
  el.innerHTML = `
    <div class="pagerwrap">${pager(run)}</div>
    ${runHeader(run, d)}
    ${d.category === "Invalid" ? `<div class="card" style="border-color:var(--bad)"><b>${esc(T.invalidRun)}</b> <span class="muted">${esc(T.invalidRunMissing)} ${d.missing.map(id => esc(advName(id))).join(", ")}. ${esc(T.invalidRunNote)}</span></div>` : ""}
    ${splitsCard(d)}
    ${progressCardShell()}
    <section class="card"><h2 style="margin-bottom:14px">${esc(T.runStatsTitle)}</h2>${runStatCards(run)}</section>
    <div class="grid3">
      ${miniCard(T.debrisTitle, d.debrisSplit.start != null ? d.debrisSplit.dur : null, d.debrisSplit.start != null ? "debrisChart" : null, T.noDebris)}
      ${miniCard(T.skullsTitle, d.skullSplit ? d.skullSplit.dur : null, d.skullSplit ? "skullChart" : null, T.noSkulls)}
      ${rareCard(d.rare)}
    </div>
    ${shotCard(run)}
    ${meta.notes ? `<div class="card notes"><div style="flex:1;min-width:0"><span class="label">${esc(T.notesTitle)}</span><p style="margin:6px 0 0;white-space:pre-wrap">${esc(meta.notes)}</p></div></div>` : ""}`;

  drawProgress(run, d);
  drawDebris(run, d);
  drawSkulls(run, d);
  bindPager(el);
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

// ---------- Screenshot of the run (proof), if there is one ----------
const shotCard = run => shotUrl(run) ? `<section class="card" style="display:flex;flex-direction:column;gap:12px">
    <h2>${esc(T.screenshot)}</h2>
    <a href="${esc(shotUrl(run))}" target="_blank" rel="noopener noreferrer" class="shot"><img src="${esc(shotUrl(run))}" alt="${esc(T.screenshot + " · " + runTitle(run))}" loading="lazy"></a>
  </section>` : "";

// ---------- Title area: "Run 11", video button, Thunderless/Thunderful, date, seed, time ----------
function runHeader(run, d) {
  const meta = run.meta || {};
  return `
    <div class="head-row">
      <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><h1 id="runH1">${esc(runTitle(run))}</h1>${videoLink(run, true)}${shotLink(run, true)}</div>
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
    return w > 0 ? `<div class="tipped" style="flex:${w};background:${SCOL[i]}" data-tip="${esc(p.name)} · ${fmtShort(p.dur)}">${ic(p.icon)}${w > .1 ? `<span>${esc(p.name)}</span>` : ""}</div>` : "";
  }).join("");
  const cards = SPLIT_CARDS.filter(i => i !== 6 || splitMark(d.splits[6], 6) != null).map(i => {
    const p = d.splits[i], v = splitMark(p, i);
    return `<div class="splitcard"><div style="display:flex;align-items:center;gap:8px">${ic(p.icon)}<span class="label">${esc(p.name)}</span></div><span class="t">${v != null ? fmt(v, 0) : "—"}</span></div>`;
  }).join("");
  return `<section class="card" style="display:flex;flex-direction:column;gap:14px">
      <h2>${esc(T.splitsTitle)}</h2>
      ${bar ? `<div class="splitbar" role="img" aria-label="${esc(T.splitsTitle)}">${bar}</div>` : ""}
      <div class="grid-splits">${cards}</div>
    </section>`;
}

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
  const inSplit = t => t >= dp.start && t <= dp.end;
  const debris = (run.st.debris || []).filter(inSplit).map((t, i) => [t, i + 1]);
  const tnt = (run.st.tnt || []).filter(inSplit);
  const rack0 = (lastBefore(run.st.rack || [], dp.start) || [0, 0])[1];
  const rack = (run.st.rack || []).filter(p => inSplit(p[0])).map(p => [p[0], p[1] - rack0]);
  const series = [{points: debris, color: "var(--s3)", label: T.labelDebris + " " + debris.length}];
  if (rack.length) series.push({points: rack, color: "var(--muted)", axis: "r", w: 1.5, label: T.labelNetherrack + " " + num(rack[rack.length - 1][1])});
  mountChart(box, {series, W: 480, H: 260, xmin: dp.start, xmaxFix: dp.end, ystepFix: 5, rug: tnt, rugLabel: T.labelTnt + " " + tnt.length, noY: true, noXAxis: true, clean: true}, t => {
    const l = lastBefore(debris, t), rl = lastBefore(rack, t);
    return `<div class="thead"><span class="mono">${fmt(t, 0)}</span><span class="mono">${fmtShort(t - dp.start)}</span></div><div>${T.debrisHover(l ? l[1] : 0, tnt.filter(x => x <= t).length, rack.length ? (rl ? rl[1] : 0) : null)}</div>`;
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
  mountChart(box, {series: [{points: killPts, color: "var(--muted)", w: 2, endLabel: v => T.labelWitherSkeletons + " " + v}], W: 480, H: 260, xmin: 0, xmaxFix: Math.max(1000, sp.dur), noY: true, noXAxis: true, clean: true, markers},
    t => { const l = lastBefore(killPts, t); return `<div class="thead"><span class="mono">${fmt(realTime(t), 0)}</span><span class="mono">${fmtShort(t)}</span></div><div>${T.skullsHover(l ? l[1] : 0, skulls.filter(x => active(x) <= t).length)}</div>`; });
}

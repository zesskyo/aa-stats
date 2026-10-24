/*
 * split-page.js — one split, every run: how long it took in each run and when it ended, and its sub-splits (for Midgame,
 * the checklist's splits), with the average and the best, and a graph of it over the runs. Opened from a split's "avg"
 * on the Overview, or from a run's sub-splits.
 */

// A split's steps, the same for every run: [{key, name, icon, about, f: the split in a run → the step's time, or null}]
// (its sub-splits; for Midgame, the checklist's timed splits)
function subDefs(i) {
  if (i === 3) return MIDGAME.filter(m => m.start).map(m => ({key: m.key, name: m.name, icon: itemIcon(m.item), about: m.about || "",
    f: p => { const x = p.mid && p.mid.sections.find(y => y.key === m.key); return x && x.complete ? x.dur : null; }}));
  const ref = validRuns().map(r => derive(r).splits[i]).find(p => p.subs);
  return ref ? ref.subs.map((x, j) => ({key: j, name: i === 0 && (j === 1 || j === 2) ? T.nthStructure[j - 1] : x.name, icon: itemIcon(x.item), about: "",
    f: p => p.subs && p.subs[j] ? p.subs[j].dur : null})) : [];
}
// The average and the best of each step (and of the split itself, key "split"), over the runs on the site
function subRefs(i, defs = subDefs(i)) {
  const ds = validRuns().filter(r => !r.manual).map(r => derive(r).splits[i]), out = {};
  for (const c of [{key: "split", f: p => p.dur}, ...defs]) {
    const xs = ds.map(c.f).filter(x => x != null);
    out[c.key] = {avg: average(xs), best: xs.length ? Math.min(...xs) : null, n: xs.length};
  }
  return out;
}
// "+1:02" / "−0:15" against the average (with a class: faster or slower), and gold for the best
const vsAvg = (v, ref) => v == null || !ref || ref.avg == null ? `<span class="muted">—</span>`
  : `<span class="${ref.best != null && v <= ref.best ? "gold" : v <= ref.avg ? "good" : "bad"}">${v <= ref.avg ? "−" : "+"}${fmtShort(Math.abs(v - ref.avg))}</span>`;

function renderSplitPage() {
  const el = $("#view-split"), i = Math.max(0, Math.min(SPLITS.length - 1, state.split || 0));
  const runs = validRuns().filter(r => !r.manual).sort((a, b) => runNum(a) - runNum(b));
  const ds = runs.map(r => derive(r).splits[i]);
  const cols = [{name: T.colSplitLength, f: p => p.dur, main: true}, {name: T.colSplitEnd, f: p => p.end, at: true},
    ...subDefs(i).map(c => ({...c, sub: true}))];
  const vals = cols.map(c => ds.map(p => c.f(p)));
  const best = vals.map(v => { const xs = v.filter(x => x != null); return xs.length ? Math.min(...xs) : null; });
  const avg = vals.map(v => average(v));
  const sp = SPLITS[i], icon = sp.icon || FALLBACK_LAST_ICON;
  // how a time compares: the best in gold, faster than average in green
  const cell = (v, k, n) => {
    if (v == null) return `<td class="mono muted">—</td>`;
    const c = cols[k], cls = c.at ? "" : v === best[k] ? " best" : avg[k] != null && v < avg[k] ? " fast" : "";
    return `<td class="mono${cls}">${c.at ? fmt(v, 0) : fmtShort(v)}</td>`;
  };
  const sumCell = (v, k) => `<td class="mono">${v == null ? "—" : cols[k].at ? fmt(v, 0) : fmtShort(v)}</td>`;

  // the split's length over the runs: a bar each, the average as a line
  const pts = runs.map((r, n) => ({r, v: vals[0][n]})), top = Math.max(1, ...pts.map(x => x.v || 0));
  const chart = pts.some(x => x.v != null) ? `<div class="spchart" role="img" aria-label="${esc(T.splitChartLabel(sp.name))}">
      ${avg[0] != null ? `<div class="spavg" style="bottom:${avg[0] / top * 100}%"><span>${esc(T.rowAverage)} ${fmtShort(avg[0])}</span></div>` : ""}
      ${pts.map(({r, v}) => `<button type="button" class="spbar tipped${v != null && v === best[0] ? " best" : ""}" data-open="${esc(r.id)}" data-tip="${esc(runTitle(r))} · ${v != null ? fmtShort(v) : T.notDone}" aria-label="${esc(runTitle(r))}"><span style="height:${v != null ? Math.max(2, v / top * 100) : 0}%;background:${SCOL[i]}"></span><i>${esc(runNum(r))}</i></button>`).join("")}
    </div>` : "";
  const bestRun = best[0] != null ? runs[vals[0].indexOf(best[0])] : null;
  const tiles = [[T.rowAverage, avg[0] != null ? fmtShort(avg[0]) : "—", ""], [T.rowBest, best[0] != null ? fmtShort(best[0]) : "—", bestRun ? runTitle(bestRun) : ""],
    [T.splitLatest, vals[0].length && vals[0][vals[0].length - 1] != null ? fmtShort(vals[0][vals[0].length - 1]) : "—", runs.length ? runTitle(runs[runs.length - 1]) : ""],
    [T.colSplitEnd + " · " + T.rowAverage.toLowerCase(), avg[1] != null ? fmt(avg[1], 0) : "—", ""]];

  el.innerHTML = `
    <div class="pagerwrap"><button type="button" class="linkbtn" id="splitBack">${esc(T.backToOverview)}</button>
      <span class="splitpick">${SPLITS.map((x, k) => `<button type="button" class="chip${k === i ? " on" : ""}" data-split="${k}" aria-label="${esc(x.name)}">${ic(x.icon || FALLBACK_LAST_ICON, 18)} ${esc(x.name)}</button>`).join("")}</span></div>
    <section class="card" style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:10px">${ic(icon, 28)}<h2>${esc(sp.name)}</h2><span class="muted">${esc(T.splitRunsCount(vals[0].filter(x => x != null).length))}</span></div>
      <div class="sptiles">${tiles.map(([k, v, s]) => `<div class="sptile"><span class="label">${esc(k)}</span><span class="mono t">${v}</span>${s ? `<span class="muted">${esc(s)}</span>` : ""}</div>`).join("")}</div>
      ${chart}
    </section>
    <div class="card" style="padding:0">
      <p class="muted" style="margin:0;padding:14px 18px 0">${esc(i === 3 ? T.splitRunsNoteMid : T.splitRunsNote)}</p>
      <div class="tablewrap sptable"><table>
      <thead><tr><th scope="col">${esc(T.colRun)}</th>${cols.map(c => `<th scope="col"${c.about ? ` title="${esc(c.about)}"` : ""}><span class="spth">${c.icon ? ic(c.icon, 18) : ""}<span>${esc(c.name)}</span></span></th>`).join("")}</tr></thead>
      <tbody>
        <tr class="sumrow"><th scope="row">${esc(T.rowAverage)}</th>${avg.map((v, k) => sumCell(v, k)).join("")}</tr>
        <tr class="sumrow"><th scope="row">${esc(T.rowBest)}</th>${best.map((v, k) => sumCell(v, k)).join("")}</tr>
        ${runs.map((r, n) => `<tr class="runrow" data-open="${esc(r.id)}" tabindex="0"><th scope="row"><span class="runno">${esc(runNum(r))}</span><span class="muted spdate">${esc(runDay(r))}</span></th>
          ${vals.map((v, k) => cell(v[n], k, n)).join("")}</tr>`).join("")}
      </tbody></table></div></div>`;
  $("#splitBack").addEventListener("click", () => go("runs"));
  el.querySelectorAll("[data-split]").forEach(b => b.addEventListener("click", () => { state.split = +b.dataset.split; renderSplitPage(); }));
  el.querySelectorAll("[data-open]").forEach(t => t.addEventListener("click", () => go("run", t.dataset.open)));
}

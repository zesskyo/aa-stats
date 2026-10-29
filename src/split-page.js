/*
 * split-page.js — one split, every run: how long it took in each run and when it ended, and its sub-splits (for Midgame,
 * the checklist's splits), with the average and the best, and a graph of it over the runs. Opened from a split's "avg"
 * on the Overview, or from a run's sub-splits.
 */

// The splits with a page of their own (and a panel on a run's page): the main splits (TOP), then the parts with times
// of their own (Any%, Outer End, Enchanting, Debris). of: a run's derive() → that split
// Then moments, a time in each run rather than how long something took (mark): the elytra, A Complete Catalogue,
// Adventuring Time.
const markOf = t => ({segs: [], start: null, end: t, dur: null});
const advDone = id => d => markOf(((d.comp || []).find(e => e[2] === id) || [null])[0]);
const SPLIT_VIEWS = [
  ...TOP.map((t, k) => ({key: ["earlygame", "midgame", "endgame", "post"][k], name: t.name, icon: t.icon, col: TCOL[k], of: d => d.top[k], top: k})),
  ...[0, 1, 2, 4].map(i => ({key: ["any", "outer", "ench", , "debris"][i], name: SPLITS[i].name, icon: SPLITS[i].icon, col: SCOL[i], of: d => d.splits[i], part: i})),
  {key: "elytra", name: T.elytraObtain, icon: "elytra", col: SCOL[1], mark: true, of: advDone("end/elytra")},
  {key: "acc", name: advName("husbandry/complete_catalogue"), icon: MICON["husbandry/complete_catalogue"], col: SCOL[3], mark: true, of: advDone("husbandry/complete_catalogue")},
  {key: "at", name: advName("adventure/adventuring_time"), icon: MICON["adventure/adventuring_time"], col: SCOL[3], mark: true, of: advDone("adventure/adventuring_time")},
];
const viewByKey = k => SPLIT_VIEWS.findIndex(v => v.key === k);
const viewOfPart = i => SPLIT_VIEWS.findIndex(v => v.part === i);
// A split's steps, the same for every run: [{key, name, icon, about, f: a run's derive() → the step's time, or null}]
// (Earlygame: Any%, Outer End and Enchanting; Midgame: the checklist's timed splits; Endgame (Debris among them), Any%
// and Outer End: their sub-splits)
function subDefs(v) {
  v = SPLIT_VIEWS[v];
  if (v.top === 0) return TOP[0].parts.map(i => ({key: "p" + i, name: SPLITS[i].name, icon: SPLITS[i].icon, part: i, f: d => d.splits[i].dur}));
  // (Midgame: in the order of the checklist's groups, MID_GROUPS)
  if (v.top === 1) return MID_GROUPS.flatMap(g => g[1]).map(k => MIDGAME.find(m => m.key === k)).filter(m => m && m.start).map(m => ({key: m.key, name: m.name, icon: itemIcon(m.item),
    f: d => { const x = d.top[1].mid && d.top[1].mid.sections.find(y => y.key === m.key); return x && x.complete ? x.dur : null; }}));
  const i = v.top === 2 ? 5 : v.part;
  const ref = i == null ? null : validRuns().map(r => derive(r).splits[i]).find(p => p.subs);
  return ref ? ref.subs.map((x, j) => ({key: j, name: i === 0 && (j === 2 || j === 3) ? T.nthStructure[j - 2] : x.name, icon: itemIcon(x.item), about: "",
    f: d => { const p = d.splits[i]; return p.subs && p.subs[j] ? p.subs[j].dur : null; }})) : [];
}
// The average and the best of each step (and of the split itself, key "split"), over the runs on the site
function subRefs(v, defs = subDefs(v)) {
  const ds = validRuns().filter(r => !r.manual).map(r => derive(r)), out = {}, of = SPLIT_VIEWS[v].of;
  for (const c of [{key: "split", f: d => SPLIT_VIEWS[v].mark ? of(d).end : of(d).dur}, ...defs]) {
    const xs = ds.map(c.f).filter(x => x != null);
    out[c.key] = {avg: average(xs), best: xs.length ? Math.min(...xs) : null, worst: xs.length > 1 ? Math.max(...xs) : null, n: xs.length};
  }
  return out;
}
// "+1:02" / "−0:15" against the average (with a class: faster or slower), gold for the best and red for the worst
const vsAvg = (v, ref) => v == null || !ref || ref.avg == null ? `<span class="muted">—</span>`
  : `<span class="${ref.best != null && v <= ref.best ? "gold" : ref.worst != null && v >= ref.worst ? "worst" : v <= ref.avg ? "good" : "bad"}">${v <= ref.avg ? "−" : "+"}${fmtShort(Math.abs(v - ref.avg))}</span>`;

let spSort = null;   // the table's order: {split, k: the column (-1: the run's number), dir: 1 or -1}
function renderSplitPage() {
  const el = $("#view-split"), i = Math.max(0, Math.min(SPLIT_VIEWS.length - 1, state.split || 0)), sv = SPLIT_VIEWS[i], vf = sv.mark ? fmtAt : fmtShort;
  syncUrl();
  const runs = validRuns().filter(r => !r.manual).sort((a, b) => runNum(a) - runNum(b));
  if (!spSort || spSort.split !== i) spSort = {split: i, k: -1, dir: 1};
  const ds = runs.map(r => derive(r));
  // (a moment, like the elytra: just when it was, in each run)
  const cols = sv.mark ? [{name: T.subDoneAt, f: d => sv.of(d).end, main: true, at: true}] : [{name: T.subTook, f: d => sv.of(d).dur, main: true}, {name: T.subDoneAt, f: d => sv.of(d).end, at: true},
    ...subDefs(i).map(c => ({...c, sub: true}))];
  const vals = cols.map(c => ds.map(p => c.f(p)));
  const best = vals.map(v => { const xs = v.filter(x => x != null); return xs.length ? Math.min(...xs) : null; });
  const worst = vals.map(v => { const xs = v.filter(x => x != null); return xs.length > 1 ? Math.max(...xs) : null; });
  const avg = vals.map(v => average(v));
  const sp = sv;
  // how a time compares: the best in gold, faster than average in green, the worst in red
  const cell = (v, k, n) => {
    if (v == null) return `<td class="mono muted">—</td>`;
    const c = cols[k], cls = c.at && !c.main ? "" : v === best[k] ? " best" : v === worst[k] ? " worst" : avg[k] != null && v < avg[k] ? " fast" : "";
    return `<td class="mono${cls}">${c.at ? fmt(v, 0) : fmtShort(v)}</td>`;
  };
  const sumCell = (v, k) => `<td class="mono">${v == null ? "—" : cols[k].at ? fmt(v, 0) : fmtShort(v)}</td>`;

  // the split's length over the runs: a bar each, the average as a line
  const pts = runs.map((r, n) => ({r, v: vals[0][n]})), top = Math.max(1, ...pts.map(x => x.v || 0));
  const chart = pts.some(x => x.v != null) ? `<div class="spchart" role="img" aria-label="${esc(T.splitChartLabel(sp.name))}">
      ${avg[0] != null ? `<div class="spavg" style="bottom:${avg[0] / top * 100}%"><span>${esc(T.rowAverage)} ${vf(avg[0])}</span></div>` : ""}
      ${pts.map(({r, v}) => `<button type="button" class="spbar tipped${v != null && v === best[0] ? " best" : v != null && v === worst[0] ? " worst" : ""}" data-open="${esc(r.id)}" data-tip="${esc(runTitle(r))} · ${v != null ? vf(v) : T.notDone}" aria-label="${esc(runTitle(r))}"><span style="height:${v != null ? Math.max(2, v / top * 100) : 0}%;background:${sv.col}"></span><i>${esc(runNum(r))}</i></button>`).join("")}
    </div>` : "";
  const bestRun = best[0] != null ? runs[vals[0].indexOf(best[0])] : null;
  const tiles = [[T.rowAverage, avg[0] != null ? vf(avg[0]) : "—", ""], [T.rowBest, best[0] != null ? vf(best[0]) : "—", bestRun ? runTitle(bestRun) : ""]];
  // the rows, in the order picked by clicking a heading (the run's number, or a column: fastest first, then slowest
  // first; runs without that time always last)
  const order = runs.map((_, n) => n);
  if (spSort.k >= 0) order.sort((a, b) => { const x = vals[spSort.k][a], y = vals[spSort.k][b]; return x == null ? (y == null ? a - b : 1) : y == null ? -1 : (x - y) * spSort.dir || a - b; });
  else if (spSort.dir < 0) order.reverse();
  const arrow = k => spSort.k === k ? `<span class="sparrow">${spSort.dir > 0 ? "▲" : "▼"}</span>` : "";
  // (many columns, like Midgame's checklist: the sub-splits' headings are just their icons, named on hover)
  const compact = cols.length > 10;

  el.innerHTML = `
    <div class="pagerwrap"><button type="button" class="linkbtn" id="splitBack">${esc(T.backToOverview)}</button>
      <span class="splitpick">${SPLIT_VIEWS.map((x, k) => `<button type="button" class="chip${k === i ? " on" : ""}" data-split="${k}" aria-label="${esc(x.name)}">${splitIcon(k, 18)} ${esc(x.name)}</button>`).join("")}</span></div>
    <section class="card" style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;align-items:center;gap:10px">${splitIcon(i, 28)}<h2>${esc(sp.name)}</h2></div>
      <div class="sptiles">${tiles.map(([k, v, s]) => `<div class="sptile"><span class="label">${esc(k)}</span><span class="mono t">${v}</span>${s ? `<span class="muted">${esc(s)}</span>` : ""}</div>`).join("")}</div>
      ${chart}
    </section>
    <div class="card" style="padding:0">
      <div class="tablewrap sptable${compact ? " compact" : ""}"><table>
      <thead>${sv.top === 1 ? `<tr class="spgroups"><th></th><th colspan="2"></th>${MID_GROUPS.map(([g, keys]) => { const n = cols.filter(c => keys.includes(c.key)).length;
        return n ? `<th colspan="${n}" scope="colgroup">${esc(g)}</th>` : ""; }).join("")}</tr>` : ""}<tr><th scope="col"><button type="button" class="spsort" data-sort="-1">${esc(T.colRun)}${arrow(-1)}</button></th>${cols.map((c, k) => { const iconOnly = compact && c.sub && c.icon;
        return `<th scope="col"${spSort.k === k ? ` aria-sort="${spSort.dir > 0 ? "ascending" : "descending"}"` : ""}><button type="button" class="spsort spth${iconOnly ? " tipped" : ""}" data-sort="${k}"${iconOnly ? ` data-tip="${esc(c.name)}" aria-label="${esc(c.name)}"` : ""}>${c.icon ? ic(c.icon, iconOnly ? 24 : 18) : ""}<span>${iconOnly ? "" : esc(c.name)}${arrow(k)}</span></button></th>`; }).join("")}</tr></thead>
      <tbody>
        <tr class="sumrow"><th scope="row">${esc(T.rowAverage)}</th>${avg.map((v, k) => sumCell(v, k)).join("")}</tr>
        <tr class="sumrow"><th scope="row">${esc(T.rowBest)}</th>${best.map((v, k) => sumCell(v, k)).join("")}</tr>
        ${order.map(n => [runs[n], n]).map(([r, n]) => `<tr class="runrow" data-open="${esc(r.id)}" tabindex="0"><th scope="row"><span class="runno">${esc(runNum(r))}</span><span class="muted spdate">${esc(runDay(r))}</span></th>
          ${vals.map((v, k) => cell(v[n], k, n)).join("")}</tr>`).join("")}
      </tbody></table></div></div>`;
  $("#splitBack").addEventListener("click", () => go("runs"));
  el.querySelectorAll("[data-split]").forEach(b => b.addEventListener("click", () => { state.split = +b.dataset.split; renderSplitPage(); }));
  el.querySelectorAll("[data-sort]").forEach(b => b.addEventListener("click", () => {
    const k = +b.dataset.sort; spSort = {split: i, k, dir: spSort.k === k ? -spSort.dir : 1};
    // (the same page again, re-sorted: it stays where it was scrolled to)
    const w = el.querySelector(".sptable"), y = window.scrollY, l = w.scrollLeft, t = w.scrollTop;
    renderSplitPage();
    const w2 = el.querySelector(".sptable"); w2.scrollLeft = l; w2.scrollTop = t; window.scrollTo(0, y);
  }));
  el.querySelectorAll("[data-open]").forEach(t => t.addEventListener("click", () => go("run", t.dataset.open)));
}

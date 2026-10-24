/*
 * split-page.js — one split, every run: how long it took in each run and when it ended, and its sub-splits (for Midgame,
 * the checklist's splits), with the average and the best. Opened from a split's "avg" on the Overview.
 */
function renderSplitPage() {
  const el = $("#view-split"), i = Math.max(0, Math.min(SPLITS.length - 1, state.split || 0));
  const runs = validRuns().filter(r => !r.manual).sort((a, b) => runNum(a) - runNum(b));
  const ds = runs.map(r => derive(r).splits[i]);
  // the columns after the split's own: its sub-splits, or (Midgame) the checklist's splits
  const ref = ds.find(p => p.subs) || null;
  const subCols = ref ? ref.subs.map((x, j) => ({name: i === 0 && (j === 1 || j === 2) ? (j === 1 ? "1st structure" : "2nd structure") : x.name, icon: itemIcon(x.item), f: p => p.subs && p.subs[j] ? p.subs[j].dur : null}))
    : i === 3 ? MIDGAME.filter(m => m.start).map(m => ({name: m.name, icon: itemIcon(m.item), f: p => { const x = p.mid && p.mid.sections.find(y => y.key === m.key); return x && x.complete ? x.dur : null; }}))
    : [];
  const cols = [{name: T.colSplitLength, f: p => p.dur, main: true}, {name: T.colSplitEnd, f: p => p.end, at: true}, ...subCols];
  const vals = cols.map(c => ds.map(p => c.f(p)));
  const best = vals.map(v => { const xs = v.filter(x => x != null); return xs.length ? Math.min(...xs) : null; });
  const avg = vals.map(v => average(v));
  const cell = (v, k, gold) => `<td class="mono${gold ? " best" : ""}">${v == null ? "—" : cols[k].at ? fmt(v, 0) : fmtShort(v)}</td>`;
  const sp = SPLITS[i];
  el.innerHTML = `
    <div class="pagerwrap"><button type="button" class="linkbtn" id="splitBack">${esc(T.backToOverview)}</button>
      <span class="splitpick">${SPLITS.map((x, k) => `<button type="button" class="chip${k === i ? " on" : ""}" data-split="${k}" aria-label="${esc(x.name)}">${ic(x.icon || FALLBACK_LAST_ICON, 18)} ${esc(x.name)}</button>`).join("")}</span></div>
    <section class="card" style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;gap:10px">${ic(sp.icon || FALLBACK_LAST_ICON, 28)}<h2>${esc(sp.name)}</h2></div>
      <p class="muted" style="margin:0">${esc(T.splitRunsNote)}</p>
    </section>
    <div class="card tablewrap" style="padding:0"><table>
      <thead><tr><th scope="col">${esc(T.colRun)}</th><th scope="col">${esc(T.colDate)}</th>${cols.map(c => `<th scope="col">${c.icon ? ic(c.icon, 16) + " " : ""}${esc(c.name)}</th>`).join("")}</tr></thead>
      <tbody>
        <tr class="sumrow"><td colspan="2"><b>${esc(T.rowAverage)}</b></td>${avg.map((v, k) => cell(v, k)).join("")}</tr>
        <tr class="sumrow"><td colspan="2"><b>${esc(T.rowBest)}</b></td>${best.map((v, k) => cell(v, k)).join("")}</tr>
        ${runs.map((r, n) => `<tr class="runrow" data-open="${esc(r.id)}" tabindex="0"><td><span class="runno">${esc(runNum(r))}</span></td><td style="white-space:nowrap">${esc(runDay(r))}</td>
          ${vals.map((v, k) => cell(v[n], k, v[n] != null && v[n] === best[k] && !cols[k].at)).join("")}</tr>`).join("")}
      </tbody></table></div>`;
  $("#splitBack").addEventListener("click", () => go("runs"));
  el.querySelectorAll("[data-split]").forEach(b => b.addEventListener("click", () => { state.split = +b.dataset.split; renderSplitPage(); }));
  el.querySelectorAll("tr[data-open]").forEach(t => t.addEventListener("click", () => go("run", t.dataset.open)));
}

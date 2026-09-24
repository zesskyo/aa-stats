/*
 * overview.js — the Overview page: PB card, Fastest Splits, Average stats and the runs table.
 */
function renderOverview() {
  const pb = pbRun(), valid = validRuns();

  // ---------- PB card ----------
  const best = SPLITS.map((p, i) => { const b = fastest(r => derive(r).splits[i].dur); return b.r ? {dur: b.v, run: b.r} : null; });
  const sobParts = FASTEST_SPLITS.map(i => best[i]);
  const sumOfBest = sobParts.every(Boolean) ? sobParts.reduce((a, b) => a + b.dur, 0) : null;
  const totalPlay = RUNS.reduce((a, r) => a + (r.finalIgt || 0), 0);
  const avgTime = average(valid.map(r => r.finalIgt));
  $("#pbCard").innerHTML = pb ? `
    <div style="display:flex;flex-direction:column;gap:8px">
      <span class="label">${esc(T.pb)}</span>
      <span class="big">${runTime(pb)}</span>
      <button type="button" class="linkbtn" style="align-self:flex-start;padding:0" data-open="${esc(pb.id)}">${esc(runTitle(pb))}</button>
    </div>
    <div class="stats2">
      <div><span class="k">${esc(T.sumOfBest)}</span><span class="v">${sumOfBest != null ? fmt(sumOfBest, 0) : "—"}</span></div>
      <div><span class="k">${esc(T.averageTime)}</span><span class="v">${avgTime != null ? fmt(avgTime, 0) : "—"}</span></div>
      <div><span class="k">${esc(T.totalRuns)}</span><span class="v">${RUNS.length}</span></div>
      <div><span class="k">${esc(T.totalPlaytime)}</span><span class="v">${fmt(totalPlay, 0)}</span></div>
    </div>`
    : `<span class="label">${esc(T.pb)}</span><p class="muted" style="margin:12px 0 0">${esc(T.noPbYet)}</p>`;
  $("#pbCard").querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => go("run", b.dataset.open)));

  // ---------- Fastest Splits ----------
  // A card: icon, name, best time, which run, and the average
  const splitCard = (icon, name, bestV, bestRun, avgV, format) => `
    <div class="splitcard">
      <div style="display:flex;align-items:center;gap:8px">${ic(icon)}<span class="label">${esc(name)}</span></div>
      <span class="t">${bestV != null ? format(bestV) : "—"}</span>
      <span class="note">${bestRun ? esc(runTitle(bestRun)) : esc(T.noRunYet)}${avgV != null && valid.length > 1 ? " · " + esc(T.averagePrefix) + " " + format(avgV) : ""}</span>
    </div>`;
  $("#bestSplits").innerHTML = FASTEST_SPLITS.map(i =>
    splitCard(SPLITS[i].icon, SPLITS[i].name, best[i] && best[i].dur, best[i] && best[i].run, average(valid.map(r => derive(r).splits[i].dur)), fmtShort)).join("");

  const otherSplit = key => key === "skulls"
    ? {icon: "s_skulls", name: T.skullsSplit, f: r => { const x = derive(r).skullSplit; return x ? x.dur : null; }, format: fmtShort}
    : {icon: MICON[key], name: advName(key), f: r => { const m = derive(r).multis.find(q => q.id === key); return m ? m.done : null; }, format: t => fmt(t, 0)};
  $("#otherSplits").innerHTML = OTHER_SPLITS.map(otherSplit).map(o => {
    const b = fastest(o.f);
    return splitCard(o.icon, o.name, b.v, b.r, average(valid.map(o.f)), o.format);
  }).join("");

  // ---------- Average stats ----------
  $("#aggregates").innerHTML = `<div class="card"><h2 style="margin-bottom:12px">${esc(T.averageStats)}</h2>${averageStatCards()}</div>`;

  // ---------- Runs table ----------
  renderRunsTable(pb);
}

const hundred = c => c === "Thunderful" ? T.hundredYes : c === "Thunderless" ? T.hundredNo : c === "Unknown" ? T.hundredUnknown : T.hundredInvalid;

function renderRunsTable(pb) {
  const tbl = $("#runsTable");
  if (!RUNS.length) { tbl.innerHTML = `<div class="empty">${esc(T.noRunsYet)}</div>`; return; }

  // Sorting: click a heading to sort by it, click again to reverse
  const HUNDRED_ORDER = {Thunderful: 0, Thunderless: 1, Invalid: 2, Unknown: 3};
  const sortKeys = {
    num: runNum,
    date: dayNumber,
    hundred: r => HUNDRED_ORDER[derive(r).category],
    igt: r => r.finalIgt ?? Infinity,
  };
  SPLIT_CARDS.forEach(i => { sortKeys["p" + i] = r => { const v = splitMark(derive(r).splits[i], i); return v == null ? Infinity : v; }; });
  if (!sortKeys[state.sort.key]) state.sort = {key: "num", dir: 1};
  const key = sortKeys[state.sort.key];
  const rows = RUNS.slice().sort((a, b) => (key(a) - key(b)) * state.sort.dir || runNum(a) - runNum(b));

  // note = HTML shown when hovering the heading (marked with a small corner triangle, like a note in Google Sheets)
  const th = (k, label, note) => {
    const on = state.sort.key === k, arrow = on ? (state.sort.dir > 0 ? " ▲" : " ▼") : "";
    return `<th scope="col"${note ? ` class="hasnote"` : ""} aria-sort="${on ? (state.sort.dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" class="sortbtn${on ? " on" : ""}" data-sort="${k}"${note ? ` aria-describedby="note-${k}"` : ""}>${esc(label)}<span aria-hidden="true">${arrow}</span></button>${note ? `<span class="notemark" aria-hidden="true"></span><div class="notepop" role="tooltip" id="note-${k}">${note}</div>` : ""}</th>`;
  };
  const head = th("num", T.colRun) + th("igt", T.colTime) + th("hundred", T.colHundred, T.hundredNote) + th("date", T.colDate) + SPLIT_CARDS.map(i => th("p" + i, SPLITS[i].name)).join("");
  const row = r => {
    const d = derive(r);
    return `<tr class="runrow" data-open="${esc(r.id)}" tabindex="0" aria-label="${esc(runTitle(r))}">
      <td style="white-space:nowrap"><span class="runno">${esc(runNum(r))}</span>${videoLink(r)}${shotLink(r)}${pb === r ? `<span class="badge">${esc(T.pb)}</span>` : ""}</td>
      <td class="mono">${fmt(r.finalIgt, 0)}</td>
      <td>${d.category === "Invalid" ? `<span class="tipped hint" tabindex="0" data-tip="${esc(missingText(d))}">${esc(hundred(d.category))}</span>` : esc(hundred(d.category))}</td>
      <td style="white-space:nowrap">${esc(runDay(r))}${r.meta && r.meta.seed ? `<div class="note mono">${esc(r.meta.seed)}</div>` : ""}</td>
      ${SPLIT_CARDS.map(i => { const v = splitMark(d.splits[i], i); return `<td class="mono">${v != null ? fmt(v, 0) : "—"}</td>`; }).join("")}
    </tr>`;
  };
  tbl.innerHTML = `<table style="min-width:900px"><thead><tr>${head}</tr></thead><tbody>${rows.map(row).join("")}</tbody></table>`;
  tbl.querySelectorAll("[data-sort]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.sort;
    state.sort = state.sort.key === k ? {key: k, dir: -state.sort.dir} : {key: k, dir: 1};
    renderRunsTable(pb);
  }));
}

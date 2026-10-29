/*
 * overview.js — the Overview page: PB card, Fastest Splits, Average stats and the runs table.
 */
function renderOverview() {
  const pb = pbRun(), valid = validRuns();

  // ---------- PB card ----------
  // (sum of best: the main splits but Post-endgame)
  const sobParts = [0, 1, 2].map(k => { const b = fastest(r => derive(r).top[k].dur); return b.r ? {dur: b.v, run: b.r} : null; });
  const sumOfBest = sobParts.every(Boolean) ? sobParts.reduce((a, b) => a + b.dur, 0) : null;
  const totalPlay = RUNS.reduce((a, r) => a + (r.finalIgt || 0), 0);
  const avgTime = average(valid.map(r => r.finalIgt));
  // the world record, on the right
  const wrCol = WR && WR.finalIgt != null ? `
      <div class="pbcol wrcol">
        <span class="label">${esc(T.wr)}</span>
        <span class="big wrtime">${runTime(WR)}</span>
        <button type="button" class="linkbtn" style="padding:0" data-open="${esc(WR.id)}">${esc(WR.meta.runner || T.wrWord)}</button>
      </div>` : "";
  $("#pbCard").innerHTML = pb ? `
    <div class="pbrow">
      <div class="pbcol">
        <span class="label">${esc(T.pb)}</span>
        <span class="big">${runTime(pb)}</span>
        <button type="button" class="linkbtn" style="align-self:flex-start;padding:0" data-open="${esc(pb.id)}">${esc(runTitle(pb))}</button>
      </div>${wrCol}
    </div>
    <div class="stats2">
      <div><span class="k">${esc(T.sumOfBest)}</span><span class="v">${sumOfBest != null ? fmt(sumOfBest, 0) : "—"}</span></div>
      <div><span class="k">${esc(T.averageTime)}</span><span class="v">${avgTime != null ? fmt(avgTime, 0) : "—"}</span></div>
      <div><span class="k">${esc(T.totalRuns)}</span><span class="v">${RUNS.length}</span></div>
      <div><span class="k">${esc(T.totalPlaytime)}</span><span class="v">${fmt(totalPlay, 0)}</span></div>
    </div>`
    : `<div class="pbrow"><div class="pbcol"><span class="label">${esc(T.pb)}</span><p class="muted" style="margin:4px 0 0">${esc(T.noPbYet)}</p></div>${wrCol}</div>`;
  $("#pbCard").querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => go("run", b.dataset.open)));

  // ---------- Fastest Splits ----------
  // A card: icon, name, the fastest (and which run), the average and the slowest; each opens its run
  // (the average opens the run closest to it)
  const open = (r, html) => r ? `<button type="button" class="linkbtn inl" data-open="${esc(r.id)}" aria-label="${esc(runTitle(r))}">${html}</button>` : html;
  // (for a main split, the average opens that split's page, with every run, instead)
  const splitCard = (icon, name, f, format, split, pick) => {
    const b = fastest(f), avgV = average(valid.map(f)), near = nearest(f, avgV), w = slowest(f), many = valid.filter(r => f(r) != null).length > 1;
    const avgText = esc(T.averagePrefix) + " " + format(avgV);
    return `
    <div class="splitcard${pick != null ? " pick" : ""}"${pick != null ? ` role="button" tabindex="0" aria-expanded="false" data-ov="${pick}"` : ""}>
      <div style="display:flex;align-items:center;gap:8px">${ic(icon)}<span class="label">${esc(name)}</span>${pick != null ? `<span class="chev" aria-hidden="true">▾</span>` : ""}</div>
      <span class="t">${b.v != null ? open(b.r, format(b.v)) : "—"}</span>
      <span class="note">${b.r ? (many ? `${split != null ? `<button type="button" class="linkbtn inl" data-split="${split}">${avgText}</button>` : open(near.r, avgText)} · ${open(w.r, esc(T.slowestPrefix) + " " + format(w.v))}` : "") : esc(T.noRunYet)}</span>
    </div>`;
  };
  // (each: how long it took, or for a moment like the elytra, when it was; its average opens its page)
  const viewCard = (key, pick) => { const v = viewByKey(key), sv = SPLIT_VIEWS[v];
    return splitCard(sv.icon, sv.name, r => { const p = sv.of(derive(r)); return sv.mark ? p.end : p.dur; }, sv.mark ? fmtAt : fmtShort, v, pick); };
  // (a sub-split: its average opens its split's page)
  const subCard = (pi, name, item, v) => splitCard(itemIcon(item), name, r => { const x = (derive(r).splits[pi].subs || []).find(y => y.name === name); return x ? x.dur : null; }, fmtShort, v);
  // (Debris has a page of its own)
  const subsOf = pi => { const r = valid.find(x => (derive(x).splits[pi].subs || []).length); return r ? derive(r).splits[pi].subs.map(x => [x.name, x.item]) : []; };
  $("#bestSplits").innerHTML = OVERVIEW_SPLITS.map((o, k) => viewCard(o.key, k)).join("");
  // the open one's splits, underneath
  const showMore = () => {
    const k = state.ovOpen, o = OVERVIEW_SPLITS[k], el = $("#otherSplits");
    $("#bestSplits").querySelectorAll("[data-ov]").forEach(b => { b.classList.toggle("on", +b.dataset.ov === k); b.setAttribute("aria-expanded", String(+b.dataset.ov === k)); });
    el.classList.toggle("hidden", !o);
    if (!o) { el.innerHTML = ""; return; }
    const v = viewByKey(o.key);
    el.style.setProperty("--sc", SPLIT_VIEWS[v].col);
    el.innerHTML = (o.subs != null ? subsOf(o.subs).map(([n, it]) => subCard(o.subs, n, it, n === SPLITS[4].name ? viewByKey("debris") : v)) : []).concat((o.more || []).map(key => viewCard(key))).join("");
    bind(el);
  };
  const bind = el => {
    el.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); go("run", b.dataset.open); }));
    el.querySelectorAll("[data-split]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); state.split = +b.dataset.split; go("split"); }));
  };
  bind($("#bestSplits"));
  $("#bestSplits").querySelectorAll("[data-ov]").forEach(b => {
    const flip = () => { state.ovOpen = state.ovOpen === +b.dataset.ov ? null : +b.dataset.ov; showMore(); };
    b.addEventListener("click", flip);
    b.addEventListener("keydown", e => { if (e.target === b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); flip(); } });
  });
  showMore();

  // ---------- Average stats ----------
  const aggregates = () => { $("#aggregates").innerHTML = `<div class="card"><h2 style="margin-bottom:12px">${esc(T.averageStats)}</h2>${averageStatCards()}</div>`; bindRunStats($("#aggregates"), aggregates); };
  aggregates();

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
  SPLIT_CARDS.forEach(k => { sortKeys["p" + k] = r => { const v = topMark(derive(r).top[k]); return v == null ? Infinity : v; }; });
  if (!sortKeys[state.sort.key]) state.sort = {key: "num", dir: 1};
  const key = sortKeys[state.sort.key];
  const rows = RUNS.slice().sort((a, b) => (key(a) - key(b)) * state.sort.dir || runNum(a) - runNum(b));

  // note = HTML shown when hovering the heading (marked with a small corner triangle, like a note in Google Sheets)
  const th = (k, label, note) => {
    const on = state.sort.key === k, arrow = on ? (state.sort.dir > 0 ? " ▲" : " ▼") : "";
    return `<th scope="col"${note ? ` class="hasnote"` : ""} aria-sort="${on ? (state.sort.dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" class="sortbtn${on ? " on" : ""}" data-sort="${k}"${note ? ` aria-describedby="note-${k}"` : ""}>${esc(label)}<span aria-hidden="true">${arrow}</span></button>${note ? `<span class="notemark" aria-hidden="true"></span><div class="notepop" role="tooltip" id="note-${k}">${note}</div>` : ""}</th>`;
  };
  const head = th("num", T.colRun) + th("igt", T.colTime) + th("hundred", T.colHundred, T.hundredNote) + th("date", T.colDate) + SPLIT_CARDS.map(k => th("p" + k, TOP[k].name)).join("");
  const row = r => {
    const d = derive(r);
    return `<tr class="runrow" data-open="${esc(r.id)}" tabindex="0" aria-label="${esc(runTitle(r))}">
      <td style="white-space:nowrap"><span class="runno">${esc(runNum(r))}</span>${videoLink(r)}${shotLink(r)}${pb === r ? `<span class="badge">${esc(T.pb)}</span>` : ""}</td>
      <td class="mono">${fmt(r.finalIgt, 0)}</td>
      <td style="white-space:nowrap">${d.category === "Invalid" ? `<span class="tipped hint" tabindex="0" data-tip="${esc(missingText(d))}">${esc(hundred(d.category))}</span>` : esc(hundred(d.category))}${d.thunderfulAt != null ? ` <span class="tipped hint waited" tabindex="0" data-tip="${esc(T.thenThunderful(fmt(d.thunderfulAt, 0)))}: ${esc(T.thenThunderfulNote)}">${ic("thunder", 14) || "⚡"}</span>` : ""}</td>
      <td style="white-space:nowrap">${esc(runDay(r))}${r.meta && r.meta.seed ? `<div class="note mono">${esc(r.meta.seed)}</div>` : ""}</td>
      ${SPLIT_CARDS.map(k => { const v = topMark(d.top[k]); return `<td class="mono">${v != null ? fmt(v, 0) : "—"}</td>`; }).join("")}
    </tr>`;
  };
  tbl.innerHTML = `<table style="min-width:900px"><thead><tr>${head}</tr></thead><tbody>${rows.map(row).join("")}</tbody></table>`;
  tbl.querySelectorAll("[data-sort]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.sort;
    state.sort = state.sort.key === k ? {key: k, dir: -state.sort.dir} : {key: k, dir: 1};
    renderRunsTable(pb);
  }));
}

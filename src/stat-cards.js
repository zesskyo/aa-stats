/*
 * stat-cards.js — the icon + number cards under "Run stats" (one run) and "Average stats" (all runs).
 * The order comes from STAT_CARDS in config.js. Averages only use runs that have a log. Each entry below says which icon to use, what the
 * card means (read out to screen readers), and how to work out its value.
 */
const STAT_DEFS = {
  deaths: {
    icon: "s_deaths", name: () => T.statDeaths,
    one: r => nonIntentionalDeaths(r),
    num: r => nonIntentionalDeaths(r),
    avg: () => f1(average(logRuns().map(nonIntentionalDeaths))),
  },
  elytra: {
    icon: "s_elytra", name: () => T.statElytra,
    one: r => r.meta && r.meta.elytraCm != null ? (r.meta.elytraCm / 100000).toFixed(1) + " km" : "—",
    num: r => r.meta && r.meta.elytraCm != null ? r.meta.elytraCm : null,
    avg: () => { const a = average(logRuns().map(r => r.meta && r.meta.elytraCm != null ? r.meta.elytraCm / 100000 : null)); return a != null ? a.toFixed(1) + " km" : "—"; },
  },
  skulls: {
    icon: "s_skulls",
    name: () => T.statSkulls, avgName: () => T.statSkullRate,
    one: r => { const s = derive(r).skullRate; return s.skulls + " / " + s.kills; },
    // (ranked by wither skeletons killed per skull: fewest is luckiest)
    num: r => { const s = derive(r).skullRate; return s.skulls ? s.kills / s.skulls : null; },
    // across all runs it's shown as "1 / 18.9": one skull per that many wither skeletons
    avg: () => { const a = logRuns().reduce((x, r) => { const q = derive(r).skullRate; return [x[0] + q.skulls, x[1] + q.kills]; }, [0, 0]); return a[0] ? "1 / " + (a[1] / a[0]).toFixed(1) : "—"; },
  },
  tntPerDebris: {
    icon: "s_tnt", icon2: "s_debris", name: () => T.statTntPerDebris,
    one: r => { const x = derive(r).tntPer; return x != null ? x.toFixed(1) : "—"; },
    num: r => derive(r).tntPer,
    avg: () => { const a = logRuns().reduce((x, r) => [x[0] + derive(r).tntD, x[1] + derive(r).debD], [0, 0]); return a[1] ? (a[0] / a[1]).toFixed(1) : "—"; },
  },
  shulkers: {
    icon: "s_shulker", name: () => T.statShulkers,
    one: r => num(r.tot.shulkerOpen),
    num: r => r.tot.shulkerOpen ?? null,
    avg: () => { const a = average(logRuns().map(r => r.tot.shulkerOpen)); return a != null ? a.toFixed(0) : "—"; },
  },
  creepers: {
    icon: "s_creepers", name: () => T.statCreepers,
    one: r => num(r.tot.creepers),
    num: r => r.tot.creepers ?? null,
    avg: () => { const a = average(logRuns().map(r => r.tot.creepers)); return a != null ? a.toFixed(0) : "—"; },
  },
};
const f1 = x => x == null ? "—" : x.toFixed(1);

// One card: the icon(s) and the value. Without an icon, the name is shown instead. Clicking it shows the lowest and the
// highest of the runs (each opening its run), when there are two or more to compare.
function statCard(def, value, name) {
  const icons = def.icon2 && ic(def.icon) && ic(def.icon2)
    ? `<span class="sico pair">${ic(def.icon, 28)}<span class="per">/</span>${ic(def.icon2, 28)}</span>`
    : ic(def.icon) ? `<span class="sico">${ic(def.icon, 28)}</span>` : `<span class="k">${esc(name)}</span>`;
  const rs = def.num ? logRuns().map(r => ({r, v: def.num(r)})).filter(x => x.v != null && isFinite(x.v)) : [];
  if (rs.length < 2) return `<div class="stat stat-ic">${icons}<span class="v">${value}</span><span class="sr">${esc(name)}</span></div>`;
  const lo = rs.reduce((a, b) => b.v < a.v ? b : a), hi = rs.reduce((a, b) => b.v > a.v ? b : a);
  const line = (k, x) => `<button type="button" class="linkbtn rangerow" data-open="${esc(x.r.id)}"><span class="k">${esc(k)}</span><span class="mono">${def.one(x.r)}</span><span class="muted">${esc(runTitle(x.r))}</span></button>`;
  return `<div class="stat stat-ic pick"><button type="button" class="statbtn" aria-expanded="false" title="${esc(T.statRangeHint)}">${icons}<span class="v">${value}</span><span class="sr">${esc(name)}</span></button>`
    + `<div class="statrange" hidden>${line(T.statLowest, lo)}${line(T.statHighest, hi)}</div></div>`;
}
// (a card clicked: its lowest and highest shown or hidden; a run in them opens it)
function bindStatCards(el) {
  el.querySelectorAll(".statbtn").forEach(b => b.addEventListener("click", () => {
    const box = b.parentNode.querySelector(".statrange"), open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(open)); box.hidden = !open;
  }));
  el.querySelectorAll(".statrange [data-open]").forEach(b => b.addEventListener("click", () => go("run", b.dataset.open)));
}
// Cards for one run (Stats page) or averages (Overview)
const runStatCards = run => `<div class="statgrid centred">${STAT_CARDS.map(k => statCard(STAT_DEFS[k], STAT_DEFS[k].one(run), STAT_DEFS[k].name())).join("")}</div>`;
const averageStatCards = () => `<div class="statgrid">${STAT_CARDS.map(k => { const d = STAT_DEFS[k]; return statCard(d, d.avg(), (d.avgName || d.name)()); }).join("")}</div>`
  + `<div class="statgrid runstats">${RUN_STATS().map(([name, v, note, flip]) => `<${flip ? `button type="button" class="stat flip" data-flip="${flip}" title="${esc(T.clickToChange)}"` : `div class="stat"`}><span class="k">${esc(name)}${flip ? ` <span aria-hidden="true">⇄</span>` : ""}</span><span class="v">${v}</span>${note ? `<span class="note">${esc(note)}</span>` : ""}</${flip ? "button" : "div"}>`).join("")}</div>`;
// (Runs in the past week or month: clicking switches, and it's remembered in this browser)
let runSpan = "week";
try { if (localStorage.getItem("runSpan") === "month") runSpan = "month"; } catch {}
function bindRunStats(el, redraw) {
  bindStatCards(el);
  el.querySelectorAll('[data-flip="span"]').forEach(b => b.addEventListener("click", () => {
    runSpan = runSpan === "week" ? "month" : "week";
    try { localStorage.setItem("runSpan", runSpan); } catch {}
    redraw();
  }));
}

// Across all the runs, under the averages: [name, value, note]
const RUN_STATS = () => {
  const valid = validRuns(), byNum = valid.slice().sort((a, b) => runNum(a) - runNum(b));
  // VVF rate (Very Very Frightening, i.e. 100%): Thunderful out of the runs that are Thunderful or Thunderless
  const cats = valid.map(r => derive(r).category).filter(c => c === "Thunderful" || c === "Thunderless"), full = cats.filter(c => c === "Thunderful").length;
  // runs done in the past 7 or 30 days
  const when = r => r.meta && r.meta.date ? new Date(r.meta.date + "T12:00").getTime() : r.manual ? null : doneAt(r);
  const since = Date.now() - (runSpan === "week" ? 7 : 30) * 86400000, recent = RUNS.filter(r => { const t = when(r); return t != null && t >= since; }).length;
  const last5 = byNum.slice(-5);
  return [
    [T.statVvfRate, cats.length ? Math.round(full / cats.length * 100) + "%" : "—", cats.length ? T.ofRuns(full, cats.length) : ""],
    [runSpan === "week" ? T.statRunsWeek : T.statRunsMonth, String(recent), "", "span"],
    [T.statLast5, last5.length ? fmt(average(last5.map(r => r.finalIgt)), 0) : "—", last5.length ? T.runsRange(runNum(last5[0]), runNum(last5[last5.length - 1])) : ""],
  ];
};

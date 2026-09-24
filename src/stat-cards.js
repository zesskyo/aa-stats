/*
 * stat-cards.js — the icon + number cards under "Run stats" (one run) and "Average stats" (all runs).
 * The order comes from STAT_CARDS in config.js. Averages only use runs that have a log. Each entry below says which icon to use, what the
 * card means (read out to screen readers), and how to work out its value.
 */
const STAT_DEFS = {
  deaths: {
    icon: "s_deaths", name: () => T.statDeaths,
    one: r => nonIntentionalDeaths(r),
    avg: () => f1(average(logRuns().map(nonIntentionalDeaths))),
  },
  elytra: {
    icon: "s_elytra", name: () => T.statElytra,
    one: r => r.meta && r.meta.elytraCm != null ? (r.meta.elytraCm / 100000).toFixed(1) + " km" : "—",
    avg: () => { const a = average(logRuns().map(r => r.meta && r.meta.elytraCm != null ? r.meta.elytraCm / 100000 : null)); return a != null ? a.toFixed(1) + " km" : "—"; },
  },
  skulls: {
    icon: "s_skulls",
    name: () => T.statSkulls, avgName: () => T.statSkullRate,
    one: r => { const s = derive(r).skullRate; return s.skulls + " / " + s.kills; },
    // across all runs it's shown as "1 / 18.9": one skull per that many wither skeletons
    avg: () => { const a = logRuns().reduce((x, r) => { const q = derive(r).skullRate; return [x[0] + q.skulls, x[1] + q.kills]; }, [0, 0]); return a[0] ? "1 / " + (a[1] / a[0]).toFixed(1) : "—"; },
  },
  tntPerDebris: {
    icon: "s_tnt", icon2: "s_debris", name: () => T.statTntPerDebris,
    one: r => { const x = derive(r).tntPer; return x != null ? x.toFixed(1) : "—"; },
    avg: () => { const a = logRuns().reduce((x, r) => [x[0] + derive(r).tntD, x[1] + derive(r).debD], [0, 0]); return a[1] ? (a[0] / a[1]).toFixed(1) : "—"; },
  },
  shulkers: {
    icon: "s_shulker", name: () => T.statShulkers,
    one: r => num(r.tot.shulkerOpen),
    avg: () => { const a = average(logRuns().map(r => r.tot.shulkerOpen)); return a != null ? a.toFixed(0) : "—"; },
  },
  creepers: {
    icon: "s_creepers", name: () => T.statCreepers,
    one: r => num(r.tot.creepers),
    avg: () => { const a = average(logRuns().map(r => r.tot.creepers)); return a != null ? a.toFixed(0) : "—"; },
  },
};
const f1 = x => x == null ? "—" : x.toFixed(1);

// One card: the icon(s) and the value. Without an icon, the name is shown instead.
function statCard(def, value, name) {
  const icons = def.icon2 && ic(def.icon) && ic(def.icon2)
    ? `<span class="sico pair">${ic(def.icon, 28)}<span class="per">/</span>${ic(def.icon2, 28)}</span>`
    : ic(def.icon) ? `<span class="sico">${ic(def.icon, 28)}</span>` : `<span class="k">${esc(name)}</span>`;
  return `<div class="stat stat-ic">${icons}<span class="v">${value}</span><span class="sr">${esc(name)}</span></div>`;
}
// Cards for one run (Stats page) or averages (Overview)
const runStatCards = run => `<div class="statgrid">${STAT_CARDS.map(k => statCard(STAT_DEFS[k], STAT_DEFS[k].one(run), STAT_DEFS[k].name())).join("")}</div>`;
const averageStatCards = () => `<div class="statgrid">${STAT_CARDS.map(k => { const d = STAT_DEFS[k]; return statCard(d, d.avg(), (d.avgName || d.name)()); }).join("")}</div>`;

/*
 * stats.js — everything the site calculates about a run. derive(run) does it once per run and remembers it.
 *
 * What derive() returns:
 *   category     "Thunderful" (80/80), "Thunderless" (79/80, only Very Very Frightening missing) or "Invalid";
 *                runs without a log use "hundred" from runs.json, or "Unknown"
 *   splits       see splits.js
 *   deaths       [{t, dim, intentional, i}]  (deaths after The End... Again... count as intentional unless runs.json says otherwise)
 *   multis       progress of each multi-criteria advancement
 *   skullRate    skulls picked up, and wither skeletons killed up to the last skull (Any% kills don't count)
 *   skullSplit   time spent actively farming skulls (see findSkullSplit)
 *   tntPer       TNT placed per debris mined during the Debris split
 *   lanes        times you got tridents, skulls and nautilus shells
 *   rare         rare biome groups (see findRareBiomes)
 *   gold         gold block estimate over time
 *   thunder      when Very Very Frightening was earned (the logs don't record weather), or null
 *   riptide      riptide sessions: [{start, end, uses}] (see findRiptide)
 */
function derive(run) {
  if (run._d) return run._d;
  if (run.manual) return run._d = deriveManual(run);
  const st = run.st || {};
  const comp = run.events.filter(e => e[4]);                    // completed advancements
  const doneSet = new Set(comp.map(e => e[2]));
  const missing = Object.keys(ADV).filter(k => !doneSet.has(k));
  const category = !missing.length ? "Thunderful" : missing.length === 1 && missing[0] === VVF ? "Thunderless" : "Invalid";

  const {splits, anyEnd, endAgain} = findSplits(run, comp);

  // Deaths: runs.json can mark any death as intentional or not ("intent"); otherwise deaths after
  // The End... Again... are intentional and everything else isn't.
  const intent = (run.meta && run.meta.intent) || {};
  const deaths = (run.deaths || []).map((d, i) => ({t: d[0], dim: d[1], i,
    intentional: intent[i] != null ? !!intent[i] : endAgain != null && d[0] >= endAgain}));

  // Multi-criteria advancements
  const multis = Object.keys(MULTI).map(id => {
    const xs = run.events.filter(e => e[2] === id); if (!xs.length) return null;
    const dn = xs.find(e => e[4]);
    return {id, tot: dn ? xs.length : REQ[id], first: xs[0][0], done: dn ? dn[0] : null, last: xs[xs.length - 1][3], xs};
  }).filter(Boolean);

  // Pickups right after a death are the dropped items being collected again, so they're skipped
  const deathT = (run.deaths || []).map(x => x[0]);
  const obtains = key => (st[key] || []).filter(t => !deathT.some(dt => t >= dt && t - dt < RULES.pickupAfterDeath));

  // Skulls
  const skulls = st.skulls || [];
  const ws = (st.ws || []).filter(t => anyEnd == null || t > anyEnd);   // wither skeletons killed during Any% don't count
  const lastSkull = skulls.length ? skulls[skulls.length - 1] : null;
  const skullRate = {skulls: skulls.length, kills: lastSkull != null ? ws.filter(t => t <= lastSkull).length : ws.length};

  // TNT per debris, counted inside the Debris split only
  const debrisSplit = splits[4];
  const inDebris = arr => debrisSplit.start == null ? [] : (arr || []).filter(t => t >= debrisSplit.start && t <= debrisSplit.end);
  const tntD = inDebris(st.tnt).length, debD = inDebris(st.debris).length;

  return run._d = {
    comp, missing, category, splits, deaths, multis, skullRate, debrisSplit, tntD, debD,
    tntPer: debD ? tntD / debD : null,
    gold: st.goldV === 2 ? (st.gold || []) : [],
    lanes: {trident: obtains("trident"), skull: obtains("skulls"), nautilus: obtains("nautilus")},
    skullSplit: findSkullSplit(run, ws, obtains("skulls")),
    rare: findRareBiomes(run),
    thunder: (comp.find(e => e[2] === VVF) || [null])[0],
    riptide: findRiptide(run),
  };
}

/*
 * Riptide: bursts of trident uses. A riptide trident can be used again right away, while a thrown one
 * has to be picked up first, so throws (A Throwaway Joke, Very Very Frightening) never make a burst.
 */
function findRiptide(run) {
  const uses = [];
  for (const t of ((run.st || {}).tridentUse || [])) if (!uses.length || t - uses[uses.length - 1] >= RULES.riptideMinSpacing) uses.push(t);
  return clusters(uses, RULES.riptideGap).filter(c => c.length >= RULES.riptideMinUses)
    .map(c => ({start: c[0], end: c[c.length - 1], uses: c.length}));
}

/*
 * Skull split: starts at the first Nether visit with at least 3 wither skeleton kills (or a skull) and ends
 * at the 3rd skull. Only active farming counts: it pauses after RULES.skullIdleGap without a kill or skull,
 * on any dimension change, and on a death.
 */
function findSkullSplit(run, ws, skullsGot) {
  if (!skullsGot.length || !ws.length) return null;
  const endS = skullsGot[Math.min(2, skullsGot.length - 1)];
  const nether = [];
  run.dims.forEach((x, i) => { if (x[1] === "n") nether.push([x[0], i + 1 < run.dims.length ? run.dims[i + 1][0] : run.finalIgt]); });
  const kills = ws.filter(t => t <= endS);
  let startT = null;
  for (const iv of nether) {
    const k = kills.filter(t => t >= iv[0] && t <= iv[1]).length, sk = skullsGot.some(t => t >= iv[0] && t <= iv[1] && t <= endS);
    if (k >= 3 || sk) { startT = Math.min(kills.find(t => t >= iv[0] && t <= iv[1]) ?? Infinity, skullsGot.find(t => t >= iv[0]) ?? Infinity); break; }
  }
  if (startT == null || !isFinite(startT)) startT = kills[0] ?? skullsGot[0];
  const evs = [...kills, ...skullsGot.filter(t => t <= endS)].filter(t => t >= startT).sort((a, b) => a - b);
  const breaks = [...run.dims.map(x => x[0]), ...(run.deaths || []).map(x => x[0])];
  const segs = [];
  evs.forEach(t => {
    const g = segs[segs.length - 1];
    if (g && t - g[1] <= RULES.skullIdleGap && !breaks.some(bk => bk > g[1] && bk <= t)) g[1] = t; else segs.push([t, t]);
  });
  return {segs, dur: segs.reduce((a, g) => a + (g[1] - g[0]), 0), start: startT, end: endS};
}

/*
 * Rare biomes: each group's Adventuring Time criteria are split into visits (bursts of criteria).
 * A group is done when all its biomes have been visited.
 */
function findRareBiomes(run) {
  const atEv = run.events.filter(e => e[2] === "adventure/adventuring_time");
  return RARE.map(g => {
    const evs = atEv.filter(e => g.members.includes(e[3]));
    const have = new Set();
    const visits = clusters(evs.map(e => e[0]), RULES.rareVisitGap).map(ts => {
      const crit = evs.filter(e => ts.includes(e[0])).map(e => e[3]); crit.forEach(c => have.add(c));
      return {t: ts[0], tEnd: ts[ts.length - 1], crit, complete: g.members.every(m => have.has(m)), missing: g.members.filter(m => !have.has(m))};
    });
    const doneV = visits.find(v => v.complete);
    return {...g, visits, done: doneV ? doneV.tEnd : null, first: evs.length ? evs[0][0] : null, missing: g.members.filter(m => !have.has(m))};
  });
}

// A run with no log: just what runs.json says (time, 100%, splits). Everything else is empty.
function deriveManual(run) {
  const meta = run.meta || {}, marks = meta.splits || {};
  const category = meta.hundred === true ? "Thunderful" : meta.hundred === false ? "Thunderless" : "Unknown";
  // Any% (and Outer End) are shown by when they ended, the others by when they started (see splitMark)
  const splits = SPLITS.map((p, i) => {
    const t = marks[i] ?? null;
    return {name: p.name, icon: p.icon, segs: [], dur: null, start: i <= 1 ? (t != null ? 0 : null) : t, end: i <= 1 ? t : null};
  });
  return {comp: [], missing: [], category, splits, deaths: [], multis: [], skullRate: {skulls: 0, kills: 0}, debrisSplit: splits[4],
    tntD: 0, debD: 0, tntPer: null, gold: [], lanes: {trident: [], skull: [], nautilus: []}, skullSplit: null, rare: [], thunder: null, riptide: []};
}

// ---------- Across all runs ----------
const hasLog = r => !r.manual;
const logRuns = () => RUNS.filter(hasLog);
const isValid = r => derive(r).category !== "Invalid" && r.finalIgt != null;
const validRuns = () => RUNS.filter(isValid);
const pbRun = () => validRuns().sort((a, b) => a.finalIgt - b.finalIgt)[0] || null;
// "Missing A, B, C and 4 more": the advancements an Invalid run didn't get
const missingText = (d, max = 5) => {
  const names = d.missing.map(advName);
  return T.invalidRunMissing + " " + names.slice(0, max).join(", ") + (names.length > max ? " " + T.andMore(names.length - max) : "");
};
const nonIntentionalDeaths = r => derive(r).deaths.filter(d => !d.intentional).length;
const average = xs => { xs = xs.filter(x => x != null && !isNaN(x)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
// Fastest value of f(run) among valid runs: {v, r}
function fastest(f) { let b = null; validRuns().forEach(r => { const v = f(r); if (v != null && (b == null || v < b.v)) b = {v, r}; }); return b || {}; }

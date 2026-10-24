/*
 * splits.js — works out when each split of a run starts and ends.
 *
 *   Any%          start → dragon killed ("Free the End"; if that only came later, going through the gateway: reaching
 *                 the outer End, or "Remote Getaway" in logs without biomes)
 *   Outer End     → leaving the End after getting elytra (or finding an End City)
 *   Enchanting    → last enchanting-table pickup of the first pickup session after leaving the End
 *   Midgame       → debris starts (or Endgame starts early, see below)
 *   Debris        first netherrack mined after entering the Nether for the main debris session
 *                 → back in the Overworld after the last debris of that session; then any later Nether trip where
 *                 more debris was got (mined, or from a chest) is more Debris, paused in between
 *   Endgame       → Overworld after The End... Again..., or the end of the run
 *   Post-endgame  from there to the final advancement; only counted if it lasts at least RULES.postEndgameMin.
 *                 If How Did We Get Here was done before getting a god apple, it starts earlier: the next time
 *                 they go into the Nether. Debris during Post-endgame pauses it, as with Endgame.
 *
 * Early Endgame: placing a campfire (setting up bees) after Enchanting starts Endgame, if the honey is collected soon
 * after (pre-placed hives: Endgame starts at the honey instead). If that's before
 * debris, Endgame is paused while Debris happens and continues back in the Overworld.
 *
 * Each split can have more than one stretch ("segs"), which is how a paused Endgame (or Post-endgame) is stored.
 */

// Time an advancement was completed, or null
const advTime = (run, id) => { const e = run.events.find(x => x[2] === id && x[4]); return e ? e[0] : null; };
// First dimension change after time t into a dimension matching `pred`
const firstDimAfter = (run, t, pred) => { if (t == null) return null; const d = run.dims.find(x => x[0] > t && pred(x[1])); return d ? d[0] : null; };

function findSplits(run, comp) {
  const st = run.st || {};

  // Any%
  const kd = advTime(run, "end/kill_dragon"), gw = st.outerEnd ?? advTime(run, "end/enter_end_gateway");
  const anyUsesGateway = kd == null || (gw != null && kd > gw);
  const anyEnd = anyUsesGateway ? gw : kd;

  // Outer End: leave the End after the elytra
  const lootDone = advTime(run, "end/elytra") ?? advTime(run, "end/find_end_city");
  let outerEnd = null;
  if (lootDone != null) { const i = run.dims.findIndex(x => x[0] > lootDone && x[1] !== "e"); if (i >= 0) outerEnd = run.dims[i][0]; }

  // Enchanting: first session of enchanting-table pickups after leaving the End
  const pickups = (st.ench || []).filter(t => t > (outerEnd ?? anyEnd ?? 0));
  const session = pickups.length ? clusters(pickups, RULES.enchantPickupGap)[0] : null;
  const enchDone = session ? session[session.length - 1] : null;

  // Debris: the biggest burst of debris mining
  const debrisSession = (st.debris || []).length ? clusters(st.debris, RULES.debrisSessionGap).sort((a, b) => b.length - a.length)[0] : null;
  let debrisStart = null, debrisEnd = null;
  if (debrisSession) {
    const d0 = debrisSession[0];
    const netherIn = run.dims.filter(x => x[0] <= d0 && x[1] === "n").pop();
    const nIn = netherIn && (enchDone == null || netherIn[0] >= enchDone) ? netherIn[0] : null;
    const firstRack = nIn != null ? (st.rack || []).find(p => p[0] >= nIn && p[0] <= d0) : null;
    debrisStart = firstRack ? firstRack[0] : nIn != null ? nIn : d0;
    debrisEnd = firstDimAfter(run, debrisSession[debrisSession.length - 1], x => x === "o");
  }
  // more debris later on (more netherite needed): each Nether trip after that where debris was mined or turned up in the
  // inventory (from a chest) is more Debris, with what's between paused
  const moreDebris = [];
  if (debrisEnd != null) run.dims.forEach((x, i) => {
    if (x[1] !== "n" || x[0] < debrisEnd) return;
    const out = i + 1 < run.dims.length ? run.dims[i + 1][0] : run.finalIgt;
    if ([...(st.debris || []), ...(st.debrisGot || [])].some(t => t >= x[0] && t <= out)) moreDebris.push([x[0], out]);
  });
  const debrisSegs = debrisStart != null && debrisEnd != null ? [[debrisStart, debrisEnd], ...moreDebris] : [];

  // Post-endgame: back in the Overworld after The End... Again...
  const endAgain = advTime(run, "end/respawn_dragon");
  let postStart = firstDimAfter(run, endAgain, x => x === "o");
  // ...or, when How Did We Get Here was done before they had a god apple, the next time they go into the Nether
  const hdwgh = advTime(run, "nether/all_effects");
  const eaten = run.events.find(x => x[2] === "husbandry/balanced_diet" && x[3] === "enchanted_golden_apple");
  const godApple = Math.min(st.gapple ?? Infinity, eaten ? eaten[0] : Infinity);
  if (hdwgh != null && hdwgh > (enchDone ?? Infinity) && !(godApple <= hdwgh)) {
    const trip = firstDimAfter(run, hdwgh, x => x === "n");
    if (trip != null && (postStart == null || trip < postStart)) postStart = trip;
  }
  if (postStart != null && run.finalIgt - postStart < RULES.postEndgameMin) postStart = null;

  // Early Endgame (campfire placed before debris, or no Debris split). Only a campfire that's used for honey soon after
  // counts (Bee Our Guest within RULES.campfireToHoney): hives set up long before, e.g. while passing 0,0 in Midgame,
  // don't start Endgame; then it starts when the honey is collected.
  const honey = advTime(run, "husbandry/safely_harvest_honey");
  const camps = (st.campfire || []).filter(t => t > (enchDone ?? Infinity));
  let campT = honey == null ? camps[0] : camps.find(t => t <= honey && honey - t <= RULES.campfireToHoney);
  if (campT == null && honey != null && camps.some(t => t <= honey)) campT = honey;
  const earlyEnd = campT != null && (debrisStart == null || campT < debrisStart);
  const endgameEnd = postStart ?? run.finalIgt;

  const seg = (a, b) => a != null && b != null && b >= a ? [[a, b]] : [];
  // a stretch with Debris taken out of it (Endgame and Post-endgame pause for it)
  const noDebris = (a, b) => {
    if (a == null || b == null || b < a) return [];
    let out = [[a, b]];
    for (const [ds, de] of debrisSegs) out = out.flatMap(([x, y]) => de <= x || ds >= y ? [[x, y]] : [...(ds > x ? [[x, ds]] : []), ...(de < y ? [[de, y]] : [])]);
    return out;
  };
  const segsBySplit = [
    seg(0, anyEnd),
    seg(anyEnd, outerEnd),
    seg(outerEnd, enchDone),
    seg(enchDone, [earlyEnd ? campT : debrisStart, postStart].filter(t => t != null).reduce((a, t) => a == null ? t : Math.min(a, t), null)),
    debrisSegs,
    noDebris(earlyEnd ? campT : debrisEnd, endgameEnd),
    postStart != null ? noDebris(postStart, run.finalIgt) : [],
  ];

  const lastId = (comp[comp.length - 1] || [])[2];
  const postIcon = LAST_ICON[lastId] && okIcon(ICONS[LAST_ICON[lastId]]) ? LAST_ICON[lastId] : FALLBACK_LAST_ICON;

  const splits = SPLITS.map((p, i) => {
    const segs = segsBySplit[i], ok = segs.length > 0;
    return {
      name: p.name,
      icon: p.icon || postIcon,
      segs,
      start: ok ? segs[0][0] : null,
      end: ok ? segs[segs.length - 1][1] : null,
      dur: ok ? segs.reduce((a, g) => a + g[1] - g[0], 0) : null,
    };
  });
  findSubSplits(run, splits, {anyEnd});
  splits[3].mid = findMidgame(run, splits);
  return {splits, anyEnd, endAgain};
}

// The time shown for a split: Any% and Outer End show when they ended, the rest when they started
const splitMark = (p, i) => i <= 1 ? p.end : p.start;

/*
 * Sub-splits: steps inside a split, each done when its event happens, in any order (AA No Reset often changes the
 * order). Each split gets subs: [{name, item, t, dur}], where t is when the step was done (null: not done, or not inside
 * the split), dur how long it took (from the step before it that was done earlier, or from the start of the split) and
 * item the Minecraft item shown with it (SUB_ITEMS in config.js). Each step is named after what's done in
 * it, and the last one ends with the split.
 *   Any%       Nether → 1st structure (Bastion or Fortress, whichever came first) → 2nd structure → Blind (back to the
 *              Overworld with blaze rods) → Stronghold (Eye Spy) → End (from entering it to the dragon)
 *   Outer End  Elytra → End Leave
 *   Endgame    Setup (for How Did We Get Here, until Voluntary Exile) → Raid (Hero of the Village) → Monument (How Did We
 *              Get Here) → End Again
 */
function findSubSplits(run, splits, {anyEnd}) {
  const dims = run.dims.filter(d => d[2] !== "live");   // (the timer adds a pretend dimension change "now")
  const dimAfter = (t, x) => { if (t == null) return null; const d = dims.find(d => d[0] > t && d[1] === x); return d ? d[0] : null; };
  // (a split that hasn't ended yet has no start either: Any% starts at 0, Outer End when Any% ended)
  const startOf = i => splits[i].start ?? (i === 0 ? 0 : i === 1 ? anyEnd : null);
  const inside = (i, t) => t != null && startOf(i) != null && t >= startOf(i) && (splits[i].end == null || t <= splits[i].end) ? t : null;
  const sub = (i, list) => {
    const subs = splits[i].subs = list.map(([name, t]) => ({name, item: SUB_ITEMS[name] || null, t: inside(i, t), dur: null}));
    subs.forEach((x, j) => { if (x.t != null) x.dur = x.t - Math.max(startOf(i), ...subs.slice(0, j).map(y => y.t).filter(t => t != null && t <= x.t)); });
  };
  const bastion = advTime(run, "nether/find_bastion"), fortress = advTime(run, "nether/find_fortress");
  const firstFortress = fortress != null && (bastion == null || fortress < bastion);
  sub(0, [
    ["Nether", dimAfter(0, "n")],
    [firstFortress ? "Fortress" : "Bastion", firstFortress ? fortress : bastion],
    [firstFortress ? "Bastion" : "Fortress", firstFortress ? bastion : fortress],
    ["Blind", dimAfter(advTime(run, "nether/obtain_blaze_rod"), "o")],
    ["Stronghold", advTime(run, "story/follow_ender_eye")],
    ["End", anyEnd],
  ]);
  // (leaving the End for real, not the timer's pretend "now")
  const loot = advTime(run, "end/elytra") ?? advTime(run, "end/find_end_city"), left = loot == null ? null : dims.find(d => d[0] > loot && d[1] !== "e");
  sub(1, [["Elytra", advTime(run, "end/elytra")], ["End Leave", left ? left[0] : null]]);
  sub(5, [
    ["Setup", advTime(run, "adventure/voluntary_exile")],
    ["Raid", advTime(run, "adventure/hero_of_the_village")],
    ["Monument", advTime(run, "nether/all_effects")],
    ["End Again", advTime(run, "end/respawn_dragon")],
  ]);
}

/*
 * The Midgame checklist (MIDGAME in config.js), as the run stands at its end (or, live, now). For each entry:
 *   {key, name, item, area, split, start, end, complete, dur, since, done, have, need, missing}
 * For a split: start and end (null until then); dur, the time spent in its area between them (the split pauses while
 * the runner is somewhere else); since, when it's running now, when they came back into its area; complete, whether it
 * ended with everything done. For all: done, when everything was done; have/need, progress; missing, what's not done.
 * Also the area the runner is in now. Leaving an area only counts once they've been out of it for LEAVE_AFTER.
 */
const LEAVE_AFTER = 20000;
const nameOf = x => titleCase(String(x).replace(/_/g, " "));
function findMidgame(run, splits) {
  const st = run.st || {}, now = run.finalIgt;
  const midStart = splits[3].start ?? splits[2].end;
  const areas = st.areas || [];
  const crit = {};
  for (const e of run.events) { const k = e[2] + "|" + e[3]; if (!(k in crit)) crit[k] = e[0]; }
  const GOAL = {
    biome: x => [crit["adventure/adventuring_time|" + x], nameOf(x)],
    bred: x => [crit["husbandry/bred_all_animals|" + x], "Breed " + nameOf(x)],
    kill: x => [crit["adventure/kill_all_mobs|" + x], "Kill " + nameOf(x)],
    food: x => [crit["husbandry/balanced_diet|" + x], "Eat " + nameOf(x)],
    adv: x => [advTime(run, x), ADV[x] || x],
    held: x => [(st.held || {})[x], nameOf(x)],
  };
  // counters: [time, how many] as it changes (for beacon blocks, the most held so far: they end up in the beacon)
  const series = k => {
    if (k === "gapple") return st.gapple != null ? [[st.gapple, 1]] : [];
    if (k === "tnt") return (st.tntHeld || []).map(([t, c]) => [t, Math.max(0, c)]);
    if (k === "beacon") { let m = 0; return (st.beacon || []).map(([t, c]) => [t, m = Math.max(m, c)]); }
    return (st[k] || []).slice().sort((a, b) => a - b).map((t, i) => [t, i + 1]);
  };
  const countAt = (xs, t) => { let v = 0; for (const [x, c] of xs) { if (x > t) break; v = c; } return v; };
  // the times spent in some areas: [from, to] (to: null while still there), short trips out not counted as leaving
  const visits = set => {
    const out = [];
    areas.forEach(([x, v], i) => {
      const inside = set.includes(v), last = out[out.length - 1];
      if (inside && (!last || last[1] != null)) { if (last && x - last[1] < LEAVE_AFTER) last[1] = null; else out.push([x, null]); }
      else if (!inside && last && last[1] == null) last[1] = x;
    });
    const last = out[out.length - 1];
    if (last && last[1] != null && now - last[1] < LEAVE_AFTER) last[1] = null;   // (live: only just left)
    return out;
  };
  const out = MIDGAME.map(m => {
    const goals = m.goals === "cats"
      ? Object.keys(crit).filter(k => k.startsWith("husbandry/complete_catalogue|")).map(k => [crit[k], "Cat"])
      : (m.goals || []).map(([kind, x]) => GOAL[kind](x));
    let need = m.goals === "cats" ? REQ["husbandry/complete_catalogue"] : goals.length;
    let have = goals.filter(g => g[0] != null).length;
    let done = have >= need && need ? Math.max(...goals.map(g => g[0])) : null;
    const missing = m.goals === "cats" ? (have < need ? [`${need - have} more cats`] : []) : goals.filter(g => g[0] == null).map(g => g[1]);
    const xs = m.count ? series(m.count) : [];
    if (m.count && m.need) {
      const v = countAt(xs, now), r = xs.find(([, c]) => c >= m.need);
      have += Math.min(v, m.need); need += m.need;
      if (v < m.need) missing.push(`${m.name} ${v}/${m.need}`);
      done = r && (done != null || !goals.length) ? Math.max(r[0], done ?? 0) : null;
    } else if (m.count) { have = countAt(xs, now); need = null; done = null; }
    const e = {key: m.key, name: m.name, item: m.item, area: m.area, split: !!m.start, start: null, end: null, complete: false, dur: null, since: null, done, have, need, missing};
    if (!m.start || midStart == null) return e;
    const vs = visits(m.area).map(([a, b]) => [Math.max(a, midStart), b]).filter(([a, b]) => b == null || b > a);
    if (m.start === "enter") e.start = vs.length ? vs[0][0] : null;
    else { const ts = [...goals.map(g => g[0]), ...xs.map(x => x[0])].filter(t => t != null && t >= midStart); e.start = ts.length ? Math.min(...ts) : null; }
    if (e.start == null || (done != null && done < e.start)) { e.start = null; return e; }
    // the end: everything done; or (Mushroom Island) leaving once it is; or (Snowy) whichever comes first, leaving counting
    // once all but the Zombie Doctor is done
    const leaveAfter = t => { const v = vs.find(([a, b]) => b != null && b >= t); return v ? v[1] : null; };
    const core = goals.filter(g => !(m.optional || []).includes(g[1]));
    const coreDone = core.length && core.every(g => g[0] != null) ? Math.max(...core.map(g => g[0])) : null;
    e.end = m.end === "done" ? done
      : m.end === "leave" ? (done != null ? leaveAfter(done) : null)
      : [done, coreDone != null ? leaveAfter(coreDone) : null].filter(t => t != null).reduce((a, t) => a == null ? t : Math.min(a, t), null);
    if (e.end != null && e.end < e.start) e.end = e.start;
    e.complete = e.end != null && done != null && done <= e.end;
    // time in its area between start and end (or now)
    const to = e.end ?? now;
    e.dur = vs.reduce((a, [x, y]) => a + Math.max(0, Math.min(y ?? to, to) - Math.max(x, e.start)), 0);
    const open = vs.find(([, b]) => b == null);
    if (e.end == null && open) e.since = Math.max(open[0], e.start);
    return e;
  });
  const areaNow = areas.length ? areas[areas.length - 1][1] : null;
  return {area: areaNow, sections: out};
}

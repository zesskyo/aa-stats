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
 *   Any%       Overworld (until the Nether) → Nether (until the 1st structure) → 1st structure (Bastion or Fortress,
 *              whichever was found first; until the 2nd is found) → 2nd structure (until back in the Overworld with blaze
 *              rods) → Blind (until Eye Spy) → Stronghold (until entering the End) → End (until the dragon dies)
 *   Outer End  Elytra → End Leave
 *   Endgame    Setup (for How Did We Get Here, until Voluntary Exile) → Raid (Hero of the Village) → Monument (mining
 *              fatigue from an elder guardian) → HDWGH (How Did We Get Here) → End Again
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
  // (each one is the time spent on it: it ends when the next one starts)
  sub(0, [
    ["Overworld", dimAfter(0, "n")],
    ["Nether", firstFortress ? fortress : bastion],
    [firstFortress ? "Fortress" : "Bastion", firstFortress ? bastion : fortress],
    [firstFortress ? "Bastion" : "Fortress", dimAfter(advTime(run, "nether/obtain_blaze_rod"), "o")],
    ["Blind", advTime(run, "story/follow_ender_eye")],
    ["Stronghold", advTime(run, "story/enter_the_end")],
    ["End", anyEnd],
  ]);
  // (leaving the End for real, not the timer's pretend "now")
  const loot = advTime(run, "end/elytra") ?? advTime(run, "end/find_end_city"), left = loot == null ? null : dims.find(d => d[0] > loot && d[1] !== "e");
  sub(1, [["Elytra", advTime(run, "end/elytra")], ["End Leave", left ? left[0] : null]]);
  sub(5, [
    ["Setup", advTime(run, "adventure/voluntary_exile")],
    ["Raid", advTime(run, "adventure/hero_of_the_village")],
    ["Monument", ((run.st || {}).fatigue || []).find(t => t >= (startOf(5) ?? Infinity)) ?? null],
    ["HDWGH", advTime(run, "nether/all_effects")],
    ["End Again", advTime(run, "end/respawn_dragon")],
  ]);
}

/*
 * The Midgame checklist (MIDGAME in config.js), as the run stands at its end (or, live, now). For each entry:
 *   {key, about, name, item, area, split, why, start, end, complete, dur, since, done, have, need, parts, missing}
 * why: why it has no time in this run: "untimed" (never timed), "before" (done before Midgame), "outside" (done without
 * a visit to its area), "early" (part of it done beforehand, see notBefore), "post" (finished in Post-endgame),
 * "nodata" (an old log, with no biomes); null otherwise
 * start/end: the split's (null until then); dur: its time (see "time" in config.js); since: when it's running now and
 * counting, from when; complete: it ended with everything done; done: when everything was done; have/need: progress;
 * parts: what's left, as [name, have, need, icons of what's missing] ("Biomes", "Foods", "Breeds", "Kills", a counter, the
 * rest one by one); missing: the same as text; left: what's left one by one, as text.
 * Also the area the runner is in now, and the areas they've been in over the last NEAR (to keep showing those).
 * Leaving an area only counts once they've been out of it for LEAVE_AFTER.
 */
const LEAVE_AFTER = 10000, NEAR = 10000, GRACE = 60000;
const BIOME_AREAS = ["plains", "taiga", "jungle", "badlands", "mushroom", "crimson", "warped"];   // (areas only a biome gives)
const nameOf = x => titleCase(String(x).replace(/_/g, " "));
function findMidgame(run, splits) {
  const st = run.st || {}, now = run.finalIgt;
  const midStart = splits[3].start ?? splits[2].end, postStart = splits[6].start;
  const areas = st.areas || [];
  const crit = {};
  for (const e of run.events) { const k = e[2] + "|" + e[3]; if (!(k in crit)) crit[k] = e[0]; }
  const held = st.held || {};
  const first = ts => { ts = ts.filter(t => t != null); return ts.length ? Math.min(...ts) : null; };
  // each goal: [when it was done, its group ("Biomes", "Foods", "Breeds", "Kills") or name, its icon (goalIcon)]
  const GOAL = {
    biome: x => [crit["adventure/adventuring_time|" + x], "Biomes", goalIcon("biome", x)],
    food: xs => [first(xs.flatMap(x => [crit["husbandry/balanced_diet|" + x], held[x]])), "Foods", goalIcon("food", xs)],
    bred: x => [crit["husbandry/bred_all_animals|" + x], "Breeds", goalIcon("bred", x)],
    kill: x => [crit["adventure/kill_all_mobs|" + x], "Kills", goalIcon("kill", x)],
    adv: x => [advTime(run, x), ADV[x] || x, goalIcon("adv", x)],
    nbiome: x => [crit["nether/explore_nether|" + x], "Biomes", goalIcon("nbiome", x)],
  };
  // counters: [time, how many] as it changes (beacon blocks and netherite: the most held so far, as they get used up)
  const series = k => {
    if (k === "gapple") return st.gapple != null ? [[st.gapple, 1]] : [];
    if (k === "tnt") return (st.tntHeld || []).map(([t, c]) => [t, Math.max(0, c)]);
    if (k === "beacon" || k === "netherite") return st[k] || [];
    if (k === "ws") return (st.ws || []).filter(t => t > (splits[0].end ?? 0)).map((t, i) => [t, i + 1]);   // (not Any%'s)
    return (st[k] || []).slice().sort((a, b) => a - b).map((t, i) => [t, i + 1]);
  };
  const countAt = (xs, t) => { let v = 0; for (const [x, c] of xs) { if (x > t) break; v = c; } return v; };
  // the times spent in some areas: [from, to] (to: null while still there), short trips out not counted as leaving
  const visits = set => {
    const out = [];
    for (const [x, v] of areas) {
      const inside = set.includes(v), last = out[out.length - 1];
      if (inside && (!last || last[1] != null)) { if (last && x - last[1] < LEAVE_AFTER) last[1] = null; else out.push([x, null]); }
      else if (!inside && last && last[1] == null) last[1] = x;
    }
    const last = out[out.length - 1];
    if (last && last[1] != null && now - last[1] < LEAVE_AFTER) last[1] = null;   // (live: only just left)
    return out;
  };
  const sum = (segs, to) => segs.reduce((a, [x, y]) => a + Math.max(0, Math.min(y ?? to, to) - x), 0);
  const out = MIDGAME.map(m => {
    const cats = (m.goals || []).some(g => g[0] === "cats");
    const goals = (m.goals || []).filter(g => g[0] !== "cats").map(([kind, x]) => [...GOAL[kind](x), kind, x]);
    if (cats) { const ts = Object.keys(crit).filter(k => k.startsWith("husbandry/complete_catalogue|")).map(k => crit[k]).sort((a, b) => a - b);
      const need = REQ["husbandry/complete_catalogue"]; for (let i = 0; i < need; i++) goals.push([ts[i] ?? null, "Cats", "item:cod"]); }
    const xs = m.count ? series(m.count) : [];
    if (m.count && m.need == null)   // (a counter: just how many)
      return {key: m.key, name: m.name, item: m.item, area: m.area, split: false, start: null, end: null, complete: false, dur: null, since: null, done: null, have: countAt(xs, now), need: null, parts: [], missing: []};
    // what's left, in groups
    const groups = new Map();
    for (const [t, name, icon] of goals) { const g = groups.get(name) || {have: 0, need: 0, icons: []}; g.need++; if (t != null) g.have++; else g.icons.push(icon); groups.set(name, g); }
    // (a different target while an advancement isn't done: debris, without the lodestone)
    const target = m.needIfNot && advTime(run, m.needIfNot[0]) == null ? m.needIfNot[1] : m.need;
    let v = 0, reached = null;
    if (m.count) { v = countAt(xs, now); const r = xs.find(([, c]) => c >= target); reached = r ? r[0] : null; }
    const parts = [...(m.count ? [[m.countName || m.name, Math.min(v, target), target, [m.item.includes(":") ? m.item : "item:" + m.item]]] : []),
      ...[...groups].map(([name, g]) => [name, g.have, g.need, g.icons])].filter(p => p[1] < p[2]);
    const need = goals.length + (m.count ? target : 0), have = goals.filter(g => g[0] != null).length + (m.count ? Math.min(v, target) : 0);
    const done = have >= need ? Math.max(...goals.map(g => g[0]), reached ?? 0) : null;
    const e = {key: m.key, why: m.start ? null : "untimed", name: m.name, item: m.item, area: m.area, split: !!m.start, time: m.time || null, start: null, end: null, complete: false, dur: null, since: null, done, have, need,
      parts, missing: parts.map(([n, h, k]) => k > 1 ? `${n} ${h}/${k}` : n), left: []};
    // what's left, one by one ("Bamboo Jungle", "Breed Panda", "Cats 9/11", "Skulls 2/3")
    const cl = goals.filter(g => g[1] === "Cats"), cHave = cl.filter(g => g[0] != null).length;
    if (m.count && v < target) e.left.push(`${m.countName || m.name} ${v}/${target}`);
    if (cl.length && cHave < cl.length) e.left.push(`Cats ${cHave}/${cl.length}`);
    for (const [t, , , kind, x] of goals) if (t == null && kind) e.left.push(kind === "adv" ? ADV[x] || x : kind === "food" ? nameOf(x[0]) : kind === "bred" ? "Breed " + nameOf(x) : kind === "kill" ? "Kill " + nameOf(x) : nameOf(x));
    if (midStart == null || !m.start) return e;   // (not timed: just what's left)
    // when something was done for it (in Midgame and after)
    const progress = [...goals.map(g => g[0]), ...xs.map(x => x[0]), ...(m.activity || []).flatMap(k => series(k).map(x => x[0]))].filter(t => t != null && t >= midStart).sort((a, b) => a - b);
    // the end: everything done; or leaving once it is (Mushroom Island); or either (Snowy), leaving once all but the optional is
    const core = goals.filter(g => !(m.optional || []).includes(g[1]));
    const coreDone = core.length && core.every(g => g[0] != null) && (!m.count || reached != null) ? Math.max(...core.map(g => g[0]), reached ?? 0) : null;
    let segs;
    // (old logs have no biomes in them, only structures: nothing to time the Overworld's areas with)
    if (m.time === "area" && !m.area.some(x => NETHER.includes(x)) && !areas.some(([, v]) => BIOME_AREAS.includes(v))) { e.why = "nodata"; return e; }
    if (m.time === "area") {
      // visits to its area from Midgame on that got something done (and the one it's on now, while it lasts)
      const vs = visits(m.area).map(([a, b]) => [Math.max(a, midStart), b]).filter(([a, b]) => b == null || b > a);
      // (in the Overworld, something done just after stepping out, like an animal bred at the edge, still counts for that visit)
      const grace = m.area.some(x => NETHER.includes(x)) ? 0 : GRACE;
      segs = vs.filter(([a, b]) => b == null || progress.some(t => t >= a && t <= b + grace));
    } else if (m.time === "active") {
      // the "lead" before each thing done for it, joined where they overlap (live: one going on now, while it's within that)
      segs = [];
      for (const t of progress) { const g = segs[segs.length - 1], a = Math.max(midStart, t - m.lead); if (g && a <= g[1]) g[1] = t; else segs.push([a, t]); }
      const g = segs[segs.length - 1]; if (g && done == null && now - g[1] <= m.lead) g[1] = null;
    } else segs = [[midStart, null]];
    // (not started; or everything was done before it started, or before Midgame: no split for it in this run)
    if (!segs.length || (done != null && (done <= midStart || (done < segs[0][0] && m.start !== "mid")))) { if (done != null) e.why = done <= midStart ? "before" : "outside"; return e; }
    const start = m.start === "mid" ? midStart : segs[0][0];
    // (part of it done before it started, like stews made beforehand; or it went on into Post-endgame: no split)
    if (m.notBefore && goals.some(g => g[3] === m.notBefore && g[0] != null && g[0] < start)) { e.why = "early"; return e; }
    if (postStart != null && start >= postStart) { e.why = "post"; return e; }
    e.start = start;
    // (leaving after t: the end of the visit it was done in or before; t itself if it was done after the last one)
    const leaveAfter = t => { if (t == null) return null; const s = segs.find(([, b]) => b == null || b >= t); return s ? s[1] : t; };
    e.end = m.end === "done" ? done : m.end === "leave" ? leaveAfter(done)
      : [done, leaveAfter(coreDone)].filter(t => t != null).reduce((a, t) => a == null ? t : Math.min(a, t), null);
    if (e.end != null && e.end < e.start) e.end = e.start;
    if (postStart != null && (e.end == null || e.end > postStart)) { e.start = e.end = null; e.why = done != null ? "post" : null; return e; }
    // (Snowy: leaving with only Zombie Doctor left counts as finished)
    e.complete = e.end != null && ((done != null && done <= e.end) || (m.end === "doneOrLeave" && coreDone != null && coreDone <= e.end));
    const to = e.end ?? now;
    e.dur = sum(segs.map(([a, b]) => [Math.max(a, e.start), b == null ? null : Math.min(b, to)]).filter(([a, b]) => b == null || b >= a), to);
    const open = segs.find(([, b]) => b == null);
    if (e.end == null && open) e.since = Math.max(open[0], e.start);
    return e;
  });
  const near = [...new Set(areas.filter(([t], i) => t >= now - NEAR || i === areas.length - 1 || (areas[i + 1] && areas[i + 1][0] >= now - NEAR)).map(a => a[1]))];
  return {area: areas.length ? areas[areas.length - 1][1] : null, near, sections: out};
}

// The icon for a goal of the Midgame checklist: the stats site's own for biomes ("at:"), mobs ("mh:") and animals
// ("2x2:"), from icons/adventuring time, monsters hunted and two by two; an item otherwise ("item:", from the item atlas)
const ADV_ITEMS = {"nether/explore_nether|nether_wastes": "netherrack", "nether/explore_nether|crimson_forest": "crimson_nylium", "nether/explore_nether|warped_forest": "warped_nylium",
  "nether/explore_nether|soul_sand_valley": "soul_sand", "nether/explore_nether|basalt_deltas": "basalt","story/cure_zombie_villager": "golden_apple", "nether/return_to_sender": "fire_charge", "nether/uneasy_alliance": "ghast_tear", "nether/ride_strider": "warped_fungus_on_a_stick"};
const goalIcon = (kind, x) => kind === "biome" ? "at:" + x : kind === "kill" ? "mh:" + x : kind === "bred" ? "2x2:" + x
  : kind === "food" ? "item:" + x[0] : kind === "nbiome" ? "item:" + ADV_ITEMS["nether/explore_nether|" + x] : "item:" + (ADV_ITEMS[x] || "book");

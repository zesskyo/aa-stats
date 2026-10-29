/*
 * splits.js — works out when each split of a run starts and ends.
 *
 *   Any%          start → reaching the outer End through the gateway (the ghost file's position, or the log's biome
 *                 lines; else "Remote Getaway", or the dragon if that's missing or only came long after)
 *   Outer End     → leaving the End after getting elytra (or finding an End City)
 *   Enchanting    → last enchanting-table pickup of the first pickup session after leaving the End
 *   Midgame       → debris starts (or Endgame starts early, see below)
 *   Debris        first netherrack mined after entering the Nether for the main debris session
 *                 → back in the Overworld after the last debris of that session (or at most RULES.debrisReturnMax after
 *                 the last debris or time deep down); then any later Nether trip where more debris was mined is more
 *                 Debris, paused in between (a quick restock in the Overworld in between doesn't pause it)
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
  // (getting to the outer End: from the ghost file, or the log's biome lines (st.outerEnd); else Remote Getaway, unless
  // that's long after the dragon (then it was only given later, a pearl through the gateway doesn't give it): the dragon)
  const kd = advTime(run, "end/kill_dragon"), rg = advTime(run, "end/enter_end_gateway");
  // (on the timer, while the run's going: not at the dragon, Any% runs until they're through the gateway)
  const live = (run.dims[run.dims.length - 1] || [])[2] === "live";
  const anyEnd = st.outerEnd ?? (rg != null && (kd == null || rg - kd <= RULES.gatewayAfterDragon) ? rg : live ? null : kd ?? rg);

  // Outer End: leave the End after the elytra
  const lootDone = advTime(run, "end/elytra") ?? advTime(run, "end/find_end_city");
  let outerEnd = null;
  if (lootDone != null) { const i = run.dims.findIndex(x => x[0] > lootDone && x[1] !== "e"); if (i >= 0) outerEnd = run.dims[i][0]; }

  // Enchanting: first session of enchanting-table pickups after leaving the End
  const pickups = (st.ench || []).filter(t => t > (outerEnd ?? anyEnd ?? 0));
  const session = pickups.length ? clusters(pickups, RULES.enchantPickupGap)[0] : null;
  // (it ends when they leave the table, from the ghost file: st.enchLeave; still there, on the timer: not done yet)
  const pickedUp = session ? session[session.length - 1] : null, leave = pickedUp != null ? (st.enchLeave || []).find(x => x[0] === pickedUp) : null;
  // (on the timer, with the ghost file read every few seconds: not done until it's seen them leave)
  const enchDone = leave && leave[1] != null ? leave[1] : live && st.enchLeave ? null : pickedUp;

  // Debris: the first burst of debris mining that's a real one: 3 or more debris, or on a Nether trip spent a minute or
  // more deep down (below y 25, where debris is mined: st.deep, from the ghost file), even if it got few (or none);
  // with neither, the biggest burst
  const deep = st.deep || [];
  const deepIn = (a, b) => deep.filter(t => t >= a && t <= b);
  const tripOf = t => { const i = run.dims.findLastIndex(x => x[0] <= t); return i >= 0 && run.dims[i][1] === "n" ? [run.dims[i][0], i + 1 < run.dims.length ? run.dims[i + 1][0] : run.finalIgt] : null; };
  // (only after Enchanting: debris found before, digging around in Any% say, isn't the Debris split; on the timer,
  // nothing's Debris until Enchanting's done)
  const after = enchDone ?? Infinity;
  const bursts = (st.debris || []).length ? clusters(st.debris.filter(t => t >= after), RULES.debrisSessionGap) : [];
  const deepTrip = run.dims.map((x, i) => x[1] === "n" && x[0] >= after ? [x[0], i + 1 < run.dims.length ? run.dims[i + 1][0] : run.finalIgt] : null)
    .find(tr => tr && deepIn(tr[0], tr[1]).length * 5000 >= RULES.debrisDeepMin);
  let debrisSession = bursts.find(b => b.length >= 3) || null;
  if (deepTrip && (!debrisSession || deepTrip[0] < debrisSession[0])) debrisSession = (st.debris || []).filter(t => t >= deepTrip[0] && t <= deepTrip[1]).concat(deepIn(deepTrip[0], deepTrip[1])).sort((a, b) => a - b);
  const debrisAfter = (st.debris || []).filter(t => t >= after);
  if (!debrisSession && debrisAfter.length) debrisSession = clusters(debrisAfter, RULES.debrisSessionGap).sort((a, b) => b.length - a.length)[0];
  let debrisStart = null, debrisEnd = null;
  if (debrisSession && debrisSession.length) {
    const d0 = debrisSession[0];
    const netherIn = run.dims.filter(x => x[0] <= d0 && x[1] === "n").pop();
    const nIn = netherIn && (enchDone == null || netherIn[0] >= enchDone) ? netherIn[0] : null;
    // (it starts when they go down to mine, or at the first netherrack mined on the trip)
    const tr = tripOf(d0), firstDeep = tr ? deepIn(tr[0], tr[1])[0] : null;
    const firstRack = nIn != null ? (st.rack || []).find(p => p[0] >= nIn && p[0] <= d0) : null;
    debrisStart = firstDeep != null && firstDeep <= d0 ? firstDeep : firstRack ? firstRack[0] : nIn != null ? nIn : d0;
    // (it ends back out of the Nether; a run that finishes there, when it finishes)
    debrisEnd = firstDimAfter(run, debrisSession[debrisSession.length - 1], x => x !== "n") ?? run.finalIgt;
  }
  // more debris later on (more netherite needed): each Nether trip after that where debris was mined is more Debris, with
  // what's between paused (not just debris taken out of a shulker box or chest: that's smelting it, for the netherite)
  const moreDebris = [];
  if (debrisEnd != null) run.dims.forEach((x, i) => {
    if (x[1] !== "n" || x[0] < debrisEnd) return;
    const out = i + 1 < run.dims.length ? run.dims[i + 1][0] : run.finalIgt;
    // (or a minute spent deep down mining, before any debris turns up)
    if ((st.debris || []).some(t => t >= x[0] && t <= out) || deepIn(x[0], out).length * 5000 >= RULES.debrisDeepMin) moreDebris.push([x[0], out]);
  });
  // (a quick stop in the Overworld between trips, to restock beds or TNT, is still Debris: one stretch, not several)
  // (and each trip ends at most a few minutes after the last debris, or the last time deep down: the way back to the
  // portal; staying on in the Nether after that, smelting it or getting gold for the netherite, isn't Debris)
  const tripEnd = ([a, b]) => {
    const last = Math.max(-Infinity, ...(st.debris || []).filter(t => t >= a && t <= b), ...deepIn(a, b));
    return [a, last > -Infinity ? Math.min(b, Math.max(a, last) + RULES.debrisReturnMax) : b];
  };
  const debrisSegs = (debrisStart != null && debrisEnd != null ? [[debrisStart, debrisEnd], ...moreDebris] : []).map(tripEnd)
    .reduce((out, g) => { const last = out[out.length - 1]; if (last && g[0] - last[1] <= RULES.debrisRestockGap) last[1] = Math.max(last[1], g[1]); else out.push([...g]); return out; }, []);

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
  // (not while the run is still going, on the timer (live): it would sit in Endgame, then jump out after a few minutes)
  // (its own time: Debris during it doesn't count)
  const postOwn = postStart == null ? 0 : run.finalIgt - postStart - debrisSegs.reduce((a, [x, y]) => a + Math.max(0, Math.min(y, run.finalIgt) - Math.max(x, postStart)), 0);
  if (postStart != null && !live && postOwn < RULES.postEndgameMin) postStart = null;

  // Early Endgame (campfire placed before debris, or no Debris split). Only a campfire that's used for honey soon after
  // counts (Bee Our Guest within RULES.campfireToHoney): hives set up long before, e.g. while passing 0,0 in Midgame,
  // don't start Endgame; then it starts when the honey is collected.
  const honey = advTime(run, "husbandry/safely_harvest_honey");
  const camps = (st.campfire || []).filter(t => t > (enchDone ?? Infinity));
  let campT = honey == null ? camps[0] : camps.find(t => t <= honey && honey - t <= RULES.campfireToHoney);
  if (campT == null && honey != null && camps.some(t => t <= honey)) campT = honey;
  // (and it starts when they got to where the campfire went, back at their base, setting up: from the ghost file, see
  // baseArrivals; not before Enchanting's end)
  const arrived = campT != null ? (st.campArrive || []).find(x => x[0] === campT) : null;
  if (arrived) campT = Math.max(arrived[1], enchDone ?? -Infinity);
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
  // (Post-endgame's icon: the last advancement's: LAST_ICON's, or the game's, "adv:<id>", see build.mjs)
  const postIcon = LAST_ICON[lastId] && okIcon(ICONS[LAST_ICON[lastId]]) ? LAST_ICON[lastId] : okIcon(ICONS["adv:" + lastId]) ? "adv:" + lastId : FALLBACK_LAST_ICON;

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
  splits[3].mid = findMidgame(run, splits);

  // The main splits (TOP in config.js): one stretch each, from where the one before ends. (Earlygame ends with
  // Enchanting, or, in a run without it, where the End was left; live, it runs until then)
  const F = run.finalIgt, earlyDone = enchDone ?? (live ? null : outerEnd ?? anyEnd);
  // (Endgame starts with Debris when Debris comes after the last of Midgame: done on the way back to base, it's part of
  // Endgame; done in the middle of Midgame, with more of it after, it stays there)
  const midLast = segsBySplit[3].length ? segsBySplit[3][segsBySplit[3].length - 1][1] : null, debStart = segsBySplit[4].length ? segsBySplit[4][0][0] : null;
  const egStart = segsBySplit[5].length ? segsBySplit[5][0][0] : null;
  const ends = [earlyDone, debStart != null && (midLast == null || debStart >= midLast) ? Math.min(debStart, egStart ?? Infinity) : egStart, postStart];
  const top = TOP.map((p, i) => {
    const a = i === 0 ? 0 : ends[i - 1];
    if (a == null) return {name: p.name, icon: p.icon || postIcon, segs: [], start: null, end: null, dur: null};
    const b = ends.slice(i).find(t => t != null && t >= a) ?? F;
    const segs = b > a ? [[a, b]] : [];
    return {name: p.name, icon: p.icon || postIcon, segs, start: segs.length ? a : null, end: segs.length ? b : null, dur: segs.length ? b - a : null};
  });
  top[1].mid = splits[3].mid;
  findSubSplits(run, splits, {anyEnd, endgameStart: top[2].start, now: F});

  // Debris in the checklist: the Debris part's time, under the main split it's (last) done in
  const deb = splits[3].mid && splits[3].mid.sections.find(x => x.key === "debris"), dp = splits[4];
  if (deb && dp.segs.length) {
    const g = dp.segs[dp.segs.length - 1], going = live && g[1] >= F;
    Object.assign(deb, {split: true, why: null, start: dp.start, end: going ? null : dp.end, dur: dp.dur, complete: !going, since: going ? g[0] : null, last: g[1],
      in: Math.max(1, top.findLastIndex(t => t.segs.length && g[0] >= t.start && g[0] <= t.end))});
  }
  return {splits, top, anyEnd, endAgain};
}

// The time shown for a split: Any% and Outer End show when they ended, the rest when they started
const splitMark = (p, i) => i <= 1 ? p.end : p.start;
// For a main split (TOP): when it ended, as LiveSplit shows a split's time
const topMark = p => p.end;

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
 *   Endgame    Setup (for How Did We Get Here, until Voluntary Exile) → Raid (until Bad Omen the second time, from another
 *              captain for How Did We Get Here, with every raid mob killed for Monsters Hunted by then; else when the last
 *              of them is; logs without the effects: Hero of the Village) → Monument (mining
 *              fatigue from an elder guardian) → HDWGH (How Did We Get Here) → End Again; and Debris, when it's part of
 *              Endgame (first in the list: it's usually done while setting up). Each of these is the Endgame time up to
 *              it since the one before, without Debris's; Debris's is its own.
 */
function findSubSplits(run, splits, {anyEnd, endgameStart, now}) {
  const dims = run.dims.filter(d => d[2] !== "live");   // (the timer adds a pretend dimension change "now")
  const dimAfter = (t, x) => { if (t == null) return null; const d = dims.find(d => d[0] > t && d[1] === x); return d ? d[0] : null; };
  // (a split that hasn't ended yet has no start either: Any% starts at 0, Outer End when Any% ended)
  const startOf = i => splits[i].start ?? (i === 0 ? 0 : i === 1 ? anyEnd : null);
  const inside = (i, t) => t != null && startOf(i) != null && t >= startOf(i) && (splits[i].end == null || t <= splits[i].end) ? t : null;
  const sub = (i, list) => {
    const subs = splits[i].subs = list.map(([name, t]) => ({name, item: SUB_ITEMS[name] || null, t: inside(i, t), dur: null}));
    subs.forEach((x, j) => { if (x.t != null) x.dur = x.t - Math.max(startOf(i), ...subs.slice(0, j).map(y => y.t).filter(t => t != null && t <= x.t)); });
  };
  // (a structure counts once they've spent structStay in it, on a visit with no more than structGap out of it at a time:
  // passing through a corner of a bastion on the way to a fortress doesn't make the bastion the first. It counts from
  // when it was found, if that was shortly before (structFound), else from when that visit started. Without that in the
  // log, when it was found)
  const found = (area, id) => {
    const A = (run.st || {}).areas || [], now = run.finalIgt, adv = advTime(run, id);
    if (!A.some(x => x[1] === "bastion" || x[1] === "fortress")) return adv;
    const at = v => adv != null && adv <= v && v - adv <= RULES.structFound ? adv : v;
    let start = null, inside = 0, lastOut = null;
    for (let k = 0; k < A.length; k++) {
      if (A[k][1] !== area) continue;
      const a = A[k][0], b = k + 1 < A.length ? A[k + 1][0] : now;
      if (start == null || a - lastOut > RULES.structGap) { start = a; inside = 0; }
      inside += b - a; lastOut = b;
      if (inside >= RULES.structStay) return at(start);
    }
    return null;
  };
  const bastion = found("bastion", "nether/find_bastion"), fortress = found("fortress", "nether/find_fortress");
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
  const exile = advTime(run, "adventure/voluntary_exile"), hero = advTime(run, "adventure/hero_of_the_village");
  const omen2 = ((run.st || {}).omen || []).filter(t => t >= (exile ?? Infinity) - 5000)[1] ?? null;
  const killedAt = m => { const e = run.events.find(x => x[2] === "adventure/kill_all_mobs" && x[3] === m); return e ? e[0] : null; };
  const mobs = RAID_MOBS.map(killedAt), allMobs = mobs.every(t => t != null) ? Math.max(...mobs) : null;
  sub(5, [
    ["Setup", exile],
    ["Raid", omen2 != null ? (allMobs != null ? Math.max(omen2, allMobs) : null) : hero],
    ["Monument", ((run.st || {}).fatigue || []).find(t => t >= (startOf(5) ?? Infinity)) ?? null],
    ["HDWGH", advTime(run, "nether/all_effects")],
    ["End Again", advTime(run, "end/respawn_dragon")],
  ]);
  // Debris, in Endgame: its own time; the rest, the Endgame time between them without Debris's
  const subs = splits[5].subs, E0 = endgameStart, dp = splits[4];
  const dsegs = E0 == null ? [] : (dp.segs || []).filter(g => g[0] >= E0);
  const deb = {name: "Debris", item: SUB_ITEMS.Debris, t: null, dur: null};
  const overlap = (a, b) => dsegs.reduce((x, [s, e]) => x + Math.max(0, Math.min(b, e ?? now) - Math.max(a, s)), 0);
  const going = dsegs.length && dsegs[dsegs.length - 1][1] >= now && (run.dims[run.dims.length - 1] || [])[2] === "live";
  if (dsegs.length && !going) { deb.t = dsegs[dsegs.length - 1][1]; deb.dur = overlap(E0, deb.t); }
  if (E0 != null) for (const x of subs) if (x.t != null) {
    const prev = Math.max(E0, ...subs.filter(y => y !== x && y.t != null && y.t <= x.t).map(y => y.t));
    x.dur = x.t - prev - overlap(prev, x.t);
  }
  subs.unshift(deb);
}

/*
 * The Midgame checklist (MIDGAME in config.js), as the run stands at its end (or, live, now). For each entry:
 *   {key, about, name, item, area, split, why, start, end, complete, dur, since, done, have, need, parts, missing}
 * why: why it has no time in this run: "untimed" (never timed), "before" (done before Midgame), "outside" (done without
 * a visit to its area), "debris" / "endgame" (done then: those aren't timed), "early" (part of it done beforehand, see notBefore),
 * "nodata" (an old log, with no biomes); null otherwise. extra: more to do alongside it (see extra in config.js). last: when something was last done for it. info: rates to show with it (see info in config.js)
 * start/end: the split's (null until then); dur: its time (see "time" in config.js); since: when it's running now and
 * counting, from when; complete: it ended with everything done; done: when everything was done; have/need: progress;
 * parts: what's left, as [name, have, need, icons of what's missing] ("Biomes", "Foods", "Breeds", "Kills", a counter, the
 * rest one by one); missing: the same as text; left: what's left one by one, as text.
 * Also the area the runner is in now, and the areas they've been in over the last NEAR (to keep showing those).
 * Leaving an area only counts once they've been out of it for LEAVE_AFTER.
 */
const LEAVE_AFTER = 10000, NEAR = 10000, GRACE = 60000, MIN_STAY = 30000, VILLAGE_IN = 5000;
const BIOME_AREAS = ["plains", "taiga", "jungle", "badlands", "mushroom", "crimson", "warped"];   // (areas only a biome gives)
const nameOf = x => titleCase(String(x).replace(/_/g, " "));
function findMidgame(run, splits) {
  const st = run.st || {}, now = run.finalIgt;
  const midStart = splits[3].start ?? splits[2].end;
  // The checklist is timed in Midgame and in Post-endgame (Midgame's leftovers, done later): not in Debris and Endgame.
  // W: those times, [from, to] (to: null while going on now)
  let W = [...(splits[3].segs || []), ...(splits[6].segs || [])].filter(([a, b]) => b > a).map(([a, b]) => [a, b >= now ? null : b]).sort((x, y) => x[0] - y[0]);
  if (!W.length && midStart != null) W = [[midStart, null]];
  const inW = segs => { const out = [];
    for (const [a, b] of segs) for (const [c, d] of W) { const lo = Math.max(a, c), hi = Math.min(b ?? Infinity, d ?? Infinity); if (hi > lo || (hi === Infinity && lo < Infinity)) out.push([lo, hi === Infinity ? null : hi]); }
    return out.sort((x, y) => x[0] - y[0]); };
  // (a village only counts once they've been in it for VILLAGE_IN: villagers and cats wandering in and out of its
  // bounds make the game say they're in and out of it)
  const areas = [];
  (st.areas || []).forEach(([t, v], k, A) => {
    const to = k + 1 < A.length ? A[k + 1][0] : now;
    if (v === "village" && to - t < VILLAGE_IN) return;
    const l = areas[areas.length - 1];
    if (l && l[1] === v) return;
    if (v === "village") areas.push([t + VILLAGE_IN, v]); else areas.push([t, v]);
  });
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
    adv: x => [advTime(run, x), SHORT_ADV[x] || ADV[x] || x, goalIcon("adv", x)],
    nbiome: x => [crit["nether/explore_nether|" + x], "Biomes", goalIcon("nbiome", x)],
    // the mushrooms the stews need (Balanced Diet's mushroom and suspicious stews, a red and a brown one each), so it's
    // done once they have them, made into stews there or not: one held for each stew not made (or eaten) yet
    mush: x => {
      const got = st[x === "red_mushroom" ? "redMush" : "brownMush"] || [], n = STEWS.length;
      const made = STEWS.map(s => first([crit["husbandry/balanced_diet|" + s], held[s]])).filter(t => t != null).sort((a, b) => a - b);
      const ts = [];
      for (let k = 0; k <= made.length; k++) { const a = k === n ? 0 : got[n - k - 1], b = k === 0 ? 0 : made[k - 1]; if (a != null) ts.push(Math.max(a, b)); }
      return [first(ts), "Mushrooms", goalIcon("mush", x)];
    },
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
    // (each cat, with the stats site's icon of it: icons/acc/)
    if (cats) for (const v of CATS) goals.push([crit["husbandry/complete_catalogue|textures/entity/cat/" + v + ".png"] ?? null, "Cats", "acc:" + (CAT_FILE[v] || v)]);
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
      parts, missing: parts.map(([n, h, k]) => k > 1 ? `${n} ${h}/${k}` : n), left: [], biomesLeft: goals.filter(g => g[0] == null && g[3] === "biome").map(g => g[4])};
    // what's left, one by one ("Bamboo Jungle", "Breed Panda", "Cats 9/11", "Skulls 2/3")
    const cl = goals.filter(g => g[1] === "Cats"), cHave = cl.filter(g => g[0] != null).length;
    if (m.count && v < target) e.left.push(`${m.countName || m.name} ${v}/${target}`);
    if (cl.length && cHave < cl.length) e.left.push(`Cats ${cHave}/${cl.length}`);
    for (const [t, , , kind, x] of goals) if (t == null && kind) e.left.push(kind === "adv" ? SHORT_ADV[x] || ADV[x] || x : kind === "food" ? nameOf(x[0]) : kind === "mush" ? nameOf(x) + "s" : kind === "bred" ? "Breed " + nameOf(x) : kind === "kill" ? "Kill " + nameOf(x) : nameOf(x));
    // (more to do alongside it, not timed: [name, have, need, icons of what's left], until its advancement is done)
    if (m.extra && advTime(run, m.extra.until) == null) {
      const xg = m.extra.goals.map(([kind, x]) => GOAL[kind](x));
      e.extra = [m.extra.name, xg.filter(g => g[0] != null).length, xg.length, xg.filter(g => g[0] == null).map(g => g[2])];
    }
    // (rates the timer shows with it, as [name, icon, value]: since Midgame started)
    const since = arr => (arr || []).filter(t => t >= (midStart ?? Infinity)).length;
    if (m.info === "tnt") { const tnt = since(st.tnt), deb = since(st.debrisTnt || st.debris); e.info = [[deb ? "TNT Per Debris" : "TNT Used", "item:tnt", deb ? (tnt / deb).toFixed(1) : String(tnt)]];
      // (netherrack mined since then: from the mined stat's total, which st.rack follows)
      const rack = st.rack || [], at = t => { let v = 0; for (const [x, n] of rack) { if (x > t) break; v = n; } return v; };
      if (midStart != null && rack.length) e.info.push(["Netherrack", "item:netherrack", (at(now) - at(midStart)).toLocaleString("en-US")]); }
    if (m.info === "kills") { const k = series("ws").length, n = series("skulls").length; e.info = [["Skull Rates", "mh:wither_skeleton", `${n}/${k}`]]; }
    if (midStart == null || !m.start) return e;   // (not timed: just what's left)
    if (m.time === "farm") {
      // skulls: the Skulls split's own time (live, until now while the 3rd isn't got)
      const sk = findSkullSplit(run, series("ws").map(x => x[0]), series(m.count).map(x => x[0]), done == null ? now : null);
      if (!sk || !sk.segs.length || (done != null && sk.end <= midStart)) { if (done != null) e.why = "before"; return e; }
      e.start = sk.start; e.end = done != null ? sk.end : null; e.complete = done != null; e.dur = sk.dur;
      const g = sk.segs[sk.segs.length - 1]; e.last = g[1];
      // (still going: up to now, like the other splits, so the timer counts on from it)
      if (done == null && now - g[1] <= RULES.skullIdleGap) { e.since = g[1]; e.dur += now - g[1]; }
      return e;
    }
    // when something was done for it (in Midgame and after)
    const progress = [...goals.map(g => g[0]), ...xs.map(x => x[0]), ...(m.activity || []).flatMap(k => series(k).map(x => x[0]))].filter(t => t != null && t >= midStart).sort((a, b) => a - b);
    e.last = progress.length ? progress[progress.length - 1] : null;
    // the end: everything done; or leaving once it is (Mushroom Island); or either (Snowy), leaving once all but the optional is
    // (optional: a group of goals, "Zombie Doctor", or one goal, "zombified_piglin")
    const core = goals.filter(g => !(m.optional || []).includes(g[1]) && !(m.optional || []).includes(g[4]));
    const coreDone = core.length && core.every(g => g[0] != null) && (!m.count || reached != null) ? Math.max(...core.map(g => g[0]), reached ?? 0) : null;
    let segs;
    // (old logs have no biomes in them, only structures: nothing to time the Overworld's areas with)
    if (m.time === "area" && !m.area.some(x => NETHER.includes(x)) && !areas.some(([, v]) => BIOME_AREAS.includes(v))) { e.why = "nodata"; return e; }
    if (m.time === "area") {
      // visits to its area from Midgame on that got something done (and the one it's on now, while it lasts)
      const vs = visits(m.area).map(([a, b]) => [Math.max(a, midStart), b]).filter(([a, b]) => b == null || b > a);
      // (in the Overworld, something done just after stepping out, like an animal bred at the edge, still counts for that visit)
      const grace = m.area.some(x => NETHER.includes(x)) ? 0 : GRACE;
      // (and in the Overworld, a visit of MIN_STAY or more: looking around for what's needed counts, flying across doesn't)
      segs = vs.filter(([a, b]) => b == null || progress.some(t => t >= a && t <= b + grace) || (grace && b - a >= MIN_STAY));
      // (finished out of its area, like a ghast brought to the Overworld: from leaving it until then, if not too long;
      // the visit it was hooked on counts by the fishing rod's casts)
      if (m.finishOutside && done != null) {
        const lastOut = vs.filter(([, b]) => b != null && b <= done).pop();
        if (lastOut && !vs.some(([a, b]) => done >= a && (b == null || done <= b)) && done - lastOut[1] <= m.finishOutside) {
          segs.push([lastOut[1], done]); segs.sort((x, y) => x[0] - y[0]);
        }
      }
    } else if (m.time === "active") {
      // the "lead" before each thing done for it, joined where they overlap (live: one going on now, while it's within that)
      // (what's done in an area another split is timing, like cows bred on a mushroom island, counts as done but adds no
      // time: that's already in the other split; notTimedIn in config.js)
      const areaAt = t => { let v = null; for (const [x, a] of areas) { if (x > t) break; v = a; } return v; };
      segs = [];
      for (const t of progress.filter(t => !(m.notTimedIn || []).includes(areaAt(t)))) { const g = segs[segs.length - 1], a = Math.max(midStart, t - m.lead); if (g && a <= g[1]) g[1] = t; else segs.push([a, t]); }
      const g = segs[segs.length - 1]; if (g && done == null && now - g[1] <= m.lead) g[1] = null;
    } else segs = [[midStart, null]];
    segs = inW(segs);
    // (not started; or everything was done before it started, or before Midgame: no split for it in this run)
    if (!segs.length || (done != null && (done <= midStart || (done < segs[0][0] && m.start !== "mid")))) {
      // (why: before Midgame; in Debris or Endgame, which aren't timed; or without going to its area)
      const inSplit = (i, t) => (splits[i].segs || []).some(([a, b]) => t >= a && t <= b);
      if (done != null) e.why = done <= midStart ? "before" : inSplit(4, done) ? "debris" : inSplit(5, done) ? "endgame" : "outside";
      return e;
    }
    const start = m.start === "mid" ? midStart : segs[0][0];
    // (part of it done before it started, like stews made beforehand: no split)
    // (all of that kind already done when it started: e.g. every mushroom the stews need got beforehand)
    const before = m.notBefore ? goals.filter(g => g[3] === m.notBefore) : [];
    if (before.length && before.every(g => g[0] != null && g[0] < start)) { e.why = "early"; return e; }
    e.start = start;
    // (leaving after t: the end of the visit it was done in or before; t itself if it was done after the last one)
    const leaveAfter = t => { if (t == null) return null; const s = segs.find(([, b]) => b == null || b >= t); return s ? s[1] : t; };
    // (leaving with only the optional left, while it's under way (Snowy: a cure started before leaving, see waitOnLeave):
    // not the end; the optional's done, or, if it isn't within waitOnLeave.max, leaving)
    const left = leaveAfter(coreDone), w = m.waitOnLeave;
    const begun = w && left != null ? (st[w.start] || []).filter(t => t >= start && t <= left).pop() : null;
    const waiting = begun != null && (done != null ? done >= left && done - begun <= w.max : now - begun <= w.max);
    e.end = m.end === "done" ? (m.optional ? coreDone : done) : m.end === "leave" ? leaveAfter(done)
      : waiting ? done : [done, left].filter(t => t != null).reduce((a, t) => a == null ? t : Math.min(a, t), null);
    if (e.end != null && e.end < e.start) e.end = e.start;
    // (Snowy: leaving with only Zombie Doctor left counts as finished)
    // (and Nether Misc with only the zombified piglin left)
    e.complete = e.end != null && ((done != null && done <= e.end) || ((m.end === "doneOrLeave" || m.optional) && coreDone != null && coreDone <= e.end));
    const to = e.end ?? now;
    e.dur = sum(segs.map(([a, b]) => [Math.max(a, e.start), b == null ? null : Math.min(b, to)]).filter(([a, b]) => b == null || b >= a), to);
    // (what's optional, done after it ended: the time before it, added; nothing else is timed for it by then)
    if (m.end === "done" && m.optional && m.time === "active" && e.end != null) e.dur += segs.reduce((a, [x, y]) => a + (y != null && y > e.end ? y - Math.max(x, e.end) : 0), 0);
    const open = segs.find(([, b]) => b == null);
    if (e.end == null && open) e.since = Math.max(open[0], e.start);
    return e;
  });
  // (on the timer: shown once what it still needs is in few enough of the rare biomes, rareLeft in config.js; shown
  // wherever they are once there's little left, pinLeft)
  const rareOf = b => RARE_KEYS.filter(k => MIDGAME.find(x => x.key === k).goals.some(g => g[0] === "biome" && g[1] === b));
  for (const e of out) {
    const m = MIDGAME.find(x => x.key === e.key), pinLeft = m.pinLeft === undefined ? PIN_LEFT : m.pinLeft;
    if (m.rareLeft != null) e.hidden = new Set(e.biomesLeft.flatMap(rareOf)).size > m.rareLeft;
    if (m.pin) e.pin = true;
    // (not one that only ever needs that few, like the 3 skulls: it'd be everywhere from the start)
    if (pinLeft != null && e.need > pinLeft && e.have < e.need && e.need - e.have <= pinLeft) e.pin = true;
  }
  const near = [...new Set(areas.filter(([t], i) => t >= now - NEAR || i === areas.length - 1 || (areas[i + 1] && areas[i + 1][0] >= now - NEAR)).map(a => a[1]))];
  // (when they were last underwater: the timer puts the shells first then)
  const uw = st.underwater || [];
  return {area: areas.length ? areas[areas.length - 1][1] : null, near, sections: out, underwater: uw.length ? uw[uw.length - 1] : null};
}

// The icon for a goal of the Midgame checklist: the stats site's own for biomes ("at:"), mobs ("mh:") and animals
// ("2x2:"), from icons/adventuring time, monsters hunted and two by two; an item otherwise ("item:", from the item atlas)
// A Complete Catalogue's cats (as its criteria name them), and their icons' files where named differently
const CATS = ["tabby", "black", "red", "siamese", "british_shorthair", "calico", "persian", "ragdoll", "white", "jellie", "all_black"];
const CAT_FILE = {black: "tuxedo", all_black: "black", british_shorthair: "british"};
// (shorter names for advancements in the checklist, where the long ones don't fit)
const SHORT_ADV = {"nether/return_to_sender": "Sender"};
const ADV_ITEMS = {"adventure/bullseye": "target", "story/upgrade_tools": "stone_pickaxe", "husbandry/fishy_business": "fishing_rod", "adventure/trade": "emerald",
  "adventure/sniper_duel": "arrow", "adventure/arbalistic": "crossbow", "adventure/summon_iron_golem": "carved_pumpkin","nether/explore_nether|nether_wastes": "netherrack", "nether/explore_nether|crimson_forest": "crimson_nylium", "nether/explore_nether|warped_forest": "warped_nylium",
  "nether/explore_nether|soul_sand_valley": "soul_sand", "nether/explore_nether|basalt_deltas": "basalt","story/cure_zombie_villager": "golden_apple", "nether/return_to_sender": "fire_charge", "nether/uneasy_alliance": "ghast_tear", "nether/ride_strider": "warped_fungus_on_a_stick"};
const STEWS = ["mushroom_stew", "suspicious_stew"];
const goalIcon = (kind, x) => kind === "biome" ? "at:" + x : kind === "kill" ? "mh:" + x : kind === "bred" ? "2x2:" + x : kind === "mush" ? "item:" + x
  : kind === "food" ? "item:" + x[0] : kind === "nbiome" ? "item:" + ADV_ITEMS["nether/explore_nether|" + x] : "item:" + (ADV_ITEMS[x] || "book");

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
  return {splits, anyEnd, endAgain};
}

// The time shown for a split: Any% and Outer End show when they ended, the rest when they started
const splitMark = (p, i) => i <= 1 ? p.end : p.start;

/*
 * Sub-splits: steps inside a split, each done when its event happens, in any order (AA No Reset often changes the
 * order). Each split gets subs: [{name, t}], where t is when the step was done (null: not done, or not inside the split).
 * The last step of a split is the split's own end.
 *   Any%       Nether → 1st structure (Bastion or Fortress, whichever came first) → 2nd structure → Blind (back to the
 *              Overworld with blaze rods) → Stronghold (Eye Spy) → End (entering it) → Dragon
 *   Outer End  Elytra → Leave End
 *   Endgame    HDWGH Setup (until Voluntary Exile) → Raid (Hero of the Village) → Monument (How Did We Get Here) →
 *              The End Again
 */
function findSubSplits(run, splits, {anyEnd}) {
  const dims = run.dims.filter(d => d[2] !== "live");   // (the timer adds a pretend dimension change "now")
  const dimAfter = (t, x) => { if (t == null) return null; const d = dims.find(d => d[0] > t && d[1] === x); return d ? d[0] : null; };
  const inside = (i, t) => t != null && splits[i].start != null && t >= splits[i].start && (splits[i].end == null || t <= splits[i].end) ? t : null;
  const sub = (i, list) => { splits[i].subs = list.map(([name, t]) => ({name, t: inside(i, t)})); };
  const bastion = advTime(run, "nether/find_bastion"), fortress = advTime(run, "nether/find_fortress");
  const firstFortress = fortress != null && (bastion == null || fortress < bastion);
  sub(0, [
    ["Nether", dimAfter(0, "n")],
    [firstFortress ? "Fortress" : "Bastion", firstFortress ? fortress : bastion],
    [firstFortress ? "Bastion" : "Fortress", firstFortress ? bastion : fortress],
    ["Blind", dimAfter(advTime(run, "nether/obtain_blaze_rod"), "o")],
    ["Stronghold", advTime(run, "story/follow_ender_eye")],
    ["End", advTime(run, "story/enter_the_end")],
    ["Dragon", anyEnd],
  ]);
  // (leaving the End for real, not the timer's pretend "now")
  const loot = advTime(run, "end/elytra") ?? advTime(run, "end/find_end_city"), left = loot == null ? null : dims.find(d => d[0] > loot && d[1] !== "e");
  sub(1, [["Elytra", advTime(run, "end/elytra")], ["Leave End", left ? left[0] : null]]);
  sub(5, [
    ["HDWGH Setup", advTime(run, "adventure/voluntary_exile")],
    ["Raid", advTime(run, "adventure/hero_of_the_village")],
    ["Monument", advTime(run, "nether/all_effects")],
    ["The End Again", advTime(run, "end/respawn_dragon")],
  ]);
}

/*
 * parse-log.js — reads a Hermes play.log and keeps only what the site needs.
 * build.mjs uses this same file, so the site and the build always read logs the same way.
 *
 * A run looks like:
 *   events  – every advancement criterion: [igt, rta, advancement id, criterion, completed 1/0]
 *   dims    – dimension changes: [igt, "o" | "n" | "e"]
 *   deaths  – [igt, dimension, cause] (cause: see deathCause below)
 *   st      – timelines of stats (TNT used, debris mined, skulls picked up, gold blocks held, …)
 *   tot     – final totals (creepers killed, shulker boxes opened, …)
 *   clock   – [real time (ms), igt] several times a second, to line up other recordings (the ghost file) with the run.
 *             Only build.mjs uses it; it isn't stored.
 */
function parseLog(text, filename) {
  let start = null, player = null, uuid = null, seed = null, mc = null, dim = "o";   // seed: if one was typed in, or /seed was used
  const seen = new Set(), done = new Set(), events = [], dims = [], deaths = [];
  const st = {tnt: [], debris: [], skulls: [], ws: [], ench: [], trident: [], tridentUse: [], riptideUse: [], nautilus: [], drowned: [], tntHeld: [], campfire: [], hives: [], debrisGot: [], debrisTnt: [], wither: [], rose: [], gold: [], goldV: 3, invV: 1, rack: [], desert: [], gapple: null, gappleMax: 0, channeling: false, outerEnd: null,
    tears: [], ghasts: [], areas: [], beacon: [], netherite: [], held: {}, fatigue: []};
  const tot = {}, clock = [];
  const inv = {}; let inDesert = false, tntCum = 0, dbHeld = 0, dbOwed = 0, rackNow = 0, lastTnt = null, ripHeld = 0, debrisPlaced = 0; const dbInv = {}, rackRecent = [], ripInv = {};
  const kept = {}, keptMax = {};   // KEPT items in each inventory slot (with shulker boxes' contents), and the most of each held at once
  let onIsland = false;   // in the End, on the central island since arriving (see "biome" below)
  let biome = null, structs = [];   // where they are (for st.areas)
  let fatigued = false;
  const minInv = {}, netInv = {}; let minHeld = 0, netHeld = 0;   // beacon blocks and netherite in each inventory slot (see BEACON, NETHERITE), and the most held
  // st.areas: [time, area] each time the kind of place they're in changes (areaOf); a few seconds somewhere else and back
  // (along a shore, say) is left out
  const setArea = t => {
    const a = areaOf(dim, biome, structs), A = st.areas, l = A[A.length - 1];
    if (l && l[1] === a) return;
    if (l && A.length >= 2 && A[A.length - 2][1] === a && t - l[0] < 10000) { A.pop(); return; }
    A.push([t, a]);
  };
  let killedBy = null; const hits = [];   // for working out how each death happened
  const TRACK = {
    "minecraft.used:minecraft.tnt": "tnt", "minecraft.mined:minecraft.ancient_debris": "debris",
    "minecraft.killed:minecraft.wither_skeleton": "ws",
    "minecraft.picked_up:minecraft.enchanting_table": "ench",
    "minecraft.used:minecraft.trident": "tridentUse", "minecraft.killed:minecraft.drowned": "drowned", "minecraft.used:minecraft.campfire": "campfire",
    "minecraft.killed:minecraft.wither": "wither", "minecraft.killed:minecraft.ghast": "ghasts"
  };
  const TOT = {
    "minecraft.killed:minecraft.creeper": "creepers", "minecraft.custom:minecraft.damage_taken": "damage",
    "minecraft.custom:minecraft.open_shulker_box": "shulkerOpen", "minecraft.custom:minecraft.open_chest": "chests",
    "minecraft.custom:minecraft.traded_with_villager": "trades", "minecraft.custom:minecraft.mob_kills": "mobKills",
    "minecraft.used:minecraft.tnt": "tnt", "minecraft.mined:minecraft.ancient_debris": "debris",
    "minecraft.picked_up:minecraft.wither_skeleton_skull": "skulls", "minecraft.killed:minecraft.wither_skeleton": "ws",
    "minecraft.custom:minecraft.deaths": "deaths", "minecraft.custom:minecraft.jump": "jumps"
  };
  for (const line of text.split("\n")) {
    if (!line) continue;
    // clock: real time and IGT from any kind of line (cheap: no JSON parsing), a few times a second
    if (line.startsWith('{"time":')) {
      const w = parseInt(line.slice(8), 10), ri = line.lastIndexOf('"retime":'), gi = ri > 0 ? ri + 3 : line.lastIndexOf('"igt":');
      if (gi > 0 && (!clock.length || w - clock[clock.length - 1][0] >= 250)) clock.push([w, parseInt(line.slice(gi + 6), 10)]);
    }
    const q = line.indexOf('"type":"'); if (q < 0) continue;
    const type = line.slice(q + 8, line.indexOf('"', q + 8));
    // the seed, when /seed was used in the run (read from the text: it's too big a number for JSON.parse to keep exact)
    if (type === "seed") { const m = /"seed":"?(-?\d+)/.exec(line); if (m && !seed) seed = m[1]; continue; }
    // (inventory lines are only read for god apples and skulls: while skulls are held, every one, as any slot could lose one)
    // (and for debris: while any is held, every one too)
    if (type === "inventory_slots" && !line.includes("enchanted_golden_apple") && !line.includes("null") && !KEPT_RE.test(line) && !Object.keys(kept).some(sl => kept[sl] && line.includes('"' + sl + '":'))
      && !line.includes("ancient_debris") && !line.includes("netherite_scrap") && !dbHeld && !line.includes("minecraft:riptide") && !ripHeld
      && !(st.channeling === false && line.includes("minecraft:channeling"))
      && !MINERAL.test(line) && !Object.keys(minInv).some(sl => (minInv[sl] || netInv[sl]) && line.includes('"' + sl + '":'))
      && !HELD.some(x => st.held[x] == null && line.includes("minecraft:" + x))) continue;
    if (!["advancement","dimension","initialize","stat","inside_structures","inventory_slots","biome","status_effects"].includes(type)) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (start == null && e.time) start = e.time;
    // (times are SpeedRunIGT's retimed IGT, the IGT rounded to game ticks, which is what runs are timed with; logs
    // from before SpeedRunIGT had it use the IGT)
    const igt = e.speedrunigt ? e.speedrunigt.retime ?? e.speedrunigt.igt : 0, rta = e.speedrunigt ? e.speedrunigt.rta : 0, d = e.data || {};
    if (!player && d.player && d.player.name) { player = d.player.name; if (/^[0-9a-f-]{32,36}$/i.test(d.player.uuid || "")) uuid = d.player.uuid; }
    if (type === "initialize") { mc = d.mc_version; if (e.time) start = e.time; if (d.entered_seed) seed = String(d.entered_seed); }
    else if (type === "dimension") {
      const x = String(d.dimension || "").replace("minecraft:", "");
      dim = x === "the_nether" ? "n" : x === "the_end" ? "e" : "o";
      onIsland = false;
      dims.push([igt, dim]);
      setArea(igt);
    } else if (type === "advancement") {
      if (!d.id || d.id.startsWith("minecraft:recipes/")) continue;
      const id = d.id.replace("minecraft:", ""), key = id + "|" + d.criterion_name;
      if (seen.has(key)) continue;
      seen.add(key); if (d.completed) done.add(id);
      events.push([igt, rta, id, String(d.criterion_name).replace(/^minecraft:/, ""), d.completed ? 1 : 0]);
    } else if (type === "stat") {
      const k = d.stat, diff = Math.max(1, d.diff || 1);
      let newDebris = k === "minecraft.mined:minecraft.ancient_debris" ? diff : 0;   // (less any that were placed and mined again)
      if (TOT[k]) tot[TOT[k]] = d.value;
      // (debris placed and mined again isn't new debris)
      if (k === "minecraft.mined:minecraft.ancient_debris" && debrisPlaced > 0) { const again = Math.min(diff, debrisPlaced); debrisPlaced -= again; newDebris = diff - again; for (let i = again; i < diff; i++) st.debris.push(igt); }
      else if (TRACK[k]) for (let i = 0; i < diff; i++) st[TRACK[k]].push(igt);
      if (k === "minecraft.used:minecraft.ancient_debris") debrisPlaced += diff;
      if (k === "minecraft.used:minecraft.trident" && ripHeld) for (let i = 0; i < diff; i++) st.riptideUse.push(igt);
      if (k === "minecraft.custom:minecraft.damage_taken") { hits.push([igt, d.diff || 0]); if (hits.length > 12) hits.shift(); }
      if (k.startsWith("minecraft.killed_by:")) killedBy = [igt, k.slice(k.indexOf(":") + 1).replace(/^minecraft\./, "")];
      if (k === "minecraft.custom:minecraft.deaths") { deaths.push([igt, dim, deathCause(igt, dim, killedBy, hits)]); killedBy = null; hits.length = 0; // (the slots are often emptied just before the death is logged: what was held in the seconds before)
        for (const sl in dbInv) dbInv[sl] = 0; dbOwed += dbHeld; dbHeld = 0; for (const sl in ripInv) ripInv[sl] = 0; ripHeld = 0; }
      let tg = 0;
      if (k === "minecraft.picked_up:minecraft.tnt" || k === "minecraft.crafted:minecraft.tnt") { tg = diff; tot.tntGot = (tot.tntGot || 0) + diff; }
      else if (k === "minecraft.used:minecraft.tnt") tg = -diff;
      if (tg) { tntCum += tg; st.tntHeld.push([igt, tntCum]); }
      // debris from TNT: TNT used in the 5 minutes before, and no more than a few netherrack mined in the 15 seconds before
      // (checking around the blast); debris hit while mining netherrack non-stop (strip mining, digging the TNT tunnel) isn't
      if (k === "minecraft.used:minecraft.tnt") lastTnt = igt;
      if (k === "minecraft.mined:minecraft.netherrack") { rackNow = d.value; rackRecent.push([igt, rackNow]); while (rackRecent.length && rackRecent[0][0] < igt - 60000) rackRecent.shift(); }
      if (k === "minecraft.mined:minecraft.ancient_debris" && lastTnt != null && igt - lastTnt <= 300000) {
        const b = rackRecent.filter(p => p[0] <= igt - 15000).pop(), first = rackRecent.find(p => p[0] > igt - 15000);
        const before = b ? b[1] : first ? first[1] - 1 : rackNow;   // (netherrack mined just before: the first in the 15 seconds counts too)
        if (rackNow - before <= 20) for (let i = 0; i < newDebris; i++) st.debrisTnt.push(igt);
      }
      if (k === "minecraft.mined:minecraft.netherrack") {
        const lr = st.rack[st.rack.length - 1];
        if (lr && igt - lr[0] < 2000) lr[1] = d.value; else st.rack.push([igt, d.value]);
      }
      if (/^minecraft\.used:minecraft\.[a-z_]*shulker_box$/.test(k)) tot.shulkerPlaced = (tot.shulkerPlaced || 0) + diff;
    } else if (type === "status_effects") {
      // st.fatigue: each time mining fatigue starts (from an elder guardian, for How Did We Get Here)
      const has = Object.keys(d.effects || {}).includes("minecraft:mining_fatigue");
      if (has && !fatigued) st.fatigue.push(igt);
      fatigued = has;
    } else if (type === "biome") {
      // the first time in the outer End: any End biome but the central island's is over 1024 blocks out, past the
      // gateway (Remote Getaway is sometimes only given later; logs from older Hermes have no biome lines)
      // (the first biome line after arriving is from where they were in the Overworld: it only counts once they've been
      // on the central island)
      if (dim === "e" && st.outerEnd == null) {
        if (d.biome === "minecraft:the_end") onIsland = true;
        else if (d.biome && onIsland) st.outerEnd = igt;
      }
      biome = String(d.biome || "").replace("minecraft:", "");
      setArea(igt);
    } else if (type === "inside_structures") {
      structs = d.structures || [];
      setArea(igt);
      const now = (d.structures || []).includes("desert_pyramid");
      if (now && !inDesert) st.desert.push(igt);
      inDesert = now;
    } else if (type === "inventory_slots") {
      // beacon blocks held (shulker boxes' contents too), and the first time some items were held
      for (const [slot, v] of Object.entries(d.slots || {})) {
        const inside = (v && v.tag && v.tag.BlockEntityTag && v.tag.BlockEntityTag.Items) || [];   // (a shulker box's)
        minInv[slot] = worth(BEACON, v) + inside.reduce((a, x) => a + worth(BEACON, x), 0);
        netInv[slot] = worth(NETHERITE, v) + inside.reduce((a, x) => a + worth(NETHERITE, x), 0);
        const id = v && String(v.id).replace("minecraft:", "");
        if (id && HELD.includes(id) && st.held[id] == null) st.held[id] = igt;
      }
      // (st.beacon: [time, blocks] each time there are more than ever before: they end up in the beacon)
      const mh = Math.floor(Object.values(minInv).reduce((a, b) => a + b, 0) + 1e-9);
      if (mh > minHeld) { minHeld = mh; const lb = st.beacon[st.beacon.length - 1]; if (lb && lb[0] === igt) lb[1] = mh; else st.beacon.push([igt, mh]); }
      // (st.netherite: the same for netherite, in debris: the most there's been at once)
      const nh = Object.values(netInv).reduce((a, b) => a + b, 0);
      if (nh > netHeld) { netHeld = nh; const ln = st.netherite[st.netherite.length - 1]; if (ln && ln[0] === igt) ln[1] = nh; else st.netherite.push([igt, nh]); }
      for (const [slot, v] of Object.entries(d.slots || {})) inv[slot] = v && v.id === "minecraft:enchanted_golden_apple" ? (v.Count || 1) : 0;
      // skulls, shells, tridents, hives…: what's in the inventory, so one dropped or lost and picked up again isn't a new
      // one (st.skulls and so on: a time for each one more than was ever held at once)
      for (const [slot, v] of Object.entries(d.slots || {})) {
        const c = {}, add = x => { const k = x && KEPT[String(x.id).replace("minecraft:", "")]; if (k) c[k] = (c[k] || 0) + (x.Count || 1); };
        add(v); ((v && v.tag && v.tag.BlockEntityTag && v.tag.BlockEntityTag.Items) || []).forEach(add);
        kept[slot] = Object.keys(c).length ? c : null;
      }
      const keptNow = {};
      for (const c of Object.values(kept)) if (c) for (const k in c) keptNow[k] = (keptNow[k] || 0) + c[k];
      for (const k in keptNow) while (keptNow[k] > (keptMax[k] || 0)) { keptMax[k] = (keptMax[k] || 0) + 1; st[k].push(igt); }
      // riptide tridents in the inventory (a trident use is only a riptide while one is held)
      for (const [slot, v] of Object.entries(d.slots || {})) ripInv[slot] = v && v.id === "minecraft:trident" && ((v.tag && v.tag.Enchantments) || []).some(e => String(e.id) === "minecraft:riptide") ? 1 : 0;
      ripHeld = Object.values(ripInv).reduce((a, b) => a + b, 0);
      // when a channeling trident was first in the inventory (a Thunderless run needs one: see stats.js)
      if (st.channeling === false && Object.values(d.slots || {}).some(v => v && v.id === "minecraft:trident" && ((v.tag && v.tag.Enchantments) || []).some(e => String(e.id) === "minecraft:channeling"))) st.channeling = igt;
      // debris (or scrap) turning up in the inventory in the Nether: mined, or from a chest (which the stats don't count)
      for (const [slot, v] of Object.entries(d.slots || {})) dbInv[slot] = v && (v.id === "minecraft:ancient_debris" || v.id === "minecraft:netherite_scrap") ? (v.Count || 1) : 0;
      const db = Object.values(dbInv).reduce((a, b) => a + b, 0);
      if (db > dbHeld) { const again = Math.min(db - dbHeld, dbOwed); dbOwed -= again; if (db - dbHeld > again && dim === "n") st.debrisGot.push(igt); }   // (not what was dropped by dying)
      dbHeld = db;
      const n = Object.values(inv).reduce((a, b) => a + b, 0);
      if (n > 0 && st.gapple == null) st.gapple = igt;
      st.gappleMax = Math.max(st.gappleMax, n);
    }
  }
  tot.skulls = st.skulls.length; tot.debris = st.debris.length;   // (not the picked-up stat, which counts skulls picked up again after dying)
  st.gold = st.beacon;   // (blocks for the beacon: the most held at once, like the Midgame checklist's Beacon Blocks)
  if (!events.length) throw new Error(filename + " has no advancement events. Use the play.log from Hermes.");
  const comp = events.filter(e => e[4]);
  const last = comp.length ? comp[comp.length - 1] : events[events.length - 1];
  return {start: start || Date.now(), player: player || "Unknown", uuid, seed, mc: mc || "", finalIgt: last[0], finalRta: last[1],
    critCount: seen.size, events, dims, deaths, st, tot, meta: {}, addedAt: Date.now(), clock};
}

/*
 * How a death happened. The log names the mob when a mob did it ("killed_by"); otherwise it's a best guess
 * from the damage taken just before (damage is in tenths of a heart-half, so 10 = half a heart):
 *   "mob:<id>"  killed by that mob
 *   "fire"      several hits of exactly 10 in a row (burning)
 *   "void"      several hits of 20–45 in a row, in the End (falling out of the world)
 *   "lava"      the same, anywhere else
 *   "impact"    one big hit (10+ damage): a fall or an explosion
 *   ""          can't tell
 * runs.json can say it better for any death ("deathCauses").
 */
function deathCause(t, dim, killedBy, hits) {
  if (killedBy && t - killedBy[0] < 1000) return "mob:" + killedBy[1];
  const recent = hits.filter(h => t - h[0] < 6000).map(h => h[1]), tail = recent.slice(-3);
  if (tail.length === 3 && tail.every(x => x === 10)) return "fire";
  if (tail.length === 3 && tail.every(x => x >= 20 && x <= 45)) return dim === "e" ? "void" : "lava";
  if (recent.length && recent[recent.length - 1] >= 100) return "impact";
  return "";
}

// A stable id for a run (based on when the world was started)
const runKey = r => "run-" + r.start + "-" + String(r.player).replace(/[^A-Za-z0-9_-]/g, "");

// Runs are stored with each event squashed into one "igt|rta|id|criterion|done" string to keep files small.
const encodeRun = r => { const {_d, clock, ...x} = r; return {...x, events: r.events.map(e => e.join("|"))}; };
const decodeRun = x => ({meta: {}, st: {}, tot: {}, deaths: [], ...x,
  events: (x.events || []).map(s => { if (Array.isArray(s)) return s; const p = String(s).split("|"); return [+p[0], +p[1], p[2], p.slice(3, -1).join("|"), +p[p.length - 1]]; }),
  dims: (x.dims || []).map(s => Array.isArray(s) ? s : [+String(s).split("|")[0], String(s).split("|")[1]])});

/*
 * The kind of place the runner is in, for the Midgame checklist (MIDGAME in config.js): in the Nether "fortress",
 * "bastion", "crimson", "warped" or "nether"; "end"; in the Overworld "village" (or a swamp hut), "ocean" (ocean or beach
 * biomes, and ocean structures), "desert" (and savanna), "mushroom", "badlands", "jungle", "snowy" (and igloos), "taiga"
 * (mega taiga too), "plains", or "other". Structures count before biomes.
 * (Logs from older Hermes have no biome lines: only structures and dimensions there.)
 */
function areaOf(dim, biome, structs) {
  if (dim === "e") return "end";
  if (dim === "n") return structs.includes("fortress") ? "fortress" : structs.includes("bastion_remnant") ? "bastion"
    : biome === "crimson_forest" ? "crimson" : biome === "warped_forest" ? "warped" : "nether";
  // (the rare biomes come first, even in a village or by an ocean ruin: what's done there counts for them)
  const b = biome || "";
  if (b.startsWith("mushroom")) return "mushroom";
  if (b.includes("badlands")) return "badlands";
  if (b.startsWith("giant_") || b.startsWith("taiga")) return "taiga";
  if (b.includes("jungle")) return "jungle";
  if (b.startsWith("snowy") || b === "ice_spikes" || b === "frozen_river" || structs.includes("igloo")) return "snowy";
  if (structs.includes("village") || structs.includes("swamp_hut")) return "village";
  if (structs.some(x => ["monument", "ocean_ruin", "shipwreck", "buried_treasure"].includes(x))) return "ocean";
  if (structs.includes("desert_pyramid")) return "desert";
  if (b.includes("ocean")) return "ocean";
  if (b.includes("beach") || b === "stone_shore") return "ocean";
  if (b.startsWith("desert") || b.startsWith("savanna") || b === "shattered_savanna") return "desert";
  if (b.includes("plains")) return "plains";
  return "other";
}
// What can go into a beacon's base, in blocks: blocks of iron, gold, emerald and diamond, and ingots and gems (a ninth
// of a block each). (Not netherite: that's for the armour.) And netherite, in debris (an ingot is 4).
const MINERAL = /(iron|gold)_(block|ingot)|emerald|diamond|netherite|ancient_debris/;
const BEACON = {iron_block: 1, gold_block: 1, emerald_block: 1, diamond_block: 1, iron_ingot: 1 / 9, gold_ingot: 1 / 9, emerald: 1 / 9, diamond: 1 / 9};
const NETHERITE = {ancient_debris: 1, netherite_scrap: 1, netherite_ingot: 4, netherite_block: 36};
const worth = (table, v) => v && v.id ? (table[String(v.id).replace("minecraft:", "")] || 0) * (v.Count || 1) : 0;
// items whose first time in the inventory is kept (st.held): foods for A Balanced Diet that are got in one place
// Items counted from the inventory (see "inventory_slots" above): item → its timeline in st
const KEPT = {wither_skeleton_skull: "skulls", nautilus_shell: "nautilus", trident: "trident", bee_nest: "hives", beehive: "hives", ghast_tear: "tears", wither_rose: "rose"};
const KEPT_RE = new RegExp(Object.keys(KEPT).map(k => "minecraft:" + k + '"').join("|"));
const HELD = ["melon_slice", "cocoa_beans", "cookie", "sweet_berries", "mushroom_stew", "suspicious_stew",
  "cod", "salmon", "tropical_fish", "pufferfish", "cooked_cod", "cooked_salmon", "dried_kelp"];

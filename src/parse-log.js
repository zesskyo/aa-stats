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
  let start = null, player = null, uuid = null, seed = null, mc = null, dim = "o";   // seed: only if one was typed in
  const seen = new Set(), done = new Set(), events = [], dims = [], deaths = [];
  const st = {tnt: [], debris: [], skulls: [], ws: [], ench: [], trident: [], tridentUse: [], nautilus: [], drowned: [], tntHeld: [], campfire: [], hives: [], debrisGot: [], debrisTnt: [], wither: [], rose: [], gold: [], goldV: 2, rack: [], desert: [], gapple: null, gappleMax: 0};
  const tot = {}, clock = [];
  const inv = {}, skInv = {}; let inDesert = false, goldCum = 0, tntCum = 0, skOwed = 0, skHeld = [], dbHeld = 0, dbOwed = 0, rackNow = 0, lastTnt = null; const dbInv = {}, rackRecent = [];   // skOwed: skulls dropped by dying, to be picked up again; skHeld: [time, skulls held] when it changes
  let killedBy = null; const hits = [];   // for working out how each death happened
  const TRACK = {
    "minecraft.used:minecraft.tnt": "tnt", "minecraft.mined:minecraft.ancient_debris": "debris",
    "minecraft.picked_up:minecraft.wither_skeleton_skull": "skulls", "minecraft.killed:minecraft.wither_skeleton": "ws",
    "minecraft.picked_up:minecraft.enchanting_table": "ench",
    "minecraft.picked_up:minecraft.trident": "trident", "minecraft.used:minecraft.trident": "tridentUse", "minecraft.picked_up:minecraft.nautilus_shell": "nautilus", "minecraft.killed:minecraft.drowned": "drowned", "minecraft.used:minecraft.campfire": "campfire",
    "minecraft.picked_up:minecraft.bee_nest": "hives", "minecraft.picked_up:minecraft.beehive": "hives", "minecraft.killed:minecraft.wither": "wither", "minecraft.picked_up:minecraft.wither_rose": "rose"
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
      const w = parseInt(line.slice(8), 10), gi = line.lastIndexOf('"igt":');
      if (gi > 0 && (!clock.length || w - clock[clock.length - 1][0] >= 250)) clock.push([w, parseInt(line.slice(gi + 6), 10)]);
    }
    const q = line.indexOf('"type":"'); if (q < 0) continue;
    const type = line.slice(q + 8, line.indexOf('"', q + 8));
    // (inventory lines are only read for god apples and skulls: while skulls are held, every one, as any slot could lose one)
    // (and for debris: while any is held, every one too)
    if (type === "inventory_slots" && !line.includes("enchanted_golden_apple") && !line.includes("null") && !line.includes("wither_skeleton_skull") && !(skHeld.length && skHeld[skHeld.length - 1][1] > 0)
      && !line.includes("ancient_debris") && !line.includes("netherite_scrap") && !dbHeld) continue;
    if (!["advancement","dimension","initialize","stat","inside_structures","inventory_slots"].includes(type)) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (start == null && e.time) start = e.time;
    const igt = e.speedrunigt ? e.speedrunigt.igt : 0, rta = e.speedrunigt ? e.speedrunigt.rta : 0, d = e.data || {};
    if (!player && d.player && d.player.name) { player = d.player.name; if (/^[0-9a-f-]{32,36}$/i.test(d.player.uuid || "")) uuid = d.player.uuid; }
    if (type === "initialize") { mc = d.mc_version; if (e.time) start = e.time; if (d.entered_seed) seed = String(d.entered_seed); }
    else if (type === "dimension") {
      const x = String(d.dimension || "").replace("minecraft:", "");
      dim = x === "the_nether" ? "n" : x === "the_end" ? "e" : "o";
      dims.push([igt, dim]);
    } else if (type === "advancement") {
      if (!d.id || d.id.startsWith("minecraft:recipes/")) continue;
      const id = d.id.replace("minecraft:", ""), key = id + "|" + d.criterion_name;
      if (seen.has(key)) continue;
      seen.add(key); if (d.completed) done.add(id);
      events.push([igt, rta, id, String(d.criterion_name).replace(/^minecraft:/, ""), d.completed ? 1 : 0]);
    } else if (type === "stat") {
      const k = d.stat, diff = Math.max(1, d.diff || 1);
      if (TOT[k]) tot[TOT[k]] = d.value;
      // (skulls dropped by dying and picked up again aren't new skulls)
      if (k === "minecraft.picked_up:minecraft.wither_skeleton_skull" && skOwed > 0) { const again = Math.min(diff, skOwed); skOwed -= again; for (let i = again; i < diff; i++) st.skulls.push(igt); }
      else if (TRACK[k]) for (let i = 0; i < diff; i++) st[TRACK[k]].push(igt);
      if (k === "minecraft.custom:minecraft.damage_taken") { hits.push([igt, d.diff || 0]); if (hits.length > 12) hits.shift(); }
      if (k.startsWith("minecraft.killed_by:")) killedBy = [igt, k.slice(k.indexOf(":") + 1).replace(/^minecraft\./, "")];
      if (k === "minecraft.custom:minecraft.deaths") { deaths.push([igt, dim, deathCause(igt, dim, killedBy, hits)]); killedBy = null; hits.length = 0; // (the slots are often emptied just before the death is logged: what was held in the seconds before)
        skOwed += Math.max(0, ...skHeld.filter(h => h[0] >= igt - 5000).map(h => h[1]), skHeld.length ? skHeld[skHeld.length - 1][1] : 0);
        for (const sl in skInv) skInv[sl] = 0; skHeld.push([igt, 0]); for (const sl in dbInv) dbInv[sl] = 0; dbOwed += dbHeld; dbHeld = 0; }
      let g = 0;
      if (k === "minecraft.mined:minecraft.gold_block" || k === "minecraft.crafted:minecraft.gold_block") g = diff;
      else if (k === "minecraft.used:minecraft.gold_block") g = -diff;
      else if (k === "minecraft.crafted:minecraft.gold_ingot" && diff % 9 === 0) g = -diff / 9;   // blocks broken down into ingots
      if (g) { goldCum += g; st.gold.push([igt, goldCum]); }
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
        if (rackNow - before <= 20) for (let i = 0; i < diff; i++) st.debrisTnt.push(igt);
      }
      if (k === "minecraft.mined:minecraft.netherrack") {
        const lr = st.rack[st.rack.length - 1];
        if (lr && igt - lr[0] < 2000) lr[1] = d.value; else st.rack.push([igt, d.value]);
      }
      if (/^minecraft\.used:minecraft\.[a-z_]*shulker_box$/.test(k)) tot.shulkerPlaced = (tot.shulkerPlaced || 0) + diff;
    } else if (type === "inside_structures") {
      const now = (d.structures || []).includes("desert_pyramid");
      if (now && !inDesert) st.desert.push(igt);
      inDesert = now;
    } else if (type === "inventory_slots") {
      for (const [slot, v] of Object.entries(d.slots || {})) { inv[slot] = v && v.id === "minecraft:enchanted_golden_apple" ? (v.Count || 1) : 0; skInv[slot] = v && v.id === "minecraft:wither_skeleton_skull" ? (v.Count || 1) : 0; }
      // debris (or scrap) turning up in the inventory in the Nether: mined, or from a chest (which the stats don't count)
      for (const [slot, v] of Object.entries(d.slots || {})) dbInv[slot] = v && (v.id === "minecraft:ancient_debris" || v.id === "minecraft:netherite_scrap") ? (v.Count || 1) : 0;
      const db = Object.values(dbInv).reduce((a, b) => a + b, 0);
      if (db > dbHeld) { const again = Math.min(db - dbHeld, dbOwed); dbOwed -= again; if (db - dbHeld > again && dim === "n") st.debrisGot.push(igt); }   // (not what was dropped by dying)
      dbHeld = db;
      const sk = Object.values(skInv).reduce((a, b) => a + b, 0), prev = skHeld.length ? skHeld[skHeld.length - 1] : null;
      if (!prev || prev[1] !== sk) { if (prev && sk < prev[1]) skHeld.push([igt, prev[1]]); skHeld.push([igt, sk]); }
      const n = Object.values(inv).reduce((a, b) => a + b, 0);
      if (n > 0 && st.gapple == null) st.gapple = igt;
      st.gappleMax = Math.max(st.gappleMax, n);
    }
  }
  tot.skulls = st.skulls.length;   // (not the picked-up stat, which counts skulls picked up again after dying)
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

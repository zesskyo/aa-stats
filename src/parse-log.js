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
 */
function parseLog(text, filename) {
  let start = null, player = null, mc = null, dim = "o";
  const seen = new Set(), done = new Set(), events = [], dims = [], deaths = [];
  const st = {tnt: [], debris: [], skulls: [], ws: [], ench: [], trident: [], tridentUse: [], nautilus: [], drowned: [], tntHeld: [], campfire: [], gold: [], goldV: 2, rack: [], desert: [], gapple: null, gappleMax: 0};
  const tot = {};
  const inv = {}; let inDesert = false, goldCum = 0, tntCum = 0;
  let killedBy = null; const hits = [];   // for working out how each death happened
  const TRACK = {
    "minecraft.used:minecraft.tnt": "tnt", "minecraft.mined:minecraft.ancient_debris": "debris",
    "minecraft.picked_up:minecraft.wither_skeleton_skull": "skulls", "minecraft.killed:minecraft.wither_skeleton": "ws",
    "minecraft.picked_up:minecraft.enchanting_table": "ench",
    "minecraft.picked_up:minecraft.trident": "trident", "minecraft.used:minecraft.trident": "tridentUse", "minecraft.picked_up:minecraft.nautilus_shell": "nautilus", "minecraft.killed:minecraft.drowned": "drowned", "minecraft.used:minecraft.campfire": "campfire"
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
    const q = line.indexOf('"type":"'); if (q < 0) continue;
    const type = line.slice(q + 8, line.indexOf('"', q + 8));
    if (type === "inventory_slots" && !line.includes("enchanted_golden_apple") && !line.includes("null")) continue;
    if (!["advancement","dimension","initialize","stat","inside_structures","inventory_slots"].includes(type)) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (start == null && e.time) start = e.time;
    const igt = e.speedrunigt ? e.speedrunigt.igt : 0, rta = e.speedrunigt ? e.speedrunigt.rta : 0, d = e.data || {};
    if (!player && d.player && d.player.name) player = d.player.name;
    if (type === "initialize") { mc = d.mc_version; if (e.time) start = e.time; }
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
      if (TRACK[k]) for (let i = 0; i < diff; i++) st[TRACK[k]].push(igt);
      if (k === "minecraft.custom:minecraft.damage_taken") { hits.push([igt, d.diff || 0]); if (hits.length > 12) hits.shift(); }
      if (k.startsWith("minecraft.killed_by:")) killedBy = [igt, k.slice(k.indexOf(":") + 1).replace(/^minecraft\./, "")];
      if (k === "minecraft.custom:minecraft.deaths") { deaths.push([igt, dim, deathCause(igt, dim, killedBy, hits)]); killedBy = null; hits.length = 0; }
      let g = 0;
      if (k === "minecraft.mined:minecraft.gold_block" || k === "minecraft.crafted:minecraft.gold_block") g = diff;
      else if (k === "minecraft.used:minecraft.gold_block") g = -diff;
      else if (k === "minecraft.crafted:minecraft.gold_ingot" && diff % 9 === 0) g = -diff / 9;   // blocks broken down into ingots
      if (g) { goldCum += g; st.gold.push([igt, goldCum]); }
      let tg = 0;
      if (k === "minecraft.picked_up:minecraft.tnt" || k === "minecraft.crafted:minecraft.tnt") { tg = diff; tot.tntGot = (tot.tntGot || 0) + diff; }
      else if (k === "minecraft.used:minecraft.tnt") tg = -diff;
      if (tg) { tntCum += tg; st.tntHeld.push([igt, tntCum]); }
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
      for (const [slot, v] of Object.entries(d.slots || {})) inv[slot] = v && v.id === "minecraft:enchanted_golden_apple" ? (v.Count || 1) : 0;
      const n = Object.values(inv).reduce((a, b) => a + b, 0);
      if (n > 0 && st.gapple == null) st.gapple = igt;
      st.gappleMax = Math.max(st.gappleMax, n);
    }
  }
  if (!events.length) throw new Error(filename + " has no advancement events. Use the play.log from Hermes.");
  const comp = events.filter(e => e[4]);
  const last = comp.length ? comp[comp.length - 1] : events[events.length - 1];
  return {start: start || Date.now(), player: player || "Unknown", mc: mc || "", finalIgt: last[0], finalRta: last[1],
    critCount: seen.size, events, dims, deaths, st, tot, meta: {}, addedAt: Date.now()};
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
const encodeRun = r => { const {_d, ...x} = r; return {...x, events: r.events.map(e => e.join("|"))}; };
const decodeRun = x => ({meta: {}, st: {}, tot: {}, deaths: [], ...x,
  events: (x.events || []).map(s => { if (Array.isArray(s)) return s; const p = String(s).split("|"); return [+p[0], +p[1], p[2], p.slice(3, -1).join("|"), +p[p.length - 1]]; }),
  dims: (x.dims || []).map(s => Array.isArray(s) ? s : [+String(s).split("|")[0], String(s).split("|")[1]])});

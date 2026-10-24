/*
 * stats-screen.js — a run's statistics (the world's stats/<uuid>.json, logs/<N>.stats.json), shown like the game's own
 * Statistics screen: General (every custom stat, formatted the way the game does), Items (times mined, broken, crafted,
 * used, picked up and dropped, sortable by clicking a column) and Mobs (killed, and killed by).
 * The names are the game's (items/stats-lang.json, from its en_us.json; item names from items/all.json), and so are the
 * textures: the dirt background, the buttons and the column icons (textures/gui/…).
 */
let mcTab = "general", mcSort = null;   // (kept between runs)
let mcLangP = null, mcItemsP = null;
const mcLang = () => mcLangP || (mcLangP = fetch("items/stats-lang.json").then(r => r.json()).catch(() => { mcLangP = null; return {}; }));
const mcItems = () => mcItemsP || (mcItemsP = fetch("items/all.json").then(r => r.json()).catch(() => { mcItemsP = null; return null; }));

// The game's number formats (StatFormatter): times are in ticks, distances in cm, damage in tenths
const mcDec = v => (Math.round(v * 100) / 100).toFixed(2);
const MC_TIME = new Set(["play_one_minute", "time_since_death", "time_since_rest", "sneak_time", "total_world_time"]);
const MC_TENTHS = new Set(["damage_dealt", "damage_dealt_absorbed", "damage_dealt_resisted", "damage_taken", "damage_blocked_by_shield", "damage_absorbed", "damage_resisted"]);
function mcFormat(stat, v) {
  if (MC_TIME.has(stat)) {
    const s = v / 20, m = s / 60, h = m / 60, d = h / 24, y = d / 365;
    return y > .5 ? mcDec(y) + " y" : d > .5 ? mcDec(d) + " d" : h > .5 ? mcDec(h) + " h" : m > .5 ? mcDec(m) + " m" : mcDec(s) + " s";
  }
  if (stat.endsWith("_one_cm")) { const m = v / 100, km = m / 1000; return km > .5 ? mcDec(km) + " km" : m > .5 ? mcDec(m) + " m" : v + " cm"; }
  if (MC_TENTHS.has(stat)) return mcDec(v / 10);
  return v.toLocaleString("en-US");
}

// The columns of the Items tab, in the game's order, with their icons in textures/gui/container/stats_icons.png
const MC_COLS = [["mined", 3], ["broken", 4], ["crafted", 1], ["used", 2], ["picked_up", 5], ["dropped", 6]];
const mcSprite = (u, v) => `<span class="mcsprite" style="background-position:-${u * 2}px -${v * 2}px"></span>`;

// The card, on a run's page (filled in once its statistics have loaded)
// The item a block is counted under (null: none, like fire or air)
const MC_BLOCK_ITEM = {carrots: "carrot", potatoes: "potato", beetroots: "beetroot_seeds", wheat: "wheat_seeds", cocoa: "cocoa_beans", sweet_berry_bush: "sweet_berries",
  redstone_wire: "redstone", tripwire: "string", kelp_plant: "kelp", tall_seagrass: "seagrass", weeping_vines_plant: "weeping_vines", twisting_vines_plant: "twisting_vines",
  bamboo_sapling: "bamboo", melon_stem: "melon_seeds", attached_melon_stem: "melon_seeds", pumpkin_stem: "pumpkin_seeds", attached_pumpkin_stem: "pumpkin_seeds"};
const mcItemOf = (id, db) => {
  const idx = db && db.index || {};
  if (id in idx && id !== "air") return id;
  const to = MC_BLOCK_ITEM[id] || id.replace(/_wall_(torch|sign|banner|head|skull|fan)$/, "_$1").replace(/^wall_torch$/, "torch");
  return to in idx ? to : null;
};
const statsScreenShell = run => run.meta && (run.meta.stats || run.meta.statsData) ? `<section class="mcstats" id="mcStats" aria-label="Statistics"><div class="mctitle">Statistics</div><div class="mclist" id="mcList"></div><div class="mcbtns" id="mcBtns"></div></section>` : "";

async function drawStatsScreen(run) {
  const el = $("#mcStats"); if (!el) return;
  const [st, L] = await Promise.all([run.meta.statsData ? Promise.resolve(run.meta.statsData) : fetch(run.meta.stats).then(r => r.json()).catch(() => null), mcLang()]);
  if (!st || !document.body.contains(el)) { if (!st) el.remove(); return; }
  const name = (k, fallback) => L[k] || fallback;
  el.querySelector(".mctitle").textContent = name("gui.stats", "Statistics");
  const btns = $("#mcBtns");
  btns.innerHTML = [["general", "stat.generalButton", "General"], ["items", "stat.itemsButton", "Items"], ["mobs", "stat.mobsButton", "Mobs"]]
    .map(([k, l, f]) => `<button type="button" class="mcbtn${mcTab === k ? " off" : ""}" data-tab="${k}">${esc(name(l, f))}</button>`).join("");
  btns.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { mcTab = b.dataset.tab; drawStatsScreen(run); }));
  const list = $("#mcList"), short = k => String(k).replace(/^minecraft:/, "");
  const cat = k => st["minecraft:" + k] || {};

  if (mcTab === "general") {
    // every stat the game has, sorted by name, those not counted yet as 0
    const custom = cat("custom"), keys = new Set([...Object.keys(L).filter(k => k.startsWith("stat.minecraft.")).map(k => k.slice(15)), ...Object.keys(custom).map(short)]);
    // (the game's text has a few names twice, for stats it no longer has: those only show if they were counted)
    const seen = new Map();
    for (const k of keys) { const n = name("stat.minecraft." + k, titleCase(k.replace(/_/g, " "))), had = seen.get(n);
      if (!had || (custom["minecraft:" + k] != null && custom["minecraft:" + had] == null)) seen.set(n, k); }
    const rows = [...seen].map(([n, k]) => [n, mcFormat(k, custom["minecraft:" + k] || 0)]).sort((a, b) => a[0].localeCompare(b[0]));
    list.innerHTML = `<div class="mcgen">${rows.map(([n, v], i) => `<div class="mcrow${i % 2 ? " dim" : ""}"><span>${esc(n)}</span><span>${esc(v)}</span></div>`).join("")}</div>`;
  } else if (mcTab === "items") {
    const db = await mcItems();
    // (blocks with no item of their own are counted with their item, like the game does: wall torches with torches,
    // carrots with carrots; those with none, like fire, aren't shown)
    const vals = new Map();
    MC_COLS.forEach(([c], k) => { for (const [key, n] of Object.entries(cat(c))) {
      const id = mcItemOf(short(key), db); if (!id) continue;
      const v = vals.get(id) || vals.set(id, []).get(id); v[k] = (v[k] || 0) + n; } });
    let rows = [...vals].map(([id, v]) => ({id, v: MC_COLS.map((_, k) => v[k]), name: db && db.names && db.names[id] || titleCase(id.replace(/_/g, " "))}));
    // (sorted like the game: a column clicked once, most first; again, least first)
    if (mcSort) rows.sort((a, b) => ((b.v[mcSort.col] || 0) - (a.v[mcSort.col] || 0)) * mcSort.dir || a.name.localeCompare(b.name));
    else rows.sort((a, b) => a.name.localeCompare(b.name));
    const icon = id => {
      const i = db && db.index ? db.index[id] : null;
      if (i == null) return "";
      const S = 32, cols = db.cols, x = (i % cols) * S, y = Math.floor(i / cols) * S;
      return `<span class="mcitem" style="background-size:${cols * S}px auto;background-position:-${x}px -${y}px"></span>`;
    };
    const head = MC_COLS.map(([c, sprite], k) => `<button type="button" class="mccol" data-col="${k}" title="${esc(name("stat_type.minecraft." + c, c))}">${mcSprite(0, mcSort && mcSort.col === k ? 0 : 18)}${mcSprite(18 * sprite, 18)}${mcSort && mcSort.col === k ? `<span class="mcarrow">${mcSort.dir > 0 ? "▼" : "▲"}</span>` : ""}</button>`).join("");
    list.innerHTML = `<div class="mcitems"><div class="mcihead"><span></span>${head}</div>${rows.map((r, n) => `<div class="mcirow${n % 2 ? " dim" : ""}" title="${esc(r.name)}"><span class="mcslot">${mcSprite(0, 0)}${icon(r.id)}</span>${r.v.map((v, k) => `<span>${v != null ? v.toLocaleString("en-US") : k === 0 ? "-" : "0"}</span>`).join("")}</div>`).join("")}</div>`;
    list.querySelectorAll("[data-col]").forEach(b => b.addEventListener("click", () => {
      const col = +b.dataset.col; mcSort = mcSort && mcSort.col === col ? {col, dir: -mcSort.dir} : {col, dir: 1}; drawStatsScreen(run);
    }));
  } else {
    // every mob killed, or that killed the runner
    const killed = cat("killed"), by = cat("killed_by"), ids = [...new Set([...Object.keys(killed), ...Object.keys(by)].map(short))];
    const fill = (k, ...xs) => { let i = 0; return name(k, "").replace(/%s/g, () => xs[i++]); };
    const rows = ids.map(id => ({id, n: name("entity.minecraft." + id, titleCase(id.replace(/_/g, " ")))})).sort((a, b) => a.n.localeCompare(b.n));
    list.innerHTML = `<div class="mcmobs">${rows.map(({id, n}) => { const k = killed["minecraft:" + id] || 0, b = by["minecraft:" + id] || 0;
      return `<div class="mcmob"><div>${esc(n)}</div><div class="dim">${esc(k ? fill("stat_type.minecraft.killed", k, n) : fill("stat_type.minecraft.killed.none", n))}</div><div class="dim">${esc(b ? fill("stat_type.minecraft.killed_by", n, b) : fill("stat_type.minecraft.killed_by.none", n))}</div></div>`; }).join("")}</div>`;
  }
}

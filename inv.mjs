// Reads the inventory from a Hermes play.log: its "inventory_slots" lines list the slots that changed
// (0–8 hotbar, 9–35 inventory, 36–39 boots/leggings/chestplate/helmet, 40 off hand).
// Returns {s, e} for the inventory replay (src/inventory.js):
//   s  the different item stacks: {m: icon, n: tooltip lines [[text, colour], …], g: 1 if enchanted-looking,
//      c: tint (potions), d: the durability bar's width, 0–13 (only when damaged, like the game)}
//   e  the changes, 4 numbers each: IGT (tenths of a second, since the change before), slot, stack (index into s, +1; 0 = empty), count
const MAX_DAMAGE = {
  wooden: 59, stone: 131, iron: 250, golden: 32, diamond: 1561, netherite: 2031,
  bow: 384, crossbow: 326, trident: 250, shield: 336, flint_and_steel: 64, shears: 238, fishing_rod: 64, elytra: 432,
  carrot_on_a_stick: 25, warped_fungus_on_a_stick: 100, turtle_helmet: 275,
};
const ARMOR = {leather: [55, 80, 75, 65], chainmail: [165, 240, 225, 195], iron: [165, 240, 225, 195], golden: [77, 112, 105, 91], diamond: [363, 528, 495, 429], netherite: [407, 592, 555, 481]};
function maxDamage(id) {
  let m;
  if ((m = /^(\w+?)_(helmet|chestplate|leggings|boots)$/.exec(id)) && ARMOR[m[1]]) return ARMOR[m[1]][["helmet", "chestplate", "leggings", "boots"].indexOf(m[2])];
  if ((m = /^(\w+?)_(sword|pickaxe|axe|shovel|hoe)$/.exec(id))) return MAX_DAMAGE[m[1]] || null;
  return MAX_DAMAGE[id] || null;
}
const POTION_COLOR = {water: "#385DC6", mundane: "#385DC6", thick: "#385DC6", awkward: "#385DC6", night_vision: "#1F1FA1", invisibility: "#7F8392",
  leaping: "#22FF4C", fire_resistance: "#E49A3A", swiftness: "#7CAFC6", slowness: "#5A6C81", turtle_master: "#755D5C", water_breathing: "#2E5299",
  healing: "#F82423", harming: "#430A09", poison: "#4E9331", regeneration: "#CD5CAB", strength: "#932423", weakness: "#484D48", luck: "#339900", slow_falling: "#F7F8E0"};
const PLAIN_POTIONS = new Set(["water", "mundane", "thick", "awkward", "empty"]);
const WHITE = "#FFFFFF", GRAY = "#AAAAAA", BLUE = "#5555FF", RED = "#FF5555", AQUA = "#55FFFF", YELLOW = "#FFFF55", PINK = "#FF55FF";
const RARE = new Set(["beacon", "conduit", "end_crystal", "golden_apple", "trident"]), EPIC = new Set(["dragon_egg", "enchanted_golden_apple", "command_block"]);
const UNCOMMON = new Set(["experience_bottle", "dragon_breath", "elytra", "enchanted_book", "skeleton_skull", "wither_skeleton_skull", "zombie_head", "player_head",
  "creeper_head", "dragon_head", "nether_star", "totem_of_undying", "heart_of_the_sea", "creeper_banner_pattern", "skull_banner_pattern"]);
const ONE_LEVEL = new Set(["mending", "infinity", "silk_touch", "flame", "channeling", "multishot", "aqua_affinity", "binding_curse", "vanishing_curse"]);
const GLINTS = new Set(["enchanted_golden_apple", "experience_bottle", "nether_star", "enchanted_book", "end_crystal"]);

export function readInventory(text, items, endIgt) {
  const S = [], keys = new Map(), e = [];
  let last = 0;
  const bare = s => String(s || "").replace(/^minecraft:/, "");
  const name = id => items.names[id] || id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const roman = n => items.text["enchantment.level." + n] || String(n);
  const stack = v => {
    const id = bare(v.id), tag = v.tag || {}, lines = [];
    let m = id, g = false, c = null, color = WHITE, title = name(id);
    // icon: the variants the inventory shows
    if (id === "crossbow" && tag.Charged) m = (tag.ChargedProjectiles || []).some(p => bare(p.id) === "firework_rocket") ? "crossbow_firework" : "crossbow_arrow";
    if (id === "compass" && tag.LodestonePos) title = items.names.lodestone_compass || "Lodestone Compass";
    // potions and tipped arrows: colour and name from the potion
    if (/^(potion|splash_potion|lingering_potion|tipped_arrow)$/.test(id)) {
      const p = bare(tag.Potion) || "empty", base = p.replace(/^(long|strong)_/, "");
      c = POTION_COLOR[base] || POTION_COLOR.water;
      title = (items.potion[id] || {})[base] || title;
      if (!PLAIN_POTIONS.has(base)) {
        if (id !== "tipped_arrow") g = true;
        const eff = items.effect[base === "leaping" ? "jump_boost" : base === "swiftness" ? "speed" : base === "healing" ? "instant_health" : base === "harming" ? "instant_damage" : base] || title;
        lines.push([eff + (p.startsWith("strong_") ? " " + (items.text["potion.potency.1"] || "II") : ""), base === "harming" || base === "poison" || base === "slowness" || base === "weakness" ? RED : BLUE]);
      }
    }
    // a custom name (e.g. an explorer map)
    if (tag.display && tag.display.Name) {
      try { const j = JSON.parse(tag.display.Name); title = j.translate ? items.text[j.translate] || title : j.text || title; } catch {}
    }
    const ench = [...(tag.Enchantments || []), ...(tag.StoredEnchantments || [])];
    if (ench.length || GLINTS.has(id)) g = true;
    color = EPIC.has(id) ? PINK : ench.length && !(tag.StoredEnchantments) ? AQUA : RARE.has(id) ? AQUA : UNCOMMON.has(id) ? YELLOW : WHITE;
    if (tag.display && tag.display.Name) color = color === WHITE ? WHITE : color;
    lines.unshift([title, color]);
    for (const en of ench) {
      const k = bare(en.id), nm = items.ench[k] || k;
      lines.push([ONE_LEVEL.has(k) && en.lvl === 1 ? nm : nm + " " + roman(en.lvl), /curse/.test(k) ? RED : GRAY]);
    }
    if (id === "firework_rocket" && tag.Fireworks && tag.Fireworks.Flight != null) lines.push([(items.text["item.minecraft.firework_rocket.flight"] || "Flight Duration:") + " " + tag.Fireworks.Flight, GRAY]);
    if (id === "crossbow" && tag.ChargedProjectiles && tag.ChargedProjectiles.length) lines.push([(items.text["item.minecraft.crossbow.projectile"] || "Projectile:") + " [" + name(bare(tag.ChargedProjectiles[0].id)) + "]", WHITE]);
    // shulker boxes: the first five things inside, like the game's tooltip
    if (/shulker_box$/.test(id) && tag.BlockEntityTag && tag.BlockEntityTag.Items) {
      const inside = tag.BlockEntityTag.Items;
      inside.slice(0, 5).forEach(x => lines.push([name(bare(x.id)) + " x" + (x.Count || 1), WHITE]));
      if (inside.length > 5) lines.push([(items.text["container.shulkerBox.more"] || "and %s more...").replace("%s", inside.length - 5), WHITE]);
    }
    const md = maxDamage(id), dmg = +tag.Damage || 0;
    const s = {m: items.index[m] != null ? m : items.index[id] != null ? id : "barrier", n: lines};
    if (g) s.g = 1;
    if (c) s.c = c;
    if (md && dmg > 0) s.d = Math.max(0, Math.round(13 - dmg * 13 / md));
    const k = JSON.stringify(s);
    if (!keys.has(k)) { keys.set(k, S.length); S.push(s); }
    return keys.get(k);
  };
  for (const line of text.split("\n")) {
    if (!line.includes('"inventory_slots"')) continue;
    let x; try { x = JSON.parse(line); } catch { continue; }
    const igt = x.speedrunigt && x.speedrunigt.igt;
    if (igt == null || (endIgt && igt > endIgt + 1000) || Math.round(igt / 100) < last) continue;
    const t = Math.max(0, Math.round(igt / 100) - last); last += t;
    for (const [slot, v] of Object.entries((x.data && x.data.slots) || {})) {
      const n = +slot; if (!(n >= 0 && n <= 40)) continue;
      if (!v || !v.id || bare(v.id) === "air") e.push(t, n, 0, 0);
      else e.push(t, n, stack(v) + 1, v.Count || 1);
    }
  }
  return e.length ? {s: S, e} : null;
}

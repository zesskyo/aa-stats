/*
 * config.js — settings that decide what the site shows and in which order.
 * Minecraft data (advancement names, biome groups) also lives here.
 */

// ---------- Advancement names (id in the log → name shown on the site) ----------
const ADV = {
  "story/root":"Minecraft","story/mine_stone":"Stone Age","story/upgrade_tools":"Getting an Upgrade","story/smelt_iron":"Acquire Hardware",
  "story/obtain_armor":"Suit Up","story/lava_bucket":"Hot Stuff","story/iron_tools":"Isn't It Iron Pick","story/deflect_arrow":"Not Today, Thank You",
  "story/form_obsidian":"Ice Bucket Challenge","story/mine_diamond":"Diamonds!","story/enter_the_nether":"We Need to Go Deeper",
  "story/shiny_gear":"Cover Me with Diamonds","story/enchant_item":"Enchanter","story/cure_zombie_villager":"Zombie Doctor",
  "story/follow_ender_eye":"Eye Spy","story/enter_the_end":"The End?",
  "nether/root":"Nether","nether/return_to_sender":"Return to Sender","nether/find_bastion":"Those Were the Days",
  "nether/obtain_ancient_debris":"Hidden in the Depths","nether/fast_travel":"Subspace Bubble","nether/find_fortress":"A Terrible Fortress",
  "nether/obtain_crying_obsidian":"Who is Cutting Onions?","nether/distract_piglin":"Oh Shiny","nether/ride_strider":"This Boat Has Legs",
  "nether/uneasy_alliance":"Uneasy Alliance","nether/loot_bastion":"War Pigs","nether/use_lodestone":"Country Lode, Take Me Home",
  "nether/netherite_armor":"Cover Me in Debris","nether/get_wither_skull":"Spooky Scary Skeleton","nether/obtain_blaze_rod":"Into Fire",
  "nether/charge_respawn_anchor":"Not Quite \"Nine\" Lives","nether/explore_nether":"Hot Tourist Destinations","nether/summon_wither":"Withering Heights",
  "nether/brew_potion":"Local Brewery","nether/create_beacon":"Bring Home the Beacon","nether/all_potions":"A Furious Cocktail",
  "nether/create_full_beacon":"Beaconator","nether/all_effects":"How Did We Get Here?",
  "end/root":"The End","end/kill_dragon":"Free the End","end/dragon_egg":"The Next Generation","end/enter_end_gateway":"Remote Getaway",
  "end/respawn_dragon":"The End... Again...","end/dragon_breath":"You Need a Mint","end/find_end_city":"The City at the End of the Game",
  "end/elytra":"Sky's the Limit","end/levitate":"Great View From Up Here",
  "adventure/root":"Adventure","adventure/voluntary_exile":"Voluntary Exile","adventure/kill_a_mob":"Monster Hunter","adventure/trade":"What a Deal!",
  "adventure/honey_block_slide":"Sticky Situation","adventure/ol_betsy":"Ol' Betsy","adventure/sleep_in_bed":"Sweet Dreams",
  "adventure/hero_of_the_village":"Hero of the Village","adventure/throw_trident":"A Throwaway Joke","adventure/shoot_arrow":"Take Aim",
  "adventure/kill_all_mobs":"Monsters Hunted","adventure/totem_of_undying":"Postmortal","adventure/summon_iron_golem":"Hired Help",
  "adventure/two_birds_one_arrow":"Two Birds, One Arrow","adventure/whos_the_pillager_now":"Who's the Pillager Now?","adventure/arbalistic":"Arbalistic",
  "adventure/adventuring_time":"Adventuring Time","adventure/very_very_frightening":"Very Very Frightening","adventure/sniper_duel":"Sniper Duel",
  "adventure/bullseye":"Bullseye",
  "husbandry/root":"Husbandry","husbandry/breed_an_animal":"The Parrots and the Bats","husbandry/tame_an_animal":"Best Friends Forever",
  "husbandry/plant_seed":"A Seedy Place","husbandry/tactical_fishing":"Tactical Fishing","husbandry/fishy_business":"Fishy Business",
  "husbandry/bred_all_animals":"Two by Two","husbandry/complete_catalogue":"A Complete Catalogue","husbandry/balanced_diet":"A Balanced Diet",
  "husbandry/obtain_netherite_hoe":"Serious Dedication","husbandry/safely_harvest_honey":"Bee Our Guest","husbandry/silk_touch_nest":"Total Beelocation"
};

// The one advancement a Thunderless run is allowed to miss
const VVF = "adventure/very_very_frightening";

// ---------- Multi-criteria advancements drawn as their own lines on the graph ----------
// id → short name used in labels
const MULTI = {
  "adventure/adventuring_time": "AT",
  "husbandry/balanced_diet": "ABD",
  "adventure/kill_all_mobs": "MH",
  "husbandry/bred_all_animals": "2x2",
  "husbandry/complete_catalogue": "ACC",
};
// How many criteria each needs (used for "12/42" while it's unfinished)
const REQ = {
  "adventure/adventuring_time": 42,
  "husbandry/balanced_diet": 39,
  "adventure/kill_all_mobs": 33,
  "husbandry/bred_all_animals": 19,
  "husbandry/complete_catalogue": 11,
};
// Line colour for each (the colours themselves are defined in app.css as --s0 … --s5)
const MCOL = {
  adv: "var(--s0)",
  "adventure/adventuring_time": "var(--s1)",
  "husbandry/balanced_diet": "var(--s2)",
  "adventure/kill_all_mobs": "var(--s3)",
  "husbandry/bred_all_animals": "var(--s4)",
  "husbandry/complete_catalogue": "var(--s5)",
};
// Icon file (in the icons folder) for each
const MICON = {
  "adventure/adventuring_time": "boots",
  "husbandry/balanced_diet": "m_abd",
  "adventure/kill_all_mobs": "m_mh",
  "husbandry/bred_all_animals": "m_2x2",
  "husbandry/complete_catalogue": "m_acc",
};

// ---------- Splits, in order. Names are shown on the site. ----------
// How each split is detected lives in splits.js.
// The item shown next to each sub-split (see findSubSplits in splits.js): its name in Minecraft, as in items/items.json,
// or "icon:<name>" for one of the site's own icons (icons/<name>.png)
const SUB_ITEMS = {
  "Overworld": "grass_block", "Nether": "netherrack", "Bastion": "gilded_blackstone", "Fortress": "nether_bricks", "Blind": "blaze_rod",
  "Stronghold": "ender_eye", "End": "end_stone",
  "Elytra": "elytra", "End Leave": "ender_pearl",
  "Setup": "brewing_stand", "Raid": "icon:ominous_banner", "Monument": "prismarine_bricks", "HDWGH": "potion", "End Again": "end_crystal",
};

/*
 * The Midgame checklist (findMidgame in splits.js): what's shown under Midgame, for the kind of place the runner is in
 * ("area": see areaOf in parse-log.js; shown until they've been out of it for a few seconds). Each entry is a split:
 *   start  "mid": when Midgame starts; "enter": the first time in its area that gets something done (a pass through
 *          that gets nothing done doesn't count); "first": the first thing done for it (with "activity", the first of those)
 *   time   "clock": all the time from its start; "area": only the time spent in its area, on visits that got something
 *          done (in the Overworld, any visit of MIN_STAY or more too: looking around counts, passing through doesn't);
 *          "active": only the "lead" before each thing done for it (less, when the thing before was closer); "farm": the
 *          skull farming time, as the Skulls split works it out (findSkullSplit in stats.js)
 *   end    "done": everything done; "leave": leaving its area once everything's done; "doneOrLeave": either, leaving
 *          counting once all but "optional" is done
 * Goals: ["biome", name] (Adventuring Time), ["food", [items]] (eaten, or in the inventory: any of the items), ["bred",
 * animal] (Two by Two), ["kill", mob] (Monster Hunter), ["adv", id], ["cats"] (A Complete Catalogue), and count/need
 * (a timeline in the run's stats, and how many). Under the split it's on, what's left: "Biomes 3/5", "Foods 1/2", and
 * the rest by name. Without a start, it isn't timed: just what's left of it. activity: more of the run's stats that count
 * as getting something done for it (for "enter"). item: its icon, an item's name, or "mh:<mob>" (and so on, see goalIcon in splits.js) for one of the
 * stats site's own icons. A counter (no target, no split) has need: null; needIfNot: [advancement, need], a different target
 * while that advancement isn't done. info: a rate the timer shows with it ("tnt": TNT used per debris found with TNT, and netherrack mined,
 * "kills": skulls got out of wither skeletons killed, like 3/64). notBefore: a kind of goal ("food") that, done before the split started (stews made
 * beforehand), means it isn't a split in that run. Nothing done in Post-endgame is a split either (it's a leftover). Under the split it's on, what's left, in groups: "Biomes", "Foods", "Breeds",
 * "Kills", a counter, and advancements by name, each with the icons of what's missing in it (see goalIcon in splits.js).
 * Anything not done by the end of Midgame is a leftover, shown in Post-endgame.
 */
const NETHER = ["nether", "crimson", "warped", "fortress", "bastion"];
const MIDGAME = [
  // the rare biomes: time spent there
  {key: "mushroom", name: "Mushroom Island", item: "red_mushroom_block", area: ["mushroom"], start: "enter", time: "area", end: "leave",
    goals: [["biome", "mushroom_fields"], ["biome", "mushroom_field_shore"], ["food", ["mushroom_stew"]], ["food", ["suspicious_stew"]], ["bred", "mooshroom"]], notBefore: "food"},
  {key: "badlands", name: "Badlands", item: "terracotta", area: ["badlands"], start: "enter", time: "area", end: "done",
    goals: [["biome", "badlands"], ["biome", "badlands_plateau"], ["biome", "wooded_badlands_plateau"], ["kill", "cave_spider"]]},
  {key: "jungle", name: "Jungle", item: "jungle_log", area: ["jungle"], start: "enter", time: "area", end: "done",
    goals: [["biome", "jungle"], ["biome", "jungle_hills"], ["biome", "jungle_edge"], ["biome", "bamboo_jungle"], ["biome", "bamboo_jungle_hills"],
      ["food", ["melon_slice"]], ["food", ["cookie", "cocoa_beans"]], ["bred", "ocelot"], ["bred", "panda"]]},
  {key: "snowy", name: "Snowy", item: "snow_block", area: ["snowy"], start: "enter", time: "area", end: "doneOrLeave",
    goals: [["biome", "snowy_tundra"], ["biome", "snowy_mountains"], ["biome", "snowy_taiga"], ["biome", "snowy_taiga_hills"], ["biome", "snowy_beach"], ["biome", "frozen_river"],
      ["kill", "stray"], ["adv", "story/cure_zombie_villager"]],
    optional: ["Zombie Doctor"]},   // (Snowy can end on leaving with only this missing: it's sometimes done somewhere else)
  {key: "taiga", name: "Taiga", item: "spruce_log", area: ["taiga"], start: "enter", time: "area", end: "done",
    goals: [["biome", "taiga"], ["biome", "taiga_hills"], ["food", ["sweet_berries"]], ["bred", "fox"], ["bred", "wolf"]]},
  // villages, the ocean and deserts: from the start of Midgame
  {key: "cats", name: "Cats", item: "cod", area: ["village"], start: "mid", time: "clock", end: "done", goals: [["cats"]]},
  {key: "shells", name: "Nautilus Shells", item: "nautilus_shell", area: ["ocean"], start: "mid", time: "clock", end: "done", count: "nautilus", need: 8},
  {key: "trident", name: "Trident", item: "trident", area: ["ocean"], start: "mid", time: "clock", end: "done", count: "trident", need: 1},
  {key: "beacon", name: "Beacon Blocks", item: "gold_block", area: ["ocean", "bastion"], start: "mid", time: "clock", end: "done", count: "beacon", need: 164},
  {key: "godapple", name: "God Apple", item: "enchanted_golden_apple", area: ["desert"], start: "mid", time: "clock", end: "done", count: "gapple", need: 1},
  // the Nether: time spent there, on visits that got something done for it (shown first there)
  // (the same as the Skulls split on a run's page: findSkullSplit in stats.js)
  {key: "skulls", name: "Skulls", item: "wither_skeleton_skull", area: NETHER, start: "enter", time: "farm", end: "done",
    count: "skulls", need: 3, activity: ["ws", "skulls"], info: "kills"},
  {key: "alliance", name: "Uneasy Alliance", item: "ghast_tear", area: NETHER, start: "enter", time: "area", end: "done",
    count: "tears", need: 4, countName: "Ghast Tears", activity: ["ghasts", "tears"], goals: [["adv", "nether/return_to_sender"], ["adv", "nether/uneasy_alliance"]]},
  // the rest, wherever and whenever it's done: only the time just before each thing (up to "lead") counts, so what's left
  // for later in the run doesn't stretch it
  {key: "ocean", name: "Ocean Misc", item: "heart_of_the_sea", area: ["ocean"], start: "first", time: "active", lead: 120000, end: "done",
    goals: [["biome", "warm_ocean"], ["biome", "lukewarm_ocean"], ["biome", "deep_lukewarm_ocean"], ["biome", "cold_ocean"], ["biome", "deep_cold_ocean"], ["biome", "deep_frozen_ocean"],
      ["food", ["cod"]], ["food", ["salmon"]], ["food", ["tropical_fish"]], ["food", ["pufferfish"]], ["food", ["cooked_cod"]], ["food", ["cooked_salmon"]], ["food", ["dried_kelp"]],
      ["bred", "turtle"], ["kill", "elder_guardian"], ["kill", "drowned"]]},   // (not the guardian: often killed later)
  {key: "animals", name: "Animals Misc", item: "wheat", area: ["plains", "other", "village", "desert"], start: "first", time: "active", lead: 120000, end: "done",
    // (the bee isn't here: usually bred in Endgame)
    goals: [["biome", "forest"], ["biome", "wooded_hills"], ["biome", "birch_forest"], ["biome", "birch_forest_hills"], ["biome", "dark_forest"],
      ["biome", "mountains"], ["biome", "wooded_mountains"], ["biome", "stone_shore"],
      ["bred", "sheep"], ["bred", "cow"], ["bred", "pig"], ["bred", "chicken"], ["bred", "rabbit"], ["bred", "llama"], ["bred", "horse"], ["bred", "donkey"], ["bred", "mule"],
      ["food", ["mutton"]], ["food", ["cooked_mutton"]], ["food", ["beef"]], ["food", ["cooked_beef"]], ["food", ["porkchop"]], ["food", ["cooked_porkchop"]],
      ["food", ["chicken"]], ["food", ["cooked_chicken"]], ["food", ["rabbit"]], ["food", ["cooked_rabbit"]], ["food", ["rabbit_stew"]]]},
  {key: "nethermisc", name: "Nether Misc", item: "warped_fungus_on_a_stick", area: NETHER, start: "first", time: "active", lead: 120000, end: "done",
    goals: [["nbiome", "nether_wastes"], ["nbiome", "crimson_forest"], ["nbiome", "warped_forest"], ["nbiome", "soul_sand_valley"], ["nbiome", "basalt_deltas"],
      ["bred", "hoglin"], ["bred", "strider"], ["adv", "nether/ride_strider"],
      ["kill", "hoglin"], ["kill", "zoglin"], ["kill", "piglin"], ["kill", "zombified_piglin"], ["kill", "blaze"], ["kill", "magma_cube"]]},
  // (netherite: 20 debris for the armour and the hoe; 24 when the lodestone for Country Lode is still needed too)
  // (not timed: it has its own split, Debris)
  {key: "debris", name: "Debris", item: "ancient_debris", area: NETHER, count: "netherite", need: 20, info: "tnt",
    needIfNot: ["nether/use_lodestone", 24]},
];

// The Midgame checklist's splits on a run's page, by where they're done (keys of MIDGAME; the ones that aren't timed
// aren't shown there)
const MID_GROUPS = [
  ["Biomes", ["mushroom", "badlands", "jungle", "snowy", "taiga"]],
  ["Overworld", ["cats", "shells", "trident", "beacon", "godapple", "ocean", "animals"]],
  ["Nether", ["skulls", "alliance", "nethermisc"]],
];
// The areas on the Midgame timeline (areaOf in parse-log.js): name, icon, colour; in this order, those visited (visits
// under 3 seconds aren't shown, and ones less than 10 seconds apart are joined)
const AREA_LANES = {
  mushroom: ["Mushroom Island", "red_mushroom_block", "var(--s2)"], badlands: ["Badlands", "terracotta", "var(--s2)"], jungle: ["Jungle", "jungle_log", "var(--s2)"],
  snowy: ["Snowy", "snow_block", "var(--s2)"], taiga: ["Taiga", "spruce_log", "var(--s2)"],
  village: ["Village", "bell", "var(--s0)"], ocean: ["Ocean", "prismarine", "var(--s1)"], desert: ["Desert", "sand", "var(--s0)"],
  other: ["Elsewhere", "grass_block", "var(--muted)"],   // (plains go here too)
  nether: ["Nether", "netherrack", "var(--ne)"], end: ["The End", "end_stone", "var(--en)"],   // (all of the Nether is one)
};

const SPLITS = [
  {name: "Any%",         icon: "dragon"},
  {name: "Outer End",    icon: "chorus"},
  {name: "Enchanting",   icon: "enchant"},
  {name: "Midgame",      icon: "elytra"},
  {name: "Debris",       icon: "debris"},
  {name: "Endgame",      icon: "bucket"},
  {name: "Post-endgame", icon: null},      // icon comes from the run's last advancement (LAST_ICON below)
];
// Split colours (defined in app.css as --split0 … --split6)
const SCOL = SPLITS.map((_, i) => "var(--split" + i + ")");

// Which splits get a time card on the Stats page and a column in the runs table (numbers = position in SPLITS).
// Any% and Outer End show when they ended; the others show when they started.
const SPLIT_CARDS = [0, 3, 5, 6];
// Which splits appear under "Fastest Splits" on Overview
const FASTEST_SPLITS = [0, 1, 2, 3, 4, 5];
// Extra splits shown after the splits: "skulls" or an advancement id (shows when it was completed)
const OTHER_SPLITS = ["end/elytra", "skulls", "adventure/adventuring_time", "husbandry/complete_catalogue"];

// Post-endgame icon depends on the last advancement of the run
const LAST_ICON = {...MICON, "adventure/throw_trident": "trident", "end/respawn_dragon": "dragon", "adventure/very_very_frightening": "trident"};
const FALLBACK_LAST_ICON = "star";

// ---------- Stats cards, in the order shown ----------
// Stats page ("Run stats") and Overview ("Average stats") use the same list.
const STAT_CARDS = ["deaths", "elytra", "skulls", "tntPerDebris", "shulkers", "creepers"];

// ---------- Rare Adventuring Time biome groups ----------
const RARE = [
  {key: "b_mushroom",  name: "Mushroom",   members: ["mushroom_fields", "mushroom_field_shore"]},
  {key: "b_badlands",  name: "Badlands",   members: ["badlands", "badlands_plateau", "wooded_badlands_plateau"]},
  {key: "b_jungle",    name: "Jungle",     members: ["jungle", "jungle_edge", "jungle_hills", "bamboo_jungle", "bamboo_jungle_hills"]},
  {key: "b_snowy",     name: "Snowy",      members: ["snowy_tundra", "snowy_beach", "snowy_mountains", "snowy_taiga", "snowy_taiga_hills"]},
  {key: "b_megataiga", name: "Mega Taiga", members: ["giant_tree_taiga", "giant_tree_taiga_hills"]},
];

// Criterion names to shorten (as they'd otherwise appear → what to show)
const CRIT_RENAME = {"British Shorthair": "British", "All Black": "Black"};

// ---------- Rules of thumb (times in milliseconds: 60000 = 1 minute) ----------
const RULES = {
  campfireToHoney: 45 * 60000,     // a campfire starts (early) Endgame only if Bee Our Guest comes within this after it
  postEndgameMin: 5 * 60000,        // a Post-endgame shorter than this is folded into Endgame
  enchantPickupGap: 15 * 60000,     // enchanting-table pickups closer than this count as one enchanting session
  debrisSessionGap: 10 * 60000,     // debris mined closer together than this counts as one debris session
  skullIdleGap: 60000,              // skull split pauses after this long without a kill or skull
  pickupAfterDeath: 2 * 60000,      // pickups this soon after a death are dropped items, not new ones
  rareVisitGap: 10 * 60000,         // biome criteria closer than this count as one visit
  riptideGap: 60000,                // trident uses closer than this count as one riptide session
  riptideMinUses: 5,                // a session needs at least this many uses (single throws like A Throwaway Joke don't count)
  riptideMinSpacing: 450,           // uses closer than this are counted once (a riptide can't be charged that fast)
};

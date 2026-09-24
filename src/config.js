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
const OTHER_SPLITS = ["skulls", "adventure/adventuring_time", "husbandry/complete_catalogue"];

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

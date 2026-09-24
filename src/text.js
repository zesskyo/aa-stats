/*
 * text.js — every word shown on the site.
 * These are the defaults for every site. A site changes its own words in its site.json, e.g.
 *   {"siteTitle": "AA No Reset Solo", "siteSubtitle": "(My Log)", "colTime": "Time"}
 */
const T = {
  // Header
  siteTitle: "AA No Reset Solo",
  siteSubtitle: "",
  tabOverview: "Overview",
  tabStats: "Stats",
  tabCompare: "Compare",

  // Overview page
  pb: "PB",
  noPbYet: "The fastest valid run shows here once a run is added.",
  sumOfBest: "Sum of best",
  averageTime: "Average time",
  totalRuns: "Total runs",
  totalPlaytime: "Total playtime",
  fastestSplits: "Fastest Splits",
  averageStats: "Average stats",
  runsTitle: "Runs",
  noRunsYet: "No runs yet.",
  noRunYet: "No run yet",
  averagePrefix: "avg",

  // Runs table column headings
  colRun: "Run",
  colDate: "Date",
  colHundred: "100%",
  colTime: "Time (IGT)",

  // Note shown when hovering the "100%" heading in the runs table (HTML allowed)
  hundredNote: `<b>100%:</b> No = thunderless* (79/80 adv.) unless otherwise stated.<br>*The player is incentivised to prioritise obtaining a Trident enchanted with Channeling, and to not have slept**.<br>**If the player has slept, they must wait at least 10 minutes (min. weather cycle) until they can declare a "thunderless" run.`,

  // "100%" column values
  hundredYes: "Yes",
  hundredNo: "No",
  hundredInvalid: "Invalid",

  // Other splits (shown under the split splits on Overview)
  skullsSplit: "Skulls",

  // Stats page
  runWord: "Run",
  seedLabel: "Seed:",
  timeLabel: "Time (IGT)",
  video: "Video",
  watchVideo: "Watch the video",
  goToRun: "Go to run",
  noSuchRun: "No run",
  previousRun: "Previous run",
  nextRun: "Next run",
  invalidRun: "Invalid run.",
  invalidRunMissing: "Missing",
  invalidRunNote: "It's left out of PBs and bests.",
  splitsTitle: "Splits",
  progressTitle: "Progress over IGT",
  fullScreen: "Full screen",
  exitFullScreen: "Exit full screen",
  showing: "Showing",
  reset: "Reset",
  keysHelp: `<span>Drag to zoom</span><span><kbd>+</kbd><kbd>−</kbd> zoom</span><span><kbd>←</kbd><kbd>→</kbd> move</span><span><kbd>0</kbd> reset</span><span><kbd>F</kbd> full screen</span><span><kbd>[</kbd><kbd>]</kbd> previous / next run</span>`,
  overworld: "Overworld",
  nether: "Nether",
  theEnd: "The End",
  lineAdvancements: "Advancements",
  runStatsTitle: "Run stats",
  debrisTitle: "Debris",
  skullsTitle: "Skulls",
  rareBiomesTitle: "Rare biomes",
  notesTitle: "Notes",
  noDebris: "No debris session found in this log.",
  noSkulls: "No skulls in this log.",
  incomplete: "incomplete",
  missing: "Missing",
  showRunBar: "Show run bar",
  minimise: "Minimise",

  // Compare page
  cmpAdd: "Pick a run…",
  cmpMine: "Runs on this site",
  cmpUploadedRuns: "Your uploaded runs",
  cmpUploaded: "uploaded",
  cmpUpload: "Upload Hermes log",
  cmpReading: "Reading…",
  cmpBadJson: "This isn't a saved run.",
  cmpSave: "Save as a file",
  cmpForget: "Forget uploaded runs",
  cmpKeysHelp: `<span>Drag to zoom</span><span><kbd>+</kbd><kbd>−</kbd> zoom</span><span><kbd>←</kbd><kbd>→</kbd> move</span><span><kbd>0</kbd> reset</span><span><kbd>F</kbd> full screen</span>`,
  cmpSegment: "This split:",
  cmpSkullsTime: "Skulls Split",
  cmpDebrisTime: "Debris Split",
  cmpFinished: "Finished",

  // Graph hover text
  hoverAdv: "Adv",
  hoverGold: "Gold",
  hoverTnt: "TNT",
  tridentMarker: (k, drowned) => `x${k} Trident (Drowned killed: ${drowned})`,
  skullMarker: (k, n, killed) => `${k}/${n} Wither Skulls (Killed: ${killed})`,
  nautilusMarker: (k, n) => `${k}/${n} Nautilus Shells`,
  godAppleMarker: "First God Apple",
  deathMarker: (k, n) => `Death ${k}/${n}`,
  thunderMarker: "Thunder! (Very Very Frightening)",
  riptideMarker: (uses, dur) => `Riptide · ${uses} uses · ${dur}`,
  hoverRiptide: "Riptide",
  multiComplete: name => `${name} complete`,
  multiLast: crit => `Last: ${crit}`,
  debrisHover: (debris, tnt, rack) => `<b class="mono">${debris}</b> debris · <b class="mono">${tnt}</b> TNT` + (rack != null ? ` · <b class="mono">${rack}</b> netherrack` : ""),
  skullsHover: (ws, skulls) => `<b class="mono">${ws}</b> wither skeletons · <b class="mono">${skulls}</b> skulls`,
  rareComplete: "All biomes visited",
  skullOnChart: (k, killed) => `Skull ${k}/3 (Killed: ${killed})`,

  // Labels at the end of lines on the small graphs
  labelDebris: "Debris",
  labelNetherrack: "Netherrack",
  labelTnt: "TNT",
  labelWitherSkeletons: "Wither Skeletons",

  // Screen-reader names for the icon-only stat cards
  statDeaths: "Deaths",
  statElytra: "Elytra distance",
  statSkulls: "Skulls / wither skeletons killed",
  statSkullRate: "Wither skeletons killed per skull",
  statTntPerDebris: "TNT per debris",
  statShulkers: "Shulker Box Interactions",
  statCreepers: "Creeper Kills",
};

// Builds a stats website: <site folder>/dist/index.html
//
// The code lives here (src/, icons/). Each website keeps its own runs in its own folder (a "site folder"):
//   logs/<N>.log           Hermes play.log for run N (the file name is the run number)
//   logs/<N>.stats.json    optional: the world's stats/<uuid>.json, for elytra distance
//   logs/<N>.ghost         optional: Hermes' ghost file (position every tick), for the travel map
//   runs/<N>.json          already-parsed runs (used when there is no log for that number)
//   runs.json              details: date, seed, video, screenshot, notes, deaths. A run that's only in
//                          runs.json (no log) is shown from what's there: time, 100%, splits…
//   <any folder>/<image>   screenshots mentioned in runs.json (copied next to the page)
//   site.json              the site's own words: title, subtitle, or any other text from src/text.js
//   icons/<name>.png       optional: adds or replaces icons
//
// The world record (AA No Reset, 1.16) is the same for every site, so it lives here with the code, in wr/:
//   wr/wr.log, wr/wr.ghost, wr/wr.stats.json like a run, and wr/wr.json: {runner, date, seed, video, notes}.
// Sites rebuild every day, so a new record shows up on all of them by the next day. It's changed here only (not from the sites).
//
// Usage: node build.mjs <site folder>      (no packages to install; the site folder defaults to the current folder)
import fs from "node:fs";
import path from "node:path";
import { readGhost } from "./ghost.mjs";
import { readInventory } from "./inv.mjs";
import { readPng, writePng, pickSquares } from "./png.mjs";

const code = path.dirname(new URL(import.meta.url).pathname);
const site = path.resolve(process.argv[2] || ".");
const inCode = p => path.join(code, p), inSite = p => path.join(site, p);
const read = p => fs.readFileSync(p, "utf8");

// The site's code, in the order it has to run
const FILES = [
  "text.js", "config.js", "helpers.js", "parse-log.js", "runs.js",
  "splits.js", "stats.js", "stat-cards.js", "charts.js",
  "overview.js", "run-page.js", "progress-graph.js", "biomes.js", "seed-map.js", "travel-map.js", "inventory.js", "run-switcher.js", "compare.js", "editor.js", "app.js",
];
const appJs = "(() => {\n\"use strict\";\n" + FILES.map(f => `/* ======== ${f} ======== */\n` + read(inCode("src/" + f))).join("\n") + "\n})();\n";
const appCss = read(inCode("src/app.css"));

// Reuse the site's own log reader so the build and the website always agree
const { parseLog, encodeRun, runKey } = new Function(read(inCode("src/parse-log.js")) + "\nreturn { parseLog, encodeRun, runKey };")();
const T = new Function(read(inCode("src/text.js")) + "\nreturn T;")();
const { SPLITS, SPLIT_CARDS } = new Function(read(inCode("src/config.js")) + "\nreturn { SPLITS, SPLIT_CARDS };")();

// "3:41:22", "3:41:22.629" or "41:22" → milliseconds
const parseTime = (s, where) => {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(String(s).trim());
  if (!m) throw new Error(`${where}: time must look like 3:41:22 (or 3:41:22.629)`);
  return ((+(m[1] || 0) * 60 + +m[2]) * 60 + +m[3]) * 1000 + (m[4] ? +m[4].padEnd(3, "0") : 0);
};
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const copies = [];   // screenshots to copy into dist/
const paths = new Map();   // run number -> travel map points (written to dist/paths/)

// 0) site.json: the site's own words (any text from src/text.js can be changed here)
const text = {};
if (fs.existsSync(inSite("site.json"))) {
  const s = JSON.parse(read(inSite("site.json")));
  for (const [k, v] of Object.entries(s)) {
    if (typeof T[k] === "string" && typeof v === "string") { text[k] = v; T[k] = v; }
    else console.warn(`site.json: "${k}" isn't text the site uses (see src/text.js), so it's ignored`);
  }
}

const runs = new Map();   // run number -> stored run
const clocks = new Map(); // run number -> the parsed run (with its clock), for lining up a ghost file
const logFiles = new Map(); // run number (or "wr") -> its log file, for the inventory replay
const numOf = f => { const m = /^(\d+)\./.exec(f); return m ? Number(m[1]) : null; };

// 1) already-parsed runs
if (fs.existsSync(inSite("runs"))) for (const f of fs.readdirSync(inSite("runs"))) {
  const n = numOf(f); if (n == null || !f.endsWith(".json")) continue;
  runs.set(n, JSON.parse(read(inSite("runs/" + f))));
}
// 2) logs (a log always wins over an older parsed copy)
if (fs.existsSync(inSite("logs"))) for (const f of fs.readdirSync(inSite("logs"))) {
  const n = numOf(f); if (n == null || !/\.(log|txt|jsonl)$/i.test(f)) continue;
  const r = parseLog(read(inSite("logs/" + f)), f);
  r.id = runKey(r);
  clocks.set(n, r); logFiles.set(n, inSite("logs/" + f));
  runs.set(n, encodeRun(r));
  console.log(`Parsed logs/${f} as run ${n}`);
}
// 3) details from runs.json
const details = fs.existsSync(inSite("runs.json")) ? JSON.parse(read(inSite("runs.json"))) : {};
// Runs with no log: only what runs.json says about them
for (const [key, d] of Object.entries(details)) {
  const n = Number(key);
  if (!/^\d+$/.test(key)) throw new Error(`runs.json: "${key}" should be a run number`);
  if (runs.has(n)) continue;
  runs.set(n, {manual: true, id: "run-manual-" + n, start: 0, player: "", finalIgt: d.time != null ? parseTime(d.time, `runs.json run ${n}`) : null,
    finalRta: 0, events: [], dims: [], deaths: [], st: {}, tot: {}});
  console.log(`Run ${n} has no log: using runs.json only`);
}
const out = [];
for (const [n, run] of [...runs].sort((a, b) => a[0] - b[0])) {
  const d = details[String(n)] || {};
  const meta = {num: n};
  for (const k of ["date", "seed", "video", "notes"]) if (d[k] != null && d[k] !== "") meta[k] = String(d[k]);
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`runs.json run ${n}: date must look like 2026-09-22`);
  if (meta.video && !/^https?:\/\//i.test(meta.video)) throw new Error(`runs.json run ${n}: video must start with http:// or https://`);
  const intent = {};
  (d.intentionalDeaths || []).forEach(k => { intent[k - 1] = true; });
  (d.notIntentionalDeaths || []).forEach(k => { intent[k - 1] = false; });
  if (Object.keys(intent).length) meta.intent = intent;
  // how deaths happened, where the log's guess isn't right: {"2": "Jumped into lava"}
  if (d.deathCauses && typeof d.deathCauses === "object") {
    const causes = {};
    for (const [k, v] of Object.entries(d.deathCauses)) if (/^\d+$/.test(k) && typeof v === "string" && v.trim()) causes[+k - 1] = v.trim().slice(0, 120);
    if (Object.keys(causes).length) meta.deathCauses = causes;
  }
  if (d.elytraKm != null) meta.elytraCm = Math.round(Number(d.elytraKm) * 100000);
  // proof: a screenshot in this site's folder (copied next to the page) or a link to one
  if (d.screenshot != null && d.screenshot !== "") {
    const s = String(d.screenshot);
    if (/^https?:\/\//i.test(s)) meta.screenshot = s;
    else {
      const rel = s.replace(/\\/g, "/").replace(/^\.?\//, "");
      if (!IMAGE.test(rel) || rel.split("/").includes("..") || /[^A-Za-z0-9_\-./ ]/.test(rel)) throw new Error(`runs.json run ${n}: screenshot must be an image in this site's folder (like "screenshots/${n}.png") or a link`);
      if (!fs.existsSync(inSite(rel))) throw new Error(`runs.json run ${n}: screenshot "${rel}" doesn't exist`);
      meta.screenshot = rel; copies.push(rel);
    }
  }
  // only for runs without a log (a log already has these)
  if (run.manual) {
    if (d.hundred != null) meta.hundred = !!d.hundred;
    if (d.splits && typeof d.splits === "object") {
      const splits = {};
      for (const [name, t] of Object.entries(d.splits)) {
        const i = SPLIT_CARDS.find(k => SPLITS[k].name.toLowerCase() === name.toLowerCase());
        if (i == null) throw new Error(`runs.json run ${n}: split "${name}" should be one of ${SPLIT_CARDS.map(k => SPLITS[k].name).join(", ")}`);
        if (t != null && t !== "") splits[i] = parseTime(t, `runs.json run ${n} split ${name}`);
      }
      meta.splits = splits;
    }
  }
  // travel map: the ghost file, lined up with the log, saved next to the page as paths/<N>.json
  const ghostFile = inSite(`logs/${n}.ghost`);
  if (fs.existsSync(ghostFile)) {
    const g = clocks.has(n) ? readGhost(fs.readFileSync(ghostFile), clocks.get(n)) : null;
    if (g) { paths.set(n, g); meta.path = `paths/${n}.json`; console.log(`Read logs/${n}.ghost: ${g.t.length} points`); }
    else console.warn(`logs/${n}.ghost: ${clocks.has(n) ? "doesn't match the run's log (another world?)" : "needs logs/" + n + ".log to line it up"}, so it's skipped`);
  }
  const statsFile = inSite(`logs/${n}.stats.json`);
  if (fs.existsSync(statsFile)) {
    const v = ((JSON.parse(read(statsFile)).stats || {})["minecraft:custom"] || {})["minecraft:aviate_one_cm"];
    if (v != null) meta.elytraCm = v;
  }
  out.push({...run, meta});
}

// 3b) the world record (from the code's wr/, the same for every site): read like a run, but kept apart
let wr = null;
const wrLog = ["log", "txt", "jsonl"].map(e => inCode("wr/wr." + e)).find(f => fs.existsSync(f));
const inWr = f => inCode("wr/" + f);
if (wrLog) {
  const r = parseLog(read(wrLog), path.basename(wrLog));
  if (!/^1\.16(\.|$)/.test(r.mc || "")) throw new Error(`wr/${path.basename(wrLog)} is from Minecraft ${r.mc || "(unknown)"}, but the record is for 1.16`);
  r.id = "wr-" + runKey(r);
  const d = fs.existsSync(inWr("wr.json")) ? JSON.parse(read(inWr("wr.json"))) : {};
  const meta = {wr: true};
  for (const k of ["runner", "date", "seed", "video", "notes"]) if (d[k] != null && d[k] !== "") meta[k] = String(d[k]).slice(0, 2000);
  if (!meta.seed && r.seed) meta.seed = String(r.seed);
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error("wr/wr.json: date must look like 2026-09-22");
  if (meta.video && !/^https?:\/\//i.test(meta.video)) throw new Error("wr/wr.json: video must start with http:// or https://");
  if (fs.existsSync(inWr("wr.ghost"))) {
    const g = readGhost(fs.readFileSync(inWr("wr.ghost")), r);
    if (g) { paths.set("wr", g); meta.path = "paths/wr.json"; console.log(`Read wr/wr.ghost: ${g.t.length} points`); }
    else console.warn("wr/wr.ghost doesn't match wr/wr.log (another world?), so it's skipped");
  }
  if (fs.existsSync(inWr("wr.stats.json"))) {
    const v = ((JSON.parse(read(inWr("wr.stats.json"))).stats || {})["minecraft:custom"] || {})["minecraft:aviate_one_cm"];
    if (v != null) meta.elytraCm = v;
  }
  logFiles.set("wr", wrLog); clocks.set("wr", r);
  wr = {...encodeRun(r), meta};
  console.log(`Parsed the world record (wr/${path.basename(wrLog)})`);
}

// 3c) the inventory replay: the inventory through the run, from the log (inv/<N>.json), and the item icons it needs
const items = JSON.parse(read(inCode("items/items.json")));
const invs = new Map(), usedIcons = new Set(["barrier", ...Object.values(items.adv || {}).map(a => a[0])]);
// (criteria that are items, e.g. Balanced Diet's foods, show their own icon in the pop-ups)
for (const r of [...out, ...(wr ? [wr] : [])]) for (const e of r.events || []) { const p = Array.isArray(e) ? e : String(e).split("|"); if (items.index[p[3]] != null && p[2] === "husbandry/balanced_diet") usedIcons.add(p[3]); }
for (const [n, file] of logFiles) {
  const run = n === "wr" ? wr : out.find(r => r.meta.num === n); if (!run) continue;
  const inv = readInventory(read(file), items, clocks.get(n).finalIgt);
  if (!inv) continue;
  inv.s.forEach(x => usedIcons.add(x.m));
  invs.set(n, inv); run.meta.inv = `inv/${n}.json`;
}

// 4) icons: the built-in ones, then the site's own (which win)
const icons = {};
const MIME = {png: "image/png", gif: "image/gif", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg"};
const iconFiles = new Map();   // big icons (the travel map's structure icons, st_*) are files next to the page, not inside it
for (const dir of [inCode("icons"), inSite("icons")]) if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
  const m = /^([a-z0-9_]+)\.(png|gif|webp|jpe?g)$/i.exec(f); if (!m) continue;
  if (m[1].startsWith("st_")) { iconFiles.set(f, path.join(dir, f)); icons[m[1]] = "icons/" + f; continue; }
  icons[m[1]] = `data:${MIME[m[2].toLowerCase()]};base64,` + fs.readFileSync(path.join(dir, f)).toString("base64");
}

// 5) assemble the page
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escHtml((T.siteTitle + " " + T.siteSubtitle).trim())}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
`;
// Which repository this site is, so its owner can add runs from the website (GitHub Actions tells us)
const repo = process.env.GITHUB_REPOSITORY ? {full: process.env.GITHUB_REPOSITORY, branch: process.env.GITHUB_REF_NAME || "main"} : null;
const json = JSON.stringify({runs: out, wr, icons, text, repo}).replace(/</g, "\\u003c");
const html = `<!doctype html>\n<html lang="en">\n<head>\n${head}<style>${appCss}</style>\n</head>\n<body>\n<div id="app"></div>\n<script type="application/json" id="aa-data">${json}</script>\n<script>${appJs}</script>\n</body>\n</html>\n`;
fs.mkdirSync(inSite("dist"), {recursive: true});
fs.writeFileSync(inSite("dist/index.html"), html);
if (paths.size) fs.mkdirSync(inSite("dist/paths"), {recursive: true});
// the biome/structure generator for travel maps of runs with a seed (see wasm/)
if ([...paths.keys()].some(n => (n === "wr" ? wr : out.find(r => r.meta.num === n) || {meta: {}}).meta.seed)) fs.copyFileSync(inCode("wasm/cubiomes.wasm"), inSite("dist/cubiomes.wasm"));
for (const [n, g] of paths) fs.writeFileSync(inSite(`dist/paths/${n}.json`), JSON.stringify(g));
if (invs.size) {
  fs.mkdirSync(inSite("dist/inv"), {recursive: true}); fs.mkdirSync(inSite("dist/items"), {recursive: true});
  for (const [n, inv] of invs) fs.writeFileSync(inSite(`dist/inv/${n}.json`), JSON.stringify(inv));
  // only the icons these runs use, cut out of the big atlas
  const keys = [...usedIcons].filter(k => items.index[k] != null), cols = 16;
  fs.writeFileSync(inSite("dist/items/atlas.png"), writePng(pickSquares(readPng(fs.readFileSync(inCode("items/atlas.png"))), items.size, cols, keys.map(k => items.index[k]))));
  fs.writeFileSync(inSite("dist/items/items.json"), JSON.stringify({size: items.size, cols, index: Object.fromEntries(keys.map((k, i) => [k, i])), adv: items.adv,
    toast: {task: items.text["advancements.toast.task"], goal: items.text["advancements.toast.goal"], challenge: items.text["advancements.toast.challenge"]}}));
  for (const f of fs.readdirSync(inCode("items"))) if (f.endsWith(".png") && f !== "atlas.png") fs.copyFileSync(inCode("items/" + f), inSite("dist/items/" + f));
  fs.mkdirSync(inSite("dist/items/armor"), {recursive: true});
  for (const f of fs.readdirSync(inCode("items/armor"))) fs.copyFileSync(inCode("items/armor/" + f), inSite("dist/items/armor/" + f));
}
if (iconFiles.size) { fs.mkdirSync(inSite("dist/icons"), {recursive: true}); for (const [f, src] of iconFiles) fs.copyFileSync(src, inSite("dist/icons/" + f)); }
for (const rel of copies) { fs.mkdirSync(path.dirname(inSite("dist/" + rel)), {recursive: true}); fs.copyFileSync(inSite(rel), inSite("dist/" + rel)); }
console.log(`Built ${path.relative(process.cwd(), inSite("dist/index.html")) || "dist/index.html"}: ${out.length} runs, ${Object.keys(icons).length} icons, ${(html.length / 1024).toFixed(0)} KB`);

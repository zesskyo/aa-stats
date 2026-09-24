// Builds a stats website: <site folder>/dist/index.html
//
// The code lives here (src/, icons/). Each website keeps its own runs in its own folder (a "site folder"):
//   logs/<N>.log           Hermes play.log for run N (the file name is the run number)
//   logs/<N>.stats.json    optional: the world's stats/<uuid>.json, for elytra distance
//   runs/<N>.json          already-parsed runs (used when there is no log for that number)
//   runs.json              details: date, seed, video, notes, deaths
//   site.json              the site's own words: title, subtitle, or any other text from src/text.js
//   icons/<name>.png       optional: adds or replaces icons
//
// Usage: node build.mjs <site folder>      (no packages to install; the site folder defaults to the current folder)
import fs from "node:fs";
import path from "node:path";

const code = path.dirname(new URL(import.meta.url).pathname);
const site = path.resolve(process.argv[2] || ".");
const inCode = p => path.join(code, p), inSite = p => path.join(site, p);
const read = p => fs.readFileSync(p, "utf8");

// The site's code, in the order it has to run
const FILES = [
  "text.js", "config.js", "helpers.js", "parse-log.js", "runs.js",
  "splits.js", "stats.js", "stat-cards.js", "charts.js",
  "overview.js", "run-page.js", "progress-graph.js", "run-switcher.js", "compare.js", "app.js",
];
const appJs = "(() => {\n\"use strict\";\n" + FILES.map(f => `/* ======== ${f} ======== */\n` + read(inCode("src/" + f))).join("\n") + "\n})();\n";
const appCss = read(inCode("src/app.css"));

// Reuse the site's own log reader so the build and the website always agree
const { parseLog, encodeRun, runKey } = new Function(read(inCode("src/parse-log.js")) + "\nreturn { parseLog, encodeRun, runKey };")();
const T = new Function(read(inCode("src/text.js")) + "\nreturn T;")();

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
  runs.set(n, encodeRun(r));
  console.log(`Parsed logs/${f} as run ${n}`);
}
// 3) details from runs.json
const details = fs.existsSync(inSite("runs.json")) ? JSON.parse(read(inSite("runs.json"))) : {};
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
  if (d.elytraKm != null) meta.elytraCm = Math.round(Number(d.elytraKm) * 100000);
  const statsFile = inSite(`logs/${n}.stats.json`);
  if (fs.existsSync(statsFile)) {
    const v = ((JSON.parse(read(statsFile)).stats || {})["minecraft:custom"] || {})["minecraft:aviate_one_cm"];
    if (v != null) meta.elytraCm = v;
  }
  out.push({...run, meta});
}
for (const n of Object.keys(details)) if (!runs.has(Number(n))) console.warn(`runs.json mentions run ${n}, but there is no logs/${n}.log or runs/${n}.json`);

// 4) icons: the built-in ones, then the site's own (which win)
const icons = {};
const MIME = {png: "image/png", gif: "image/gif", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg"};
for (const dir of [inCode("icons"), inSite("icons")]) if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
  const m = /^([a-z0-9_]+)\.(png|gif|webp|jpe?g)$/i.exec(f); if (!m) continue;
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
const json = JSON.stringify({runs: out, icons, text}).replace(/</g, "\\u003c");
const html = `<!doctype html>\n<html lang="en">\n<head>\n${head}<style>${appCss}</style>\n</head>\n<body>\n<div id="app"></div>\n<script type="application/json" id="aa-data">${json}</script>\n<script>${appJs}</script>\n</body>\n</html>\n`;
fs.mkdirSync(inSite("dist"), {recursive: true});
fs.writeFileSync(inSite("dist/index.html"), html);
console.log(`Built ${path.relative(process.cwd(), inSite("dist/index.html")) || "dist/index.html"}: ${out.length} runs, ${Object.keys(icons).length} icons, ${(html.length / 1024).toFixed(0)} KB`);

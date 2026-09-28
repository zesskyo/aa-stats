// Renders items/atlas.png (every item's icon, as the inventory shows it) and its index in items/items.json, from
// Minecraft 1.16.1's models and textures (a resource pack's assets/minecraft folder), in a headless Chromium.
// Run by the "Render the item icons" workflow (.github/workflows/icons.yml); by hand:
//   npm i --no-save playwright && npx playwright install chromium
//   node items/make/make.mjs <path to assets/minecraft>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const here = path.dirname(new URL(import.meta.url).pathname), itemsDir = path.join(here, "..");
const ROOT = path.resolve(process.argv[2] || "assets/minecraft");

// every item model (not the templates and in-hand variants), plus the variants the inventory can show
let ids = fs.readdirSync(path.join(ROOT, "models/item")).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5))
  .filter(id => !/^template_|_in_hand$|_throwing$|_blocking$|^(compass|clock)_\d+$|_pulling_\d$|^crossbow_(arrow|firework)$|^generated$|^handheld(_rod)?$/.test(id));
ids.push("crossbow_arrow", "crossbow_firework", "ominous_banner");

// the pack and the renderer, served to the browser
const TYPES = {".json": "application/json", ".png": "image/png", ".js": "text/javascript", ".html": "text/html"};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/render.html") { res.writeHead(200, {"Content-Type": "text/html"}); return res.end('<!doctype html><script src="render.js"></script>'); }
  const file = url === "/render.js" ? path.join(here, "render.js") : path.join(ROOT, path.normalize(url));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {"Content-Type": TYPES[path.extname(file)] || "application/octet-stream"}); res.end(data);
  });
});
await new Promise(ok => server.listen(0, "127.0.0.1", ok));

// WebGL without a graphics card: Chromium's software renderer
const browser = await chromium.launch({args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const page = await browser.newPage();
page.on("pageerror", e => console.log("Page error:", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/render.html`);
ids.push(...await page.evaluate(() => window.POTION_IDS));
const res = await page.evaluate(([ids]) => window.renderAll(ids, 32), [ids]);
await browser.close(); server.close();

const n = Object.keys(res.index).length;
console.log(`${n} icons rendered; not rendered: ${res.missing.join(", ") || "none"}`);
if (n < 900) { console.error("Too few icons: something went wrong, so nothing is saved"); process.exit(1); }
fs.writeFileSync(path.join(itemsDir, "atlas.png"), Buffer.from(res.png.split(",")[1], "base64"));
const db = JSON.parse(fs.readFileSync(path.join(itemsDir, "items.json"), "utf8"));
db.index = res.index; db.size = res.size;
fs.writeFileSync(path.join(itemsDir, "items.json"), JSON.stringify(db));
console.log("Saved items/atlas.png and the index in items/items.json");

import { chromium } from "playwright";
import fs from "node:fs";
// Renders items/atlas.png and the icon index from a Minecraft 1.16.1 resource pack (assets/minecraft), in Chromium.
// Usage: node make.mjs <path to assets/minecraft>   (needs playwright; serves that folder on port 8777 first:
//        python3 -m http.server 8777 in it). items.json also has the English names from lang/en_us.json.
const ROOT = process.argv[2] || "assets/minecraft";
const only = process.argv[3] ? process.argv[3].split(",") : null;
let ids = fs.readdirSync(ROOT + "/models/item").filter(f => f.endsWith(".json")).map(f => f.slice(0, -5))
  .filter(id => !/^template_|_in_hand$|_throwing$|_blocking$|^(compass|clock)_\d+$|_pulling_\d$|^crossbow_(arrow|firework)$|^generated$|^handheld(_rod)?$/.test(id));
ids.push("crossbow_arrow", "crossbow_firework");
if (only) ids = only;
fs.copyFileSync("render.js", ROOT + "/render.js");
fs.writeFileSync(ROOT + "/render.html", '<!doctype html><script src="render.js"></script>');
const b = await chromium.launch({executablePath: "/opt/pw-browsers/chromium"});
const p = await b.newPage();
p.on("pageerror", e => console.log("ERR", e.message));
await p.goto("http://127.0.0.1:8777/render.html");
const res = await p.evaluate(([ids]) => window.renderAll(ids, 32), [ids]);
fs.writeFileSync(only ? "test.png" : "atlas.png", Buffer.from(res.png.split(",")[1], "base64"));
if (!only) fs.writeFileSync("index.json", JSON.stringify(res.index));
console.log(Object.keys(res.index).length, "rendered;", res.missing.length, "missing:", res.missing.join(" "));
await b.close();

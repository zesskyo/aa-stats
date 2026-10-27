// Checks how the splits come out on a site's runs: when each one starts and ends, for every run with a log.
//
// With <site folder>/truth.json (the right times, from the runs' videos), it says how far off each one is:
//   {"29": {"Midgame": "3:25:28", "Debris": "3:36:41"}, …}     the time each split ends (IGT, h:mm:ss)
//   ("Debris start" for when Debris starts; any split can be left out)
// Before changing a rule: --save before.json; after: --diff before.json lists the runs whose splits moved.
//
// Usage: node check-splits.mjs <site folder> [--save <file>] [--diff <file>]
import fs from "node:fs";
import path from "node:path";
import { readGhost, ghostFacts } from "./ghost.mjs";

const code = path.dirname(new URL(import.meta.url).pathname), site = path.resolve(process.argv[2] || ".");
const opt = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const read = p => fs.readFileSync(p, "utf8");
const document = {getElementById: () => ({textContent: "{}"})};
const {parseLog, derive} = new Function("document", ["text.js", "config.js", "helpers.js", "parse-log.js", "runs.js", "splits.js", "stats.js"]
  .map(f => read(path.join(code, "src", f))).join("\n") + "\nreturn {parseLog, derive};")(document);

const hms = t => t == null ? "—" : `${Math.floor(t / 3600000)}:${String(Math.floor(t / 60000) % 60).padStart(2, "0")}:${String(Math.floor(t / 1000) % 60).padStart(2, "0")}`;
const parseHms = s => s.split(":").reduce((a, x) => a * 60 + Number(x), 0) * 1000;
const truth = fs.existsSync(path.join(site, "truth.json")) ? JSON.parse(read(path.join(site, "truth.json"))) : {};

// each run's split boundaries: when each split ends (its last stretch), and when Debris starts
const out = {};
const logs = (fs.existsSync(path.join(site, "logs")) ? fs.readdirSync(path.join(site, "logs")) : []).filter(f => /^\d+\.log$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
for (const f of logs) {
  const n = parseInt(f), r = parseLog(read(path.join(site, "logs", f)), f), gf = path.join(site, "logs", n + ".ghost");
  const g = fs.existsSync(gf) ? readGhost(fs.readFileSync(gf), r) : null;
  if (g) Object.assign(r.st, ghostFacts(g, r.st));
  const d = derive(r), b = {};
  for (const s of d.splits) { const segs = s.segs.filter(x => x[1] > x[0]); if (segs.length) b[s.name] = segs[segs.length - 1][1]; }
  const deb = d.splits.find(s => s.name === "Debris");
  if (deb && deb.segs.length) b["Debris start"] = deb.segs[0][0];
  out[n] = {b, ghost: !!g, category: d.category};
}

const names = ["Any%", "Outer End", "Enchanting", "Midgame", "Debris start", "Debris", "Endgame", "Post-endgame"];
console.log("run  " + names.map(x => x.slice(0, 9).padEnd(9)).join(" ") + "  ghost");
for (const [n, o] of Object.entries(out)) console.log(String(n).padEnd(4) + " " + names.map(k => hms(o.b[k]).padEnd(9)).join(" ") + "  " + (o.ghost ? "yes" : "no"));

// against the right times
const errs = [];
for (const [n, want] of Object.entries(truth)) for (const [k, v] of Object.entries(want)) {
  const got = out[n] && out[n].b[k], e = got == null ? null : got - parseHms(v);
  errs.push({n, k, e});
  console.log(`run ${n} ${k}: ${got == null ? "missing" : (e >= 0 ? "+" : "-") + hms(Math.abs(e)) + " off"} (right: ${v}, got: ${hms(got)})`);
}
if (errs.length) {
  const ok = errs.filter(x => x.e != null), within = s => ok.filter(x => Math.abs(x.e) <= s * 1000).length;
  console.log(`\n${errs.length} checked: ${within(10)} within 10s, ${within(60)} within a minute, ${errs.length - ok.length} missing; mean error ${hms(ok.reduce((a, x) => a + Math.abs(x.e), 0) / (ok.length || 1))}`);
}

// before and after a change
if (opt("--save")) fs.writeFileSync(opt("--save"), JSON.stringify(out));
if (opt("--diff")) {
  const was = JSON.parse(read(opt("--diff")));
  let moved = 0;
  for (const [n, o] of Object.entries(out)) for (const k of names) {
    const a = was[n] && was[n].b[k], c = o.b[k];
    if (a !== c && !(a != null && c != null && Math.abs(a - c) < 1000)) { moved++; console.log(`run ${n} ${k}: ${hms(a)} → ${hms(c)} (${a != null && c != null ? (c > a ? "+" : "-") + hms(Math.abs(c - a)) : "new/gone"})`); }
  }
  console.log(moved ? `${moved} boundaries moved` : "Nothing moved");
}

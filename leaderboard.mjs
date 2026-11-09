// The leaderboard (leaderboard/leaderboard.json, every stats site's Leaderboard page) is edited by its owner on their
// stats site (src/leaderboard.js). This checks it against the runs themselves, and changes nothing:
//   - each run on it from a stats site (its proof links there, with a run number): the time and the date of that run
//     (a date more than a day out: logs keep UTC, and runs end past midnight)
//   - each runner's stats site: a run faster than their best on the leaderboard (in either category) that isn't on it
//   - the records (wr/, wr/archive/): on the leaderboard, with the date their log started
// The list goes to the "Leaderboard checks" issue (.github/workflows/wr-watch.yml).
// Usage: node leaderboard.mjs check [--checks checks.md]
import fs from "node:fs";
import path from "node:path";

const code = path.dirname(new URL(import.meta.url).pathname);
const inCode = p => path.join(code, p), read = p => fs.readFileSync(p, "utf8");
const FILE = inCode("leaderboard/leaderboard.json");
const SRC = ["text.js", "config.js", "helpers.js", "parse-log.js", "runs.js", "splits.js", "stats.js"].map(f => read(inCode("src/" + f))).join("\n");
const siteApi = data => new Function("document", SRC + "\nreturn {parseLog, derive, validRuns, runNum, RUNS};")({getElementById: () => ({textContent: JSON.stringify(data)})});
const fmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const thunderfulTime = (r, d) => d.category === "Thunderful" ? r.finalIgt : r.thunderful ? r.thunderful.igt : null;
const dayGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
const runDate = r => r.meta && r.meta.date || (r.start ? new Date(r.start).toISOString().slice(0, 10) : null);
// (the same time: the leaderboard keeps seconds, logs milliseconds)
const near = (a, b) => Math.abs(a - b) <= 1500;

async function siteData(url) {
  const res = await fetch(url, {headers: {"cache-control": "no-cache", "user-agent": "aa-stats"}});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const m = /<script type="application\/json" id="aa-data">([\s\S]*?)<\/script>/.exec(await res.text());
  if (!m) throw new Error("not a stats site");
  return JSON.parse(m[1]);
}

export async function check() {
  const lb = JSON.parse(read(FILE)), checks = [];
  const of = p => lb.entries.filter(e => e.player.toLowerCase() === p.toLowerCase());
  const sites = new Map();
  for (const e of lb.entries) if (e.site && !sites.has(e.site)) sites.set(e.site, e.player);
  for (const [site, player] of sites) {
    let data; try { data = await siteData(site); } catch (err) { checks.push(`- Couldn't read ${site} (${err.message})`); continue; }
    const s = siteApi(data), mine = of(player);
    // the fastest run (and Thunderful run) faster than the runner's best on the leaderboard
    const best = Math.min(...mine.map(e => e.ms)), bestTf = Math.min(...mine.filter(e => e.thunderful).map(e => e.ms));
    let fast = null, fastTf = null;
    for (const r of s.validRuns().filter(r => !r.manual)) {
      const d = s.derive(r), t = thunderfulTime(r, d);
      if (r.finalIgt < best - 1500 && (!fast || r.finalIgt < fast.ms)) fast = {r, ms: r.finalIgt};
      if (t != null && t < bestTf - 1500 && (!fastTf || t < fastTf.ms)) fastTf = {r, ms: t};
    }
    for (const [f, tf] of [[fast, false], [fastTf, true]]) {
      if (!f || tf && fast && fast.r === f.r && near(fast.ms, f.ms)) continue;   // (one run faster in both: listed once)
      const was = tf ? bestTf : best;
      checks.push(`- ${player} ${fmt(f.ms)}${tf ? " (Thunderful)" : ""} on ${runDate(f.r)}: run ${s.runNum(f.r)} on their stats site is faster than their ${tf ? "Thunderful " : ""}best on the leaderboard (${isFinite(was) ? fmt(was) : "none"})`);
    }
    // the leaderboard's runs from this site against the runs themselves
    for (const e of lb.entries.filter(x => x.site === site && x.run)) {
      const r = s.RUNS.find(x => s.runNum(x) === Number(e.run));
      if (!r) { checks.push(`- ${e.player} ${e.time}: ${site} has no run ${e.run}`); continue; }
      const d = s.derive(r), t = e.thunderful && d.category !== "Thunderful" ? thunderfulTime(r, d) : r.finalIgt;
      if (t != null && Math.abs(Math.floor(t / 1000) - Math.floor(e.ms / 1000)) > 1) checks.push(`- ${e.player} ${e.time}: run ${e.run} on their stats site is ${fmt(t)}`);
      const rd = runDate(r); if (rd && e.date && dayGap(rd, e.date) > 1) checks.push(`- ${e.player} ${e.time}: the leaderboard says ${e.date}, run ${e.run} on their stats site is ${rd}`);
    }
  }
  // the records
  const api = siteApi({runs: []});
  for (const dir of ["", ...(fs.existsSync(inCode("wr/archive")) ? fs.readdirSync(inCode("wr/archive")).map(d => "archive/" + d) : [])]) {
    const at = f => inCode(path.join("wr", dir, f)); if (!fs.existsSync(at("wr.log"))) continue;
    const r = api.parseLog(read(at("wr.log")), "wr.log"), j = fs.existsSync(at("wr.json")) ? JSON.parse(read(at("wr.json"))) : {};
    const player = j.runner || r.player, logDate = new Date(r.start).toISOString().slice(0, 10);
    const e = of(player).find(x => near(x.ms, r.finalIgt));
    if (!e) checks.push(`- The record ${player} ${fmt(r.finalIgt)} (wr/${dir}) isn't on the leaderboard`);
    else if (e.date && dayGap(e.date, logDate) > 1) checks.push(`- ${player} ${e.time}: the leaderboard says ${e.date}, the record's log started on ${logDate} (UTC)`);
  }
  return checks;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "check") {
  const checks = await check();
  console.log(checks.length ? "Checks:\n" + checks.join("\n") : "Checks: all match");
  const o = args.indexOf("--checks"); if (o >= 0) fs.writeFileSync(args[o + 1], checks.join("\n"));
} else if (cmd) { console.log("Usage: node leaderboard.mjs check [--checks file]"); process.exit(1); }

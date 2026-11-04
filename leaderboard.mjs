// The leaderboard (leaderboard/leaderboard.json), kept from the leaderboard's Google Sheet for every stats site's
// Leaderboard page, with its history:
//   - each run on the sheet is an entry (both tabs: Thunderless+Thunderful, and Thunderful)
//   - an entry that leaves the sheet stays, as "replaced" (its runner's faster time took its place) or "removed"
//   - the runners' earlier personal bests, from their stats sites (the sheet's "Stats" links) and the records (wr/), are
//     entries too ("replaced"), so the history goes back before the sheet's last version
//   - a date or time that doesn't match the run's own (its log, on its stats site) is listed in the checks (a date more
//     than a day out: logs keep UTC, and runs end past midnight)
// Usage: node leaderboard.mjs sync [--checks checks.md]
import fs from "node:fs";
import path from "node:path";
import {readSheet, dayMs, isoDate} from "./sheet.mjs";

const code = path.dirname(new URL(import.meta.url).pathname);
const inCode = p => path.join(code, p), read = p => fs.readFileSync(p, "utf8");
const FILE = inCode("leaderboard/leaderboard.json");
const SITE_RE = /^https:\/\/[a-z0-9-]+\.github\.io\/[^/?#\s]+\/?/i;
const SRC = ["text.js", "config.js", "helpers.js", "parse-log.js", "runs.js", "splits.js", "stats.js"].map(f => read(inCode("src/" + f))).join("\n");
const siteApi = data => new Function("document", SRC + "\nreturn {parseLog, derive, validRuns, runNum, RUNS};")({getElementById: () => ({textContent: JSON.stringify(data)})});
const fmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const today = () => new Date().toISOString().slice(0, 10);
const keyOf = e => e.player.toLowerCase() + "|" + Math.floor(e.ms / 1000);
// (the same run: the same runner, within a second; the sheet rounds, logs have milliseconds)
const same = (a, b) => a.player.toLowerCase() === b.player.toLowerCase() && Math.abs(a.ms - b.ms) <= 1500;
const siteOf = u => { const m = SITE_RE.exec(u || ""); return m ? m[0].replace(/\/?$/, "/") : null; };
const thunderfulTime = (r, d) => d.category === "Thunderful" ? r.finalIgt : r.thunderful ? r.thunderful.igt : null;
const dayGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

async function siteData(url) {
  const res = await fetch(url, {headers: {"cache-control": "no-cache", "user-agent": "aa-stats"}});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const m = /<script type="application\/json" id="aa-data">([\s\S]*?)<\/script>/.exec(await res.text());
  if (!m) throw new Error("not a stats site");
  return JSON.parse(m[1]);
}
const runDate = r => r.meta && r.meta.date || (r.start ? new Date(r.start).toISOString().slice(0, 10) : null);

// The sheet's runs: one per runner and time, Thunderful when it's on the Thunderful tab or says 100%
function sheetEntries(tabs) {
  const out = new Map();
  for (const tab of tabs) {
    const tfTab = /^thunderful$/i.test(tab.name.trim());
    for (const row of tab.rows) {
      const player = String(row.Player || "").trim(), ms = dayMs(row.Time);
      if (!player || !ms) continue;
      const run = Number.isInteger(row["Run Number"]) ? row["Run Number"] : Number(row["Run Number"]) || null;
      let url = row._links.Proof || null; const site = siteOf(url);
      if (site && !/#\/run\/\d+/.test(url) && run) url = site + "#/run/" + run;   // (a stats site without the run: the run number says which)
      const hundred = row["100%"] ?? row["1"];
      const e = {player, ms, time: fmt(ms), thunderful: tfTab || /^yes$/i.test(String(hundred || "")), date: isoDate(row.Date), run,
        proof: row.Proof ? String(row.Proof).trim() : null, url, site, note: Object.values(row._notes).join("; ") || null};
      const k = keyOf(e), was = out.get(k);
      if (was) { was.thunderful = was.thunderful || e.thunderful; was.note = was.note || e.note; was.url = was.url || e.url; }
      else out.set(k, e);
    }
  }
  return [...out.values()];
}

export async function sync() {
  const lb = fs.existsSync(FILE) ? JSON.parse(read(FILE)) : {entries: []}, before = JSON.stringify(lb.entries);
  const checks = [], log = s => console.log(s);
  const tabs = await readSheet();
  const now = sheetEntries(tabs);
  // what's on the sheet: new entries, and changes to the ones there were (a corrected date, a proof link, a note)
  const find = e => lb.entries.find(x => same(x, e));
  for (const e of now) {
    const was = find(e);
    if (!was) { lb.entries.push({...e, status: "current", added: today()}); log(`New: ${e.player} ${e.time}`); continue; }
    if (was.date && e.date && was.date !== e.date) { log(`Date changed: ${e.player} ${e.time} ${was.date} → ${e.date}`); (was.dates ||= []).push(was.date); }
    Object.assign(was, e, {status: "current"});
  }
  // what's left the sheet: replaced by the runner's faster time, or taken off
  for (const e of lb.entries) if (e.status === "current" && !now.some(x => same(x, e))) {
    const faster = lb.entries.find(x => x !== e && x.status === "current" && x.player.toLowerCase() === e.player.toLowerCase() && x.ms < e.ms && (!e.thunderful || x.thunderful));
    e.status = faster ? "replaced" : "removed"; e.until = faster ? faster.date : today();
    log(`${faster ? "Replaced" : "Removed"}: ${e.player} ${e.time}`);
  }
  // history: earlier personal bests from the runners' stats sites, and the records (wr/)
  const sites = new Map();
  for (const e of lb.entries) if (e.site) sites.set(e.site, e.player);
  for (const [site, player] of sites) {
    let data; try { data = await siteData(site); } catch (err) { checks.push(`- Couldn't read ${site} (${err.message})`); continue; }
    const s = siteApi(data), runs = s.validRuns().filter(r => !r.manual).sort((a, b) => a.start - b.start);
    // (each run that was the runner's best so far, overall and Thunderful)
    let best = Infinity, bestTf = Infinity;
    for (const r of runs) {
      const d = s.derive(r), t = thunderfulTime(r, d), num = s.runNum(r);
      const pb = r.finalIgt < best, pbTf = t != null && t < bestTf;
      if (pb) best = r.finalIgt; if (pbTf) bestTf = t;
      for (const [is, ms, tf] of [[pb, r.finalIgt, d.category === "Thunderful"], [pbTf && !(pb && d.category === "Thunderful"), t, true]]) {
        if (!is || ms == null) continue;
        const e = {player, ms, time: fmt(ms), thunderful: tf, date: runDate(r), run: num, proof: "Stats", url: site + "#/run/" + num, site, note: null};
        if (find(e)) continue;
        // (faster than the runner's place on the sheet in that category: not history, but not on the sheet yet)
        const place = lb.entries.find(x => x.status === "current" && x.player.toLowerCase() === player.toLowerCase() && (!tf || x.thunderful));
        if (!place || ms < place.ms - 1500) { checks.push(`- ${player} ${e.time}${tf ? " (Thunderful)" : ""} on ${e.date}: run ${num} on their stats site is faster than their ${tf ? "Thunderful " : ""}time on the sheet (${place ? place.time : "none"})`); continue; }
        lb.entries.push({...e, status: "replaced", added: today(), from: "stats site"});
      }
    }
    // checks: the sheet's entries from this site against the runs themselves
    for (const e of lb.entries.filter(x => x.site === site && x.status === "current" && x.run)) {
      const r = s.RUNS.find(x => s.runNum(x) === e.run);
      if (!r) { checks.push(`- ${e.player} ${e.time}: ${site} has no run ${e.run}`); continue; }
      const d = s.derive(r), t = e.thunderful && d.category !== "Thunderful" ? thunderfulTime(r, d) : r.finalIgt;
      if (t != null && Math.abs(Math.floor(t / 1000) - Math.floor(e.ms / 1000)) > 1) checks.push(`- ${e.player} ${e.time}: run ${e.run} on their stats site is ${fmt(t)}`);
      const rd = runDate(r); if (rd && e.date && dayGap(rd, e.date) > 1) checks.push(`- ${e.player} ${e.time}: the sheet says ${e.date}, run ${e.run} on their stats site is ${rd}`);
    }
  }
  // the records (wr/ and wr/archive/), with their logs: as entries if they aren't, and their dates checked
  const api = siteApi({runs: []});
  for (const dir of ["", ...(fs.existsSync(inCode("wr/archive")) ? fs.readdirSync(inCode("wr/archive")).map(d => "archive/" + d) : [])]) {
    const at = f => inCode(path.join("wr", dir, f)); if (!fs.existsSync(at("wr.log"))) continue;
    const r = api.parseLog(read(at("wr.log")), "wr.log"), d = api.derive(r), j = fs.existsSync(at("wr.json")) ? JSON.parse(read(at("wr.json"))) : {};
    const player = j.runner || r.player, tf = d.category === "Thunderful", logDate = new Date(r.start).toISOString().slice(0, 10);
    const e = {player, ms: r.finalIgt, time: fmt(r.finalIgt), thunderful: tf, date: j.date || logDate, run: j.run || null,
      proof: j.site ? "Stats" : j.video ? "YouTube" : null, url: j.site ? j.site.replace(/\/?$/, "/") + "#/run/" + j.run : j.video || null, site: j.site || null, video: j.video || null, note: null};
    const have = find(e);
    if (have) { have.record = dir || "wr"; if (j.video && !have.video) have.video = j.video; }
    else lb.entries.push({...e, status: "replaced", added: today(), from: "record", record: dir || "wr"});
    const sheet = lb.entries.find(x => x.status === "current" && same(x, e));
    if (sheet && sheet.date && dayGap(sheet.date, logDate) > 1) checks.push(`- ${player} ${e.time}: the sheet says ${sheet.date}, the record's log started on ${logDate} (UTC)`);
  }
  // runners with more than one current entry in a category: only the fastest is their place, the rest are history
  lb.entries.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.ms - b.ms);
  // ("updated": when something on it last changed, so a day with no changes doesn't change the file)
  if (JSON.stringify(lb.entries) !== before || !lb.updated) lb.updated = today();
  lb.sheet = tabs.map(t => t.name);
  fs.mkdirSync(path.dirname(FILE), {recursive: true});
  fs.writeFileSync(FILE, JSON.stringify(lb, null, 1) + "\n");
  log(`${lb.entries.filter(e => e.status === "current").length} on the sheet, ${lb.entries.length} in all`);
  return checks;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "sync") {
  const checks = await sync();
  console.log(checks.length ? "Checks:\n" + checks.join("\n") : "Checks: all match");
  const o = args.indexOf("--checks"); if (o >= 0) fs.writeFileSync(args[o + 1], checks.join("\n"));
} else if (cmd) { console.log("Usage: node leaderboard.mjs sync [--checks file]"); process.exit(1); }

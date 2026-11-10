// The world records (wr/), kept up to date for the leaderboard's owner:
//   scan     looks through the stats sites for a run faster than a record (the WR, any category; the Thunderful WR, the
//            fastest record with Very Very Frightening), for the owner to approve (see .github/workflows/wr-watch.yml);
//            and fills in each record's video and notes from its stats site (wr.json "site" and "run")
//   install  makes an approved run a record: from its stats site's repository, its log, ghost and stats files, into wr/
//            (the WR before it moved to wr/archive/) or, for a Thunderful record that isn't the WR, into wr/archive/
//            and adds it to the leaderboard (leaderboard/leaderboard.json)
// The stats sites are the ones the leaderboard links to as proof, those the records link to, and any listed in
// wr/sites.json (["https://someone.github.io/their-site/", ...]).
//
// Usage: node wr-watch.mjs scan [--out candidates.json]
//        node wr-watch.mjs install <stats site url> <the number the run's files are saved under (logs/<N>.log)>
//        node wr-watch.mjs approve      (in the approval workflow: reads ISSUE_BODY and COMMENT from the environment)
import fs from "node:fs";
import path from "node:path";

const code = path.dirname(new URL(import.meta.url).pathname);
const inCode = p => path.join(code, p), read = p => fs.readFileSync(p, "utf8");
const SITE_RE = /^https:\/\/[a-z0-9-]+\.github\.io\/[^/?#\s]+\/?$/i;

// The site code, as a site's page runs it, on a site's data (or none)
const SRC = ["text.js", "config.js", "helpers.js", "parse-log.js", "runs.js", "splits.js", "stats.js"].map(f => read(inCode("src/" + f))).join("\n");
const siteApi = data => new Function("document", SRC + "\nreturn {parseLog, derive, validRuns, runNum, runKey, decodeRun, RUNS};")({getElementById: () => ({textContent: JSON.stringify(data)})});
const api = siteApi({runs: []});
const fmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
// (the run's time with Very Very Frightening: its own, or when it got it after finishing without it; see thunderlessFirst)
const thunderfulTime = (r, d) => d.category === "Thunderful" ? r.finalIgt : r.thunderful ? r.thunderful.igt : null;

async function get(url, as = "text") {
  const res = await fetch(url, {headers: {"cache-control": "no-cache", "user-agent": "aa-stats-wr-watch"}});
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return as === "buffer" ? Buffer.from(await res.arrayBuffer()) : res.text();
}
const siteUrl = u => String(u).replace(/[#?].*$/, "").replace(/\/?$/, "/");
async function siteData(url) {
  const m = /<script type="application\/json" id="aa-data">([\s\S]*?)<\/script>/.exec(await get(siteUrl(url)));
  if (!m) throw new Error(`${url} isn't a stats site`);
  return JSON.parse(m[1]);
}

// The records: wr/ (the WR) and wr/archive/<date runner>/, each read like a run, with its wr.json
function records() {
  const out = [], one = dir => {
    const at = f => inCode(path.join("wr", dir, f)), log = ["log", "txt", "jsonl"].map(e => at("wr." + e)).find(f => fs.existsSync(f));
    if (!log) return;
    const r = api.parseLog(read(log), path.basename(log)), d = api.derive(r);
    const json = fs.existsSync(at("wr.json")) ? JSON.parse(read(at("wr.json"))) : {};
    out.push({dir, run: r, key: api.runKey(r), json, jsonFile: at("wr.json"), time: r.finalIgt, thunderful: thunderfulTime(r, d), category: d.category});
  };
  one("");
  const arch = inCode("wr/archive");
  if (fs.existsSync(arch)) for (const e of fs.readdirSync(arch, {withFileTypes: true})) if (e.isDirectory()) one(path.join("archive", e.name));
  return out;
}

// The leaderboard, and the stats sites its runs link to as proof
const LB_FILE = inCode("leaderboard/leaderboard.json");
const readLeaderboard = () => fs.existsSync(LB_FILE) ? JSON.parse(read(LB_FILE)) : {entries: []};
const leaderboardSites = () => [...new Set(readLeaderboard().entries.map(e => e.site && siteUrl(e.site)).filter(u => u && SITE_RE.test(u)))];
// A new record onto the leaderboard (unless it's there already)
function addToLeaderboard(e) {
  const lb = readLeaderboard();
  if (lb.entries.some(x => x.player.toLowerCase() === e.player.toLowerCase() && Math.abs(x.ms - e.ms) <= 1500 && !!x.thunderful === e.thunderful)) return;
  lb.entries.push(e);
  lb.entries.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.ms - b.ms);
  lb.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(LB_FILE, JSON.stringify(lb, null, 1) + "\n");
}

async function scan(outFile) {
  const recs = records(), wr = recs.find(x => x.dir === "");
  if (!wr) throw new Error("wr/ has no record");
  const tf = recs.filter(x => x.thunderful != null).sort((a, b) => a.thunderful - b.thunderful)[0] || null;
  console.log(`WR ${fmt(wr.time)} (${wr.json.runner || wr.run.player})` + (tf ? `, Thunderful WR ${fmt(tf.thunderful)} (${tf.json.runner || tf.run.player})` : ""));
  let sites = leaderboardSites();
  const extra = fs.existsSync(inCode("wr/sites.json")) ? JSON.parse(read(inCode("wr/sites.json"))) : [];
  sites = [...new Set([...sites, ...extra, ...recs.map(x => x.json.site).filter(Boolean)].map(siteUrl).filter(u => SITE_RE.test(u)))];
  console.log(`Stats sites: ${sites.join(", ") || "none"}`);
  const known = new Set(recs.map(x => x.key)), cands = [], byUrl = new Map();
  for (const url of sites) {
    let data; try { data = await siteData(url); } catch (e) { console.warn(`${url}: ${e.message}`); continue; }
    byUrl.set(url, data);
    const s = siteApi(data);
    for (const r of s.validRuns()) {
      if (r.manual || !r.player || known.has(s.runKey(r))) continue;   // (no log, or already a record)
      const d = s.derive(r), t = thunderfulTime(r, d), num = s.runNum(r), who = r.player;
      const what = r.finalIgt < wr.time ? ["WR", r.finalIgt] : tf && t != null && t < tf.thunderful ? ["Thunderful WR", t] : null;
      if (!what) continue;
      const marker = `<!-- wr-candidate ${url} ${(r.meta && r.meta.num) || num} -->`;   // (the number its files are saved under)
      cands.push({marker, title: `Possible new ${what[0]}: ${who} ${fmt(what[1])}`, body: [
        `**${who}** finished a run in **${fmt(what[1])}** (${d.category}), faster than the ${what[0]} (${fmt(what[0] === "WR" ? wr.time : tf.thunderful)}).`, "",
        `- Run: ${url}#/run/${num} (run ${num} on ${data.repo && data.repo.full || url})`,
        `- Date: ${r.meta && r.meta.date || new Date(r.start).toISOString().slice(0, 10)}` + (r.meta && r.meta.video ? `\n- Video: ${r.meta.video}` : ""), "",
        "Comment `approve` to make it the record: its log, ghost and stats files are copied into `wr/` " + (what[0] === "WR" ? "(the WR now moves to `wr/archive/`)" : "(as a former record in `wr/archive/`)") + ", and every stats site shows it from its next build. Close this issue to leave it.", "",
        marker].join("\n")});
      console.log(`Candidate: ${who} ${fmt(what[1])} (${what[0]}), ${url} run ${num}`);
    }
  }
  // the records' details from their stats sites: the video and notes, where they're missing or have changed there
  for (const rec of recs) {
    const {site, run} = rec.json; if (!site || run == null) continue;
    let data = byUrl.get(siteUrl(site)); if (!data) { try { data = await siteData(site); } catch (e) { console.warn(`${site}: ${e.message}`); continue; } }
    const s = siteApi(data), r = s.RUNS.find(x => s.runNum(x) === Number(run)); if (!r) { console.warn(`${site} has no run ${run}`); continue; }
    let changed = false;
    for (const k of ["video", "notes"]) { const v = r.meta && r.meta[k]; if (v && v !== rec.json[k]) { rec.json[k] = v; changed = true; } }
    if (changed) { fs.writeFileSync(rec.jsonFile, JSON.stringify(rec.json, null, 2) + "\n"); console.log(`Updated ${path.relative(code, rec.jsonFile)} from ${site} run ${run}`); }
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(cands, null, 2));
  return cands;
}

// A run from a stats site's repository becomes a record
async function install(url, num) {
  url = siteUrl(url); num = Number(num);
  if (!SITE_RE.test(url) || !Number.isInteger(num) || num < 1) throw new Error(`not a stats site run: ${url} ${num}`);
  const data = await siteData(url), repo = data.repo && data.repo.full, branch = data.repo && data.repo.branch || "main";
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[\w./-]+$/.test(branch)) throw new Error(`${url} doesn't say which repository it's from`);
  const raw = f => `https://raw.githubusercontent.com/${repo}/${branch}/${f}`;
  const tryGet = async (f, as) => { try { return await get(raw(f), as); } catch { return null; } };
  let log = null, logName = null;
  for (const ext of ["log", "txt", "jsonl"]) { log = await tryGet(`logs/${num}.${ext}`); if (log) { logName = "wr." + ext; break; } }
  if (!log) throw new Error(`${repo} has no logs/${num}.log`);
  const ghost = await tryGet(`logs/${num}.ghost`, "buffer"), stats = await tryGet(`logs/${num}.stats.json`);
  const details = JSON.parse(await tryGet("runs.json") || "{}")[String(num)] || {};
  const r = api.parseLog(log, logName), d = api.derive(r);
  if (d.category === "Invalid") throw new Error(`run ${num} isn't a finished run`);
  const recs = records(), wr = recs.find(x => x.dir === "");
  // (the number the site shows for it: runs are numbered by when they were played)
  const s = siteApi(data), onSite = s.RUNS.find(x => x.meta && x.meta.num === num), shown = onSite ? s.runNum(onSite) : num;
  const json = {runner: r.player, date: details.date || new Date(r.start).toISOString().slice(0, 10), seed: details.seed || (r.seed != null ? String(r.seed) : undefined),
    video: details.video, notes: details.notes, site: url, run: shown};
  for (const k of Object.keys(json)) if (json[k] == null || json[k] === "") delete json[k];
  const archiveDir = j => { const base = inCode(path.join("wr/archive", `${j.date || "undated"} ${j.runner || "unknown"}`)); let p = base, i = 2; while (fs.existsSync(p)) p = `${base} ${i++}`; return p; };
  const write = dir => {
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, logName), log);
    if (ghost) fs.writeFileSync(path.join(dir, "wr.ghost"), ghost);
    if (stats) fs.writeFileSync(path.join(dir, "wr.stats.json"), stats);
    fs.writeFileSync(path.join(dir, "wr.json"), JSON.stringify(json, null, 2) + "\n");
  };
  const onBoard = ms => addToLeaderboard({player: r.player, ms: Math.round(ms / 1000) * 1000, time: fmt(ms), thunderful: ms !== r.finalIgt || d.category === "Thunderful",
    date: json.date || null, run: shown, proof: "Stats", url: `${url}#/run/${shown}`, site: url, note: null});
  if (!wr || r.finalIgt < wr.time) {
    onBoard(r.finalIgt);
    // the new WR: the one before it goes to the archive
    if (wr) { const to = archiveDir(wr.json); fs.mkdirSync(to, {recursive: true}); for (const f of fs.readdirSync(inCode("wr"))) if (/^wr\./.test(f)) fs.renameSync(inCode("wr/" + f), path.join(to, f)); }
    write(inCode("wr"));
    console.log(`${r.player} ${fmt(r.finalIgt)} is the WR`);
    return `${r.player} ${fmt(r.finalIgt)} is now the WR`;
  }
  write(archiveDir(json));
  onBoard(thunderfulTime(r, d) ?? r.finalIgt);
  console.log(`${r.player} ${fmt(thunderfulTime(r, d) ?? r.finalIgt)} added to the records`);
  return `${r.player} ${fmt(thunderfulTime(r, d) ?? r.finalIgt)} is now a record (in wr/archive/)`;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "scan") { const o = args.indexOf("--out"); const c = await scan(o >= 0 ? args[o + 1] : null); console.log(`${c.length} possible new record(s)`); }
else if (cmd === "install") console.log(await install(args[0], args[1]));
else if (cmd === "approve") {
  // (the approval workflow: the comment is "approve"; the issue says which run)
  const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}<<EOF\n${v}\nEOF\n`); };
  if (!/^\s*approve\b/i.test(process.env.COMMENT || "")) { console.log("Not an approval"); out("done", "no"); }
  else {
    const m = /<!-- wr-candidate (\S+) (\d+) -->/.exec(process.env.ISSUE_BODY || "");
    if (!m) throw new Error("the issue doesn't say which run");
    out("message", await install(m[1], m[2])); out("done", "yes");
  }
}
else { console.log("Usage: node wr-watch.mjs scan [--out file] | install <site url> <run number> | approve"); process.exit(1); }

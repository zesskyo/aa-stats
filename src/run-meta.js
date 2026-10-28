/*
 * run-meta.js — a run's details from its runs.json entry (date, seed, video, notes, which deaths were on purpose…), as
 * the pages use them (run.meta). build.mjs makes every run's with it; the editor makes a run's just saved with it, so
 * the run shows straight away, before the site is built again.
 */

// "3:41:22", "3:41:22.629" or "41:22" → milliseconds (null if it doesn't look like a time)
function timeMs(s) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(String(s).trim());
  return m ? ((+(m[1] || 0) * 60 + +m[2]) * 60 + +m[3]) * 1000 + (m[4] ? +m[4].padEnd(3, "0") : 0) : null;
}

// run n's meta, from d (its runs.json entry) and run (its log's run, or a run without a log). Throws on a detail that
// isn't right. (Not here: what comes from other files, the ghost and stats files and a screenshot's own file.)
function runMeta(n, d, run) {
  d = d || {};
  const meta = {num: n};
  for (const k of ["date", "seed", "video", "notes"]) if (d[k] != null && d[k] !== "") meta[k] = String(d[k]);
  if (!meta.seed && run.seed) meta.seed = String(run.seed);   // (from the log: typed in, or /seed used in the run)
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
  if (d.countAnyway === true) meta.countAnyway = true;   // (counted as Thunderless without a channeling trident: see noChannelingOnly in stats.js)
  if (d.elytraKm != null) meta.elytraCm = Math.round(Number(d.elytraKm) * 100000);
  // proof: a link to a screenshot, or one in the site's folder
  if (d.screenshot != null && d.screenshot !== "") {
    const s = String(d.screenshot);
    if (/^https?:\/\//i.test(s)) meta.screenshot = s;
    else {
      const rel = s.replace(/\\/g, "/").replace(/^\.?\//, "");
      if (!/\.(png|jpe?g|webp|gif)$/i.test(rel) || rel.split("/").includes("..") || /[^A-Za-z0-9_\-./ ]/.test(rel)) throw new Error(`runs.json run ${n}: screenshot must be an image in this site's folder (like "screenshots/${n}.png") or a link`);
      meta.screenshot = rel;
    }
  }
  if (run.manual && d.hundred != null) meta.hundred = !!d.hundred;   // (only for runs without a log: a log already has it)
  return meta;
}

// A run without a log: only what runs.json says about it
const manualRun = (n, d) => ({manual: true, id: "run-manual-" + n, start: 0, player: "", finalIgt: d && d.time != null ? timeMs(d.time) : null,
  finalRta: 0, events: [], dims: [], deaths: [], st: {}, tot: {}});

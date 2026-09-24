/*
 * helpers.js — small tools used everywhere: formatting times and names, finding things on the page.
 */

// Shortcut for finding an element on the page, e.g. $("#runsTable")
const $ = s => document.querySelector(s);

// Makes text safe to put inside HTML (so a note containing "<" can't break the page)
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

// 13901629 → "3:51:41.629" (dec = number of decimals on the seconds; 0 gives "3:51:41")
const fmt = (ms, dec = 3) => {
  if (ms == null || isNaN(ms)) return "—";
  const neg = ms < 0; ms = Math.abs(ms);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = (ms % 60000) / 1000;
  const ss = dec ? s.toFixed(dec).padStart(3 + dec, "0") : String(Math.floor(s)).padStart(2, "0");
  return (neg ? "-" : "") + h + ":" + String(m).padStart(2, "0") + ":" + ss;
};
// Durations: 586000 → "9:46", 7380000 → "2:03:00"
const fmtShort = ms => {
  if (ms == null || isNaN(ms)) return "—";
  const t = Math.round(Math.abs(ms) / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0");
};
const num = n => n == null ? "—" : Number(n).toLocaleString();
const fmtDay = t => new Date(t).toLocaleDateString(undefined, {day: "numeric", month: "short", year: "numeric"});

// Names
const titleCase = s => s.replace(/\b[a-z]/g, c => c.toUpperCase());
const advName = id => ADV[id] || titleCase(id.split("/").pop().replace(/_/g, " "));
const critName = c => {
  const n = titleCase(String(c).replace(/^minecraft:/, "").split("/").pop().replace(/\.png$/, "").replace(/_/g, " "));
  return CRIT_RENAME[n] || n;
};

// Groups sorted times into bursts: times closer than `gap` go in the same group
function clusters(times, gap) {
  const out = [];
  for (const t of times) { const c = out[out.length - 1]; if (c && t - c[c.length - 1] <= gap) c.push(t); else out.push([t]); }
  return out;
}
// Last point at or before time t in a list of [time, value] points
const lastBefore = (pts, t) => { let last = null; for (const p of pts) { if (p[0] <= t) last = p; else break; } return last; };

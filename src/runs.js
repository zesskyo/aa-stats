/*
 * runs.js — loads the runs, icons and site text that build.mjs put into the page, and small questions about a run
 * (its number, date, title, video link…).
 */
let DATA = {runs: [], icons: {}};
try { DATA = JSON.parse(document.getElementById("aa-data").textContent) || DATA; } catch {}
// The site's own words from its site.json (build.mjs only lets through text that exists in text.js)
if (DATA.text && typeof DATA.text === "object") for (const [k, v] of Object.entries(DATA.text)) if (typeof T[k] === "string" && typeof v === "string") T[k] = v;
const RUNS = (DATA.runs || []).map(decodeRun);
const ICONS = (DATA.icons && typeof DATA.icons === "object") ? DATA.icons : {};

// ---------- Icons ----------
const okIcon = v => typeof v === "string" && /^data:image\/(png|webp|gif|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(v);
// Icon as an <img> (size in pixels), or "" if there's no icon for that name
const ic = (key, size = 20) => okIcon(ICONS[key]) ? `<img class="ico" src="${ICONS[key]}" width="${size}" height="${size}" alt="">` : "";
// Icon inside a graph (SVG), or ""
const icAt = (key, x, y, size) => okIcon(ICONS[key]) ? `<image href="${ICONS[key]}" x="${x}" y="${y}" width="${size}" height="${size}" style="image-rendering:pixelated"/>` : "";

// ---------- About a run ----------
const runNum = r => r.meta && r.meta.num ? r.meta.num : RUNS.slice().sort((a, b) => a.start - b.start).indexOf(r) + 1;
const runTitle = r => T.runWord + " " + runNum(r);
const byNumber = () => RUNS.slice().sort((a, b) => runNum(a) - runNum(b));
const findRun = id => RUNS.find(r => r.id === id);

// Date shown for a run: the date from runs.json, otherwise the day the run finished
const doneAt = r => r.start + (r.finalRta || 0);
const runDay = r => {
  const m = r.meta && r.meta.date;
  if (m && /^\d{4}-\d{2}-\d{2}$/.test(m)) { const [y, mo, da] = m.split("-").map(Number); return fmtDay(new Date(y, mo - 1, da).getTime()); }
  return fmtDay(doneAt(r));
};
const dayNumber = r => { const m = r.meta && r.meta.date; const d = m ? new Date(m + "T12:00") : new Date(doneAt(r)); return d.getFullYear() * 1e4 + (d.getMonth() + 1) * 100 + d.getDate(); };

const okUrl = u => typeof u === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(u);
const videoLink = (r, big) => okUrl(r.meta && r.meta.video)
  ? `<a class="vlink${big ? " big" : ""}" href="${esc(r.meta.video)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(T.watchVideo)}" title="${esc(T.watchVideo)}"><svg width="${big ? 18 : 14}" height="${big ? 18 : 14}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>${big ? esc(T.video) : ""}</a>`
  : "";

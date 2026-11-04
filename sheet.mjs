// The leaderboard's Google Sheet, read from its .xlsx export (no packages): each tab's rows, with each cell's link (a
// proof's URL) and note (a comment on the cell). Used by leaderboard.mjs and wr-watch.mjs.
//   readSheet() → [{name: "Thunderless+Thunderful", rows: [{"#": 1, Time: 0.133…, Player: "…", …, _links: {Proof: url},
//                   _notes: {Time: "…"}}]}]
// Times are fractions of a day and dates days since 1899-12-30, as spreadsheets keep them: see dayMs and isoDate.
import zlib from "node:zlib";

export const SHEET_ID = "1RMPL2zGM0Bkxsz-UFAbShVXP4arD8E7C-kBvGzSyRv0";   // (T.leaderboardUrl)

export async function readSheet(id = SHEET_ID) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, {headers: {"user-agent": "aa-stats"}});
  if (!res.ok) throw new Error(`the leaderboard: HTTP ${res.status}`);
  return parseXlsx(Buffer.from(await res.arrayBuffer()));
}

const unesc = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = xml => unesc((xml.match(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join(""));
const colOf = ref => ref.replace(/\d+$/, ""), rowOf = ref => Number(ref.replace(/^[A-Z]+/, ""));

export function parseXlsx(buf) {
  const files = new Map(unzip(buf).map(f => [f.name, f.data.toString("utf8")]));
  const strings = [...(files.get("xl/sharedStrings.xml") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => text(m[1]));
  const wbRels = relsOf(files.get("xl/_rels/workbook.xml.rels"));
  const tabs = [];
  for (const m of (files.get("xl/workbook.xml") || "").matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = unesc(attr(m[1], "name")), file = "xl/" + wbRels[attr(m[1], "r:id")].replace(/^\/?xl\//, "");
    const xml = files.get(file) || "", rels = relsOf(files.get(file.replace(/([^/]+)$/, "_rels/$1.rels")));
    // each cell's value
    const cells = new Map();
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inner = ""] = c, v = /<v>([\s\S]*?)<\/v>/.exec(inner), t = attr(attrs, "t");
      const val = t === "s" ? strings[Number(v && v[1])] : t === "inlineStr" ? text(inner) : t === "str" ? unesc(v ? v[1] : "") : v ? Number(v[1]) : null;
      if (val != null && val !== "") cells.set(ref, val);
    }
    // links (a URL, or a place in it) and notes, by cell
    const links = new Map(), notes = new Map();
    for (const h of xml.matchAll(/<hyperlink\b([^>]*)\/>/g)) {
      const ref = attr(h[1], "ref"), target = rels[attr(h[1], "r:id")], loc = attr(h[1], "location");
      if (target && /^https?:/i.test(target)) links.set(ref, target + (loc ? "#" + unesc(loc).replace(/^#?\/?/, "/") : ""));
    }
    const cfile = Object.values(rels).find(t => /comments\d*\.xml$/.test(t));
    if (cfile) for (const c of (files.get("xl/" + cfile.replace(/^(\.\.\/)+/, "")) || "").matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) notes.set(attr(c[1], "ref"), text(c[2]).trim());
    // rows, by the header row's names
    const byRow = new Map(); for (const ref of cells.keys()) { const r = rowOf(ref); if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(ref); }
    const rowNums = [...byRow.keys()].sort((a, b) => a - b), head = {};
    for (const ref of byRow.get(rowNums[0]) || []) head[colOf(ref)] = String(cells.get(ref)).trim();
    const rows = rowNums.slice(1).map(r => {
      const row = {_row: r, _links: {}, _notes: {}};
      for (const [col, name] of Object.entries(head)) {
        const ref = col + r; if (cells.has(ref)) row[name] = cells.get(ref);
        if (links.has(ref)) row._links[name] = links.get(ref);
        if (notes.has(ref)) row._notes[name] = notes.get(ref);
      }
      return row;
    }).filter(row => Object.keys(head).some(c => row[head[c]] != null));
    tabs.push({name, rows, headNotes: Object.fromEntries(Object.entries(head).filter(([c]) => notes.has(c + rowNums[0])).map(([c, n]) => [n, notes.get(c + rowNums[0])]))});
  }
  return tabs;
}
const attr = (s, k) => { const m = new RegExp(`\\b${k.replace(":", "\\:")}="([^"]*)"`).exec(s); return m ? m[1] : null; };
const relsOf = xml => Object.fromEntries([...(xml || "").matchAll(/<Relationship\b([^>]*)\/>/g)].map(m => [attr(m[1], "Id"), unesc(attr(m[1], "Target") || "")]));

// A time cell (a fraction of a day, or "3:11:46") → milliseconds; a date cell (days since 1899-12-30, or "Oct 20, 2026") → "2026-10-20"
export const dayMs = v => typeof v === "number" ? Math.round(v * 86400) * 1000
  : (m => m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 : null)(/^(\d+):(\d\d):(\d\d)$/.exec(String(v).trim()));
export const isoDate = v => {
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const d = new Date(String(v) + " UTC"); return isNaN(d) ? null : d.toISOString().slice(0, 10);
};

// Just enough zip reading for an .xlsx (stored or deflated entries, from the central directory)
export function unzip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("not a zip");
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = [];
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), raw = buf.subarray(start, start + size);
    out.push({name, data: method === 8 ? zlib.inflateRawSync(raw) : raw});
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

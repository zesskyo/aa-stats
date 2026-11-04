/*
 * leaderboard.js — the Leaderboard page: AA No Reset's leaderboard (the same on every site, from
 * leaderboard/leaderboard.json in the code, kept from the leaderboard's spreadsheet: see leaderboard.mjs).
 * Two boards, All (Thunderless and Thunderful) and Thunderful: each runner's best, with its proof and a way to watch it
 * (a video plays here; a run on a stats site opens there, or here when this site has it). A runner's row opens their
 * earlier times. Under the board, the world record's history: each record, and how long it stood.
 */
const LB = DATA.leaderboard && Array.isArray(DATA.leaderboard.entries) ? DATA.leaderboard : null;
let lbCat = "all";
try { if (localStorage.getItem("aa-lb-cat") === "thunderful") lbCat = "thunderful"; } catch {}
const lbOpen = new Set();

const lbDay = iso => { if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—"; const [y, m, d] = iso.split("-").map(Number); return fmtDay(new Date(y, m - 1, d).getTime()); };
const lbIn = (e, cat) => cat === "all" || e.thunderful;
// (this site's own copy of a run: the record's files, or one of this site's runs)
const lbLocal = e => {
  if (e.record) { const r = [WR, ...WRS].find(x => x && Math.abs(x.finalIgt - e.ms) <= 1500 && (x.meta.runner || "").toLowerCase() === e.player.toLowerCase()); if (r) return r; }
  const here = DATA.repo && DATA.repo.full ? "https://" + DATA.repo.full.split("/")[0].toLowerCase() + ".github.io/" : null;
  if (e.site && e.run && here && e.site.toLowerCase().startsWith(here) && e.site.toLowerCase().includes("/" + DATA.repo.full.split("/")[1].toLowerCase())) return RUNS.find(r => runNum(r) === e.run) || null;
  return null;
};
// A video that can play here: YouTube or a Twitch VOD → the address to embed
function lbEmbed(url) {
  if (!url) return null;
  let m = /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube\.com\/live\/)([\w-]{6,})/i.exec(url);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1`;
  m = /twitch\.tv\/videos\/(\d+)/i.exec(url);
  if (m) return `https://player.twitch.tv/?video=${m[1]}&parent=${encodeURIComponent(location.hostname || "localhost")}&autoplay=true`;
  return null;
}
const lbProofName = e => e.proof || (e.url ? T.lbProof : "");

function renderLeaderboard() {
  const el = $("#view-board");
  if (!LB) { el.innerHTML = `<section class="card"><h2>${esc(T.tabLeaderboard)}</h2><p class="muted">${esc(T.lbNone)}</p></section>`; return; }
  const cat = lbCat, all = LB.entries.filter(e => e.status !== "removed" && lbIn(e, cat));
  // the board: each runner's best on the leaderboard (current entries)
  const best = new Map();
  for (const e of all) if (e.status === "current") { const k = e.player.toLowerCase(), b = best.get(k); if (!b || e.ms < b.ms) best.set(k, e); }
  const board = [...best.values()].sort((a, b) => a.ms - b.ms);
  const earlier = e => all.filter(x => x !== e && x.player.toLowerCase() === e.player.toLowerCase() && x.ms > e.ms - 1500 && !(x.status === "current" && x.ms === e.ms)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const watch = e => {
    const loc = lbLocal(e), emb = lbEmbed(e.video) || lbEmbed(e.url);
    if (loc) return `<button type="button" class="btn icon ghost lbplay" data-open="${esc(loc.id)}" title="${esc(T.lbWatchHere)}" aria-label="${esc(T.lbWatchHere)} · ${esc(e.player)}">${svgPlay}</button>`;
    if (emb) return `<button type="button" class="btn icon ghost lbplay" data-embed="${esc(emb)}" data-title="${esc(e.player + " · " + e.time)}" title="${esc(T.lbWatchVideo)}" aria-label="${esc(T.lbWatchVideo)} · ${esc(e.player)}">${svgPlay}</button>`;
    if (e.site && e.run) return `<a class="btn icon ghost lbplay" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" title="${esc(T.lbWatchSite)}" aria-label="${esc(T.lbWatchSite)} · ${esc(e.player)}">${svgPlay}</a>`;
    return "";
  };
  const proof = e => okUrl(e.url) ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(lbProofName(e))} <span aria-hidden="true">↗</span></a>` : esc(e.proof || "—");
  const row = (e, k) => {
    const prev = earlier(e), open = lbOpen.has(cat + e.player.toLowerCase());
    const name = prev.length ? `<button type="button" class="linkbtn lbwho" data-lbopen="${esc(e.player.toLowerCase())}" aria-expanded="${open}"><span class="chev" aria-hidden="true">▾</span>${esc(e.player)}</button>` : `<span class="lbwho">${esc(e.player)}</span>`;
    const main = `<tr class="lbrow${k === 0 ? " first" : ""}"><td class="mono lbrank">${k + 1}</td><td>${name}${e.note ? `<span class="note lbnote">${esc(e.note)}</span>` : ""}</td>
      <td class="mono lbtime">${esc(e.time)}</td><td class="lbdate">${esc(lbDay(e.date))}</td><td class="lbproof">${proof(e)}</td><td class="lbwatch">${watch(e)}</td></tr>`;
    const hist = prev.map(x => `<tr class="lbprev"${open ? "" : " hidden"} data-lbof="${esc(e.player.toLowerCase())}"><td></td><td class="muted">${esc(T.lbEarlier)}</td>
      <td class="mono">${esc(x.time)}</td><td class="lbdate">${esc(lbDay(x.date))}</td><td class="lbproof">${proof(x)}</td><td class="lbwatch">${watch(x)}</td></tr>`).join("");
    return main + hist;
  };
  // the world record's history: each time the fastest so far, by date (from every time known: the board, earlier times)
  const known = all.filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date) || a.ms - b.ms), recs = [];
  for (const e of known) if (!recs.length || e.ms < recs[recs.length - 1].ms - 500) recs.push(e);
  const dayMsOf = iso => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const held = recs.map((e, i) => Math.max(0, Math.round(((i + 1 < recs.length ? dayMsOf(recs[i + 1].date) : Date.now()) - dayMsOf(e.date)) / 86400000)));
  const maxHeld = Math.max(1, ...held);
  const hist = recs.map((e, i) => ({e, i})).reverse().map(({e, i}) => `<tr${i === recs.length - 1 ? ` class="lbcur"` : ""}><td class="lbdate">${esc(lbDay(e.date))}</td><td>${esc(e.player)}</td><td class="mono">${esc(e.time)}</td>
      <td class="mono lbdelta">${i ? "−" + fmtShort(recs[i - 1].ms - e.ms) : ""}</td>
      <td class="lbheld"><span class="lbbar" style="width:${Math.max(2, held[i] / maxHeld * 100)}%"></span><span class="mono">${i === recs.length - 1 ? esc(T.lbStanding(held[i])) : esc(T.lbDays(held[i]))}</span></td><td class="lbwatch">${watch(e)}</td></tr>`).join("");

  el.innerHTML = `
    <section class="card" style="display:flex;flex-direction:column;gap:14px">
      <div class="head-row" style="align-items:center"><h2>${esc(T.lbTitle)}</h2>
        <div class="seg" role="group" aria-label="${esc(T.lbCategory)}">${[["all", T.lbAll], ["thunderful", T.lbThunderful]].map(([k, n]) => `<button type="button" aria-pressed="${k === cat}" data-lbcat="${k}">${esc(n)}</button>`).join("")}</div></div>
      <div class="tablewrap"><table class="lbtable">
        <thead><tr><th scope="col">#</th><th scope="col">${esc(T.lbRunner)}</th><th scope="col">${esc(T.timeLabel)}</th><th scope="col">${esc(T.lbDate)}</th><th scope="col">${esc(T.lbProof)}</th><th scope="col"><span class="sr">${esc(T.lbWatch)}</span></th></tr></thead>
        <tbody>${board.map(row).join("")}</tbody></table></div>
      <p class="muted lbfoot">${esc(T.lbFoot(lbDay(LB.updated)))} <a href="${esc(T.leaderboardUrl)}" target="_blank" rel="noopener noreferrer">${esc(T.lbSheet)} <span aria-hidden="true">↗</span></a></p>
    </section>
    <section class="card" style="display:flex;flex-direction:column;gap:14px">
      <h2>${esc(cat === "all" ? T.lbHistory : T.lbHistoryTf)}</h2>
      <div class="tablewrap"><table class="lbtable lbhist">
        <thead><tr><th scope="col">${esc(T.lbDate)}</th><th scope="col">${esc(T.lbRunner)}</th><th scope="col">${esc(T.timeLabel)}</th><th scope="col">${esc(T.lbImproved)}</th><th scope="col">${esc(T.lbHeld)}</th><th scope="col"><span class="sr">${esc(T.lbWatch)}</span></th></tr></thead>
        <tbody>${hist}</tbody></table></div>
      <p class="muted lbfoot">${esc(T.lbHistoryNote)}</p>
    </section>
    <dialog class="lbdialog" id="lbDialog" aria-label="${esc(T.lbWatchVideo)}"><div class="lbdhead"><b id="lbDialogTitle"></b><button type="button" class="btn icon ghost" id="lbDialogClose" aria-label="${esc(T.edClose)}">✕</button></div><div class="lbframe" id="lbFrame"></div></dialog>`;

  el.querySelectorAll("[data-lbcat]").forEach(b => b.addEventListener("click", () => { lbCat = b.dataset.lbcat; try { localStorage.setItem("aa-lb-cat", lbCat); } catch {} renderLeaderboard(); }));
  el.querySelectorAll("[data-lbopen]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.lbopen, open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(open)); if (open) lbOpen.add(cat + k); else lbOpen.delete(cat + k);
    el.querySelectorAll(`tr[data-lbof="${CSS.escape(k)}"]`).forEach(tr => { tr.hidden = !open; });
  }));
  el.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => go("run", b.dataset.open)));
  const dlg = $("#lbDialog"), frame = $("#lbFrame");
  const close = () => { frame.innerHTML = ""; if (dlg.open) dlg.close(); };
  el.querySelectorAll("[data-embed]").forEach(b => b.addEventListener("click", () => {
    $("#lbDialogTitle").textContent = b.dataset.title;
    frame.innerHTML = `<iframe src="${esc(b.dataset.embed)}" title="${esc(b.dataset.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    dlg.showModal();
  }));
  $("#lbDialogClose").addEventListener("click", close);
  dlg.addEventListener("close", () => { frame.innerHTML = ""; });
  dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
}
const svgPlay = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;

/*
 * leaderboard.js — the Leaderboard page: AA No Reset's leaderboard, the same on every site (leaderboard/leaderboard.json
 * in the code repository, LB_REPO). Two tabs: Thunderless (every run) and Thunderful (100% runs). The top three, the
 * rest of the board (with obsolete runs, when shown, in among it by time, as on speedrun.com), and the runs added
 * most recently.
 *
 * Only the leaderboard's owner edits it: signed in (editor.js) with a GitHub key that can write to LB_REPO, the page
 * shows Add to leaderboard and an edit button on every run, and a save commits the new leaderboard.json there. Everyone else's
 * key is for their own site only, so they never see the buttons (and GitHub refuses the save).
 * Every site loads the leaderboard's latest version when the page opens, so a change shows everywhere within minutes.
 */
const LB_REPO = "zesskyo/aa-stats", LB_BRANCH = "main", LB_PATH = "leaderboard/leaderboard.json";
let LB = DATA.leaderboard && Array.isArray(DATA.leaderboard.entries) ? DATA.leaderboard : {entries: []};
let lbCat = "all", lbObs = false, lbOwner = false, lbFresh = false;
try { if (localStorage.getItem("aa-lb-cat") === "thunderful") lbCat = "thunderful"; lbObs = localStorage.getItem("aa-lb-obsolete") === "1"; } catch {}

const lbFmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const lbDay = iso => { if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—"; const [y, m, d] = iso.split("-").map(Number); return fmtDay(new Date(y, m - 1, d).getTime()); };
const lbToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const lbDaysSince = iso => { if (!iso) return 0; const [y, m, d] = iso.split("-").map(Number); return Math.max(0, Math.round((Date.parse(lbToday() + "T00:00:00Z") - Date.UTC(y, m - 1, d)) / 86400000)); };
const lbSiteOf = u => { const m = /^https:\/\/[a-z0-9-]+\.github\.io\/[^/?#\s]+/i.exec(u || ""); return m ? m[0] + "/" : null; };
const lbSame = (a, b) => a.player === b.player && a.ms === b.ms && (a.date || null) === (b.date || null) && !!a.thunderful === !!b.thunderful;
const lbSort = es => es.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.ms - b.ms);

// The board in a category: each runner's best; their other times in it are obsolete
function lbBoard(cat) {
  const inCat = LB.entries.filter(e => cat === "all" || e.thunderful), best = new Map();
  for (const e of inCat) { const k = e.player.toLowerCase(), b = best.get(k); if (!b || e.ms < b.ms) best.set(k, e); }
  const board = [...best.values()].sort((a, b) => a.ms - b.ms);
  const obsolete = inCat.filter(e => !board.includes(e)).sort((a, b) => a.ms - b.ms);
  return {board, obsolete};
}

// ---------- The page ----------
function renderLeaderboard() {
  const el = $("#view-board"), cat = lbCat, {board, obsolete} = lbBoard(cat), thunderless = cat === "all";
  if (!lbFresh) { lbFresh = true; lbLoad(); }
  const pen = e => lbOwner ? `<button type="button" class="lbedit" data-lbedit="${LB.entries.indexOf(e)}" aria-label="${esc(T.lbEditOf(e.player, lbFmt(e.ms)))}">${svgPencil}</button>` : "";
  const proof = e => okUrl(e.url) ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.proof || T.lbProof)}</a>` : esc(e.proof || "—");
  const run = e => e.run != null && e.run !== "" ? String(e.run) : "—";
  const hundred = e => e.thunderful ? T.lbYes : T.lbNo;
  const note = e => e.note ? `<button type="button" class="lbnote" aria-label="${esc(T.lbNoteOf(e.note))}"><span class="lbtri" aria-hidden="true"></span><span class="lbtip" aria-hidden="true">${esc(e.note)}</span></button>` : "";
  const meta = e => `${esc(lbDay(e.date))} · ${esc(T.lbRunN(run(e)))} · ${proof(e)}${thunderless ? ` · ${esc(T.lbHundred)}: ${esc(hundred(e))}` : ""}`;

  // the top three (on a wide screen 2nd, 1st, 3rd)
  const pod = board.slice(0, 3).map((e, i) => {
    return `<article class="lbpod lbpod${i + 1}">
      <div class="lbpodtop"><span class="lbmedal">${i + 1}</span>${pen(e)}</div>
      <div class="lbpodwho"><h2>${esc(e.player)}${note(e)}</h2><span class="mono lbpodtime">${esc(lbFmt(e.ms))}</span></div>
      ${i === 0 ? `<span class="lbstanding">${esc(T.lbStanding(lbDaysSince(e.date)))}</span>` : ""}
      <div class="lbmeta">${meta(e)}</div>
    </article>`;
  }).join("");

  // the rest of the board, and the obsolete runs (shown) in among it by time, without a place (on a phone, Run, Date,
  // Proof and 100% go under the runner's name)
  const cells = e => `<td class="mono lbw">${esc(run(e))}</td><td class="lbw lbdate">${esc(lbDay(e.date))}</td><td class="lbw">${proof(e)}</td>${thunderless ? `<td class="lbw">${esc(hundred(e))}</td>` : ""}${lbOwner ? `<td class="lbpen">${pen(e)}</td>` : ""}`;
  const list = board.slice(3).concat(lbObs ? obsolete : []).sort((a, b) => a.ms - b.ms);
  const rows = list.map(e => {
    const place = board.indexOf(e);
    return `<tr${place < 0 ? ` class="lbobs"` : ""}><td class="mono lbrank">${place < 0 ? "" : place + 1}</td><td class="lbname"><span class="lbnamel"><span class="lbwho">${esc(e.player)}</span>${note(e)}</span><span class="lbsub">${meta(e)}</span></td><td class="mono lbtime">${esc(lbFmt(e.ms))}</td>${cells(e)}</tr>`;
  }).join("");

  // the runs added most recently (each runner's best)
  const recent = board.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 6)
    .map(e => `<li><span class="lbrecwho"><b>${esc(e.player)}</b><span class="muted">${esc(lbDay(e.date))}</span></span><span class="lbrecright"><span class="mono">${esc(lbFmt(e.ms))}</span><span class="lbbadge">${esc(e === board[0] ? T.lbWr : T.lbPb)}</span></span></li>`).join("");

  el.innerHTML = `
    <div class="lbhead"><h1>${esc(T.tabLeaderboard)}</h1>
      <div class="lbcontrols">${obsolete.length ? `<label class="lbcheck lbobstoggle"><input type="checkbox" id="lbObs"${lbObs ? " checked" : ""}> ${esc(T.lbShowObsolete)}</label>` : ""}${lbOwner ? `<button type="button" class="lbadd" id="lbAdd">${svgPlus}${esc(T.lbAdd)}</button>` : ""}
        <div class="lbseg" role="group" aria-label="${esc(T.lbCategory)}">${[["all", T.lbThunderless], ["thunderful", T.lbThunderful]].map(([k, n]) => `<button type="button" aria-pressed="${k === cat}" data-lbcat="${k}">${esc(n)}</button>`).join("")}</div></div></div>
    ${board.length ? `<section class="lbpodium" aria-label="${esc(T.lbTop)}">${pod}</section>` : `<p class="muted">${esc(T.lbNone)}</p>`}
    ${board.length ? `<div class="lbbody">
      ${list.length ? `<section class="lbcard lbtablecard"><table class="lbtable">
        <thead><tr><th scope="col">#</th><th scope="col">${esc(T.lbRunner)}</th><th scope="col">${esc(T.lbTime)}</th><th scope="col" class="lbw">${esc(T.lbRun)}</th><th scope="col" class="lbw">${esc(T.lbDate)}</th><th scope="col" class="lbw">${esc(T.lbProof)}</th>${thunderless ? `<th scope="col" class="lbw">${esc(T.lbHundred)}</th>` : ""}${lbOwner ? `<th scope="col"><span class="sr">${esc(T.lbEdit)}</span></th>` : ""}</tr></thead>
        <tbody>${rows}</tbody></table></section>` : ""}
      <section class="lbcard lbrecent" aria-labelledby="lbRecentH"><h2 id="lbRecentH">${esc(T.lbRecent)}</h2><ol>${recent}</ol></section>
    </div>` : ""}
    ${lbOwner ? lbFormHtml() : ""}`;

  el.querySelectorAll("[data-lbcat]").forEach(b => b.addEventListener("click", () => { lbCat = b.dataset.lbcat; try { localStorage.setItem("aa-lb-cat", lbCat); } catch {} renderLeaderboard(); }));
  const obsBox = $("#lbObs");
  if (obsBox) obsBox.addEventListener("change", () => { lbObs = obsBox.checked; try { localStorage.setItem("aa-lb-obsolete", lbObs ? "1" : ""); } catch {} renderLeaderboard(); $("#lbObs").focus(); });
  if (lbOwner) {
    $("#lbAdd").addEventListener("click", () => lbForm(null));
    el.querySelectorAll("[data-lbedit]").forEach(b => b.addEventListener("click", () => lbForm(LB.entries[Number(b.dataset.lbedit)])));
    lbBindForm();
  }
}
const svgPencil = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>`;
const svgPlus = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;

// ---------- The latest leaderboard, and whether this is its owner ----------
async function lbLoad() {
  let changed = false;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${LB_REPO}/${LB_BRANCH}/${LB_PATH}?t=${Math.floor(Date.now() / 60000)}`, {cache: "no-store"});
    if (res.ok) { const j = await res.json(); if (j && Array.isArray(j.entries) && JSON.stringify(j.entries) !== JSON.stringify(LB.entries)) { LB = j; changed = true; } }
  } catch {}
  const tok = typeof ghToken === "function" ? ghToken() : null;
  if (tok) try {
    const res = await fetch(`https://api.github.com/repos/${LB_REPO}`, {cache: "no-store", headers: {"Accept": "application/vnd.github+json", "Authorization": "Bearer " + tok}});
    if (res.ok) { const j = await res.json(); if (j.permissions && j.permissions.push) { lbOwner = true; changed = true; } }
  } catch {}
  if (changed && state.view === "board") renderLeaderboard();
}

// ---------- Adding, editing and deleting a run (the owner) ----------
let lbEditing = null;
function lbFormHtml() {
  const f = (id, label, type, extra = "") => `<label class="fld"><span class="label">${esc(label)}</span><input class="field" id="${id}" type="${type}"${extra}></label>`;
  return `<dialog class="lbdialog" id="lbDialog" aria-labelledby="lbFormTitle"><form id="lbForm" novalidate>
    <h2 id="lbFormTitle"></h2>
    <div class="lbfields">${f("lbfPlayer", T.lbRunner, "text", ` autocomplete="off" spellcheck="false"`)}${f("lbfTime", T.lbTime, "text", ` inputmode="numeric" placeholder="3:11:46" autocomplete="off"`)}
      ${f("lbfRun", T.lbRun, "number", ` min="1" step="1"`)}${f("lbfDate", T.lbDate, "date")}
      ${f("lbfProof", T.lbProof, "text", ` placeholder="YouTube"`)}${f("lbfUrl", T.lbProofLink, "url", ` placeholder="https://"`)}</div>
    ${f("lbfNote", T.lbNote, "text")}
    <label class="lbcheck"><input type="checkbox" id="lbfTf"> ${esc(T.lbHundred)}</label>
    <p class="cmp-status" id="lbfMsg" role="status" aria-live="polite"></p>
    <div class="lbformbtns"><button type="submit" class="lbadd" id="lbfSave">${esc(T.lbSave)}</button><button type="button" class="lbplain" id="lbfCancel">${esc(T.lbCancel)}</button><button type="button" class="lbplain lbdel" id="lbfDelete">${esc(T.lbDelete)}</button></div>
  </form></dialog>`;
}
function lbForm(e) {
  lbEditing = e;
  const v = (id, x) => { $("#" + id).value = x == null ? "" : x; };
  $("#lbFormTitle").textContent = e ? T.lbEditRun : T.lbAdd;
  v("lbfPlayer", e && e.player); v("lbfTime", e && lbFmt(e.ms)); v("lbfRun", e && e.run); v("lbfDate", e ? e.date : lbToday());
  v("lbfProof", e && e.proof); v("lbfUrl", e && e.url); v("lbfNote", e && e.note);
  $("#lbfTf").checked = e ? !!e.thunderful : lbCat === "thunderful";
  $("#lbfDelete").hidden = !e; $("#lbfMsg").textContent = ""; $("#lbfMsg").classList.remove("bad");
  ["#lbfSave", "#lbfDelete", "#lbfCancel"].forEach(s => { $(s).disabled = false; });
  $("#lbDialog").showModal(); $("#lbfPlayer").focus();
}
function lbBindForm() {
  const msg = (t, bad) => { $("#lbfMsg").textContent = t; $("#lbfMsg").classList.toggle("bad", !!bad); };
  $("#lbfCancel").addEventListener("click", () => $("#lbDialog").close());
  $("#lbForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const player = $("#lbfPlayer").value.trim(), t = /^(\d+):([0-5]\d):([0-5]\d)$/.exec($("#lbfTime").value.trim());
    if (!player) return msg(T.lbErrRunner, true);
    if (!t) return msg(T.lbErrTime, true);
    const ms = ((+t[1] * 60 + +t[2]) * 60 + +t[3]) * 1000, url = $("#lbfUrl").value.trim(), runN = parseInt($("#lbfRun").value, 10);
    const entry = {player, ms, time: lbFmt(ms), thunderful: $("#lbfTf").checked, date: $("#lbfDate").value || lbToday(), run: Number.isInteger(runN) && runN > 0 ? runN : null,
      proof: $("#lbfProof").value.trim() || null, url: okUrl(url) ? url : null, site: lbSiteOf(url), note: $("#lbfNote").value.trim() || null};
    await lbCommit(lbEditing, entry, msg, `Leaderboard: ${lbEditing ? "edit" : "add"} ${player} ${entry.time}`);
  });
  $("#lbfDelete").addEventListener("click", async () => {
    if (!lbEditing || !confirm(T.lbDeleteSure(lbEditing.player, lbFmt(lbEditing.ms)))) return;
    await lbCommit(lbEditing, null, msg, `Leaderboard: remove ${lbEditing.player} ${lbFmt(lbEditing.ms)}`);
  });
}
// The change, made to the leaderboard as it is on GitHub now (so another save in between is kept), in one commit
async function lbCommit(orig, entry, msg, message) {
  const api = `https://api.github.com/repos/${LB_REPO}/contents/${LB_PATH}`;
  const headers = {"Accept": "application/vnd.github+json", "Authorization": "Bearer " + ghToken(), "X-GitHub-Api-Version": "2022-11-28"};
  const btns = ["#lbfSave", "#lbfDelete", "#lbfCancel"].map(s => $(s)); btns.forEach(b => { b.disabled = true; }); msg(T.lbSaving);
  try {
    const got = await fetch(`${api}?ref=${LB_BRANCH}`, {cache: "no-store", headers});
    if (!got.ok) throw new Error(got.status === 401 ? T.edTokenBad : `GitHub: ${got.status}`);
    const file = await got.json(), lb = JSON.parse(b64ToUtf8(file.content));
    const at = orig ? lb.entries.findIndex(x => lbSame(x, orig)) : -1;
    if (orig && at < 0) throw new Error(T.lbErrChanged);
    if (orig && entry) lb.entries[at] = entry; else if (orig) lb.entries.splice(at, 1); else lb.entries.push(entry);
    lbSort(lb.entries); lb.updated = lbToday();
    const bytes = new TextEncoder().encode(JSON.stringify(lb, null, 1) + "\n"); let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const put = await fetch(api, {method: "PUT", headers: {...headers, "Content-Type": "application/json"}, body: JSON.stringify({message, content: btoa(bin), sha: file.sha, branch: LB_BRANCH})});
    if (!put.ok) throw new Error(put.status === 403 || put.status === 404 ? T.lbErrNoWrite(LB_REPO) : put.status === 409 ? T.lbErrChanged : `GitHub: ${put.status}`);
    LB = lb; $("#lbDialog").close(); renderLeaderboard();
  } catch (err) { msg(err.message, true); btns.forEach(b => { b.disabled = false; }); }
}

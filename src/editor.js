/*
 * editor.js — adding, editing and deleting runs from the website itself, for the site's owner only.
 *
 * The site is plain files on GitHub Pages, so it can't save anything by itself. Instead the owner signs in
 * once with a GitHub token that can write to this site's repository, and the page saves straight into the
 * repository through GitHub's API (one commit per save). That starts the usual build, and the site updates
 * about a minute later. The token is kept in this browser only; visitors don't have one, and GitHub refuses
 * writes without it.
 *
 * What a save writes (the same files you'd upload by hand):
 *   logs/<N>.log         the Hermes log (if "keep the full log" is ticked)
 *   runs/<N>.json        otherwise, the run as read from the log (much smaller)
 *   screenshots/<N>.png  the screenshot
 *   runs.json            date, seed, video, notes, deaths, and for runs without a log: time, 100%, splits
 *   site.json            the site's title and subtitle ("Site settings", and the setup card on a new site)
 */

// ---------- Which repository this site is (build.mjs gets it from GitHub Actions) ----------
const GH = (() => {
  const r = DATA.repo;
  if (r && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.full || "")) return {full: r.full, branch: /^[A-Za-z0-9_./-]+$/.test(r.branch || "") ? r.branch : "main"};
  return null;
})();
const TOKEN_KEY = GH ? "aa-gh-token:" + GH.full : null;
const ghToken = () => { try { return TOKEN_KEY ? localStorage.getItem(TOKEN_KEY) : null; } catch { return null; } };
const signedIn = () => !!ghToken();

// ---------- GitHub API ----------
async function gh(path, opts = {}, token = ghToken()) {
  const res = await fetch("https://api.github.com/repos/" + GH.full + path, {
    method: opts.method || "GET",
    headers: {"Accept": "application/vnd.github+json", "Authorization": "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? {"Content-Type": "application/json"} : {})},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let msg = ""; try { msg = (await res.json()).message || ""; } catch {}
    const e = new Error(res.status === 401 ? T.edTokenBad : res.status === 403 || res.status === 404 && opts.method ? T.edTokenNoWrite(GH.full) : `GitHub: ${res.status} ${msg}`);
    e.status = res.status; throw e;
  }
  return res.status === 204 ? null : res.json();
}
const utf8ToB64 = s => { const b = new TextEncoder().encode(s); let x = ""; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); };
const b64ToUtf8 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0)));
const fileToB64 = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => bad(r.error); r.readAsDataURL(f); });

// A JSON file in the repository as it is right now ({} if there isn't one)
async function readJsonFile(path) {
  try { const f = await gh(`/contents/${path}?ref=${encodeURIComponent(GH.branch)}`); return JSON.parse(b64ToUtf8(f.content)) || {}; }
  catch (e) { if (e.status === 404) return {}; throw e; }
}
const readRunsJson = () => readJsonFile("runs.json");

// One commit with all the changes. files: [{path, text} | {path, b64} | {remove: path or RegExp}]
async function ghCommit(message, files) {
  const head = (await gh(`/git/ref/heads/${GH.branch}`)).object.sha;
  const base = (await gh(`/git/commits/${head}`)).tree.sha;
  const existing = (await gh(`/git/trees/${base}?recursive=1`)).tree.filter(x => x.type === "blob").map(x => x.path);
  const tree = [], seen = new Set();
  for (const f of files) {
    if (f.remove) {
      existing.filter(p => f.remove instanceof RegExp ? f.remove.test(p) : p === f.remove)
        .filter(p => !files.some(g => g.path === p) && !seen.has(p))
        .forEach(p => { seen.add(p); tree.push({path: p, mode: "100644", type: "blob", sha: null}); });
    } else if (f.b64 != null) {
      const blob = await gh("/git/blobs", {method: "POST", body: {content: f.b64, encoding: "base64"}});
      tree.push({path: f.path, mode: "100644", type: "blob", sha: blob.sha});
    } else tree.push({path: f.path, mode: "100644", type: "blob", content: f.text});
  }
  const t = await gh("/git/trees", {method: "POST", body: {base_tree: base, tree}});
  const c = await gh("/git/commits", {method: "POST", body: {message, tree: t.sha, parents: [head]}});
  await gh(`/git/refs/heads/${GH.branch}`, {method: "PATCH", body: {sha: c.sha}});
  return c.sha;
}

// ---------- Owner controls in the header and footer ----------
function mountOwnerControls() {
  const box = $("#ownerBox"), foot = $("#siteFoot"), welcome = $("#welcome");
  if (!GH) { box.innerHTML = ""; foot.innerHTML = ""; welcome.innerHTML = ""; return; }
  box.innerHTML = signedIn() ? `<button type="button" class="btn primary" id="addRunBtn">+ ${esc(T.edAddRun)}</button>` : "";
  foot.innerHTML = signedIn()
    ? `<span class="muted">${esc(T.edSignedIn(GH.full))}</span> <button type="button" class="linkbtn" id="siteSetBtn">${esc(T.edSiteSettings)}</button><span class="muted">·</span><button type="button" class="linkbtn" id="signOutBtn">${esc(T.edSignOut)}</button>`
    : `<button type="button" class="linkbtn" id="signInBtn">${esc(T.edOwnerSignIn)}</button>`;
  // A brand-new site (no runs yet): a card that walks the owner through naming it and adding the first run
  welcome.innerHTML = RUNS.length ? "" : `<section class="card welcome">
      <h2>${esc(T.welcomeTitle)}</h2>
      <p class="muted" style="margin:0">${esc(signedIn() ? T.welcomeTextIn : T.welcomeText)}</p>
      <div class="actions">${signedIn()
        ? `<button type="button" class="btn" data-owner="name">${esc(T.welcomeName)}</button><button type="button" class="btn primary" data-owner="add">+ ${esc(T.welcomeFirstRun)}</button>`
        : `<button type="button" class="btn primary" data-owner="setup">${esc(T.welcomeSetup)}</button>`}</div>
    </section>`;
  if ($("#addRunBtn")) $("#addRunBtn").addEventListener("click", () => openEditor(null));
  if ($("#signInBtn")) $("#signInBtn").addEventListener("click", () => openSignIn());
  if ($("#siteSetBtn")) $("#siteSetBtn").addEventListener("click", openSiteSettings);
  if ($("#signOutBtn")) $("#signOutBtn").addEventListener("click", () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} mountOwnerControls(); if (state.view === "edit") go("runs"); else render(); });
  welcome.querySelectorAll("[data-owner]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.owner;
    if (k === "setup") openSignIn(openSiteSettings); else if (k === "name") openSiteSettings(); else openEditor(null);
  }));
}
// "Edit" button on a run's page (only when signed in)
const editButton = run => signedIn() ? `<button type="button" class="btn" data-edit-run="${esc(run.id)}">${esc(T.edEdit)}</button>` : "";
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-edit-run]"); if (b) openEditor(findRun(b.dataset.editRun)); });

// ---------- Sign in ----------
function openSignIn(then) {
  const m = document.createElement("div");
  m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "signTitle");
  m.innerHTML = `<div class="modal-card">
    <h2 id="signTitle">${esc(T.edSignInTitle)}</h2>
    <p class="muted" style="margin:0">${esc(T.edSignInIntro(GH.full))}</p>
    <ol class="steps">${T.edSignInSteps(GH.full).map(s => `<li>${s}</li>`).join("")}</ol>
    <label class="fld"><span class="label">${esc(T.edToken)}</span><input class="field" type="password" id="tokenIn" autocomplete="off" spellcheck="false"></label>
    <p class="note" style="margin:0">${esc(T.edTokenNote)}</p>
    <p class="cmp-status" id="signMsg" role="status"></p>
    <div class="actions"><button type="button" class="btn" id="signCancel">${esc(T.edCancel)}</button><button type="button" class="btn primary" id="signGo">${esc(T.edSignIn)}</button></div>
  </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener("click", e => { if (e.target === m) close(); });
  m.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  $("#signCancel").addEventListener("click", close);
  $("#tokenIn").focus();
  const submit = async () => {
    const tok = $("#tokenIn").value.trim(); if (!tok) return;
    $("#signMsg").textContent = T.edChecking;
    try {
      await gh(`/contents/?ref=${encodeURIComponent(GH.branch)}`, {}, tok);   // the token can read this repository
      try { localStorage.setItem(TOKEN_KEY, tok); } catch { throw new Error(T.edNoStorage); }
      close(); mountOwnerControls(); render();
      if (typeof then === "function") then();
    } catch (e) { $("#signMsg").textContent = e.message; $("#signMsg").classList.add("bad"); }
  };
  $("#signGo").addEventListener("click", submit);
  $("#tokenIn").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}

// ---------- Add / edit a run ----------
let ED = null;   // what the form is working on

function openEditor(run) {
  if (!signedIn()) return openSignIn(() => openEditor(run));
  const meta = (run && run.meta) || {};
  const nextNum = RUNS.reduce((a, r) => Math.max(a, runNum(r)), 0) + 1;
  ED = {
    run, num: run ? runNum(run) : nextNum, isNew: !run,
    log: null,                              // {file, run} when a log was picked
    keepLog: true,
    hasLog: !!(run && !run.manual),         // the run already has a log on the site
    proof: meta.screenshot ? "shot" : "video",   // a run has a video or a screenshot, never both
    shot: null, removeShot: false,          // new screenshot file / remove the current one
    deaths: null,                           // intentional ticks, filled from the log or the run
    elytraStart: meta.elytraCm != null ? +(meta.elytraCm / 100000).toFixed(2) : null,
    busy: false, msg: "", msgBad: false,
  };
  if (run && !run.manual) ED.deaths = derive(run).deaths.map(x => x.intentional);
  ED.deathsStart = ED.deaths ? ED.deaths.join() : null;   // deaths are only written if a tick changes
  go("edit");
}

// Deaths of the run being edited: from the new log, or from the run already on the site
function edDeaths() {
  const src = ED.log ? ED.log.run : ED.run && !ED.run.manual ? ED.run : null;
  if (!src) return {list: [], defaults: []};
  const plain = {...src, meta: {...(src.meta || {}), intent: undefined}, _d: undefined};   // deaths without runs.json's choices
  const list = derive(plain).deaths;
  return {list, defaults: list.map(x => x.intentional)};
}

const tIn = t => t == null ? "" : fmt(t, t % 1000 ? 3 : 0);
function renderEditor() {
  const el = $("#view-edit");
  if (!ED) { el.innerHTML = ""; return; }
  const run = ED.run, meta = (run && run.meta) || {}, withLog = !!ED.log || ED.hasLog;
  const lr = ED.log && ED.log.run, ld = lr ? derive(lr) : null;
  const {list: deaths} = edDeaths();
  if (!ED.deaths || ED.deaths.length !== deaths.length) ED.deaths = deaths.map(x => x.intentional);
  // the screenshot already uploaded to the site (a link is shown in its own box instead)
  const shotLocal = !ED.removeShot && run && !okUrl(meta.screenshot) && shotUrl(run);
  const splitVal = i => meta.splits && meta.splits[i] != null ? tIn(meta.splits[i]) : "";
  const dimName = {o: T.overworld, n: T.nether, e: T.theEnd};
  const logDate = lr ? new Date(lr.start).toLocaleDateString("en-CA") : "";

  el.innerHTML = `
    <div class="head-row" style="align-items:center">
      <h1>${esc(ED.isNew ? T.edAddRun : T.edEditRun(ED.num))}</h1>
      <label class="fld edpick"><span class="label">${esc(T.edPickRun)}</span><select class="field" id="edPick">
        <option value=""${ED.isNew ? " selected" : ""}>${esc(T.edNewRun)}</option>
        ${byNumber().slice().reverse().map(r => `<option value="${esc(r.id)}"${run === r ? " selected" : ""}>${esc(runTitle(r))} · ${r.finalIgt != null ? fmt(r.finalIgt, 0) : "—"}</option>`).join("")}
      </select></label>
    </div>
    <form class="card edform" id="edForm" novalidate>
      <div class="edgrid">
        <label class="fld"><span class="label">${esc(T.edRunNumber)}</span>
          <input class="field mono" type="number" min="1" step="1" id="edNum" value="${esc(ED.num)}"${ED.isNew ? "" : " disabled"}></label>
        <label class="fld"><span class="label">${esc(T.edDate)}</span>
          <input class="field" type="date" id="edDate" value="${esc(meta.date || logDate)}"></label>
        <label class="fld"><span class="label">${esc(T.seedLabel.replace(/:$/, ""))}</span>
          <input class="field mono" type="text" id="edSeed" value="${esc(meta.seed || "")}" autocomplete="off"></label>
      </div>

      <fieldset class="edsec"><legend>${esc(T.edLog)}</legend>
        <div class="edfile" data-drop="log">
          <button type="button" class="btn" id="edLogBtn">${esc(ED.log ? T.edLogReplace : withLog ? T.edLogReplace : T.edLogPick)}</button>
          <span class="note">${ED.log ? esc(ED.log.file.name) + " · " + esc(T.edLogRead(fmt(lr.finalIgt), ld.category, lr.deaths.length))
            : ED.hasLog ? esc(T.edLogOnSite) : esc(T.edLogNone)}</span>
          <input type="file" id="edLogFile" accept=".log,.txt,.jsonl" hidden>
        </div>
        ${ED.log ? `<label class="check"><input type="checkbox" id="edKeep"${ED.keepLog ? " checked" : ""}> ${esc(T.edKeepLog)}</label>` : ""}
      </fieldset>

      ${withLog ? "" : `<fieldset class="edsec"><legend>${esc(T.edNoLogDetails)}</legend>
        <div class="edgrid">
          <label class="fld"><span class="label">${esc(T.timeLabel)}</span><input class="field mono" type="text" id="edTime" value="${esc(run ? tIn(run.finalIgt) : "")}"></label>
          <label class="fld"><span class="label">${esc(T.colHundred)}</span><select class="field" id="edHundred">
            <option value="yes"${meta.hundred === true ? " selected" : ""}>${esc(T.hundredYes)}</option>
            <option value="no"${meta.hundred !== true ? " selected" : ""}>${esc(T.hundredNo)}</option></select></label>
          ${SPLIT_CARDS.map(i => `<label class="fld"><span class="label">${esc(SPLITS[i].name)}</span><input class="field mono" type="text" data-split="${i}" value="${esc(splitVal(i))}"></label>`).join("")}
        </div>
      </fieldset>`}

      ${deaths.length ? `<fieldset class="edsec"><legend>${esc(T.edDeaths)}</legend>
        <p class="note" style="margin:0 0 6px">${esc(T.edDeathsNote)}</p>
        ${deaths.map((x, k) => `<label class="check"><input type="checkbox" data-death="${k}"${ED.deaths[k] ? " checked" : ""}> ${esc(T.deathMarker(k + 1, deaths.length))} · <span class="mono">${fmt(x.t, 0)}</span> · ${esc(dimName[x.dim] || "")}</label>`).join("")}
      </fieldset>` : ""}

      <fieldset class="edsec"><legend>${esc(T.statElytra)}</legend>
        <div class="edfile">
          <input class="field mono" type="number" min="0" step="0.1" id="edElytra" value="${esc(ED.elytraStart ?? "")}" style="max-width:140px">
          <span class="note">km</span>
          <button type="button" class="btn" id="edStatsBtn">${esc(T.edStatsPick)}</button>
          <input type="file" id="edStatsFile" accept=".json" hidden>
        </div>
      </fieldset>

      <fieldset class="edsec"><legend>${esc(T.edProof)}</legend>
        <div class="edradio" role="radiogroup" aria-label="${esc(T.edProof)}">
          <label class="check"><input type="radio" name="edProof" value="video"${ED.proof === "video" ? " checked" : ""}> ${esc(T.video)}</label>
          <label class="check"><input type="radio" name="edProof" value="shot"${ED.proof === "shot" ? " checked" : ""}> ${esc(T.screenshot)}</label>
        </div>
        ${ED.proof === "video" ? `<label class="fld"><span class="label">${esc(T.edVideoLink)}</span>
          <input class="field" type="url" id="edVideo" value="${esc(meta.video || "")}"></label>` : `
        <label class="fld"><span class="label">${esc(T.edShotLink)}</span>
          <input class="field" type="url" id="edShotLink" value="${esc(ED.shot || !okUrl(meta.screenshot) ? "" : meta.screenshot)}"></label>
        <div class="edfile" data-drop="shot">
          <span class="note">${esc(T.edShotOr)}</span>
          <button type="button" class="btn" id="edShotBtn">${esc(ED.shot || shotLocal ? T.edShotReplace : T.edShotPick)}</button>
          ${ED.shot || shotLocal ? `<button type="button" class="linkbtn" id="edShotRemove">${esc(T.edShotRemove)}</button>` : ""}
          <input type="file" id="edShotFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        </div>
        ${ED.shot ? `<img class="edshot" src="${ED.shot.url}" alt="">` : shotLocal ? `<img class="edshot" src="${esc(shotLocal)}" alt="">` : ""}`}
      </fieldset>

      <label class="fld"><span class="label">${esc(T.notesTitle)}</span><textarea class="field" id="edNotes" rows="5">${esc(meta.notes || "")}</textarea></label>

      <p class="cmp-status${ED.msgBad ? " bad" : ""}" id="edMsg" role="status" aria-live="polite">${ED.msg}</p>
      <div class="actions">
        ${ED.isNew ? "" : `<button type="button" class="btn danger" id="edDelete"${ED.busy ? " disabled" : ""}>${esc(T.edDelete)}</button>`}
        <span style="flex:1"></span>
        <button type="button" class="btn" id="edCancel">${esc(T.edCancel)}</button>
        <button type="submit" class="btn primary" id="edSave"${ED.busy ? " disabled" : ""}>${esc(T.edSave)}</button>
      </div>
    </form>`;

  // keep what's typed when the form redraws (after picking a file)
  const keep = () => { ED.draft = edRead(); };
  const pick = (btn, input, onFile) => {
    if (!$(btn)) return;   // (not every part of the form is always shown)
    $(btn).addEventListener("click", () => $(input).click());
    $(input).addEventListener("change", e => { const f = e.target.files[0]; if (f) onFile(f); });
  };
  pick("#edLogBtn", "#edLogFile", edPickLog);
  pick("#edStatsBtn", "#edStatsFile", edPickStats);
  pick("#edShotBtn", "#edShotFile", f => { keep(); if (!/^image\//.test(f.type)) return edMsg(T.edShotBad, true); ED.shot = {file: f, url: URL.createObjectURL(f)}; ED.removeShot = false; if (ED.draft) ED.draft.shotLink = ""; renderEditor(); edRestore(); });
  if ($("#edShotRemove")) $("#edShotRemove").addEventListener("click", () => { keep(); ED.shot = null; ED.removeShot = true; renderEditor(); edRestore(); });
  el.querySelectorAll('[name="edProof"]').forEach(r => r.addEventListener("change", () => { keep(); ED.proof = r.value; renderEditor(); edRestore(); }));
  $("#edPick").addEventListener("change", e => openEditor(e.target.value ? findRun(e.target.value) : null));
  if ($("#edKeep")) $("#edKeep").addEventListener("change", e => { ED.keepLog = e.target.checked; });
  el.querySelectorAll("[data-death]").forEach(c => c.addEventListener("change", () => { ED.deaths[+c.dataset.death] = c.checked; }));
  el.querySelectorAll("[data-drop]").forEach(z => {
    z.addEventListener("dragover", e => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", e => { e.preventDefault(); z.classList.remove("over"); const f = e.dataTransfer.files[0]; if (!f) return;
      if (z.dataset.drop === "log") edPickLog(f); else { keep(); ED.shot = {file: f, url: URL.createObjectURL(f)}; ED.removeShot = false; ED.draft.shotLink = ""; renderEditor(); edRestore(); } });
  });
  $("#edCancel").addEventListener("click", () => { const r = ED.run; ED = null; r ? go("run", r.id) : go("runs"); });
  $("#edForm").addEventListener("submit", e => { e.preventDefault(); edSave(); });
  if ($("#edDelete")) $("#edDelete").addEventListener("click", edDelete);
}

// What's in the form right now
function edRead() {
  const v = id => { const x = $(id); return x ? x.value.trim() : null; };
  return {num: v("#edNum"), date: v("#edDate"), seed: v("#edSeed"), video: v("#edVideo"), notes: $("#edNotes") ? $("#edNotes").value.replace(/\s+$/, "") : "",
    time: v("#edTime"), hundred: v("#edHundred"), elytra: v("#edElytra"), shotLink: v("#edShotLink"),
    splits: [...document.querySelectorAll("[data-split]")].map(x => [+x.dataset.split, x.value.trim()])};
}
function edRestore() {
  const d = ED.draft; if (!d) return;
  const set = (id, val) => { const x = $(id); if (x && val != null) x.value = val; };
  set("#edNum", d.num); set("#edSeed", d.seed); set("#edVideo", d.video); set("#edNotes", d.notes); set("#edTime", d.time); set("#edHundred", d.hundred); set("#edElytra", d.elytra); set("#edShotLink", d.shotLink);
  if (d.date || !ED.log) set("#edDate", d.date);
  d.splits.forEach(([i, val]) => { const x = document.querySelector(`[data-split="${i}"]`); if (x) x.value = val; });
}
const edMsg = (html, bad) => { ED.msg = html; ED.msgBad = !!bad; const m = $("#edMsg"); if (m) { m.innerHTML = html; m.classList.toggle("bad", !!bad); } };

async function edPickLog(file) {
  ED.draft = edRead();
  edMsg(esc(T.cmpReading));
  await new Promise(r => setTimeout(r, 30));
  try {
    const run = parseLog(await file.text(), file.name);
    run.id = runKey(run); run.meta = {};
    ED.log = {file, run}; ED.deaths = null;
    if (ED.draft && !ED.draft.date) ED.draft.date = null;   // let the log's date fill in
    ED.msg = ""; renderEditor(); edRestore();
  } catch (e) { edMsg(esc(e.message || String(e)), true); }
}
async function edPickStats(file) {
  try {
    const cm = ((JSON.parse(await file.text()).stats || {})["minecraft:custom"] || {})["minecraft:aviate_one_cm"];
    if (cm == null) throw new Error(T.edStatsNone);
    $("#edElytra").value = (cm / 100000).toFixed(1); edMsg("");
  } catch (e) { edMsg(esc(e.message || T.edStatsNone), true); }
}

// ---------- Save ----------
async function edSave() {
  if (ED.busy) return;
  const f = edRead(), num = ED.isNew ? parseInt(f.num, 10) : ED.num;
  const err = m => edMsg(esc(m), true);
  if (!(num >= 1)) return err(T.edBadNumber);
  if (ED.isNew && RUNS.some(r => runNum(r) === num)) return err(T.edNumberTaken(num));
  const isLink = s => /^https?:\/\/\S+$/i.test(s);
  if (ED.proof === "video" && f.video && !isLink(f.video)) return err(T.edBadVideo);
  if (ED.proof === "shot" && f.shotLink && !isLink(f.shotLink)) return err(T.edBadShotLink);
  const withLog = !!ED.log || ED.hasLog;
  const timeOk = s => !s || /^(\d+:)?\d{1,2}:\d{2}(\.\d{1,3})?$/.test(s);
  if (!withLog && !timeOk(f.time)) return err(T.edBadTime(T.timeLabel));
  for (const [i, s] of f.splits) if (!timeOk(s)) return err(T.edBadTime(SPLITS[i].name));
  if (f.elytra && !(+f.elytra >= 0)) return err(T.edBadElytra);

  ED.busy = true; $("#edSave").disabled = true; edMsg(esc(T.edSaving));
  try {
    const details = await readRunsJson(), key = String(num);
    const e = {...(details[key] || {})};
    const put = (k, v) => { if (v == null || v === "") delete e[k]; else e[k] = v; };
    put("date", f.date); put("seed", f.seed); put("notes", f.notes);
    const files = [];

    // runs without a log: time, 100%, splits
    if (withLog) { delete e.time; delete e.hundred; delete e.splits; }
    else {
      put("time", f.time);
      put("hundred", f.hundred === "yes");
      const sp = {}; f.splits.forEach(([i, s]) => { if (s) sp[SPLITS[i].name] = s; });
      put("splits", Object.keys(sp).length ? sp : null);
    }

    // deaths (if a tick changed or there's a new log): only write the ones that differ from the usual rule
    // (after The End... Again... = intentional)
    if (ED.log || (ED.deaths ? ED.deaths.join() : null) !== ED.deathsStart) {
      const {defaults} = edDeaths();
      const on = [], off = [];
      (ED.deaths || []).forEach((v, k) => { if (v !== defaults[k]) (v ? on : off).push(k + 1); });
      put("intentionalDeaths", on.length ? on : null); put("notIntentionalDeaths", off.length ? off : null);
    }

    // elytra distance (only if it was changed here)
    const ely = f.elytra === "" ? null : Math.round(+f.elytra * 100) / 100;
    if (ely !== ED.elytraStart) put("elytraKm", ely);

    // the log
    if (ED.log) {
      if (ED.keepLog) { files.push({path: `logs/${num}.log`, b64: await fileToB64(ED.log.file)}, {remove: `runs/${num}.json`}); }
      else { files.push({path: `runs/${num}.json`, text: JSON.stringify(encodeRun(ED.log.run))}, {remove: `logs/${num}.log`}); }
    }

    // proof: a video or a screenshot (a link, or an image uploaded next to the site), never both
    const oldShot = typeof e.screenshot === "string" && !/^https?:/i.test(e.screenshot) ? e.screenshot : null;
    if (ED.proof === "video") {
      put("video", f.video);
      if (oldShot) files.push({remove: oldShot});
      delete e.screenshot;
    } else if (f.shotLink) {
      delete e.video;
      if (oldShot) files.push({remove: oldShot});
      e.screenshot = f.shotLink;
    } else if (ED.shot) {
      delete e.video;
      const ext = (/\.(png|jpe?g|webp|gif)$/i.exec(ED.shot.file.name) || [, (ED.shot.file.type.split("/")[1] || "png")])[1].toLowerCase().replace("jpeg", "jpg");
      const path = `screenshots/${num}.${ext}`;
      files.push({path, b64: await fileToB64(ED.shot.file)});
      if (oldShot && oldShot !== path) files.push({remove: oldShot});
      e.screenshot = path;
    } else {
      delete e.video;
      if (ED.removeShot || !oldShot) { if (oldShot) files.push({remove: oldShot}); delete e.screenshot; }
    }

    // runs.json: keep an entry for every run without a log, and for runs with a log only if there's something in it
    if (Object.keys(e).length || !withLog) details[key] = e; else delete details[key];
    files.push({path: "runs.json", text: JSON.stringify(sortRuns(details), null, 2) + "\n"});

    const sha = await ghCommit(ED.isNew ? T.edCommitAdd(num) : T.edCommitEdit(num), files);
    edDone(sha);
  } catch (x) { ED.busy = false; $("#edSave").disabled = false; edMsg(esc(x.message || String(x)), true); }
}
const sortRuns = d => Object.fromEntries(Object.entries(d).sort((a, b) => Number(a[0]) - Number(b[0])));

async function edDelete() {
  if (ED.busy || !confirm(T.edDeleteConfirm(ED.num))) return;
  const num = ED.num;
  ED.busy = true; edMsg(esc(T.edSaving));
  try {
    const details = await readRunsJson();
    const shot = details[num] && typeof details[num].screenshot === "string" && !/^https?:/i.test(details[num].screenshot) ? details[num].screenshot : null;
    delete details[num];
    const files = [{remove: `logs/${num}.log`}, {remove: `logs/${num}.stats.json`}, {remove: `runs/${num}.json`},
      {remove: new RegExp(`^screenshots/${num}\\.(png|jpe?g|webp|gif)$`, "i")}, ...(shot ? [{remove: shot}] : []),
      {path: "runs.json", text: JSON.stringify(sortRuns(details), null, 2) + "\n"}];
    edDone(await ghCommit(T.edCommitDelete(num), files));
  } catch (x) { ED.busy = false; edMsg(esc(x.message || String(x)), true); }
}

// ---------- After saving: follow the site's build ----------
function edDone(sha) {
  const form = $("#edForm"); if (form) form.querySelectorAll("input, textarea, select, button").forEach(x => { if (x.id !== "edCancel") x.disabled = true; });
  if ($("#edCancel")) $("#edCancel").textContent = T.edClose;
  watchBuild(sha, edMsg, () => !!ED);
}

// Follows the site's build for commit `sha`, telling say(html, bad) how it's going, while alive() is true
function watchBuild(sha, say, alive) {
  const actions = `https://github.com/${GH.full}/actions`;
  const link = url => ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(T.edSeeBuild)}</a>`;
  say(esc(T.edSaved) + link(actions));
  const started = Date.now();
  const poll = async () => {
    if (!alive() || Date.now() - started > 8 * 60000) return;
    try {
      const r = ((await gh(`/actions/runs?head_sha=${sha}&per_page=5`)).workflow_runs || [])[0];
      if (r && r.status === "completed") {
        if (r.conclusion === "success") return say(`${esc(T.edLive)} <button type="button" class="linkbtn" data-reload>${esc(T.edReload)}</button>`);
        return say(esc(T.edBuildFailed) + link(r.html_url), true);
      }
      if (r) say(esc(T.edBuilding) + link(r.html_url));
    } catch (e) { if (e.status === 403 || e.status === 404) return say(esc(T.edSavedNoWatch) + link(actions)); }
    setTimeout(poll, 5000);
  };
  setTimeout(poll, 4000);
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-reload]")) location.reload(); });

// ---------- Site settings: the title and subtitle (saved in site.json) ----------
function openSiteSettings() {
  if (!signedIn()) return openSignIn(openSiteSettings);
  const m = document.createElement("div");
  m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "siteSetTitle");
  m.innerHTML = `<form class="modal-card" id="siteSetForm">
    <h2 id="siteSetTitle">${esc(RUNS.length ? T.edSiteSettings : T.welcomeName)}</h2>
    <label class="fld"><span class="label">${esc(T.edSiteTitle)}</span><input class="field" type="text" id="siteTitleIn" value="${esc(T.siteTitle)}" maxlength="80"></label>
    <label class="fld"><span class="label">${esc(T.edSiteSubtitle)}</span><input class="field" type="text" id="siteSubIn" value="${esc(T.siteSubtitle)}" maxlength="80"></label>
    <p class="note" style="margin:0">${esc(T.edSiteNote)}</p>
    <p class="cmp-status" id="siteSetMsg" role="status" aria-live="polite"></p>
    <div class="actions"><span style="flex:1"></span><button type="button" class="btn" id="siteSetClose">${esc(T.edCancel)}</button><button type="submit" class="btn primary" id="siteSetSave">${esc(T.edSave)}</button></div>
  </form>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  const say = (html, bad) => { const x = m.querySelector("#siteSetMsg"); x.innerHTML = html; x.classList.toggle("bad", !!bad); };
  m.addEventListener("click", e => { if (e.target === m) close(); });
  m.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  m.querySelector("#siteSetClose").addEventListener("click", close);
  m.querySelector("#siteTitleIn").focus();
  m.querySelector("#siteSetForm").addEventListener("submit", async e => {
    e.preventDefault();
    const title = m.querySelector("#siteTitleIn").value.trim(), sub = m.querySelector("#siteSubIn").value.trim();
    if (!title) return say(esc(T.edSiteNeedTitle), true);
    m.querySelectorAll("input, #siteSetSave").forEach(x => { x.disabled = true; });
    say(esc(T.edSaving));
    try {
      const site = await readJsonFile("site.json");
      site.siteTitle = title; site.siteSubtitle = sub;
      const sha = await ghCommit(T.edCommitName, [{path: "site.json", text: JSON.stringify(site, null, 2) + "\n"}]);
      m.querySelector("#siteSetClose").textContent = T.edClose;
      watchBuild(sha, say, () => m.isConnected);
    } catch (x) { m.querySelectorAll("input, #siteSetSave").forEach(y => { y.disabled = false; }); say(esc(x.message || String(x)), true); }
  });
}

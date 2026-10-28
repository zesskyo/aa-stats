/*
 * app.js — puts the page together: the header, the tabs, switching between them, and starting up.
 */
const state = {view: "runs", runId: null, sort: {key: "num", dir: 1}, zoom: null, zoomRun: null, cmp: null, cmpZoom: null};

document.getElementById("app").innerHTML = `
<header class="top">
  <div class="brand" id="brand"></div>
  <nav class="tabs" aria-label="Pages">
    <button data-view="runs" aria-current="page">${esc(T.tabOverview)}</button>
    <button data-view="run">${esc(T.tabStats)}</button>
    <button data-view="compare">${esc(T.tabCompare)}</button>
  </nav>
  <span style="display:flex;align-items:center;gap:4px;justify-self:end"><a class="toplink" href="${esc(T.leaderboardUrl)}" target="_blank" rel="noopener noreferrer">${esc(T.leaderboard)} <span aria-hidden="true">↗</span></a><span class="ownerbox" id="ownerBox"></span></span>
</header>
<main id="view-runs">
  <div id="welcome" style="display:contents"></div>
  <section class="card" id="pbCard"></section>
  <section style="display:flex;flex-direction:column;gap:14px">
    <h2>${esc(T.fastestSplits)}</h2>
    <div class="grid-splits" id="bestSplits"></div>
    <div class="grid-splits" id="otherSplits"></div>
  </section>
  <section id="aggregates"></section>
  <section style="display:flex;flex-direction:column;gap:14px">
    <h2 style="font-size:28px">${esc(T.runsTitle)}</h2>
    <div class="card tablewrap" style="padding:0" id="runsTable"></div>
  </section>
</main>
<main id="view-run" class="hidden"></main>
<main id="view-compare" class="hidden"></main>
<main id="view-edit" class="hidden"></main>
<main id="view-split" class="hidden"></main>
<footer class="foot" id="siteFoot"></footer>`;

// The site's name (again when it's changed in the site settings)
function showSiteName() {
  document.title = (T.siteTitle + " " + T.siteSubtitle).trim();
  $("#brand").innerHTML = `<b>${esc(T.siteTitle)}${T.siteSubtitle ? ` <span class="muted" style="font-weight:500">${esc(T.siteSubtitle)}</span>` : ""}</b>`;
}
showSiteName();

// Switch tab ("runs" = Overview, "run" = Stats, "compare" = Compare, "edit" = adding/editing a run, "split" = one split's
// page, state.split), optionally opening a particular run
function go(view, runId) {
  state.view = view; if (runId) state.runId = runId;
  showView(); render(); window.scrollTo(0, 0);
}
function showView() {
  const bar = $("#runbar"); if (bar) bar.classList.remove("show");
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.view === state.view ? "page" : "false"));
  ["runs", "run", "compare", "edit", "split"].forEach(v => $("#view-" + v).classList.toggle("hidden", v !== state.view));
}
const render = () => { state.view === "runs" ? renderOverview() : state.view === "compare" ? renderCompare() : state.view === "edit" ? renderEditor()
  : state.view === "split" ? renderSplitPage() : renderRunPage(); syncUrl(); };

// ---------- The address: each page has its own (#/run/12, #/split/midgame, #/compare), so the browser's back button
// goes back to what was shown before, and a page can be linked to ----------
const splitSlug = i => SPLITS[i].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function routeOf() {
  if (state.view === "run") {
    const r = findRun(state.runId); if (!r) return "#/run";
    return "#/run/" + (RUNS.includes(r) && !(r.meta && r.meta.viewed) ? runNum(r) : encodeURIComponent(r.id));   // (the WR, a run being looked at: by id)
  }
  return state.view === "split" ? "#/split/" + splitSlug(state.split || 0) : state.view === "compare" ? "#/compare" : state.view === "edit" ? "#/edit" : "#/";
}
let routing = false;
function syncUrl() {
  if (routing) return;
  const h = routeOf();
  if (location.hash !== h && !(h === "#/" && !location.hash)) history.pushState(null, "", h);
}
function applyUrl() {
  const p = location.hash.replace(/^#\/?/, "").split("/").map(x => { try { return decodeURIComponent(x); } catch { return x; } });
  if (p[0] === "run") {
    state.view = "run";
    const r = p[1] ? (/^\d+$/.test(p[1]) ? RUNS.find(x => String(runNum(x)) === p[1]) : findRun(p[1])) : null;
    if (r) state.runId = r.id;
  } else if (p[0] === "split") { state.view = "split"; state.split = Math.max(0, SPLITS.findIndex((_, k) => splitSlug(k) === p[1])); }
  else state.view = p[0] === "compare" ? "compare" : "runs";   // (adding or editing a run isn't reopened from an address)
}
window.addEventListener("popstate", () => { routing = true; applyUrl(); showView(); render(); routing = false; window.scrollTo(0, 0); });
document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));

// Clicking (or pressing Enter on) a row in the runs table opens that run
$("#runsTable").addEventListener("click", e => {
  if (e.target.closest("a, button")) return;      // the video link and the sort buttons do their own thing
  const row = e.target.closest("tr[data-open]"); if (row) go("run", row.dataset.open);
});
$("#runsTable").addEventListener("keydown", e => {
  const row = e.target.closest && e.target.closest("tr[data-open]");
  if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go("run", row.dataset.open); }
});

// Keyboard shortcuts on the Stats and Compare pages (see progress-graph.js and compare.js), ignored while typing in a box
document.addEventListener("keydown", e => {
  const keys = state.view === "run" ? chartKeys : state.view === "compare" ? cmpKeys : null;
  if (!keys || e.ctrlKey || e.metaKey || e.altKey) return;
  const tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName))) return;
  if (keys(e)) e.preventDefault();
});

cmpLoad();
mountOwnerControls();
routing = true; applyUrl(); showView(); render(); routing = false;

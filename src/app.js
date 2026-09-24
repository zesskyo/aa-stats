/*
 * app.js — puts the page together: the header, the tabs, switching between them, and starting up.
 */
const state = {view: "runs", runId: null, sort: {key: "num", dir: 1}, zoom: null, zoomRun: null, cmp: null, cmpZoom: null};

document.title = (T.siteTitle + " " + T.siteSubtitle).trim();
document.getElementById("app").innerHTML = `
<header class="top">
  <div class="brand"><b>${esc(T.siteTitle)}${T.siteSubtitle ? ` <span class="muted" style="font-weight:500">${esc(T.siteSubtitle)}</span>` : ""}</b></div>
  <nav class="tabs" aria-label="Pages">
    <button data-view="runs" aria-current="page">${esc(T.tabOverview)}</button>
    <button data-view="run">${esc(T.tabStats)}</button>
    <button data-view="compare">${esc(T.tabCompare)}</button>
  </nav>
  <span class="ownerbox" id="ownerBox"></span>
</header>
<main id="view-runs">
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
<footer class="foot" id="siteFoot"></footer>`;

// Switch tab ("runs" = Overview, "run" = Stats, "compare" = Compare, "edit" = adding/editing a run), optionally opening a particular run
function go(view, runId) {
  state.view = view; if (runId) state.runId = runId;
  const bar = $("#runbar"); if (bar) bar.classList.remove("show");
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
  ["runs", "run", "compare", "edit"].forEach(v => $("#view-" + v).classList.toggle("hidden", v !== view));
  render(); window.scrollTo(0, 0);
}
const render = () => state.view === "runs" ? renderOverview() : state.view === "compare" ? renderCompare() : state.view === "edit" ? renderEditor() : renderRunPage();
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
render();

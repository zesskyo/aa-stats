/*
 * run-switcher.js — moving between runs on the Stats page:
 *   the page buttons at the top (‹ 1 … 8 9 [10] 11 ›, plus "Go to run"),
 *   and the small bar that sticks under the header when you scroll down.
 */
function pager(run) {
  const list = byNumber(), i = list.indexOf(run), n = list.length;
  const show = new Set([0, n - 1, i - 2, i - 1, i, i + 1, i + 2].filter(k => k >= 0 && k < n));
  let prev = -1, pages = "";
  [...show].sort((a, b) => a - b).forEach(k => {
    if (prev >= 0 && k - prev > 1) pages += `<span class="gap" aria-hidden="true">…</span>`;
    pages += `<button type="button" class="pg${k === i ? " on" : ""}" data-go="${esc(list[k].id)}" ${k === i ? 'aria-current="page"' : ""} aria-label="${esc(runTitle(list[k]))}">${runNum(list[k])}</button>`;
    prev = k;
  });
  return `<nav class="pager" aria-label="${esc(T.tabStats)}">
    <button type="button" class="pg arrow" data-go="${i > 0 ? esc(list[i - 1].id) : ""}" ${i > 0 ? "" : "disabled"} aria-label="${esc(T.previousRun)}" title="${esc(T.previousRun)} ([)">‹</button>
    ${pages}
    <button type="button" class="pg arrow" data-go="${i < n - 1 ? esc(list[i + 1].id) : ""}" ${i < n - 1 ? "" : "disabled"} aria-label="${esc(T.nextRun)}" title="${esc(T.nextRun)} (])">›</button>
    ${n > 1 ? `<form class="goto" id="gotoForm"><label for="gotoRun" class="note">${esc(T.goToRun)}</label><input id="gotoRun" type="text" inputmode="numeric" autocomplete="off" placeholder="#"><button type="submit" class="pg arrow" aria-label="${esc(T.goToRun)}">→</button><span class="note" id="gotoMsg" role="status" aria-live="polite"></span></form>` : ""}
  </nav>`;
}

function bindPager(el) {
  el.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { if (b.dataset.go) { state.runId = b.dataset.go; renderRunPage(); } }));
  const f = el.querySelector("#gotoForm"); if (!f) return;
  f.addEventListener("submit", e => {
    e.preventDefault();
    const v = f.querySelector("#gotoRun").value.trim(), n = parseInt(v, 10);
    const r = RUNS.find(x => runNum(x) === n);
    if (r) { state.runId = r.id; renderRunPage(); } else f.querySelector("#gotoMsg").textContent = T.noSuchRun + " " + v;
  });
}

// The sticky bar: appears once the run title scrolls out of view; ▴ shrinks it to a small tab (remembered)
let runBarObserver = null;
function mountRunBar(run, d) {
  let bar = $("#runbar");
  if (!bar) { bar = document.createElement("div"); bar.id = "runbar"; bar.className = "runbar"; document.querySelector("header.top").after(bar); }
  const list = byNumber(), i = list.indexOf(run);
  let collapsed = false; try { collapsed = localStorage.getItem("aa-runbar") === "min"; } catch {}
  bar.innerHTML = collapsed
    ? `<button type="button" class="runbar-tab" id="rbToggle" aria-expanded="false" title="${esc(T.showRunBar)}">${esc(runTitle(run))} <span aria-hidden="true">▾</span></button>`
    : `<div class="runbar-inner">
        <button type="button" class="pg arrow" id="rbPrev" ${i > 0 ? "" : "disabled"} aria-label="${esc(T.previousRun)}">‹</button>
        <span class="runbar-title">${esc(runTitle(run))}</span>
        <span class="cat ${d.category.toLowerCase()}">${d.category}</span>
        <span class="mono runbar-time">${fmt(run.finalIgt)}</span>
        <button type="button" class="pg arrow" id="rbNext" ${i < list.length - 1 ? "" : "disabled"} aria-label="${esc(T.nextRun)}">›</button>
        <button type="button" class="runbar-hide" id="rbToggle" aria-expanded="true" title="${esc(T.minimise)}">▴</button>
      </div>`;
  $("#rbToggle").addEventListener("click", () => { try { localStorage.setItem("aa-runbar", collapsed ? "full" : "min"); } catch {} mountRunBar(run, d); });
  const pv = $("#rbPrev"), nx = $("#rbNext");
  if (pv) pv.addEventListener("click", () => { state.runId = list[i - 1].id; renderRunPage(); });
  if (nx) nx.addEventListener("click", () => { state.runId = list[i + 1].id; renderRunPage(); });

  const headerH = document.querySelector("header.top").getBoundingClientRect().height;
  bar.style.top = headerH + "px";
  if (runBarObserver) runBarObserver.disconnect();
  const h1 = $("#runH1");
  const update = titleVisible => bar.classList.toggle("show", state.view === "run" && !titleVisible);
  if ("IntersectionObserver" in window && h1) { runBarObserver = new IntersectionObserver(es => update(es[0].isIntersecting), {rootMargin: `-${Math.round(headerH)}px 0px 0px 0px`}); runBarObserver.observe(h1); }
  else update(false);
}

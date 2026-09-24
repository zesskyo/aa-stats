/*
 * charts.js — draws the graphs as SVG.
 *
 * chartSVG(options) returns the SVG text. The main options:
 *   series   lines to draw: [{points: [[time, value], …], color, w (width), dash, endLabel, axis: "r" for the right axis}]
 *   W, H     size; xmin / xmaxFix: time range; fitY: scale the height to what's visible
 *   bands    coloured split backgrounds [{name, start, end, ci (colour number)}]
 *   strip    the dimension strip under the graph
 *   deaths   death lines; markers: icons on the lines [{t, v, icon, color, text, sub}]
 *   thunder  thunder lines [{t, text}]; riptide: highlighted riptide sessions [{start, end, text}]
 *   rug      small ticks along the bottom (TNT placed)
 *   noXAxis / noY: hide the time labels / value labels
 */
function chartSVG({series, W = 1280, H = 460, strip = null, bands = null, deaths = null, thunder = null, riptide = null, yKey = "adv", mini = false, ref = null, xmin = 0, xmaxFix = null, ystepFix = null, rug = null, rugLabel = null, noY = false, lanes = null, markers = null, markersDim = false, fitY = false, noXAxis = false, clean = false, bandLabels = true, title = null, vlines = null, xFmt = null, padRFix = null}) {
  const hasR = series.some(s => s.axis === "r");
  const laneH = lanes ? lanes.length * 22 + 6 : 0, hasLabels = series.some(s => s.label || s.endLabel);
  const padL = mini ? 0 : (lanes ? 78 : noY ? 12 : 48), padR = padRFix ?? (mini ? 0 : (hasLabels ? (clean ? 120 : 150) : hasR && !noY ? 56 : 16)), padT = mini ? 2 : (bands && bandLabels ? 30 : title ? 24 : 16), padB = mini ? 2 : (noXAxis ? 8 : 34), stripH = strip ? 22 : 0, rugH = rug ? 16 : 0;
  const iw = W - padL - padR, ih = H - padT - padB - stripH - rugH - laneH;
  let xmax = 0, ymax = ref ? ref.v : 0;
  let ymaxR = 0;
  for (const s of series) {
    const p = s.points; if (!p.length) continue;
    xmax = Math.max(xmax, p[p.length - 1][0]);
    const vis = fitY && xmaxFix != null ? p.filter(q => q[0] <= xmaxFix) : p;
    const top = vis.length ? Math.max(...vis.map(q => q[1])) : 0;
    if (s.dim && fitY) continue;
    if (s.axis === "r") ymaxR = Math.max(ymaxR, top); else ymax = Math.max(ymax, top);
  }
  const hr = 3600000, span = (xmaxFix ?? xmax) - xmin;
  const step = span > 3 * hr ? 1800000 : span > hr ? 900000 : span > 20 * 60000 ? 300000 : span > 5 * 60000 ? 60000 : span > 90000 ? 15000 : 5000;
  xmax = xmaxFix ?? Math.max(xmin + step, Math.ceil(xmax / step) * step);
  const ystep = ystepFix || (yKey === "adv" ? (ymax > 120 ? 40 : ymax > 40 ? 20 : ymax > 16 ? 5 : 2) : yKey === "res" ? (ymax > 100 ? 50 : ymax > 40 ? 20 : ymax > 16 ? 5 : 2) : 50); ymax = Math.max(ystep, Math.ceil(ymax / ystep) * ystep);
  const rstep = ymaxR > 2000 ? 500 : ymaxR > 500 ? 200 : ymaxR > 100 ? 50 : 10; ymaxR = Math.max(rstep, Math.ceil(ymaxR / rstep) * rstep);
  const X = t => padL + (t - xmin) / (xmax - xmin) * iw, Y = v => padT + ih - v / ymax * ih, YR = v => padT + ih - v / ymaxR * ih;
  const hot = [];
  const cid = "cp" + (++clipSeq), XC = t => Math.min(Math.max(X(t), padL), W - padR);
  let o = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Progress over in-game time"><defs><clipPath id="${cid}"><rect x="${padL}" y="0" width="${iw}" height="${H}"/></clipPath><clipPath id="${cid}y"><rect x="${padL}" y="${padT - 3}" width="${iw}" height="${ih + 6}"/></clipPath></defs><g clip-path="url(#${cid})">`;
  if (bands) bands.forEach((b, i) => {
    if (b.end == null || b.start == null) return;
    const w = X(b.end) - X(b.start), wv = XC(b.end) - XC(b.start);
    o += `<rect class="c-band${b.ci ?? i}" x="${X(b.start)}" y="${padT}" width="${Math.max(w, 0)}" height="${ih}"/>`;
    o += `<line class="c-bandline" x1="${X(b.end)}" x2="${X(b.end)}" y1="${padT - 22}" y2="${padT + ih}"/>`;
    if (bandLabels && wv > 70) o += `<text class="c-bandtext" x="${XC(b.start) + 6}" y="${padT - 10}">${esc(b.name)}</text>`;
  });
  o += "</g>";
  if (title) o += `<text class="c-bandtext" x="${padL}" y="${padT - 8}">${esc(title)}</text>`;
  if (!mini) {
    for (let v = 0; v <= ymax; v += ystep) o += `<line class="c-grid" x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}"/>` + (noY ? "" : `<text class="c-ax" x="${padL - 10}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`);
    if (hasR && !noY) for (let v = 0; v <= ymaxR; v += rstep) o += `<text class="c-ax" x="${W - padR + 8}" y="${YR(v) + 4}">${v}</text>`;
    if (!noXAxis) for (let t = Math.ceil(xmin / step) * step; t <= xmax; t += step) o += `<text class="c-ax" x="${X(t)}" y="${H - 8}" text-anchor="middle">${xFmt ? xFmt(t) : step < 60000 ? fmt(t, 0) : Math.floor(t / hr) + ":" + String(Math.round(t % hr / 60000)).padStart(2, "0")}</text>`;
  }
  if (ref) o += `<line class="c-ref" x1="${padL}" x2="${W - padR}" y1="${Y(ref.v)}" y2="${Y(ref.v)}"/><text class="c-reftext" x="${padL + 6}" y="${Y(ref.v) - 6}">${esc(ref.label)}</text>`;
  o += `<g clip-path="url(#${cid})">`;
  if (riptide) riptide.forEach(r => {
    const x0 = X(r.start), x1 = Math.max(X(r.end), x0 + 3);
    o += `<rect class="c-riptide" x="${x0}" y="${padT}" width="${x1 - x0}" height="${ih}"/><rect class="c-riptide-top" x="${x0}" y="${padT}" width="${x1 - x0}" height="3"/>`;
    o += icAt("trident", (x0 + x1) / 2 - 8, padT + 5, 16);
    if (r.text) hot.push({x: (x0 + x1) / 2, y: padT + 13, text: r.text, t: r.start});
  });
  if (thunder) thunder.forEach(d => {
    o += `<line class="c-thunder" x1="${X(d.t)}" x2="${X(d.t)}" y1="${padT + 8}" y2="${padT + ih}"/>` + (icAt("thunder", X(d.t) - 9, padT - 10, 18) || boltAt(X(d.t) - 9, padT - 10, 18));
    if (d.text) hot.push({x: X(d.t), y: padT, text: d.text, t: d.t});
  });
  if (deaths) deaths.forEach(d => {
    o += `<line class="c-death" x1="${X(d.t)}" x2="${X(d.t)}" y1="${padT + 8}" y2="${padT + ih}"/>` + (icAt("skull", X(d.t) - 9, padT - 10, 18) || `<circle cx="${X(d.t)}" cy="${padT}" r="5" class="c-deathm"/>`);
    if (d.text) hot.push({x: X(d.t), y: padT, text: d.text, t: d.t});
  });
  const usedLY = [], endLabels = [];
  series.forEach(s => {
    if (!s.points.length) return;
    const YY = s.axis === "r" ? YR : Y;
    let d = `M${X(Math.max(xmin, s.points[0][0] > xmin && s.key && s.key !== "adv" ? s.points[0][0] : xmin)).toFixed(1)},${YY(0)}`;
    for (const [t, v] of s.points) d += ` H${X(t).toFixed(1)} V${YY(v).toFixed(1)}`;
    const l = s.points[s.points.length - 1];
    if (xmaxFix != null && s.extend !== false) d += ` H${X(Math.min(xmax, s.until ?? xmax)).toFixed(1)}`;
    const op = s.dim ? ";opacity:.13" : s.soft ? ";opacity:.75" : "";
    o += `<path clip-path="url(#${cid}y)" d="${d}" fill="none" style="stroke:${s.color}${op}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""} stroke-width="${s.w || (mini ? 1.75 : 2.25)}" stroke-linejoin="round"/>`;
    if (!mini && !clean) o += `<circle clip-path="url(#${cid}y)" cx="${X(l[0])}" cy="${YY(l[1])}" r="${s.w && s.w < 2 ? 3 : 4}" style="fill:${s.color}${op}"/>`;
    if (s.endLabel && !s.dim) { const lv = lastBefore(s.points, xmax); endLabels.push({y: YY(lv ? lv[1] : 0), text: s.endLabel(lv ? lv[1] : 0), color: s.color, strong: s.key === "adv" || (!s.soft)}); }
    if (s.label) { o += "</g>"; let ly = YY(l[1]) + 4; while (usedLY.some(u => Math.abs(u - ly) < 15)) ly += 15; usedLY.push(ly); o += `<text class="c-endlabel" x="${W - padR + 8}" y="${ly}" style="fill:${s.color}">${esc(s.label)}</text>`; o += `<g clip-path="url(#${cid})">`; }
  });
  if (markers) { o += `<g style="opacity:${markersDim ? .14 : 1}">`; markers.filter(m => Y(m.v) >= padT - 2).forEach(m => {
    const cy = m.end || m.faded != null ? Y(m.v) : Y(m.v) - 12;
    const g0 = m.faded ? `<g style="opacity:.4">` : "", g1 = m.faded ? "</g>" : "";
    o += g0 + (icAt(m.icon, X(m.t) - 10, cy - 10, 20) || `<circle cx="${X(m.t)}" cy="${cy}" r="${m.end ? 4.5 : 5}" style="fill:${m.color};stroke:var(--surface);stroke-width:1.5"/>`) + g1;
    if (!markersDim && m.text && m.t >= xmin && m.t <= xmax) hot.push({x: X(m.t), y: cy, text: m.text, sub: m.sub, t: m.realT ?? m.t});
  }); o += "</g>"; }
  if (vlines) vlines.forEach(v => { o += `<line class="c-pause" x1="${X(v.t)}" x2="${X(v.t)}" y1="${padT}" y2="${padT + ih}"/><text class="c-pausetext" x="${X(v.t) + 4}" y="${padT + 12}">${esc(v.label)}</text>`; });
  if (rug) { const ry = padT + ih + 4; rug.forEach(t => { o += `<line class="c-tnt" x1="${X(t)}" x2="${X(t)}" y1="${ry}" y2="${ry + 10}"/>`; }); if (rugLabel) o += `</g><text class="c-endlabel c-tntlabel" x="${W - padR + 8}" y="${ry + 9}">${esc(rugLabel)}</text><g clip-path="url(#${cid})">`; }
  if (lanes) lanes.forEach((ln, li) => {
    const ly = padT + ih + 10 + li * 22;
    o += `<line class="c-grid" x1="${padL}" x2="${W - padR}" y1="${ly + 9}" y2="${ly + 9}"/><text class="c-lanelabel" x="${padL - 8}" y="${ly + 13}" text-anchor="end">${esc(ln.label)} ${ln.times.length}</text>`;
    ln.times.forEach(t => { o += icAt(ln.icon, X(t) - 9, ly, 18) || `<circle cx="${X(t)}" cy="${ly + 9}" r="5" style="fill:${ln.color}"/>`; });
  });
  if (strip) {
    const col = {o: "c-ow", n: "c-ne", e: "c-en"}, sy = padT + ih + laneH + 8;
    strip.segs.forEach((s, i) => {
      const e = i + 1 < strip.segs.length ? strip.segs[i + 1][0] : strip.end;
      o += `<rect class="${col[s[1]]}" x="${X(s[0])}" y="${sy}" width="${Math.max(X(e) - X(s[0]), .6)}" height="10"/>`;
    });
  }
  o += "</g>";
  if (endLabels.length) {
    endLabels.sort((a, b) => a.y - b.y);
    const lab = []; endLabels.forEach(e => { let y = e.y + 4; if (lab.length && y - lab[lab.length - 1] < 14) y = lab[lab.length - 1] + 14; lab.push(y); o += `<text class="c-endlabel" x="${W - padR + 8}" y="${y}" style="fill:${e.color}${e.strong ? "" : ";opacity:.85"}">${esc(e.text)}</text>`; });
  }
  if (!mini) o += `<rect class="brush" x="0" y="${padT}" width="0" height="${ih}" visibility="hidden"/><line class="hoverline c-hover" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" visibility="hidden"/><rect class="hit" x="${padL}" y="${Math.max(0, padT - 24)}" width="${iw}" height="${ih + stripH + rugH + laneH + Math.min(24, padT)}" fill="transparent"/>`;
  return {svg: o + "</svg>", geom: {padL, iw, xmin, xmax, W, hot}};
}
let clipSeq = 0;
// Lightning bolt drawn when there's no icons/thunder.png
const boltAt = (x, y, size) => `<path class="c-bolt" transform="translate(${x} ${y}) scale(${size / 24})" d="M13 1 3 14h8l-2 9 11-13h-8l2-9z"/>`;

/*
 * mountChart — draws a chart into `box` and makes it interactive:
 *   hovering shows a line and a tooltip (describe(t) returns the tooltip HTML for time t),
 *   hovering a marker shows the marker's own text, dragging selects a range (opts.onBrush),
 *   and the scroll wheel zooms when opts.wheelActive() says so (full screen).
 * Returns {showLine(t)} so another chart can draw the same hover line.
 */
function mountChart(box, opts, describe) {
  const {svg, geom} = chartSVG(opts);
  box.innerHTML = svg + '<div class="tip"></div>';
  const svgEl = box.querySelector("svg"), tip = box.querySelector(".tip"), line = box.querySelector(".hoverline"), hit = box.querySelector(".hit");
  if (!hit) return null;
  const hide = () => { tip.style.display = "none"; line.setAttribute("visibility", "hidden"); if (opts.onHover) opts.onHover(null); };
  const ctl = {
    showLine(t) { if (t == null || t < geom.xmin || t > geom.xmax) { line.setAttribute("visibility", "hidden"); return; } const x = geom.padL + (t - geom.xmin) / (geom.xmax - geom.xmin) * geom.iw; line.setAttribute("x1", x); line.setAttribute("x2", x); line.setAttribute("visibility", "visible"); }
  };
  hit.addEventListener("pointermove", ev => {
    const r = svgEl.getBoundingClientRect(), scale = geom.W / r.width;
    const x = (ev.clientX - r.left) * scale, t = geom.xmin + (x - geom.padL) / geom.iw * (geom.xmax - geom.xmin);
    if (t < geom.xmin || t > geom.xmax) return hide();
    line.setAttribute("x1", x); line.setAttribute("x2", x); line.setAttribute("visibility", "visible");
    if (opts.onHover) opts.onHover(t);
    const y = (ev.clientY - r.top) * scale;
    const near = geom.hot.filter(h => Math.abs(h.x - x) < 12 && Math.abs(h.y - y) < 14).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    tip.innerHTML = near ? `<div class="thead"><b>${esc(near.text)}</b></div>${near.sub ? `<div>${esc(near.sub)}</div>` : ""}<div class="mono muted">${fmt(near.t, 0)}</div>` : opts.clean ? describe(t) : `<div class="mono muted">${fmt(t, 0)}</div>` + describe(t);
    tip.style.display = "block";
    const px = ev.clientX - r.left, w = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(px + 14, 0), r.width - w) + "px";
    tip.style.top = Math.max(ev.clientY - r.top - 10 - tip.offsetHeight, 0) + "px";
  });
  hit.addEventListener("pointerleave", () => { if (!drag) hide(); });
  const toT = ev => { const r = svgEl.getBoundingClientRect(), x = (ev.clientX - r.left) * geom.W / r.width; return {x, t: geom.xmin + (x - geom.padL) / geom.iw * (geom.xmax - geom.xmin)}; };
  let drag = null; const brush = box.querySelector(".brush");
  if (opts.onBrush) {
    hit.style.cursor = "crosshair";
    hit.addEventListener("pointerdown", ev => { if (ev.button !== 0) return; drag = toT(ev); hit.setPointerCapture(ev.pointerId); });
    hit.addEventListener("pointermove", ev => {
      if (!drag) return; const c = toT(ev);
      brush.setAttribute("x", Math.min(drag.x, c.x)); brush.setAttribute("width", Math.abs(c.x - drag.x)); brush.setAttribute("visibility", "visible");
    });
    const end = ev => {
      if (!drag) return; const c = toT(ev), a = drag; drag = null; brush.setAttribute("visibility", "hidden");
      if (Math.abs(c.x - a.x) > 10) opts.onBrush(Math.max(geom.xmin, Math.min(a.t, c.t)), Math.min(geom.xmax, Math.max(a.t, c.t)));
    };
    hit.addEventListener("pointerup", end); hit.addEventListener("pointercancel", () => { drag = null; brush.setAttribute("visibility", "hidden"); });
  }
  if (opts.onWheel) hit.addEventListener("wheel", ev => { if (!opts.wheelActive()) return; ev.preventDefault(); opts.onWheel(toT(ev).t, ev.deltaY > 0 ? 1.25 : 0.8); }, {passive: false});
  return ctl;
}

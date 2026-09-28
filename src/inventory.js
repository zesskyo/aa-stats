/*
 * inventory.js — the player's inventory through the run, drawn like the game's inventory screen.
 * build.mjs reads it from the log into inv/<N>.json (see inv.mjs) and puts the item icons the site needs in
 * items/ (atlas.png, rendered from the game's models; items.json says where each icon is).
 * With a travel map it's under the map and follows its timeline; otherwise it has a card and a slider of its own.
 * Hovering (or tapping) an item shows its tooltip, as in the game, plus its durability, and for a shulker box a
 * grid of what's inside (like the Shulker Box Tooltip mod).
 *
 * Everything is drawn in the game's GUI pixels (the inventory screen is 176×166), times P screen pixels:
 * P = the GUI scale (2, or 3 with room) × the screen's pixel density, so it stays sharp.
 */
// where each slot is on the inventory screen (0–8 hotbar, 9–35 inventory, 36–39 boots→helmet, 40 off hand)
const INV_SLOTS = (() => {
  const s = [];
  for (let i = 0; i < 9; i++) s[i] = [8 + 18 * i, 142];
  for (let i = 9; i < 36; i++) s[i] = [8 + 18 * ((i - 9) % 9), 84 + 18 * Math.floor((i - 9) / 9)];
  s[39] = [8, 8]; s[38] = [8, 26]; s[37] = [8, 44]; s[36] = [8, 62]; s[40] = [77, 62];
  return s;
})();
const INV_EMPTY = {39: "empty_helmet", 38: "empty_chestplate", 37: "empty_leggings", 36: "empty_boots", 40: "empty_shield"};
// shulker box colours for the contents grid (the undyed box is purple)
const INV_DYE = {white: "#F9FFFE", orange: "#F9801D", magenta: "#C74EBD", light_blue: "#3AB3DA", yellow: "#FED83D", lime: "#80C71F", pink: "#F38BAA", gray: "#474F52",
  light_gray: "#9D9D97", cyan: "#169C9C", purple: "#8932B8", blue: "#3C44AA", brown: "#835432", green: "#5E7C16", red: "#B02E26", black: "#1D1D21", "": "#976997"};

let invAssetsP = null;
const invData = {};
function invAssets() {
  if (invAssetsP) return invAssetsP;
  const img = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  invAssetsP = Promise.all([
    fetch("items/items.json").then(r => { if (!r.ok) throw 0; return r.json(); }),
    img("items/atlas.png"), img("items/inventory.png"), img("items/ascii.png"), img("items/glint.png"), img("items/shulker_box.png"),
    ...Object.values(INV_EMPTY).map(k => img(`items/${k}.png`)),
  ]).then(([db, atlas, gui, font, glint, shulker, ...empties]) => {
    const empty = {}; Object.values(INV_EMPTY).forEach((k, i) => { empty[k] = empties[i]; });
    return {db, atlas, gui, glint, shulker, empty, font: invFont(font)};
  });
  invAssetsP.catch(() => { invAssetsP = null; });
  return invAssetsP;
}

// ---------- the game's font (textures/font/ascii.png: 16×16 characters of 8×8) ----------
function invFont(img) {
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height).data, g = img.width / 16, adv = [];
  for (let ch = 0; ch < 256; ch++) {
    const cx = (ch % 16) * g, cy = Math.floor(ch / 16) * g;
    let w = 0;
    for (let col = g - 1; col >= 0 && !w; col--) for (let row = 0; row < g; row++) if (px[((cy + row) * c.width + cx + col) * 4 + 3] > 0) { w = col + 1; break; }
    adv[ch] = ch === 32 ? 4 : w + 1;   // how far the next character goes (the game's widths)
  }
  const tints = {};
  const tinted = color => {
    if (tints[color]) return tints[color];
    const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
    const tx = t.getContext("2d"); tx.drawImage(img, 0, 0); tx.globalCompositeOperation = "source-in"; tx.fillStyle = color; tx.fillRect(0, 0, t.width, t.height);
    return tints[color] = t;
  };
  const code = ch => { const n = ch.charCodeAt(0); return n < 256 ? n : 63; };
  return {
    width: s => [...s].reduce((a, ch) => a + adv[code(ch)], 0),
    // text at (x, y) in GUI pixels, P screen pixels each, with the game's shadow (a quarter as bright, one pixel down-right)
    draw(ctx, s, x, y, color, P) {
      const shadow = "#" + [1, 3, 5].map(i => Math.floor(parseInt(color.slice(i, i + 2), 16) / 4).toString(16).padStart(2, "0")).join("");
      for (const [col, d] of [[shadow, 1], [color, 0]]) {
        let cx = x;
        for (const ch of s) {
          const n = code(ch);
          ctx.drawImage(tinted(col), (n % 16) * g, Math.floor(n / 16) * g, g, g, (cx + d) * P, (y + d) * P, 8 * P, 8 * P);
          cx += adv[n];
        }
      }
    },
  };
}

// ---------- the inventory at a time ----------
function invPrep(raw) {
  const n = raw.e.length / 4, t = new Float64Array(n), slot = new Uint8Array(n), stack = new Int32Array(n), count = new Int32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += raw.e[i * 4]; t[i] = acc * 100; slot[i] = raw.e[i * 4 + 1]; stack[i] = raw.e[i * 4 + 2]; count[i] = raw.e[i * 4 + 3]; }
  return {s: raw.s, n, t, slot, stack, count};
}
function invAt(D, ms) {
  const items = new Array(41).fill(null);
  for (let i = 0; i < D.n && D.t[i] <= ms; i++) items[D.slot[i]] = D.stack[i] ? [D.stack[i] - 1, D.count[i]] : null;
  return items;
}

// Draws the inventory into `host` for run; returns {set(ms)} (null if there's nothing to show)
async function invMount(host, run) {
  let A, D = invData[run.id];
  try {
    A = await invAssets();
    if (!D) { const r = await fetch(run.meta.inv); if (!r.ok) throw 0; D = invData[run.id] = invPrep(await r.json()); }
  } catch { host.innerHTML = `<p class="muted" style="margin:0">${esc(T.invFailed)}</p>`; return null; }
  if (!host.isConnected) return null;
  const W = 176, H = 166;
  host.innerHTML = `<div class="invwrap"><canvas class="invcanvas" aria-label="${esc(T.invTitle)}"></canvas><canvas class="invtip" aria-hidden="true"></canvas></div>`;
  const wrap = host.querySelector(".invwrap"), cv = host.querySelector(".invcanvas"), ctx = cv.getContext("2d"), tipCv = host.querySelector(".invtip"), tctx = tipCv.getContext("2d");
  const {db, atlas, gui, glint, shulker, empty, font} = A;
  // the scale: the game's GUI scale (3 when there's room, else 2, shrunk to fit a phone) × pixel density
  let G = 2, P = 2;
  const sizeUp = () => {
    const room = host.clientWidth || W * 2;
    G = room >= W * 3 + 40 ? 3 : 2;
    P = Math.max(1, Math.round(G * (devicePixelRatio || 1)));
    cv.width = W * P; cv.height = H * P;
    wrap.style.width = W * G + "px";
  };
  let body = null;
  if (run.uuid || run.player) { body = new Image(); body.onload = () => draw(); body.src = `https://mc-heads.net/body/${encodeURIComponent((run.uuid || run.player).replace(/-/g, ""))}/120`; }
  let items = [], hover = -1, glinting = false, raf = 0, visible = true;

  // ---- drawing one item: icon, enchantment glint, durability bar, count (GUI pixels x, y; into context c at scale p) ----
  const gl = document.createElement("canvas"), glx = gl.getContext("2d");
  const iconAt = (c, key, x, y, p) => {
    const k = db.index[key] != null ? db.index[key] : db.index.barrier; if (k == null) return;
    c.drawImage(atlas, (k % db.cols) * db.size, Math.floor(k / db.cols) * db.size, db.size, db.size, x * p, y * p, 16 * p, 16 * p);
  };
  const glintAt = (c, key, x, y, p, now) => {   // the game's glint texture sliding over the item, added on top
    const k = db.index[key]; if (k == null) return;
    gl.width = gl.height = 16 * p; glx.imageSmoothingEnabled = false;
    const size = 64 * p, off = (now / 40 * p / 2) % size;
    glx.save(); glx.rotate(-Math.PI / 18);
    for (const dx of [-size, 0]) glx.drawImage(glint, off + dx - 8 * p, -12 * p, size, size);
    glx.restore();
    glx.globalCompositeOperation = "destination-in";
    glx.drawImage(atlas, (k % db.cols) * db.size, Math.floor(k / db.cols) * db.size, db.size, db.size, 0, 0, gl.width, gl.height);
    glx.globalCompositeOperation = "source-over";
    c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = .6; c.drawImage(gl, x * p, y * p); c.restore();
  };
  const itemAt = (c, s, n, x, y, p, now) => {
    c.imageSmoothingEnabled = false;
    iconAt(c, s.m, x, y, p);
    if (s.g) { glintAt(c, s.m, x, y, p, now); glinting = true; }
    if (s.md) {   // n is how damaged it is: the durability bar, as the game draws it
      if (n > 0) {
        const left = Math.max(0, s.md - n), w = Math.round(13 * left / s.md);
        c.fillStyle = "#000"; c.fillRect((x + 2) * p, (y + 13) * p, 13 * p, 2 * p);
        c.fillStyle = `hsl(${Math.max(0, left / s.md) * 120},100%,50%)`; c.fillRect((x + 2) * p, (y + 13) * p, w * p, p);
      }
    } else if (n > 1) { const txt = String(n); font.draw(c, txt, x + 19 - 2 - font.width(txt), y + 6 + 3, "#FFFFFF", p); }
  };

  function draw(now = performance.now()) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(gui, 0, 0, W, H, 0, 0, W * P, H * P);
    // the player, in the black box (their skin from mc-heads.net)
    if (body && body.complete && body.naturalWidth) {
      const bh = 62 * P, bw = body.naturalWidth / body.naturalHeight * bh;
      ctx.save(); ctx.beginPath(); ctx.rect(26 * P, 8 * P, 49 * P, 70 * P); ctx.clip();
      ctx.imageSmoothingEnabled = true; ctx.drawImage(body, 51 * P - bw / 2, 12 * P, bw, bh); ctx.restore();
    }
    glinting = false;
    INV_SLOTS.forEach(([x, y], slot) => {
      const it = items[slot];
      if (!it) { if (INV_EMPTY[slot]) { ctx.imageSmoothingEnabled = false; ctx.drawImage(empty[INV_EMPTY[slot]], 0, 0, 16, 16, x * P, y * P, 16 * P, 16 * P); } return; }
      itemAt(ctx, D.s[it[0]], it[1], x, y, P, now);
    });
    if (hover >= 0) { const [x, y] = INV_SLOTS[hover]; ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(x * P, y * P, 16 * P, 16 * P); }
    drawTip(now);
    if (glinting && !raf && visible) raf = requestAnimationFrame(t => { raf = 0; if (glinting && visible) draw(t); });
  }

  // ---- the tooltip: the game's dark box with a purple edge, in the game's font ----
  let tipAt = [0, 0];
  function drawTip(now) {
    const it = hover >= 0 && items[hover];
    if (!it) { tipCv.style.display = "none"; return; }
    const s = D.s[it[0]], lines = s.n.slice();
    if (s.md) lines.push([(T.invDurability || "Durability: %s / %s").replace("%s", Math.max(0, s.md - it[1])).replace("%s", s.md), "#AAAAAA"]);
    // a shulker box's contents: a 9×3 grid in the box's colour, under the name
    const grid = s.b ? 64 : 0, gridW = s.b ? 176 : 0;
    const textW = Math.max(...lines.map(l => font.width(l[0]) - 1)), w = Math.max(textW, gridW);
    const textH = 8 + (lines.length - 1) * 10 + (lines.length > 1 ? 2 : 0), h = textH + (grid ? grid + 4 : 0);
    tipCv.width = (w + 8) * P; tipCv.height = (h + 8) * P;
    tctx.imageSmoothingEnabled = false;
    const X = 4, Y = 4, R = (x, y, ww, hh, c) => { tctx.fillStyle = c; tctx.fillRect(x * P, y * P, ww * P, hh * P); };
    const bg = "rgba(16,0,16,.94)";
    R(X - 3, Y - 4, w + 6, 1, bg); R(X - 3, Y + h + 3, w + 6, 1, bg); R(X - 3, Y - 3, w + 6, h + 6, bg); R(X - 4, Y - 3, 1, h + 6, bg); R(X + w + 3, Y - 3, 1, h + 6, bg);
    const grad = tctx.createLinearGradient(0, (Y - 3) * P, 0, (Y + h + 3) * P); grad.addColorStop(0, "rgba(80,0,255,.31)"); grad.addColorStop(1, "rgba(40,0,127,.31)");
    R(X - 3, Y - 2, 1, h + 4, grad); R(X + w + 2, Y - 2, 1, h + 4, grad);
    R(X - 3, Y - 3, w + 6, 1, "rgba(80,0,255,.31)"); R(X - 3, Y + h + 2, w + 6, 1, "rgba(40,0,127,.31)");
    let y = Y;
    lines.forEach((l, i) => { font.draw(tctx, l[0], X, y, l[1], P); y += i === 0 ? 12 : 10; });
    if (grid) {
      // the shulker box screen's slots (its top edge, the three rows, its bottom edge), tinted like the box
      const gy = Y + textH + 4, dye = (/^(\w+?)_?shulker_box$/.exec(s.m) || [])[1] || "";
      const piece = () => { const c = document.createElement("canvas"); c.width = 176; c.height = 64; const x = c.getContext("2d");
        x.drawImage(shulker, 0, 0, 176, 4, 0, 0, 176, 4); x.drawImage(shulker, 0, 16, 176, 56, 0, 4, 176, 56); x.drawImage(shulker, 0, 162, 176, 4, 0, 60, 176, 4); return c; };
      const panel = piece(), px = panel.getContext("2d");
      px.globalCompositeOperation = "multiply"; px.fillStyle = INV_DYE[dye] || INV_DYE[""]; px.fillRect(0, 0, 176, 64);
      px.globalCompositeOperation = "destination-in"; px.drawImage(piece(), 0, 0);
      tctx.drawImage(panel, 0, 0, 176, 64, X * P, gy * P, 176 * P, 64 * P);
      for (const [slot, k, n] of s.b) if (slot < 27) itemAt(tctx, D.s[k], n, X + 8 + 18 * (slot % 9), gy + 5 + 18 * Math.floor(slot / 9), P, now);
    }
    // next to the pointer, kept inside the page
    const tw = tipCv.width / P * G, th = tipCv.height / P * G, r = wrap.getBoundingClientRect();
    tipCv.style.width = tw + "px"; tipCv.style.height = th + "px"; tipCv.style.display = "block";
    let left = tipAt[0] + 12, top = tipAt[1] - th - 4;
    if (r.left + left + tw > document.documentElement.clientWidth - 8) left = Math.max(-r.left + 8, tipAt[0] - tw - 12);
    if (r.top + top < 8) top = tipAt[1] + 20;
    tipCv.style.left = left + "px"; tipCv.style.top = top + "px";
  }
  const slotAt = ev => {
    const r = cv.getBoundingClientRect(), gx = (ev.clientX - r.left) / r.width * W, gy = (ev.clientY - r.top) / r.height * H;
    tipAt = [ev.clientX - r.left, ev.clientY - r.top];
    return INV_SLOTS.findIndex(([x, y]) => gx >= x - 1 && gx < x + 17 && gy >= y - 1 && gy < y + 17);
  };
  cv.addEventListener("pointermove", ev => { const s = slotAt(ev); if (s !== hover || s >= 0) { hover = s; draw(); } });
  cv.addEventListener("pointerdown", ev => { hover = slotAt(ev); draw(); });
  cv.addEventListener("pointerleave", ev => { if (ev.pointerType === "mouse") { hover = -1; draw(); } });
  // only animate the glint while it's on screen
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) draw(); }).observe(cv);
  if ("ResizeObserver" in window) new ResizeObserver(() => { const g = G, p = P; sizeUp(); if (g !== G || p !== P) draw(); }).observe(host);
  sizeUp();
  return {set(ms) { items = invAt(D, ms); draw(); }};
}

// ---------- a card of its own (runs without a travel map): the inventory and a slider ----------
const invCardShell = () => `
  <section class="card" id="invCard" style="display:flex;flex-direction:column;gap:14px">
    <h2>${esc(T.invTitle)}</h2>
    <div id="invBody"><p class="muted" style="margin:0">${esc(T.travelLoading)}</p></div>
    <div class="invbar"><input type="range" id="invRange" min="0" max="0" step="1000" value="0" aria-label="${esc(T.invTitle)}"><span class="mono" id="invNow"></span></div>
  </section>`;
async function drawInvCard(run) {
  const body = $("#invBody"), range = $("#invRange"); if (!body) return;
  range.max = run.finalIgt || 0; range.value = run.finalIgt || 0;
  const ctl = await invMount(body, run);
  if (!ctl) { range.parentNode.remove(); return; }
  const go = () => { const v = +range.value; $("#invNow").textContent = fmt(v, 0); ctl.set(v); };
  range.addEventListener("input", go); go();
}

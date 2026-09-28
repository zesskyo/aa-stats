/*
 * inventory.js — the player's inventory through the run, drawn like the game's inventory screen.
 * build.mjs reads it from the log into inv/<N>.json (see inv.mjs) and puts the item icons the site needs in
 * items/ (atlas.png, rendered from the game's models; items.json says where each icon is).
 * With a travel map it's under the map and follows its timeline; otherwise it has a card and a slider of its own.
 * Hovering (or tapping) an item shows its tooltip, as in the game.
 */
const INV_S = 2;   // the game's GUI scale
// where each slot is on the inventory screen (0–8 hotbar, 9–35 inventory, 36–39 boots→helmet, 40 off hand)
const INV_SLOTS = (() => {
  const s = [];
  for (let i = 0; i < 9; i++) s[i] = [8 + 18 * i, 142];
  for (let i = 9; i < 36; i++) s[i] = [8 + 18 * ((i - 9) % 9), 84 + 18 * Math.floor((i - 9) / 9)];
  s[39] = [8, 8]; s[38] = [8, 26]; s[37] = [8, 44]; s[36] = [8, 62]; s[40] = [77, 62];
  return s;
})();
const INV_EMPTY = {39: "empty_helmet", 38: "empty_chestplate", 37: "empty_leggings", 36: "empty_boots", 40: "empty_shield"};

let invAssetsP = null;
const invData = {};
function invAssets() {
  if (invAssetsP) return invAssetsP;
  const img = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  invAssetsP = Promise.all([
    fetch("items/items.json").then(r => { if (!r.ok) throw 0; return r.json(); }),
    img("items/atlas.png"), img("items/inventory.png"), img("items/ascii.png"), img("items/glint.png"),
    ...Object.values(INV_EMPTY).map(k => img(`items/${k}.png`)),
  ]).then(([db, atlas, gui, font, glint, ...empties]) => {
    const empty = {}; Object.values(INV_EMPTY).forEach((k, i) => { empty[k] = empties[i]; });
    return {db, atlas, gui, glint, empty, font: invFont(font)};
  });
  invAssetsP.catch(() => { invAssetsP = null; });
  return invAssetsP;
}

// ---------- the game's font (textures/font/ascii.png: 16×16 characters of 8×8) ----------
function invFont(img) {
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height).data, g = img.width / 16, widths = [];
  for (let ch = 0; ch < 256; ch++) {
    const cx = (ch % 16) * g, cy = Math.floor(ch / 16) * g;
    let w = 0;
    for (let col = g - 1; col >= 0 && !w; col--) for (let row = 0; row < g; row++) if (px[((cy + row) * c.width + cx + col) * 4 + 3] > 0) { w = col + 1; break; }
    widths[ch] = ch === 32 ? 3 : w;
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
    width: s => [...s].reduce((a, ch) => a + widths[code(ch)] + 1, 0) - (s ? 1 : 0),
    // text at (x, y) in GUI pixels, with the game's shadow (the colour at a quarter brightness, one pixel down-right)
    draw(ctx, s, x, y, color) {
      const shadow = "#" + [1, 3, 5].map(i => Math.floor(parseInt(color.slice(i, i + 2), 16) / 4).toString(16).padStart(2, "0")).join("");
      for (const [col, dx] of [[shadow, 1], [color, 0]]) {
        let cx = x;
        for (const ch of s) {
          const n = code(ch);
          ctx.drawImage(tinted(col), (n % 16) * g, Math.floor(n / 16) * g, g, g, (cx + dx) * INV_S, (y + dx) * INV_S, g * INV_S, g * INV_S);
          cx += widths[n] + 1;
        }
      }
    },
  };
}

// ---------- the inventory at a time ----------
function invPrep(raw) {
  const n = raw.e.length / 4, t = new Float64Array(n), slot = new Uint8Array(n), stack = new Int32Array(n), count = new Uint8Array(n);
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
  host.innerHTML = `<div class="invwrap"><canvas class="invcanvas" width="${W * INV_S}" height="${H * INV_S}" aria-label="${esc(T.invTitle)}"></canvas><canvas class="invtip" aria-hidden="true"></canvas></div>`;
  const cv = host.querySelector(".invcanvas"), ctx = cv.getContext("2d"), tipCv = host.querySelector(".invtip"), tctx = tipCv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const {db, atlas, gui, glint, empty, font} = A;
  let body = null;
  if (run.uuid || run.player) { body = new Image(); body.onload = () => draw(); body.src = `https://mc-heads.net/body/${encodeURIComponent((run.uuid || run.player).replace(/-/g, ""))}/120`; }
  let ms = 0, items = [], hover = -1, glinting = false, raf = 0;
  const icon = (key, x, y) => {
    const k = db.index[key]; if (k == null) return false;
    ctx.drawImage(atlas, (k % db.cols) * db.size, Math.floor(k / db.cols) * db.size, db.size, db.size, x * INV_S, y * INV_S, 16 * INV_S, 16 * INV_S);
    return true;
  };
  // the enchantment glint: the game's glint texture sliding over the item, added on top
  const gl = document.createElement("canvas"); gl.width = gl.height = 16 * INV_S;
  const glx = gl.getContext("2d"); glx.imageSmoothingEnabled = false;
  const drawGlint = (key, x, y, now) => {
    const k = db.index[key]; if (k == null) return;
    glx.globalCompositeOperation = "source-over"; glx.clearRect(0, 0, gl.width, gl.height);
    const size = 128, off = (now / 40) % size;
    glx.save(); glx.rotate(-Math.PI / 18);
    for (const dx of [-size, 0]) glx.drawImage(glint, off + dx - 16, -24, size, size);
    glx.restore();
    glx.globalCompositeOperation = "destination-in";
    glx.drawImage(atlas, (k % db.cols) * db.size, Math.floor(k / db.cols) * db.size, db.size, db.size, 0, 0, gl.width, gl.height);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = .65; ctx.drawImage(gl, x * INV_S, y * INV_S); ctx.restore();
  };
  function draw(now = performance.now()) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(gui, 0, 0, W, H, 0, 0, W * INV_S, H * INV_S);
    // the player, in the black box (their skin from mc-heads.net)
    if (body && body.complete && body.naturalWidth) {
      const bh = 62 * INV_S, bw = body.naturalWidth / body.naturalHeight * bh;
      ctx.save(); ctx.beginPath(); ctx.rect(26 * INV_S, 8 * INV_S, 49 * INV_S, 70 * INV_S); ctx.clip();
      ctx.imageSmoothingEnabled = true; ctx.drawImage(body, 51 * INV_S - bw / 2, 12 * INV_S, bw, bh); ctx.imageSmoothingEnabled = false; ctx.restore();
    }
    glinting = false;
    INV_SLOTS.forEach(([x, y], slot) => {
      const it = items[slot];
      if (!it) { if (INV_EMPTY[slot]) ctx.drawImage(empty[INV_EMPTY[slot]], 0, 0, 16, 16, x * INV_S, y * INV_S, 16 * INV_S, 16 * INV_S); return; }
      const s = D.s[it[0]];
      if (!icon(s.m, x, y)) icon("barrier", x, y);
      if (s.g) { drawGlint(s.m, x, y, now); glinting = true; }
      if (s.d != null) {   // the durability bar
        ctx.fillStyle = "#000"; ctx.fillRect((x + 2) * INV_S, (y + 13) * INV_S, 13 * INV_S, 2 * INV_S);
        ctx.fillStyle = `hsl(${s.d / 13 * 120},100%,50%)`; ctx.fillRect((x + 2) * INV_S, (y + 13) * INV_S, s.d * INV_S, 1 * INV_S);
      }
      if (it[1] > 1) { const txt = String(it[1]); font.draw(ctx, txt, x + 19 - 2 - font.width(txt), y + 6 + 3, "#FFFFFF"); }
    });
    if (hover >= 0) { const [x, y] = INV_SLOTS[hover]; ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(x * INV_S, y * INV_S, 16 * INV_S, 16 * INV_S); }
    drawTip();
    if (glinting && !raf && visible) raf = requestAnimationFrame(t => { raf = 0; if (glinting && visible) draw(t); });
  }
  // the tooltip: the game's dark box with a purple edge, in the game's font
  let tipAt = [0, 0];
  function drawTip() {
    const it = hover >= 0 && items[hover];
    if (!it) { tipCv.style.display = "none"; return; }
    const lines = D.s[it[0]].n, w = Math.max(...lines.map(l => font.width(l[0]))), h = 8 + (lines.length - 1) * 10 + (lines.length > 1 ? 2 : 0);
    tipCv.width = (w + 8) * INV_S; tipCv.height = (h + 8) * INV_S;
    const X = 4, Y = 4, R = (x, y, ww, hh, c) => { tctx.fillStyle = c; tctx.fillRect(x * INV_S, y * INV_S, ww * INV_S, hh * INV_S); };
    const bg = "rgba(16,0,16,.94)";
    R(X - 3, Y - 4, w + 6, 1, bg); R(X - 3, Y + h + 3, w + 6, 1, bg); R(X - 3, Y - 3, w + 6, h + 6, bg); R(X - 4, Y - 3, 1, h + 6, bg); R(X + w + 3, Y - 3, 1, h + 6, bg);
    const grad = tctx.createLinearGradient(0, (Y - 3) * INV_S, 0, (Y + h + 3) * INV_S); grad.addColorStop(0, "rgba(80,0,255,.31)"); grad.addColorStop(1, "rgba(40,0,127,.31)");
    R(X - 3, Y - 2, 1, h + 4, grad); R(X + w + 2, Y - 2, 1, h + 4, grad);
    R(X - 3, Y - 3, w + 6, 1, "rgba(80,0,255,.31)"); R(X - 3, Y + h + 2, w + 6, 1, "rgba(40,0,127,.31)");
    let y = Y;
    lines.forEach((l, i) => { font.draw(tctx, l[0], X, y, l[1]); y += i === 0 ? 12 : 10; });
    // next to the pointer, kept inside the card
    const wrap = host.querySelector(".invwrap").getBoundingClientRect(), k = cv.getBoundingClientRect().width / cv.width;
    const tw = tipCv.width * k, th = tipCv.height * k;
    tipCv.style.width = tw + "px"; tipCv.style.height = th + "px"; tipCv.style.display = "block";
    let left = tipAt[0] + 12, top = tipAt[1] - th - 4;
    if (left + tw > wrap.width) left = Math.max(0, tipAt[0] - tw - 12);
    if (top < -wrap.top + 8) top = tipAt[1] + 16;
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
  let visible = true;
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) draw(); }).observe(cv);
  const ctl = {set(v) { ms = v; items = invAt(D, ms); draw(); }};
  return ctl;
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

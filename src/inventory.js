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
    img("items/atlas.png"), img("items/inventory.png"), img("items/ascii.png"), img("items/glint.png"), img("items/shulker_box.png"), img("items/steve.png"), img("items/elytra.png"), img("items/toasts.png"),
    ...Object.values(INV_EMPTY).map(k => img(`items/${k}.png`)),
  ]).then(([db, atlas, gui, font, glint, shulker, steve, elytra, toasts, ...empties]) => {
    const empty = {}; Object.values(INV_EMPTY).forEach((k, i) => { empty[k] = empties[i]; });
    return {db, atlas, gui, glint, shulker, steve, elytra, toasts, empty, font: invFont(font)};
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

// ---------- the player in the black box: the game's player model with their skin and the armour they wear ----------
// Boxes are made as the game's ModelRenderer makes them (texture layout, rotation points), drawn with WebGL.
const INV_M = {
  mul(a, b) { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c]; return o; },
  t: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1],
  s: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  rx: a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; },
  ry: a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; },
  rz: a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  chain: (...ms) => ms.reduce((a, b) => INV_M.mul(a, b)),
  ap: (m, p) => [0, 1, 2].map(r => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3]),
  dir: (m, v) => [0, 1, 2].map(r => m[r * 4] * v[0] + m[r * 4 + 1] * v[1] + m[r * 4 + 2] * v[2]),
};
// part: {tex: [u, v], box: [x, y, z, dx, dy, dz], grow, mirror, rp, rot: [x, y, z] radians}; w, h: the texture's size
function invBox(img, w, h, m, part, tint) {
  const [u, v] = part.tex, [bx, by, bz, dx, dy, dz] = part.box, g = part.grow || 0;
  let x = (bx - g) / 16, x1 = (bx + dx + g) / 16;
  const y = (by - g) / 16, z = (bz - g) / 16, y1 = (by + dy + g) / 16, z1 = (bz + dz + g) / 16;
  if (part.mirror) [x, x1] = [x1, x];
  const V = [[x1, y, z], [x1, y1, z], [x, y1, z], [x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1], [x, y, z]];
  const f4 = u, f5 = u + dz, f6 = f5 + dx, f7 = f6 + dx, f8 = f6 + dz, f9 = f8 + dx, f10 = v, f11 = v + dz, f12 = f11 + dy, mx = part.mirror ? -1 : 1;
  const faces = [[[4, 3, 7, 0], f5, f10, f6, f11, [0, -1, 0]], [[1, 2, 6, 5], f6, f11, f7, f10, [0, 1, 0]], [[7, 3, 6, 2], f4, f11, f5, f12, [-mx, 0, 0]],
    [[0, 7, 2, 1], f5, f11, f6, f12, [0, 0, -1]], [[4, 0, 1, 5], f6, f11, f8, f12, [mx, 0, 0]], [[3, 4, 5, 6], f8, f11, f9, f12, [0, 0, 1]]];
  const rp = (part.rp || [0, 0, 0]).map(q => q / 16), r = part.rot || [0, 0, 0];
  const pm = INV_M.chain(m, INV_M.t(rp[0], rp[1], rp[2]), INV_M.rz(r[2]), INV_M.ry(r[1]), INV_M.rx(r[0]));
  return faces.map(([vi, u1, v1, u2, v2, n]) => ({p: vi.map(i => INV_M.ap(pm, V[i])), uv: [[u2, v1], [u1, v1], [u1, v2], [u2, v2]].map(([a, b]) => [a / w, b / h]), img, n: INV_M.dir(pm, n), tint}));
}
const INV_BODY = (g, skin) => ({
  head: {tex: [0, 0], box: [-4, -8, -4, 8, 8, 8], grow: g}, hat: {tex: [32, 0], box: [-4, -8, -4, 8, 8, 8], grow: g + .5},
  body: {tex: [16, 16], box: [-4, 0, -2, 8, 12, 4], grow: g},
  rightArm: {tex: [40, 16], box: [-3, -2, -2, 4, 12, 4], grow: g, rp: [-5, 2, 0], rot: [0, 0, .05]},
  leftArm: skin ? {tex: [32, 48], box: [-1, -2, -2, 4, 12, 4], grow: g, rp: [5, 2, 0], rot: [0, 0, -.05]} : {tex: [40, 16], box: [-1, -2, -2, 4, 12, 4], grow: g, mirror: true, rp: [5, 2, 0], rot: [0, 0, -.05]},
  rightLeg: {tex: [0, 16], box: [-2, 0, -2, 4, 12, 4], grow: g, rp: [-1.9, 12, 0]},
  leftLeg: skin ? {tex: [16, 48], box: [-2, 0, -2, 4, 12, 4], grow: g, rp: [1.9, 12, 0]} : {tex: [0, 16], box: [-2, 0, -2, 4, 12, 4], grow: g, mirror: true, rp: [1.9, 12, 0]},
});
const INV_LAYERS = {jacket: [16, 32, "body"], rightSleeve: [40, 32, "rightArm"], leftSleeve: [48, 48, "leftArm"], rightPants: [0, 32, "rightLeg"], leftPants: [0, 48, "leftLeg"]};
const INV_MATERIAL = {leather: "leather", chainmail: "chainmail", iron: "iron", golden: "gold", diamond: "diamond", netherite: "netherite"};

function invPlayerRenderer(A, skinUrl) {
  const c = document.createElement("canvas"), gl = c.getContext("webgl", {antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true});
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec3 pos; attribute vec2 uv; varying vec2 vuv; void main() { vuv = uv; gl_Position = vec4(pos.x, pos.y, -pos.z * 0.1, 1.0); }"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, "precision mediump float; varying vec2 vuv; uniform sampler2D tex; uniform vec3 col; void main() { vec4 c = texture2D(tex, vuv); if (c.a < 0.1) discard; gl_FragColor = vec4(c.rgb * col, c.a); }"));
  gl.linkProgram(prog); gl.useProgram(prog);
  const aPos = gl.getAttribLocation(prog, "pos"), aUv = gl.getAttribLocation(prog, "uv"), uCol = gl.getUniformLocation(prog, "col"), buf = gl.createBuffer(), texs = new Map();
  const texFor = img => {
    if (texs.has(img)) return texs.get(img);
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); } catch { return null; }
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    texs.set(img, t); return t;
  };
  // the skin: from the player's account if it can be loaded, otherwise Steve's
  let skin = A.steve, onChange = null;
  if (skinUrl) { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => { skin = im; if (onChange) onChange(); }; im.src = skinUrl; }
  const armorImg = {}, loadArmor = name => {
    if (!(name in armorImg)) { armorImg[name] = null; const im = new Image(); im.onload = () => { armorImg[name] = im; if (onChange) onChange(); }; im.src = `items/armor/${name}.png`; }
    return armorImg[name];
  };
  const L = [[-.2225, .1715, .9598], [-.2150, .9719, .0966]];
  return {
    set onChange(f) { onChange = f; },
    // armour: {head, chest, legs, feet} item names (or null); w, h: pixels; k: pixels per block
    render(armor, w, h, k) {
      c.width = w; c.height = h;
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      // facing you, turned a little, at eye level (LivingRenderer: turn, flip, player scale, lift by 1.501)
      const ent = INV_M.chain(INV_M.ry(Math.PI + .35), INV_M.s(-1, -1, 1), INV_M.s(.9375, .9375, .9375), INV_M.t(0, -1.501, 0));
      if (!texFor(skin)) skin = A.steve;   // (a skin the browser won't let us use)
      const quads = [], legacy = skin.height === 32, parts = INV_BODY(0, !legacy);
      for (const p of Object.values(parts)) quads.push(...invBox(skin, 64, skin.height, ent, p));
      if (!legacy) {
        quads.push(...invBox(skin, 64, 64, ent, parts.hat));
        for (const [u, v, of] of Object.values(INV_LAYERS)) quads.push(...invBox(skin, 64, 64, ent, {...parts[of], tex: [u, v], grow: .25}));
      }
      // armour (the game's armour layer: layer 1 grown by 1, leggings on layer 2 grown by 0.5)
      const piece = (id, slot) => {
        if (!id) return;
        if (slot === "chest" && id === "elytra") {   // wings on the back
          const img = A.elytra, m = INV_M.chain(ent, INV_M.t(0, 0, .125)), rot = [.2617994, 0, -.2617994];
          quads.push(...invBox(img, 64, 32, m, {tex: [22, 0], box: [-10, 0, 0, 10, 20, 2], grow: 1, rp: [5, 0, 0], rot}), ...invBox(img, 64, 32, m, {tex: [22, 0], box: [0, 0, 0, 10, 20, 2], grow: 1, mirror: true, rp: [-5, 0, 0], rot: [rot[0], 0, -rot[2]]}));
          return;
        }
        const mt = /^(\w+?)_(helmet|chestplate|leggings|boots)$/.exec(id), mat = id === "turtle_helmet" ? "turtle" : mt && INV_MATERIAL[mt[1]];
        if (!mat) return;
        const layer = slot === "legs" ? 2 : 1, img = loadArmor(`${mat}_layer_${layer}`); if (!img) return;
        const ap = INV_BODY(slot === "legs" ? .5 : 1, false), use = {head: ["head", "hat"], chest: ["body", "rightArm", "leftArm"], legs: ["body", "rightLeg", "leftLeg"], feet: ["rightLeg", "leftLeg"]}[slot];
        const tint = mat === "leather" ? [160 / 255, 101 / 255, 64 / 255] : null;
        for (const k of use) quads.push(...invBox(img, 64, 32, ent, ap[k], tint));
        if (mat === "leather") { const ov = loadArmor(`leather_layer_${layer}_overlay`); if (ov) for (const k of use) quads.push(...invBox(ov, 64, 32, ent, ap[k])); }
      };
      piece(armor.head, "head"); piece(armor.chest, "chest"); piece(armor.legs, "legs"); piece(armor.feet, "feet");
      // to the canvas: k pixels per block, feet 3 GUI pixels above the bottom (a tenth of a block)
      const sx = 2 * k / w, sy = 2 * k / h, lift = 2 * (k / 10) / h;
      const qs = quads.map(q => ({...q, p: q.p.map(p => [p[0] * sx, p[1] * sy - 1 + lift, p[2]]), z: q.p.reduce((a, p) => a + p[2], 0) / 4}))
        .filter(q => q.n[2] > -1e-4).sort((a, b) => a.z - b.z);
      for (const q of qs) {
        const t = texFor(q.img); if (!t) continue;
        const d = []; for (const i of [0, 1, 2, 0, 2, 3]) d.push(...q.p[i], ...q.uv[i]);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STREAM_DRAW);
        gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 12);
        gl.bindTexture(gl.TEXTURE_2D, t);
        const n = q.n, l = Math.hypot(...n) || 1, s = Math.min(1, .4 + .6 * L.reduce((a, v) => a + Math.max(0, (n[0] * v[0] + n[1] * v[1] + n[2] * v[2]) / l), 0)), tc = q.tint || [1, 1, 1];
        gl.uniform3f(uCol, tc[0] * s, tc[1] * s, tc[2] * s);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      return c;
    },
  };
}

// Draws the inventory into `host` for run; returns {set(ms)} (null if there's nothing to show)
async function invMount(host, run, opts = {}) {
  let A, D = invData[run.id];
  try {
    A = await invAssets();
    if (!D) { const r = await fetch(run.meta.inv); if (!r.ok) throw 0; D = invData[run.id] = invPrep(await r.json()); }
  } catch { host.innerHTML = `<p class="muted" style="margin:0">${esc(T.invFailed)}</p>`; return null; }
  if (!host.isConnected) return null;
  const W = 176, H = 166;
  host.innerHTML = `<div class="invwrap"><canvas class="invcanvas" aria-label="${esc(T.invTitle)}"></canvas></div>`;
  let tipCv = document.querySelector(".invtip");   // the tooltip floats over the page, so nothing clips it
  if (!tipCv) { tipCv = document.createElement("canvas"); tipCv.className = "invtip"; tipCv.setAttribute("aria-hidden", "true"); document.body.appendChild(tipCv); }
  const wrap = host.querySelector(".invwrap"), cv = host.querySelector(".invcanvas"), ctx = cv.getContext("2d"), tctx = tipCv.getContext("2d");
  const {db, atlas, gui, glint, shulker, empty, font} = A;
  // the scale: the game's GUI scale (3 when there's room, else 2, shrunk to fit a phone) × pixel density
  let G = 2, P = 2;
  const sizeUp = () => {
    const room = host.clientWidth || W * 2;
    G = opts.scale || (room >= W * 3 + 40 ? 3 : 2);
    P = Math.max(1, Math.round(G * (devicePixelRatio || 1)));
    cv.width = W * P; cv.height = H * P;
    let w = W * G;
    if (opts.fit) { const r = opts.fit.getBoundingClientRect(); w = Math.max(W, Math.min(w, r.width - 16, (r.height - 60) * W / H)); }   // shrunk to fit over the map
    wrap.style.width = w + "px";
  };
  const who = (run.uuid || run.player || "").replace(/-/g, "");
  const player = invPlayerRenderer(A, who ? `https://mc-heads.net/skin/${encodeURIComponent(who)}` : null);
  if (player) player.onChange = () => draw();
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
    if (player) {   // the player, 30 GUI pixels to a block as in the game, wearing their armour
      const worn = n => items[n] ? D.s[items[n][0]].m : null;
      const pc = player.render({head: worn(39), chest: worn(38), legs: worn(37), feet: worn(36)}, 49 * P, 70 * P, 30 * P);
      ctx.drawImage(pc, 26 * P, 8 * P);
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
    const tw = tipCv.width / P * G, th = tipCv.height / P * G, vw = document.documentElement.clientWidth;
    const root = document.fullscreenElement || document.body; if (tipCv.parentNode !== root) root.appendChild(tipCv);   // (full screen shows only what's inside)
    tipCv.style.width = tw + "px"; tipCv.style.height = th + "px"; tipCv.style.display = "block";
    let left = tipAt[0] + 12, top = tipAt[1] - th - 4;
    if (left + tw > vw - 8) left = Math.max(8, tipAt[0] - tw - 12);
    if (top < 8) top = tipAt[1] + 20;
    tipCv.style.left = left + "px"; tipCv.style.top = top + "px";
  }
  const slotAt = ev => {
    const r = cv.getBoundingClientRect(), gx = (ev.clientX - r.left) / r.width * W, gy = (ev.clientY - r.top) / r.height * H;
    tipAt = [ev.clientX, ev.clientY];
    return INV_SLOTS.findIndex(([x, y]) => gx >= x - 1 && gx < x + 17 && gy >= y - 1 && gy < y + 17);
  };
  cv.addEventListener("pointermove", ev => { const s = slotAt(ev); if (s !== hover || s >= 0) { hover = s; draw(); } });
  cv.addEventListener("pointerdown", ev => { hover = slotAt(ev); draw(); });
  cv.addEventListener("pointerleave", ev => { if (ev.pointerType === "mouse") { hover = -1; draw(); } });
  window.addEventListener("scroll", () => { if (hover >= 0) { hover = -1; draw(); } }, {passive: true});
  // only animate the glint while it's on screen
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) draw(); }).observe(cv);
  if ("ResizeObserver" in window) new ResizeObserver(() => { const g = G, p = P; sizeUp(); if (g !== G || p !== P) draw(); }).observe(opts.fit || host);
  sizeUp();
  return {set(ms) { items = invAt(D, ms); draw(); }};
}

// ---------- no travel map: a button on the progress graph opens the inventory over it, with a slider ----------
function invOnGraph(run) {
  const card = $("#progressCard"), fs = $("#fsBtn"); if (!card || !fs) return;
  fs.insertAdjacentHTML("beforebegin", `<button type="button" class="btn icon" id="pgInvBtn" aria-pressed="false" aria-controls="pgInv" aria-label="${esc(T.invTitle)}" title="${esc(T.invTitle)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12h18M11 12v2h2v-2"/></svg></button>`);
  card.insertAdjacentHTML("beforeend", `<div class="pginvpop" id="pgInv" hidden><div id="pgInvBody"></div>
    <div class="invbar"><input type="range" id="invRange" min="0" max="${run.finalIgt || 0}" step="1000" value="${run.finalIgt || 0}" aria-label="${esc(T.invTitle)}"><span class="mono" id="invNow"></span></div></div>`);
  let ctl = null;
  $("#pgInvBtn").addEventListener("click", async () => {
    const pop = $("#pgInv"), open = pop.hidden;
    pop.hidden = !open; $("#pgInvBtn").setAttribute("aria-pressed", String(open));
    if (!open) { const tip = document.querySelector(".invtip"); if (tip) tip.style.display = "none"; return; }
    if (ctl || pop.dataset.loading) return;
    pop.dataset.loading = "1";
    ctl = await invMount($("#pgInvBody"), run, {scale: 2, fit: card});
    const range = $("#invRange");
    if (!ctl) { range.parentNode.remove(); return; }
    const go = () => { const v = +range.value; $("#invNow").textContent = fmt(v, 0); ctl.set(v); };
    range.addEventListener("input", go); go();
  });
}

// ---------- advancement pop-ups over the travel map, like the game's toasts ----------
// As the timeline moves forward through an advancement, its toast slides in at the top right for 5 seconds; they stack
// downwards as far as the map goes (the oldest go first). Jumping around the timeline doesn't show any.
// The criteria of the advancements that need many (biomes, foods, mobs, animals, cats) get smaller toasts of their own,
// with the icons in icons/<folder>/ (foods use the item's icon); the last one shows too, then the advancement's toast.
const CRIT_DIR = {"adventure/adventuring_time": "adventuring time", "nether/explore_nether": "hot tourist destinations", "husbandry/complete_catalogue": "acc",
  "adventure/kill_all_mobs": "monsters hunted", "husbandry/bred_all_animals": "two by two"};
const CRIT_FILE = {acc: {black: "tuxedo", all_black: "black", british_shorthair: "british"}, "monsters hunted": {vex: "vex_old"}, "adventuring time": {snowy_tundra: "snowy_plains"}};
const CRIT_NAME = {"husbandry/complete_catalogue": {black: "Tuxedo", all_black: "Black", british_shorthair: "British"}};
async function invToasts(host, run) {
  let A; try { A = await invAssets(); } catch { return null; }
  const {db, atlas, toasts, font} = A;
  const adv = [], seen = {}, total = id => REQ[id] || run.events.filter(e => e[2] === id).length;
  for (const e of run.events) {
    if (!db.adv || !db.adv[e[2]]) continue;
    const tot = total(e[2]);
    // every criterion gets a small toast (the last one too, e.g. "42/42"), and finishing gets the advancement's
    if (tot > 1 && (!e[4] || seen[e[2]])) { const n = seen[e[2]] = (seen[e[2]] || 0) + 1; adv.push({t: e[0], id: e[2], crit: e[3], n: e[4] ? tot : n, tot}); }
    if (e[4]) adv.push({t: e[0], id: e[2]});
  }
  const TOAST_COLOR = {task: "#FFFF00", goal: "#FFFF00", challenge: "#FF88FF"};
  const critImg = {};
  const critIcon = (id, crit) => {   // the uploaded icon for a criterion, if there is one
    const dir = CRIT_DIR[id], file = dir && ((CRIT_FILE[dir] || {})[crit] || crit);
    if (!dir || !(db.crit && (db.crit[dir] || []).includes(file))) return null;
    const url = `icons/${encodeURIComponent(dir)}/${encodeURIComponent(file)}.png`;
    if (!critImg[url]) { critImg[url] = new Image(); critImg[url].src = url; }
    return critImg[url];
  };
  let last = null;
  // text that fits in maxW GUI pixels: made smaller (and kept centred on its line) when it's too long
  const fit = (x, s, x0, y, maxW, color, P) => {
    const w = font.width(s) - 1;
    if (w <= maxW) return font.draw(x, s, x0, y, color, P);
    const f = maxW / w;
    font.draw(x, s, x0 / f, (y + 4 - 4 * f) / f, color, P * f);
  };
  const short = id => MULTI[id] || advName(id).split(/\s+/).map(w => w[0]).join("").toUpperCase();   // "AT", "HTD"…
  const make = a => {
    const [advIcon, frame] = db.adv[a.id], crit = a.crit && a.crit.replace(/^.*\//, "").replace(/\.png$/, "");
    // the game's toast at GUI scale 2 (1 on a small map); a criterion's is as wide but half as tall
    const G = host.parentElement.clientWidth < 560 ? 1 : 2, P = Math.max(1, Math.ceil(G * (devicePixelRatio || 1))), H = crit ? 16 : 32;
    const c = document.createElement("canvas"); c.width = 160 * P; c.height = H * P; c.className = "advtoast";
    c.style.width = 160 * G + "px"; c.style.height = H * G + "px";
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    if (crit) { x.drawImage(toasts, 0, 0, 160, 8, 0, 0, 160 * P, 8 * P); x.drawImage(toasts, 0, 24, 160, 8, 0, 8 * P, 160 * P, 8 * P); }   // (its top and bottom edges)
    else x.drawImage(toasts, 0, 0, 160, 32, 0, 0, 160 * P, 32 * P);
    const img = crit && critIcon(a.id, crit), key = crit && db.index[crit] != null ? crit : advIcon;
    const [ix, iy, is] = crit ? [3, 2, 12] : [8, 8, 16];
    const drawIcon = () => {
      if (img && img.naturalWidth) { x.imageSmoothingEnabled = img.naturalWidth > 32; x.drawImage(img, ix * P, iy * P, is * P, is * P); x.imageSmoothingEnabled = false; return; }
      const k = db.index[key]; if (k != null) { x.imageSmoothingEnabled = true; x.drawImage(atlas, (k % db.cols) * db.size, Math.floor(k / db.cols) * db.size, db.size, db.size, ix * P, iy * P, is * P, is * P); x.imageSmoothingEnabled = false; }
    };
    if (img && !img.complete) img.addEventListener("load", drawIcon, {once: true}); else drawIcon();
    if (crit) {   // a criterion, on one line: its name, and the advancement's progress on the right ("AT 12/42")
      const prog = `${short(a.id)} ${a.n}/${a.tot}`, pw = font.width(prog) - 1;
      font.draw(x, prog, 160 - 5 - pw, 4, "#AAAAAA", P);
      fit(x, (CRIT_NAME[a.id] || {})[crit] || titleCase(crit.replace(/_/g, " ")), 18, 4, 160 - 5 - pw - 6 - 18, "#FFFFFF", P);
    } else {
      fit(x, db.toast[frame] || db.toast.task, 30, 7, 124, TOAST_COLOR[frame] || TOAST_COLOR.task, P);
      fit(x, advName(a.id), 30, 18, 124, "#FFFFFF", P);
    }
    return c;
  };
  const show = a => {
    const el = make(a); host.appendChild(el);
    const room = host.parentElement.clientHeight - 16;   // stacked down as far as the map goes
    while (host.children.length > 1 && host.scrollHeight > room) host.firstChild.remove();
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 600); }, 5000);
  };
  return {
    // t: where the timeline is now; toasts only for moving forward a little (playing, or a short step)
    set(t) {
      if (last != null && t > last && t - last <= 180000) { for (const a of adv) if (a.t > last && a.t <= t) show(a); }
      else if (last != null && t !== last) host.replaceChildren();
      last = t;
    },
  };
}

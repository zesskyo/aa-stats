// The item renderer used by make.mjs
// Renders every item model of the resource pack to a 32×32 icon, like the game's inventory does.
// Loaded in a browser page served from the resource pack's assets/minecraft folder.
const SIZE = 32;
const texCache = {}, modelCache = {};
const loadImg = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
async function tex(path) {
  path = path.replace(/^minecraft:/, "");
  if (!(path in texCache)) texCache[path] = await loadImg("textures/" + path + ".png");
  return texCache[path];
}
async function model(name) {
  name = name.replace(/^minecraft:/, "");
  if (!(name in modelCache)) { const r = await fetch("models/" + name + ".json"); modelCache[name] = r.ok ? await r.json() : null; }
  return modelCache[name];
}
// the model with its parents merged: textures, elements, gui display, and whether it's a flat item
async function resolve(name) {
  let m = await model(name), textures = {}, elements = null, gui = null, generated = false, entity = false, light = null, chain = [];
  while (m) {
    chain.push(m);
    textures = {...(m.textures || {}), ...textures};
    if (!elements && m.elements) elements = m.elements;
    if (!gui && m.display && m.display.gui) gui = m.display.gui;
    if (!light && m.gui_light) light = m.gui_light;
    if (!m.parent) break;
    const p = m.parent.replace(/^minecraft:/, "");
    if (p === "builtin/generated") { generated = true; break; }
    if (p === "builtin/entity") { entity = true; break; }
    m = await model(p);
  }
  const ref = v => { let k = 0; while (v && v.startsWith("#") && k++ < 10) v = textures[v.slice(1)]; return v; };
  return {textures, ref, elements, gui, generated, entity, light: light || "side"};
}

// ---------- tints (the game's default colours in the inventory) ----------
const GRASS = "#91BD59", FOLIAGE = "#48B518";
const BLOCK_TINT = {grass_block: GRASS, grass: GRASS, tall_grass: GRASS, fern: GRASS, large_fern: GRASS, vine: FOLIAGE, lily_pad: "#208030",
  oak_leaves: FOLIAGE, jungle_leaves: FOLIAGE, acacia_leaves: FOLIAGE, dark_oak_leaves: FOLIAGE, spruce_leaves: "#619961", birch_leaves: "#80A755"};
const ITEM_TINT = {leather_helmet: ["#A06540"], leather_chestplate: ["#A06540"], leather_leggings: ["#A06540"], leather_boots: ["#A06540"], leather_horse_armor: ["#A06540"],
  potion: ["#385DC6"], splash_potion: ["#385DC6"], lingering_potion: ["#385DC6"], tipped_arrow: [null, "#385DC6"], firework_star: [null, "#8A8A8A"], filled_map: [null, "#46402E"]};

// ---------- drawing ----------
function shadeFill(c, color, alpha) {   // multiply the canvas' pixels by a colour, keeping transparency
  const x = c.getContext("2d");
  x.save(); x.globalCompositeOperation = "source-atop"; x.globalAlpha = alpha == null ? 1 : alpha; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); x.restore();
}
function tinted(img, sx, sy, sw, sh, tint) {
  const c = document.createElement("canvas"); c.width = sw; c.height = sh;
  const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  if (tint) { x.globalCompositeOperation = "multiply"; x.fillStyle = tint; x.fillRect(0, 0, sw, sh); x.globalCompositeOperation = "destination-in"; x.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh); }
  return c;
}
function frame(img) { return {w: img.width, h: Math.min(img.height, img.width)}; }   // animated textures: the first frame

async function drawGenerated(ctx, r, id, tints) {
  for (let i = 0; i < 5; i++) {
    const t = r.textures["layer" + i]; if (!t) continue;
    const img = await tex(t); if (!img) continue;
    const f = frame(img), c = tinted(img, 0, 0, f.w, f.h, tints && tints[i]);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 0, 0, SIZE, SIZE);
  }
}

// 3D: elements are boxes in 0..16 model space; faces {dir: {img, uv: [u1,v1,u2,v2] in texture pixels, rot, tint, shade}}
const rad = d => d * Math.PI / 180;
function rotX(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
function rotY(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c]; }
function rotZ(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }
function corners(from, to, dir) {
  const [x1, y1, z1] = from, [x2, y2, z2] = to;
  return {   // top-left, top-right, bottom-left of the texture as seen from outside
    north: [[x2, y2, z1], [x1, y2, z1], [x2, y1, z1]], south: [[x1, y2, z2], [x2, y2, z2], [x1, y1, z2]],
    west: [[x1, y2, z1], [x1, y2, z2], [x1, y1, z1]], east: [[x2, y2, z2], [x2, y2, z1], [x2, y1, z2]],
    up: [[x1, y2, z1], [x2, y2, z1], [x1, y2, z2]], down: [[x1, y1, z2], [x2, y1, z2], [x1, y1, z1]],
  }[dir];
}
const NORMAL = {north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0]};
// view: {rotation, translation, scale} (the model's gui display); fit: scale the result to fill the icon
function draw3d(ctx, elements, view, light, fit) {
  const [rx, ry, rz] = (view.rotation || [0, 0, 0]).map(rad), sc = view.scale || [1, 1, 1], tr = view.translation || [0, 0, 0];
  const xf = p => {   // model space → view space (x right, y up, z toward the viewer)
    let q = [(p[0] - 8) * sc[0], (p[1] - 8) * sc[1], (p[2] - 8) * sc[2]];
    q = rotZ(q, rz); q = rotY(q, -ry); q = rotX(q, rx);
    return [q[0] + tr[0], q[1] + tr[1], q[2] + tr[2]];
  };
  const nx = n => rotX(rotY(rotZ(n, rz), -ry), rx);
  const faces = [];
  elements.forEach((el, ei) => {
    const er = el.rotation, eRot = p => {
      if (!er || !er.angle) return p;
      const o = er.origin || [8, 8, 8], a = rad(er.angle), q = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
      const r = er.axis === "x" ? rotX(q, a) : er.axis === "y" ? rotY(q, -a) : rotZ(q, a);
      return [r[0] + o[0], r[1] + o[1], r[2] + o[2]];
    };
    for (const [dir, f] of Object.entries(el.faces || {})) {
      if (!f || !f.img) continue;
      let n = NORMAL[dir];
      if (er && er.angle) { const a = rad(er.angle); n = er.axis === "x" ? rotX(n, a) : er.axis === "y" ? rotY(n, -a) : rotZ(n, a); }
      const vn = nx(n);
      if (vn[2] < -1e-4) continue;   // facing away
      const pts = corners(el.from, el.to, dir).map(eRot).map(xf);
      const depth = (pts[0][2] + pts[1][2] + pts[2][2]) / 3 + (pts[1][2] + pts[2][2] - pts[0][2]) / 3;
      let shade = 1;
      if (light === "side" && f.shade !== false) shade = vn[1] > .5 ? 1 : vn[1] < -.5 ? .5 : vn[0] < 0 ? .8 : .6;
      faces.push({f, pts, depth, shade, ei});
    }
  });
  faces.sort((a, b) => a.depth - b.depth || a.ei - b.ei);
  // bounds (for fitting)
  let k = SIZE / 16, ox = SIZE / 2, oy = SIZE / 2;
  if (fit) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const {pts} of faces) for (const p of pts.concat([[pts[1][0] + pts[2][0] - pts[0][0], pts[1][1] + pts[2][1] - pts[0][1]]])) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    k = (SIZE - 4) / Math.max(x1 - x0, y1 - y0); ox = SIZE / 2 - (x0 + x1) / 2 * k; oy = SIZE / 2 + (y0 + y1) / 2 * k;
  }
  const S = p => [ox + p[0] * k, oy - p[1] * k];
  for (const {f, pts, shade} of faces) {
    let [u1, v1, u2, v2] = f.uv;
    // rotating the texture on the face: which texture corner goes to the face's top-left
    let tl = [u1, v1], tr2 = [u2, v1], bl = [u1, v2];
    const rot = ((f.rot || 0) % 360 + 360) % 360;
    if (rot === 90) { tl = [u1, v2]; tr2 = [u1, v1]; bl = [u2, v2]; }
    else if (rot === 180) { tl = [u2, v2]; tr2 = [u1, v2]; bl = [u2, v1]; }
    else if (rot === 270) { tl = [u2, v1]; tr2 = [u2, v2]; bl = [u1, v1]; }
    const [P0, P1, P2] = pts.map(S);
    // affine map from texture (u, v) to screen, through the three corners
    const du = [tr2[0] - tl[0], tr2[1] - tl[1]], dv = [bl[0] - tl[0], bl[1] - tl[1]];
    const det = du[0] * dv[1] - du[1] * dv[0]; if (!det) continue;
    const ex = [P1[0] - P0[0], P1[1] - P0[1]], ey = [P2[0] - P0[0], P2[1] - P0[1]];
    // M · du = ex, M · dv = ey  →  M = [ex ey] · [du dv]^-1
    const inv = [dv[1] / det, -dv[0] / det, -du[1] / det, du[0] / det];
    const a = ex[0] * inv[0] + ey[0] * inv[2], c = ex[0] * inv[1] + ey[0] * inv[3];
    const b = ex[1] * inv[0] + ey[1] * inv[2], d = ex[1] * inv[1] + ey[1] * inv[3];
    const e = P0[0] - a * tl[0] - c * tl[1], g = P0[1] - b * tl[0] - d * tl[1];
    const ux = Math.min(u1, u2), vy = Math.min(v1, v2), uw = Math.abs(u2 - u1), vh = Math.abs(v2 - v1);
    if (uw < .01 || vh < .01) continue;
    // the face's texture piece (tinted and shaded), drawn through the affine map, slightly grown to hide seams
    const sx = Math.floor(ux), sy = Math.floor(vy), sw = Math.max(1, Math.ceil(ux + uw) - sx), sh = Math.max(1, Math.ceil(vy + vh) - sy);
    const piece = tinted(f.img, sx, sy, sw, sh, f.tint);
    if (shade < 1) shadeFill(piece, "#000", 1 - shade);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.setTransform(a, b, c, d, e, g);
    ctx.beginPath(); ctx.rect(ux, vy, uw, vh); ctx.clip();
    const grow = .35 / Math.max(1e-3, Math.min(Math.hypot(a, b), Math.hypot(c, d)));
    ctx.drawImage(piece, 0, 0, sw, sh, sx - grow * 0, sy, sw, sh);
    ctx.restore();
  }
}

// a JSON model's elements, with its textures loaded (uv from 0..16 into texture pixels)
async function jsonElements(r, id) {
  const out = [];
  for (const el of r.elements) {
    const faces = {};
    for (const [dir, f] of Object.entries(el.faces || {})) {
      const t = r.ref(f.texture); if (!t) continue;
      const img = await tex(t); if (!img) continue;
      const fr = frame(img), su = fr.w / 16, sv = fr.h / 16;
      const [x1, y1, z1] = el.from, [x2, y2, z2] = el.to;
      const uv = f.uv || {up: [x1, z1, x2, z2], down: [x1, 16 - z2, x2, 16 - z1], north: [16 - x2, 16 - y2, 16 - x1, 16 - y1],
        south: [x1, 16 - y2, x2, 16 - y1], west: [z1, 16 - y2, z2, 16 - y1], east: [16 - z2, 16 - y2, 16 - z1, 16 - y1]}[dir];
      faces[dir] = {img, uv: [uv[0] * su, uv[1] * sv, uv[2] * su, uv[3] * sv], rot: f.rotation, tint: f.tintindex != null ? BLOCK_TINT[id] : null, shade: el.shade};
    }
    out.push({from: el.from, to: el.to, rotation: el.rotation, faces});
  }
  return out;
}

// ---------- items drawn by the game's entity renderers: built here from the entity textures ----------
// box(u, v, w, h, d): the usual entity texture layout for a w×h×d box whose texture starts at (u, v)
function box(img, from, to, u, v, w, h, d, sides) {
  const L = {up: [u + d, v, u + d + w, v + d], down: [u + d + w, v, u + d + 2 * w, v + d],
    west: [u, v + d, u + d, v + d + h], north: [u + d, v + d, u + d + w, v + d + h], east: [u + d + w, v + d, u + 2 * d + w, v + d + h], south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h]};
  const faces = {};
  for (const [k, uv] of Object.entries(L)) faces[(sides && sides[k]) || k] = {img, uv};
  return {from, to, faces};
}
const DYES = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const DYE_RGB = {white: "#F9FFFE", orange: "#F9801D", magenta: "#C74EBD", light_blue: "#3AB3DA", yellow: "#FED83D", lime: "#80C71F", pink: "#F38BAA", gray: "#474F52",
  light_gray: "#9D9D97", cyan: "#169C9C", purple: "#8932B8", blue: "#3C44AA", brown: "#835432", green: "#5E7C16", red: "#B02E26", black: "#1D1D21"};
const BLOCK_VIEW = {rotation: [30, 225, 0], translation: [0, 0, 0], scale: [.625, .625, .625]};

async function special(ctx, id) {
  let m;
  if ((m = /^(?:(\w+)_)?shulker_box$/.exec(id))) {
    const img = await tex("entity/shulker/shulker" + (m[1] ? "_" + m[1] : ""));
    // lid over the top 12, base under it
    const els = [box(img, [0, 0, 0], [16, 8, 16], 0, 28, 16, 8, 16), box(img, [0, 4, 0], [16, 16, 16], 0, 0, 16, 12, 16)];
    draw3d(ctx, els, BLOCK_VIEW, "side"); return true;
  }
  if ((m = /^(chest|trapped_chest|ender_chest)$/.exec(id))) {
    const img = await tex("entity/chest/" + {chest: "normal", trapped_chest: "trapped", ender_chest: "ender"}[id]);
    const body = box(img, [1, 0, 1], [15, 10, 15], 0, 19, 14, 10, 14), lid = box(img, [1, 9, 1], [15, 14, 15], 0, 0, 14, 5, 14), lock = box(img, [7, 7, 0], [9, 11, 1], 0, 0, 2, 4, 1);
    for (const e of [body, lid, lock]) { const up = e.faces.up; e.faces.up = e.faces.down; e.faces.down = up; }
    draw3d(ctx, [body, lid, lock], BLOCK_VIEW, "side"); return true;
  }
  if ((m = /^(\w+)_bed$/.exec(id)) && DYES.includes(m[1])) {
    const img = await tex("entity/bed/" + m[1]);
    // lying flat: the head's big face (6,6)-(22,22) on top, the foot's (6,28)-(22,44)
    const head = {from: [0, 3, 0], to: [16, 9, 16], faces: {up: {img, uv: [6, 6, 22, 22]}, north: {img, uv: [6, 0, 22, 6]},
      west: {img, uv: [0, 6, 6, 22], rot: 90}, east: {img, uv: [22, 6, 28, 22], rot: 270}}};
    const foot = {from: [0, 3, 16], to: [16, 9, 32], faces: {up: {img, uv: [6, 28, 22, 44]}, south: {img, uv: [22, 22, 38, 28]},
      west: {img, uv: [0, 28, 6, 44], rot: 90}, east: {img, uv: [22, 28, 28, 44], rot: 270}}};
    const legs = [[0, 0, 0], [13, 0, 0], [0, 0, 29], [13, 0, 29]].map(([x, y, z]) => ({from: [x, y, z], to: [x + 3, 3, z + 3], faces: {north: {img, uv: [50, 3, 53, 6]}, south: {img, uv: [50, 3, 53, 6]}, west: {img, uv: [50, 3, 53, 6]}, east: {img, uv: [50, 3, 53, 6]}}}));
    draw3d(ctx, [...legs, head, foot], {rotation: [30, 160, 0], translation: [0, 0, 0], scale: [.53, .53, .53]}, "side", true); return true;
  }
  if (id === "shield") {
    const img = await tex("entity/shield_base_nopattern");
    const plate = {from: [2, -3, 7], to: [14, 19, 8], faces: {north: {img, uv: [1, 1, 13, 23]}, south: {img, uv: [14, 1, 26, 23]}, east: {img, uv: [13, 1, 14, 23]}, west: {img, uv: [0, 1, 1, 23]}, up: {img, uv: [1, 0, 13, 1]}}};
    const handle = {from: [7, 5, 1], to: [9, 11, 7], faces: {west: {img, uv: [26, 6, 32, 12]}, east: {img, uv: [34, 6, 40, 12]}, up: {img, uv: [32, 0, 34, 6]}}};
    draw3d(ctx, [plate], {rotation: [15, 155, -5], translation: [0, 0, 0], scale: [.65, .65, .65]}, "front", true); return true;
  }
  if ((m = /^(\w+)_banner$/.exec(id)) && DYES.includes(m[1])) {
    const base = await tex("entity/banner_base"), cloth = await tex("entity/banner/base");
    const tint = DYE_RGB[m[1]];
    const flag = {from: [-2, -12, 7], to: [18, 28, 8], faces: {south: {img: cloth, uv: [1, 1, 21, 41], tint}, north: {img: cloth, uv: [22, 1, 42, 41], tint}}};
    const pole = {from: [7, -16, 5], to: [9, 30, 7], faces: {south: {img: base, uv: [46, 2, 48, 44]}, east: {img: base, uv: [48, 2, 50, 44]}, west: {img: base, uv: [44, 2, 46, 44]}}};
    const bar = {from: [-2, 28, 5], to: [18, 30, 7], faces: {south: {img: base, uv: [2, 44, 22, 46]}, up: {img: base, uv: [2, 42, 22, 44]}}};
    draw3d(ctx, [pole, flag, bar], {rotation: [30, 20, 0], translation: [0, 0, 0], scale: [.4, .4, .4]}, "side", true); return true;
  }
  const skull = {skeleton_skull: ["entity/skeleton/skeleton", 0, 0], wither_skeleton_skull: ["entity/skeleton/wither_skeleton", 0, 0], zombie_head: ["entity/zombie/zombie", 0, 0],
    creeper_head: ["entity/creeper/creeper", 0, 0], player_head: ["entity/steve", 0, 0], dragon_head: ["entity/enderdragon/dragon", 112, 30]}[id];
  if (skull) {
    const img = await tex(skull[0]);
    const s = id === "dragon_head" ? 16 : 8, o = (16 - s) / 2;
    const e = box(img, [o, 0, o], [o + s, s, o + s], skull[1], skull[2], s, s, s, {north: "south", south: "north", west: "east", east: "west"});
    draw3d(ctx, [e], {rotation: [30, 45, 0], translation: [0, 0, 0], scale: [1, 1, 1]}, "side", true); return true;
  }
  if (id === "conduit") {
    const img = await tex("entity/conduit/base");
    draw3d(ctx, [box(img, [5, 5, 5], [11, 11, 11], 0, 0, 6, 6, 6)], BLOCK_VIEW, "side", true); return true;
  }
  return false;
}

// potions, splash/lingering potions and tipped arrows in each potion's colour: "splash_potion@fire_resistance"
const POTION_COLOR = {water: "#385DC6", night_vision: "#1F1FA1", invisibility: "#7F8392", leaping: "#22FF4C", fire_resistance: "#E49A3A", swiftness: "#7CAFC6",
  slowness: "#5A6C81", turtle_master: "#755D5C", water_breathing: "#2E5299", healing: "#F82423", harming: "#430A09", poison: "#4E9331", regeneration: "#CD5CAB",
  strength: "#932423", weakness: "#484D48", luck: "#339900", slow_falling: "#F7F8E0"};
window.POTION_IDS = ["potion", "splash_potion", "lingering_potion", "tipped_arrow"].flatMap(k => Object.keys(POTION_COLOR).map(p => k + "@" + p));

async function render(id) {
  const c = document.createElement("canvas"); c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  if (id.includes("@")) {
    const [item, pot] = id.split("@"), col = POTION_COLOR[pot];
    await drawGenerated(ctx, await resolve("item/" + item), item, item === "tipped_arrow" ? [null, col] : [col]);
    return c;
  }
  if (await special(ctx, id)) return c;
  const r = await resolve("item/" + id);
  if (r.generated) await drawGenerated(ctx, r, id, ITEM_TINT[id]);
  else if (r.elements) draw3d(ctx, await jsonElements(r, id), r.gui || BLOCK_VIEW, r.light);
  else return null;
  return c;
}

window.renderAll = async (ids, cols) => {
  const atlas = document.createElement("canvas"), rows = Math.ceil(ids.length / cols);
  atlas.width = cols * SIZE; atlas.height = rows * SIZE;
  const ax = atlas.getContext("2d"), index = {}, missing = [];
  let n = 0;
  for (const id of ids) {
    let c = null; try { c = await render(id); } catch (e) { missing.push(id + " " + e.message); continue; }
    if (!c) { missing.push(id); continue; }
    ax.drawImage(c, (n % cols) * SIZE, Math.floor(n / cols) * SIZE); index[id] = n++;
  }
  // trim unused rows
  const out = document.createElement("canvas"); out.width = atlas.width; out.height = Math.ceil(n / cols) * SIZE;
  out.getContext("2d").drawImage(atlas, 0, 0);
  return {png: out.toDataURL("image/png"), index, missing};
};

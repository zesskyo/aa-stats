// The item renderer used by make.mjs
// Renders every item of the resource pack to an icon, the way the game's inventory draws it:
// flat items from their sprites, and 3D items (blocks, and the items the game draws with its entity renderers:
// chests, shulker boxes, beds, skulls, banners, the shield, the conduit) with WebGL, from the same boxes, texture
// layouts and transforms the game uses. Loaded in a browser page served from the pack's assets/minecraft folder.
const SIZE = 64;               // pixels per icon (the inventory's 16 GUI pixels × 4)
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
// the model with its parents merged
async function resolve(name) {
  let m = await model(name), textures = {}, elements = null, gui = null, generated = false, entity = false, light = null;
  while (m) {
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
const DYES = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const DYE_RGB = {white: "#F9FFFE", orange: "#F9801D", magenta: "#C74EBD", light_blue: "#3AB3DA", yellow: "#FED83D", lime: "#80C71F", pink: "#F38BAA", gray: "#474F52",
  light_gray: "#9D9D97", cyan: "#169C9C", purple: "#8932B8", blue: "#3C44AA", brown: "#835432", green: "#5E7C16", red: "#B02E26", black: "#1D1D21"};
const rgb = hex => hex ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) : [1, 1, 1];

// ---------- flat items ----------
function frameOf(img) { const c = document.createElement("canvas"); c.width = img.width; c.height = Math.min(img.height, img.width); c.getContext("2d").drawImage(img, 0, 0); return c; }
async function drawGenerated(ctx, r, tints) {
  for (let i = 0; i < 5; i++) {
    const t = r.textures["layer" + i]; if (!t) continue;
    const img = await tex(t); if (!img) continue;
    const f = frameOf(img), x = f.getContext("2d");
    if (tints && tints[i]) { x.globalCompositeOperation = "multiply"; x.fillStyle = tints[i]; x.fillRect(0, 0, f.width, f.height); x.globalCompositeOperation = "destination-in"; x.drawImage(frameOf(img), 0, 0); }
    ctx.imageSmoothingEnabled = false; ctx.drawImage(f, 0, 0, SIZE, SIZE);
  }
}

// ---------- matrices (4×4, column vectors, right-handed) ----------
const M = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c]; return o; },
  t: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1],
  s: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  rx: d => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; },
  ry: d => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; },
  rz: d => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  chain: (...ms) => ms.reduce((a, b) => M.mul(a, b), M.id()),
  ap: (m, p) => [0, 1, 2].map(r => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3]),
  dir: (m, v) => [0, 1, 2].map(r => m[r * 4] * v[0] + m[r * 4 + 1] * v[1] + m[r * 4 + 2] * v[2]),
};
// The inventory's view of an item model: its gui display (translation, rotation, scale) around the block's centre, as the game applies it
function guiMatrix(d) {
  const r = d.rotation || [0, 0, 0], t = d.translation || [0, 0, 0], s = d.scale || [1, 1, 1];
  return M.chain(M.t(t[0] / 16, t[1] / 16, t[2] / 16), M.rx(r[0]), M.ry(r[1]), M.rz(r[2]), M.s(s[0], s[1], s[2]), M.t(-.5, -.5, -.5));
}

// A quad: 4 corners in block units, 4 texture coordinates (0–1), the image, its outward normal, tint and whether it's shaded
// ---------- JSON block models ----------
function corners(from, to, dir) {
  const [x1, y1, z1] = from, [x2, y2, z2] = to;
  return {   // top-left, top-right, bottom-right, bottom-left of the texture, seen from outside
    north: [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]], south: [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]],
    west: [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]], east: [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]],
    up: [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]], down: [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]],
  }[dir];
}
const NORMAL = {north: [0, 0, -1], south: [0, 0, 1], west: [-1, 0, 0], east: [1, 0, 0], up: [0, 1, 0], down: [0, -1, 0]};
async function jsonQuads(r, id) {
  const out = [];
  for (const el of r.elements) {
    let em = M.id();
    if (el.rotation && el.rotation.angle) {
      const o = (el.rotation.origin || [8, 8, 8]).map(v => v / 16), a = el.rotation.angle;
      const rot = el.rotation.axis === "x" ? M.rx(a) : el.rotation.axis === "y" ? M.ry(a) : M.rz(a);
      let sc = M.id();
      if (el.rotation.rescale) { const k = 1 / Math.cos(Math.abs(a) * Math.PI / 180); sc = el.rotation.axis === "x" ? M.s(1, k, k) : el.rotation.axis === "y" ? M.s(k, 1, k) : M.s(k, k, 1); }
      em = M.chain(M.t(o[0], o[1], o[2]), rot, sc, M.t(-o[0], -o[1], -o[2]));
    }
    for (const [dir, f] of Object.entries(el.faces || {})) {
      const t = r.ref(f.texture); if (!t) continue;
      const img = await tex(t); if (!img) continue;
      const [x1, y1, z1] = el.from, [x2, y2, z2] = el.to;
      const uv = f.uv || {up: [x1, z1, x2, z2], down: [x1, 16 - z2, x2, 16 - z1], north: [16 - x2, 16 - y2, 16 - x1, 16 - y1],
        south: [x1, 16 - y2, x2, 16 - y1], west: [z1, 16 - y2, z2, 16 - y1], east: [16 - z2, 16 - y2, 16 - z1, 16 - y1]}[dir];
      const [u1, v1, u2, v2] = uv.map(v => v / 16);
      const uvs = [[u1, v1], [u2, v1], [u2, v2], [u1, v2]], k = ((f.rotation || 0) / 90) | 0;
      out.push({
        p: corners(el.from.map(v => v / 16), el.to.map(v => v / 16), dir).map(p => M.ap(em, p)),
        uv: [0, 1, 2, 3].map(i => uvs[(i - k + 4) % 4]), img: frameOf(img), n: M.dir(em, NORMAL[dir]),
        tint: f.tintindex != null ? BLOCK_TINT[id] : null, shade: el.shade !== false,
      });
    }
  }
  return out;
}

// ---------- entity models: boxes exactly as the game's ModelRenderer makes them ----------
// part: {tex: [u, v], box: [x, y, z, dx, dy, dz], grow, rp: rotation point, rot: [x, y, z] radians} in model units (1/16 block)
function boxQuads(img, texW, texH, m, part) {
  const [u, v] = part.tex, [bx, by, bz, dx, dy, dz] = part.box, g = part.grow || 0;
  const x = (bx - g) / 16, y = (by - g) / 16, z = (bz - g) / 16, x1 = (bx + dx + g) / 16, y1 = (by + dy + g) / 16, z1 = (bz + dz + g) / 16;
  const V = [[x1, y, z], [x1, y1, z], [x, y1, z], [x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1], [x, y, z]];   // v0…v6, v7
  const f4 = u, f5 = u + dz, f6 = f5 + dx, f7 = f6 + dx, f8 = f6 + dz, f9 = f8 + dx, f10 = v, f11 = v + dz, f12 = f11 + dy;
  // TexturedQuad(vertices, u1, v1, u2, v2): vertex 0 → (u2, v1), 1 → (u1, v1), 2 → (u1, v2), 3 → (u2, v2)
  const faces = [
    [[4, 3, 7, 0], f5, f10, f6, f11, [0, -1, 0]], [[1, 2, 6, 5], f6, f11, f7, f10, [0, 1, 0]],
    [[7, 3, 6, 2], f4, f11, f5, f12, [-1, 0, 0]], [[0, 7, 2, 1], f5, f11, f6, f12, [0, 0, -1]],
    [[4, 0, 1, 5], f6, f11, f8, f12, [1, 0, 0]], [[3, 4, 5, 6], f8, f11, f9, f12, [0, 0, 1]],
  ];
  // the part's own placement: translate to its rotation point, then rotate z, y, x (as ModelRenderer does)
  const rp = (part.rp || [0, 0, 0]).map(v => v / 16), r = part.rot || [0, 0, 0], d = 180 / Math.PI;
  const pm = M.chain(m, M.t(rp[0], rp[1], rp[2]), M.rz(r[2] * d), M.ry(r[1] * d), M.rx(r[0] * d));
  return faces.map(([vi, u1, v1, u2, v2, n]) => ({
    p: vi.map(i => M.ap(pm, V[i])), uv: [[u2, v1], [u1, v1], [u1, v2], [u2, v2]].map(([a, b]) => [a / texW, b / texH]),
    img, n: M.dir(pm, n), shade: true,
  }));
}
const partsQuads = (img, w, h, m, parts) => parts.flatMap(p => boxQuads(img, w, h, m, p));

async function entityQuads(id) {
  let m;
  // chest, trapped chest, ender chest: ChestTileEntityRenderer, facing south when it's an item
  if (/^(chest|trapped_chest|ender_chest)$/.test(id)) {
    const img = await tex("entity/chest/" + {chest: "normal", trapped_chest: "trapped", ender_chest: "ender"}[id]);
    const base = M.chain(M.t(.5, .5, .5), M.ry(-0), M.t(-.5, -.5, -.5));
    return partsQuads(img, 64, 64, base, [
      {tex: [0, 19], box: [1, 0, 1, 14, 10, 14]},
      {tex: [0, 0], box: [1, 0, 0, 14, 5, 14], rp: [0, 9, 1]},
      {tex: [0, 0], box: [7, -1, 15, 2, 4, 1], rp: [0, 8, 0]},
    ]);
  }
  // shulker boxes: ShulkerBoxTileEntityRenderer, opening upwards
  if ((m = /^(?:(\w+)_)?shulker_box$/.exec(id))) {
    const img = await tex("entity/shulker/shulker" + (m[1] ? "_" + m[1] : ""));
    const base = M.chain(M.t(.5, .5, .5), M.s(.9995, .9995, .9995), M.s(1, -1, -1), M.t(0, -1, 0));
    return partsQuads(img, 64, 64, base, [
      {tex: [0, 28], box: [-8, -8, -8, 16, 8, 16], rp: [0, 24, 0]},
      {tex: [0, 0], box: [-8, -16, -8, 16, 12, 16], rp: [0, 24, 0]},
    ]);
  }
  // beds: BedTileEntityRenderer, head and foot facing south
  if ((m = /^(\w+)_bed$/.exec(id)) && DYES.includes(m[1])) {
    const img = await tex("entity/bed/" + m[1]);
    const legs = [[50, 0, [0, 6, -16], [Math.PI / 2, 0, 0]], [50, 6, [0, 6, 0], [Math.PI / 2, 0, Math.PI / 2]], [50, 12, [-16, 6, -16], [Math.PI / 2, 0, Math.PI * 1.5]], [50, 18, [-16, 6, 0], [Math.PI / 2, 0, Math.PI]]]
      .map(([u, v, b, rot]) => ({tex: [u, v], box: [...b, 3, 3, 3], rot}));
    const piece = (part, l1, l2, foot) => partsQuads(img, 64, 64,
      M.chain(M.t(0, .5625, foot ? -1 : 0), M.rx(90), M.t(.5, .5, .5), M.rz(180), M.t(-.5, -.5, -.5)), [part, l1, l2]);
    return [...piece({tex: [0, 0], box: [0, 0, 0, 16, 16, 6]}, legs[2], legs[3], false), ...piece({tex: [0, 22], box: [0, 0, 0, 16, 16, 6]}, legs[0], legs[1], true)];
  }
  // skulls and heads: SkullTileEntityRenderer on the floor, turned 180°
  const skull = {skeleton_skull: ["entity/skeleton/skeleton", 64, 32], wither_skeleton_skull: ["entity/skeleton/wither_skeleton", 64, 32], zombie_head: ["entity/zombie/zombie", 64, 64, true],
    creeper_head: ["entity/creeper/creeper", 64, 32], player_head: ["entity/steve", 64, 64, true]}[id];
  if (skull) {
    const img = await tex(skull[0]), base = M.chain(M.t(.5, 0, .5), M.s(-1, -1, 1));
    const parts = [{tex: [0, 0], box: [-4, -8, -4, 8, 8, 8], rot: [0, Math.PI, 0]}];
    if (skull[3]) parts.push({tex: [32, 0], box: [-4, -8, -4, 8, 8, 8], grow: .25, rot: [0, Math.PI, 0]});
    return partsQuads(img, skull[1], skull[2], base, parts);
  }
  if (id === "dragon_head") {
    const img = await tex("entity/enderdragon/dragon"), rot = [0, Math.PI, 0];
    const base = M.chain(M.t(.5, 0, .5), M.s(-1, -1, 1), M.t(0, -.374375, 0), M.s(.75, .75, .75));
    return partsQuads(img, 256, 256, base, [
      {tex: [176, 44], box: [-6, -1, -24, 12, 5, 16], rot}, {tex: [112, 30], box: [-8, -8, -10, 16, 16, 16], rot},
      {tex: [0, 0], box: [-5, -12, -4, 2, 4, 6], rot}, {tex: [0, 0], box: [3, -12, -4, 2, 4, 6], rot},
      {tex: [112, 0], box: [-5, -3, -22, 2, 2, 4], rot}, {tex: [112, 0], box: [3, -3, -22, 2, 2, 4], rot},
      {tex: [176, 65], box: [-6, 0, -16, 12, 4, 16], rp: [0, 4, -8], rot},
    ]);
  }
  // the conduit: ConduitTileEntityRenderer, its shell when it isn't active
  if (id === "conduit") {
    const img = await tex("entity/conduit/base");
    return partsQuads(img, 32, 16, M.t(.5, .5, .5), [{tex: [0, 0], box: [-3, -3, -3, 6, 6, 6]}]);
  }
  // the shield: ShieldModel, turned upside down and back to front
  if (id === "shield") {
    const img = await tex("entity/shield_base_nopattern");
    return partsQuads(img, 64, 64, M.s(1, -1, -1), [{tex: [0, 0], box: [-6, -11, -2, 12, 22, 1]}, {tex: [26, 0], box: [-1, -3, -1, 2, 6, 6]}]);
  }
  // banners: BannerTileEntityRenderer: the stand, the bar, and the cloth in its colour, then its patterns in order.
  // "ominous_banner" is the raid captains' banner (Raid.createIllagerBanner's patterns)
  const OMINOUS = [["rhombus", "cyan"], ["stripe_bottom", "light_gray"], ["stripe_center", "gray"], ["border", "light_gray"],
    ["stripe_middle", "black"], ["half_horizontal", "light_gray"], ["circle", "light_gray"], ["border", "black"]];
  if (id === "ominous_banner" || ((m = /^(\w+)_banner$/.exec(id)) && DYES.includes(m[1]))) {
    const color = id === "ominous_banner" ? "white" : m[1], patterns = [["base", color], ...(id === "ominous_banner" ? OMINOUS : [])];
    const base = await tex("entity/banner_base");
    const bm = M.chain(M.t(.5, .5, .5), M.s(2 / 3, -2 / 3, -2 / 3));
    const slate = {tex: [0, 0], box: [-10, 0, -2, 20, 40, 1], rp: [0, -32, 0], rot: [-.0025 * Math.PI, 0, 0]};
    const out = partsQuads(base, 64, 64, bm, [{tex: [44, 0], box: [-1, -30, -1, 2, 42, 2]}, {tex: [0, 42], box: [-10, -32, -1, 20, 2, 2]}, slate]);
    for (let i = 0; i < patterns.length; i++) {
      const img = await tex("entity/banner/" + patterns[i][0]); if (!img) continue;
      out.push(...partsQuads(img, 64, 64, bm, [slate]).map(q => ({...q, tint: DYE_RGB[patterns[i][1]], layer: i + 1})));
    }
    return out;
  }
  return null;
}

// ---------- WebGL ----------
const glc = document.createElement("canvas"); glc.width = glc.height = SIZE;
const gl = glc.getContext("webgl", {antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true});
const prog = (() => {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, `attribute vec3 pos; attribute vec2 uv; varying vec2 vuv;
    void main() { vuv = uv; gl_Position = vec4(pos.x * 2.0, pos.y * 2.0, -pos.z * 0.25, 1.0); }`));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 vuv; uniform sampler2D tex; uniform vec3 col;
    void main() { vec4 c = texture2D(tex, vuv); if (c.a < 0.1) discard; gl_FragColor = vec4(c.rgb * col, c.a); }`));
  gl.linkProgram(p); gl.useProgram(p); return p;
})();
const aPos = gl.getAttribLocation(prog, "pos"), aUv = gl.getAttribLocation(prog, "uv"), uCol = gl.getUniformLocation(prog, "col");
const glTex = new Map();
function texFor(img) {
  if (glTex.has(img)) return glTex.get(img);
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  glTex.set(img, t); return t;
}
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
// the inventory's lighting for 3D items (the game's two GUI lights, 0.6 each, plus 0.4 ambient), in view space (x right, y up, z out)
const LIGHTS = [[-.2225, .1715, .9598], [-.2150, .9719, .0966]];
function shadeOf(n, light) {
  if (light === "front") return 1;
  const v = norm(n);
  return Math.min(1, .4 + .6 * LIGHTS.reduce((a, l) => a + Math.max(0, v[0] * l[0] + v[1] * l[1] + v[2] * l[2]), 0));
}
function drawQuads(quads, view, light) {
  gl.viewport(0, 0, SIZE, SIZE); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const vm = guiMatrix(view);
  const qs = quads.map(q => {
    const p = q.p.map(v => M.ap(vm, v)), n = M.dir(vm, q.n);
    return {...q, p, vn: n, z: p.reduce((a, v) => a + v[2], 0) / 4};
  }).filter(q => q.vn[2] > -1e-4 || q.layer);   // faces turned away aren't drawn (as the game culls them)
  qs.sort((a, b) => a.z - b.z || (a.layer || 0) - (b.layer || 0));   // far to near, for see-through textures
  const buf = gl.createBuffer();
  for (const q of qs) {
    const d = [];
    for (const i of [0, 1, 2, 0, 2, 3]) d.push(...q.p[i], ...q.uv[i]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 12);
    gl.bindTexture(gl.TEXTURE_2D, texFor(q.img));
    const s = q.shade ? shadeOf(q.vn, light) : 1, c = rgb(q.tint);
    gl.uniform3f(uCol, c[0] * s, c[1] * s, c[2] * s);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  gl.deleteBuffer(buf);
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
    await drawGenerated(ctx, await resolve("item/" + item), item === "tipped_arrow" ? [null, col] : [col]);
    return c;
  }
  const r = await resolve("item/" + (id === "ominous_banner" ? "white_banner" : id));
  if (r.generated) { await drawGenerated(ctx, r, ITEM_TINT[id]); return c; }
  let quads = null;
  if (r.entity) quads = await entityQuads(id);
  else if (r.elements) quads = await jsonQuads(r, id);
  if (!quads) return null;
  drawQuads(quads, r.gui || {rotation: [30, 225, 0], scale: [.625, .625, .625]}, r.light);
  ctx.drawImage(glc, 0, 0);
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
  const out = document.createElement("canvas"); out.width = atlas.width; out.height = Math.ceil(n / cols) * SIZE;
  out.getContext("2d").drawImage(atlas, 0, 0);
  return {png: out.toDataURL("image/png"), index, missing, size: SIZE};
};

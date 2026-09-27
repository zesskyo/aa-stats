/*
 * seed-map.js — the world from a run's seed, for the travel map: biomes and structures, worked out in the
 * browser by cubiomes (github.com/Cubitect/cubiomes, compiled to cubiomes.wasm — see wasm/ in aa-stats).
 * It runs in a background worker, in square tiles, so the page stays smooth while you pan and zoom.
 *
 *   const w = seedWorld(run)                 null if the run has no seed or isn't Minecraft 1.16
 *   w.tile(dim, scale, tx, tz)               a finished tile {canvas, ids} or null (it's then worked out)
 *   w.peek(dim, scale, tx, tz)               the same, but never starts work (for coarser tiles drawn underneath)
 *   w.structures(dim, kind, x0, z0, x1, z1)  [[x, z], …] of that kind in the area, or null while working
 *   w.onReady = () => …                      called when new tiles or structures arrive
 */
const TILE = 128;                              // samples per tile side
const DIM_ID = {o: 0, n: -1, e: 1};
// Structures by dimension: cubiomes' number, a short badge, the widest view (blocks) where all of them are shown,
// and whether the ones the player went to are shown at any zoom (not for the very common ones)
const STRUCTS = {
  o: [["stronghold", -1, "SH", 16000, true], ["village", 5, "V", 4000, true], ["desert", 1, "DT", 4000, true], ["jungle", 2, "JT", 4000, true],
      ["outpost", 10, "PO", 4000, true], ["monument", 8, "OM", 4000, true], ["mansion", 9, "WM", 16000, true], ["hut", 3, "WH", 4000, true],
      ["igloo", 4, "IG", 4000, true], ["portal", 11, "RP", 1500, false], ["shipwreck", 7, "SW", 1500, false], ["treasure", 14, "BT", 1000, false]],
  n: [["fortress", 18, "NF", 2000, true], ["bastion", 19, "BR", 2000, true], ["portal", 12, "RP", 1000, false]],
  e: [["endcity", 20, "EC", 3000, true]],
};
const STRUCT_TILE = 2048;

// Minecraft turns a seed that isn't a number into one with Java's String.hashCode
function seedBits(s) {
  s = String(s == null ? "" : s).trim(); if (!s) return null;
  let v;
  if (/^-?\d+$/.test(s)) { v = BigInt(s); if (v < -(2n ** 63n) || v >= 2n ** 63n) v = null; }
  if (v == null) { let h = 0; for (const c of s) h = (Math.imul(31, h) + c.codePointAt(0)) | 0; v = BigInt(h); }
  v = BigInt.asUintN(64, v);
  return {lo: Number(v & 0xffffffffn), hi: Number(v >> 32n)};
}

const SEED_WORKER = `
let w = null, cur = "";
onmessage = async ({data: m}) => {
  if (m.wasm) {
    const {instance} = await WebAssembly.instantiate(m.wasm, {env: {cos: Math.cos, sin: Math.sin, exp: Math.exp, pow: Math.pow, log: Math.log, atan2: Math.atan2}});
    w = instance.exports; postMessage({ready: true}); return;
  }
  const key = m.mc + ":" + m.lo + ":" + m.hi + ":" + m.dim;
  if (key !== cur) { w.setup(m.mc, m.lo, m.hi, m.dim); cur = key; }
  if (m.kind === "area") {
    const p = w.area(m.scale, m.x, m.z, m.n, m.n, m.y);
    const ids = new Uint8Array(m.n * m.n);
    if (p) { const src = new Int32Array(w.memory.buffer, p, m.n * m.n); for (let i = 0; i < ids.length; i++) ids[i] = src[i] < 0 ? 255 : src[i]; }
    postMessage({id: m.id, ids}, [ids.buffer]);
  } else {
    const n = m.type === -1 ? w.strongholds(128) : w.structures(m.type, m.x0, m.z0, m.x1, m.z1);
    postMessage({id: m.id, pts: Array.from(new Int32Array(w.memory.buffer, w.outBuf(), n * 2))});
  }
};`;

let seedWorker = null, seedWorkerReady = null;
function startSeedWorker() {
  if (seedWorkerReady) return seedWorkerReady;
  seedWorkerReady = fetch("cubiomes.wasm").then(r => { if (!r.ok) throw new Error("no cubiomes.wasm"); return r.arrayBuffer(); }).then(wasm => new Promise((ok, bad) => {
    seedWorker = new Worker(URL.createObjectURL(new Blob([SEED_WORKER], {type: "text/javascript"})));
    seedWorker.onmessage = e => { if (e.data.ready) { seedWorker.onmessage = onSeedMsg; ok(); } };
    seedWorker.onerror = bad;
    seedWorker.postMessage({wasm}, [wasm]);
  }));
  return seedWorkerReady;
}

// One request at a time: biome tiles first (newest wanted first), then structures; tiles nobody wants any more are dropped
const seedQueue = [], seedStructQueue = [], seedWaiting = new Map();
let seedBusy = false, seedNextId = 1;
function seedAsk(msg, done) { (msg.kind === "area" ? seedQueue : seedStructQueue).push({msg, done}); seedPump(); }
function seedPump() {
  if (seedBusy || !seedWorker || !(seedQueue.length || seedStructQueue.length)) return;
  const {msg, done} = seedQueue.length ? seedQueue.pop() : seedStructQueue.shift();
  const id = seedNextId++; seedWaiting.set(id, done); seedBusy = true;
  seedWorker.postMessage({...msg, id});
}
function onSeedMsg(e) { const done = seedWaiting.get(e.data.id); seedWaiting.delete(e.data.id); seedBusy = false; if (done) done(e.data); seedPump(); }

const seedWorlds = {};
function seedWorld(run) {
  const bits = seedBits(run.meta && run.meta.seed);
  const mc = /^1\.16\.1$/.test(run.mc || "") ? 19 : /^1\.16(\.|$)/.test(run.mc || "") ? 20 : null;   // cubiomes' MC_1_16_1 / MC_1_16_5
  if (!bits || mc == null || typeof Worker === "undefined" || typeof WebAssembly === "undefined") return null;
  const key = `${mc}:${bits.lo}:${bits.hi}`;
  if (seedWorlds[key]) return seedWorlds[key];
  const tiles = new Map(), structs = new Map(), wanted = new Set();
  const rgb = [];
  for (const [id, [, hex]] of Object.entries(BIOMES)) rgb[+id] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const world = {
    onReady: null, failed: false,
    tile(dim, scale, tx, tz) {
      const k = `${dim}|${scale}|${tx}|${tz}`, t = tiles.get(k);
      if (t) return t.canvas ? t : null;
      if (world.failed) return null;
      tiles.set(k, {pending: true}); wanted.add(k);
      startSeedWorker().then(() => seedAsk({kind: "area", mc, lo: bits.lo, hi: bits.hi, dim: DIM_ID[dim], scale, x: tx * TILE, z: tz * TILE, n: TILE, y: scale === 1 ? 64 : 16}, res => {
        const c = document.createElement("canvas"); c.width = c.height = TILE;
        const cx = c.getContext("2d"), img = cx.createImageData(TILE, TILE);
        res.ids.forEach((id, i) => { const col = rgb[id]; if (col) { img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255; } });
        cx.putImageData(img, 0, 0);
        tiles.set(k, {canvas: c, ids: res.ids}); wanted.delete(k);
        if (world.onReady) world.onReady();
      })).catch(() => { world.failed = true; if (world.onReady) world.onReady(); });
      return null;
    },
    peek(dim, scale, tx, tz) { const t = tiles.get(`${dim}|${scale}|${tx}|${tz}`); return t && t.canvas ? t : null; },
    // forget queued tiles that are no longer on screen (keeps panning fast)
    keepOnly(keys) {
      for (let i = seedQueue.length - 1; i >= 0; i--) {
        const m = seedQueue[i].msg; if (m.kind !== "area") continue;
        const k = `${Object.keys(DIM_ID).find(d => DIM_ID[d] === m.dim)}|${m.scale}|${m.x / TILE}|${m.z / TILE}`;
        if (!keys.has(k)) { seedQueue.splice(i, 1); tiles.delete(k); }
      }
    },
    structures(dim, kind, x0, z0, x1, z1) {
      const def = STRUCTS[dim].find(s => s[0] === kind); if (!def || world.failed) return null;
      const out = [];
      const add = (k, ask) => {
        const got = structs.get(k);
        if (got && got.pts) { for (let i = 0; i < got.pts.length; i += 2) out.push([got.pts[i], got.pts[i + 1]]); return true; }
        if (!got) { structs.set(k, {}); startSeedWorker().then(() => seedAsk(ask, res => { structs.set(k, {pts: res.pts}); if (world.onReady) world.onReady(); })).catch(() => {}); }
        return false;
      };
      if (def[1] === -1) return add(`${dim}|${kind}`, {kind: "s", mc, lo: bits.lo, hi: bits.hi, dim: DIM_ID[dim], type: -1}) ? out : null;
      let ready = true;
      for (let sx = Math.floor(x0 / STRUCT_TILE); sx <= Math.floor(x1 / STRUCT_TILE); sx++)
        for (let sz = Math.floor(z0 / STRUCT_TILE); sz <= Math.floor(z1 / STRUCT_TILE); sz++)
          ready = add(`${dim}|${kind}|${sx}|${sz}`, {kind: "s", mc, lo: bits.lo, hi: bits.hi, dim: DIM_ID[dim], type: def[1],
            x0: sx * STRUCT_TILE, z0: sz * STRUCT_TILE, x1: sx * STRUCT_TILE + STRUCT_TILE - 1, z1: sz * STRUCT_TILE + STRUCT_TILE - 1}) && ready;
      return ready ? out : out;   // (partial results are fine to draw)
    },
  };
  return seedWorlds[key] = world;
}

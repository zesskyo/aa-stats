// Reads a Hermes ghost file (<world>/…/<player uuid>.ghost): the player's position on every game tick.
// Each record is 46 bytes, big-endian:
//   time (int64, real time in ms) · x, y, z (float64) · yaw, pitch (float32) · health (float32) · flags (uint16)
//
// readGhost lines it up with the run's log (the log's "clock" pairs real time with IGT) and keeps a point every
// second or every 12 blocks, plus the points either side of a teleport, so the map stays accurate but small.
// Returns columns: {t: igt in seconds×10, d: "oone…" dimension per point, x, z, y, h: health}
const REC = 46;

export function readGhost(buf, run) {
  const clock = run.clock || [];
  const n = Math.floor(buf.length / REC);
  if (!n || clock.length < 2) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const wall = i => Number(view.getBigInt64(i * REC));

  // the ghost must overlap the run's log, or it's from another world
  const first = wall(0), last = wall(n - 1);
  if (last < clock[0][0] - 60000 || first > clock[clock.length - 1][0] + 60000) return null;

  // real time → IGT, between two clock samples (a few per second): straight in between when they're close
  // (IGT runs a bit slower than real time when the game lags); across a longer gap the game was paused,
  // so IGT runs with real time until it reaches the next sample and then waits
  let ci = 0;
  const igtAt = w => {
    while (ci + 1 < clock.length && clock[ci + 1][0] <= w) ci++;
    const [w0, g0] = clock[ci];
    if (w < w0) return g0;
    const next = clock[ci + 1];
    if (!next) return g0 + (w - w0);
    const [w1, g1] = next;
    return w1 - w0 <= 3000 ? g0 + (g1 - g0) * (w - w0) / (w1 - w0) : g0 + Math.min(w - w0, g1 - g0);
  };
  // dimension at an IGT, from the log's dimension changes
  const dims = run.dims || [];
  let di = -1;
  const dimAt = g => { while (di + 1 < dims.length && dims[di + 1][0] <= g) di++; return di >= 0 ? dims[di][1] : "o"; };

  const out = {t: [], d: "", x: [], z: [], y: [], h: []};
  const push = i => {
    const o = i * REC, g = igtAt(wall(i));
    if (g > run.finalIgt + 1000) return false;
    out.t.push(Math.round(g / 100)); out.d += dimAt(g);
    out.x.push(Math.round(view.getFloat64(o + 8))); out.y.push(Math.round(view.getFloat64(o + 16))); out.z.push(Math.round(view.getFloat64(o + 24)));
    out.h.push(Math.round(view.getFloat32(o + 40)));
    return true;
  };
  // a point every second, or every 12 blocks when moving fast (elytra), and both sides of a teleport
  let lastKept = -1, lastW = -Infinity, px = null, pz = null, kx = 0, kz = 0;
  for (let i = 0; i < n; i++) {
    const o = i * REC, w = wall(i), x = view.getFloat64(o + 8), z = view.getFloat64(o + 24);
    const jump = px != null && Math.hypot(x - px, z - pz) > 50;           // teleport, portal or respawn
    if (jump && lastKept !== i - 1) { if (!push(i - 1)) break; lastKept = i - 1; }
    if (jump || w - lastW >= 1000 || Math.hypot(x - kx, z - kz) >= 12) { if (!push(i)) break; lastKept = i; lastW = w; kx = x; kz = z; }
    px = x; pz = z;
  }
  if (lastKept !== n - 1) push(n - 1);
  if (!out.t.length) return null;
  // The log's dimension change and the ghost's teleport don't land on quite the same tick, so a few points either side
  // would be in the wrong dimension (Overworld coordinates in the Nether, the stronghold's in The End): move each
  // change to the teleport itself (the nearest jump within 10 seconds)
  const d = out.d.split(""), jumps = [];
  for (let i = 1; i < d.length; i++) if (out.t[i] - out.t[i - 1] <= 2 && Math.hypot(out.x[i] - out.x[i - 1], out.z[i] - out.z[i - 1]) > 50) jumps.push(i);
  for (let k = 1; k < d.length; k++) {
    if (out.d[k] === out.d[k - 1]) continue;
    let j = null;
    for (const i of jumps) if (Math.abs(out.t[i] - out.t[k]) <= 100 && (j == null || Math.abs(i - k) < Math.abs(j - k))) j = i;
    if (j == null || j === k) continue;
    if (j < k) for (let i = j; i < k; i++) d[i] = out.d[k];
    else for (let i = k; i < j; i++) d[i] = out.d[k - 1];
  }
  out.d = d.join("");
  return out;
}


// When the player was deep in the Nether (below DEEP: where debris is mined, under the lava sea), from readGhost's
// path: an IGT (ms) every 5 seconds or so while there (splits.js: a Nether trip spent down there is Debris)
const DEEP = 25;
export function deepTimes(path) {
  const out = [];
  if (!path || !path.t) return out;
  for (let i = 0; i < path.t.length; i++) if (path.d[i] === "n" && path.y && path.y[i] < DEEP) {
    const t = path.t[i] * 100;
    if (!out.length || t - out[out.length - 1] >= 5000) out.push(t);
  }
  return out;
}

// The first time in the outer End: the gateway's teleport, past the central island (it's ~1000 blocks out; the island
// is ~200 across). More exact than the log: Remote Getaway isn't given for a pearl through the gateway, and the biome
// lines (Hermes 0.14+) come a few seconds late. IGT ms, or null.
export function outerEndTime(path) {
  if (!path || !path.t) return null;
  for (let i = 0; i < path.t.length; i++) if (path.d[i] === "e" && Math.hypot(path.x[i], path.z[i]) > 500) return path.t[i] * 100;
  return null;
}

// Getting back to the Endgame base, for each campfire (set up with the bees; often on the Nether side of the base's
// portal): back from the campfire as long as they were within BASE blocks of it (Overworld blocks: the Nether's times
// 8), over trips away of up to AWAY, up to BASE_BACK before; then the first time on that stretch they're in the
// Overworld within LAND blocks of the base (where they were in the Overworld closest in time to the campfire) and
// slowing down (out of the portal, or landed). [[campfire, arrived]]
const BASE = 400, BASE_BACK = 15 * 60000, AWAY = 60000, LAND = 64, SLOW = 5;   // SLOW: blocks a second
const eqAt = (path, i) => path.d[i] === "n" ? [path.x[i] * 8, path.z[i] * 8] : path.d[i] === "o" ? [path.x[i], path.z[i]] : null;
const pointAt = (path, t) => { let i = -1; for (let k = 0; k < path.t.length && path.t[k] * 100 <= t; k++) i = k; return i; };
export function baseArrivals(path, times) {
  const out = [];
  if (!path || !path.t || !times) return out;
  const near = (i, at) => { const p = eqAt(path, i); return p && Math.hypot(p[0] - at[0], p[1] - at[1]) <= BASE; };
  for (const t of times) {
    const i = pointAt(path, t), at = i >= 0 ? eqAt(path, i) : null; if (!at) continue;
    let j = i, k = i;
    while (k > 0 && t - path.t[k - 1] * 100 <= BASE_BACK) {
      k--;
      if (near(k, at)) j = k; else if (path.t[j] * 100 - path.t[k] * 100 > AWAY) break;
    }
    let o = -1;
    for (let k = i; k >= j && o < 0; k--) if (path.d[k] === "o") o = k;
    for (let k = i; k < path.t.length && o < 0 && path.t[k] * 100 - t <= 2 * 60000; k++) if (path.d[k] === "o") o = k;
    const base = o >= 0 ? [path.x[o], path.z[o]] : at;
    let arrived = j;
    for (let a = j; a <= i; a++) {
      if (path.d[a] !== "o" || Math.hypot(path.x[a] - base[0], path.z[a] - base[1]) > LAND) continue;
      let b = a; while (b < path.t.length - 1 && path.t[b] - path.t[a] < 20) b++;
      const dt = (path.t[b] - path.t[a]) / 10;
      if (dt > 0 && path.d[b] === "o" && Math.hypot(path.x[b] - path.x[a], path.z[b] - path.z[a]) / dt <= SLOW) { arrived = a; break; }
    }
    out.push([t, path.t[arrived] * 100]);
  }
  return out;
}

// Done enchanting: after each enchanting-table pickup, the first time they're LEAVE blocks from where they picked it
// up (or change dimension); still there LEAVE_MAX later: the pickup. [[pickup, left]]; left is null while they're still there.
const LEAVE = 20, LEAVE_MAX = 10 * 60000;
export function enchLeaves(path, times) {
  const out = [];
  if (!path || !path.t || !times) return out;
  for (const t of times) {
    const i = pointAt(path, t); if (i < 0) continue;
    let left = null;
    for (let k = i + 1; k < path.t.length; k++) {
      if (path.t[k] * 100 - t > LEAVE_MAX) { left = t; break; }   // (stayed: done at the pickup)
      if (path.d[k] !== path.d[i] || Math.hypot(path.x[k] - path.x[i], path.z[k] - path.z[i]) > LEAVE) { left = path.t[k] * 100; break; }
    }
    out.push([t, left]);
  }
  return out;
}

// What the splits use from the ghost file, for a run's st: when they were deep in the Nether, when they got to the outer
// End, when they got to where each campfire was placed, and when they left each enchanting table (st: the run's, for its campfires)
export function ghostFacts(path, st) {
  const out = {deep: deepTimes(path)}, oe = outerEndTime(path);
  if (oe != null) out.outerEnd = oe;
  if (st && st.campfire && st.campfire.length) out.campArrive = baseArrivals(path, st.campfire);
  out.enchLeave = enchLeaves(path, st && st.ench);
  return out;
}

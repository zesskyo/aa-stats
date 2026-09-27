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
  return out.t.length ? out : null;
}

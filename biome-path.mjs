// Biomes along a run's ghost path, from its seed: for logs from Hermes before 0.14, which didn't log the biome the
// player was in (build.mjs then reads the log with these, as if Hermes had). Uses cubiomes (wasm/cubiomes.wasm), as the
// travel map's seed map does.
//   biomesFromPath(wasm, BIOMES, path, seed, mc) → [[igt (ms), biome name], …] each time it changes, or null
// path: readGhost's columns ({t: igt in seconds×10, d: "o"/"n"/"e" per point, x, z, y}); BIOMES: src/biomes.js'.
export async function biomesFromPath(wasm, BIOMES, path, seed, mc) {
  const version = /^1\.16\.1$/.test(mc || "") ? 19 : /^1\.16(\.|$)/.test(mc || "") ? 20 : null;   // cubiomes' MC_1_16_1 / MC_1_16_5
  const bits = seedBits(seed);
  if (!version || !bits || !path || !path.t || !path.t.length) return null;
  const {instance} = await WebAssembly.instantiate(wasm, {env: {cos: Math.cos, sin: Math.sin, exp: Math.exp, pow: Math.pow, log: Math.log, atan2: Math.atan2}});
  const w = instance.exports;
  const names = new Array(path.t.length).fill(null);
  // the Overworld's and the Nether's points (the End's biomes aren't needed: the checklist doesn't use them)
  for (const [dim, id] of [["o", 0], ["n", -1]]) {
    w.setup(version, bits.lo, bits.hi, id);
    for (let i = 0; i < path.t.length; i++) if (path.d[i] === dim) {
      const b = BIOMES[w.biomeAt(Math.floor(path.x[i]), Math.floor((path.y && path.y[i]) ?? 64), Math.floor(path.z[i]))];
      if (b) names[i] = b[0];
    }
  }
  const out = [];
  for (let i = 0; i < names.length; i++) if (names[i] && (!out.length || out[out.length - 1][1] !== names[i])) out.push([path.t[i] * 100, names[i]]);
  return out;
}

// Minecraft turns a seed that isn't a number into one with Java's String.hashCode (as seed-map.js)
function seedBits(s) {
  s = String(s == null ? "" : s).trim(); if (!s) return null;
  let v;
  if (/^-?\d+$/.test(s)) { v = BigInt(s); if (v < -(2n ** 63n) || v >= 2n ** 63n) v = null; }
  if (v == null) { let h = 0; for (const c of s) h = (Math.imul(31, h) + c.codePointAt(0)) | 0; v = BigInt(h); }
  v = BigInt.asUintN(64, v);
  return {lo: Number(v & 0xffffffffn), hi: Number(v >> 32n)};
}

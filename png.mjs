// Just enough PNG for the build (no packages): read an 8-bit RGBA PNG, and write one.
// Used to cut the item icons a site needs out of items/atlas.png.
import zlib from "node:zlib";

export function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let p = 8, w = 0, h = 0, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("only 8-bit RGBA, non-interlaced PNGs");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * 4), row = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1)), out = px.subarray(y * row, (y + 1) * row), up = y ? px.subarray((y - 1) * row, y * row) : null;
    for (let i = 0; i < row; i++) {
      const a = i >= 4 ? out[i - 4] : 0, b = up ? up[i] : 0, c = up && i >= 4 ? up[i - 4] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
  }
  return {w, h, px};
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type, "ascii"), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };

export function writePng({w, h, px}) {
  const row = w * 4, raw = Buffer.alloc(h * (row + 1));
  for (let y = 0; y < h; y++) {   // filter "sub" on every row (small for pixel art)
    raw[y * (row + 1)] = 1;
    for (let i = 0; i < row; i++) raw[y * (row + 1) + 1 + i] = (px[y * row + i] - (i >= 4 ? px[y * row + i - 4] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, {level: 9})), chunk("IEND", Buffer.alloc(0))]);
}

// copy size×size squares: from the atlas squares `from`, into a new atlas `cols` wide
export function pickSquares(atlas, size, cols, from) {
  const out = {w: cols * size, h: Math.max(1, Math.ceil(from.length / cols)) * size};
  out.px = Buffer.alloc(out.w * out.h * 4);
  const acols = atlas.w / size;
  from.forEach((k, n) => {
    const sx = (k % acols) * size, sy = Math.floor(k / acols) * size, dx = (n % cols) * size, dy = Math.floor(n / cols) * size;
    for (let y = 0; y < size; y++) atlas.px.copy(out.px, ((dy + y) * out.w + dx) * 4, ((sy + y) * atlas.w + sx) * 4, ((sy + y) * atlas.w + sx + size) * 4);
  });
  return out;
}

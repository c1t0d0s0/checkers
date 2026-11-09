// Generates favicon.ico (16/32/48) and apple-touch-icon.png (180) with no dependencies.
// Usage: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ PNG ---
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- drawing ---
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// Crown outline (same shape as the in-game SVG, 64-unit box).
const CROWN = [[10, 46], [6, 20], [20, 32], [32, 14], [44, 32], [58, 20], [54, 46]];
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inCrown(x, y, cx, cy, size) {
  // Map to the 64-unit crown box centred at (32, 34.5).
  const u = (x - cx) / size * 64 + 32;
  const v = (y - cy) / size * 64 + 34.5;
  if (u >= 10 && u <= 54 && v >= 49 && v <= 55) return true;
  return inPoly(u, v, CROWN);
}

// Colour at (x, y) in unit coordinates. Returns [r, g, b, a].
function shade(x, y, rounded) {
  // Background: walnut with grain.
  let a = 1;
  if (rounded) {
    const r = 0.2;
    const dx = Math.max(r - x, 0, x - (1 - r));
    const dy = Math.max(r - y, 0, y - (1 - r));
    if (dx * dx + dy * dy > r * r) a = 0;
  }
  const grain = 0.5 + 0.5 * Math.sin((x * 2.2 + 0.05 * Math.sin(y * 4.5) + 0.012 * Math.sin(y * 17)) * 34);
  let col = mix(hex('#6a3e20'), hex('#4f2b14'), grain * 0.6);
  col = mix(col, [0, 0, 0], clamp01((y - 0.4) * 0.35));

  const cx = 0.5, cy = 0.49, R = 0.37;
  // Drop shadow.
  const ds = Math.hypot(x - cx, y - (cy + 0.045));
  if (ds < R * 1.04) col = mix(col, [0.08, 0.04, 0.02], 0.75);
  // Disc edge (thickness).
  const de = Math.hypot(x - cx, y - (cy + 0.028));
  if (de < R) col = hex('#a77d45');
  // Disc face.
  const d = Math.hypot(x - cx, y - cy);
  if (d < R) {
    const t = d / R;
    col = mix(hex('#fff3dc'), hex('#d8b682'), clamp01(t * 0.9 + (y - cy) * 0.8));
    // Highlight.
    const hl = Math.hypot(x - (cx - 0.12), y - (cy - 0.13));
    col = mix(col, [1, 1, 1], clamp01(0.45 - hl * 2.2));
    // Turned rings.
    if (Math.abs(t - 0.82) < 0.035) col = mix(col, hex('#8a6330'), 0.55);
    if (t > 0.95) col = mix(col, hex('#9b7440'), 0.6);
    // Crown.
    if (inCrown(x, y, cx, cy + 0.01, R * 1.25)) {
      const g = clamp01((y - (cy - 0.15)) / 0.3);
      col = mix(hex('#e9c35f'), hex('#a7741c'), g);
    }
  }
  return [...col, a];
}

function render(size, rounded) {
  const SS = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, rounded);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      const n = SS * SS;
      out[i + 3] = Math.round((a / n) * 255);
      if (a > 0) {
        out[i] = Math.round((r / a) * 255);
        out[i + 1] = Math.round((g / a) * 255);
        out[i + 2] = Math.round((b / a) * 255);
      }
    }
  }
  return encodePNG(size, size, out);
}

function encodeICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const ico = encodeICO([16, 32, 48].map((size) => ({ size, png: render(size, true) })));
writeFileSync(join(root, 'favicon.ico'), ico);
writeFileSync(join(root, 'apple-touch-icon.png'), render(180, false));
console.log('wrote favicon.ico and apple-touch-icon.png');

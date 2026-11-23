// THE WORLD TODAY — front page for Sunday 22 November 2026.
// Draws one 1024x1024 PNG with pure Node 22 standard library (no network,
// no randomness, no clock): two runs write byte-identical files.
// Stories are the day's verified news: COP31 collapse, Benghazi warship,
// Dymer flats, Cikande factory fire, US House 258, Liverpool 4-0 Man Utd,
// BepiColombo at Mercury, plus an In Brief column.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---- palette: warm newsprint -------------------------------------------
const PAPER: RGB = [248, 244, 233];
const INK: RGB = [22, 22, 22];
const RED: RGB = [163, 22, 33];
const BLUE: RGB = [29, 78, 137];
const DARKBLUE: RGB = [18, 48, 88];
const GOLD: RGB = [176, 132, 22];
const GREEN: RGB = [46, 110, 62];
const GREY: RGB = [96, 96, 92];
const LIGHTGREY: RGB = [214, 208, 192];
const SKY: RGB = [168, 205, 226];
const SEA: RGB = [38, 92, 138];
const ORANGE: RGB = [214, 96, 24];
const FLAME: RGB = [232, 164, 32];
const CREAM: RGB = [255, 252, 240];

type RGB = [number, number, number];

// ---- PNG encoder (RGB, 8-bit, filter 0, zlib level 9) -------------------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- canvas -------------------------------------------------------------
class Canvas {
  buf: Uint8Array;
  clipX0 = 0;
  clipY0 = 0;
  clipX1 = W;
  clipY1 = H;
  constructor() {
    this.buf = new Uint8Array(W * H * 3);
    this.fill(PAPER);
  }
  setClip(x: number, y: number, w: number, h: number): void {
    this.clipX0 = Math.max(0, x);
    this.clipY0 = Math.max(0, y);
    this.clipX1 = Math.min(W, x + w);
    this.clipY1 = Math.min(H, y + h);
  }
  resetClip(): void {
    this.clipX0 = 0;
    this.clipY0 = 0;
    this.clipX1 = W;
    this.clipY1 = H;
  }
  fill(c: RGB): void {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = c[0];
      this.buf[i * 3 + 1] = c[1];
      this.buf[i * 3 + 2] = c[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    if (x < this.clipX0 || y < this.clipY0 || x >= this.clipX1 || y >= this.clipY1) return;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(W, x + w);
    const y1 = Math.min(H, y + h);
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * W + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        this.buf[i] = c[0];
        this.buf[i + 1] = c[1];
        this.buf[i + 2] = c[2];
        i += 3;
      }
    }
  }
  frame(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  hline(x: number, y: number, w: number, c: RGB, t = 1): void {
    this.rect(x, y, w, t, c);
  }
  vline(x: number, y: number, h: number, c: RGB, t = 1): void {
    this.rect(x, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.px(cx + x, cy + y, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
    for (let a = 0; a < 720; a++) {
      const th = (a * Math.PI) / 360;
      for (let rr = r - t + 1; rr <= r; rr++) {
        this.px(Math.round(cx + rr * Math.cos(th)), Math.round(cy + rr * Math.sin(th)), c);
      }
    }
  }
  // filled triangle, vertices (x0,y0) (x1,y1) (x2,y2)
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minY = Math.max(0, Math.min(y0, y1, y2));
    const maxY = Math.min(H - 1, Math.max(y0, y1, y2));
    const edge = (ax: number, ay: number, bx: number, by: number, y: number): number =>
      ax + ((y - ay) * (bx - ax)) / (by - ay);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) xs.push(edge(x0, y0, x1, y1, y));
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) xs.push(edge(x1, y1, x2, y2, y));
      if ((y2 <= y && y < y0) || (y0 <= y && y < y2)) xs.push(edge(x2, y2, x0, y0, y));
      if (xs.length < 2) continue;
      const xa = Math.max(0, Math.floor(Math.min(xs[0], xs[1])));
      const xb = Math.min(W - 1, Math.ceil(Math.max(xs[0], xs[1])));
      for (let x = xa; x <= xb; x++) this.px(x, y, c);
    }
  }
  // deterministic paper grain: fixed-seed LCG dots, subtle
  grain(seed: number, count: number, c: RGB): void {
    let s = seed >>> 0;
    for (let i = 0; i < count; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const x = s % W;
      s = (s * 1664525 + 1013904223) >>> 0;
      const y = s % H;
      this.px(x, y, c);
    }
  }
}

// ---- 5x7 bitmap font: each glyph is 7 rows of 5 bits (bit 4 = left) -----
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  a: [0, 0, 14, 1, 15, 17, 15], b: [16, 16, 30, 17, 17, 17, 30],
  c: [0, 0, 14, 16, 16, 17, 14], d: [1, 1, 15, 17, 17, 17, 15],
  e: [0, 0, 14, 17, 31, 16, 14], f: [6, 8, 8, 30, 8, 8, 8],
  g: [0, 15, 17, 17, 15, 1, 14], h: [16, 16, 30, 17, 17, 17, 17],
  i: [4, 0, 12, 4, 4, 4, 14], j: [2, 0, 6, 2, 2, 18, 12],
  k: [16, 16, 18, 20, 24, 20, 18], l: [12, 4, 4, 4, 4, 4, 14],
  m: [0, 0, 26, 21, 21, 21, 21], n: [0, 0, 30, 17, 17, 17, 17],
  o: [0, 0, 14, 17, 17, 17, 14], p: [0, 0, 30, 17, 17, 30, 16],
  q: [0, 0, 15, 17, 17, 15, 1], r: [0, 0, 22, 25, 16, 16, 16],
  s: [0, 0, 15, 16, 14, 1, 30], t: [4, 4, 14, 4, 4, 4, 12],
  u: [0, 0, 17, 17, 17, 19, 13], v: [0, 0, 17, 17, 17, 10, 4],
  w: [0, 0, 17, 21, 21, 21, 10], x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 0, 17, 17, 15, 1, 14], z: [0, 0, 31, 2, 4, 8, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8], "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 10, 0, 0, 0, 0], "-": [0, 0, 0, 14, 0, 0, 0],
  "\u2014": [0, 0, 0, 31, 0, 0, 0], "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8], "/": [1, 1, 2, 2, 4, 8, 8],
  "%": [25, 25, 2, 4, 8, 19, 19], "&": [12, 18, 20, 8, 21, 18, 13],
  "+": [0, 4, 4, 14, 4, 4, 0], "=": [0, 0, 31, 0, 31, 0, 0],
  "*": [4, 21, 14, 21, 4, 0, 0], "#": [10, 10, 31, 10, 31, 10, 10],
  "@": [14, 17, 23, 21, 23, 16, 14], $: [4, 15, 20, 14, 5, 30, 4],
  "\u2022": [0, 0, 0, 14, 14, 0, 0],
};
const GLYPH_W = 5;
const GLYPH_H = 7;
const ADV = 6; // advance per char, in font units

function textWidth(s: string, scale: number): number {
  return s.length * ADV * scale - scale; // no trailing gap
}

// Draw one line of text. "\n" in s is handled by drawLines below.
function drawText(cv: Canvas, x: number, y: number, s: string, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < GLYPH_H; r++) {
      const row = g[r];
      for (let col = 0; col < GLYPH_W; col++) {
        if (row & (1 << (4 - col))) {
          cv.rect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += ADV * scale;
  }
}

// Draw possibly multi-line text; returns total height used.
function drawLines(cv: Canvas, x: number, y: number, s: string, scale: number, c: RGB, leading?: number): number {
  const lh = leading ?? Math.round(GLYPH_H * scale * 1.25);
  const lines = s.split("\n");
  lines.forEach((ln, i) => drawText(cv, x, y + i * lh, ln, scale, c));
  return lines.length * lh;
}

function centerText(cv: Canvas, cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(cv, Math.round(cx - textWidth(s, scale) / 2), y, s, scale, c);
}

// Greedy word wrap to maxWidth pixels at scale; keeps words whole.
function wrap(s: string, maxWidth: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (textWidth(test, scale) <= maxWidth || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawWrapped(cv: Canvas, x: number, y: number, s: string, maxWidth: number, scale: number, c: RGB, leading?: number): number {
  const lines = wrap(s, maxWidth, scale);
  return drawLines(cv, x, y, lines.join("\n"), scale, c, leading);
}

// ---- illustrations (all drawn with primitives, deterministic) -------------
function artGlobe(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, SKY);
  cv.circle(x + w - 42, y + 30, 20, GOLD); // sun
  cv.circle(x + w - 42, y + 30, 14, FLAME);
  const cx = x + Math.floor(w * 0.42);
  const cy = y + Math.floor(h * 0.46);
  const r = Math.floor(Math.min(w, h) * 0.36);
  cv.circle(cx, cy, r, SEA); // earth
  // continents: green blobs
  cv.circle(cx - Math.floor(r * 0.4), cy - Math.floor(r * 0.25), Math.floor(r * 0.3), GREEN);
  cv.circle(cx + Math.floor(r * 0.35), cy + Math.floor(r * 0.3), Math.floor(r * 0.26), GREEN);
  cv.circle(cx + Math.floor(r * 0.15), cy - Math.floor(r * 0.45), Math.floor(r * 0.18), GREEN);
  // meridians: vertical + horizontal chords in pale blue
  for (const f of [-0.55, 0, 0.55]) {
    const dx = Math.floor(r * f);
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dx * dx)));
    cv.vline(cx + dx, cy - half, half * 2, [190, 220, 235], 2);
  }
  for (const f of [-0.5, 0.5]) {
    const dy = Math.floor(r * f);
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    cv.hline(cx - half, cy + dy, half * 2, [190, 220, 235], 2);
  }
  cv.ring(cx, cy, r, DARKBLUE, 3);
  // crack across the globe: jagged dark line
  let px = cx - r + 6;
  let py = cy - Math.floor(r * 0.2);
  for (let i = 0; i < 7; i++) {
    const nx = px + Math.floor((2 * r - 12) / 7);
    const ny = py + (i % 2 === 0 ? 12 : -12);
    cv.line(px, py, nx, ny, INK);
    cv.line(px, py + 1, nx, ny + 1, INK);
    px = nx;
    py = ny;
  }
  // factory silhouette at the foot of the globe
  const fy = y + h - 34;
  cv.rect(x + 14, fy, 64, 34, INK);
  cv.rect(x + 84, fy + 10, 44, 24, INK);
  cv.rect(x + 92, fy - 16, 8, 26, INK);
  cv.rect(x + 106, fy - 22, 8, 32, INK);
  cv.circle(x + 96, fy - 24, 6, GREY);
  cv.circle(x + 110, fy - 32, 8, GREY);
  cv.circle(x + 104, fy - 42, 6, LIGHTGREY);
}

function artShip(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, SKY);
  cv.circle(x + w - 30, y + 24, 14, GOLD);
  const seaY = y + Math.floor(h * 0.62);
  cv.rect(x, seaY, w, h - (seaY - y), SEA);
  for (let i = 0; i < 4; i++) {
    cv.hline(x + 12 + i * 30, seaY + 10 + i * 9, 46, [150, 190, 215], 2);
  }
  // warship: hull, deck, mast, funnel
  const hx = x + Math.floor(w * 0.14);
  const hy = seaY - 26;
  cv.tri(hx, hy + 22, hx + 26, hy, hx + Math.floor(w * 0.78), hy, DARKBLUE);
  cv.rect(hx + 26, hy, Math.floor(w * 0.78) - 26, 22, DARKBLUE);
  cv.rect(hx + 60, hy - 20, 66, 20, INK);
  cv.rect(hx + 132, hy - 34, 10, 34, INK);
  cv.line(hx + 137, hy - 34, hx + 137, hy - 52, INK);
  cv.rect(hx + 150, hy - 16, 26, 16, GREY);
  // blast starburst just above the deck (kept inside the art box)
  const bx = hx + 96;
  const by = hy - 16;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const ex = Math.round(bx + 19 * Math.cos(a));
    const ey = Math.round(by + 19 * Math.sin(a));
    cv.tri(bx, by, ex, ey, Math.round(bx + 6 * Math.cos(a + 0.5)), Math.round(by + 6 * Math.sin(a + 0.5)), i % 2 ? FLAME : ORANGE);
  }
  cv.circle(bx, by, 8, RED);
  cv.circle(bx - 22, by - 6, 6, GREY);
  cv.circle(bx + 20, by - 10, 7, GREY);
  cv.circle(bx + 30, by + 2, 5, LIGHTGREY);
}

function artFlats(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, SKY);
  const bx = x + Math.floor(w * 0.22);
  const bw = Math.floor(w * 0.56);
  const by = y + 34;
  const bh = h - 34;
  cv.rect(bx, by, bw, bh, [122, 128, 138]); // block
  // windows: 3 rows, kept inside the block (by..by+bh)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      cv.rect(bx + 10 + c * 22, by + 8 + r * 22, 12, 13, [38, 42, 48]);
    }
  }
  // broken top-right corner: sky-coloured bite + rubble
  cv.tri(bx + bw - 52, by, bx + bw, by, bx + bw, by + 46, SKY);
  cv.tri(bx + bw - 30, by + 20, bx + bw, by + 20, bx + bw, by + 46, SKY);
  cv.line(bx + bw - 52, by, bx + bw - 30, by + 20, INK);
  cv.line(bx + bw - 30, by + 20, bx + bw, by + 46, INK);
  // smoke from the break (kept inside the art box)
  cv.circle(bx + bw - 26, by - 8, 9, GREY);
  cv.circle(bx + bw - 42, by - 16, 11, GREY);
  cv.circle(bx + bw - 16, by - 22, 7, LIGHTGREY);
  // small flames at the break
  cv.tri(bx + bw - 46, by + 22, bx + bw - 38, by + 2, bx + bw - 30, by + 22, ORANGE);
  cv.tri(bx + bw - 40, by + 22, bx + bw - 34, by + 8, bx + bw - 28, by + 22, FLAME);
  // ground line at the building's base + second block behind
  cv.rect(x + 12, y + h - 5, w - 24, 3, INK);
  cv.rect(x + Math.floor(w * 0.78), y + 78, 34, h - 78, [150, 154, 160]);
}

function artFire(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [52, 46, 44]); // dusk sky
  cv.circle(x + 28, y + 26, 12, FLAME);
  const fy = y + h - 56;
  // factory with sawtooth roof
  cv.rect(x + 10, fy + 18, w - 20, 38, INK);
  for (let i = 0; i < 4; i++) {
    cv.tri(x + 10 + i * 26, fy + 18, x + 23 + i * 26, fy - 2, x + 36 + i * 26, fy + 18, INK);
  }
  cv.rect(x + w - 34, fy - 26, 10, 44, INK);
  cv.circle(x + w - 29, fy - 32, 7, GREY);
  cv.circle(x + w - 22, fy - 42, 9, GREY);
  // flames above the roof
  const flames: Array<[number, number, number, RGB]> = [
    [0.22, 46, 26, ORANGE], [0.38, 60, 30, RED], [0.55, 50, 26, ORANGE],
    [0.72, 66, 32, RED], [0.3, 30, 16, FLAME], [0.62, 34, 18, FLAME],
  ];
  for (const [f, fh, fw, c] of flames) {
    const fx = x + Math.floor(w * f);
    cv.tri(fx - fw / 2, fy + 18, fx, fy + 18 - fh, fx + fw / 2, fy + 18, c);
  }
  // lit windows
  for (let i = 0; i < 5; i++) cv.rect(x + 20 + i * 20, fy + 30, 10, 12, FLAME);
}

function artHouse(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, SKY);
  // small capitol dome, top centre
  const cx = x + Math.floor(w / 2);
  const domeY = y + 24;
  cv.circle(cx, domeY, 15, CREAM);
  cv.rect(cx - 15, domeY, 30, 4, CREAM);
  cv.rect(cx - 18, domeY + 4, 36, 5, INK);
  cv.rect(cx - 1, domeY - 20, 2, 6, INK);
  cv.circle(cx, domeY - 21, 3, GOLD);
  cv.rect(cx - 22, domeY + 9, 44, 4, INK);
  // bars: Democrats 258, Republicans 177 (House total 435)
  const bw = w - 96;
  const demW = Math.floor((bw * 258) / 435);
  const repW = Math.floor((bw * 177) / 435);
  const barY = y + h - 44;
  drawText(cv, x + 8, barY, "DEM", 2, BLUE);
  cv.rect(x + 52, barY, demW, 13, BLUE);
  drawText(cv, x + 52 + demW + 6, barY, "258", 2, BLUE);
  drawText(cv, x + 8, barY + 20, "REP", 2, RED);
  cv.rect(x + 52, barY + 20, repW, 13, RED);
  drawText(cv, x + 52 + repW + 6, barY + 20, "177", 2, RED);
}

function artScore(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [36, 110, 58]); // pitch
  cv.frame(x + 10, y + 10, w - 20, h - 20, CREAM, 2);
  cv.vline(x + Math.floor(w / 2), y + 10, h - 20, CREAM, 2);
  cv.ring(x + Math.floor(w / 2), y + Math.floor(h * 0.62), 18, CREAM, 2);
  // big score, clear of the centre circle
  centerText(cv, x + Math.floor(w / 2), y + 10, "4 - 0", 5, CREAM);
  drawText(cv, x + 16, y + h - 34, "LIV", 2, CREAM);
  drawText(cv, x + w - 52, y + h - 34, "MUN", 2, CREAM);
  // ball
  const bx = x + Math.floor(w * 0.5);
  const by = y + Math.floor(h * 0.8);
  cv.circle(bx, by, 16, CREAM);
  cv.circle(bx, by, 5, INK);
  cv.circle(bx - 10, by - 8, 3, INK);
  cv.circle(bx + 10, by - 8, 3, INK);
  cv.circle(bx - 10, by + 9, 3, INK);
  cv.circle(bx + 10, by + 9, 3, INK);
}

function artMercury(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [10, 16, 34]); // space
  const stars: Array<[number, number]> = [
    [0.08, 0.14], [0.2, 0.08], [0.34, 0.2], [0.62, 0.1], [0.8, 0.16],
    [0.9, 0.3], [0.12, 0.4], [0.88, 0.55], [0.06, 0.72], [0.94, 0.8],
  ];
  for (const [fx, fy] of stars) cv.rect(x + Math.floor(w * fx), y + Math.floor(h * fy), 2, 2, CREAM);
  // Mercury: cratered disc
  const cx = x + Math.floor(w * 0.46);
  const cy = y + Math.floor(h * 0.52);
  const r = Math.floor(Math.min(w, h) * 0.3);
  // orbit ring hugging the planet, kept inside the box
  cv.ring(cx, cy, r + 13, GOLD, 2);
  cv.circle(cx, cy, r, [196, 168, 138]);
  cv.circle(cx - Math.floor(r * 0.35), cy - Math.floor(r * 0.3), Math.floor(r * 0.22), [168, 140, 112]);
  cv.circle(cx + Math.floor(r * 0.3), cy + Math.floor(r * 0.2), Math.floor(r * 0.28), [168, 140, 112]);
  cv.circle(cx + Math.floor(r * 0.1), cy - Math.floor(r * 0.5), Math.floor(r * 0.14), [178, 150, 122]);
  cv.circle(cx - Math.floor(r * 0.55), cy + Math.floor(r * 0.35), Math.floor(r * 0.16), [178, 150, 122]);
  cv.ring(cx, cy, r, [120, 100, 80], 2);
  // probe on the orbit, top right of the ring
  const px = cx + Math.floor((r + 13) * 0.7);
  const py = cy - Math.floor((r + 13) * 0.7);
  cv.rect(px - 8, py - 5, 16, 10, GOLD);
  cv.rect(px - 22, py - 2, 12, 4, CREAM);
  cv.rect(px + 10, py - 2, 12, 4, CREAM);
  cv.line(px - 8, py - 5, px - 2, py - 14, GOLD);
}

// ---- layout -------------------------------------------------------------
const MX = 24; // side margin
const RX = 1000; // right edge

function masthead(cv: Canvas): void {
  cv.rect(0, 0, W, 8, INK);
  centerText(cv, 512, 26, "THE WORLD TODAY", 6, INK);
  cv.hline(MX, 84, RX - MX, INK, 2);
  drawText(cv, MX, 92, "SUNDAY, 22 NOVEMBER 2026", 2, INK);
  const right = "ONE DAY \u2014 ONE PAGE";
  drawText(cv, RX - textWidth(right, 2), 92, right, 2, INK);
  cv.hline(MX, 112, RX - MX, INK, 4);
}

function leadStory(cv: Canvas): void {
  const y = 126;
  drawText(cv, MX, y, "CLIMATE \u2014 ANTALYA, TURKEY", 2, RED);
  drawLines(cv, MX, y + 24, "COP31 TALKS\nCOLLAPSE WITH\nNO DEAL", 4, INK, 36);
  drawWrapped(
    cv, MX, y + 140,
    "The climate summit ends two days late with no deal. Its draft text drops every mention of fossil fuels, and the UN chief says he is deeply disappointed.",
    612, 2, INK, 19,
  );
  cv.setClip(656, y, 344, 206);
  artGlobe(cv, 656, y, 344, 206);
  cv.resetClip();
  cv.frame(656, y, 344, 206, INK, 2);
}

function storyCard(
  cv: Canvas, x: number, y: number, w: number, artH: number,
  kicker: string, headline: string, deck: string,
  art: (cv: Canvas, x: number, y: number, w: number, h: number) => void,
): void {
  drawText(cv, x, y, kicker, 2, RED);
  const ay = y + 22;
  cv.setClip(x, ay, w, artH);
  art(cv, x, ay, w, artH);
  cv.resetClip();
  cv.frame(x, ay, w, artH, INK, 2);
  drawLines(cv, x, ay + artH + 10, headline, 3, INK, 26);
  drawWrapped(cv, x, ay + artH + 10 + 52 + 4, deck, w, 2, INK, 17);
}

function rowA(cv: Canvas): void {
  const y = 356;
  const w = 314;
  storyCard(cv, 24, y, w, 104, "CONFLICT \u2014 BENGHAZI", "WARSHIP HIT\nAT BENGHAZI",
    "A suspected Ukrainian sea drone hits a Russian warship at Benghazi.", artShip);
  storyCard(cv, 354, y, w, 104, "WAR IN UKRAINE \u2014 DYMER", "DRONE HITS\nFLATS NEAR KYIV",
    "Three killed and 14 missing as a Russian drone wrecks a five-storey block.", artFlats);
  storyCard(cv, 684, y, w, 104, "DISASTER \u2014 INDONESIA", "FIRE AT CANDY\nFACTORY",
    "Three dead and 34 missing after a fire at a candy factory in Cikande.", artFire);
}

function rowB(cv: Canvas): void {
  const y = 616;
  const w = 314;
  storyCard(cv, 24, y, w, 86, "POLITICS \u2014 WASHINGTON", "DEMOCRATS WIN\nHOUSE, 258 SEATS",
    "A recount win seals the largest Democratic House majority since 1992.", artHouse);
  storyCard(cv, 354, y, w, 86, "SPORT \u2014 ANFIELD", "LIVERPOOL 4,\nUNITED 0",
    "Pochettino's first game ends in a rout. Yoro sent off in 8 minutes.", artScore);
  storyCard(cv, 684, y, w, 86, "SPACE \u2014 MERCURY", "PROBE ENTERS\nORBIT AT MERCURY",
    "The European-Japanese probe reaches Mercury after its long cruise.", artMercury);
}

function inBrief(cv: Canvas): void {
  const y = 860;
  drawText(cv, MX, y, "IN BRIEF", 2, RED);
  cv.hline(MX, y + 18, RX - MX, INK, 2);
  const left: string[] = [
    "CHESS: Gukesh v Sindarov in Geneva.",
    "MARKETS: Stocks fall in AI sell-off.",
    "MEXICO: Cartel boss caught, 11 die.",
    "CHINA: Margin deposits cut to 80%.",
    "GULF: Bahrain hit; two tankers struck.",
  ];
  const right: string[] = [
    "SWIM: Pugh swims the Strait of Hormuz.",
    "WEST BANK: Settlers torch 12 vehicles.",
    "TREE: Trafalgar spruce felled in Norway.",
    "FOOTBALL: Hull stun Brighton 2-0.",
  ];
  const drawCol = (items: string[], x: number): void => {
    items.forEach((t, i) => {
      const ty = y + 28 + i * 18;
      cv.rect(x, ty + 5, 5, 5, RED);
      drawText(cv, x + 12, ty, t, 2, INK);
    });
  };
  drawCol(left, MX);
  drawCol(right, 520);
  cv.hline(MX, 992, RX - MX, INK, 2);
  drawText(cv, MX, 1002, "SOURCES: REUTERS, AP, SKY SPORTS, LIVERPOOL FC", 2, GREY);
  const pg = "PAGE 1";
  drawText(cv, RX - textWidth(pg, 2), 1002, pg, 2, GREY);
}

function main(): void {
  const cv = new Canvas();
  cv.grain(20261122, 4000, [233, 228, 212]);
  masthead(cv);
  leadStory(cv);
  cv.hline(MX, 344, RX - MX, INK, 2);
  rowA(cv);
  cv.hline(MX, 604, RX - MX, INK, 2);
  rowB(cv);
  cv.hline(MX, 848, RX - MX, INK, 2);
  inBrief(cv);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outDir + "/entry.png", encodePNG(cv.buf, W, H));
}

main();

// Generates build/icon.png (512x512): a school building on the app's navy background.
// Run with `node scripts/make-icon.cjs`. electron-builder converts it to the Windows .ico.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const S = 512;
const px = new Uint8Array(S * S * 4);
const NAVY = [30, 58, 138];
const WHITE = [255, 255, 255];
const GOLD = [250, 204, 21];

function set(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

// Rounded square background.
const R = 96;
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const cx = Math.min(Math.max(x, R), S - 1 - R);
    const cy = Math.min(Math.max(y, R), S - 1 - R);
    if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) set(x, y, NAVY);
  }

const rect = (x0, y0, x1, y1, c) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c);
};

// Roof (triangle).
for (let y = 120; y < 230; y++) {
  const half = ((y - 120) / 110) * 190;
  for (let x = Math.round(256 - half); x <= Math.round(256 + half); x++) set(x, y, WHITE);
}
// Building body.
rect(96, 228, 416, 400, WHITE);
// Windows and door (navy cut-outs).
rect(126, 260, 186, 312, NAVY);
rect(326, 260, 386, 312, NAVY);
rect(126, 336, 186, 380, NAVY);
rect(326, 336, 386, 380, NAVY);
rect(222, 300, 290, 400, NAVY);
// Round window in the roof.
for (let y = 150; y < 230; y++) for (let x = 216; x < 296; x++) if ((x - 256) ** 2 + (y - 190) ** 2 <= 26 * 26) set(x, y, NAVY);
// Flag pole and flag.
rect(252, 70, 260, 122, WHITE);
rect(260, 70, 310, 100, GOLD);
// Ground line.
rect(76, 400, 436, 416, WHITE);

// PNG encoding.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`wrote ${out}`);

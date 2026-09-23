/**
 * Generates icons/icon{16,32,48,128}.png: a blue rounded tile with a white
 * document and three text lines. Written by hand so the repo needs no image
 * tooling. Run: node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixelAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded rectangle; negative inside. */
function roundedRect(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - halfW + radius;
  const dy = Math.abs(y - cy) - halfH + radius;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

const BLUE = [37, 99, 235];
const WHITE = [255, 255, 255];
const LINE = [147, 197, 253];

function iconPixel(size) {
  const s = size;
  return (px, py) => {
    const x = px + 0.5;
    const y = py + 0.5;

    const tile = roundedRect(x, y, s / 2, s / 2, s / 2, s / 2, s * 0.22);
    if (tile > 0.5) return [0, 0, 0, 0];
    const tileAlpha = Math.min(1, 0.5 - tile);

    // Document sheet
    const sheet = roundedRect(x, y, s / 2, s / 2, s * 0.26, s * 0.34, s * 0.05);
    // Text lines on the sheet
    const lineH = s * 0.05;
    const lines = [0.38, 0.5, 0.62].map((frac) => roundedRect(x, y, s / 2, s * frac, s * 0.16, lineH / 2, lineH / 2));
    const shortLine = roundedRect(x, y, s * 0.44, s * 0.74, s * 0.10, lineH / 2, lineH / 2);
    const inLine = Math.min(...lines, shortLine) <= 0.5;

    let colour = BLUE;
    if (sheet <= 0.5) colour = inLine && s >= 32 ? LINE : WHITE;
    if (sheet <= 0.5 && inLine && s < 32) colour = BLUE;

    return [...colour, Math.round(255 * tileAlpha)];
  };
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(OUT, `icon${size}.png`), encodePng(size, iconPixel(size)));
  console.log(`wrote icons/icon${size}.png`);
}

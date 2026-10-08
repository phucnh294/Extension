// Draws the extension icon (Markdown mark on a rounded blue tile) into PNGs without dependencies.
import { deflateSync, crc32 } from 'node:zlib';

// "M" and "↓" of the Markdown mark (https://github.com/dcurtis/markdown-mark), 208×128 coordinate space.
const GLYPHS = [
  [[30, 98], [30, 30], [50, 30], [70, 55], [90, 30], [110, 30], [110, 98], [90, 98], [90, 59], [70, 84], [50, 59], [50, 98]],
  [[155, 98], [125, 65], [145, 65], [145, 30], [165, 30], [165, 65], [185, 65]],
];
const GLYPH_BOX = { x: 30, y: 30, w: 155, h: 68 };
const BG = [9, 105, 218]; // #0969da (Readown); Docdown passes its own colour
const FG = [255, 255, 255];

function insidePolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function insideRoundedRect(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 && x >= 0 && y >= 0 && x <= size && y <= size;
}

function drawIcon(size, bgColor = BG) {
  const SS = 4; // 4×4 supersampling
  const margin = size <= 16 ? 0 : size * 0.06; // store guideline: 128px icon has ~16px transparent padding
  const tile = size - margin * 2;
  const radius = tile * 0.22;
  const scale = (tile * 0.78) / GLYPH_BOX.w;
  const ox = size / 2 - (GLYPH_BOX.x + GLYPH_BOX.w / 2) * scale;
  const oy = size / 2 - (GLYPH_BOX.y + GLYPH_BOX.h / 2) * scale;
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (!insideRoundedRect(x - margin, y - margin, tile, radius)) continue;
          bg++;
          const gx = (x - ox) / scale;
          const gy = (y - oy) / scale;
          if (GLYPHS.some((poly) => insidePolygon(gx, gy, poly))) fg++;
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      const f = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(bgColor[c] * (1 - f) + FG[c] * f);
      rgba[i + 3] = Math.round((bg / n) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Windows .ico holding PNG-compressed images (supported since Windows Vista). */
export function encodeIco(pngsBySize) {
  const entries = Object.entries(pngsBySize).map(([size, png]) => [Number(size), png]);
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(([size, png], i) => {
    const at = 6 + i * 16;
    header[at] = size >= 256 ? 0 : size;
    header[at + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4); // colour planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map(([, png]) => png)]);
}

/** options.bg: tile colour as [r, g, b] (default Readown blue). */
export function generateIcons(sizes = [16, 32, 48, 128], options = {}) {
  return Object.fromEntries(sizes.map((size) => [size, drawIcon(size, options.bg)]));
}

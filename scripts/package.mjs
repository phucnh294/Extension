// Zips an extension folder into dist/<name>-<version>.zip for upload to the Chrome Web Store.
// Usage: node scripts/package.mjs [--ext extension|docdown]   (default: extension = Readown)
// Plain zip writer (deflate + CRC32 from node:zlib), so no extra dependency is needed.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const extArg = process.argv.indexOf('--ext');
const EXT = join(ROOT, extArg > 0 ? process.argv[extArg + 1] : 'extension');
const EXCLUDE = [/^\./, /\.map$/, /^Thumbs\.db$/i, /^desktop\.ini$/i];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (EXCLUDE.some((re) => re.test(name))) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
const files = walk(EXT).sort();
const locals = [];
const centrals = [];
let offset = 0;
const { time, day } = dosDateTime(new Date());

for (const file of files) {
  const name = Buffer.from(relative(EXT, file).split(sep).join('/'), 'utf8');
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + packed.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist', `${manifest.short_name.toLowerCase()}-${manifest.version}.zip`);
writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`package: ${relative(ROOT, out)} (${files.length} files)`);

// Build helpers shared by every extension in this repo (Readown: extension/, Docdown: docdown/).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIcons } from './icons.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const NM = join(ROOT, 'node_modules');

export function fail(message) {
  console.error(`build: ${message}`);
  process.exit(1);
}

/** Copies [from (node_modules-relative), to (vendor-relative)] pairs into <ext>/vendor (wiped first). */
export function copyVendor(extDir, copies) {
  const vendor = join(extDir, 'vendor');
  rmSync(vendor, { recursive: true, force: true });
  mkdirSync(join(vendor, 'licenses'), { recursive: true });
  for (const [from, to] of copies) {
    const src = join(NM, from);
    if (!existsSync(src)) fail(`missing ${src} — run "npm install" first`);
    mkdirSync(dirname(join(vendor, to)), { recursive: true });
    cpSync(src, join(vendor, to));
  }
  return vendor;
}

export function writeIcons(extDir, options) {
  mkdirSync(join(extDir, 'icons'), { recursive: true });
  for (const [size, png] of Object.entries(generateIcons(undefined, options))) {
    writeFileSync(join(extDir, 'icons', `icon${size}.png`), png);
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Checks what Chrome and the Web Store would reject: files the manifest references, Unicode
 * noncharacters in scripts (Chrome: "isn't UTF-8 encoded"), name ≤ 75 and description ≤ 132 chars.
 */
export function validateExtension(extDir) {
  const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
  const referenced = [
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    manifest.action?.default_popup,
    manifest.options_page,
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
  ].filter(Boolean);
  for (const file of referenced) {
    if (!existsSync(join(extDir, file))) fail(`${relative(ROOT, extDir)}: manifest references missing file: ${file}`);
  }
  for (const file of walk(extDir).filter((f) => f.endsWith('.js'))) {
    for (const ch of readFileSync(file, 'utf8')) {
      const cp = ch.codePointAt(0);
      if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe) {
        fail(`${relative(ROOT, file)} contains noncharacter U+${cp.toString(16).toUpperCase()}; write it as an escape sequence`);
      }
    }
  }
  for (const locale of readdirSync(join(extDir, '_locales'))) {
    const messages = JSON.parse(readFileSync(join(extDir, '_locales', locale, 'messages.json'), 'utf8'));
    if (messages.extName.message.length > 75) fail(`${locale}: extName longer than 75 characters`);
    if (messages.extDescription.message.length > 132) fail(`${locale}: extDescription longer than 132 characters`);
  }
  return manifest;
}

// Declared image dimensions must describe the real file: a wrong aspect ratio distorts the picture and
// costs CLS, which is what the width/height attributes are there to prevent.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Intrinsic size of a WebP, PNG or JPEG, read from the file's own header. */
function dimensions(file) {
  const d = readFileSync(file);
  if (d.subarray(0, 4).toString('latin1') === 'RIFF' && d.subarray(8, 12).toString('latin1') === 'WEBP') {
    const kind = d.subarray(12, 16).toString('latin1');
    if (kind === 'VP8X') return [d.readUIntLE(24, 3) + 1, d.readUIntLE(27, 3) + 1];
    if (kind === 'VP8 ') {
      const i = d.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
      return [d.readUInt16LE(i + 3) & 0x3fff, d.readUInt16LE(i + 5) & 0x3fff];
    }
    if (kind === 'VP8L') {
      const n = d.readUInt32LE(21);
      return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1];
    }
  }
  if (d.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return [d.readUInt32BE(16), d.readUInt32BE(20)];
  if (d[0] === 0xff && d[1] === 0xd8) {
    for (let i = 2; i < d.length; ) {
      if (d[i] !== 0xff) { i += 1; continue; }
      const marker = d[i + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return [d.readUInt16BE(i + 7), d.readUInt16BE(i + 5)];
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + d.readUInt16BE(i + 2);
    }
  }
  return null;
}

const images = htmlFiles(PUBLIC).flatMap((file) => {
  const rel = relative(PUBLIC, file).split(sep).join('/');
  return [...readFileSync(file, 'utf8').matchAll(/<img[^>]+>/g)].map((m) => ({ rel, tag: m[0] }));
});

// the boundary matters: without it `data-alt` would pass as `alt`
const attr = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];

describe('images', () => {
  it('there are images to check', () => {
    expect(images.length).toBeGreaterThan(20);
  });

  it('declared width and height keep the file\'s aspect ratio', () => {
    for (const { rel, tag } of images) {
      const src = attr(tag, 'src');
      const w = Number(attr(tag, 'width'));
      const h = Number(attr(tag, 'height'));
      if (!src || src.startsWith('http') || !w || !h) continue;
      const file = join(PUBLIC, src.replace(/^\//, ''));
      if (!existsSync(file)) continue; // a missing file is tests/links.test.js's business
      const real = dimensions(file);
      expect(real, `${rel}: cannot read the size of ${src}`).not.toBeNull();
      const declared = w / h;
      const actual = real[0] / real[1];
      expect(Math.abs(declared - actual) / actual,
        `${rel}: ${src} is ${real[0]}×${real[1]} but declared ${w}×${h}`).toBeLessThan(0.01);
    }
  });

  it('every image has alt text', () => {
    for (const { rel, tag } of images) {
      expect(attr(tag, 'alt'), `${rel}: ${attr(tag, 'src')}`).toBeDefined();
    }
  });
});

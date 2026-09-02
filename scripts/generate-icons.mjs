// Generates PWA icons from an inline SVG (requires sharp, a Next.js dependency).
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve("public/icons");
mkdirSync(out, { recursive: true });

function svg(size, maskable) {
  const r = maskable ? 0 : Math.round(size * 0.22);
  const pad = maskable ? size * 0.1 : 0;
  const inner = size - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#0f172a"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${maskable ? 0 : r}" fill="#0f172a"/>
  <rect x="${size * 0.26}" y="${size * 0.30}" width="${size * 0.48}" height="${size * 0.09}" rx="${size * 0.045}" fill="#6366f1"/>
  <rect x="${size * 0.26}" y="${size * 0.455}" width="${size * 0.34}" height="${size * 0.09}" rx="${size * 0.045}" fill="#a5b4fc"/>
  <rect x="${size * 0.26}" y="${size * 0.61}" width="${size * 0.48}" height="${size * 0.09}" rx="${size * 0.045}" fill="#e0e7ff"/>
</svg>`;
}

await sharp(Buffer.from(svg(192, false))).png().toFile(resolve(out, "icon-192.png"));
await sharp(Buffer.from(svg(512, false))).png().toFile(resolve(out, "icon-512.png"));
await sharp(Buffer.from(svg(512, true))).png().toFile(resolve(out, "icon-512-maskable.png"));
await sharp(Buffer.from(svg(180, false))).png().toFile(resolve(out, "apple-touch-icon.png"));
await sharp(Buffer.from(svg(64, false))).png().toFile(resolve("public/favicon.png"));
console.log("icons generated");

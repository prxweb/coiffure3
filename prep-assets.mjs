// prep-assets.mjs — standing asset pipeline (run `npm install` once for sharp).
// Replaces the one-off scripts previously written per build.
//
// Usage:
//   node prep-assets.mjs photos <srcDir> [outDir=photos] [maxPx=1500] [q=82]
//       Optimize every jpg/png in srcDir for web (fit inside maxPx, EXIF-rotated).
//   node prep-assets.mjs hero <srcFile> [out=photos/hero.jpg] [w=2000] [h=1200]
//       Wide cover-crop for the hero background.
//   node prep-assets.mjs menu <srcDir> [outDir=menu] [inset=4] [q=88]
//       Menu-page screenshots -> menu-1..N.jpg, trimming `inset` px from every
//       edge (kills thin scan/screenshot border lines), sorted naturally.
//   node prep-assets.mjs logo-colors <file> [bgHex]
//       Print background + dominant ink colors (pick brand hexes from these).
//       Read-only.
//   node prep-assets.mjs logo-inspect <file>
//       Report what a logo file ACTUALLY contains: alpha coverage, dimensions and
//       the ink bounding box (how much of the canvas is transparent padding).
//       Read-only. Run this BEFORE assuming a logo needs processing — a flattened
//       image-viewer preview is not evidence of an opaque background.
//
// ---------------------------------------------------------------------------
// The two commands below REWRITE a client's logo. Per CLAUDE.md > Brand Assets,
// a provided logo file is never to be modified unless the user explicitly asks.
// They therefore refuse to run without the `--asked` flag. Before reaching for
// them: run `logo-inspect` (the background is often already transparent), and if
// the logo merely sits or scales badly, fix that in CSS — negative margins to
// discount transparent canvas padding — not by editing the file.
// ---------------------------------------------------------------------------
//   node prep-assets.mjs logo-knockout <file> <out.png> [width] [cropPct] --asked
//       Knock a flat/gradient neutral background off a FULL-COLOUR logo (keeps the
//       original inks, unlike logo-duotone). A pixel is kept when it is coloured
//       (saturation ramp) or near-black (outline ramp); the soft grey/glow between
//       is dropped, then the result is trimmed and resized to `width`.
//       cropPct = "top,bottom" in percent of the trimmed height, to lift a sub-mark
//       (e.g. "0,58" for just the emblem above a wordmark).
//       NOTE: the trim step eats soft glows, and the alpha ramp rewrites every
//       anti-aliased edge — not just the background.
//   node prep-assets.mjs logo-duotone <file> <out.png> <frontHex> <offsetHex> [bgHex] --asked
//       Knock out the background (auto-detected from corners, or bgHex), split the
//       ink into its two dominant layers (auto-detected) and recolor them
//       front/offset. Pass the same hex twice for a one-color knockout. Pass bgHex
//       explicitly when an ink layer is close to the background color (e.g. a white
//       drop-shadow on a cream background). This RECOLOURS the client's mark.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

let sharp;
try { sharp = createRequire(import.meta.url)('sharp'); }
catch { console.error('sharp not installed — run: npm install'); process.exit(1); }

const [cmd, ...rawArgs] = process.argv.slice(2);
// `--asked` is a confirmation flag, never a positional argument
const asked = rawArgs.includes('--asked');
const args = rawArgs.filter(a => a !== '--asked');

// Guard: commands that rewrite a client's logo. See CLAUDE.md > Brand Assets.
const MUTATES_LOGO = { 'logo-knockout': 'knocks out the background', 'logo-duotone': 'knocks out the background AND recolours the ink' };
if (MUTATES_LOGO[cmd] && !asked) {
  console.error(`refusing to run '${cmd}' — it ${MUTATES_LOGO[cmd]} of a provided logo.

Per CLAUDE.md > Brand Assets, a client's logo file is not modified unless the
user explicitly asks for it. Reference the supplied file directly instead.

First check what the file actually contains:
    node prep-assets.mjs logo-inspect <file>
Backgrounds are often already transparent. If the logo only sits or scales
badly, fix that in CSS (negative margins to discount transparent padding).

If the user did ask for this, re-run with --asked.`);
  process.exit(1);
}
const hex = s => { const m = /^#?([0-9a-f]{6})$/i.exec(s || ''); if (!m) throw new Error('bad hex: ' + s); const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const toHex = c => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const listImages = dir => fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort(naturalSort);
const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + 'KB';

if (cmd === 'photos') {
  const [srcDir, outDir = 'photos', maxPx = '1500', q = '82'] = args;
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of listImages(srcDir)) {
    const slug = path.parse(f).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const out = path.join(outDir, slug + '.jpg');
    await sharp(path.join(srcDir, f)).rotate()
      .resize({ width: +maxPx, height: +maxPx, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: +q, mozjpeg: true }).toFile(out);
    console.log(out, kb(out));
  }
} else if (cmd === 'hero') {
  const [srcFile, out = 'photos/hero.jpg', w = '2000', h = '1200'] = args;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(srcFile).rotate().resize({ width: +w, height: +h, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80, mozjpeg: true }).toFile(out);
  console.log(out, kb(out));
} else if (cmd === 'menu') {
  const [srcDir, outDir = 'menu', inset = '4', q = '88'] = args;
  fs.mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const f of listImages(srcDir)) {
    n++;
    const src = path.join(srcDir, f);
    const meta = await sharp(src).metadata();
    const out = path.join(outDir, `menu-${n}.jpg`);
    await sharp(src)
      .extract({ left: +inset, top: +inset, width: meta.width - inset * 2, height: meta.height - inset * 2 })
      .flatten({ background: '#e8e0d8' })
      .jpeg({ quality: +q, mozjpeg: true }).toFile(out);
    console.log(out, `${meta.width - inset * 2}x${meta.height - inset * 2}`, kb(out));
  }
} else if (cmd === 'logo-knockout') {
  const [srcFile, out, width = '1200', cropPct] = args;
  if (!srcFile || !out) { console.error('usage: logo-knockout <file> <out.png> [width] [top,bottom]'); process.exit(1); }
  const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  // keep = coloured ink OR near-black outline; the neutral bg and its soft glow go.
  const SAT_LO = 34, SAT_HI = 62, DARK_HI = 112, DARK_LO = 82;
  const ramp = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const buf = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const V = Math.max(r, g, b), sat = V - Math.min(r, g, b);
    const a = Math.max(ramp(sat, SAT_LO, SAT_HI), ramp(V, DARK_HI, DARK_LO));
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = Math.round(a * (data[i + 3] / 255) * 255);
  }
  let img = sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png();
  let png = await sharp(await img.toBuffer()).trim({ threshold: 2 }).png().toBuffer();
  if (cropPct) {
    const [t, b] = cropPct.split(',').map(Number);
    const m = await sharp(png).metadata();
    const top = Math.round(m.height * t / 100), bottom = Math.round(m.height * b / 100);
    // extract and trim must be separate pipelines — sharp reorders them otherwise
    png = await sharp(png).extract({ left: 0, top, width: m.width, height: bottom - top }).png().toBuffer();
    png = await sharp(png).trim({ threshold: 2 }).png().toBuffer();
  }
  await sharp(png).resize({ width: +width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(out);
  const m = await sharp(out).metadata();
  console.log(out, `${m.width}x${m.height}`, kb(out));
} else if (cmd === 'logo-inspect') {
  const [srcFile] = args;
  if (!srcFile) { console.error('usage: logo-inspect <file>'); process.exit(1); }
  const meta = await sharp(srcFile).metadata();
  const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let opaque = 0, clear = 0, partial = 0;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3];
      if (a > 250) opaque++; else if (a < 5) clear++; else partial++;
      if (a > 28) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const n = W * H, pct = v => (100 * v / n).toFixed(1) + '%';
  const aw = x1 - x0, ah = y1 - y0;
  console.log(`${srcFile}  ${W}x${H}  ${meta.channels}ch  hasAlpha=${meta.hasAlpha}`);
  console.log(`  alpha:      opaque ${pct(opaque)} · transparent ${pct(clear)} · partial ${pct(partial)}`);
  console.log(`  ink bbox:   x ${x0}-${x1}  y ${y0}-${y1}   art ${aw}x${ah} (ratio ${(aw / ah).toFixed(2)})`);
  console.log(`  art fills:  ${(100 * aw / W).toFixed(0)}% of width, ${(100 * ah / H).toFixed(0)}% of height`);
  console.log(`  padding:    ${(100 * y0 / H).toFixed(0)}% above, ${(100 * (H - y1) / H).toFixed(0)}% below, ${(100 * x0 / W).toFixed(0)}% left, ${(100 * (W - x1) / W).toFixed(0)}% right`);
  if (clear / n > 0.5) console.log('  -> background is ALREADY TRANSPARENT. No knockout needed; use the file as-is.');
  if (ah / H < 0.6) console.log(`  -> sizing by CSS height under-fills. Discount the padding with negative margins\n     (about ${(-y0 / H).toFixed(2)} top, ${(-(H - y1) / H).toFixed(2)} bottom, ${(-x0 / W * (W / H)).toFixed(2)} left, ${(-(W - x1) / W * (W / H)).toFixed(2)} right, as fractions of the rendered height).`);
} else if (cmd === 'logo-colors' || cmd === 'logo-duotone') {
  const srcFile = args[0];
  const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  // background = explicit bgHex arg if given, else average of the four corners
  const bgArg = cmd === 'logo-colors' ? args[1] : args[4];
  const corners = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)];
  const bg = bgArg ? hex(bgArg) : [0, 1, 2].map(c => Math.round(corners.reduce((s, p) => s + p[c], 0) / 4));
  // frequency of quantized non-background colors (tighter radius when bg is explicit)
  const bgRadius = bgArg ? 42 : 60;
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const p = [data[i], data[i + 1], data[i + 2]];
    if (dist(p, bg) < bgRadius) continue;
    const key = p.map(v => v >> 4 << 4).join(',');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const inks = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ color: k.split(',').map(Number), count: c }));

  if (cmd === 'logo-colors') {
    console.log('background:', toHex(bg));
    // merge quantization neighbours into distinct inks
    const distinct = [];
    for (const { color, count } of inks) {
      const hit = distinct.find(d => dist(d.color, color) < 48);
      if (hit) hit.count += count; else distinct.push({ color, count });
      if (distinct.length >= 8) break;
    }
    for (const d of distinct.slice(0, 6)) console.log('ink:', toHex(d.color), 'weight', d.count);
  } else {
    const [, out, frontHexArg, offsetHexArg] = args;
    if (!out || !frontHexArg || !offsetHexArg) { console.error('usage: logo-duotone <file> <out.png> <frontHex> <offsetHex>'); process.exit(1); }
    const front = hex(frontHexArg), offset = hex(offsetHexArg);
    // two dominant distinct inks in the source
    const distinct = [];
    for (const { color, count } of inks) {
      const hit = distinct.find(d => dist(d.color, color) < 48);
      if (hit) hit.count += count; else distinct.push({ color, count });
    }
    distinct.sort((a, b) => b.count - a.count);
    const inkA = distinct[0]?.color, inkB = distinct[1]?.color || distinct[0]?.color;
    const T = 22, RAMP = 20;
    const outBuf = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const p = [data[i], data[i + 1], data[i + 2]];
      const dbg = dist(p, bg);
      let a; if (dbg <= T) a = 0; else if (dbg >= T + RAMP) a = 255; else a = Math.round(((dbg - T) / RAMP) * 255);
      const col = dist(p, inkA) <= dist(p, inkB) ? front : offset;
      outBuf[i] = col[0]; outBuf[i + 1] = col[1]; outBuf[i + 2] = col[2]; outBuf[i + 3] = a;
    }
    const png = await sharp(outBuf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    await sharp(png).trim({ threshold: 6 }).png().toFile(out);
    const m = await sharp(out).metadata();
    console.log(out, `${m.width}x${m.height}`, `(bg ${toHex(bg)}, inks ${toHex(inkA)} -> ${toHex(front)}, ${toHex(inkB)} -> ${toHex(offset)})`);
  }
} else {
  console.error('unknown command — see header comment for usage');
  process.exit(1);
}

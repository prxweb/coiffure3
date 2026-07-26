// qa.mjs — assertion-first QA harness. Text PASS/FAIL/SKIP output, no screenshots.
// Usage: node qa.mjs [url]
//   With no url, reads .devport (written by serve.mjs) and hits that server.
//
// PORTABLE: no per-template ids are required. Every widget is feature-detected
// from the SEL candidate lists below (aria attributes first, then common
// ids/classes from past templates). A check whose widget doesn't exist on the
// page reports [SKIP] instead of failing or crashing. To support a new
// template, extend a candidate list — don't fork this file.
//
// Covers the mechanical parts of the CLAUDE.md mobile checklist so screenshots
// are only needed for aesthetic judgment:
//   - JS/console errors on load            - broken images
//   - horizontal overflow: EN at 6 viewports, FR at mobile portrait + landscape
//   - disclaimer modal fits (portrait + short landscape), incl. its buttons
//   - language toggle coverage — [data-fr] attr style (text must equal the
//     attr) or [data-i18n] dict style (texts change, none empty/undefined,
//     EN round-trip restores; identical EN/FR strings can't be distinguished
//     from missing keys, so dict mode can't prove 100% coverage)
//   - hamburger menu: opens at top + after scroll (portrait) and after scroll
//     (landscape); every rendered link reachable — directly on-screen, or via
//     the menu's own scroll if it is scrollable
//   - lightbox opens with a loaded image; arrows don't move on hover (if present)
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Candidate selectors per widget, most-specific/aria first. Comma lists are
// plain CSS — first *visible* (or for containers, first existing) match wins.
const SEL = {
  dialog: '[role="dialog"][aria-modal="true"], .modal-backdrop, .modal__backdrop, .disclaimer-modal',
  dialogDismiss: '.btn, [id*="dismiss" i], [id*="enter" i], [class*="dismiss" i], .modal-close, [aria-label*="close" i], button',
  burger: '#hamburger, #burger, .hamburger, .burger, button[aria-controls], [aria-label*="menu" i]',
  menu: '#mobileMenu, #mobilemenu, .mobile-menu, .mobile-nav, .nav-drawer, nav [data-menu]',
  lightbox: '#lightbox, .lightbox, [data-lightbox-root]',
  lightboxTrigger: '#menuCover, [data-lightbox], .gallery-grid a, .gallery a, .gallery-grid figure, .gallery figure',
  lightboxNext: '#lbNext, .lb-next, [aria-label*="next" i]',
  langFr: '[data-setlang="fr" i], [data-lang="fr" i]',
  langEn: '[data-setlang="en" i], [data-lang="en" i]',
};

// URL: explicit arg wins; otherwise read the port serve.mjs wrote to .devport.
function resolveUrl() {
  if (process.argv[2]) return process.argv[2];
  try {
    const p = fs.readFileSync(path.join(__dirname, '.devport'), 'utf8').trim();
    if (p) return `http://localhost:${p}`;
  } catch {}
  console.error('No url given and no .devport found — start the dev server first: node serve.mjs');
  process.exit(1);
}
const url = resolveUrl();

function getChromium() {
  const tries = [];
  try {
    const globalRoot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const reqMcp = createRequire(path.join(globalRoot, '@playwright', 'mcp', 'package.json'));
    tries.push(() => reqMcp('playwright-core').chromium);
    tries.push(() => reqMcp('playwright').chromium);
  } catch {}
  try { const r = createRequire(import.meta.url); tries.push(() => r('playwright-core').chromium); } catch {}
  for (const t of tries) { try { const c = t(); if (c) return c; } catch {} }
  throw new Error('playwright-core not found (install @playwright/mcp globally)');
}
async function launch(chromium) {
  for (const opt of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try { return await chromium.launch(opt); } catch {}
  }
  throw new Error('could not launch a browser');
}

const browser = await launch(getChromium());
let pass = 0, fail = 0, skipped = 0;
function report(ok, name, detail) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${!ok && detail ? ' - ' + detail : ''}`);
  ok ? pass++ : fail++;
}
function skip(name, why) {
  console.log(`[SKIP] ${name} — ${why}`);
  skipped++;
}
async function newPage(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p._errors = [];
  p.on('pageerror', e => p._errors.push('pageerror: ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const loc = (m.location() && m.location().url) || '';
    if (loc.includes('favicon') || m.text().includes('favicon')) return;
    p._errors.push('console: ' + m.text() + (loc ? ` (${loc})` : ''));
  });
  await p.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(300);
  return p;
}

// Injected into every evaluate that needs it (no closure sharing with node).
const VIS_FN = `el => { const s = getComputedStyle(el), r = el.getBoundingClientRect();
  return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; }`;

async function dialogVisible(p) {
  return p.evaluate(({ sel, visSrc }) => {
    const vis = eval(visSrc);
    return [...document.querySelectorAll(sel)].some(vis);
  }, { sel: SEL.dialog, visSrc: VIS_FN });
}

// Generic dismiss: Esc first (required by the modal spec), then click the
// first visible non-language button inside the dialog. Silent when no dialog.
async function dismissModal(p) {
  if (!await dialogVisible(p)) return;
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  if (!await dialogVisible(p)) return;
  const tagged = await p.evaluate(({ dialogSel, dismissSel, visSrc }) => {
    const vis = eval(visSrc);
    const d = [...document.querySelectorAll(dialogSel)].find(vis);
    if (!d) return false;
    const btn = [...d.querySelectorAll(dismissSel)].find(b => vis(b) && !b.hasAttribute('data-setlang') && !b.hasAttribute('data-lang'));
    if (!btn) return false;
    btn.setAttribute('data-qa-dismiss', '1');
    return true;
  }, { dialogSel: SEL.dialog, dismissSel: SEL.dialogDismiss, visSrc: VIS_FN });
  if (tagged) await p.locator('[data-qa-dismiss]').click({ timeout: 1500 }).catch(() => {});
  await p.waitForTimeout(200);
}

/* 1) Errors, broken images, lightbox behaviour (desktop) */
{
  const p = await newPage(1440, 900);
  await dismissModal(p);
  report(p._errors.length === 0, 'no JS/console errors on load', p._errors.join(' | '));
  const broken = await p.evaluate(() =>
    [...document.images].filter(i => i.getAttribute('src') && i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')));
  report(broken.length === 0, 'no broken images', broken.join(', '));

  const hasLb = await p.evaluate(sel => !!document.querySelector(sel), SEL.lightbox);
  if (!hasLb) {
    skip('lightbox checks', 'no lightbox on this page');
  } else {
    const trig = await p.evaluate(({ sel, visSrc }) => {
      const vis = eval(visSrc);
      const t = [...document.querySelectorAll(sel)].find(vis);
      if (!t) return false;
      t.setAttribute('data-qa-lbtrigger', '1');
      return true;
    }, { sel: SEL.lightboxTrigger, visSrc: VIS_FN });
    if (!trig) {
      skip('lightbox checks', 'lightbox exists but no trigger matched — extend SEL.lightboxTrigger');
    } else {
      await p.locator('[data-qa-lbtrigger]').click({ timeout: 2000 }).catch(() => {});
      await p.waitForTimeout(400);
      const lb = await p.evaluate(({ sel, visSrc }) => {
        const vis = eval(visSrc);
        const box = document.querySelector(sel);
        const img = box && [...box.querySelectorAll('img')].find(i => i.naturalWidth > 0);
        return { open: !!box && vis(box), img: !!img };
      }, { sel: SEL.lightbox, visSrc: VIS_FN });
      report(lb.open && lb.img, 'lightbox opens with a loaded image', JSON.stringify(lb));

      const hasNext = await p.evaluate(({ lbSel, nextSel, visSrc }) => {
        const vis = eval(visSrc);
        const box = document.querySelector(lbSel);
        const n = box && [...box.querySelectorAll(nextSel)].find(vis);
        if (!n) return false;
        n.setAttribute('data-qa-lbnext', '1');
        return true;
      }, { lbSel: SEL.lightbox, nextSel: SEL.lightboxNext, visSrc: VIS_FN });
      if (!hasNext) {
        skip('lightbox arrows do not move on hover', 'no next-arrow matched');
      } else {
        const before = await p.locator('[data-qa-lbnext]').boundingBox();
        await p.locator('[data-qa-lbnext]').hover();
        await p.waitForTimeout(300);
        const after = await p.locator('[data-qa-lbnext]').boundingBox();
        const moved = !before || !after || Math.abs(before.y - after.y) > 0.5 || Math.abs(before.x - after.x) > 0.5;
        report(!moved, 'lightbox arrows do not move on hover', before && after ? `moved ${(after.y - before.y).toFixed(1)}px` : 'no box');
      }
    }
  }
  await p.context().close();
}

/* 2) Horizontal overflow across viewports (EN) */
for (const [w, h] of [[360, 780], [390, 844], [414, 896], [844, 390], [768, 1024], [1440, 900]]) {
  const p = await newPage(w, h);
  await dismissModal(p);
  const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report(o <= 0, `no horizontal overflow @ ${w}x${h}`, `${o}px overflow`);
  await p.context().close();
}

/* 3) Disclaimer modal fits (checked before dismissing) */
for (const [w, h] of [[390, 844], [844, 390]]) {
  const p = await newPage(w, h);
  const m = await p.evaluate(({ dialogSel, visSrc }) => {
    const vis = eval(visSrc);
    const d = [...document.querySelectorAll(dialogSel)].find(vis);
    if (!d) return null;
    // If the dialog root is a full-viewport backdrop, measure its largest
    // visible child (the box) instead of the backdrop itself.
    let box = d;
    const dr = d.getBoundingClientRect();
    if (dr.width >= innerWidth * 0.95 && dr.height >= innerHeight * 0.95) {
      box = [...d.children].filter(vis).sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      })[0] || d;
    }
    const r = box.getBoundingClientRect();
    const btns = [...box.querySelectorAll('button, .btn')].filter(vis).map(b => b.getBoundingClientRect());
    const btnMaxBottom = btns.length ? Math.max(...btns.map(b => b.bottom)) : r.bottom;
    return { top: r.top, bottom: r.bottom, btnMaxBottom, ih: innerHeight };
  }, { dialogSel: SEL.dialog, visSrc: VIS_FN });
  if (!m) skip(`disclaimer modal fits viewport @ ${w}x${h}`, 'no modal on this page');
  else {
    const ok = m.top >= -1 && m.bottom <= m.ih + 1 && m.btnMaxBottom <= m.ih + 1;
    report(ok, `disclaimer modal fits viewport @ ${w}x${h}`, `box ${Math.round(m.top)}..${Math.round(m.bottom)}, buttons to ${Math.round(m.btnMaxBottom)}, of ${m.ih}`);
  }
  await p.context().close();
}

/* 4) Language toggle coverage + FR overflow */
{
  const p = await newPage(390, 844);
  const mode = await p.evaluate(() =>
    document.querySelector('[data-fr]') ? 'attr' : (document.querySelector('[data-i18n]') ? 'dict' : null));
  if (!mode) {
    skip('language toggle coverage', 'no [data-fr] / [data-i18n] markers on this page');
  } else {
    const before = await p.evaluate(() => [...document.querySelectorAll('[data-fr],[data-i18n]')].map(el => el.textContent.trim()));
    // JS-click so it works whether the switch lives in the modal or the nav.
    const clickLang = lang => p.evaluate(({ sel, lang }) => {
      const cand = document.querySelector(sel) ||
        [...document.querySelectorAll('button, a')].find(el =>
          (lang === 'fr' ? /^(fr|fran[cç]ais)$/i : /^(en|english)$/i).test(el.textContent.trim()));
      if (!cand) return false;
      cand.click();
      return true;
    }, { sel: lang === 'fr' ? SEL.langFr : SEL.langEn, lang });
    const clicked = await clickLang('fr');
    await p.waitForTimeout(300);
    await dismissModal(p);
    const r = await p.evaluate(() => {
      const els = [...document.querySelectorAll('[data-fr],[data-i18n]')];
      return {
        lang: document.documentElement.lang || '',
        texts: els.map(el => el.textContent.trim()),
        empty: els.filter(el => { const t = el.textContent.trim(); return !t || t === 'undefined' || t === 'null'; }).length,
        // data-* values may carry inline markup (<br>, <span>, <a>), so compare
        // rendered text to rendered text — not text to raw attribute string.
        attrBad: els.filter(el => {
          if (!el.hasAttribute('data-fr')) return false;
          const norm = s => s.trim().replace(/\s+/g, ' ');
          const probe = document.createElement('div');
          probe.innerHTML = el.getAttribute('data-fr');
          return norm(el.textContent) !== norm(probe.textContent);
        }).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    const changed = r.texts.filter((t, i) => t !== before[i]).length;
    if (mode === 'attr') {
      report(clicked && r.attrBad === 0 && r.empty === 0, 'FR toggle translates every [data-fr] element',
        !clicked ? 'no FR switch found' : `${r.attrBad} untranslated, ${r.empty} empty (lang=${r.lang})`);
    } else {
      report(clicked && changed > 0 && r.empty === 0, 'FR toggle applies [data-i18n] dictionary',
        !clicked ? 'no FR switch found' : `${changed} changed of ${r.texts.length}, ${r.empty} empty/undefined (lang=${r.lang})`);
    }
    report(r.overflow <= 0, 'no horizontal overflow in FR @ 390x844', `${r.overflow}px overflow`);
    await p.setViewportSize({ width: 844, height: 390 });
    await p.waitForTimeout(200);
    const o2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report(o2 <= 0, 'no horizontal overflow in FR @ 844x390', `${o2}px overflow`);
    // Round-trip back to EN (dict mode: proves the toggle is symmetric).
    if (mode === 'dict') {
      const back = await clickLang('en');
      await p.waitForTimeout(300);
      if (!back) skip('EN round-trip restores text', 'no EN switch found');
      else {
        const after = await p.evaluate(() => [...document.querySelectorAll('[data-fr],[data-i18n]')].map(el => el.textContent.trim()));
        const mismatch = after.filter((t, i) => t !== before[i]).length;
        report(mismatch === 0, 'EN round-trip restores every [data-i18n] element', `${mismatch} elements differ from initial EN`);
      }
    }
  }
  await p.context().close();
}

/* 5) Hamburger menu: opens; every rendered link reachable */
for (const { w, h, scroll } of [
  { w: 390, h: 844, scroll: false },
  { w: 390, h: 844, scroll: true },
  { w: 844, h: 390, scroll: true },
]) {
  const label = `hamburger menu @ ${w}x${h} (${scroll ? 'scrolled' : 'top'})`;
  const p = await newPage(w, h);
  await dismissModal(p);
  if (scroll) {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await p.waitForTimeout(200);
  }
  const found = await p.evaluate(({ sel, visSrc }) => {
    const vis = eval(visSrc);
    const cands = [...document.querySelectorAll(sel)].filter(vis);
    // The loose fallbacks in SEL.burger (button[aria-controls], aria-label~=menu)
    // also match in-page controls such as a "open the menu" food-menu cover.
    // A hamburger always lives in the nav/header, so prefer those; only fall
    // back to a page-level match when the chrome has none. No fallback: a
    // false SKIP is safer than a false PASS/FAIL on the wrong element.
    const b = cands.find(el => el.closest('nav, header, [role="banner"]'));
    if (!b) return false;
    b.setAttribute('data-qa-burger', '1');
    return true;
  }, { sel: SEL.burger, visSrc: VIS_FN });
  if (!found) {
    skip(label, 'no hamburger visible at this viewport');
    await p.context().close();
    continue;
  }
  await p.locator('[data-qa-burger]').click({ timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(450);
  const r = await p.evaluate(({ menuSel, visSrc }) => {
    const vis = eval(visSrc);
    const burger = document.querySelector('[data-qa-burger]');
    const ac = burger && burger.getAttribute('aria-controls');
    const menu = (ac && document.getElementById(ac)) || document.querySelector(menuSel);
    if (!menu) return { menu: false };
    const open = vis(menu);
    // Only links that are actually rendered — display:none items (e.g. a
    // desktop-only phone link inside the drawer) are out of scope.
    const links = [...menu.querySelectorAll('a')].filter(vis);
    const inView = el => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.top >= -1 && b.bottom <= innerHeight + 1 && b.left >= -1 && b.right <= innerWidth + 1;
    };
    let offenders = links.filter(a => !inView(a));
    const scrollable = menu.scrollHeight > menu.clientHeight + 1;
    let reachedByScroll = false;
    if (offenders.length && scrollable) {
      reachedByScroll = offenders.every(a => { a.scrollIntoView({ block: 'nearest', behavior: 'instant' }); return inView(a); });
      menu.scrollTop = 0;
    }
    return {
      menu: true, open, count: links.length, scrollable, reachedByScroll,
      offenders: offenders.map(a => (a.textContent.trim() || a.getAttribute('aria-label') || '?').slice(0, 24)),
    };
  }, { menuSel: SEL.menu, visSrc: VIS_FN });
  const ok = r.menu && r.open && r.count > 0 && (r.offenders.length === 0 || r.reachedByScroll);
  report(ok, label + (ok && r.offenders.length ? ' [via menu scroll]' : ''),
    !r.menu ? 'no menu element matched — extend SEL.menu' : JSON.stringify(r));
  await p.context().close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail ? 1 : 0);

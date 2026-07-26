# Coiffure 3 — prospect sample site

Personalized cold-outreach **design preview** for **Coiffure 3**, a hair salon at
5702 Sherbrooke St W in Notre-Dame-de-Grâce, Montreal.

**This is not a live or authorized site for the business.** It carries the required
Prospect Sample Mode disclosures: the on-load bilingual disclaimer modal, the hero
"SAMPLE SITE" stamp, and the persistent Parallex footer note. Do not remove any of
the three while this is being used for outreach.

Built from `barber-template-1`. Client data lives in `brand_assets/client-info.md`
(the single source of truth for name, phone, address and hours).

## Quickstart
```
npm install              # sharp (asset pipeline)
node serve.mjs           # dev server on the first free port; writes .devport
node qa.mjs              # assertion QA (text PASS/FAIL); reads .devport
node screenshot.mjs foo  # screenshot labelled "foo"; reads .devport
```
No port to pick — `serve.mjs` auto-selects a free one and the other tools read it
from `.devport`.

## Page structure
Nav (fixed) → hero (full-height photo, white logotype at top, 3-line headline,
sample stamp) → short intro → image band → services (6 items) → image band →
three pillars → footer.

**All contact information lives in the footer** — phone, day-by-day hours, address,
directions and the map embed, in one place. The template's mid-page info strip was
removed rather than duplicated; `#visit` in the nav now targets the footer.

## Reskin notes specific to this build

**Logo.** `logo.png` is **never modified on disk** — not cropped, recoloured,
knocked out or downscaled. It is black ink on a transparent background
(605×394; 83.7% fully transparent; ink bbox 527×347 at 19,27→545,373).

Every surface it appears on is dark, so it is rendered **white via CSS
`filter:invert(1)`** (`.logo-white`, and inline on the nav/hero marks). Invert
touches only the RGB channels — alpha, and therefore the antialiased edges, comes
through untouched, so this gives clean white ink with no plate, no knockout and no
derived file. Three placements:

| Placement | Size | Notes |
|---|---|---|
| Nav | `height:60px` (44px ≤760px, 38px short landscape) | sized by height; nav `padding-block` trimmed to `.85rem` so the bar stays ≈87px. **Cross-fades with the hero mark** — see below |
| Hero | `width:clamp(188px,22vw,224px)`, `min(56vw,240px)` portrait | top of the frame, decorative (`aria-hidden`); capped to clear the stamp right and headline below; hidden in short landscape where the hero height is fully budgeted |
| Footer | `width:clamp(196px,24vw,254px)` | white on the dark footer |

**Nav ↔ hero logo cross-fade.** The nav logotype duplicates the hero mark, so
`syncBrand()` (in the page script) hides it while the hero mark is on screen and
fades it in once that mark has passed behind the nav — and back out on the way up.
It measures against the *live* `nav.offsetHeight`, because the bar shrinks in its
scrolled state, and it no-ops when the hero mark is `display:none` (short
landscape) so the nav mark always shows there. `.brand-anim` is added on the frame
*after* the initial state so the first paint doesn't animate; `visibility` is
transitioned alongside `opacity` so the hidden logotype also leaves the tab order.

**Hero logo alignment.** The mark is wrapped in a `.wrap` so it inherits the exact
left gutter the headline uses, then `translateX(-3.14%)` pulls the file's
transparent left margin (19/605) back out — that makes the **ink** edge line up
with the text, not the canvas edge. Note this is a *different* correction from
`--logo-nudge`, which centres the ink for the nav and footer marks.

The file's transparent padding is uneven, so `--logo-nudge` (`translate(3.39%,-0.76%)`)
optically centres the *ink* inside its container. Adjust that token, not the file.

**Palette.** The logo is pure black/white, so nothing could be sampled from it.
The `:root` family was derived to complement it: espresso near-black brand,
warm bone paper, rose-clay accent, brass trim.

**Type.** Cormorant Garamond (display + italic accents) & Jost (body). Uppercase
display lines carry slightly *positive* tracking — a high-contrast Garamond needs
it at hero sizes, which is why they deviate from the usual tight-tracking rule.

**Photography.** Six hotlinked Unsplash images chosen from `picker.html`:
HERO-08 (hero), HERO-15 (band 1), P2-TEXTURE-20 (band 2), HERO-19 / HERO-20 /
P1-FAMILY-09 (pillars 1–3). Each `<img>` carries an inline `object-position` tuned
so the client and the hair stay centred as the crop changes across viewports —
that is the knob to turn if a crop looks off, not the URL.

**Hero headline.** EN "HAIR THAT / feels like / YOU" and FR "DES CHEVEUX / qui vous /
RESSEMBLENT" are both three lines with a single-word third line, so the two
languages stack identically on portrait phones. Keep that parity if you edit them.

**Content honesty.** No prices, testimonials, reviews, ratings, stylist names,
founding dates or awards — none were supplied. Service descriptions are generic to
the trade; the menu note sends visitors to the phone for pricing.

## QA status
`node qa.mjs` — 15 passed, 0 failed, 2 skipped (no lightbox on this page; no
hamburger at 844×390, where the desktop nav still fits). Verified visually at
1440×900, 390×844 (EN + FR) and 844×390 (EN + FR), plus the modal, the nav
cross-fade at both scroll states, and the footer.

**Known harness artifact, not a bug:** the footer map often screenshots without its
marker. `screenshot.mjs` waits 400ms after scrolling and Google paints the marker
overlay later than the tiles. Given ~6s to settle the "5702" pin renders correctly
on Sherbrooke W beside Lower Canada College. Don't "fix" the embed over it.

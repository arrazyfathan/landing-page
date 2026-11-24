# Ar Razy Fathan Rabbani — Personal Landing Page

A minimal, zero-framework personal landing page introducing my work as a **Mobile Engineer (Android & iOS)** alongside my cycling hobby (**On Two Wheels**) in Surakarta, Indonesia.

Design and interaction craft inspired by [muhraufan.com](https://muhraufan.com/) and [theweekendproject.club](https://theweekendproject.club/).

---

## Tech Stack

- **Core:** Vanilla HTML5, CSS3, and native ES Modules (`<script type="module">`) — no frameworks, no bundler, no build step.
- **Typography:** `Gabarito` (display), `Geist` (body), `Geist Mono` (metadata), and `Caveat` (signature).
- **Motion & Tactile UI:**
  - Native CSS `linear()` spring physics curves (`--spring`, `--spring-soft`) and custom cubic-bezier curves.
  - Interactive tappable headline words with spring width morphing, vertical blur-slide swaps, icon hops, and live retina HTML5 `<canvas>` hand-drawn highlighter strokes (`js/marker.js`).
  - Shared-element FLIP zoom-in / fly-back photo viewer (`js/photos.js`) with frosted translucent backdrop (`480ms` open / `300ms` asymmetric close).
  - Zero-dependency procedural Web Audio API sound synthesizer (`js/sound.js`).
- **Dual Profile Palette & Themes:**
  - **Mobile Eng. (`#work`):** Electric blue marker (`#0380FC` / `#1A8CFF` dark) + white ink.
  - **On Two Wheels (`#cycling`):** Warm yellow marker (`#FFC629` / `#F5C128` dark) + dark ink.
  - Light (`Sat`, `#FBFAF7`) and Dark (`Sun`, `#14120E`) warm paper themes, persisted in `localStorage`.

---

## Project Structure

```text
landing-page/
├── index.html                  # Home — Mobile Engineer (https://arrazyfathan.com/)
├── cycling/
│   └── index.html              # On Two Wheels — Strava stats & 37-photo gallery (/cycling/)
├── connect/
│   └── index.html              # Where You Can Find Me — direct links directory (/connect/)
├── css/
│   └── styles.css              # Design tokens, spring curves, view transitions & viewer styles
├── js/
│   ├── main.js                 # Theme/SFX switches, word swap choreography & shortcuts
│   ├── marker.js               # Retina <canvas> organic highlighter stroke renderer & live morph loop
│   ├── photos.js               # Staggered gallery renderer + FLIP lightbox with keyboard navigation
│   └── sound.js                # Procedural Web Audio API click, pop, switch & copy chimes
├── assets/
│   ├── avatars/                # work.png & cycling.png transparent portrait illustrations
│   ├── icons/                  # Custom die-cut sticker SVGs, multi-size favicons & gamatechno.png
│   ├── photos/                 # GPS-stripped WebP cycling shots (*-640.webp, *-1600.webp) & photos.json
│   ├── og-image.png            # 1200x630 Open Graph preview card (Mobile Engineer)
│   └── og-cycling.png          # 1200x630 Open Graph preview card (Cycling)
├── scripts/
│   └── optimize-photos.sh      # Batch resizer & EXIF/GPS stripper using macOS sips + cwebp
├── robots.txt                  # Crawler directives & sitemap reference
├── sitemap.xml                 # Indexable URLs (/, /cycling/, /connect/) for Google Sitelinks
├── site.webmanifest            # Web app manifest
├── .gitignore
└── README.md
```

---

## Local Development

Because the site uses native ES Modules (`type="module"`) and fetches `assets/photos/photos.json`, serve the folder over HTTP instead of opening `index.html` via `file://`:

```bash
python3 -m http.server 4173
```

Then open:
- Work profile: `http://localhost:4173/#work`
- Cycling profile: `http://localhost:4173/#cycling`

### Keyboard Shortcuts
| Key | Action |
| :--- | :--- |
| `W` | Switch to **Mobile Eng.** profile |
| `C` | Switch to **On Two Wheels** (Cycling) profile |
| `D` | Toggle Light (`Sat`) / Dark (`Sun`) theme |
| `←` / `→` | Previous / Next photo when the lightbox is open |
| `Esc` | Close the photo lightbox |

---

## Updating Content

### 1. Updating Cycling Photos (WebP + EXIF/GPS Stripping)
Keep raw phone photos outside this repo (e.g. `../shoot-cycling/`), then convert them into two lightweight WebP sizes (`640px` thumbnails + `1600px` full-res) with all EXIF/GPS metadata stripped:

```bash
./scripts/optimize-photos.sh "../shoot-cycling"
```

*(Requires macOS built-in `sips` and `cwebp` via `brew install webp`.)*

Then add each photo entry to `assets/photos/photos.json`:

```json
{
  "id": "20261101_163436",
  "thumb": "./assets/photos/20261101_163436-640.webp",
  "full": "./assets/photos/20261101_163436-1600.webp",
  "date": "Nov 1, 2026",
  "camera": "Galaxy A54 5G"
}
```

### 2. Updating Strava Stats & Bio Copy
Edit the copy, Strava stats, and `"Updated ..."` dates directly in `index.html`.
- Tappable hero highlights use `data-swap="Option 1|Option 2"` and matching `data-icons="./path1.svg|./path2.svg"`.

---

## Deployment

This folder is 100% static with zero build step. Deploy `landing-page/` directly to **Cloudflare Pages**, **GitHub Pages**, **Vercel**, or **Netlify** with the output directory set to `.` (root).

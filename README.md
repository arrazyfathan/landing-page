# Ar Razy Fathan Rabbani — Personal Website

A minimal, zero-framework personal website introducing my work as a **Mobile Engineer (Android & iOS)** alongside my cycling journal (**On Two Wheels**) in Surakarta, Indonesia.

Design and interaction craft inspired by [muhraufan.com](https://muhraufan.com/) and [theweekendproject.club](https://theweekendproject.club/).

---

## Pages & Routes

| Route | Purpose |
| :--- | :--- |
| `/` ([index.html](./index.html)) | **Mobile Engineer** — interactive swappable hero, editorial bio with shipped product & open-source icon popovers, resume link, and connect pills |
| `/cycling/` ([cycling/index.html](./cycling/index.html)) | **On Two Wheels** — cycling bio & Strava snapshot, watchOS-style radial lens photo gallery (37 photos), Strava Trophy Case & recent PRs, and Top 10 Riding Podcasts Cover Rail |
| `/connect/` ([connect/index.html](./connect/index.html)) | **Where to Find Me** — clean link directory with one-click email copy |

---

## Tech Stack & Craft

- **Core:** Vanilla HTML5, CSS3, and native ES Modules (`<script type="module">`) — zero frameworks, zero bundler, zero build step.
- **Typography:** `Gabarito` (display), `Geist` (body & semibold uppercase section labels), `Geist Mono` (metadata & counters), and `Caveat` (handwritten signature).
- **Navigation & Themes:**
  - Sticky top bar with feathered paper fade (`--topbar-fade`), stacked avatar profile switcher with cross-document CSS View Transitions (`@view-transition`), and desktop scroll-aligned column width (`820px → 700px`).
  - Dual profile accents: **Work** electric blue (`#0380FC` / `#1A8CFF` dark) and **Cycling** yellow jersey (`#FFC629` / `#F5C128` dark).
  - Warm archival paper Light (`Sat`, `#FBFAF7`) and Dark (`Sun`, `#14120E`) themes — defaults to Light on fresh visits and persists within the session via `sessionStorage`.
- **Interactive Modules:**
  - **Swappable Hero & Canvas Markers (`js/main.js`, `js/marker.js`):** Tappable and auto-cycling headline highlights with synced leading verb (`Building` / `Shipping to`), spring width morphing, icon hops, and live retina `<canvas>` hand-drawn highlighter strokes.
  - **Hero Scroll Shrink & Scroll Reveals (`js/main.js`):** Full-viewport sticky hero that smoothly scales & fades on scroll using GPU `transform`/`opacity` only, paired with `IntersectionObserver` scroll reveals and mobile-tuned performance (static wavy link underlines at rest, dynamic `will-change` cleanup, URL-bar resize guard, and `128×128` WebP avatar thumbnails).
  - **WatchOS Radial Lens Photo Gallery (`js/photos.js`):** Single-atlas opaque `<canvas>` renderer with pre-baked Gaussian edge blur, direct-manipulation drag/momentum panning, mobile scroll-safe horizontal/2D pan toggle, and a shared-element FLIP lightbox with touch swipes, keyboard navigation, and ghost-click protection.
  - **Strava Trophy Case (`js/trophies.js`):** 5×2 trophy shelf with 3D pointer tilt, specular glare sweeps, floating badge tooltips, and a recent Strava PRs strip.
  - **Top 10 Riding Podcasts Cover Rail (`js/podcasts.js`):** Horizontal snap rail with smooth scroll-ramped feathered blur/paper edge fades, custom Spotify badge, and a hover **Podcast Broadcast Disc** (concentric acoustic rings + pulsing studio condenser mic) that slides out while parting neighbor covers.
  - **Procedural Audio (`js/sound.js`):** Zero-dependency Web Audio API synthesizer for subtle click, hover, pop, switch, and copy chimes (toggleable from the top bar).

---

## Project Structure

```text
landing-page/
├── index.html                    # Home — Mobile Engineer (/)
├── cycling/
│   └── index.html                # On Two Wheels — Cycling, Photos, Trophies & Podcasts (/cycling/)
├── connect/
│   └── index.html                # Where to Find Me — Links Directory (/connect/)
├── css/
│   └── styles.css                # Design tokens, spring physics, view transitions & responsive layout
├── js/
│   ├── main.js                   # Theme/SFX toggles, hero swap & scroll shrink, popovers, reveals & shortcuts
│   ├── marker.js                 # Retina <canvas> organic highlighter stroke renderer & live morph loop
│   ├── photos.js                 # Single-atlas watchOS radial lens gallery & frosted FLIP lightbox
│   ├── trophies.js               # Strava trophy shelf (3D tilt + glare) & recent PRs renderer
│   ├── podcasts.js               # Top 10 riding podcasts Cover Rail & Broadcast Disc hover interactions
│   └── sound.js                  # Procedural Web Audio API tactile UI sound synthesizer
├── assets/
│   ├── avatars/                  # Full PNG avatars (SEO/JSON-LD) + 128x128 WebP thumbnails for UI
│   ├── icons/                    # Die-cut SVG/WebP/PNG icons (platform, lang, products, projects, cycling, connect) & favicons
│   ├── photos/                   # GPS-stripped WebP cycling shots (*-280.webp, *-640.webp, *-1600.webp) & photos.json
│   ├── trophies/                 # Strava challenge badge WebPs, PR medal SVGs, trophies.json & achievements.json
│   ├── podcasts/                 # 260x260 WebP podcast covers (01..10) & podcasts.json
│   ├── og-image.png              # 1200x630 Open Graph preview card (Mobile Engineer)
│   └── og-cycling.png            # 1200x630 Open Graph preview card (Cycling)
├── scripts/
│   └── optimize-photos.sh        # Batch photo resizer & EXIF/GPS stripper using macOS sips + cwebp
├── robots.txt                    # Crawler directives & sitemap reference
├── sitemap.xml                   # Indexable URLs (/, /cycling/, /connect/) for Google Sitelinks
├── site.webmanifest              # Web app manifest
├── .gitignore
└── README.md
```

---

## Local Development

Because the site uses native ES Modules (`type="module"`) and fetches local JSON manifests (`photos.json`, `trophies.json`, `achievements.json`, `podcasts.json`), serve `landing-page/` over HTTP rather than opening files via `file://`:

```bash
python3 -m http.server 8765
```

Then open:
- Work profile: `http://localhost:8765/`
- Cycling profile: `http://localhost:8765/cycling/`
- Links directory: `http://localhost:8765/connect/`

### Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `W` | Switch to **Mobile Engineer** (`/`) |
| `C` | Switch to **Cycling & Photos** (`/cycling/`) |
| `D` | Toggle Light (`Sat`) / Dark (`Sun`) paper theme |
| `←` / `→` | Previous / Next photo when the lightbox is open |
| `Esc` | Close the photo lightbox or open app popover |

---

## Updating Content

### 1. Cycling Photos (`assets/photos/`)
Keep raw phone photos outside the repo (e.g. `../shoot-cycling/`), then generate EXIF/GPS-stripped WebP variants (`-280.webp` for the canvas atlas, `-640.webp` preview, `-1600.webp` full-res):

```bash
./scripts/optimize-photos.sh "../shoot-cycling"
```

*(Requires macOS `sips` and `cwebp` via `brew install webp`.)*

Add each entry to `assets/photos/photos.json`:

```json
{
  "id": "20261101_163436",
  "grid": "/assets/photos/20261101_163436-280.webp",
  "thumb": "/assets/photos/20261101_163436-640.webp",
  "full": "/assets/photos/20261101_163436-1600.webp",
  "date": "Nov 1, 2026",
  "camera": "Galaxy A54 5G",
  "w": 360,
  "h": 640
}
```

### 2. Strava Trophies & PRs (`assets/trophies/`)
- Add optimized WebP badges to `assets/trophies/` and update `assets/trophies/trophies.json` (`index`, `label`, `date`, `image`, `shape`: `"diecut"` or `"square"`).
- Update recent Strava personal records in `assets/trophies/achievements.json`.

### 3. Top 10 Riding Podcasts (`assets/podcasts/`)
- Add `260×260` WebP cover artwork to `assets/podcasts/` and update `assets/podcasts/podcasts.json`:

```json
{
  "index": 1,
  "name": "The Rest Is Football",
  "publisher": "Goalhanger",
  "link": "https://open.spotify.com/show/2fDn3EgvJZ5J1k5rrBwrlZ",
  "image": "/assets/podcasts/01-the-rest-is-football.webp"
}
```

### 4. Copy, Hero Swaps & Strava Stats
- Edit Work bio, inline product/project popovers (`data-app-name`, `data-app-url`), and tappable hero highlights (`data-swap`, `data-swap-mobile`, `data-verbs`, `data-icons`) in `index.html`.
- Edit cycling narrative, Strava stats, and `"Updated ..."` date directly in `cycling/index.html`.

---

## Deployment

This directory is 100% static with no build step. Deploy `landing-page/` directly to **Cloudflare Pages**, **GitHub Pages**, **Vercel**, or **Netlify** with the output directory set to `.` (root).

#!/usr/bin/env node
/**
 * Generate 1200x630 Cutting Mat Open Graph preview cards for /, /cycling/, and /connect/.
 * Zero npm dependencies — uses local Google Chrome / Chromium in headless mode.
 *
 * Usage:
 *   node scripts/generate-og.mjs                     # Classic OLFA Emerald Green (default)
 *   node scripts/generate-og.mjs --mat=orange        # Signal Orange
 *   node scripts/generate-og.mjs --mat=blue --update-html
 *
 * Supported --mat values:
 *   green (default) | black | gray | maroon | blue | orange | pink
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PALETTES = {
  green: {
    name: 'Classic Green',
    bg: '#095848',
    ink: '#F2FFF9',
    ink2: '#CBEFE3',
    muted: '#A2DCCB',
    gridMinor: 'rgba(98, 255, 214, 0.13)',
    gridMajor: 'rgba(98, 255, 214, 0.34)',
    ruler: 'rgba(132, 255, 223, 0.72)',
    clearance: 'rgba(7, 72, 58, 0.36)',
    accentWork: '#5EFFD4',
    accentCycling: '#FFD84D',
    avatarRing: 'rgba(132, 255, 223, 0.42)',
    shadowDark: 'rgba(0, 14, 10, 0.66)',
    shadowLight: 'rgba(140, 255, 226, 0.22)',
  },
  black: {
    name: 'Obsidian Black',
    bg: '#121315',
    ink: '#F5F5F2',
    ink2: '#D4D4CE',
    muted: '#A6A6A0',
    gridMinor: 'rgba(255, 255, 255, 0.085)',
    gridMajor: 'rgba(255, 255, 255, 0.22)',
    ruler: 'rgba(255, 255, 255, 0.56)',
    clearance: 'rgba(14, 15, 17, 0.42)',
    accentWork: '#5CC2FF',
    accentCycling: '#FFD84D',
    avatarRing: 'rgba(255, 255, 255, 0.28)',
    shadowDark: 'rgba(0, 0, 0, 0.80)',
    shadowLight: 'rgba(255, 255, 255, 0.17)',
  },
  gray: {
    name: 'Graphite Gray',
    bg: '#5A5A5A',
    ink: '#FFFFFF',
    ink2: '#ECECEC',
    muted: '#D8D8D8',
    gridMinor: 'rgba(255, 255, 255, 0.13)',
    gridMajor: 'rgba(255, 255, 255, 0.32)',
    ruler: 'rgba(255, 255, 255, 0.68)',
    clearance: 'rgba(70, 70, 70, 0.36)',
    accentWork: '#73C7FF',
    accentCycling: '#FFD84D',
    avatarRing: 'rgba(255, 255, 255, 0.38)',
    shadowDark: 'rgba(8, 8, 8, 0.62)',
    shadowLight: 'rgba(255, 255, 255, 0.24)',
  },
  maroon: {
    name: 'Crimson Maroon',
    bg: '#4A0404',
    ink: '#FFF4F4',
    ink2: '#F7D1D1',
    muted: '#E3A7A7',
    gridMinor: 'rgba(255, 198, 198, 0.13)',
    gridMajor: 'rgba(255, 206, 206, 0.32)',
    ruler: 'rgba(255, 216, 216, 0.68)',
    clearance: 'rgba(58, 2, 2, 0.38)',
    accentWork: '#FFB4AB',
    accentCycling: '#FFD84D',
    avatarRing: 'rgba(255, 216, 216, 0.38)',
    shadowDark: 'rgba(12, 0, 0, 0.72)',
    shadowLight: 'rgba(255, 118, 102, 0.24)',
  },
  blue: {
    name: 'Cobalt Blue',
    bg: '#002F9E',
    ink: '#F5F9FF',
    ink2: '#D6E6FF',
    muted: '#B0CAFC',
    gridMinor: 'rgba(215, 232, 255, 0.14)',
    gridMajor: 'rgba(228, 240, 255, 0.34)',
    ruler: 'rgba(228, 240, 255, 0.72)',
    clearance: 'rgba(0, 38, 130, 0.36)',
    accentWork: '#7CE0FF',
    accentCycling: '#FFD84D',
    avatarRing: 'rgba(228, 240, 255, 0.40)',
    shadowDark: 'rgba(0, 10, 42, 0.68)',
    shadowLight: 'rgba(130, 190, 255, 0.24)',
  },
  orange: {
    name: 'Signal Orange',
    bg: '#FF3F0A',
    ink: '#140904',
    ink2: '#221008',
    muted: '#301509',
    gridMinor: 'rgba(18, 9, 4, 0.13)',
    gridMajor: 'rgba(18, 9, 4, 0.32)',
    ruler: 'rgba(18, 9, 4, 0.68)',
    clearance: 'rgba(255, 63, 10, 0.34)',
    accentWork: '#150A05',
    accentCycling: '#FFF3B0',
    avatarRing: 'rgba(21, 10, 5, 0.36)',
    shadowDark: 'rgba(92, 10, 0, 0.54)',
    shadowLight: 'rgba(255, 206, 132, 0.28)',
  },
  pink: {
    name: 'Rose Pink',
    bg: '#AD4679',
    ink: '#FFFFFF',
    ink2: '#FFF3F9',
    muted: '#FFECF6',
    gridMinor: 'rgba(255, 240, 248, 0.14)',
    gridMajor: 'rgba(255, 240, 248, 0.34)',
    ruler: 'rgba(255, 240, 248, 0.72)',
    clearance: 'rgba(168, 68, 118, 0.34)',
    accentWork: '#FFE1F0',
    accentCycling: '#FFD84D',
    avatarRing: 'rgba(255, 240, 248, 0.42)',
    shadowDark: 'rgba(58, 8, 34, 0.60)',
    shadowLight: 'rgba(255, 212, 236, 0.28)',
  },
};

const STICKER_SLOTS = [
  { left: 788, top: 212, size: 92, rot: -6 },
  { left: 902, top: 194, size: 96, rot: 5 },
  { left: 1018, top: 216, size: 90, rot: -4 },
  { left: 808, top: 334, size: 94, rot: 6 },
  { left: 924, top: 320, size: 92, rot: -5 },
  { left: 1034, top: 342, size: 90, rot: 7 },
];

const CARDS = [
  {
    id: 'work',
    file: 'og-image.png',
    avatar: 'assets/avatars/work.png',
    eyebrow: 'Hi, I\u2019m',
    line1: 'Ar Razy Fathan',
    line2: 'Rabbani',
    subtitle: 'Mobile Engineer \u00b7 Android & iOS',
    urlLabel: 'arrazyfathan.com',
    accentKey: 'accentWork',
    icons: [
      'assets/icons/platform/android.svg',
      'assets/icons/platform/apple.svg',
      'assets/icons/lang/kotlin.svg',
      'assets/icons/lang/jetpack-compose.svg',
      'assets/icons/platform/flutter.svg',
      'assets/icons/lang/kmp.svg',
    ],
  },
  {
    id: 'cycling',
    file: 'og-cycling.png',
    avatar: 'assets/avatars/cycling.png',
    eyebrow: 'On two wheels,',
    line1: 'Ar Razy Fathan',
    line2: 'Rabbani',
    subtitle: 'Cycling & Road Photos \u00b7 Surakarta',
    urlLabel: 'arrazyfathan.com/cycling',
    accentKey: 'accentCycling',
    icons: [
      'assets/icons/cycling/bicycle.svg',
      'assets/icons/cycling/strava.svg',
      'assets/icons/cycling/fire-streak.svg',
      'assets/icons/cycling/bike-hills.svg',
      'assets/icons/cycling/iced-coffee.svg',
      'assets/icons/cycling/bike-climbs.svg',
    ],
  },
  {
    id: 'connect',
    file: 'og-connect.png',
    avatar: 'assets/avatars/work.png',
    eyebrow: 'Where to find me',
    line1: 'Ar Razy Fathan',
    line2: 'Rabbani',
    subtitle: 'Email \u00b7 Resume \u00b7 LinkedIn \u00b7 GitHub \u00b7 X \u00b7 Strava',
    urlLabel: 'arrazyfathan.com/connect',
    accentKey: 'accentWork',
    icons: [
      'assets/icons/connect/email.svg',
      'assets/icons/connect/resume.svg',
      'assets/icons/connect/linkedin.svg',
      'assets/icons/connect/github.svg',
      'assets/icons/connect/x.svg',
      'assets/icons/cycling/strava.svg',
    ],
  },
];

function parseArgs(argv) {
  let mat = 'green';
  let updateHtml = false;
  let outDir = join(ROOT, 'assets');

  for (const arg of argv) {
    if (arg.startsWith('--mat=')) {
      mat = arg.slice('--mat='.length).toLowerCase();
    } else if (arg === '--update-html') {
      updateHtml = true;
    } else if (arg.startsWith('--out-dir=')) {
      outDir = resolve(ROOT, arg.slice('--out-dir='.length));
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/generate-og.mjs [--mat=${Object.keys(PALETTES).join('|')}] [--update-html]`);
      process.exit(0);
    }
  }

  if (!PALETTES[mat]) {
    console.error(`Unknown --mat "${mat}". Choose one of: ${Object.keys(PALETTES).join(', ')}`);
    process.exit(1);
  }

  return { mat, updateHtml, outDir };
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  console.error('Could not find Chrome/Chromium binary. Set CHROME_PATH env variable.');
  process.exit(1);
}

function toDataUri(relPath) {
  const buf = readFileSync(join(ROOT, relPath));
  const mime = relPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function buildRulerSvg() {
  const topTicks = [];
  const bottomTicks = [];
  const topNums = [];
  const bottomNums = [];

  // Horizontal frame: x = 36..1164 (width 1128), y = 36..594 (height 558)
  for (let x = 120, n = 40; x <= 1080; x += 60) {
    const isMajor = x % 120 === 0;
    if (isMajor) {
      topTicks.push(`M${x} 26v10`);
      bottomTicks.push(`M${x} 594v10`);
      topNums.push(`<text x="${x}" y="20">${n}</text>`);
      bottomNums.push(`<text x="${x}" y="618">${n}</text>`);
      n -= 5;
    } else {
      topTicks.push(`M${x} 30v6`);
      bottomTicks.push(`M${x} 594v6`);
    }
  }

  const leftTicks = [];
  const rightTicks = [];
  const leftNums = [];
  const rightNums = [];

  for (let y = 120, n = 20; y <= 540; y += 60) {
    const isMajor = y % 120 === 0;
    if (isMajor) {
      leftTicks.push(`M26 ${y}h10`);
      rightTicks.push(`M1164 ${y}h10`);
      leftNums.push(`<text x="16" y="${y + 4}">${n}</text>`);
      rightNums.push(`<text x="1184" y="${y + 4}">${n}</text>`);
      n -= 5;
    } else {
      leftTicks.push(`M30 ${y}h6`);
      rightTicks.push(`M1164 ${y}h6`);
    }
  }

  return `
    <svg class="drafting" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Outer cutting mat frame -->
      <rect x="36" y="36" width="1128" height="558" stroke="currentColor" stroke-width="1.25" opacity="0.62" />
      <!-- Subtle corner registration marks -->
      <g stroke="currentColor" stroke-width="1.2" opacity="0.55">
        <path d="${topTicks.join('')}${bottomTicks.join('')}${leftTicks.join('')}${rightTicks.join('')}" />
      </g>
      <!-- Ruler numerals -->
      <g fill="currentColor" font-family="'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10.5" opacity="0.68" text-anchor="middle">
        ${topNums.join('')}
        ${bottomNums.join('')}
        ${leftNums.join('')}
        ${rightNums.join('')}
      </g>
      <!-- Bottom-right protractor quarter-arc & dashed angle guides -->
      <g stroke="currentColor" opacity="0.46">
        <path d="M 1164 174 A 420 420 0 0 0 744 594" stroke-width="1.15" />
        <line x1="1164" y1="594" x2="1055" y2="188" stroke-width="1" stroke-dasharray="5 5" />
        <line x1="1164" y1="594" x2="954" y2="230" stroke-width="1" stroke-dasharray="5 5" />
        <line x1="1164" y1="594" x2="867" y2="297" stroke-width="1" stroke-dasharray="5 5" />
        <line x1="1164" y1="594" x2="800" y2="384" stroke-width="1" stroke-dasharray="5 5" />
        <line x1="36" y1="36" x2="318" y2="198" stroke-width="1" stroke-dasharray="5 5" opacity="0.48" />
      </g>
      <g fill="currentColor" font-family="'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10.5" opacity="0.66">
        <text x="1096" y="422">15°</text>
        <text x="1044" y="452">30°</text>
        <text x="998" y="488">45°</text>
        <text x="962" y="530">60°</text>
      </g>
    </svg>
  `;
}

function renderCardHtml(card, palette, avatarDataUri, iconDataUris) {
  const accent = palette[card.accentKey];
  const stickersHtml = iconDataUris
    .map((src, i) => {
      const slot = STICKER_SLOTS[i];
      if (!slot) return '';
      return `<img class="sticker" src="${src}" alt="" style="left:${slot.left}px;top:${slot.top}px;width:${slot.size}px;height:${slot.size}px;transform:rotate(${slot.rot}deg);" />`;
    })
    .join('\n      ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Gabarito:wght@700;800&family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1200px;
      height: 630px;
      overflow: hidden;
      background: ${palette.bg};
      color: ${palette.ink};
      font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .canvas {
      position: relative;
      width: 1200px;
      height: 630px;
      background: ${palette.bg};
      overflow: hidden;
    }
    .grid {
      position: absolute;
      inset: 36px;
      background-image:
        linear-gradient(to right, ${palette.gridMajor} 1px, transparent 1px),
        linear-gradient(to bottom, ${palette.gridMajor} 1px, transparent 1px),
        linear-gradient(to right, ${palette.gridMinor} 1px, transparent 1px),
        linear-gradient(to bottom, ${palette.gridMinor} 1px, transparent 1px);
      background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px;
      background-position: -36px -36px;
    }
    .clearance {
      position: absolute;
      inset: 36px;
      background: radial-gradient(
        ellipse 66% 74% at 38% 50%,
        ${palette.clearance} 0%,
        transparent 78%
      );
    }
    .light {
      position: absolute;
      inset: -12%;
      background:
        radial-gradient(50% 38% at 12% 14%, ${palette.shadowDark} 0%, transparent 64%),
        radial-gradient(46% 52% at 90% 16%, ${palette.shadowDark} 0%, transparent 62%),
        radial-gradient(52% 44% at 78% 88%, ${palette.shadowDark} 0%, transparent 64%),
        radial-gradient(40% 34% at 44% 38%, ${palette.shadowLight} 0%, transparent 66%),
        linear-gradient(
          128deg,
          ${palette.shadowDark} 0%,
          transparent 24%,
          ${palette.shadowLight} 44%,
          transparent 58%,
          ${palette.shadowDark} 84%,
          transparent 100%
        );
      opacity: 0.62;
    }
    .light-dapple {
      position: absolute;
      inset: -6%;
      background:
        radial-gradient(36% 24% at 22% 74%, ${palette.shadowDark} 0%, transparent 64%),
        radial-gradient(30% 24% at 68% 30%, ${palette.shadowDark} 0%, transparent 62%),
        radial-gradient(28% 20% at 38% 18%, ${palette.shadowDark} 0%, transparent 60%),
        radial-gradient(34% 28% at 62% 58%, ${palette.shadowLight} 0%, transparent 68%),
        radial-gradient(ellipse 92% 92% at 50% 50%, transparent 62%, ${palette.shadowDark} 100%);
      opacity: 0.48;
    }
    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.055;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
      mix-blend-mode: overlay;
    }
    .drafting {
      position: absolute;
      inset: 0;
      width: 1200px;
      height: 630px;
      color: ${palette.ruler};
    }
    .content {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100%;
      padding: 84px 124px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 24px;
    }
    .avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid ${palette.avatarRing};
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
      flex-shrink: 0;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .eyebrow-text {
      font-size: 27px;
      font-weight: 500;
      letter-spacing: -0.015em;
      color: ${palette.ink2};
    }
    .headline {
      font-family: 'Gabarito', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 96px;
      font-weight: 800;
      line-height: 0.96;
      letter-spacing: -0.03em;
      color: ${palette.ink};
      max-width: 820px;
      text-shadow: 0 3px 12px rgba(0, 12, 8, 0.18);
    }
    .marker-line {
      margin-top: 22px;
      margin-bottom: 24px;
      display: block;
    }
    .subtitle {
      font-size: 28px;
      font-weight: 400;
      letter-spacing: -0.01em;
      color: ${palette.muted};
      margin-bottom: 34px;
    }
    .url-row {
      display: inline-flex;
      align-items: center;
      gap: 11px;
      font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 20px;
      font-weight: 500;
      letter-spacing: -0.01em;
      color: ${palette.ink};
    }
    .globe {
      width: 22px;
      height: 22px;
      color: ${accent};
      flex-shrink: 0;
    }
    .stickers {
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
    }
    .sticker {
      position: absolute;
      display: block;
      object-fit: contain;
      filter:
        drop-shadow(0 3px 5px rgba(0, 10, 7, 0.28))
        drop-shadow(0 12px 20px rgba(0, 14, 10, 0.36));
    }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="grid"></div>
    <div class="clearance"></div>
    ${buildRulerSvg()}
    <div class="light"></div>
    <div class="light-dapple"></div>
    <div class="grain"></div>
    <div class="stickers" aria-hidden="true">
      ${stickersHtml}
    </div>
    <main class="content">
      <div class="eyebrow">
        <span class="avatar"><img src="${avatarDataUri}" alt="" /></span>
        <span class="eyebrow-text">${card.eyebrow}</span>
      </div>
      <h1 class="headline">${card.line1}<br />${card.line2}</h1>
      <svg class="marker-line" width="96" height="12" viewBox="0 0 96 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 7.5C24 4.2 58 3.6 93 6.2" stroke="${accent}" stroke-width="6.2" stroke-linecap="round" />
      </svg>
      <p class="subtitle">${card.subtitle}</p>
      <div class="url-row">
        <svg class="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>${card.urlLabel}</span>
      </div>
    </main>
  </div>
</body>
</html>`;
}

function updateHtmlMetaTags(mat) {
  const version = `mat-${mat}`;
  const targets = [
    { file: 'index.html', image: 'og-image.png' },
    { file: 'cycling/index.html', image: 'og-cycling.png' },
    { file: 'connect/index.html', image: 'og-connect.png' },
  ];

  for (const { file, image } of targets) {
    const abs = join(ROOT, file);
    let html = readFileSync(abs, 'utf8');
    const url = `https://arrazyfathan.com/assets/${image}?v=${version}`;
    html = html.replace(
      /(<meta\s+(?:property="og:image"|name="twitter:image")\s+content=")https:\/\/arrazyfathan\.com\/assets\/og-[a-z-]+\.png(?:\?v=[^"]*)?(")/g,
      `$1${url}$2`
    );
    writeFileSync(abs, html, 'utf8');
    console.log(`Updated meta tags in ${file} -> ${url}`);
  }
}

function main() {
  const { mat, updateHtml, outDir } = parseArgs(process.argv.slice(2));
  const palette = PALETTES[mat];
  const chrome = findChrome();
  const workDir = mkdtempSync(join(tmpdir(), 'og-mat-'));
  const assetCache = new Map();
  const getAsset = (relPath) => {
    if (!assetCache.has(relPath)) {
      assetCache.set(relPath, toDataUri(relPath));
    }
    return assetCache.get(relPath);
  };

  try {
    console.log(`Generating Cutting Mat (${palette.name}) OG cards...`);
    for (const card of CARDS) {
      const htmlPath = join(workDir, `${card.id}.html`);
      const outPath = join(outDir, card.file);
      const iconDataUris = (card.icons || []).map(getAsset);
      writeFileSync(
        htmlPath,
        renderCardHtml(card, palette, getAsset(card.avatar), iconDataUris),
        'utf8'
      );

      execFileSync(
        chrome,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          '--window-size=1200,630',
          '--virtual-time-budget=6000',
          `--screenshot=${outPath}`,
          `file://${htmlPath}`,
        ],
        { stdio: 'pipe' }
      );
      console.log(`  ✓ ${card.file} (1200x630)`);
    }

    if (updateHtml) {
      updateHtmlMetaTags(mat);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();

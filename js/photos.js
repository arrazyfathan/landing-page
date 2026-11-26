import { playClick, playPop } from './sound.js?v=2';

let photos = [];
let tileStates = [];
let a11yButtons = [];
let drawOrder = [];

let activeIndex = 0;
let isOpen = false;
let isClosing = false;
let openedAt = 0;
let closeTimer = null;
let hiddenTileIndex = -1;

// WatchOS Radial Lens DOM
const galleryEl = document.getElementById('watch-gallery');
const viewportEl = document.getElementById('watch-viewport');
const canvasEl = document.getElementById('watch-canvas');
const a11yListEl = document.getElementById('watch-a11y-list');
const countEl = document.getElementById('photo-count');
const hudDateEl = document.getElementById('watch-hud-date');
const hudIndexEl = document.getElementById('watch-hud-index');
const panBtnEl = document.getElementById('watch-pan-btn');
const resetBtnEl = document.getElementById('watch-reset-btn');

// Opaque canvas (alpha: false) eliminates full-viewport compositor alpha blending every frame
const ctx = canvasEl ? canvasEl.getContext('2d', { alpha: false }) : null;

// Frosted FLIP Lightbox DOM
const viewer = document.getElementById('photo-lightbox');
const backdrop = document.getElementById('viewer-backdrop');
const lbImg = document.getElementById('lb-img');
const lbDate = document.getElementById('lb-date');
const lbCamera = document.getElementById('lb-camera');
const lbCounter = document.getElementById('lb-counter');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');
const lbClose = document.getElementById('lb-close');

// WatchOS Pan & Hover Physics State
let panX = 0;
let panY = 0;
let panVelX = 0;
let panVelY = 0;
let targetPanX = null;
let targetPanY = null;
let maxPanX = 280;
let maxPanY = 280;

let isPointerDown = false;
let isDragging = false;
let isFreePan = false;
let dragAllowVertical = true;
let activePointerId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginPanX = 0;
let dragOriginPanY = 0;
let velocitySamples = [];

let hoveredIndex = -1;
let focusedIndex = -1;
let pointerInside = false;
let pendingClientX = 0;
let pendingClientY = 0;
let hoverCheckDirty = false;

// Cached viewport geometry & theme tokens
let vpCenterX = 0;
let vpCenterY = 0;
let vpRectDirty = true;
let dpr = 1;

let theme = {
  isDark: false,
  bgHex: '#FBFAF7',
  bgRgb: '251, 250, 247',
  surface: '#FFFFFF',
  sunken: '#F2F0EA',
  accent: '#FFC629',
  tileRim: 'rgba(23, 21, 15, 0.10)',
  hoverRim: 'rgba(23, 21, 15, 0.16)',
  hoverShadow: 'rgba(23, 21, 15, 0.22)',
};

// Pre-rendered shared GPU sprites (ONE texture atlas + cached Light/Dark shadow & vignette sprites)
let sharpAtlas = null;
let sharpAtlasCtx = null;
let blurAtlas = null;
let blurAtlasCtx = null;
let shadowSprite = null;
let vignetteCanvas = null;
const shadowSpriteCache = { light: null, dark: null };
const vignetteCache = { light: null, dark: null };

// Single-atlas cell dimensions (packed grid: 8 columns x 5 rows = up to 40 photos in ONE GPU texture!)
const ATLAS_COLS = 8;
const SHARP_W = 164;
const SHARP_H = 200;
const SHARP_R = 28;

// Padded true-Gaussian blurred cells in blurAtlas (soft left, deep right)
const BLUR_W = 96;
const BLUR_H = 116;
const BLUR_PAD_RATIO = 0.28;

// Pre-baked shadow sprite dimensions (eliminates runtime ctx.shadowBlur completely!)
const SHADOW_W = 180;
const SHADOW_H = 212;
const SHADOW_PAD_X = 0.26;
const SHADOW_PAD_Y = 0.24;

let lastHudIndex = -1;
let lastResetHidden = true;
let lastGalleryHover = false;
let lastPointerCursor = false;
let lastLensPanX = NaN;
let lastLensPanY = NaN;
let lastClosestIdx = 0;
let rafId = null;
let lastFrameTime = 0;

let metrics = {
  vpW: 960,
  vpH: 540,
  tileW: 80,
  tileH: 98,
  tileR: 14,
  spacingX: 94,
  spacingY: 112,
  hoverScale: 1.72,
  lensRx: 410,
  lensRy: 248,
};

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function traceRoundedRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  c.beginPath();
  if (typeof c.roundRect === 'function') {
    c.roundRect(x, y, w, h, rr);
  } else {
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
}

/** Apple fluid-interface progressive rubber-banding at pan boundaries */
function rubberband(overshoot, dimension, constant = 0.48) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function applyBoundsWithRubberband(raw, limit, dimension) {
  if (raw > limit) return limit + rubberband(raw - limit, dimension);
  if (raw < -limit) return -limit - rubberband(-limit - raw, dimension);
  return raw;
}

/**
 * Centered orthogonal rectangular grid ordered from center outward.
 * For 37 photos: 100% symmetric 9x5 landscape rectangle (5, 9, 9, 9, 5)
 * with straight rows & columns and Photo #1 at (0, 0).
 */
function buildRectCoords(count) {
  let cols = Math.max(5, Math.ceil(Math.sqrt(count * 1.75)));
  if (cols % 2 === 0) cols += 1;
  let rows = Math.max(3, Math.ceil(count / cols));
  if (rows % 2 === 0) rows += 1;
  while (cols * rows < count) {
    cols += 2;
  }

  const halfC = (cols - 1) / 2;
  const halfR = (rows - 1) / 2;
  const cells = [];

  for (let r = -halfR; r <= halfR; r++) {
    for (let c = -halfC; c <= halfC; c++) {
      const dist = Math.hypot(c / (halfC + 0.5), r / (halfR + 0.5));
      const angle = Math.atan2(r, c);
      const ring = Math.max(Math.abs(c), Math.abs(r));
      cells.push({ col: c, row: r, ring, dist, angle });
    }
  }

  cells.sort((a, b) => {
    if (Math.abs(a.dist - b.dist) > 1e-6) return a.dist - b.dist;
    return a.angle - b.angle;
  });

  return cells.slice(0, count);
}

function initAtlases(count) {
  const rows = Math.ceil(count / ATLAS_COLS);

  sharpAtlas = document.createElement('canvas');
  sharpAtlas.width = ATLAS_COLS * SHARP_W;
  sharpAtlas.height = rows * SHARP_H;
  sharpAtlasCtx = sharpAtlas.getContext('2d');
  sharpAtlasCtx.imageSmoothingEnabled = true;
  sharpAtlasCtx.imageSmoothingQuality = 'high';

  // blurAtlas stores BOTH soft (left col) and deep (right col) in one tiny texture
  blurAtlas = document.createElement('canvas');
  blurAtlas.width = ATLAS_COLS * BLUR_W * 2;
  blurAtlas.height = rows * BLUR_H;
  blurAtlasCtx = blurAtlas.getContext('2d');
  blurAtlasCtx.imageSmoothingEnabled = true;
  blurAtlasCtx.imageSmoothingQuality = 'high';
}

// Scratch canvases reused during one-time baking (zero extra allocations)
let tmpCard = null;
let tmpCardCtx = null;
let tmpBlur = null;
let tmpBlurCtx = null;
let supportsCanvasFilter = null;

function ensureBakeScratch() {
  if (tmpCard) return;
  tmpCard = document.createElement('canvas');
  tmpCard.width = SHARP_W;
  tmpCard.height = SHARP_H;
  tmpCardCtx = tmpCard.getContext('2d');
  tmpCardCtx.imageSmoothingEnabled = true;
  tmpCardCtx.imageSmoothingQuality = 'high';

  tmpBlur = document.createElement('canvas');
  tmpBlur.width = BLUR_W;
  tmpBlur.height = BLUR_H;
  tmpBlurCtx = tmpBlur.getContext('2d');
  tmpBlurCtx.imageSmoothingEnabled = true;
  tmpBlurCtx.imageSmoothingQuality = 'high';

  // Feature-detect real ctx.filter support once
  supportsCanvasFilter = typeof tmpBlurCtx.filter === 'string';
}

/**
 * Bake one photo into the shared GPU sprite atlases ONCE on load:
 *  - sharpAtlas cell: crisp @2x rounded-rect card + hairline rim + top specular gleam
 *  - blurAtlas soft & deep cells: true optical Gaussian blur with generous halo padding
 * Zero runtime performance cost: tick() still blits the exact same 1-2 atlas quads!
 */
function bakePhotoIntoAtlases(img, idx) {
  if (!sharpAtlasCtx || !blurAtlasCtx) return;
  ensureBakeScratch();

  const col = idx % ATLAS_COLS;
  const row = Math.floor(idx / ATLAS_COLS);

  const nw = img.naturalWidth || 200;
  const nh = img.naturalHeight || 355;
  const srcRatio = nw / nh;
  const dstRatio = SHARP_W / SHARP_H;

  let sx = 0;
  let sy = 0;
  let sw = nw;
  let sh = nh;
  if (srcRatio > dstRatio) {
    sw = nh * dstRatio;
    sx = (nw - sw) * 0.5;
  } else {
    sh = nw / dstRatio;
    sy = (nh - sh) * 0.5;
  }

  // 1. Draw crisp rounded card into reusable scratch canvas
  tmpCardCtx.clearRect(0, 0, SHARP_W, SHARP_H);
  tmpCardCtx.save();
  traceRoundedRect(tmpCardCtx, 0, 0, SHARP_W, SHARP_H, SHARP_R);
  tmpCardCtx.clip();
  tmpCardCtx.drawImage(img, sx, sy, sw, sh, 0, 0, SHARP_W, SHARP_H);

  // Subtle top specular highlight
  const gleam = tmpCardCtx.createLinearGradient(0, 0, 0, 5);
  gleam.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  gleam.addColorStop(1, 'rgba(255, 255, 255, 0)');
  tmpCardCtx.fillStyle = gleam;
  tmpCardCtx.fillRect(0, 0, SHARP_W, 5);

  // Subtle inner hairline rim baked right in
  traceRoundedRect(tmpCardCtx, 0.8, 0.8, SHARP_W - 1.6, SHARP_H - 1.6, SHARP_R - 0.8);
  tmpCardCtx.lineWidth = 1.6;
  tmpCardCtx.strokeStyle = 'rgba(23, 21, 15, 0.12)';
  tmpCardCtx.stroke();
  tmpCardCtx.restore();

  // Copy crisp card into sharpAtlas
  const sharpX = col * SHARP_W;
  const sharpY = row * SHARP_H;
  sharpAtlasCtx.clearRect(sharpX, sharpY, SHARP_W, SHARP_H);
  sharpAtlasCtx.drawImage(tmpCard, sharpX, sharpY);

  // 2. Bake silky optical Gaussian blur cells into blurAtlas (isolated per-cell so zero bleed!)
  const innerW = BLUR_W / (1 + BLUR_PAD_RATIO * 2);
  const innerH = BLUR_H / (1 + BLUR_PAD_RATIO * 2);
  const padX = (BLUR_W - innerW) * 0.5;
  const padY = (BLUR_H - innerH) * 0.5;

  function bakeGaussianCell(blurPx, destX, destY) {
    tmpBlurCtx.save();
    tmpBlurCtx.clearRect(0, 0, BLUR_W, BLUR_H);

    if (supportsCanvasFilter) {
      tmpBlurCtx.filter = `blur(${blurPx}px)`;
      tmpBlurCtx.drawImage(tmpCard, padX, padY, innerW, innerH);
      tmpBlurCtx.filter = 'none';
    } else {
      // Smooth radial 12-tap Gaussian fallback for browsers without ctx.filter
      tmpBlurCtx.globalAlpha = 0.22;
      tmpBlurCtx.drawImage(tmpCard, padX, padY, innerW, innerH);
      const taps = 12;
      tmpBlurCtx.globalAlpha = 0.78 / taps;
      for (let t = 0; t < taps; t++) {
        const ang = (t / taps) * Math.PI * 2;
        const rad = blurPx * (t % 2 === 0 ? 0.95 : 0.48);
        tmpBlurCtx.drawImage(
          tmpCard,
          padX + Math.cos(ang) * rad,
          padY + Math.sin(ang) * rad,
          innerW,
          innerH
        );
      }
    }

    tmpBlurCtx.restore();
    blurAtlasCtx.clearRect(destX, destY, BLUR_W, BLUR_H);
    blurAtlasCtx.drawImage(tmpBlur, destX, destY);
  }

  const blurBaseX = col * BLUR_W * 2;
  const blurBaseY = row * BLUR_H;
  bakeGaussianCell(3.2, blurBaseX, blurBaseY); // silky soft optical blur
  bakeGaussianCell(7.2, blurBaseX + BLUR_W, blurBaseY); // velvety deep radial mist

  const st = tileStates[idx];
  if (st) {
    st.sharpX = sharpX;
    st.sharpY = sharpY;
    st.softX = blurBaseX;
    st.softY = blurBaseY;
    st.deepX = blurBaseX + BLUR_W;
    st.deepY = blurBaseY;
    st.loaded = true;
  }
}

/** Pre-bake ONE soft elevation shadow sprite per theme (cached for 0ms theme toggles) */
function rebuildShadowSprite() {
  const key = theme.isDark ? 'dark' : 'light';
  if (shadowSpriteCache[key]) {
    shadowSprite = shadowSpriteCache[key];
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = SHADOW_W;
  canvas.height = SHADOW_H;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, SHADOW_W, SHADOW_H);

  const cardW = SHADOW_W / (1 + SHADOW_PAD_X * 2);
  const cardH = SHADOW_H / (1 + SHADOW_PAD_Y * 2);
  const ox = (SHADOW_W - cardW) * 0.5;
  const oy = (SHADOW_H - cardH) * 0.5;

  // Inset the shadow caster by 2px on all sides so ONLY the soft blurred shadow peeks out — never a solid white edge
  c.save();
  c.shadowColor = theme.hoverShadow;
  c.shadowBlur = 22;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 8;
  c.fillStyle = theme.hoverShadow;
  traceRoundedRect(c, ox + 2, oy + 2, cardW - 4, cardH - 4, 15);
  c.fill();
  c.restore();

  // Punch out the interior card area so shadow never tints the card edge unevenly
  c.save();
  c.globalCompositeOperation = 'destination-out';
  traceRoundedRect(c, ox + 1, oy + 1, cardW - 2, cardH - 2, 16);
  c.fill();
  c.restore();

  shadowSpriteCache[key] = canvas;
  shadowSprite = canvas;
}

function readTheme() {
  const isDark = document.documentElement.getAttribute('data-day') === 'sun';
  theme = isDark
    ? {
        isDark: true,
        bgHex: '#14120E',
        bgRgb: '20, 18, 14',
        surface: '#1D1B16',
        sunken: '#24211B',
        accent: '#F5C128',
        tileRim: 'rgba(244, 239, 228, 0.14)',
        hoverRim: 'rgba(244, 239, 228, 0.24)',
        hoverShadow: 'rgba(0, 0, 0, 0.62)',
      }
    : {
        isDark: false,
        bgHex: '#FBFAF7',
        bgRgb: '251, 250, 247',
        surface: '#FFFFFF',
        sunken: '#F2F0EA',
        accent: '#FFC629',
        tileRim: 'rgba(23, 21, 15, 0.09)',
        hoverRim: 'rgba(23, 21, 15, 0.16)',
        hoverShadow: 'rgba(23, 21, 15, 0.22)',
      };
  rebuildShadowSprite();
  rebuildVignetteCanvas();
}

/** Pre-render half-res elliptical radial paper opacity vignette per theme (cached for 0ms theme toggles) */
function rebuildVignetteCanvas() {
  const w = Math.max(1, Math.round(metrics.vpW * 0.5));
  const h = Math.max(1, Math.round(metrics.vpH * 0.5));
  const key = theme.isDark ? 'dark' : 'light';
  const cached = vignetteCache[key];
  if (cached && cached.width === w && cached.height === h) {
    vignetteCanvas = cached;
    return;
  }

  const canvas = cached || document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const vCtx = canvas.getContext('2d');
  vCtx.clearRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const rx = w * 0.52;
  const ry = h * 0.51;

  vCtx.save();
  vCtx.translate(cx, cy);
  vCtx.scale(rx, ry);

  const grad = vCtx.createRadialGradient(0, 0, 0.44, 0, 0, 1.02);
  grad.addColorStop(0.0, `rgba(${theme.bgRgb}, 0)`);
  grad.addColorStop(0.28, `rgba(${theme.bgRgb}, 0.15)`);
  grad.addColorStop(0.58, `rgba(${theme.bgRgb}, 0.52)`);
  grad.addColorStop(0.82, `rgba(${theme.bgRgb}, 0.86)`);
  grad.addColorStop(1.0, `rgba(${theme.bgRgb}, 1)`);

  vCtx.fillStyle = grad;
  vCtx.fillRect(-2, -2, 4, 4);
  vCtx.restore();

  vignetteCache[key] = canvas;
  vignetteCanvas = canvas;
}

function refreshViewportCenter() {
  if (!viewportEl) return null;
  const rect = viewportEl.getBoundingClientRect();
  vpCenterX = rect.left + rect.width * 0.5;
  vpCenterY = rect.top + rect.height * 0.5;
  vpRectDirty = false;
  return rect;
}

function readMetrics() {
  if (!viewportEl || !canvasEl || !ctx) return;
  const rect = refreshViewportCenter();
  const vw = window.innerWidth;

  let vpW;
  let vpH;
  let tileW;
  let tileH;
  let tileR;
  let spacingX;
  let spacingY;
  let hoverScale;

  if (vw <= 600) {
    vpW = rect.width || vw - 16;
    vpH = rect.height || 368;
    tileW = 56;
    tileH = 68;
    tileR = 11;
    spacingX = 66;
    spacingY = 76;
    hoverScale = 1.44;
  } else if (vw <= 900) {
    vpW = rect.width || vw - 24;
    vpH = rect.height || 460;
    tileW = 72;
    tileH = 88;
    tileR = 13;
    spacingX = 86;
    spacingY = 102;
    hoverScale = 1.60;
  } else {
    vpW = rect.width || 1000;
    vpH = rect.height || 540;
    tileW = 84;
    tileH = 102;
    tileR = 15;
    spacingX = 100;
    spacingY = 118;
    hoverScale = 1.68;
  }

  const isCompact = vpW <= 600;
  metrics = {
    vpW,
    vpH,
    tileW,
    tileH,
    tileR,
    spacingX,
    spacingY,
    hoverScale,
    lensRx: isCompact
      ? Math.max(vpW * 0.47, spacingX * 2.45)
      : Math.max(vpW * 0.43, spacingX * 3.9),
    lensRy: isCompact
      ? Math.max(vpH * 0.49, spacingY * 2.15)
      : Math.max(vpH * 0.46, spacingY * 2.18),
  };

  // Cap DPR to 1.5 on large desktop canvases (visually razor-sharp while cutting fill-rate 44%)
  const rawDpr = window.devicePixelRatio || 1;
  dpr = Math.min(rawDpr, vw > 600 ? 1.5 : 2);
  const pixelW = Math.max(1, Math.round(vpW * dpr));
  const pixelH = Math.max(1, Math.round(vpH * dpr));
  if (canvasEl.width !== pixelW || canvasEl.height !== pixelH) {
    canvasEl.width = pixelW;
    canvasEl.height = pixelH;
  }

  rebuildVignetteCanvas();

  let farthestX = 0;
  let farthestY = 0;

  for (let i = 0; i < tileStates.length; i++) {
    const st = tileStates[i];
    st.baseX = st.col * spacingX;
    st.baseY = st.row * spacingY;
    const ax = Math.abs(st.baseX);
    const ay = Math.abs(st.baseY);
    if (ax > farthestX) farthestX = ax;
    if (ay > farthestY) farthestY = ay;
  }

  maxPanX = Math.max(120, farthestX * 0.94);
  maxPanY = Math.max(100, farthestY * 0.94);

  panX = clamp(panX, -maxPanX, maxPanX);
  panY = clamp(panY, -maxPanY, maxPanY);
  lastLensPanX = NaN;
  lastLensPanY = NaN;
}

function updateHud(idx) {
  if (!photos.length) return;
  const safeIdx = clamp(idx, 0, photos.length - 1);
  if (safeIdx === lastHudIndex) return;
  lastHudIndex = safeIdx;
  const item = photos[safeIdx];
  if (hudDateEl) hudDateEl.textContent = item.date || 'Road shot';
  if (hudIndexEl) {
    const num = String(safeIdx + 1).padStart(2, '0');
    const total = String(photos.length).padStart(2, '0');
    hudIndexEl.textContent = `${num} / ${total}`;
  }
}

function syncResetButton() {
  if (!resetBtnEl) return;
  const shouldHide = panX * panX + panY * panY < 1156;
  if (shouldHide !== lastResetHidden) {
    lastResetHidden = shouldHide;
    resetBtnEl.hidden = shouldHide;
  }
}

function getActiveHighlightIndex() {
  if (isDragging) return -1;
  if (hoveredIndex >= 0) return hoveredIndex;
  if (focusedIndex >= 0) return focusedIndex;
  return -1;
}

function computeLensInto(st, px, py) {
  const rx = st.baseX + px;
  const ry = st.baseY + py;
  const invRx = rx / metrics.lensRx;
  const invRy = ry / metrics.lensRy;
  const normDist = Math.sqrt(invRx * invRx + invRy * invRy);

  const pull = 1 - 0.14 * smoothstep(0.22, 1.18, normDist);
  st.lensX = rx * pull;
  st.lensY = ry * pull;
  st.normDist = normDist;

  const edgeT = smoothstep(0.08, 1.12, normDist);
  st.baseScale = lerp(1.14, 0.52, edgeT) * (1 - 0.14 * smoothstep(1.08, 1.58, normDist));

  const opT = smoothstep(0.36, 1.15, normDist);
  st.baseOpacity = lerp(1.0, 0.28, opT) * (1 - smoothstep(1.16, 1.62, normDist));

  st.blurLevel = smoothstep(0.42, 1.04, normDist);
}

function resolveTileAt(px, py, stickyIndex) {
  if (!tileStates.length) return -1;

  if (stickyIndex >= 0 && stickyIndex < tileStates.length) {
    const cur = tileStates[stickyIndex];
    const restHalfW = metrics.tileW * cur.baseScale * 0.5 + 4;
    const restHalfH = metrics.tileH * cur.baseScale * 0.5 + 4;
    const inRest =
      Math.abs(px - cur.lensX) <= restHalfW && Math.abs(py - cur.lensY) <= restHalfH;

    const visHalfW = metrics.tileW * cur.lastScale * 0.5 + 2;
    const visHalfH = metrics.tileH * cur.lastScale * 0.5 + 2;
    const inVisual =
      Math.abs(px - cur.lastX) <= visHalfW && Math.abs(py - cur.lastY) <= visHalfH;

    if (inRest || inVisual) {
      return stickyIndex;
    }
  }

  let bestIdx = -1;
  let bestScore = Infinity;

  for (let i = 0; i < tileStates.length; i++) {
    const st = tileStates[i];
    if (st.baseOpacity < 0.04) continue;

    const halfW = metrics.tileW * st.baseScale * 0.5 + 3;
    const halfH = metrics.tileH * st.baseScale * 0.5 + 3;
    const dx = Math.abs(px - st.lensX);
    const dy = Math.abs(py - st.lensY);

    if (dx <= halfW && dy <= halfH) {
      const nx = dx / halfW;
      const ny = dy / halfH;
      const score = nx * nx + ny * ny;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }

  return bestIdx;
}

/**
 * Ultra-fast tile blit from shared GPU sprite atlases:
 * - ZERO ctx.shadowBlur (uses pre-baked shadowSprite!)
 * - ZERO ctx.clip()
 * - ZERO vector strokes on resting tiles
 */
function drawTile(st, idx, cx, cy, isActiveHover, isKeyboardFocused) {
  if (idx === hiddenTileIndex) return;

  const alpha = st.lastOpacity * st.loadAlpha;
  if (alpha < 0.015) return;

  const w = metrics.tileW * st.lastScale;
  const h = metrics.tileH * st.lastScale;
  const x = cx + st.lastX - w * 0.5;
  const y = cy + st.lastY - h * 0.5;

  if (x + w < -24 || x > metrics.vpW + 24 || y + h < -24 || y > metrics.vpH + 24) return;

  if (!st.loaded) {
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = theme.sunken;
    traceRoundedRect(ctx, x, y, w, h, metrics.tileR * st.lastScale);
    ctx.fill();
    return;
  }

  const hp = clamp(st.hoverProg, 0, 1);
  const blur = st.blurLevel * (1 - hp);

  // Pre-baked soft elevation shadow ONLY on the hovered/settling tile (pure GPU blit, zero shadowBlur!)
  if (isActiveHover && hp > 0.06 && shadowSprite) {
    const sw = w * (1 + SHADOW_PAD_X * 2);
    const sh = h * (1 + SHADOW_PAD_Y * 2);
    ctx.globalAlpha = alpha * hp;
    ctx.drawImage(shadowSprite, x - w * SHADOW_PAD_X, y - h * SHADOW_PAD_Y, sw, sh);
  }

  // Blit from shared sharpAtlas / blurAtlas (fast hardware bilinear sampling)
  if (blur <= 0.03) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sharpAtlas, st.sharpX, st.sharpY, SHARP_W, SHARP_H, x, y, w, h);
  } else if (blur < 0.52) {
    const t = blur / 0.52;
    const padW = w * BLUR_PAD_RATIO;
    const padH = h * BLUR_PAD_RATIO;
    if (1 - t > 0.03) {
      ctx.globalAlpha = alpha * (1 - t);
      ctx.drawImage(sharpAtlas, st.sharpX, st.sharpY, SHARP_W, SHARP_H, x, y, w, h);
    }
    ctx.globalAlpha = alpha * t;
    ctx.drawImage(blurAtlas, st.softX, st.softY, BLUR_W, BLUR_H, x - padW, y - padH, w + padW * 2, h + padH * 2);
  } else {
    const t = (blur - 0.52) / 0.48;
    const padW = w * BLUR_PAD_RATIO;
    const padH = h * BLUR_PAD_RATIO;
    if (1 - t > 0.03) {
      ctx.globalAlpha = alpha * (1 - t);
      ctx.drawImage(blurAtlas, st.softX, st.softY, BLUR_W, BLUR_H, x - padW, y - padH, w + padW * 2, h + padH * 2);
    }
    ctx.globalAlpha = alpha * t;
    ctx.drawImage(blurAtlas, st.deepX, st.deepY, BLUR_W, BLUR_H, x - padW, y - padH, w + padW * 2, h + padH * 2);
  }

  // Uniform archival mat border ONLY on the single active hovered/focused tile (identical width on all 4 sides)
  if (isActiveHover && hp > 0.08) {
    const r = metrics.tileR * st.lastScale;
    const matW = 2.0 * hp;
    ctx.globalAlpha = alpha;
    traceRoundedRect(ctx, x - matW * 0.5, y - matW * 0.5, w + matW, h + matW, r + matW * 0.5);
    ctx.lineWidth = matW;
    ctx.strokeStyle = theme.surface;
    ctx.stroke();

    const outerOff = matW + 0.4;
    traceRoundedRect(ctx, x - outerOff, y - outerOff, w + outerOff * 2, h + outerOff * 2, r + outerOff);
    ctx.lineWidth = isKeyboardFocused ? 2.2 : 1.0;
    ctx.strokeStyle = isKeyboardFocused ? theme.accent : theme.hoverRim;
    ctx.stroke();
  }
}

function wakeLoop() {
  if (rafId !== null) return;
  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function tick(now) {
  rafId = null;
  if (!ctx) return;

  const rawDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  const dt = Math.min(0.04, Math.max(0.004, rawDt));
  const dt60 = dt * 60;
  const reduced = prefersReducedMotion();

  let needsMoreFrames = false;

  // 1. Pan physics (programmatic spring target, flick momentum, or boundary bounce-back)
  if (!isDragging) {
    if (targetPanX !== null && targetPanY !== null) {
      if (reduced) {
        panX = targetPanX;
        panY = targetPanY;
        panVelX = 0;
        panVelY = 0;
        targetPanX = null;
        targetPanY = null;
      } else {
        const k = 185;
        const c = 27;
        panVelX += ((targetPanX - panX) * k - panVelX * c) * dt;
        panVelY += ((targetPanY - panY) * k - panVelY * c) * dt;
        panX += panVelX * dt;
        panY += panVelY * dt;

        if (
          Math.hypot(targetPanX - panX, targetPanY - panY) < 0.35 &&
          Math.hypot(panVelX, panVelY) < 2
        ) {
          panX = targetPanX;
          panY = targetPanY;
          panVelX = 0;
          panVelY = 0;
          targetPanX = null;
          targetPanY = null;
        } else {
          needsMoreFrames = true;
        }
      }
    } else {
      const clampedX = clamp(panX, -maxPanX, maxPanX);
      const clampedY = clamp(panY, -maxPanY, maxPanY);
      const outX = panX - clampedX;
      const outY = panY - clampedY;

      if (Math.abs(outX) > 0.25 || Math.abs(outY) > 0.25) {
        if (reduced) {
          panX = clampedX;
          panY = clampedY;
          panVelX = 0;
          panVelY = 0;
        } else {
          const k = 220;
          const c = 29;
          panVelX += (-outX * k - panVelX * c) * dt;
          panVelY += (-outY * k - panVelY * c) * dt;
          panX += panVelX * dt;
          panY += panVelY * dt;
          needsMoreFrames = true;
        }
      } else if (panVelX * panVelX + panVelY * panVelY > 16) {
        const friction = Math.pow(0.925, dt60);
        panVelX *= friction;
        panVelY *= friction;
        panX += panVelX * dt;
        panY += panVelY * dt;

        if (panX > maxPanX || panX < -maxPanX) panVelX *= Math.pow(0.7, dt60);
        if (panY > maxPanY || panY < -maxPanY) panVelY *= Math.pow(0.7, dt60);
        needsMoreFrames = true;
      } else {
        panVelX = 0;
        panVelY = 0;
      }
    }
  } else {
    needsMoreFrames = true;
  }

  syncResetButton();

  // 2. Update spherical lens coordinates ONLY when pan or metrics changed
  if (panX !== lastLensPanX || panY !== lastLensPanY) {
    lastLensPanX = panX;
    lastLensPanY = panY;
    let closestIdx = 0;
    let closestDist = Infinity;

    for (let i = 0; i < tileStates.length; i++) {
      const st = tileStates[i];
      computeLensInto(st, panX, panY);
      if (st.normDist < closestDist) {
        closestDist = st.normDist;
        closestIdx = i;
      }
    }
    lastClosestIdx = closestIdx;
    // Re-sort drawOrder only when pan actually changed!
    drawOrder.sort((a, b) => tileStates[b].normDist - tileStates[a].normDist);
  }

  // 3. Coalesced hover resolution (at most once per frame, zero layout reads)
  if (hoverCheckDirty && !isDragging && !isOpen) {
    hoverCheckDirty = false;
    if (vpRectDirty) refreshViewportCenter();
    hoveredIndex = resolveTileAt(
      pendingClientX - vpCenterX,
      pendingClientY - vpCenterY,
      hoveredIndex
    );
  }

  const activeHi = getActiveHighlightIndex();
  const hasHover = activeHi >= 0;

  if (galleryEl && hasHover !== lastGalleryHover) {
    lastGalleryHover = hasHover;
    galleryEl.classList.toggle('has-hover', hasHover);
  }
  if (viewportEl && hasHover !== lastPointerCursor) {
    lastPointerCursor = hasHover;
    viewportEl.classList.toggle('is-pointer', hasHover);
  }

  updateHud(hasHover ? activeHi : lastClosestIdx);

  const hiState = hasHover ? tileStates[activeHi] : null;
  const repelRadius = metrics.spacingX * 2.2;
  const repelRadiusSq = repelRadius * repelRadius;
  const halfVpW = metrics.vpW * 0.5;
  const halfVpH = metrics.vpH * 0.5;
  const follow = 1 - Math.exp(-18 * dt);

  // 4. Advance snappy hover springs (zero lag/delay) and gentle neighbor repulsion
  for (let i = 0; i < tileStates.length; i++) {
    const st = tileStates[i];
    const targetHover = i === activeHi ? 1 : 0;

    if (st.loaded && st.loadAlpha < 1) {
      st.loadAlpha = reduced ? 1 : Math.min(1, st.loadAlpha + dt * 5.8);
      if (st.loadAlpha < 1) needsMoreFrames = true;
    }

    if (reduced) {
      st.hoverProg = targetHover;
      st.hoverVel = 0;
    } else if (st.hoverProg !== targetHover || st.hoverVel !== 0) {
      // Crisp, immediate critically-damped Apple spring (~150ms response, zero sluggishness)
      const stiffness = targetHover === 1 ? 440 : 360;
      const damping = targetHover === 1 ? 35 : 32;
      const force = (targetHover - st.hoverProg) * stiffness - st.hoverVel * damping;
      st.hoverVel += force * dt;
      st.hoverProg += st.hoverVel * dt;

      if (Math.abs(targetHover - st.hoverProg) < 0.003 && Math.abs(st.hoverVel) < 0.02) {
        st.hoverProg = targetHover;
        st.hoverVel = 0;
      } else {
        needsMoreFrames = true;
      }
    }

    const hp = clamp(st.hoverProg, 0, 1.05);

    let targetNudgeX = 0;
    let targetNudgeY = 0;

    if (i === activeHi) {
      const zoomedHalfW = metrics.tileW * metrics.hoverScale * 0.5 + 16;
      const zoomedHalfH = metrics.tileH * metrics.hoverScale * 0.5 + 16;
      const clampedX = clamp(st.lensX, -halfVpW + zoomedHalfW, halfVpW - zoomedHalfW);
      const clampedY = clamp(st.lensY, -halfVpH + zoomedHalfH, halfVpH - zoomedHalfH);
      targetNudgeX = clampedX - st.lensX;
      targetNudgeY = clampedY - st.lensY;
    } else if (hiState) {
      const dx = st.lensX - hiState.lensX;
      const dy = st.lensY - hiState.lensY;
      const distSq = dx * dx + dy * dy;
      if (distSq > 1 && distSq < repelRadiusSq) {
        const dist = Math.sqrt(distSq);
        const falloff = 1 - dist / repelRadius;
        const push = falloff * falloff * 16;
        targetNudgeX = (dx / dist) * push;
        targetNudgeY = (dy / dist) * push;
      }
    }

    if (reduced) {
      st.nudgeX = targetNudgeX;
      st.nudgeY = targetNudgeY;
    } else if (st.nudgeX !== targetNudgeX || st.nudgeY !== targetNudgeY) {
      st.nudgeX += (targetNudgeX - st.nudgeX) * follow;
      st.nudgeY += (targetNudgeY - st.nudgeY) * follow;
      if (Math.abs(targetNudgeX - st.nudgeX) <= 0.15 && Math.abs(targetNudgeY - st.nudgeY) <= 0.15) {
        st.nudgeX = targetNudgeX;
        st.nudgeY = targetNudgeY;
      } else {
        needsMoreFrames = true;
      }
    }

    st.lastX = st.lensX + st.nudgeX;
    st.lastY = st.lensY + st.nudgeY;
    st.lastScale = lerp(st.baseScale, metrics.hoverScale, hp);

    const dimFactor = hasHover && i !== activeHi ? 0.85 : 1;
    st.lastOpacity = clamp(lerp(st.baseOpacity * dimFactor, 1.0, clamp(hp, 0, 1)), 0, 1);
  }

  // 5. Render entire frame via fast hardware bilinear atlas blits (opaque fill, zero shadowBlur!)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low'; // hardware GPU bilinear (sprites already @2x high-quality baked!)

  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.bgHex;
  ctx.fillRect(0, 0, metrics.vpW, metrics.vpH);

  const cx = metrics.vpW * 0.5;
  const cy = metrics.vpH * 0.5;

  // Background tiles (behind radial paper vignette)
  for (let k = 0; k < drawOrder.length; k++) {
    const idx = drawOrder[k];
    const st = tileStates[idx];
    if (idx === activeHi || st.hoverProg > 0.08) continue;
    drawTile(st, idx, cx, cy, false, false);
  }

  // Pre-rendered half-res radial paper opacity vignette (1 GPU quad)
  if (vignetteCanvas) {
    ctx.globalAlpha = 1;
    ctx.drawImage(vignetteCanvas, 0, 0, metrics.vpW, metrics.vpH);
  }

  // Departing/settling tiles (smoothly shrinking back without shadowBlur!)
  for (let k = 0; k < drawOrder.length; k++) {
    const idx = drawOrder[k];
    const st = tileStates[idx];
    if (idx === activeHi || st.hoverProg <= 0.08) continue;
    drawTile(st, idx, cx, cy, false, false);
  }

  // Active hovered / keyboard-focused tile on top (1 pre-baked shadow quad + crisp atlas quad)
  if (hasHover) {
    drawTile(tileStates[activeHi], activeHi, cx, cy, true, focusedIndex === activeHi);
  }

  ctx.globalAlpha = 1;

  if (needsMoreFrames) {
    rafId = requestAnimationFrame(tick);
  }
}

function panToPhoto(index, immediate = false) {
  const st = tileStates[index];
  if (!st) return;
  const destX = clamp(-st.baseX, -maxPanX, maxPanX);
  const destY = clamp(-st.baseY, -maxPanY, maxPanY);
  if (immediate || prefersReducedMotion()) {
    panX = destX;
    panY = destY;
    panVelX = 0;
    panVelY = 0;
    targetPanX = null;
    targetPanY = null;
  } else {
    targetPanX = destX;
    targetPanY = destY;
  }
  wakeLoop();
}

function setFreePan(next, { silent = false } = {}) {
  const value = Boolean(next);
  if (isFreePan === value) return;
  isFreePan = value;
  if (viewportEl) {
    viewportEl.classList.toggle('is-free-pan', isFreePan);
  }
  if (panBtnEl) {
    panBtnEl.setAttribute('aria-pressed', String(isFreePan));
    panBtnEl.textContent = isFreePan ? 'Done' : '2D pan';
  }
  if (!silent) playClick();
}

function recenterGallery() {
  playClick();
  hoveredIndex = -1;
  targetPanX = 0;
  targetPanY = 0;
  wakeLoop();
}

/* ==========================================================================
   Frosted FLIP Photo Viewer (exact pixel-aligned launch from canvas tile rect)
   ========================================================================== */
function getTileScreenRect(index) {
  const st = tileStates[index];
  if (!st || !viewportEl) return null;
  refreshViewportCenter();
  const w = metrics.tileW * st.lastScale;
  const h = metrics.tileH * st.lastScale;
  const left = vpCenterX + st.lastX - w * 0.5;
  const top = vpCenterY + st.lastY - h * 0.5;
  return { left, top, width: w, height: h, bottom: top + h };
}

function setHiddenTile(idx) {
  if (hiddenTileIndex === idx) return;
  hiddenTileIndex = idx;
  wakeLoop();
}

function getPhotoAspectRatio(index) {
  const item = photos[index];
  if (item && item.w && item.h) return item.w / item.h;
  return 9 / 16;
}

function getTargetRect(aspectRatio) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const padX = vw <= 600 ? 20 : 48;
  const padTop = 28;
  const padBottom = 86;
  const maxW = Math.min(vw - padX * 2, 920);
  const maxH = Math.max(200, vh - padTop - padBottom);

  let width = maxW;
  let height = width / aspectRatio;
  if (height > maxH) {
    height = maxH;
    width = height * aspectRatio;
  }

  const left = (vw - width) / 2;
  const top = padTop + (maxH - height) / 2;
  return { left, top, width, height };
}

function updateMeta(index) {
  const item = photos[index];
  if (!item) return;
  if (lbDate) lbDate.textContent = item.date || '';
  if (lbCamera) lbCamera.textContent = item.camera ? `Shot on ${item.camera}` : '';
  if (lbCounter) lbCounter.textContent = `${index + 1} / ${photos.length}`;
}

function upgradeToFullRes(item, expectedIdx) {
  if (!item || !item.full || !lbImg) return;
  const preload = new Image();
  preload.decoding = 'async';
  preload.src = item.full;
  preload.onload = () => {
    if (isOpen && !isClosing && activeIndex === expectedIdx) {
      lbImg.src = item.full;
    }
  };
}

function openLightbox(index) {
  if (!viewer || !lbImg || !photos.length) return;
  clearTimeout(closeTimer);

  activeIndex = (index + photos.length) % photos.length;
  const item = photos[activeIndex];
  const fromRect = getTileScreenRect(activeIndex);
  const ratio = getPhotoAspectRatio(activeIndex);
  const toRect = getTargetRect(ratio);

  hoveredIndex = -1;
  hoverCheckDirty = false;
  updateMeta(activeIndex);
  lbImg.alt = `Cycling photo — ${item.date}`;
  lbImg.src = item.grid || item.thumb;

  isOpen = true;
  isClosing = false;
  openedAt = performance.now();
  viewer.removeAttribute('data-closing');
  viewer.classList.remove('is-open');
  viewer.hidden = false;
  setHiddenTile(activeIndex);
  playPop(1.02);

  lbImg.style.width = `${toRect.width}px`;
  lbImg.style.height = `${toRect.height}px`;

  if (fromRect && fromRect.width > 0 && !prefersReducedMotion()) {
    const scaleX = fromRect.width / toRect.width;
    const scaleY = fromRect.height / toRect.height;

    lbImg.style.transition = 'none';
    lbImg.style.transform = `translate3d(${fromRect.left}px, ${fromRect.top}px, 0) scale(${scaleX}, ${scaleY})`;
    void lbImg.offsetWidth;

    lbImg.style.transition = '';
    requestAnimationFrame(() => {
      viewer.classList.add('is-open');
      lbImg.style.transform = `translate3d(${toRect.left}px, ${toRect.top}px, 0) scale(1, 1)`;
    });
  } else {
    lbImg.style.transform = `translate3d(${toRect.left}px, ${toRect.top}px, 0) scale(1, 1)`;
    requestAnimationFrame(() => viewer.classList.add('is-open'));
  }

  upgradeToFullRes(item, activeIndex);
}

function stepLightbox(delta) {
  if (!isOpen || isClosing || !photos.length || !lbImg) return;
  activeIndex = (activeIndex + delta + photos.length) % photos.length;
  const item = photos[activeIndex];
  const ratio = getPhotoAspectRatio(activeIndex);
  const toRect = getTargetRect(ratio);

  playClick();
  setHiddenTile(activeIndex);
  updateMeta(activeIndex);
  updateHud(activeIndex);
  panToPhoto(activeIndex, false);

  lbImg.classList.add('is-swapping');
  setTimeout(() => {
    if (!isOpen || isClosing) return;
    lbImg.style.transition = 'none';
    lbImg.style.width = `${toRect.width}px`;
    lbImg.style.height = `${toRect.height}px`;
    lbImg.style.transform = `translate3d(${toRect.left}px, ${toRect.top}px, 0) scale(1, 1)`;
    lbImg.src = item.grid || item.thumb;
    lbImg.alt = `Cycling photo — ${item.date}`;
    void lbImg.offsetWidth;
    lbImg.style.transition = '';
    lbImg.classList.remove('is-swapping');
    upgradeToFullRes(item, activeIndex);
  }, 90);
}

function closeLightbox() {
  if (!isOpen || isClosing || !viewer || !lbImg) return;
  isClosing = true;
  playClick();

  const backRect = getTileScreenRect(activeIndex);
  const curW = parseFloat(lbImg.style.width) || lbImg.getBoundingClientRect().width;
  const curH = parseFloat(lbImg.style.height) || lbImg.getBoundingClientRect().height;

  const isInViewport =
    backRect &&
    backRect.width > 0 &&
    backRect.bottom > -80 &&
    backRect.top < window.innerHeight + 80;

  viewer.setAttribute('data-closing', '');
  viewer.classList.remove('is-open');

  if (isInViewport && !prefersReducedMotion()) {
    const scaleX = backRect.width / curW;
    const scaleY = backRect.height / curH;
    lbImg.style.transform = `translate3d(${backRect.left}px, ${backRect.top}px, 0) scale(${scaleX}, ${scaleY})`;
  }

  const exitDuration = prefersReducedMotion() ? 100 : 305;
  closeTimer = setTimeout(() => {
    viewer.hidden = true;
    viewer.removeAttribute('data-closing');
    setHiddenTile(-1);
    isOpen = false;
    isClosing = false;
  }, exitDuration);
}

function repositionOpenImage() {
  if (!isOpen || isClosing || !lbImg) return;
  const ratio = getPhotoAspectRatio(activeIndex);
  const toRect = getTargetRect(ratio);
  lbImg.style.transition = 'none';
  lbImg.style.width = `${toRect.width}px`;
  lbImg.style.height = `${toRect.height}px`;
  lbImg.style.transform = `translate3d(${toRect.left}px, ${toRect.top}px, 0) scale(1, 1)`;
  void lbImg.offsetWidth;
  lbImg.style.transition = '';
}

/* ==========================================================================
   Build Shared GPU Sprite Atlases & Keyboard Accessibility List
   ========================================================================== */
function loadTileImages() {
  // Stagger atlas baking across frames so initial scroll never hitches
  const bakeQueue = [];
  let bakeScheduled = false;

  function flushBakeQueue() {
    bakeScheduled = false;
    const deadline = performance.now() + 4.5; // max 4.5ms budget per frame
    while (bakeQueue.length && performance.now() < deadline) {
      const { img, idx } = bakeQueue.shift();
      bakePhotoIntoAtlases(img, idx);
      tileStates[idx].loadAlpha = prefersReducedMotion() ? 1 : 0.01;
    }
    wakeLoop();
    if (bakeQueue.length) {
      bakeScheduled = true;
      requestAnimationFrame(flushBakeQueue);
    }
  }

  function enqueueBake(img, idx) {
    bakeQueue.push({ img, idx });
    if (!bakeScheduled) {
      bakeScheduled = true;
      requestAnimationFrame(flushBakeQueue);
    }
  }

  tileStates.forEach((st, idx) => {
    const item = photos[idx];
    const img = new Image();
    img.decoding = 'async';
    img.src = item.grid || item.thumb;

    if (img.complete && img.naturalWidth > 0) {
      enqueueBake(img, idx);
    } else {
      img.addEventListener('load', () => enqueueBake(img, idx), { once: true });
    }
  });
}

function renderWatchGallery() {
  if (!viewportEl || !canvasEl || !ctx || !photos.length) return;

  initAtlases(photos.length);

  const coords = buildRectCoords(photos.length);
  tileStates = new Array(photos.length);
  drawOrder = new Array(photos.length);
  a11yButtons = new Array(photos.length);

  if (a11yListEl) a11yListEl.textContent = '';
  const frag = document.createDocumentFragment();

  photos.forEach((item, idx) => {
    const { col, row, ring } = coords[idx];
    drawOrder[idx] = idx;

    tileStates[idx] = {
      col,
      row,
      ring,
      baseX: 0,
      baseY: 0,
      lensX: 0,
      lensY: 0,
      normDist: 0,
      baseScale: 1,
      baseOpacity: 1,
      blurLevel: 0,
      lastX: 0,
      lastY: 0,
      lastScale: 1,
      lastOpacity: 1,
      hoverProg: 0,
      hoverVel: 0,
      nudgeX: 0,
      nudgeY: 0,
      loadAlpha: 0,
      loaded: false,
      sharpX: 0,
      sharpY: 0,
      softX: 0,
      softY: 0,
      deepX: 0,
      deepY: 0,
    };

    if (a11yListEl) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', `Open road photo from ${item.date} (${idx + 1} of ${photos.length})`);
      btn.addEventListener('focus', () => {
        focusedIndex = idx;
        const st = tileStates[idx];
        if (st && Math.hypot(st.baseX + panX, st.baseY + panY) > metrics.spacingX * 1.8) {
          panToPhoto(idx, false);
        }
        wakeLoop();
      });
      btn.addEventListener('blur', () => {
        if (focusedIndex === idx) {
          focusedIndex = -1;
          wakeLoop();
        }
      });
      btn.addEventListener('click', () => openLightbox(idx));
      a11yButtons[idx] = btn;
      frag.appendChild(btn);
    }
  });

  if (a11yListEl) a11yListEl.appendChild(frag);
  if (countEl) countEl.textContent = `${photos.length} photos`;

  readTheme();
  readMetrics();
  updateHud(0);
  tick(performance.now());

  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadTileImages();
          obs.disconnect();
        }
      },
      { rootMargin: '600px 0px' }
    );
    obs.observe(viewportEl);
  } else {
    loadTileImages();
  }
}

/* ==========================================================================
   Direct Manipulation Drag, Momentum & Instant Canvas Click
   ========================================================================== */
function wirePanGestures() {
  if (!viewportEl) return;

  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (isOpen) return;

    isPointerDown = true;
    isDragging = false;
    dragAllowVertical = e.pointerType !== 'touch' || isFreePan;
    activePointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginPanX = panX;
    dragOriginPanY = panY;
    panVelX = 0;
    panVelY = 0;
    targetPanX = null;
    targetPanY = null;
    velocitySamples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
  });

  window.addEventListener('pointermove', (e) => {
    if (!isPointerDown || e.pointerId !== activePointerId) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (!isDragging) {
      if (!dragAllowVertical && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.1) {
        isPointerDown = false;
        activePointerId = null;
        return;
      }

      const movedEnough = dragAllowVertical
        ? Math.hypot(dx, dy) > 6
        : Math.abs(dx) > 8 && Math.abs(dx) >= Math.abs(dy);

      if (movedEnough) {
        isDragging = true;
        hoveredIndex = -1;
        hoverCheckDirty = false;
        viewportEl.classList.add('is-dragging');
        try {
          viewportEl.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    }

    if (!isDragging) return;

    const rawX = dragOriginPanX + dx;
    panX = applyBoundsWithRubberband(rawX, maxPanX, metrics.vpW * 0.55);
    if (dragAllowVertical) {
      const rawY = dragOriginPanY + dy;
      panY = applyBoundsWithRubberband(rawY, maxPanY, metrics.vpH * 0.55);
    }

    const now = performance.now();
    velocitySamples.push({ x: e.clientX, y: e.clientY, t: now });
    while (velocitySamples.length > 2 && now - velocitySamples[0].t > 80) {
      velocitySamples.shift();
    }

    wakeLoop();
  });

  function endDrag(e) {
    if (!isPointerDown || e.pointerId !== activePointerId) return;
    const wasDragging = isDragging;
    const allowV = dragAllowVertical;

    isPointerDown = false;
    isDragging = false;
    activePointerId = null;
    viewportEl.classList.remove('is-dragging');

    try {
      if (viewportEl.hasPointerCapture(e.pointerId)) {
        viewportEl.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    if (wasDragging) {
      if (velocitySamples.length >= 2) {
        const first = velocitySamples[0];
        const last = velocitySamples[velocitySamples.length - 1];
        const dtSec = Math.max(0.012, (last.t - first.t) / 1000);
        panVelX = clamp((last.x - first.x) / dtSec, -1800, 1800);
        panVelY = allowV ? clamp((last.y - first.y) / dtSec, -1800, 1800) : 0;
      }
      wakeLoop();
    } else if (e.type === 'pointerup') {
      if (vpRectDirty) refreshViewportCenter();
      const clickedIdx = resolveTileAt(
        e.clientX - vpCenterX,
        e.clientY - vpCenterY,
        hoveredIndex
      );
      if (clickedIdx >= 0) {
        openLightbox(clickedIdx);
      }
    }
  }

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  viewportEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || isDragging || isOpen) return;
    pointerInside = true;
    pendingClientX = e.clientX;
    pendingClientY = e.clientY;
    hoverCheckDirty = true;
    wakeLoop();
  });

  viewportEl.addEventListener('pointerleave', () => {
    pointerInside = false;
    hoverCheckDirty = false;
    if (hoveredIndex >= 0 && !isDragging) {
      hoveredIndex = -1;
      wakeLoop();
    }
  });

  viewportEl.addEventListener('dblclick', (e) => {
    if (vpRectDirty) refreshViewportCenter();
    const hit = resolveTileAt(e.clientX - vpCenterX, e.clientY - vpCenterY, -1);
    if (hit < 0 && Math.hypot(panX, panY) > 12) {
      recenterGallery();
    }
  });
}

function wireLightboxTouchSwipes() {
  if (!viewer) return;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let tracking = false;

  viewer.addEventListener(
    'touchstart',
    (e) => {
      if (!isOpen || isClosing || e.touches.length !== 1) return;
      if (e.target && e.target.closest && e.target.closest('.viewer-bar')) return;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = performance.now();
      tracking = true;
    },
    { passive: true }
  );

  viewer.addEventListener(
    'touchend',
    (e) => {
      if (!tracking || !isOpen || isClosing) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const dt = Math.max(16, performance.now() - touchStartTime);
      const vx = Math.abs(dx) / dt;

      if ((Math.abs(dx) > 42 || vx > 0.35) && Math.abs(dx) > Math.abs(dy) * 1.25) {
        stepLightbox(dx < 0 ? 1 : -1);
      } else if (dy > 76 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        closeLightbox();
      }
    },
    { passive: true }
  );
}

function wireEvents() {
  wirePanGestures();
  wireLightboxTouchSwipes();

  if ('MutationObserver' in window) {
    const themeObs = new MutationObserver(() => {
      readTheme();
      wakeLoop();
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-day'],
    });
  }

  if (panBtnEl) {
    panBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      setFreePan(!isFreePan);
    });
  }

  document.addEventListener('pointerdown', (e) => {
    if (!isFreePan || !galleryEl) return;
    if (!galleryEl.contains(e.target)) {
      setFreePan(false, { silent: true });
    }
  });

  if (resetBtnEl) {
    resetBtnEl.addEventListener('click', recenterGallery);
  }

  // Swallow the mobile browser's delayed synthetic `click` fired right after
  // the opening touch `pointerup`, which would otherwise land on the newly
  // shown lightbox backdrop/image and close it immediately.
  if (viewer) {
    viewer.addEventListener(
      'click',
      (e) => {
        if (performance.now() - openedAt < 420) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
  }

  if (lbPrev) {
    lbPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      stepLightbox(-1);
    });
  }

  if (lbNext) {
    lbNext.addEventListener('click', (e) => {
      e.stopPropagation();
      stepLightbox(1);
    });
  }

  if (lbClose) {
    lbClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeLightbox();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeLightbox);
  }

  if (lbImg) {
    lbImg.addEventListener('click', closeLightbox);
  }

  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepLightbox(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepLightbox(1);
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      vpRectDirty = true;
    },
    { passive: true }
  );

  window.addEventListener('resize', () => {
    readMetrics();
    wakeLoop();
    repositionOpenImage();
  });
}

export function syncCyclingPhotosTheme() {
  if (!viewportEl || !canvasEl || !ctx || !tileStates.length) return;
  readTheme();
  tick(performance.now());
}

export async function initCyclingPhotos() {
  if (!viewportEl || !canvasEl || !ctx) return;
  wireEvents();

  try {
    const res = await fetch('/assets/photos/photos.json');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      photos = data;
      renderWatchGallery();
    }
  } catch (_) {}
}

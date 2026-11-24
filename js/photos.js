import { playClick, playPop } from './sound.js';

let photos = [];
let thumbImgs = [];
let tileNodes = [];
let tileStates = [];

let activeIndex = 0;
let isOpen = false;
let isClosing = false;
let closeTimer = null;
let hiddenThumb = null;

// WatchOS Radial Lens DOM
const galleryEl = document.getElementById('watch-gallery');
const viewportEl = document.getElementById('watch-viewport');
const countEl = document.getElementById('photo-count');
const hudDateEl = document.getElementById('watch-hud-date');
const hudIndexEl = document.getElementById('watch-hud-index');
const panBtnEl = document.getElementById('watch-pan-btn');
const resetBtnEl = document.getElementById('watch-reset-btn');

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
let lastPointerX = 0;
let lastPointerY = 0;
let velocitySamples = [];
let suppressClickUntil = 0;

let hoveredIndex = -1;
let focusedIndex = -1;
let pointerInside = false;
let pointerLocalX = 0;
let pointerLocalY = 0;
let lastHudIndex = -1;
let rafId = null;
let lastFrameTime = 0;

let metrics = {
  vpW: 960,
  vpH: 540,
  tileW: 80,
  tileH: 98,
  spacingX: 94,
  spacingY: 112,
  hoverScale: 1.72,
};

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
 * For 37 photos this yields a 100% symmetric 9x5 landscape rectangle (5, 9, 9, 9, 5)
 * with strictly aligned horizontal rows & vertical columns and Photo #1 at (0, 0).
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

function readMetrics() {
  if (!viewportEl) return;
  const rect = viewportEl.getBoundingClientRect();
  const vw = window.innerWidth;

  if (vw <= 600) {
    metrics = {
      vpW: rect.width || vw - 16,
      vpH: rect.height || 368,
      tileW: 54,
      tileH: 66,
      spacingX: 64,
      spacingY: 74,
      hoverScale: 1.44,
    };
  } else if (vw <= 900) {
    metrics = {
      vpW: rect.width || vw - 24,
      vpH: rect.height || 460,
      tileW: 70,
      tileH: 86,
      spacingX: 82,
      spacingY: 98,
      hoverScale: 1.62,
    };
  } else {
    metrics = {
      vpW: rect.width || 1000,
      vpH: rect.height || 540,
      tileW: 80,
      tileH: 98,
      spacingX: 94,
      spacingY: 112,
      hoverScale: 1.72,
    };
  }

  let farthestX = 0;
  let farthestY = 0;

  tileStates.forEach((st) => {
    st.baseX = st.col * metrics.spacingX;
    st.baseY = st.row * metrics.spacingY;
    farthestX = Math.max(farthestX, Math.abs(st.baseX));
    farthestY = Math.max(farthestY, Math.abs(st.baseY));
  });

  // Allow panning every outer photo right into the center focal spot
  maxPanX = Math.max(120, farthestX * 0.94);
  maxPanY = Math.max(100, farthestY * 0.94);

  panX = clamp(panX, -maxPanX, maxPanX);
  panY = clamp(panY, -maxPanY, maxPanY);
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
  const distFromCenter = Math.hypot(panX, panY);
  resetBtnEl.hidden = distFromCenter < 34;
}

function getActiveHighlightIndex() {
  if (isDragging) return -1;
  if (hoveredIndex >= 0) return hoveredIndex;
  if (focusedIndex >= 0) return focusedIndex;
  return -1;
}

function computeLensPosition(st, px, py) {
  const rx = st.baseX + px;
  const ry = st.baseY + py;

  const isCompact = metrics.vpW <= 600;
  const lensRx = isCompact
    ? Math.max(metrics.vpW * 0.47, metrics.spacingX * 2.45)
    : Math.max(metrics.vpW * 0.43, metrics.spacingX * 3.9);
  const lensRy = isCompact
    ? Math.max(metrics.vpH * 0.49, metrics.spacingY * 2.15)
    : Math.max(metrics.vpH * 0.46, metrics.spacingY * 2.18);

  const normDist = Math.hypot(rx / lensRx, ry / lensRy);

  // Subtle WatchOS curved-crystal pull-in that keeps rectangular rows & columns crisp
  const pull = 1 - 0.14 * smoothstep(0.22, 1.18, normDist);
  const lensX = rx * pull;
  const lensY = ry * pull;

  // WatchOS spherical dome scale falloff
  const edgeT = smoothstep(0.16, 1.14, normDist);
  const baseScale = lerp(1.06, 0.52, edgeT) * (1 - 0.14 * smoothstep(1.08, 1.58, normDist));

  // Progressive radial opacity falloff toward the blurred perimeter
  const opT = smoothstep(0.36, 1.15, normDist);
  const baseOpacity = lerp(1.0, 0.28, opT) * (1 - smoothstep(1.16, 1.62, normDist));

  return { lensX, lensY, normDist, baseScale, baseOpacity };
}

/**
 * Deterministic, flicker-free hit-testing evaluated ONLY on user pointer movement.
 * Keeps the active hovered tile sticky across its visual zoomed card + resting footprint
 * so shrinking/repelling tiles can never ping-pong under a stationary cursor.
 */
function resolveHoveredTile(px, py) {
  if (!pointerInside || isDragging || isOpen || !tileStates.length) return -1;

  if (hoveredIndex >= 0 && hoveredIndex < tileStates.length) {
    const cur = tileStates[hoveredIndex];
    const lp = computeLensPosition(cur, panX, panY);
    const restHalfW = metrics.tileW * lp.baseScale * 0.5 + 4;
    const restHalfH = metrics.tileH * lp.baseScale * 0.5 + 4;
    const inRest =
      Math.abs(px - lp.lensX) <= restHalfW && Math.abs(py - lp.lensY) <= restHalfH;

    const visHalfW = metrics.tileW * cur.lastScale * 0.5 + 2;
    const visHalfH = metrics.tileH * cur.lastScale * 0.5 + 2;
    const inVisual =
      Math.abs(px - cur.lastX) <= visHalfW && Math.abs(py - cur.lastY) <= visHalfH;

    if (inRest || inVisual) {
      return hoveredIndex;
    }
  }

  let bestIdx = -1;
  let bestScore = Infinity;

  for (let i = 0; i < tileStates.length; i++) {
    const lp = computeLensPosition(tileStates[i], panX, panY);
    if (lp.baseOpacity < 0.04) continue;

    const halfW = metrics.tileW * lp.baseScale * 0.5 + 3;
    const halfH = metrics.tileH * lp.baseScale * 0.5 + 3;
    const dx = Math.abs(px - lp.lensX);
    const dy = Math.abs(py - lp.lensY);

    if (dx <= halfW && dy <= halfH) {
      const score = Math.hypot(dx / halfW, dy / halfH);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }

  return bestIdx;
}

function wakeLoop() {
  if (rafId !== null) return;
  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function tick(now) {
  rafId = null;
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
        const k = 165;
        const c = 25.5;
        const ax = (targetPanX - panX) * k - panVelX * c;
        const ay = (targetPanY - panY) * k - panVelY * c;
        panVelX += ax * dt;
        panVelY += ay * dt;
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
      // Momentum glide + soft boundary spring
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
          const k = 210;
          const c = 28;
          panVelX += (-outX * k - panVelX * c) * dt;
          panVelY += (-outY * k - panVelY * c) * dt;
          panX += panVelX * dt;
          panY += panVelY * dt;
          needsMoreFrames = true;
        }
      } else if (Math.hypot(panVelX, panVelY) > 4) {
        const friction = Math.pow(0.925, dt60);
        panVelX *= friction;
        panVelY *= friction;
        panX += panVelX * dt;
        panY += panVelY * dt;

        // Soft brake when momentum pushes past bounds
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

  const activeHi = getActiveHighlightIndex();
  if (galleryEl) {
    galleryEl.classList.toggle('has-hover', activeHi >= 0);
  }

  // First pass: compute base spherical lens coordinates for every tile
  let closestIdx = 0;
  let closestDist = Infinity;
  const lensPositions = new Array(tileStates.length);

  for (let i = 0; i < tileStates.length; i++) {
    const lp = computeLensPosition(tileStates[i], panX, panY);
    lensPositions[i] = lp;
    if (lp.normDist < closestDist) {
      closestDist = lp.normDist;
      closestIdx = i;
    }
  }

  // Update editorial bottom HUD with hovered photo or centered focal photo
  updateHud(activeHi >= 0 ? activeHi : closestIdx);

  const hiPos = activeHi >= 0 ? lensPositions[activeHi] : null;
  const repelRadius = metrics.spacingX * 2.25;
  const halfVpW = metrics.vpW * 0.5;
  const halfVpH = metrics.vpH * 0.5;

  // Second pass: spring hover zoom, neighbor magnetic nudge, and GPU transform update
  for (let i = 0; i < tileStates.length; i++) {
    const st = tileStates[i];
    const el = tileNodes[i];
    const lp = lensPositions[i];

    const targetHover = i === activeHi ? 1 : 0;

    if (reduced) {
      st.hoverProg = targetHover;
      st.hoverVel = 0;
    } else {
      // Snappy critically-damped Apple spring for hover magnification
      const stiffness = targetHover === 1 ? 300 : 240;
      const damping = targetHover === 1 ? 29 : 27;
      const force = (targetHover - st.hoverProg) * stiffness - st.hoverVel * damping;
      st.hoverVel += force * dt;
      st.hoverProg += st.hoverVel * dt;

      if (Math.abs(targetHover - st.hoverProg) < 0.002 && Math.abs(st.hoverVel) < 0.01) {
        st.hoverProg = targetHover;
        st.hoverVel = 0;
      } else {
        needsMoreFrames = true;
      }
    }

    const hp = clamp(st.hoverProg, 0, 1.08);

    // Calculate magnetic repulsion from hovered photo OR gentle safe-margin clamp for the hovered photo itself
    let targetNudgeX = 0;
    let targetNudgeY = 0;

    if (i === activeHi) {
      const zoomedHalfW = (metrics.tileW * metrics.hoverScale) * 0.5 + 16;
      const zoomedHalfH = (metrics.tileH * metrics.hoverScale) * 0.5 + 16;
      const clampedX = clamp(lp.lensX, -halfVpW + zoomedHalfW, halfVpW - zoomedHalfW);
      const clampedY = clamp(lp.lensY, -halfVpH + zoomedHalfH, halfVpH - zoomedHalfH);
      targetNudgeX = clampedX - lp.lensX;
      targetNudgeY = clampedY - lp.lensY;
    } else if (hiPos) {
      const dx = lp.lensX - hiPos.lensX;
      const dy = lp.lensY - hiPos.lensY;
      const dist = Math.hypot(dx, dy);
      if (dist > 1 && dist < repelRadius) {
        const falloff = 1 - dist / repelRadius;
        const push = falloff * falloff * 18;
        targetNudgeX = (dx / dist) * push;
        targetNudgeY = (dy / dist) * push;
      }
    }

    if (reduced) {
      st.nudgeX = targetNudgeX;
      st.nudgeY = targetNudgeY;
    } else {
      const follow = 1 - Math.exp(-14 * dt);
      st.nudgeX += (targetNudgeX - st.nudgeX) * follow;
      st.nudgeY += (targetNudgeY - st.nudgeY) * follow;
      if (Math.abs(targetNudgeX - st.nudgeX) > 0.15 || Math.abs(targetNudgeY - st.nudgeY) > 0.15) {
        needsMoreFrames = true;
      }
    }

    const finalX = lp.lensX + st.nudgeX;
    const finalY = lp.lensY + st.nudgeY;
    const finalScale = lerp(lp.baseScale, metrics.hoverScale, hp);

    st.lastX = finalX;
    st.lastY = finalY;
    st.lastScale = finalScale;

    // Gently quiet non-hovered tiles when inspecting one photo so it stands out cleanly
    const dimFactor = activeHi >= 0 && i !== activeHi ? 0.84 : 1;
    const finalOpacity = clamp(lerp(lp.baseOpacity * dimFactor, 1.0, clamp(hp, 0, 1)), 0, 1);

    // Mobile GPU culling: hide completely dissolved off-rim tiles to skip unnecessary rasterization
    const shouldBeVisible = finalOpacity > 0.015 || i === activeHi;
    if (st.isVisible !== shouldBeVisible) {
      st.isVisible = shouldBeVisible;
      el.style.visibility = shouldBeVisible ? '' : 'hidden';
    }

    if (shouldBeVisible) {
      el.style.transform = `translate3d(${finalX.toFixed(2)}px, ${finalY.toFixed(2)}px, 0) scale(${finalScale.toFixed(4)})`;
      el.style.opacity = finalOpacity.toFixed(3);
    }

    // Stable compositor layering with zero filter toggling (avoids GPU layer reallocation flicker)
    let nextZ;
    if (i === activeHi) {
      nextZ = 40;
    } else if (hp > 0.14) {
      nextZ = 30;
    } else {
      nextZ = 1 + Math.round((1 - clamp(lp.normDist, 0, 1)) * 9);
    }

    if (st.zIndex !== nextZ) {
      st.zIndex = nextZ;
      el.style.zIndex = String(nextZ);
    }

    const isHighlighted = i === activeHi;
    if (st.isHighlighted !== isHighlighted) {
      st.isHighlighted = isHighlighted;
      el.classList.toggle('is-hovered', isHighlighted);
    }
  }

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
   Frosted FLIP Photo Viewer (preserved seamless zoom from live watchOS tile)
   ========================================================================== */
function setHiddenThumb(imgEl) {
  if (hiddenThumb && hiddenThumb !== imgEl) {
    hiddenThumb.style.visibility = '';
  }
  hiddenThumb = imgEl || null;
  if (hiddenThumb) {
    hiddenThumb.style.visibility = 'hidden';
  }
}

function getPhotoAspectRatio(index) {
  const item = photos[index];
  if (item && item.w && item.h) return item.w / item.h;
  const srcThumb = thumbImgs[index];
  if (srcThumb && srcThumb.naturalHeight > 0) {
    return srcThumb.naturalWidth / srcThumb.naturalHeight;
  }
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
  const srcTile = tileNodes[activeIndex];
  const srcThumb = thumbImgs[activeIndex];
  const fromRect = srcTile ? srcTile.getBoundingClientRect() : null;

  const ratio = getPhotoAspectRatio(activeIndex);
  const toRect = getTargetRect(ratio);

  // Release hover cleanly once lightbox takes over
  hoveredIndex = -1;
  wakeLoop();

  updateMeta(activeIndex);
  lbImg.alt = `Cycling photo — ${item.date}`;
  lbImg.src = item.thumb;

  isOpen = true;
  isClosing = false;
  viewer.removeAttribute('data-closing');
  viewer.classList.remove('is-open');
  viewer.hidden = false;
  setHiddenThumb(srcThumb);
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
  const srcThumb = thumbImgs[activeIndex];
  const ratio = getPhotoAspectRatio(activeIndex);
  const toRect = getTargetRect(ratio);

  playClick();
  setHiddenThumb(srcThumb);
  updateMeta(activeIndex);
  updateHud(activeIndex);

  // Quietly glide the honeycomb behind the frosted backdrop so closing FLIPs to a crisp centered tile
  panToPhoto(activeIndex, false);

  lbImg.classList.add('is-swapping');
  setTimeout(() => {
    if (!isOpen || isClosing) return;
    lbImg.style.transition = 'none';
    lbImg.style.width = `${toRect.width}px`;
    lbImg.style.height = `${toRect.height}px`;
    lbImg.style.transform = `translate3d(${toRect.left}px, ${toRect.top}px, 0) scale(1, 1)`;
    lbImg.src = item.thumb;
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

  const srcTile = tileNodes[activeIndex];
  const backRect = srcTile ? srcTile.getBoundingClientRect() : null;
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
    setHiddenThumb(null);
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
   Build WatchOS Honeycomb Tiles
   ========================================================================== */
function renderWatchGallery() {
  if (!viewportEl || !photos.length) return;

  // Remove any previously rendered tiles while keeping the radial blur & vignette overlays
  viewportEl.querySelectorAll('.watch-tile').forEach((el) => el.remove());

  const coords = buildRectCoords(photos.length);
  const firstOverlay = viewportEl.querySelector('.watch-blur-layer');

  tileNodes = new Array(photos.length);
  thumbImgs = new Array(photos.length);
  tileStates = new Array(photos.length);

  const frag = document.createDocumentFragment();

  photos.forEach((item, idx) => {
    const { col, row, ring } = coords[idx];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'watch-tile';
    btn.setAttribute('aria-label', `Open road photo from ${item.date} (${idx + 1} of ${photos.length})`);

    const img = document.createElement('img');
    img.src = item.thumb;
    img.alt = `Cycling photo taken ${item.date}`;
    if (item.w && item.h) {
      img.width = item.w;
      img.height = item.h;
    }
    img.loading = ring <= 1 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.draggable = false;

    const markLoaded = () => img.classList.add('is-loaded');
    if (img.complete && img.naturalWidth > 0) {
      markLoaded();
    } else {
      img.addEventListener('load', markLoaded, { once: true });
    }

    btn.appendChild(img);

    btn.addEventListener('focus', () => {
      // Only elevate/pan on keyboard navigation (:focus-visible), never on mouse click
      if (!btn.matches(':focus-visible')) return;
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

    btn.addEventListener('click', (e) => {
      if (performance.now() < suppressClickUntil) {
        e.preventDefault();
        return;
      }
      openLightbox(idx);
    });

    tileNodes[idx] = btn;
    thumbImgs[idx] = img;
    tileStates[idx] = {
      col,
      row,
      ring,
      baseX: 0,
      baseY: 0,
      lastX: 0,
      lastY: 0,
      lastScale: 1,
      hoverProg: 0,
      hoverVel: 0,
      nudgeX: 0,
      nudgeY: 0,
      zIndex: -1,
      isVisible: true,
      isHighlighted: false,
    };

    frag.appendChild(btn);
  });

  if (firstOverlay) {
    viewportEl.insertBefore(frag, firstOverlay);
  } else {
    viewportEl.appendChild(frag);
  }

  if (countEl) {
    countEl.textContent = `${photos.length} photos`;
  }

  readMetrics();
  updateHud(0);
  tick(performance.now());
}

/* ==========================================================================
   Direct Manipulation Drag + Momentum Physics (Apple Fluid Interfaces)
   ========================================================================== */
function wirePanGestures() {
  if (!viewportEl) return;

  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (isOpen) return;

    isPointerDown = true;
    isDragging = false;
    // Desktop mouse/pen always pans in 2D; touch defaults to horizontal-only so vertical swipes scroll the page natively unless 2D pan is toggled on
    dragAllowVertical = e.pointerType !== 'touch' || isFreePan;
    activePointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
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
      // On touch in default scroll-safe mode, immediately yield vertical drags to native page scrolling
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
    // Keep a short ~80ms sliding window for clean flick release velocity
    while (velocitySamples.length > 2 && now - velocitySamples[0].t > 80) {
      velocitySamples.shift();
    }

    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
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
      suppressClickUntil = performance.now() + 180;

      // Hand off pointer velocity smoothly into momentum glide
      if (velocitySamples.length >= 2) {
        const first = velocitySamples[0];
        const last = velocitySamples[velocitySamples.length - 1];
        const dtSec = Math.max(0.012, (last.t - first.t) / 1000);
        panVelX = clamp((last.x - first.x) / dtSec, -1800, 1800);
        panVelY = allowV ? clamp((last.y - first.y) / dtSec, -1800, 1800) : 0;
      }
      wakeLoop();
    }
  }

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  viewportEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || isDragging || isOpen) return;
    const rect = viewportEl.getBoundingClientRect();
    pointerInside = true;
    pointerLocalX = e.clientX - (rect.left + rect.width * 0.5);
    pointerLocalY = e.clientY - (rect.top + rect.height * 0.5);

    const nextHover = resolveHoveredTile(pointerLocalX, pointerLocalY);
    if (nextHover !== hoveredIndex) {
      hoveredIndex = nextHover;
      wakeLoop();
    }
  });

  viewportEl.addEventListener('pointerleave', () => {
    pointerInside = false;
    if (hoveredIndex >= 0 && !isDragging) {
      hoveredIndex = -1;
      wakeLoop();
    }
  });

  // Double-click empty canvas space to recenter smoothly
  viewportEl.addEventListener('dblclick', (e) => {
    if (e.target === viewportEl && Math.hypot(panX, panY) > 12) {
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

      // Horizontal swipe: next / previous photo
      if ((Math.abs(dx) > 42 || vx > 0.35) && Math.abs(dx) > Math.abs(dy) * 1.25) {
        stepLightbox(dx < 0 ? 1 : -1);
      } else if (dy > 76 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        // Downward swipe: dismiss photo viewer
        closeLightbox();
      }
    },
    { passive: true }
  );
}

function wireEvents() {
  wirePanGestures();
  wireLightboxTouchSwipes();

  if (panBtnEl) {
    panBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      setFreePan(!isFreePan);
    });
  }

  // Tapping outside the gallery cleanly exits 2D pan mode so page scroll is never accidentally left locked
  document.addEventListener('pointerdown', (e) => {
    if (!isFreePan || !galleryEl) return;
    if (!galleryEl.contains(e.target)) {
      setFreePan(false, { silent: true });
    }
  });

  if (resetBtnEl) {
    resetBtnEl.addEventListener('click', recenterGallery);
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

  window.addEventListener('resize', () => {
    readMetrics();
    wakeLoop();
    repositionOpenImage();
  });
}

export async function initCyclingPhotos() {
  if (!viewportEl) return;
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

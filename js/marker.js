/**
 * Organic hand-drawn highlighter marker renderer using HTML5 Canvas.
 * Draws smooth, slightly wavy rounded-cap yellow marker strokes behind
 * `.swap-pill` and `.hl-swipe` elements at full retina DPI.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getMarkerColor() {
  const root = document.documentElement;
  const isCycling = root.getAttribute('data-profile') === 'cycling';
  const isDark = root.getAttribute('data-day') === 'sun';
  if (isCycling) {
    return isDark ? '#F5C128' : '#FFC629';
  }
  return isDark ? '#1A8CFF' : '#0380FC';
}

function drawStroke(el, seed) {
  const canvas = el.querySelector(':scope > .marker-canvas');
  if (!canvas) return;

  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return;

  const isInlineSwipe = el.classList.contains('hl-swipe');
  const padX = isInlineSwipe ? 6 : 8;
  const padY = isInlineSwipe ? 4 : 8;

  const w = Math.ceil(rect.width + padX * 2);
  const h = Math.ceil(rect.height + padY * 2);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.left = `${-padX}px`;
  canvas.style.top = `${-padY}px`;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const rand = mulberry32(seed);
  const color = getMarkerColor();

  // Stroke geometry: thick rounded-cap highlighter path with gentle organic wave.
  // Round caps extend by `radius` past leftX/rightX, so keep caps strictly within
  // the element's bounds (never overlapping trailing punctuation).
  const thickness = isInlineSwipe ? rect.height * 0.74 : rect.height * 0.84;
  const radius = thickness / 2;

  const capInset = isInlineSwipe ? 2 : 1;
  const leftX = Math.min(w / 2 - 1, padX + radius - capInset);
  const rightX = Math.max(w / 2 + 1, w - padX - radius + capInset);
  const midY = h * (isInlineSwipe ? 0.56 : 0.49);

  // Subtle upward hand-swipe tilt from left to right (matches reference close-up)
  const tilt = isInlineSwipe ? 0.9 : Math.min(2.6, Math.max(1.2, w * 0.008));
  const yStart = midY + tilt + (rand() - 0.5) * 1.4;
  const yEnd = midY - tilt + (rand() - 0.5) * 1.4;

  // Smooth organic S-curve control points
  const cp1x = leftX + (rightX - leftX) * (0.3 + rand() * 0.08);
  const cp1y = midY + (rand() - 0.5) * (isInlineSwipe ? 2.4 : 4.6);
  const cp2x = leftX + (rightX - leftX) * (0.65 + rand() * 0.08);
  const cp2y = midY + (rand() - 0.5) * (isInlineSwipe ? 2.4 : 4.6);

  // Primary bold rounded-cap marker stroke
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(leftX, yStart);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, rightX, yEnd);
  ctx.stroke();

  // Subtle second overlapping brush pass for organic painterly edge variation
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = thickness * 0.92;
  const shift = (rand() - 0.5) * 2.2;
  ctx.beginPath();
  ctx.moveTo(leftX + 1.5, yStart + shift * 0.5);
  ctx.bezierCurveTo(
    cp1x,
    cp1y - shift * 0.8,
    cp2x,
    cp2y + shift * 0.8,
    rightX - 1.5,
    yEnd - shift * 0.4
  );
  ctx.stroke();
  ctx.restore();
}

const seedMap = new WeakMap();
let observer = null;

function ensureCanvas(el, idx) {
  let canvas = el.querySelector(':scope > .marker-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'marker-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    el.prepend(canvas);
  }
  if (!seedMap.has(el)) {
    seedMap.set(el, 1337 + idx * 7919);
  }
  return canvas;
}

const morphTimers = new WeakMap();

export function morphMarker(el, durationMs = 460, { reseed = true } = {}) {
  if (!el) return;
  ensureCanvas(el, 1);
  if (reseed) {
    seedMap.set(el, (seedMap.get(el) || 1337) + 997);
  }

  const prev = morphTimers.get(el);
  if (prev) cancelAnimationFrame(prev);

  const start = performance.now();
  const seed = seedMap.get(el);

  function tick(now) {
    drawStroke(el, seed);
    if (now - start < durationMs) {
      morphTimers.set(el, requestAnimationFrame(tick));
    } else {
      morphTimers.delete(el);
    }
  }

  morphTimers.set(el, requestAnimationFrame(tick));
}

export function repaintMarker(el, { animate = false, reseed = false } = {}) {
  if (!el) return;
  ensureCanvas(el, 1);
  if (reseed) {
    seedMap.set(el, (seedMap.get(el) || 1337) + 997);
  }
  drawStroke(el, seedMap.get(el));

  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const canvas = el.querySelector(':scope > .marker-canvas');
    if (canvas && canvas.animate) {
      canvas.animate(
        [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
      );
    }
  }
}

export function repaintAllMarkers() {
  document.querySelectorAll('.swap-pill, .hl-swipe').forEach((el, idx) => {
    ensureCanvas(el, idx);
    drawStroke(el, seedMap.get(el));
  });
}

export function initMarkers() {
  const targets = document.querySelectorAll('.swap-pill, .hl-swipe');
  targets.forEach((el, idx) => {
    ensureCanvas(el, idx);
    drawStroke(el, seedMap.get(el));
  });

  if ('ResizeObserver' in window) {
    observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target;
        drawStroke(el, seedMap.get(el) || 1337);
      });
    });
    targets.forEach((el) => observer.observe(el));
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(repaintAllMarkers));
  }
}

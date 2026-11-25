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

  // Use offsetWidth/offsetHeight (unscaled CSS layout box) so ancestor CSS transforms
  // like hero scroll-shrink scale() never distort the marker canvas dimensions.
  const elW = el.offsetWidth;
  const elH = el.offsetHeight;
  if (elW < 4 || elH < 4) return;

  const isInlineSwipe = el.classList.contains('hl-swipe');
  const padX = isInlineSwipe ? 8 : 12;
  const padY = isInlineSwipe ? 6 : 12;

  const w = Math.ceil(elW + padX * 2);
  const h = Math.ceil(elH + padY * 2);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Keep a monotonic buffer width during live morphs to avoid GPU texture reallocation every frame
  const minBufW = isInlineSwipe ? w : Math.max(w, parseInt(canvas.dataset.bufW || '0', 10));
  const minBufH = isInlineSwipe ? h : Math.max(h, parseInt(canvas.dataset.bufH || '0', 10));
  const targetPxW = Math.round(minBufW * dpr);
  const targetPxH = Math.round(minBufH * dpr);

  if (canvas.width !== targetPxW || canvas.height !== targetPxH) {
    canvas.dataset.bufW = String(minBufW);
    canvas.dataset.bufH = String(minBufH);
    canvas.width = targetPxW;
    canvas.height = targetPxH;
    canvas.style.width = `${minBufW}px`;
    canvas.style.height = `${minBufH}px`;
  }

  canvas.style.left = `${-padX}px`;
  canvas.style.top = `${-padY}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, minBufW, minBufH);

  const rand = mulberry32(seed);
  const color = getMarkerColor();

  // Smooth hand-swiped highlighter stroke:
  // Single solid rounded-cap bezier path with natural bottom-left-to-top-right slant
  // and a subtle, silky pen-brushed wave (perfectly smooth rounded caps on every side).
  const thickness = isInlineSwipe ? elH * 0.74 : elH * 0.85;
  const radius = thickness / 2;
  const capInset = isInlineSwipe ? 2 : 2;
  const leftX = Math.min(w / 2 - 1, padX + radius - capInset);
  const rightX = Math.max(w / 2 + 1, w - padX - radius + capInset);
  const span = Math.max(2, rightX - leftX);
  const midY = h * (isInlineSwipe ? 0.55 : 0.50);

  const tilt = isInlineSwipe
    ? Math.min(2.0, Math.max(1.0, elW * 0.005))
    : Math.min(4.6, Math.max(2.2, elW * 0.014));
  const yStart = midY + tilt;
  const yEnd = midY - tilt;

  const lerp = (a, b, t) => a + (b - a) * t;
  const wave = isInlineSwipe
    ? 1.5
    : Math.min(3.4, Math.max(1.8, elW * 0.009));
  const subtleSeed = (rand() - 0.5) * (isInlineSwipe ? 0.5 : 0.9);

  // Subtle silky S-wave matching the gentle pen-brushed arch in the reference
  const cp1x = leftX + span * 0.33;
  const cp1y = lerp(yStart, yEnd, 0.33) - wave + subtleSeed;
  const cp2x = leftX + span * 0.67;
  const cp2y = lerp(yStart, yEnd, 0.67) + wave * 0.75 - subtleSeed;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(leftX, yStart);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, rightX, yEnd);
  ctx.stroke();
  ctx.restore();
  el.classList.add('has-marker');
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

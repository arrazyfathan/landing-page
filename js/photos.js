import { playClick, playPop } from './sound.js';

let photos = [];
let thumbImgs = [];
let activeIndex = 0;
let isOpen = false;
let isClosing = false;
let closeTimer = null;
let hiddenThumb = null;

const gridEl = document.getElementById('stagger-grid');
const countEl = document.getElementById('photo-count');

const viewer = document.getElementById('photo-lightbox');
const backdrop = document.getElementById('viewer-backdrop');
const lbImg = document.getElementById('lb-img');
const lbDate = document.getElementById('lb-date');
const lbCamera = document.getElementById('lb-camera');
const lbCounter = document.getElementById('lb-counter');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');
const lbClose = document.getElementById('lb-close');

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setHiddenThumb(imgEl) {
  if (hiddenThumb && hiddenThumb !== imgEl) {
    hiddenThumb.style.visibility = '';
  }
  hiddenThumb = imgEl || null;
  if (hiddenThumb) {
    hiddenThumb.style.visibility = 'hidden';
  }
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
  const srcThumb = thumbImgs[activeIndex];
  const fromRect = srcThumb ? srcThumb.getBoundingClientRect() : null;

  const ratio =
    fromRect && fromRect.height > 0
      ? fromRect.width / fromRect.height
      : srcThumb && srcThumb.naturalHeight > 0
        ? srcThumb.naturalWidth / srcThumb.naturalHeight
        : 9 / 16;

  const toRect = getTargetRect(ratio);

  updateMeta(activeIndex);
  lbImg.alt = `Cycling photo — ${item.date}`;
  // Start with already-cached thumbnail so Frame 1 of the FLIP zoom never flashes blank
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
    void lbImg.offsetWidth; // flush initial FLIP rect

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
  const rect = srcThumb ? srcThumb.getBoundingClientRect() : null;
  const ratio =
    rect && rect.height > 0
      ? rect.width / rect.height
      : srcThumb && srcThumb.naturalHeight > 0
        ? srcThumb.naturalWidth / srcThumb.naturalHeight
        : 9 / 16;
  const toRect = getTargetRect(ratio);

  playClick();
  setHiddenThumb(srcThumb);
  updateMeta(activeIndex);

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

  const srcThumb = thumbImgs[activeIndex];
  const backRect = srcThumb ? srcThumb.getBoundingClientRect() : null;
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
  const srcThumb = thumbImgs[activeIndex];
  const ratio =
    srcThumb && srcThumb.naturalHeight > 0
      ? srcThumb.naturalWidth / srcThumb.naturalHeight
      : 9 / 16;
  const toRect = getTargetRect(ratio);
  lbImg.style.transition = 'none';
  lbImg.style.width = `${toRect.width}px`;
  lbImg.style.height = `${toRect.height}px`;
  lbImg.style.transform = `translate3d(${toRect.left}px, ${toRect.top}px, 0) scale(1, 1)`;
  void lbImg.offsetWidth;
  lbImg.style.transition = '';
}

function getColumnCount() {
  if (window.innerWidth <= 600) return 4;
  if (window.innerWidth <= 860) return 6;
  if (window.innerWidth <= 1120) return 8;
  return 10;
}

const COL_OFFSETS_10 = [0, 18, 6, 22, 4, 20, 10, 24, 8, 16];
const COL_OFFSETS_8 = [0, 18, 6, 22, 4, 20, 10, 16];
const COL_OFFSETS_6 = [0, 18, 8, 22, 6, 16];
const COL_OFFSETS_4 = [0, 16, 6, 20];

let lastColCount = 0;

function renderStaggerGrid() {
  if (!gridEl || !photos.length) return;
  const colCount = getColumnCount();
  if (colCount === lastColCount && gridEl.children.length === colCount) return;
  lastColCount = colCount;

  const offsets =
    colCount === 10
      ? COL_OFFSETS_10
      : colCount === 8
        ? COL_OFFSETS_8
        : colCount === 6
          ? COL_OFFSETS_6
          : COL_OFFSETS_4;

  gridEl.innerHTML = '';
  thumbImgs = new Array(photos.length);

  const columns = Array.from({ length: colCount }, (_, colIdx) => {
    const col = document.createElement('div');
    col.className = 'stagger-col';
    col.style.setProperty('--col-offset', `${offsets[colIdx % offsets.length]}px`);
    gridEl.appendChild(col);
    return col;
  });

  photos.forEach((item, idx) => {
    const fig = document.createElement('figure');
    fig.className = 'stagger-item';
    fig.setAttribute('role', 'listitem');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stagger-open';
    btn.setAttribute('aria-label', `Open photo from ${item.date}`);

    const img = document.createElement('img');
    img.src = item.thumb;
    img.alt = `Cycling photo taken ${item.date}`;
    img.loading = 'lazy';
    img.decoding = 'async';

    thumbImgs[idx] = img;
    btn.appendChild(img);
    btn.addEventListener('click', () => openLightbox(idx));
    fig.appendChild(btn);

    columns[idx % colCount].appendChild(fig);
  });

  if (countEl) {
    countEl.textContent = `${photos.length} photos`;
  }
}

function wireEvents() {
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
    renderStaggerGrid();
    repositionOpenImage();
  });
}

export async function initCyclingPhotos() {
  if (!gridEl) return;
  wireEvents();

  try {
    const res = await fetch('./assets/photos/photos.json');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      photos = data;
      renderStaggerGrid();
    }
  } catch (_) {}
}

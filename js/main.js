import {
  isSoundEnabled,
  setSoundEnabled,
  playClick,
  playPop,
  playSwitch,
  playSuccess
} from './sound.js';
import { initMarkers, morphMarker, repaintAllMarkers } from './marker.js?v=7';
import { initCyclingPhotos } from './photos.js';

const root = document.documentElement;
const EMAIL = 'hello@arrazyfathan.com';

/* 1. Toast Feedback */
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message) {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('is-open'));
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-open');
    setTimeout(() => {
      toastEl.hidden = true;
    }, 220);
  }, 2000);
}

/* 2. Gentle Scroll Reveal (.up -> .in) */
let revealObserver = null;

function setupScrollReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.up').forEach((el) => el.classList.add('in'));
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.01, rootMargin: '0px 0px 80px 0px' }
  );

  observeVisibleReveals();
}

function observeVisibleReveals() {
  document.querySelectorAll('.up:not(.in)').forEach((el) => {
    if (el.offsetParent === null) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 80) {
      el.classList.add('in');
    } else if (revealObserver) {
      revealObserver.observe(el);
    }
  });
}

/* 3. Smooth Profile Navigation & Card Swap Feedback (/, /cycling/, /connect/) */
const supportsMpaViewTransition =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('view-transition-name', 'avatar-work') &&
  'onpagereveal' in window;

function navigateProfile(href, goingToCycling) {
  playSwitch(goingToCycling);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (supportsMpaViewTransition || reducedMotion) {
    window.location.href = href;
    return;
  }

  // Smooth pre-navigation card-swap fallback for browsers without cross-document View Transitions
  const targetProfile = goingToCycling ? 'cycling' : 'work';
  root.setAttribute('data-profile', targetProfile);
  document.body.classList.add('is-switching');
  setTimeout(() => {
    window.location.href = href;
  }, 340);
}

const photoToggle = document.getElementById('profile-photo-toggle');
if (photoToggle) {
  photoToggle.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const href = photoToggle.getAttribute('href') || '/';
    const goingToCycling = href.startsWith('/cycling');

    if (supportsMpaViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      playSwitch(goingToCycling);
      return;
    }

    e.preventDefault();
    navigateProfile(href, goingToCycling);
  });
}

/* 4. Light ("Sat") / Dark ("Sun") Paper Theme Toggle */
const dayToggle = document.getElementById('day-toggle');
const themeMeta = document.querySelector('meta[name="theme-color"]');

function syncDayUI() {
  const isSun = root.getAttribute('data-day') === 'sun';
  if (dayToggle) dayToggle.setAttribute('aria-checked', String(isSun));
  if (themeMeta) themeMeta.setAttribute('content', isSun ? '#14120E' : '#FBFAF7');
}

function toggleDay() {
  const next = root.getAttribute('data-day') === 'sun' ? 'sat' : 'sun';
  root.setAttribute('data-day', next);
  try {
    sessionStorage.setItem('arrazy-day', next);
  } catch (_) {}
  syncDayUI();
  repaintAllMarkers();
  playClick();
}

if (dayToggle) {
  dayToggle.addEventListener('click', toggleDay);
}
syncDayUI();

/* 5. Sound Toggle */
const soundToggle = document.getElementById('sound-toggle');

function syncSoundUI() {
  if (soundToggle) {
    soundToggle.setAttribute('aria-pressed', String(isSoundEnabled()));
  }
}

if (soundToggle) {
  soundToggle.addEventListener('click', () => {
    setSoundEnabled(!isSoundEnabled());
    syncSoundUI();
  });
}
syncSoundUI();

/* 6. Tappable + Auto-Swapping Highlighted Hero Words (4s interval + manual tap) */
let totalSwaps = 0;

function updateSwapHints() {
  const hints = document.querySelectorAll('.swap-hint-text');
  if (!hints.length) return;
  let nextText = null;
  if (totalSwaps === 1) nextText = 'Every combination still reads. Keep going.';
  else if (totalSwaps === 4) nextText = 'Nice combo. Tap any highlighted word again.';
  if (!nextText) return;
  hints.forEach((el) => {
    el.textContent = nextText;
  });
}

const swapControllers = [];
let autoSwapPaused = false;
let autoSwapTimer = null;
let heroScrollProgress = 0;

document.querySelectorAll('.swap-pill').forEach((btn) => {
  const words = (btn.getAttribute('data-swap') || '').split('|').filter(Boolean);
  const icons = (btn.getAttribute('data-icons') || '').split('|').filter(Boolean);
  const innerEl = btn.querySelector('.swap-inner');
  const textEl = btn.querySelector('.swap-text');
  const iconEl = btn.querySelector('.swap-icon');

  if (words.length < 2 || !textEl || !innerEl) return;
  let idx = 0;
  let swapSeq = 0;
  let exitTimer = null;
  let settleTimer = null;

  function triggerSwap({ manual = true } = {}) {
    const seq = ++swapSeq;
    clearTimeout(exitTimer);
    clearTimeout(settleTimer);

    idx = (idx + 1) % words.length;
    if (manual) {
      totalSwaps += 1;
      updateSwapHints();
      playPop(0.95 + idx * 0.08);
      resetAutoSwapTimer();
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      textEl.textContent = words[idx];
      if (iconEl && icons[idx]) iconEl.src = icons[idx];
      morphMarker(btn, 60, { reseed: true });
      return;
    }

    // 1. Capture current live unscaled layout width (immune to ancestor scroll scale)
    const oldWidth = btn.offsetWidth;
    btn.style.width = `${oldWidth}px`;

    // 2. Quick blur-up exit on current content
    btn.classList.remove('is-entering');
    btn.classList.add('is-exiting');

    exitTimer = setTimeout(() => {
      if (seq !== swapSeq) return;

      // 3. Swap word & icon and measure exact unscaled target width
      textEl.textContent = words[idx];
      if (iconEl && icons[idx]) {
        iconEl.src = icons[idx];
      }

      const cs = getComputedStyle(btn);
      const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const targetWidth = Math.ceil(innerEl.offsetWidth + padH);

      // 4. Prep enter state (blurred & slightly below) with no transition
      btn.classList.remove('is-exiting');
      btn.classList.add('is-entering');
      void btn.offsetWidth; // flush pre-enter styles

      // 5. Release into crisp blur-in + silky width morph + gentle icon hop + live canvas morph
      btn.classList.remove('is-entering');
      btn.style.width = `${targetWidth}px`;

      if (iconEl) {
        iconEl.classList.remove('is-wiggle');
        void iconEl.offsetWidth;
        iconEl.classList.add('is-wiggle');
      }

      // Keep same organic seed so the marker glides smoothly without jumping shape
      morphMarker(btn, 540, { reseed: false });

      settleTimer = setTimeout(() => {
        if (seq !== swapSeq) return;
        btn.style.width = '';
        if (iconEl) iconEl.classList.remove('is-wiggle');
      }, 550);
    }, 125);
  }

  btn.addEventListener('click', () => triggerSwap({ manual: true }));
  btn.addEventListener('mouseenter', () => { autoSwapPaused = true; });
  btn.addEventListener('mouseleave', () => { autoSwapPaused = false; });
  btn.addEventListener('focus', () => { autoSwapPaused = true; });
  btn.addEventListener('blur', () => { autoSwapPaused = false; });

  swapControllers.push({ btn, triggerSwap });
});

function runAutoSwapCycle() {
  if (
    autoSwapPaused ||
    heroScrollProgress > 0.15 ||
    document.hidden ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.querySelector('.photo-viewer:not([hidden])')
  ) {
    return;
  }

  // Cascade each marker smoothly with a gentle 220ms wave
  swapControllers.forEach((ctrl, i) => {
    setTimeout(() => {
      if (autoSwapPaused || document.hidden) return;
      ctrl.triggerSwap({ manual: false });
    }, i * 220);
  });
}

function resetAutoSwapTimer() {
  clearInterval(autoSwapTimer);
  if (swapControllers.length > 0) {
    autoSwapTimer = setInterval(runAutoSwapCycle, 5000);
  }
}

resetAutoSwapTimer();

/* 7. Copy Email Pill */
document.querySelectorAll('[data-copy-email]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const label = btn.querySelector('.copy-label');
    const originalText = label ? label.textContent : '';
    try {
      await navigator.clipboard.writeText(EMAIL);
      playSuccess();
      showToast(`Copied ${EMAIL}`);
      if (label) {
        label.textContent = 'Copied!';
        setTimeout(() => {
          label.textContent = originalText || 'Copy email';
        }, 1600);
      }
    } catch (_) {
      window.location.href = `mailto:${EMAIL}`;
    }
  });
});

/* 8. Dynamic Current Year + Subtle Keyboard Shortcuts (W / C / D) */
const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.photo-viewer:not([hidden])')) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
    return;
  }
  const key = e.key.toLowerCase();
  const path = window.location.pathname;
  if (key === 'w' && path !== '/' && path !== '/index.html') {
    navigateProfile('/', false);
  } else if (key === 'c' && !path.startsWith('/cycling')) {
    navigateProfile('/cycling/', true);
  } else if (key === 'd') {
    toggleDay();
  }
});

/* 9. Full-Viewport Hero Scroll-Driven Shrink Transition */
function initHeroScrollShrink() {
  const hero = document.querySelector('.hero');
  const inner = hero && hero.querySelector('.hero-inner');
  if (!hero || !inner) return;

  function applyHeroScroll() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const range = Math.max(260, hero.offsetHeight * 0.95);
    const raw = Math.min(1, Math.max(0, scrollY / range));
    heroScrollProgress = raw;

    if (reducedMotion || raw <= 0.002) {
      inner.style.transform = '';
      inner.style.opacity = '';
      inner.style.filter = '';
      hero.style.pointerEvents = '';
      return;
    }

    // Sticky hero smoothly shrinks and fades across the full rise of the intro section
    const scale = 1 - raw * 0.30;           // 1.00 -> 0.70
    const translateY = -raw * 24;           // 0 -> -24px gentle lift
    const opacity = Math.max(0, 1 - raw * 1.08); // 1.00 -> 0.00 smoothly
    const blur = raw * 4;                   // 0 -> 4px soft depth-of-field

    inner.style.transform = `translate3d(0, ${translateY.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
    inner.style.opacity = opacity.toFixed(3);
    inner.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : '';
    hero.style.pointerEvents = raw > 0.75 ? 'none' : '';
  }

  window.addEventListener('scroll', applyHeroScroll, { passive: true });
  window.addEventListener('resize', applyHeroScroll, { passive: true });
  applyHeroScroll();
}

/* 10. Inline Product & Open-Source Project Icon Popover (Hover + Click/Tap) */
function initInlineAppPopovers() {
  const buttons = Array.from(document.querySelectorAll('.inline-app-btn'));
  if (!buttons.length) return;

  const popover = document.createElement('div');
  popover.className = 'app-popover';
  popover.setAttribute('role', 'tooltip');
  document.body.appendChild(popover);

  let activeBtn = null;
  let pinnedBtn = null;
  let hideTimer = null;

  function renderPopoverContent(btn) {
    const name = btn.getAttribute('data-app-name') || '';
    const url = btn.getAttribute('data-app-url') || '';
    popover.textContent = '';
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'app-popover-link';
      a.textContent = name;
      const arrow = document.createElement('span');
      arrow.className = 'app-popover-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      a.appendChild(arrow);
      popover.appendChild(a);
    } else {
      popover.textContent = name;
    }
  }

  function positionPopover(btn) {
    const rect = btn.getBoundingClientRect();
    const popW = popover.offsetWidth;
    const popH = popover.offsetHeight;
    const vw = window.innerWidth;
    const margin = 12;

    const btnCenterX = rect.left + rect.width / 2;
    const rawX = btnCenterX - popW / 2;
    const clampedX = Math.max(margin, Math.min(vw - popW - margin, rawX));
    const popY = Math.max(margin, rect.top - popH - 12);
    const arrowX = Math.max(12, Math.min(popW - 12, btnCenterX - clampedX));

    popover.style.setProperty('--pop-x', `${Math.round(clampedX)}px`);
    popover.style.setProperty('--pop-y', `${Math.round(popY)}px`);
    popover.style.setProperty('--arrow-x', `${Math.round(arrowX)}px`);
  }

  function showFor(btn, { pin = false } = {}) {
    clearTimeout(hideTimer);
    if (activeBtn && activeBtn !== btn) {
      activeBtn.classList.remove('is-active');
    }
    activeBtn = btn;
    if (pin) pinnedBtn = btn;
    btn.classList.add('is-active');

    renderPopoverContent(btn);
    positionPopover(btn);
    requestAnimationFrame(() => {
      if (activeBtn === btn) {
        positionPopover(btn);
        popover.classList.add('is-open');
      }
    });
  }

  function hideAll(immediate = false) {
    clearTimeout(hideTimer);
    const doHide = () => {
      if (activeBtn) activeBtn.classList.remove('is-active');
      activeBtn = null;
      pinnedBtn = null;
      popover.classList.remove('is-open');
    };
    if (immediate) doHide();
    else hideTimer = setTimeout(doHide, 140);
  }

  buttons.forEach((btn) => {
    btn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      if (pinnedBtn && pinnedBtn !== btn) {
        pinnedBtn.classList.remove('is-active');
        pinnedBtn = null;
      }
      showFor(btn, { pin: false });
    });

    btn.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      if (pinnedBtn === btn) return;
      hideAll(false);
    });

    btn.addEventListener('focus', () => {
      showFor(btn, { pin: false });
    });

    btn.addEventListener('blur', () => {
      if (pinnedBtn === btn) return;
      hideAll(false);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playPop(1.04);
      const url = btn.getAttribute('data-app-url');

      if (pinnedBtn === btn) {
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        hideAll(true);
        return;
      }

      showFor(btn, { pin: true });
    });
  });

  popover.addEventListener('pointerenter', () => {
    clearTimeout(hideTimer);
  });

  popover.addEventListener('pointerleave', () => {
    if (!pinnedBtn) hideAll(false);
  });

  document.addEventListener('click', (e) => {
    if (!activeBtn) return;
    if (popover.contains(e.target)) return;
    hideAll(true);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeBtn) {
      hideAll(true);
    }
  });

  window.addEventListener('scroll', () => {
    if (activeBtn) positionPopover(activeBtn);
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (activeBtn) positionPopover(activeBtn);
  }, { passive: true });
}

/* Boot */
setupScrollReveal();
initMarkers();
initCyclingPhotos();
initHeroScrollShrink();
initInlineAppPopovers();

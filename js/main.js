import {
  isSoundEnabled,
  setSoundEnabled,
  playClick,
  playHover,
  playPop,
  playSwitch,
  playSuccess,
  playFocusStep,
  playFocusLock
} from './sound.js?v=6';
import { initMarkers, morphMarker, repaintAllMarkers } from './marker.js?v=12';
import { initCyclingPhotos, syncCyclingPhotosTheme } from './photos.js?v=30';
import { initTrophyCase } from './trophies.js?v=25';
import { initRidePodcasts } from './podcasts.js?v=6';

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

/* 2. Smooth Scroll Reveal (.up / .reveal -> .in) */
let revealObserver = null;

function markScrollRevealTargets() {
  const singleSelectors = [
    '.prose > p',
    '.prose > .signature',
    '.prose > .ride-stats',
    '.photo-gallery-head',
    '.watch-gallery',
    '.trophy-head',
    '.trophy-prs',
    '.podcast-head',
    '.podcast-stage',
    '.connect-head',
    '.connect > .connect-label',
    '.foot',
  ];

  singleSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (!el.classList.contains('reveal') && !el.classList.contains('up')) {
        el.classList.add('reveal');
      }
    });
  });

  document.querySelectorAll('.connect-row').forEach((row) => {
    row.querySelectorAll('.connect-pill').forEach((pill, i) => {
      pill.classList.add('reveal');
      pill.style.setProperty('--reveal-delay', `${i * 45}ms`);
    });
  });
}

function observeRevealEl(el) {
  if (!el || el.classList.contains('in')) return;
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.classList.add('in');
    return;
  }
  if (el.offsetParent === null) return;
  const rect = el.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.92) {
    el.classList.add('in');
  } else if (revealObserver) {
    revealObserver.observe(el);
  }
}

function setupScrollReveal() {
  markScrollRevealTargets();

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.up, .reveal').forEach((el) => el.classList.add('in'));
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
    { threshold: 0.04, rootMargin: '0px 0px -24px 0px' }
  );

  /* Footer uses positive bottom margin so it reliably reveals at page bottom with zero scroll listener */
  const footEl = document.querySelector('.foot.reveal:not(.in)');
  if (footEl) {
    const footObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0] && entries[0].isIntersecting) {
          footEl.classList.add('in');
          footObserver.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px 40px 0px' }
    );
    footObserver.observe(footEl);
  }

  document.querySelectorAll('.up:not(.in), .reveal:not(.in)').forEach((el) => {
    if (el === footEl) return;
    observeRevealEl(el);
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

/* 4. Three-Way Theme Toggle: Light ("Sat") / Dark ("Sun") / Cutting Mat ("Mat") + 7-Color Picker */
const themeControl = document.getElementById('theme-control');
const dayToggle = document.getElementById('day-toggle');
const matToggle = document.getElementById('mat-toggle');
const matPicker = document.getElementById('mat-picker');
const matPickerName = document.getElementById('mat-picker-name');
const themeModeButtons = Array.from(document.querySelectorAll('[data-theme-mode]'));
const matSwatches = Array.from(document.querySelectorAll('[data-mat-color]'));
const themeMeta = document.querySelector('meta[name="theme-color"]');

const MAT_THEMES = {
  black:  { label: 'Obsidian Black', hex: '#121315' },
  gray:   { label: 'Graphite Gray',  hex: '#5A5A5A' },
  maroon: { label: 'Crimson Maroon', hex: '#4A0404' },
  blue:   { label: 'Cobalt Blue',    hex: '#002F9E' },
  orange: { label: 'Signal Orange',  hex: '#FF3F0A' },
  pink:   { label: 'Rose Pink',      hex: '#AD4679' },
  green:  { label: 'Classic Green',  hex: '#095848' },
};

const THEME_ORDER = ['sat', 'sun', 'mat'];

function getCurrentDay() {
  const val = root.getAttribute('data-day');
  return val === 'sun' || val === 'mat' ? val : 'sat';
}

function getCurrentMat() {
  const val = root.getAttribute('data-mat');
  return Object.prototype.hasOwnProperty.call(MAT_THEMES, val) ? val : 'green';
}

function syncDayUI() {
  const day = getCurrentDay();
  const mat = getCurrentMat();
  const matMeta = MAT_THEMES[mat];

  themeModeButtons.forEach((btn) => {
    const isSelected = btn.getAttribute('data-theme-mode') === day;
    btn.setAttribute('aria-checked', String(isSelected));
  });

  matSwatches.forEach((btn) => {
    const isSelected = btn.getAttribute('data-mat-color') === mat;
    btn.setAttribute('aria-pressed', String(isSelected));
  });

  if (matPickerName) {
    matPickerName.textContent = matMeta.label;
  }

  if (themeMeta) {
    const color = day === 'mat' ? matMeta.hex : day === 'sun' ? '#14120E' : '#FBFAF7';
    themeMeta.setAttribute('content', color);
  }
}

let activeThemeTransition = null;
let matPickerOpen = false;
let matPickerCloseTimer = null;
let syncHeroOpacityForTheme = null;

function openMatPicker() {
  if (!matPicker) return;
  clearTimeout(matPickerCloseTimer);
  matPickerOpen = true;
  matPicker.hidden = false;
  if (matToggle) matToggle.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    if (matPickerOpen) matPicker.classList.add('is-open');
  });
}

function closeMatPicker({ immediate = false } = {}) {
  if (!matPicker || (!matPickerOpen && matPicker.hidden)) return;
  clearTimeout(matPickerCloseTimer);
  matPickerOpen = false;
  matPicker.classList.remove('is-open');
  if (matToggle) matToggle.setAttribute('aria-expanded', 'false');
  if (immediate) {
    matPicker.hidden = true;
  } else {
    matPickerCloseTimer = setTimeout(() => {
      if (!matPickerOpen) matPicker.hidden = true;
    }, 190);
  }
}

function commitThemeState(nextDay, nextMat) {
  root.setAttribute('data-day', nextDay);
  root.setAttribute('data-mat', nextMat);
  try {
    sessionStorage.setItem('arrazy-day', nextDay);
    sessionStorage.setItem('arrazy-mat', nextMat);
  } catch (_) {}
  syncDayUI();
  repaintAllMarkers();
  syncCyclingPhotosTheme();
  if (typeof syncHeroOpacityForTheme === 'function') {
    syncHeroOpacityForTheme();
  }
}

function runThemeTransition(nextDay, nextMat) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canViewTransition = typeof document.startViewTransition === 'function' && !reducedMotion;

  if (!canViewTransition) {
    commitThemeState(nextDay, nextMat);
    return;
  }

  if (activeThemeTransition) {
    try {
      activeThemeTransition.skipTransition();
    } catch (_) {}
    activeThemeTransition = null;
  }

  root.classList.add('is-theme-switching');

  const vt = document.startViewTransition(() => {
    commitThemeState(nextDay, nextMat);
  });
  activeThemeTransition = vt;

  vt.finished.finally(() => {
    if (activeThemeTransition === vt) {
      activeThemeTransition = null;
      root.classList.remove('is-theme-switching');
    }
  });
}

function selectThemeMode(nextDay, { openPickerForMat = true } = {}) {
  const currentDay = getCurrentDay();
  const currentMat = getCurrentMat();

  if (nextDay === 'mat') {
    if (currentDay === 'mat') {
      playClick();
      if (matPickerOpen) closeMatPicker();
      else openMatPicker();
      return;
    }
    playClick();
    runThemeTransition('mat', currentMat);
    if (openPickerForMat) openMatPicker();
    return;
  }

  closeMatPicker({ immediate: true });
  if (currentDay === nextDay) return;
  playClick();
  runThemeTransition(nextDay, currentMat);
}

function selectMatColor(nextMat) {
  if (!Object.prototype.hasOwnProperty.call(MAT_THEMES, nextMat)) return;
  const currentDay = getCurrentDay();
  const currentMat = getCurrentMat();
  if (currentDay === 'mat' && currentMat === nextMat) {
    playPop(1.06);
    return;
  }
  playPop(1.0 + Object.keys(MAT_THEMES).indexOf(nextMat) * 0.035);
  runThemeTransition('mat', nextMat);
}

function toggleDay() {
  const idx = THEME_ORDER.indexOf(getCurrentDay());
  const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
  selectThemeMode(next, { openPickerForMat: next === 'mat' });
}

themeModeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.getAttribute('data-theme-mode');
    if (mode) selectThemeMode(mode, { openPickerForMat: true });
  });
});

matSwatches.forEach((btn, idx) => {
  const color = btn.getAttribute('data-mat-color');
  const label = btn.getAttribute('data-mat-label') || '';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (color) selectMatColor(color);
  });

  btn.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    playHover(0.95 + idx * 0.04);
    if (matPickerName && label) matPickerName.textContent = label;
  });

  btn.addEventListener('pointerleave', () => {
    if (matPickerName) matPickerName.textContent = MAT_THEMES[getCurrentMat()].label;
  });

  btn.addEventListener('focus', () => {
    if (matPickerName && label) matPickerName.textContent = label;
  });

  btn.addEventListener('blur', () => {
    if (matPickerName) matPickerName.textContent = MAT_THEMES[getCurrentMat()].label;
  });
});

document.addEventListener('pointerdown', (e) => {
  if (!matPickerOpen || !themeControl) return;
  if (!themeControl.contains(e.target)) {
    closeMatPicker();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && matPickerOpen) {
    closeMatPicker();
    if (matToggle) matToggle.focus();
  }
});

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
const mobileSwapQuery = window.matchMedia('(max-width: 600px)');

document.querySelectorAll('.swap-pill').forEach((btn) => {
  const desktopWords = (btn.getAttribute('data-swap') || '').split('|').filter(Boolean);
  const mobileWords = (btn.getAttribute('data-swap-mobile') || '').split('|').filter(Boolean);
  const verbs = btn.hasAttribute('data-verbs')
    ? (btn.getAttribute('data-verbs') || '').split('|')
    : [];
  const verbTargetId = btn.getAttribute('data-verb-target');
  const verbEl = verbTargetId ? document.getElementById(verbTargetId) : null;
  const verbInnerEl = verbEl ? verbEl.querySelector('.swap-verb-inner') : null;
  const icons = (btn.getAttribute('data-icons') || '').split('|');
  const iconsMid = btn.hasAttribute('data-icons-mid')
    ? (btn.getAttribute('data-icons-mid') || '').split('|')
    : [];
  const innerEl = btn.querySelector('.swap-inner');
  const textEl = btn.querySelector('.swap-text');
  const textAfterEl = btn.querySelector('.swap-text-after');
  const iconEl = btn.querySelector('.swap-icon:not(.swap-icon--mid)');
  const iconMidEl = btn.querySelector('.swap-icon--mid');

  if (desktopWords.length < 2 || !textEl || !innerEl) return;
  let idx = 0;
  let swapSeq = 0;
  let exitTimer = null;
  let settleTimer = null;

  function applyVerb(i) {
    if (verbInnerEl && verbs[i]) {
      verbInnerEl.textContent = verbs[i];
    }
  }

  function applyContent(word, i) {
    if (iconEl && icons[i]) {
      iconEl.src = icons[i];
    }
    const parts = word.split('::');
    textEl.textContent = parts[0];

    const midSrc = iconsMid[i] || '';
    if (iconMidEl) {
      if (midSrc) {
        iconMidEl.src = midSrc;
        iconMidEl.hidden = false;
      } else {
        iconMidEl.hidden = true;
      }
    }
    if (textAfterEl) {
      if (parts.length > 1 && parts[1]) {
        textAfterEl.textContent = parts[1];
        textAfterEl.hidden = false;
      } else {
        textAfterEl.textContent = '';
        textAfterEl.hidden = true;
      }
    }
  }

  function getActiveWords() {
    return mobileSwapQuery.matches && mobileWords.length === desktopWords.length
      ? mobileWords
      : desktopWords;
  }

  function syncWordForViewport() {
    const word = getActiveWords()[idx];
    applyContent(word, idx);
    applyVerb(idx);
    btn.style.width = '';
    if (verbEl) verbEl.style.width = '';
    morphMarker(btn, 80, { reseed: false });
  }

  // Sync initial word, verb & icons immediately
  applyContent(getActiveWords()[idx], idx);
  applyVerb(idx);

  function triggerSwap({ manual = true } = {}) {
    const seq = ++swapSeq;
    clearTimeout(exitTimer);
    clearTimeout(settleTimer);

    const activeWords = getActiveWords();
    const prevVerb = verbs[idx] || '';
    idx = (idx + 1) % activeWords.length;
    const nextVerb = verbs[idx] || '';
    const verbChanged = Boolean(verbEl && verbInnerEl && nextVerb && nextVerb !== prevVerb);

    if (manual) {
      totalSwaps += 1;
      updateSwapHints();
      playPop(0.95 + idx * 0.08);
      resetAutoSwapTimer();
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      applyContent(activeWords[idx], idx);
      applyVerb(idx);
      morphMarker(btn, 60, { reseed: true });
      return;
    }

    // 1. Capture current live unscaled layout width (immune to ancestor scroll scale)
    const oldWidth = btn.offsetWidth;
    btn.style.width = `${oldWidth}px`;
    if (verbChanged) {
      verbEl.style.width = `${verbEl.offsetWidth}px`;
      verbEl.classList.remove('is-entering');
      verbEl.classList.add('is-exiting');
    }

    // 2. Quick blur-up exit on current content
    btn.classList.remove('is-entering');
    btn.classList.add('is-exiting');

    exitTimer = setTimeout(() => {
      if (seq !== swapSeq) return;
      if (!manual && heroScrollProgress > 0.05) {
        btn.classList.remove('is-exiting');
        btn.style.width = '';
        if (verbEl) {
          verbEl.classList.remove('is-exiting');
          verbEl.style.width = '';
        }
        return;
      }

      // 3. Swap word, verb & icon(s) and measure exact unscaled target width
      applyContent(getActiveWords()[idx], idx);
      if (verbChanged) applyVerb(idx);

      const cs = getComputedStyle(btn);
      const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const targetWidth = Math.ceil(innerEl.offsetWidth + padH);
      const targetVerbWidth = verbChanged ? Math.ceil(verbInnerEl.offsetWidth) : 0;

      // 4. Prep enter state (blurred & slightly below) with no transition
      btn.classList.remove('is-exiting');
      btn.classList.add('is-entering');
      if (verbChanged) {
        verbEl.classList.remove('is-exiting');
        verbEl.classList.add('is-entering');
      }
      void btn.offsetWidth; // flush pre-enter styles

      // 5. Release into crisp blur-in + silky width morph + gentle icon hop + live canvas morph
      btn.classList.remove('is-entering');
      btn.style.width = `${targetWidth}px`;
      if (verbChanged) {
        verbEl.classList.remove('is-entering');
        verbEl.style.width = `${targetVerbWidth}px`;
      }

      [iconEl, iconMidEl].forEach((el) => {
        if (el && !el.hidden) {
          el.classList.remove('is-wiggle');
          void el.offsetWidth;
          el.classList.add('is-wiggle');
        }
      });

      // Keep same organic seed so the marker glides smoothly without jumping shape
      morphMarker(btn, 540, { reseed: false });

      settleTimer = setTimeout(() => {
        if (seq !== swapSeq) return;
        btn.style.width = '';
        if (verbEl) verbEl.style.width = '';
        if (iconEl) iconEl.classList.remove('is-wiggle');
        if (iconMidEl) iconMidEl.classList.remove('is-wiggle');
      }, 550);
    }, 125);
  }

  btn.addEventListener('click', () => triggerSwap({ manual: true }));
  btn.addEventListener('mouseenter', () => { autoSwapPaused = true; });
  btn.addEventListener('mouseleave', () => { autoSwapPaused = false; });
  btn.addEventListener('focus', () => { autoSwapPaused = true; });
  btn.addEventListener('blur', () => { autoSwapPaused = false; });

  swapControllers.push({ btn, triggerSwap, syncWordForViewport });
});

if (mobileSwapQuery.addEventListener) {
  mobileSwapQuery.addEventListener('change', () => {
    swapControllers.forEach((ctrl) => ctrl.syncWordForViewport());
  });
}

function runAutoSwapCycle() {
  if (
    autoSwapPaused ||
    heroScrollProgress > 0.05 ||
    document.hidden ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.querySelector('.photo-viewer:not([hidden])')
  ) {
    return;
  }

  // Cascade each marker smoothly with a gentle 220ms wave
  swapControllers.forEach((ctrl, i) => {
    setTimeout(() => {
      if (autoSwapPaused || heroScrollProgress > 0.05 || document.hidden) return;
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

/* 9. Full-Viewport Hero Scroll-Driven Shrink Transition + Sticky Topbar Alignment */
function initHeroScrollShrink() {
  const topbar = document.querySelector('.topbar');
  const hero = document.querySelector('.hero');
  const inner = hero && hero.querySelector('.hero-inner');
  const scrollCue = hero && hero.querySelector('.scroll-cue');
  if (!hero || !inner) {
    if (!topbar) return;
    let topbarScrolled = false;
    let rafId = 0;
    const syncTopbar = () => {
      rafId = 0;
      const next = (window.scrollY || 0) > 24;
      if (next !== topbarScrolled) {
        topbarScrolled = next;
        topbar.classList.toggle('is-scrolled', topbarScrolled);
      }
    };
    window.addEventListener('scroll', () => {
      if (!rafId) rafId = requestAnimationFrame(syncTopbar);
    }, { passive: true });
    syncTopbar();
    return;
  }

  if (scrollCue) {
    scrollCue.addEventListener('click', () => {
      playClick();
    });
  }

  const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionMq.matches;
  let lastViewportW = window.innerWidth;
  let range = Math.max(260, hero.offsetHeight * 0.95);
  let rafId = 0;
  let lastRaw = -1;
  let cueHidden = false;
  let topbarScrolled = false;
  let heroHidden = false;
  let heroWillChange = false;
  let pointerDisabled = false;

  if (reducedMotionMq.addEventListener) {
    reducedMotionMq.addEventListener('change', (e) => {
      reducedMotion = e.matches;
      lastRaw = -1;
      scheduleUpdate();
    });
  }

  function measureRange() {
    // Ignore vertical-only resizes caused by mobile Chrome's collapsing URL bar mid-scroll
    if (window.innerWidth === lastViewportW) return;
    lastViewportW = window.innerWidth;
    range = Math.max(260, hero.offsetHeight * 0.95);
    if (topbar && lastViewportW <= 760 && topbarScrolled) {
      topbarScrolled = false;
      topbar.classList.remove('is-scrolled');
    }
    lastRaw = -1;
    scheduleUpdate();
  }

  function applyHeroScroll() {
    rafId = 0;
    const scrollY = window.scrollY || 0;
    const progress = Math.min(1, Math.max(0, scrollY / range));
    const raw = reducedMotion ? 0 : progress;
    heroScrollProgress = raw;

    if (topbar && lastViewportW > 760) {
      const shouldAlignTopbar = progress > 0.35;
      if (shouldAlignTopbar !== topbarScrolled) {
        topbarScrolled = shouldAlignTopbar;
        topbar.classList.toggle('is-scrolled', topbarScrolled);
      }
    }

    if (scrollCue) {
      const shouldHideCue = scrollY > 36;
      if (shouldHideCue !== cueHidden) {
        cueHidden = shouldHideCue;
        scrollCue.classList.toggle('is-hidden', cueHidden);
      }
    }

    if (Math.abs(raw - lastRaw) < 0.0004) return;
    lastRaw = raw;

    if (raw <= 0.001) {
      inner.style.transform = 'translate3d(0, 0, 0) scale(1)';
      inner.style.opacity = '1';
      if (heroWillChange) {
        heroWillChange = false;
        inner.style.willChange = '';
      }
      if (heroHidden) {
        heroHidden = false;
        inner.style.visibility = '';
      }
      if (pointerDisabled) {
        pointerDisabled = false;
        hero.style.pointerEvents = '';
      }
      return;
    }

    const shouldDisablePointer = raw > 0.72;
    if (shouldDisablePointer !== pointerDisabled) {
      pointerDisabled = shouldDisablePointer;
      hero.style.pointerEvents = pointerDisabled ? 'none' : '';
    }

    if (raw >= 0.998) {
      inner.style.opacity = '0';
      if (heroWillChange) {
        heroWillChange = false;
        inner.style.willChange = '';
      }
      if (!heroHidden) {
        heroHidden = true;
        inner.style.visibility = 'hidden';
      }
      return;
    }

    if (heroHidden) {
      heroHidden = false;
      inner.style.visibility = '';
    }
    if (!heroWillChange) {
      heroWillChange = true;
      inner.style.willChange = 'transform, opacity';
    }

    // Pure GPU-composited shrink & fade (no filter: blur, no layout reads)
    // In Cutting Mat mode, fade hero slightly earlier so transparent .letter never crosses hero text
    const isMat = root.getAttribute('data-day') === 'mat';
    const scale = 1 - raw * 0.24;               // 1.00 -> 0.76
    const translateY = -raw * 22;               // 0 -> -22px gentle recess
    const fadeRaw = isMat ? Math.min(1, raw * 1.75) : raw;
    const fade = fadeRaw * fadeRaw * 0.35 + fadeRaw * 0.65; // smooth ease-in-out fade
    const opacity = Math.max(0, 1 - fade * 1.04);

    inner.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    inner.style.opacity = opacity.toFixed(3);
  }

  function scheduleUpdate() {
    if (!rafId) {
      rafId = requestAnimationFrame(applyHeroScroll);
    }
  }

  syncHeroOpacityForTheme = () => {
    lastRaw = -1;
    applyHeroScroll();
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', measureRange, { passive: true });
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

/* 11. Subtle Tactile Hover Sounds Across All Content Icons */
function initIconHoverSounds() {
  const groups = [
    '.fan-item',
    '.inline-app-btn',
    '.inline-cluster img',
    '.inline-ico',
    '.inline-avatar',
    '.inline-company-ico',
    '.connect-pill',
    '.btn-resume, .btn-strava',
    '.directory-card--link',
    '#profile-photo-toggle',
  ];

  groups.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el, idx) => {
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        playHover(0.94 + (idx % 6) * 0.055);
      });
    });
  });
}

/* 12. Desktop Left-Center Camera Lens Auto-Focus Scroll Dial + Focus Sound */
function initLensScrollDial() {
  const desktopMq = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 960px)');
  const TICK_COUNT = 8;

  const nav = document.createElement('nav');
  nav.className = 'lens-scroll';
  nav.setAttribute('aria-label', 'Page scroll focus indicator');

  const ticks = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lens-tick-btn';
    const pct = Math.round((i / (TICK_COUNT - 1)) * 100);
    btn.setAttribute('aria-label', `Scroll to ${pct}% of page`);

    const bar = document.createElement('span');
    bar.className = 'lens-tick-bar';
    bar.setAttribute('aria-hidden', 'true');
    btn.appendChild(bar);

    btn.addEventListener('click', () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll <= 0) return;
      const targetY = (i / (TICK_COUNT - 1)) * maxScroll;
      playFocusStep(targetY >= window.scrollY ? 1 : -1, i);
      window.scrollTo({
        top: targetY,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });

    nav.appendChild(btn);
    ticks.push(btn);
  }

  document.body.appendChild(nav);

  let rafId = 0;
  let lastSoundY = window.scrollY || 0;
  let lastScrollY = window.scrollY || 0;
  let lastScrollTime = 0;
  let lockTimer = null;
  let lockFlashTimer = null;
  let hideTimer = null;
  let isHoveringDial = false;
  let movedBarrel = false;
  let isInitialized = false;

  const ROTATION_STEP_PX = 44; // fine mechanical detent spacing while scrolling

  function revealDial() {
    nav.classList.add('is-visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!isHoveringDial) {
        nav.classList.remove('is-visible');
      }
    }, 1050);
  }

  nav.addEventListener('pointerenter', () => {
    isHoveringDial = true;
    clearTimeout(hideTimer);
    nav.classList.add('is-visible');
  });

  nav.addEventListener('pointerleave', () => {
    isHoveringDial = false;
    revealDial();
  });

  function renderTicks(silent = false) {
    rafId = 0;
    if (!desktopMq.matches) {
      nav.classList.remove('is-ready', 'is-visible');
      return;
    }

    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (maxScroll < 80) {
      nav.classList.remove('is-ready', 'is-visible');
      return;
    }

    nav.classList.add('is-ready');

    const y = window.scrollY || 0;
    const progress = Math.min(1, Math.max(0, y / maxScroll));
    // Map scroll progress across the 8 ticks so ~3 adjacent ticks stay brightly "in focus"
    const focusCenter = 1 + progress * (TICK_COUNT - 3);

    for (let i = 0; i < TICK_COUNT; i++) {
      const dist = Math.abs(i - focusCenter);
      const focus = dist <= 1.05 ? 1 - dist * 0.14 : Math.max(0, 1 - (dist - 1.05) * 1.15) * 0.42;
      ticks[i].style.setProperty('--focus', focus.toFixed(3));
    }

    if (!isInitialized) {
      isInitialized = true;
      lastSoundY = y;
      lastScrollY = y;
      lastScrollTime = performance.now();
      return;
    }

    const dy = y - lastScrollY;
    if (!silent && Math.abs(dy) > 0.5) {
      const now = performance.now();
      const dt = Math.max(8, now - lastScrollTime);
      const speed = Math.min(1, Math.abs(dy) / (dt * 2.2));
      const dir = dy >= 0 ? 1 : -1;

      revealDial();
      nav.classList.add('is-scrolling');

      if (Math.abs(y - lastSoundY) >= ROTATION_STEP_PX) {
        lastSoundY = y;
        movedBarrel = true;
        ticks.forEach((t) => t.classList.remove('is-locked'));
        playFocusStep(dir, speed);
      }

      clearTimeout(lockTimer);
      clearTimeout(lockFlashTimer);
      lockTimer = setTimeout(() => {
        nav.classList.remove('is-scrolling');
        if (movedBarrel) {
          movedBarrel = false;
          playFocusLock();
          const activeIdx = Math.min(TICK_COUNT - 1, Math.max(0, Math.round(focusCenter)));
          ticks[activeIdx].classList.add('is-locked');
          lockFlashTimer = setTimeout(() => {
            ticks[activeIdx].classList.remove('is-locked');
          }, 240);
        }
      }, 145);

      lastScrollTime = now;
    }

    lastScrollY = y;
  }

  function scheduleRender(silent = false) {
    if (!rafId) {
      rafId = requestAnimationFrame(() => renderTicks(silent));
    }
  }

  window.addEventListener('scroll', () => scheduleRender(false), { passive: true });
  window.addEventListener('resize', () => scheduleRender(true), { passive: true });
  if (desktopMq.addEventListener) {
    desktopMq.addEventListener('change', () => scheduleRender(true));
  }
  // Re-evaluate once images/fonts settle total scrollHeight
  window.addEventListener('load', () => scheduleRender(true), { once: true });
  renderTicks(true);
}

/* Boot */
setupScrollReveal();
initMarkers();
initCyclingPhotos();
initTrophyCase({ onReveal: observeRevealEl });
initRidePodcasts({ onReveal: observeRevealEl });
initHeroScrollShrink();
initInlineAppPopovers();
initIconHoverSounds();
initLensScrollDial();

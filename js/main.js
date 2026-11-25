import {
  isSoundEnabled,
  setSoundEnabled,
  playClick,
  playHover,
  playPop,
  playSwitch,
  playSuccess
} from './sound.js?v=2';
import { initMarkers, morphMarker, repaintAllMarkers } from './marker.js?v=10';
import { initCyclingPhotos } from './photos.js?v=25';
import { initTrophyCase } from './trophies.js?v=21';

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
    { threshold: 0.06, rootMargin: '0px 0px -36px 0px' }
  );

  document.querySelectorAll('.up:not(.in), .reveal:not(.in)').forEach((el) => {
    observeRevealEl(el);
  });

  /* Ensure bottom-most items (e.g. footer) always reveal if user reaches the end of the page */
  window.addEventListener('scroll', () => {
    const nearBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 28;
    if (!nearBottom) return;
    document.querySelectorAll('.up:not(.in), .reveal:not(.in)').forEach((el) => {
      el.classList.add('in');
      if (revealObserver) revealObserver.unobserve(el);
    });
  }, { passive: true });
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
  const scrollCue = hero && hero.querySelector('.scroll-cue');
  if (!hero || !inner) return;

  if (scrollCue) {
    scrollCue.addEventListener('click', () => {
      playClick();
    });
  }

  function applyHeroScroll() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const range = Math.max(260, hero.offsetHeight * 0.95);
    const raw = Math.min(1, Math.max(0, scrollY / range));
    heroScrollProgress = raw;

    if (scrollCue) {
      scrollCue.classList.toggle('is-hidden', scrollY > 36);
    }

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

/* Boot */
setupScrollReveal();
initMarkers();
initCyclingPhotos();
initTrophyCase({ onReveal: observeRevealEl });
initHeroScrollShrink();
initInlineAppPopovers();
initIconHoverSounds();

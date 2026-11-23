import {
  isSoundEnabled,
  setSoundEnabled,
  playClick,
  playPop,
  playSwitch,
  playSuccess
} from './sound.js';
import { initMarkers, morphMarker, repaintAllMarkers } from './marker.js';
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

/* 3. Top-Left Stacked Photo Profile Toggle (Mobile Eng. <-> On Two Wheels) */
const photoToggle = document.getElementById('profile-photo-toggle');
const faviconEl = document.querySelector('link[rel="icon"]');

function applyProfile(nextProfile, { silent = false, updateHash = true } = {}) {
  const target = nextProfile === 'cycling' ? 'cycling' : 'work';
  const current = root.getAttribute('data-profile');

  const commit = () => {
    root.setAttribute('data-profile', target);
    document.title =
      target === 'cycling'
        ? 'Ar Razy — On Two Wheels'
        : 'Ar Razy Fathan Rabbani — Mobile Engineer (Android & iOS)';

    if (faviconEl) {
      faviconEl.href =
        target === 'cycling'
          ? './assets/icons/favicon-cycling-48.png'
          : './assets/icons/favicon-48.png';
    }

    if (photoToggle) {
      photoToggle.setAttribute('aria-pressed', String(target === 'cycling'));
    }

    try {
      localStorage.setItem('arrazy-profile', target);
    } catch (_) {}

    if (updateHash && window.history && window.history.replaceState) {
      const hash = target === 'cycling' ? '#cycling' : '#work';
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', hash);
      }
    }

    requestAnimationFrame(() => {
      observeVisibleReveals();
      repaintAllMarkers();
    });
  };

  if (current === target && !silent) {
    playClick();
    return;
  }

  if (!silent) {
    playSwitch(target === 'cycling');
  }

  if (
    !silent &&
    document.startViewTransition &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    document.startViewTransition(commit);
  } else {
    commit();
  }
}

if (photoToggle) {
  photoToggle.addEventListener('click', () => {
    const current = root.getAttribute('data-profile');
    applyProfile(current === 'work' ? 'cycling' : 'work');
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
    localStorage.setItem('arrazy-day', next);
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

/* 6. Tappable Highlighted Hero Words (Spring Width Morph + Blur-Slide + Icon Hop) */
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

  btn.addEventListener('click', () => {
    const seq = ++swapSeq;
    clearTimeout(exitTimer);
    clearTimeout(settleTimer);

    idx = (idx + 1) % words.length;
    totalSwaps += 1;
    updateSwapHints();
    playPop(0.95 + idx * 0.08);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      textEl.textContent = words[idx];
      if (iconEl && icons[idx]) iconEl.src = icons[idx];
      morphMarker(btn, 60, { reseed: true });
      return;
    }

    // 1. Capture current live width (even mid-spring for smooth interruption)
    const oldWidth = btn.getBoundingClientRect().width;
    btn.style.width = `${oldWidth}px`;

    // 2. Quick blur-up exit on current content
    btn.classList.remove('is-entering');
    btn.classList.add('is-exiting');

    exitTimer = setTimeout(() => {
      if (seq !== swapSeq) return;

      // 3. Swap word & icon and measure exact target width
      textEl.textContent = words[idx];
      if (iconEl && icons[idx]) {
        iconEl.src = icons[idx];
      }

      const cs = getComputedStyle(btn);
      const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const targetWidth = Math.ceil(innerEl.getBoundingClientRect().width + padH);

      // 4. Prep enter state (blurred & slightly below) with no transition
      btn.classList.remove('is-exiting');
      btn.classList.add('is-entering');
      void btn.offsetWidth; // flush pre-enter styles

      // 5. Release into crisp blur-in + spring width morph + icon hop + live canvas morph
      btn.classList.remove('is-entering');
      btn.style.width = `${targetWidth}px`;

      if (iconEl) {
        iconEl.classList.remove('is-wiggle');
        void iconEl.offsetWidth;
        iconEl.classList.add('is-wiggle');
      }

      morphMarker(btn, 480, { reseed: true });

      settleTimer = setTimeout(() => {
        if (seq !== swapSeq) return;
        btn.style.width = '';
        if (iconEl) iconEl.classList.remove('is-wiggle');
      }, 490);
    }, 85);
  });
});

/* 7. Copy Email Pill */
document.querySelectorAll('[data-copy-email]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const label = btn.querySelector('.copy-label');
    try {
      await navigator.clipboard.writeText(EMAIL);
      playSuccess();
      showToast(`Copied ${EMAIL}`);
      if (label) {
        label.textContent = 'Copied!';
        setTimeout(() => {
          label.textContent = 'Copy email';
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
  if (key === 'w') applyProfile('work');
  else if (key === 'c') applyProfile('cycling');
  else if (key === 'd') toggleDay();
});

/* Boot */
applyProfile(root.getAttribute('data-profile') || 'work', { silent: true, updateHash: false });
setupScrollReveal();
initMarkers();
initCyclingPhotos();

import { playPop, playHover } from './sound.js?v=2';

const TILTS = [-3, 2.2, -2, 2.8, -1.6, 2.4, -1.8, 1.8, -2.6, 2.2];
const KUDOS_ICON_SRC = '/assets/icons/cycling/kudos.svg';
let activeKudosCount = 0;

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function isDesktopPointer() {
  return Boolean(
    window.matchMedia &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      window.innerWidth > 600
  );
}

function spawnKudosBurst(originX, originY) {
  if (activeKudosCount >= 24) return;
  const reduced = prefersReducedMotion();
  const specs = reduced
    ? [{ dx: 0, dy: -22, rot: -6, scale: 1, delay: 0, dur: 420, sm: false }]
    : [
        {
          dx: (Math.random() - 0.5) * 14,
          dy: -68 - Math.random() * 18,
          rot: (Math.random() - 0.5) * 20,
          scale: 1.06,
          delay: 0,
          dur: 820,
          sm: false,
        },
        {
          dx: -24 - Math.random() * 14,
          dy: -50 - Math.random() * 20,
          rot: -14 - Math.random() * 12,
          scale: 0.86,
          delay: 45,
          dur: 760,
          sm: true,
        },
        {
          dx: 24 + Math.random() * 14,
          dy: -52 - Math.random() * 20,
          rot: 14 + Math.random() * 12,
          scale: 0.82,
          delay: 90,
          dur: 780,
          sm: true,
        },
      ];

  const frag = document.createDocumentFragment();

  specs.forEach((s) => {
    const node = document.createElement('span');
    node.className = s.sm ? 'trophy-kudos trophy-kudos--sm' : 'trophy-kudos';
    node.setAttribute('aria-hidden', 'true');
    node.style.left = `${Math.round(originX)}px`;
    node.style.top = `${Math.round(originY)}px`;
    node.style.setProperty('--kx', `${s.dx.toFixed(1)}px`);
    node.style.setProperty('--ky', `${s.dy.toFixed(1)}px`);
    node.style.setProperty('--krot', `${s.rot.toFixed(1)}deg`);
    node.style.setProperty('--kscale', String(s.scale));
    node.style.setProperty('--kdelay', `${s.delay}ms`);
    node.style.setProperty('--kdur', `${s.dur}ms`);

    const img = document.createElement('img');
    img.src = KUDOS_ICON_SRC;
    img.alt = '';
    img.width = s.sm ? 13 : 16;
    img.height = s.sm ? 13 : 16;
    img.decoding = 'async';
    node.appendChild(img);

    activeKudosCount += 1;
    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      activeKudosCount = Math.max(0, activeKudosCount - 1);
      node.remove();
    };
    node.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, s.dur + s.delay + 120);

    frag.appendChild(node);
  });

  document.body.appendChild(frag);
}

function createBadgeImg(item) {
  const img = document.createElement('img');
  img.src = item.image;
  img.alt = '';
  img.width = 120;
  img.height = 120;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.draggable = false;
  img.className = item.shape === 'square' ? 'trophy-img trophy-img--square' : 'trophy-img';
  return img;
}

function createPopoverController() {
  const pop = document.createElement('div');
  pop.className = 'trophy-popover';
  pop.setAttribute('role', 'tooltip');
  document.body.appendChild(pop);

  let activeEl = null;
  let pinnedEl = null;
  let hideTimer = null;

  function position(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popW = pop.offsetWidth;
    const popH = pop.offsetHeight;
    const vw = window.innerWidth;
    const margin = 12;

    const centerX = rect.left + rect.width / 2;
    const clampedX = Math.max(margin, Math.min(vw - popW - margin, centerX - popW / 2));
    const popY = Math.max(margin, rect.top - popH - 10);
    const arrowX = Math.max(12, Math.min(popW - 12, centerX - clampedX));

    pop.style.setProperty('--pop-x', `${Math.round(clampedX)}px`);
    pop.style.setProperty('--pop-y', `${Math.round(popY)}px`);
    pop.style.setProperty('--arrow-x', `${Math.round(arrowX)}px`);
  }

  function show(el, item, { pin = false } = {}) {
    clearTimeout(hideTimer);
    if (activeEl && activeEl !== el) {
      activeEl.classList.remove('is-active');
    }
    activeEl = el;
    if (pin) pinnedEl = el;
    el.classList.add('is-active');

    pop.textContent = '';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = item.label;
    const dateSpan = document.createElement('span');
    dateSpan.className = 'trophy-popover-date';
    dateSpan.textContent = item.date;
    pop.appendChild(titleSpan);
    pop.appendChild(dateSpan);

    position(el);
    requestAnimationFrame(() => {
      if (activeEl === el) {
        position(el);
        pop.classList.add('is-open');
      }
    });
  }

  function hide(immediate = false) {
    clearTimeout(hideTimer);
    const doHide = () => {
      if (activeEl) activeEl.classList.remove('is-active');
      activeEl = null;
      pinnedEl = null;
      pop.classList.remove('is-open');
    };
    if (immediate) doHide();
    else hideTimer = setTimeout(doHide, 110);
  }

  document.addEventListener('click', (e) => {
    if (!activeEl) return;
    if (activeEl.contains(e.target)) return;
    hide(true);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeEl) hide(true);
  });

  window.addEventListener('scroll', () => {
    if (activeEl) position(activeEl);
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (activeEl) position(activeEl);
  }, { passive: true });

  return {
    show,
    hide,
    isPinned: (el) => pinnedEl === el,
  };
}

function renderShelf(container, trophies, popover, onReveal) {
  if (!container) return;
  container.textContent = '';

  trophies.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trophy-shelf-item reveal';
    btn.style.setProperty('--reveal-delay', `${(idx % 5) * 45}ms`);
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', `${item.label}, ${item.date}`);

    const art = document.createElement('span');
    art.className = 'trophy-shelf-art';
    art.style.setProperty('--rot', `${TILTS[idx % TILTS.length]}deg`);
    art.appendChild(createBadgeImg(item));

    const glare = document.createElement('span');
    glare.className = item.shape === 'square' ? 'trophy-glare trophy-glare--square' : 'trophy-glare';
    glare.setAttribute('aria-hidden', 'true');
    if (item.shape !== 'square') {
      glare.style.setProperty('--badge-mask', `url("${item.image}")`);
    }
    art.appendChild(glare);

    const month = document.createElement('span');
    month.className = 'trophy-shelf-month';
    month.textContent = item.date;

    btn.appendChild(art);
    btn.appendChild(month);

    btn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      playHover(0.92 + (idx % 5) * 0.055);
      popover.show(btn, item, { pin: false });
    });

    btn.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || prefersReducedMotion()) return;
      const rect = btn.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      art.style.transform = `translateY(-7px) scale(1.16) rotateX(${(-ny * 12).toFixed(1)}deg) rotateY(${(nx * 14).toFixed(1)}deg)`;
      const gx = (50 - nx * 36).toFixed(1);
      const gy = (45 - ny * 36).toFixed(1);
      glare.style.setProperty('--glare-x', `${gx}%`);
      glare.style.setProperty('--glare-y', `${gy}%`);
      glare.style.setProperty('--glare-tx', `${(-nx * 14).toFixed(1)}px`);
      glare.style.setProperty('--glare-ty', `${(-ny * 10).toFixed(1)}px`);
    });

    btn.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      art.style.transform = '';
      glare.style.removeProperty('--glare-x');
      glare.style.removeProperty('--glare-y');
      glare.style.removeProperty('--glare-tx');
      glare.style.removeProperty('--glare-ty');
      if (!popover.isPinned(btn)) popover.hide(false);
    });

    btn.addEventListener('focus', () => {
      popover.show(btn, item, { pin: false });
    });

    btn.addEventListener('blur', () => {
      if (!popover.isPinned(btn)) popover.hide(false);
    });

    let comboCount = 0;
    let comboTimer = null;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();

      clearTimeout(comboTimer);
      comboCount = Math.min(6, comboCount + 1);
      comboTimer = setTimeout(() => {
        comboCount = 0;
      }, 700);

      playPop(1.0 + comboCount * 0.045);

      const artRect = art.getBoundingClientRect();
      const hasPoint = e.clientX !== 0 || e.clientY !== 0;
      const originX = hasPoint ? e.clientX : artRect.left + artRect.width / 2;
      const originY = hasPoint ? e.clientY - 8 : artRect.top + artRect.height * 0.35;
      spawnKudosBurst(originX, originY);

      if (isDesktopPointer()) {
        popover.show(btn, item, { pin: false });
      } else {
        popover.show(btn, item, { pin: true });
      }
    });

    container.appendChild(btn);
    if (typeof onReveal === 'function') onReveal(btn);
  });
}

function renderRecentPRs(prsEl, achievements) {
  if (!prsEl || !Array.isArray(achievements) || !achievements.length) return;
  prsEl.textContent = '';

  const heading = document.createElement('span');
  heading.className = 'trophy-prs-label';
  heading.textContent = 'RECENT STRAVA PRs';

  const list = document.createElement('div');
  list.className = 'trophy-prs-list';

  achievements.forEach((pr) => {
    const chip = document.createElement('span');
    chip.className = 'trophy-pr-pill';

    const ico = document.createElement('img');
    ico.src = pr.image;
    ico.alt = '';
    ico.width = 16;
    ico.height = 16;

    const text = document.createElement('span');
    text.textContent = pr.label;

    const time = document.createElement('span');
    time.className = 'trophy-pr-time';
    time.textContent = pr.time;

    chip.appendChild(ico);
    chip.appendChild(text);
    chip.appendChild(time);
    list.appendChild(chip);
  });

  prsEl.appendChild(heading);
  prsEl.appendChild(list);
}

export async function initTrophyCase({ onReveal } = {}) {
  const shelfEl = document.getElementById('trophy-shelf-grid');
  const prsEl = document.getElementById('trophy-prs');
  if (!shelfEl) return;

  const preload = new Image();
  preload.decoding = 'async';
  preload.src = KUDOS_ICON_SRC;

  const popover = createPopoverController();

  try {
    const [trophiesRes, achievementsRes] = await Promise.all([
      fetch('/assets/trophies/trophies.json'),
      fetch('/assets/trophies/achievements.json'),
    ]);

    const trophies = trophiesRes.ok ? await trophiesRes.json() : [];
    const achievements = achievementsRes.ok ? await achievementsRes.json() : [];

    if (Array.isArray(trophies) && trophies.length) {
      renderShelf(shelfEl, trophies, popover, onReveal);
    }
    renderRecentPRs(prsEl, achievements);
  } catch (_) {}
}

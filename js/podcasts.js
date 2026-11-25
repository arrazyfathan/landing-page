import { playClick, playHover, playPop } from './sound.js?v=2';

function padRank(n) {
  return String(n).padStart(2, '0');
}

/** Studio Podcast Condenser Mic + Radiating Broadcast Signal Arcs */
function createPodcastMicSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 28 28');
  svg.setAttribute('width', '26');
  svg.setAttribute('height', '26');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('pod-mic-svg');

  const capsule = document.createElementNS(ns, 'rect');
  capsule.setAttribute('x', '7.5');
  capsule.setAttribute('y', '5.5');
  capsule.setAttribute('width', '6.5');
  capsule.setAttribute('height', '10.5');
  capsule.setAttribute('rx', '3.25');
  capsule.setAttribute('fill', 'currentColor');

  const cradle = document.createElementNS(ns, 'path');
  cradle.setAttribute('d', 'M5 13.2a5.75 5.75 0 0 0 11.5 0M10.75 19v3.2M8 22.2h5.5');
  cradle.setAttribute('stroke', 'currentColor');
  cradle.setAttribute('stroke-width', '1.8');
  cradle.setAttribute('stroke-linecap', 'round');

  const wave1 = document.createElementNS(ns, 'path');
  wave1.setAttribute('d', 'M19.2 9.4a5.4 5.4 0 0 1 0 7.6');
  wave1.setAttribute('stroke', 'currentColor');
  wave1.setAttribute('stroke-width', '1.75');
  wave1.setAttribute('stroke-linecap', 'round');
  wave1.classList.add('pod-mic-wave', 'pod-mic-wave--1');

  const wave2 = document.createElementNS(ns, 'path');
  wave2.setAttribute('d', 'M22.2 6.8a9 9 0 0 1 0 12.8');
  wave2.setAttribute('stroke', 'currentColor');
  wave2.setAttribute('stroke-width', '1.6');
  wave2.setAttribute('stroke-linecap', 'round');
  wave2.classList.add('pod-mic-wave', 'pod-mic-wave--2');

  svg.append(capsule, cradle, wave1, wave2);
  return svg;
}

export async function initRidePodcasts({ onReveal } = {}) {
  const section = document.getElementById('ride-podcasts');
  const stage = document.getElementById('podcast-stage');
  if (!section || !stage) return;

  let items = [];
  try {
    const res = await fetch('/assets/podcasts/podcasts.json');
    if (res.ok) items = await res.json();
  } catch (_) {}

  if (!Array.isArray(items) || !items.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'pod-rail-wrap';

  const viewport = document.createElement('div');
  viewport.className = 'pod-rail-viewport';

  const track = document.createElement('div');
  track.className = 'pod-rail';
  track.setAttribute('role', 'list');

  const fadeLeft = document.createElement('span');
  fadeLeft.className = 'pod-rail-fade pod-rail-fade--left';
  fadeLeft.setAttribute('aria-hidden', 'true');

  const fadeRight = document.createElement('span');
  fadeRight.className = 'pod-rail-fade pod-rail-fade--right';
  fadeRight.setAttribute('aria-hidden', 'true');

  const cards = [];

  function setHovered(hoveredIdx) {
    cards.forEach((card, i) => {
      card.classList.toggle('is-hovered', i === hoveredIdx);
      card.style.setProperty('--rail-shift', hoveredIdx >= 0 && i > hoveredIdx ? '48px' : '0px');
    });
  }

  items.forEach((item, idx) => {
    const card = document.createElement('a');
    card.href = item.link;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.className = 'pod-rail-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `#${item.index} ${item.name} by ${item.publisher} — open on Spotify`);

    const artStage = document.createElement('span');
    artStage.className = 'pod-rail-stage';

    // Matte-dark Podcast Broadcast Disc that slides out behind the cover on hover
    const disc = document.createElement('span');
    disc.className = 'pod-rail-disc';
    disc.setAttribute('aria-hidden', 'true');

    const discRings = document.createElement('span');
    discRings.className = 'pod-rail-disc-rings';

    const discBadge = document.createElement('span');
    discBadge.className = 'pod-rail-disc-badge';
    discBadge.appendChild(createPodcastMicSvg());

    disc.append(discRings, discBadge);

    // Front square podcast cover art
    const art = document.createElement('span');
    art.className = 'pod-rail-art';

    const img = document.createElement('img');
    img.src = item.image;
    img.alt = item.name;
    img.width = 140;
    img.height = 140;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;

    const sheen = document.createElement('span');
    sheen.className = 'pod-sleeve-sheen';
    sheen.setAttribute('aria-hidden', 'true');

    const rank = document.createElement('span');
    rank.className = 'pod-rail-rank';
    rank.textContent = `#${padRank(item.index)}`;

    const playBadge = document.createElement('span');
    playBadge.className = 'pod-rail-play';
    playBadge.setAttribute('aria-hidden', 'true');
    const spotifyImg = document.createElement('img');
    spotifyImg.src = '/assets/icons/cycling/spotify.svg';
    spotifyImg.alt = '';
    spotifyImg.width = 18;
    spotifyImg.height = 18;
    spotifyImg.decoding = 'async';
    playBadge.appendChild(spotifyImg);

    art.append(img, sheen, rank, playBadge);
    artStage.append(disc, art);

    const title = document.createElement('strong');
    title.className = 'pod-rail-title';
    title.textContent = item.name;

    const pub = document.createElement('span');
    pub.className = 'pod-rail-pub';
    pub.textContent = item.publisher;

    card.append(artStage, title, pub);

    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      playHover(0.92 + (idx % 6) * 0.055);
      setHovered(idx);
    });

    card.addEventListener('focus', () => setHovered(idx));
    card.addEventListener('click', () => playPop(1.04));

    cards.push(card);
    track.appendChild(card);
  });

  track.addEventListener('pointerleave', () => setHovered(-1));
  track.addEventListener('focusout', (e) => {
    if (!track.contains(e.relatedTarget)) setHovered(-1);
  });

  const controls = document.createElement('div');
  controls.className = 'pod-rail-controls';

  const hint = document.createElement('span');
  hint.className = 'pod-rail-hint';
  hint.textContent = 'Scroll or swipe · Tap to listen on Spotify';

  const navBtns = document.createElement('div');
  navBtns.className = 'pod-rail-nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'pod-rail-btn';
  prevBtn.setAttribute('aria-label', 'Scroll podcasts left');
  prevBtn.textContent = '←';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'pod-rail-btn';
  nextBtn.setAttribute('aria-label', 'Scroll podcasts right');
  nextBtn.textContent = '→';

  function syncRailEdges() {
    const left = track.scrollLeft;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const fadeRamp = 64;
    const leftAlpha = maxScroll > 0 ? Math.min(1, Math.max(0, left / fadeRamp)) : 0;
    const rightAlpha = maxScroll > 0 ? Math.min(1, Math.max(0, (maxScroll - left) / fadeRamp)) : 0;
    viewport.style.setProperty('--fade-left', leftAlpha.toFixed(3));
    viewport.style.setProperty('--fade-right', rightAlpha.toFixed(3));
    prevBtn.disabled = left <= 4;
    nextBtn.disabled = left >= maxScroll - 4;
  }

  prevBtn.addEventListener('click', () => {
    playClick();
    track.scrollBy({ left: -280, behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    playClick();
    track.scrollBy({ left: 280, behavior: 'smooth' });
  });

  track.addEventListener('scroll', syncRailEdges, { passive: true });
  window.addEventListener('resize', syncRailEdges, { passive: true });

  navBtns.append(prevBtn, nextBtn);
  controls.append(hint, navBtns);
  viewport.append(track, fadeLeft, fadeRight);
  wrap.append(viewport, controls);

  stage.textContent = '';
  stage.appendChild(wrap);
  requestAnimationFrame(syncRailEdges);

  if (typeof onReveal === 'function') {
    const head = section.querySelector('.podcast-head');
    if (head) onReveal(head);
    onReveal(stage);
  }
}

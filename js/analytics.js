/**
 * Lightweight Umami Cloud event helper (zero-dependency, ad-blocker safe).
 * Flat event names keep usage minimal on the Umami Cloud free Hobby tier.
 */

const OUTBOUND_RULES = [
  { match: (href) => href.startsWith('mailto:'), event: 'click-email' },
  { match: (href) => href.includes('cv.arrazyfathan.com'), event: 'click-resume' },
  { match: (href) => href.includes('linkedin.com'), event: 'click-linkedin' },
  { match: (href) => href.includes('github.com'), event: 'click-github' },
  { match: (href) => href.includes('x.com/'), event: 'click-x' },
  { match: (href) => href.includes('strava.com'), event: 'click-strava' },
];

export function trackEvent(name, data) {
  try {
    if (typeof window === 'undefined' || !window.umami || typeof window.umami.track !== 'function') {
      return;
    }
    if (data && typeof data === 'object') {
      window.umami.track(name, data);
    } else {
      window.umami.track(name);
    }
  } catch (_) {}
}

export function initAnalytics() {
  document.addEventListener('click', (e) => {
    const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    if (link.hasAttribute('data-track-ignore') || link.classList.contains('pod-rail-card')) return;

    const href = (link.getAttribute('href') || '').trim();
    if (!href) return;

    for (const rule of OUTBOUND_RULES) {
      if (rule.match(href)) {
        trackEvent(rule.event);
        return;
      }
    }
  });
}

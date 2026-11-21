(() => {
  'use strict';
  const root = document.documentElement;
  const configured = root.dataset.apiBase || '';
  const apiBase = configured && !configured.includes('__SHORTCLIPR_') ? configured.replace(/\/$/, '') : '';
  const mediaEndpoint = `${apiBase}/v1/landing-media`;

  function applyAsset(element, asset) {
    if (!asset?.mediaUrl) return;
    if (element instanceof HTMLImageElement) {
      if (asset.mediaKind === 'video') {
        const video = document.createElement('video');
        video.className = element.className;
        video.dataset.mediaSlot = asset.slot;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.src = asset.mediaUrl;
        video.setAttribute('aria-label', element.alt || asset.title || 'ShortClipr video');
        element.replaceWith(video);
      } else {
        element.src = asset.mediaUrl;
      }
    } else if (element instanceof HTMLVideoElement) {
      element.src = asset.mediaUrl;
      element.load();
    }
  }

  async function refresh() {
    const targets = [...document.querySelectorAll('[data-media-slot]')];
    if (!targets.length) return;
    try {
      const response = await fetch(mediaEndpoint, { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const assets = await response.json();
      const bySlot = new Map(assets.map(asset => [asset.slot, asset]));
      targets.forEach(element => applyAsset(element, bySlot.get(element.dataset.mediaSlot)));
    } catch {
      // The built-in page artwork remains visible if the media API is unavailable.
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else void refresh();
})();

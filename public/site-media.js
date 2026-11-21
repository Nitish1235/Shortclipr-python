(() => {
  'use strict';
  const root = document.documentElement;
  const configured = root.dataset.apiBase || '';
  const apiBase = configured && !configured.includes('__SHORTCLIPR_') ? configured.replace(/\/$/, '') : '';
  const mediaEndpoint = apiBase + '/v1/landing-media';

  function applyAsset(element, asset) {
    if (!asset?.mediaUrl) return;
    if (element instanceof HTMLImageElement) {
      if (asset.mediaKind === 'video') {
        const video = document.createElement('video');
        video.className = element.className;
        video.style.cssText = element.style.cssText;
        video.style.display = 'block';
        video.style.width = '100%';
        video.style.height = 'auto';
        video.style.objectFit = 'cover';
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
        element.removeAttribute('srcset');
      }
    } else if (element instanceof HTMLVideoElement) {
      if (asset.mediaKind === 'video') {
        element.src = asset.mediaUrl;
        element.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
        element.load();
      } else {
        const image = document.createElement('img');
        image.className = element.className;
        image.style.cssText = element.style.cssText;
        image.src = asset.mediaUrl;
        image.alt = element.getAttribute('aria-label') || asset.title || 'ShortClipr image';
        element.replaceWith(image);
      }
    } else if (element instanceof HTMLSourceElement) {
      const parent = element.parentElement;
      if (parent instanceof HTMLVideoElement && asset.mediaKind === 'video') {
        parent.src = asset.mediaUrl;
        parent.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
        parent.load();
      } else if (parent instanceof HTMLPictureElement && asset.mediaKind === 'image') {
        element.srcset = asset.mediaUrl;
      }
    } else {
      element.style.backgroundImage = 'url("' + asset.mediaUrl.replace(/["\\\n\r]/g, '') + '")';
    }
  }

  async function refresh() {
    const targets = [...document.querySelectorAll('[data-media-slot],[data-media-srcset-slot],[data-media-poster-slot]')];
    if (!targets.length) return;
    try {
      const response = await fetch(mediaEndpoint, { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const assets = await response.json();
      const bySlot = new Map(assets.map(asset => [asset.slot, asset]));
      targets.forEach(element => {
        const main = element.dataset.mediaSlot;
        const srcset = element.dataset.mediaSrcsetSlot;
        const poster = element.dataset.mediaPosterSlot;
        if (main) applyAsset(element, bySlot.get(main));
        if (srcset) applyAsset(element, bySlot.get(srcset));
        if (poster) {
          const image = bySlot.get(poster);
          if (image?.mediaUrl && element instanceof HTMLVideoElement) element.poster = image.mediaUrl;
        }
      });
    } catch {
      // Built-in artwork remains visible when the media API is unavailable.
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else void refresh();
})();

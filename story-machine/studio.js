(() => {
  const collections = {
    learn: [
      {slot:'collection_learn_1',label:'EXPLAINER',title:'Make the unseen visible',description:'Turn a difficult idea into a clear visual story.',position:'0% 0%',href:'/animated-explainer-video-maker/'},
      {slot:'collection_learn_2',label:'HISTORY',title:'Open a window in time',description:'Give a moment from the past shape and momentum.',position:'50% 0%',href:'/guides/how-to-make-history-shorts/'},
      {slot:'collection_learn_3',label:'GEOGRAPHY',title:'Follow the land',description:'Make a place, map or journey easy to feel.',position:'100% 0%',href:'/clip-types/'}
    ],
    story: [
      {slot:'collection_story_1',label:'MINI STORY',title:'Tell it in a minute',description:'A complete beginning, turn and ending.',position:'0% 50%',href:'/animated-story-video-maker/'},
      {slot:'collection_story_2',label:'MYSTERY',title:'Follow one clue',description:'A small question with a strong pull.',position:'50% 50%',href:'/guides/animated-mystery-story-ideas/'},
      {slot:'collection_story_3',label:'HORROR SHORT',title:'Let the quiet work',description:'Build tension through atmosphere and reveal.',position:'100% 50%',href:'/clip-types/'}
    ],
    engage: [
      {slot:'collection_engage_1',label:'VISUAL QUIZ',title:'Make them look twice',description:'Set a question that invites a second glance.',position:'0% 100%',href:'/video-quiz-maker/'},
      {slot:'collection_engage_2',label:'WHAT-IF',title:'Change one rule',description:'Explore an unlikely idea visually.',position:'50% 100%',href:'/clip-types/'},
      {slot:'collection_engage_3',label:'TRANSFORMATION',title:'Show the shift',description:'Turn a before and after into a story.',position:'100% 100%',href:'/clip-types/'}
    ]
  };
  let landingMedia = [];
  function render(category) {
    const grid = document.querySelector('#collection-grid');
    grid.replaceChildren(...collections[category].map(item => {
      const article = document.createElement('article');
      article.className = 'collection-item';
      const visual = document.createElement('a'); visual.className = 'collection-visual'; visual.href = item.href; visual.setAttribute('aria-label',`Explore ${item.label.toLowerCase()} shorts`);
      visual.style.setProperty('--poster-position',item.position);
      const asset = landingMedia.find(media => media.slot === item.slot && media.mediaKind === 'image');
      if (asset?.mediaUrl) { const image = document.createElement('img'); image.src = asset.mediaUrl; image.alt = asset.title; image.loading = 'lazy'; image.addEventListener('error',() => image.remove(),{once:true}); visual.append(image); }
      const label = document.createElement('small'); label.textContent = item.label;
      const title = document.createElement('h3'); title.textContent = item.title;
      const description = document.createElement('p'); description.textContent = item.description;
      article.append(visual,label,title,description);
      return article;
    }));
  }
  const requestedCategory = new URLSearchParams(location.search).get('collection');
  const initialCategory = Object.hasOwn(collections, requestedCategory) ? requestedCategory : 'learn';
  document.querySelectorAll('[data-category]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.category === initialCategory));
    button.addEventListener('click', () => {
    document.querySelectorAll('[data-category]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    render(button.dataset.category);
    });
  });
  render(initialCategory);
  const track = document.querySelector('#live-reel-track');
  const configuredApiBase = document.documentElement.dataset.apiBase || '';
  const apiBase = configuredApiBase.includes('__SHORTCLIPR_API_URL__') ? '' : configuredApiBase.replace(/\/$/, '');
  const localMediaPreview = !apiBase && ['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  function reelCard(clip) {
    const item = document.createElement('a'); item.className = 'live-reel-card';
    item.href = clip.videoUrl; item.target = '_blank'; item.rel = 'noopener'; item.setAttribute('aria-label', `Play ${clip.title}`);
    const visual = document.createElement('div'); visual.className = 'live-reel-visual';
    const video = document.createElement('video');
    video.src = clip.videoUrl; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'metadata';
    if (clip.posterUrl) video.poster = clip.posterUrl;
    visual.append(video); const play = document.createElement('span'); play.textContent = 'PLAY FILM ↗'; visual.append(play); item.append(visual);
    const caption = document.createElement('div'); const title = document.createElement('b'); title.textContent = clip.title;
    const detail = document.createElement('small'); detail.textContent = `${clip.department.toUpperCase()} / ${clip.aspectRatio}`;
    caption.append(title, detail); item.append(caption);
    item.addEventListener('mouseenter', () => video.play().catch(() => {}));
    item.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
    return item;
  }
  fetch(`${apiBase}/v1/landing-reel`).then(response => response.ok ? response.json() : []).then(clips => {
    if (!Array.isArray(clips) || !clips.length) return;
    document.querySelector('#curated-reel').hidden = false;
    const first = document.createDocumentFragment(), second = document.createDocumentFragment();
    const loopClips = Array.from({length:Math.max(6,clips.length)}, (_,index) => clips[index % clips.length]);
    loopClips.forEach(clip => first.append(reelCard(clip)));
    loopClips.forEach(clip => { const copy = reelCard(clip); copy.setAttribute('aria-hidden', 'true'); copy.tabIndex = -1; second.append(copy); });
    track.append(first, second);
  }).catch(() => {});
  const landingSlots = [...document.querySelectorAll('[data-landing-slot]')];
  const landingBackgrounds = [...document.querySelectorAll('[data-landing-background]')];
  const originalLandingSlots = new Map(landingSlots.map(element => [element.dataset.landingSlot,element.innerHTML]));
  const machineImage = document.querySelector('.reference-machine');
  const machineDefault = machineImage.src;
  function renderLandingBackground(asset, element) {
    element.classList.add('has-admin-background');
    element.style.setProperty('--admin-background-image', asset.mediaKind === 'image' ? `url("${asset.mediaUrl}")` : 'none');
    if (asset.mediaKind !== 'video') return;
    element.querySelector('.landing-background-video')?.remove();
    const video = document.createElement('video');
    video.className = 'landing-background-video'; video.src = asset.mediaUrl;
    video.muted = true; video.autoplay = true; video.loop = true; video.playsInline = true; video.preload = 'metadata';
    element.prepend(video);
  }
  function renderLandingSlot(asset, element) {
    const media = document.createElement(asset.mediaKind === 'video' ? 'video' : 'img');
    media.src = asset.mediaUrl;
    if (asset.mediaKind === 'image') { media.alt = asset.title; media.loading = 'lazy'; }
    else { media.controls = asset.slot === 'screening_feature'; media.muted = asset.slot === 'screening_side'; media.autoplay = asset.slot === 'screening_side'; media.loop = asset.slot === 'screening_side'; media.playsInline = true; media.preload = 'metadata'; media.setAttribute('aria-label',asset.title); }
    const visual = document.createElement('div'); visual.className = 'landing-media-visual'; visual.append(media);
    element.replaceChildren(visual);
    element.classList.add('has-admin-media');
  }
  const thumbnailCards = [...document.querySelectorAll('[data-thumbnail-slot]')];
  thumbnailCards.forEach(card => { card.dataset.originalLabel = card.querySelector('small').textContent.replace('↗','').trim(); });
  function renderThumbnails(media) {
    let replacements = 0;
    thumbnailCards.forEach(card => {
      const asset = media.find(item => item.slot === card.dataset.thumbnailSlot && item.mediaKind === 'image' && item.mediaUrl);
      const poster = card.querySelector('.example-poster');
      const label = card.querySelector('small');
      poster.replaceChildren();
      if (asset) {
        const img = document.createElement('img');
        img.src = asset.mediaUrl; img.alt = asset.title; img.loading = 'lazy';
        img.addEventListener('error', () => img.remove(), {once:true});
        poster.append(img);
        if (!card.closest('[aria-hidden=true]')) replacements++;
      }
      const arrow = document.createElement('span'); arrow.textContent = '↗';
      label.replaceChildren(document.createTextNode((asset?.caption || card.dataset.originalLabel).slice(0,40)), arrow);
    });
    const caption = document.querySelector('#reel-caption');
    caption.textContent = replacements ? (replacements === 6 ? 'Selected visual stories' : 'Selected visuals & illustrative story concepts') : 'Illustrative story concepts';
  }
  function applyLandingMedia(media) {
    if (!Array.isArray(media)) return;
    landingMedia = media;
    render(document.querySelector('[data-category][aria-pressed=true]')?.dataset.category || 'learn');
    renderThumbnails(media);
    const heroArt = media.find(asset => asset.slot === 'landing_hero_machine' && asset.mediaKind === 'image' && asset.mediaUrl);
    machineImage.src = heroArt?.mediaUrl || machineDefault;
    machineImage.alt = heroArt?.title || 'A lime-green illustrated story machine carrying four portrait video concepts on its conveyor belt.';
    landingSlots.forEach(element => {
      element.innerHTML = originalLandingSlots.get(element.dataset.landingSlot);
      element.classList.remove('has-admin-media');
      const asset = media.find(item => item.slot === element.dataset.landingSlot && item.mediaUrl);
      if (asset) renderLandingSlot(asset, element);
    });
    landingBackgrounds.forEach(element => {
      element.classList.remove('has-admin-background');
      element.style.removeProperty('--admin-background-image');
      element.querySelector('.landing-background-video')?.remove();
      const asset = media.find(item => item.slot === element.dataset.landingBackground && item.mediaUrl);
      if (asset) renderLandingBackground(asset, element);
    });
  }
  async function loadLandingMedia() {
    if (localMediaPreview) {
      if (!window.shortcliprLocalMedia) return;
      applyLandingMedia(await window.shortcliprLocalMedia.readLocalMedia());
    } else {
      const response = await fetch(`${apiBase}/v1/landing-media`);
      if (response.ok) applyLandingMedia(await response.json());
    }
  }
  loadLandingMedia().catch(() => {});
  if (localMediaPreview && window.shortcliprLocalMedia) window.shortcliprLocalMedia.subscribeLocalMedia(() => loadLandingMedia().catch(() => {}));
  addEventListener('focus', () => loadLandingMedia().catch(() => {}));
})();

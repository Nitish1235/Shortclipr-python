(() => {
  const collections = {
    learn: [
      {slot:'collection_learn_1',label:'EXPLAINER',title:'Make the unseen visible',description:'Turn a difficult idea into a clear visual story.',fallbackImage:'/clip-types/animated-explainer.jpg',href:'/animated-explainer-video-maker/'},
      {slot:'collection_learn_2',label:'HISTORY',title:'Open a window in time',description:'Give a moment from the past shape and momentum.',fallbackImage:'/clip-types/historical-story.jpg',href:'/guides/how-to-make-history-shorts/'},
      {slot:'collection_learn_3',label:'GEOGRAPHY',title:'Follow the land',description:'Make a place, map or journey easy to feel.',fallbackImage:'/clip-types/maps-geography.jpg',href:'/video-ideas/'}
    ],
    story: [
      {slot:'collection_story_1',label:'MINI STORY',title:'Tell it in a minute',description:'A complete beginning, turn and ending.',fallbackImage:'/clip-types/mini-story-fable.jpg',href:'/animated-story-video-maker/'},
      {slot:'collection_story_2',label:'MYSTERY',title:'Follow one clue',description:'A small question with a strong pull.',fallbackImage:'/clip-types/mystery-suspense.jpg',href:'/guides/animated-mystery-story-ideas/'},
      {slot:'collection_story_3',label:'HORROR SHORT',title:'Let the quiet work',description:'Build tension through atmosphere and reveal.',fallbackImage:'/clip-types/horror-short.jpg',href:'/video-ideas/'}
    ],
    engage: [
      {slot:'collection_engage_1',label:'VISUAL QUIZ',title:'Make them look twice',description:'Set a question that invites a second glance.',fallbackImage:'/clip-types/quiz-visual-puzzle.jpg',href:'/video-quiz-maker/'},
      {slot:'collection_engage_2',label:'WHAT-IF',title:'Change one rule',description:'Explore an unlikely idea visually.',fallbackImage:'/clip-types/what-if-simulation.jpg',href:'/video-ideas/'},
      {slot:'collection_engage_3',label:'TRANSFORMATION',title:'Show the shift',description:'Turn a before and after into a story.',fallbackImage:'/clip-types/architecture-transformation.jpg',href:'/video-ideas/'}
    ]
  };
  let landingMedia = [];
  function render(category) {
    const grid = document.querySelector('#collection-grid');
    grid.replaceChildren(...collections[category].map(item => {
      const article = document.createElement('article');
      article.className = 'collection-item';
      const visual = document.createElement('a'); visual.className = 'collection-visual'; visual.href = item.href; visual.setAttribute('aria-label',`Explore ${item.label.toLowerCase()} shorts`);
      visual.style.backgroundImage = `url("${item.fallbackImage}")`;
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
    const item = document.createElement('article');
    item.className = 'live-reel-card';
    item.dataset.clipId = clip.id;
    const visual = document.createElement('div');
    visual.className = 'live-reel-visual';
    const video = document.createElement('video');
    video.src = clip.videoUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', `Play ${clip.title}`);
    if (clip.posterUrl) video.poster = clip.posterUrl;
    visual.append(video);
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'clip-play-button';
    play.textContent = '▶';
    play.setAttribute('aria-label', `Play ${clip.title}`);
    play.addEventListener('click', async () => {
      if (video.paused) {
        try { await video.play(); } catch { play.textContent = 'Tap video controls to play'; }
      } else {
        video.pause();
      }
    });
    video.addEventListener('play', () => { play.textContent = 'Ⅱ'; play.setAttribute('aria-label', `Pause ${clip.title}`); item.classList.add('is-playing'); });
    video.addEventListener('pause', () => { play.textContent = '▶'; play.setAttribute('aria-label', `Play ${clip.title}`); item.classList.remove('is-playing'); });
    video.addEventListener('ended', () => { video.currentTime = 0; });
    visual.append(play);
    const caption = document.createElement('div');
    caption.className = 'live-reel-caption';
    const title = document.createElement('b');
    title.textContent = clip.title;
    const detail = document.createElement('small');
    const departmentLabels = {learn:'LEARN & EXPLAIN',story:'STORY & SPECTACLE',engage:'ENGAGE & TRANSFORM'};
    detail.textContent = `${departmentLabels[clip.department] || String(clip.department).toUpperCase()} / 9:16 SHORT`;
    caption.append(title, detail);
    item.append(visual, caption);
    return item;
  }
  fetch(`${apiBase}/v1/landing-reel`).then(response => response.ok ? response.json() : []).then(clips => {
    if (!Array.isArray(clips)) return;
    const verticalClips = clips.filter(clip => clip.aspectRatio === '9:16' && clip.videoUrl);
    if (!verticalClips.length) return;
    document.querySelector('#curated-reel').hidden = false;
    track.replaceChildren(...verticalClips.map(reelCard));
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

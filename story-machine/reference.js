(() => {
  const toggle = document.querySelector('.mobile-menu-toggle');
  const navigation = document.querySelector('#mobile-nav');
  function closeMenu() {
    navigation.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
  }
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    navigation.hidden = !open;
  });
  navigation.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!navigation.hidden) { closeMenu(); toggle.focus(); }
    document.querySelectorAll('.resource-menu[open]').forEach(menu => menu.removeAttribute('open'));
  });
  document.addEventListener('click', event => {
    document.querySelectorAll('.resource-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
  });
  const reel = document.querySelector('.reference-reel');
  const group = document.querySelector('.example-group');
  const clone = group.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  group.parentElement.append(clone);
  const motion = document.querySelector('.reel-motion-toggle');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  function pause(paused) {
    reel.classList.toggle('is-paused', paused);
    motion.setAttribute('aria-pressed', String(paused));
    motion.textContent = paused ? 'Reel paused · Play' : 'Pause reel Ⅱ';
  }
  pause(preference.matches);
  motion.addEventListener('click', () => pause(!reel.classList.contains('is-paused')));
  preference.addEventListener('change', event => pause(event.matches));
})();

const motionButton = document.querySelector('.motion-toggle');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

function setMachinePaused(paused) {
  document.querySelector('.machine-wrap').classList.toggle('is-paused', paused);
  document.querySelector('.machine-wrap').classList.toggle('motion-enabled', !paused);
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.innerHTML = paused ? 'Play animation <span aria-hidden="true">▶</span>' : 'Pause animation <span aria-hidden="true">Ⅱ</span>';
}

setMachinePaused(motionPreference.matches);
motionButton.addEventListener('click', () => {
  setMachinePaused(motionButton.getAttribute('aria-pressed') !== 'true');
});
motionPreference.addEventListener('change', (event) => setMachinePaused(event.matches));

// One distance clock drives clips, tread and rollers, so pause/resume stays in sync.
const clips = [...document.querySelectorAll('.machine [id^="frame-"]')];
const rollers = [...document.querySelectorAll('.belt-roller')].map(el => ({el, base: el.getAttribute('transform')}));
const belt = document.querySelector('#belt-tread');
const surface = document.querySelector('#surface-treads');
const seams = Array.from({length: 12}, () => {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  surface.appendChild(line);
  return line;
});
let distance = 0;
let previousTime;
function drawConveyor(now) {
  const delta = previousTime === undefined ? 0 : Math.min((now - previousTime) / 1000, .05);
  previousTime = now;
  if (motionButton.getAttribute('aria-pressed') !== 'true' && !document.hidden) distance += delta * 20;
  clips.forEach((clip, index) => {
    const x = 55 + ((64 + index * 117 + distance) % 468);
    const y = 202 + (x - 119) * .123;
    const opacity = Math.min(1, (x - 55) / 25, (523 - x) / 25);
    clip.setAttribute('transform', `translate(${x} ${y}) translate(45 185) scale(1.13) translate(-45 -185) rotate(${index * 2 - 3} 45 88)`);
    clip.style.opacity = Math.max(0, opacity);
  });
  belt.style.strokeDashoffset = -(distance / .96) % 25;
  seams.forEach((seam, index) => {
    const x = 48 + ((index * 42 + distance / .96) % 504);
    const y = 53 + (x - 42) * .115;
    seam.setAttribute('d', `M${x} ${y} l57 -17`);
  });
  rollers.forEach(({el, base}) => el.setAttribute('transform', `${base} rotate(${distance * 180 / (Math.PI * 12)})`));
  requestAnimationFrame(drawConveyor);
}
requestAnimationFrame(drawConveyor);

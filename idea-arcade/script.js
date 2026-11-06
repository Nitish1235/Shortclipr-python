const labels = { pixel: 'PIXEL ART', paper: 'PAPER CUTOUT', comic: 'COMIC', flat: 'FLAT VECTOR' };
document.querySelectorAll('[data-style]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-style]').forEach((item) => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    document.querySelector('.style-demo').dataset.current = button.dataset.style;
    document.querySelector('#style-name').textContent = labels[button.dataset.style];
  });
});

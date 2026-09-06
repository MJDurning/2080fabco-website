const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');

function setMenu(open) {
  if (!nav || !menuButton) return;
  nav.classList.toggle('open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}

menuButton?.addEventListener('click', () => {
  setMenu(!nav.classList.contains('open'));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && nav?.classList.contains('open')) {
    setMenu(false);
    menuButton?.focus();
  }
});

document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => setMenu(false));
});

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

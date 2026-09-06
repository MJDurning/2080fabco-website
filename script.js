// 2080 Fabrications Co. - Build 02
const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#primary-nav');
const header = document.querySelector('#site-header');

function setMenu(open) {
  if (!nav || !menuButton) return;
  nav.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  const text = menuButton.querySelector('.menu-toggle__text');
  if (text) text.textContent = open ? 'Close' : 'Menu';
}

menuButton?.addEventListener('click', () => setMenu(!nav.classList.contains('open')));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && nav?.classList.contains('open')) {
    setMenu(false);
    menuButton?.focus();
  }
});

document.addEventListener('click', (event) => {
  if (nav?.classList.contains('open') && !nav.contains(event.target) && !menuButton.contains(event.target)) {
    setMenu(false);
  }
});

nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));

// Solid header once the page scrolls
const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 24);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// One restrained reveal per element, skipped entirely under prefers-reduced-motion
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealTargets = document.querySelectorAll('.ledger-row, .work-card, .step, .shop-grid > *, .about-grid > *, .contact-grid > *');
if (!reduceMotion && 'IntersectionObserver' in window) {
  revealTargets.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  revealTargets.forEach(el => io.observe(el));
}

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Copy the project email address (Clipboard API with a selection fallback)
document.querySelectorAll('.copy-email').forEach((btn) => {
  const status = btn.closest('.contact-copy')?.querySelector('.copy-status');
  const email = btn.dataset.email || '2080fabco@gmail.com';
  const say = (msg) => { if (status) { status.textContent = msg; setTimeout(() => { if (status.textContent === msg) status.textContent = ''; }, 6000); } };
  btn.addEventListener('click', async () => {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext !== false) { await navigator.clipboard.writeText(email); copied = true; }
    } catch (e) { copied = false; }
    if (!copied) {
      try {
        const area = document.createElement('textarea'); area.value = email; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.left = '-9999px';
        document.body.appendChild(area); area.select(); copied = document.execCommand && document.execCommand('copy'); document.body.removeChild(area);
      } catch (e) { copied = false; }
    }
    say(copied ? 'Email copied: ' + email : 'Copy blocked by your browser. The address is ' + email);
  });
});

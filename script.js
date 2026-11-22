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

const reviewsSection = document.querySelector('#project-reviews');

if (reviewsSection) {
  const apiOrigin = window.location.hostname === '127.0.0.1'
    ? window.location.origin
    : reviewsSection.dataset.reviewsOrigin;
  const reviewsUrl = new URL('/api/reviews', apiOrigin);
  const reviewList = reviewsSection.querySelector('.review-list');
  const invitation = reviewsSection.querySelector('.reviews-empty');
  const reviewForm = reviewsSection.querySelector('.review-form');
  const photoInput = reviewForm.querySelector('#review-photo');
  const status = reviewForm.querySelector('.review-status');
  const submitButton = reviewForm.querySelector('button[type="submit"]');
  const requiredFields = [...reviewForm.querySelectorAll('[required]')];
  let lastSubmission;

  requiredFields.forEach(field => {
    field.addEventListener('input', () => field.setCustomValidity(''));
  });

  async function loadReviews() {
    try {
      const response = await fetch(reviewsUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Review list could not be loaded');
      const { reviews } = await response.json();
      const cards = reviews.map(review => {
        const card = document.createElement('li');
        card.className = 'review-card';
        const project = document.createElement('h3');
        project.textContent = review.project;
        const feedback = document.createElement('blockquote');
        feedback.textContent = review.feedback;
        const name = document.createElement('p');
        name.className = 'review-name';
        name.textContent = review.name;
        card.append(project, feedback, name);
        if (review.photo) {
          const photo = document.createElement('img');
          photo.src = new URL(review.photo, reviewsUrl).href;
          photo.alt = 'Photo submitted with this review';
          photo.loading = 'lazy';
          card.append(photo);
        }
        return card;
      });
      reviewList.replaceChildren(...cards);
      reviewList.hidden = cards.length === 0;
      invitation.hidden = cards.length > 0;
    } catch {
      // Leave the invitation and form available if the public list is temporarily offline.
    }
  }

  reviewForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitButton.disabled) return;
    const emptyField = requiredFields.find(field => !field.value.trim());
    if (emptyField) {
      emptyField.setCustomValidity('Please fill in this field.');
      emptyField.reportValidity();
      return;
    }

    const fields = new FormData(reviewForm);
    const review = {
      name: fields.get('displayName').trim(),
      project: fields.get('project').trim(),
      feedback: fields.get('feedback').trim(),
      permission: fields.get('permission') === 'yes',
    };
    const photo = photoInput.files[0];
    if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 8_000_000)) {
      status.textContent = 'Choose a JPEG, PNG, or WebP photo under 8 MB.';
      return;
    }
    const content = JSON.stringify(review);
    if (lastSubmission?.content !== content || lastSubmission?.photo !== photo) {
      lastSubmission = { content, photo, id: crypto.randomUUID() };
    }
    const submission = JSON.stringify({ id: lastSubmission.id, ...review });
    let body = submission;
    const headers = {};
    if (photo) {
      body = new FormData();
      body.set('review', submission);
      body.set('photo', photo);
    } else {
      headers['Content-Type'] = 'application/json';
    }
    submitButton.disabled = true;
    const editableFields = [...reviewForm.querySelectorAll('input, textarea')];
    editableFields.forEach(field => { field.disabled = true; });
    status.textContent = 'Saving your review…';

    try {
      const response = await fetch(reviewsUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 429) {
        status.textContent = 'Please wait a minute, then try again.';
        return;
      }
      if (photo && [400, 413, 415, 422].includes(response.status)) {
        status.textContent = 'That photo could not be accepted. Try another photo or submit your review without it.';
        return;
      }
      if (response.status !== 201 || (await response.json()).saved !== true) {
        throw new Error('Review was not saved');
      }
      reviewForm.reset();
      lastSubmission = undefined;
      status.textContent = review.permission
        ? 'Thanks. Your review was saved and is awaiting approval.'
        : 'Thanks. Your feedback was saved privately.';
    } catch {
      status.textContent = 'We couldn’t confirm your review was saved. Please try again.';
    } finally {
      submitButton.disabled = false;
      editableFields.forEach(field => { field.disabled = false; });
    }
  });

  reviewForm.hidden = false;
  loadReviews();
  window.addEventListener('pageshow', event => {
    if (event.persisted) loadReviews();
  });
}

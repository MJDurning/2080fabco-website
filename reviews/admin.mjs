const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[char]);

const date = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'America/New_York',
});

function page(body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Project Reviews | 2080 Fab Co.</title>
  <style>
    :root {
      color-scheme: dark;
      font: 16px/1.5 Inter, system-ui, sans-serif;
      color: #eef2f5;
      background: #0a0d11;
    }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(100% - 36px, 54rem); margin: clamp(32px, 7vw, 80px) auto; }
    h1 { margin: 0 0 12px; font-size: clamp(2rem, 6vw, 3rem); line-height: 1.1; letter-spacing: -.025em; }
    h2 { margin: 0; font-size: 1.2rem; line-height: 1.25; }
    p { margin: 0; }
    header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    .intro, .received { color: #bdc7d1; }
    .brand { color: #dfb351; font-weight: 700; margin-bottom: 10px; }
    .panel { margin: 24px 0 0; background: #161d26; border: 1px solid #394451; border-left: 3px solid #c89830; border-radius: 8px; padding: 20px; }
    .login { max-width: 28rem; }
    .login form { display: grid; gap: 10px; justify-items: start; }
    label { font-weight: 650; }
    input {
      width: 100%;
      min-height: 44px;
      padding: 8px 12px;
      border: 1px solid #657180;
      border-radius: 6px;
      background: #0a0d11;
      color: inherit;
      font: inherit;
    }
    button, a { color: inherit; font: inherit; }
    button {
      min-height: 44px;
      padding: 8px 14px;
      border: 1px solid #c89830;
      border-radius: 6px;
      background: #c89830;
      color: #0a0d11;
      font-weight: 700;
      cursor: pointer;
    }
    button:hover { background: #dfb351; }
    button.secondary { color: #eef2f5; background: transparent; }
    button.secondary:hover { background: #322a19; }
    :focus-visible { outline: 2px solid #78b7dc; outline-offset: 3px; }
    .error { color: #ffc4aa; }
    .status { color: #dfb351; font-size: .9rem; font-weight: 700; margin-bottom: 8px; }
    .received { margin-top: 5px; font-size: .9rem; }
    blockquote { margin: 14px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .review-photo { display: block; max-width: 100%; max-height: 320px; border-radius: 6px; }
    .review { overflow-wrap: anywhere; }
    .review form { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  </style>
</head>
<body>
  <main>
    <p class="brand">2080 Fab Co.</p>
    ${body}
  </main>
</body>
</html>`;
}

export function signInPage(error = '', saved = false) {
  return page(`<h1>Project Reviews</h1>
    <p class="intro">Sign in to review and publish customer feedback.</p>
    ${saved ? '<p role="status">Passcode saved. Sign in with your new passcode.</p>' : ''}
    <div class="panel login">
      <form method="post" action="/admin/sign-in">
        <label for="passcode">Admin passcode</label>
        <input id="passcode" name="passcode" type="password" autocomplete="current-password" maxlength="128" required>
        ${error ? '<p class="error" role="alert">' + escapeHtml(error) + '</p>' : ''}
        <button type="submit">Sign In</button>
      </form>
    </div>`);
}

export function passcodePage(error = '') {
  return page(`<h1>Change Preview Passcode</h1>
    <p class="intro">Choose your own passcode.</p>
    <div class="panel login">
      <form method="post" action="/admin/passcode">
        <label for="new-passcode">New passcode</label>
        <input id="new-passcode" name="newPasscode" type="password" autocomplete="new-password" maxlength="128" required>
        <label for="confirm-passcode">Confirm passcode</label>
        <input id="confirm-passcode" name="confirmPasscode" type="password" autocomplete="new-password" maxlength="128" required>
        ${error ? '<p class="error" role="alert">' + escapeHtml(error) + '</p>' : ''}
        <button type="submit">Save Passcode</button>
        <a href="/admin/">Back to Project Reviews</a>
      </form>
    </div>`);
}

function reviewCard(review) {
  const approved = review.status === 'approved';
  const state = { pending: 'Pending', approved: 'Published', unpublished: 'Unpublished' }[review.status];
  const action = approved ? 'unpublish' : 'approve';
  const label = approved ? 'Unpublish' : review.has_photo ? 'Publish Without Photo' : 'Approve and Publish';
  const photoPath = '/admin/photos/' + escapeHtml(review.id);
  const photo = review.has_photo
    ? `<figure>
        <a href="${photoPath}"><img class="review-photo" src="${photoPath}" loading="lazy" alt="Photo submitted with this review"></a>
        <figcaption>${review.photo_published ? 'Photo published' : 'Private photo'}</figcaption>
      </figure>`
    : '';
  const photoButton = review.has_photo && !approved
    ? '<button type="submit" name="action" value="approve-photo">Publish With Photo</button>'
    : '';
  const control = review.permission
    ? `<form method="post" action="/admin/reviews/${escapeHtml(review.id)}">
        ${photoButton}
        <button type="submit" name="action" value="${action}"${approved || photoButton ? ' class="secondary"' : ''}>${label}</button>
      </form>`
    : '';
  return `<article class="panel review">
    <p class="status">${state} · ${review.permission ? 'Display permitted' : 'Private feedback'}</p>
    <h2>${escapeHtml(review.project)}</h2>
    <p class="received">${escapeHtml(review.name)} · ${date.format(review.received_at)}</p>
    <blockquote>${escapeHtml(review.feedback)}</blockquote>
    ${photo}
    ${control}
  </article>`;
}

export function adminPage(reviews, error = '', localPasscode = false) {
  if (error) {
    return page(`<h1>Project Reviews</h1><p class="error" role="alert">${escapeHtml(error)}</p>
      <p><a href="/admin/">Back to Project Reviews</a></p>`);
  }
  return page(`<header>
      <div>
        <h1>Project Reviews</h1>
        <p class="intro">Before publishing, check the review for private details such as email addresses or phone numbers.</p>
      </div>
      <form method="post" action="/admin/sign-out"><button class="secondary" type="submit">Sign Out</button></form>
    </header>
    ${localPasscode ? '<p><a href="/admin/passcode">Change Preview Passcode</a></p>' : ''}
    ${reviews.length ? reviews.map(reviewCard).join('') : '<p class="panel">No reviews have been submitted yet.</p>'}`);
}

import { timingSafeEqual } from 'node:crypto';
import { adminPage, passcodePage, signInPage } from './admin.mjs';
import { photoType, resizePhoto, uploadMaxBytes } from './photos.mjs';

const SESSION_SECONDS = 8 * 60 * 60;
const SESSION_COOKIE = 'reviews_admin';
const reviewId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(value, status = 200, extra = {}) {
  return Response.json(value, { status, headers: { ...headers, ...extra } });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function redirect(location, cookie) {
  const responseHeaders = { ...headers, Location: location };
  if (cookie) responseHeaders['Set-Cookie'] = cookie;
  return new Response(null, { status: 303, headers: responseHeaders });
}

function cookie(value, url, env) {
  const localPreview = url.origin === env.PREVIEW_ORIGIN && url.hostname === '127.0.0.1';
  return SESSION_COOKIE + '=' + value + '; Path=/admin; HttpOnly; SameSite=Strict; Max-Age='
    + (value ? SESSION_SECONDS : 0) + (localPreview ? '' : '; Secure');
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function bodyBytes(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) return null;
      chunks.push(value);
    }
    const payload = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      payload.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return payload;
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function bodyText(request, maxBytes) {
  const bytes = await bodyBytes(request, maxBytes);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function textField(value, limit) {
  if (typeof value !== 'string' || value.length > limit) return null;
  const trimmed = value.trim();
  return trimmed && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed) ? trimmed : null;
}

function contentType(request) {
  return request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const origins = (env.PUBLIC_ORIGINS || '').split(',').map(value => value.trim());
  return origin && origins.includes(origin) ? origin : null;
}

async function readSubmission(request, type) {
  if (type === 'application/json') {
    return { review: JSON.parse(await bodyText(request, 8192)), photo: null };
  }
  const bytes = await bodyBytes(request, uploadMaxBytes + 12_000);
  if (!bytes) return null;
  const form = await new Response(bytes, {
    headers: { 'Content-Type': request.headers.get('Content-Type') },
  }).formData();
  return { review: JSON.parse(form.get('review')), photo: form.get('photo') };
}

async function servePhoto(request, env, id, isPrivate) {
  const notFound = () => new Response('Not found', { status: 404, headers });
  if (!reviewId.test(id)) return notFound();
  if (isPrivate && !(await sessionHash(request, env))) return notFound();
  const query = isPrivate
    ? 'SELECT photo FROM project_reviews WHERE id = ? AND photo IS NOT NULL'
    : "SELECT photo FROM project_reviews WHERE id = ? AND status = 'approved' AND permission = 1 AND photo_published = 1";
  const row = await env.REVIEWS_DB.prepare(query).bind(id).first();
  if (!row?.photo) return notFound();
  const payload = Array.isArray(row.photo) ? Uint8Array.from(row.photo) : row.photo;
  return new Response(request.method === 'HEAD' ? null : payload, {
    headers: {
      ...headers,
      'Content-Type': 'image/webp',
      'Cross-Origin-Resource-Policy': isPrivate ? 'same-origin' : 'cross-origin',
    },
  });
}

async function publicReviews(request, env) {
  const origin = allowedOrigin(request, env);
  const cors = { Vary: 'Origin' };
  if (origin) cors['Access-Control-Allow-Origin'] = origin;
  if (request.method === 'OPTIONS') {
    if (!origin) return json({ error: 'Origin forbidden' }, 403, cors);
    return new Response(null, {
      status: 204,
      headers: {
        ...headers, ...cors,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method === 'GET') {
    const { results } = await env.REVIEWS_DB.prepare(
      "SELECT name, project, feedback, CASE WHEN photo_published = 1 THEN id ELSE NULL END AS photo_id FROM project_reviews WHERE status = 'approved' AND permission = 1 ORDER BY published_at DESC, id",
    ).all();
    const reviews = results.map(({ photo_id, ...review }) =>
      photo_id ? { ...review, photo: '/api/reviews/' + photo_id + '/photo' } : review);
    return json({ reviews }, 200, cors);
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (!origin) return json({ error: 'Origin forbidden' }, 403, cors);
  const type = contentType(request);
  if (type !== 'application/json' && type !== 'multipart/form-data') {
    return json({ error: 'Unsupported review format' }, 415, cors);
  }
  const { success } = await env.SUBMISSION_LIMITER.limit({
    key: request.headers.get('CF-Connecting-IP') || 'local',
  });
  if (!success) return json({ error: 'Too many submissions' }, 429, cors);

  let submission;
  try {
    submission = await readSubmission(request, type);
  } catch {
    return json({ error: 'Review could not be read' }, 400, cors);
  }
  if (!submission) return json({ error: 'Photo is too large' }, 413, cors);
  const { review, photo } = submission;
  const name = textField(review?.name, 60);
  const project = textField(review?.project, 120);
  const feedback = textField(review?.feedback, 600);
  if (!name || !project || !feedback || typeof review.permission !== 'boolean'
      || typeof review.id !== 'string' || !reviewId.test(review.id)) {
    return json({ error: 'Please complete all review fields' }, 400, cors);
  }

  const permission = Number(review.permission);
  const db = env.REVIEWS_DB;
  let photoSha = null;
  if (photo !== null) {
    if (!(photo instanceof File) || !photo.size || photo.size > uploadMaxBytes) {
      return json({ error: 'Invalid photo size' }, 413, cors);
    }
    const bytes = await photo.arrayBuffer();
    if (!photoType(new Uint8Array(bytes))) return json({ error: 'Unsupported photo type' }, 422, cors);
    photoSha = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  }

  const checkExisting = async () => {
    const row = await db.prepare(
      'SELECT name, project, feedback, permission, photo_sha256 FROM project_reviews WHERE id = ?',
    ).bind(review.id).first();
    if (!row) return null;
    return row.name === name && row.project === project && row.feedback === feedback
      && row.permission === permission && row.photo_sha256 === photoSha
      ? json({ saved: true }, 201, cors)
      : json({ error: 'Submission already exists' }, 409, cors);
  };
  const existing = await checkExisting();
  if (existing) return existing;
  const resized = photo ? await resizePhoto(photo, env.REVIEW_IMAGES) : null;
  if (photo && !resized) return json({ error: 'Photo could not be resized' }, 422, cors);
  const result = await db.prepare(
    'INSERT INTO project_reviews (id, name, project, feedback, permission, received_at, photo, photo_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
  ).bind(review.id, name, project, feedback, permission, Date.now(), resized?.buffer ?? null, photoSha).run();
  return result.meta.changes
    ? json({ saved: true }, 201, cors)
    : (await checkExisting()) || json({ error: 'Submission already exists' }, 409, cors);
}

async function sessionTokenHash(token, env) {
  return hex(await digest(env.ADMIN_PASSWORD_SHA256 + ':' + token));
}

async function sessionHash(request, env) {
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)reviews_admin=([0-9a-f]{64})(?:;|$)/)?.[1];
  if (!token || !/^[0-9a-f]{64}$/.test(env.ADMIN_PASSWORD_SHA256 || '')) return null;
  const hash = await sessionTokenHash(token, env);
  const active = await env.REVIEWS_DB.prepare(
    'SELECT 1 FROM review_admin_sessions WHERE token_hash = ? AND expires_at > ?',
  ).bind(hash, Date.now()).first();
  return active ? hash : null;
}

async function signIn(request, url, env) {
  const hash = env.ADMIN_PASSWORD_SHA256;
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    return html(signInPage('Admin sign-in is unavailable.'), 503);
  }
  const { success } = await env.LOGIN_LIMITER.limit({
    key: request.headers.get('CF-Connecting-IP') || 'local',
  });
  if (!success) return html(signInPage('Too many attempts. Try again in a minute.'), 429);
  const body = await bodyText(request, 2048);
  if (body === null) return html(signInPage('That passcode didn’t match.'), 401);
  const password = new URLSearchParams(body).get('passcode') || '';
  const expected = Uint8Array.from(hash.match(/.{2}/g), byte => Number.parseInt(byte, 16));
  if (!timingSafeEqual(await digest(password), expected)) {
    return html(signInPage('That passcode didn’t match.'), 401);
  }

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const db = env.REVIEWS_DB;
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM review_admin_sessions WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO review_admin_sessions (token_hash, expires_at) VALUES (?, ?)')
      .bind(await sessionTokenHash(token, env), now + SESSION_SECONDS * 1000),
  ]);
  return redirect('/admin/', cookie(token, url, env));
}

async function admin(request, url, env) {
  const path = url.pathname;
  if (request.method === 'GET' && path === '/admin') return redirect('/admin/');
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin || contentType(request) !== 'application/x-www-form-urlencoded') {
      return html(signInPage('Request could not be verified.'), 403);
    }
    if (path === '/admin/sign-in') return signIn(request, url, env);
  }

  const session = await sessionHash(request, env);
  if (!session && request.method === 'GET' && path === '/admin/passcode') return redirect('/admin/');
  if (!session) return html(signInPage('', url.searchParams.get('passcode') === 'saved'), request.method === 'GET' && path === '/admin/' ? 200 : 401);
  const db = env.REVIEWS_DB;
  const localPasscode = Boolean(env.PREVIEW_PASSCODE_STORE && url.origin === env.PREVIEW_ORIGIN);
  if (localPasscode && path === '/admin/passcode') {
    if (request.method === 'GET') return html(passcodePage());
    if (request.method === 'POST') {
      const body = await bodyText(request, 8192);
      const fields = new URLSearchParams(body || '');
      const passcode = fields.get('newPasscode') || '';
      if (passcode.length === 0 || passcode.length > 128) {
        return html(passcodePage('Enter a passcode up to 128 characters.'), 400);
      }
      if (passcode !== fields.get('confirmPasscode')) {
        return html(passcodePage('The two entries do not match.'), 400);
      }
      const next = hex(await digest(passcode));
      if (next === env.ADMIN_PASSWORD_SHA256) return html(passcodePage('Choose a different passcode.'), 400);
      const saved = await env.PREVIEW_PASSCODE_STORE.fetch('http://preview-passcode/rotate', {
        method: 'POST',
        body: JSON.stringify({ current: env.ADMIN_PASSWORD_SHA256, next }),
      });
      if (!saved.ok) return html(passcodePage('The passcode could not be saved. Sign in again and retry.'), 409);
      await db.prepare('DELETE FROM review_admin_sessions WHERE token_hash = ?').bind(session).run();
      return redirect('/admin/?passcode=saved', cookie('', url, env));
    }
  }
  if (request.method === 'GET' && path === '/admin/') {
    const { results } = await db.prepare(
      "SELECT id, name, project, feedback, permission, status, received_at, photo IS NOT NULL AS has_photo, photo_published FROM project_reviews ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, received_at DESC, id",
    ).all();
    return html(adminPage(results, '', localPasscode));
  }
  if (request.method === 'POST' && path === '/admin/sign-out') {
    await db.prepare('DELETE FROM review_admin_sessions WHERE token_hash = ?').bind(session).run();
    return redirect('/admin/', cookie('', url, env));
  }
  const match = path.match(/^\/admin\/reviews\/([^/]+)$/);
  if (request.method === 'POST' && match && reviewId.test(match[1])) {
    const body = await bodyText(request, 128);
    const action = body === null ? null : new URLSearchParams(body).get('action');
    if (action !== 'approve' && action !== 'approve-photo' && action !== 'unpublish') {
      return html(adminPage([], 'Invalid review action.'), 400);
    }
    const withPhoto = Number(action === 'approve-photo');
    const update = action === 'unpublish'
      ? db.prepare("UPDATE project_reviews SET status = 'unpublished', published_at = NULL, photo_published = 0 WHERE id = ? AND status = 'approved'").bind(match[1])
      : db.prepare("UPDATE project_reviews SET status = 'approved', published_at = ?, photo_published = ? WHERE id = ? AND permission = 1 AND status IN ('pending', 'unpublished') AND (? = 0 OR photo IS NOT NULL)").bind(Date.now(), withPhoto, match[1], withPhoto);
    if (!(await update.run()).meta.changes) {
      return html(adminPage([], 'The review changed or has no permission to publish. Return to the review list.'), 409);
    }
    return redirect('/admin/');
  }
  return new Response('Not found', { status: 404, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/reviews') return await publicReviews(request, env);
      if (request.method === 'GET' || request.method === 'HEAD') {
        const publicPhoto = url.pathname.match(/^\/api\/reviews\/([^/]+)\/photo$/);
        if (publicPhoto) return await servePhoto(request, env, publicPhoto[1], false);
        const privatePhoto = url.pathname.match(/^\/admin\/photos\/([^/]+)$/);
        if (privatePhoto) return await servePhoto(request, env, privatePhoto[1], true);
      }
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        return await admin(request, url, env);
      }
      if (env.PREVIEW_ASSETS) return await env.PREVIEW_ASSETS.fetch(request);
      return new Response('Not found', { status: 404, headers });
    } catch {
      if (url.pathname === '/api/reviews') {
        const origin = allowedOrigin(request, env);
        const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
        return json({ error: 'Reviews are temporarily unavailable' }, 503, cors);
      }
      return html(adminPage([], 'Project Reviews is temporarily unavailable.'), 503);
    }
  },
};

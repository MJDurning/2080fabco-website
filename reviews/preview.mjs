import { createHash, randomBytes } from 'node:crypto';
import { unwatchFile, watchFile } from 'node:fs';
import { cp, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const reviewsDir = dirname(fileURLToPath(import.meta.url));
const websiteDir = dirname(reviewsDir);
const runtimeDir = join(dirname(websiteDir), 'reviews-preview-runtime');
const assetsDir = join(runtimeDir, 'public');
const port = Number(process.argv[3] || 8095);
const origin = 'http://127.0.0.1:' + port;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');

const { Miniflare, convertV4MiniflareOptions } = process.argv[2]
  ? await import(pathToFileURL(resolve(process.argv[2])).href)
  : await import('miniflare');

await mkdir(assetsDir, { recursive: true });
for (const path of ['404.html', 'styles.css', 'script.js', 'site.webmanifest', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'icons', 'assets']) {
  await cp(join(websiteDir, path), join(assetsDir, path), { recursive: true });
}
const homepage = await readFile(join(websiteDir, 'index.html'), 'utf8');
const previewHomepage = homepage.replace(/(<a class="footer-admin-link" href=")[^"]*"/, '$1/admin/"');
await writeFile(join(assetsDir, 'index.html'), previewHomepage);

const verifierPath = join(runtimeDir, 'preview-admin-passcode.sha256');
const passcodePath = join(runtimeDir, 'preview-admin-passcode.txt');
const temporaryPasscodePath = join(runtimeDir, 'preview-temporary-passcode.txt');
async function readVerifier() {
  const verifier = (await readFile(verifierPath, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(verifier)) throw new Error('Invalid private preview passcode verifier');
  return verifier;
}

async function initialVerifier() {
  try {
    return await readVerifier();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await writeFile(passcodePath, randomBytes(24).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const passcode = (await readFile(passcodePath, 'utf8')).trim();
  if (!/^[a-f0-9]{48}$/.test(passcode)) throw new Error('Invalid generated preview passcode');
  return createHash('sha256').update(passcode).digest('hex');
}

let credentialWrite = Promise.resolve();
function storePreviewPasscode(request) {
  const result = credentialWrite.then(async () => {
    const { current, next } = await request.json();
    if (!/^[a-f0-9]{64}$/.test(next) || current !== await initialVerifier()) {
      return new Response(null, { status: 409 });
    }
    const staged = join(runtimeDir, 'passcode-' + randomBytes(12).toString('hex') + '.tmp');
    try {
      await writeFile(staged, next + '\n', { flag: 'wx', mode: 0o600 });
      await rename(staged, verifierPath);
    } finally {
      await unlink(staged).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    return new Response(null, { status: 204 });
  }).catch(() => new Response(null, { status: 503 }));
  credentialWrite = result.then(() => {});
  return result;
}

const config = JSON.parse(await readFile(join(reviewsDir, 'wrangler.jsonc'), 'utf8'));
const options = {
  host: '127.0.0.1',
  port,
  modules: ['worker.mjs', 'admin.mjs', 'photos.mjs'].map(name => ({ type: 'ESModule', path: join(reviewsDir, name) })),
  modulesRoot: reviewsDir,
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  assets: {
    directory: assetsDir,
    binding: 'PREVIEW_ASSETS',
    run_worker_first: true,
    routerConfig: { has_user_worker: true },
  },
  bindings: {
    PUBLIC_ORIGINS: origin,
    PREVIEW_ORIGIN: origin,
    ADMIN_PASSWORD_SHA256: await initialVerifier(),
  },
  images: config.images,
  serviceBindings: { PREVIEW_PASSCODE_STORE: storePreviewPasscode },
  d1Databases: { REVIEWS_DB: 'local-project-reviews' },
  resourcePersistencePath: join(runtimeDir, 'database'),
  ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...rule }) => [name, rule])),
  liveReload: false,
};
const miniflare = new Miniflare(convertV4MiniflareOptions(options));

try {
  const database = await miniflare.getD1Database('REVIEWS_DB');
  async function applyMigration(name) {
    const migration = await readFile(join(reviewsDir, 'migrations', name), 'utf8');
    const statements = migration.split(';').map(statement => statement.trim()).filter(Boolean);
    await database.batch(statements.map(statement => database.prepare(statement)));
  }
  const initialized = await database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_reviews'").first();
  if (!initialized) await applyMigration('0001_create_reviews.sql');
  const { results: columns } = await database.prepare('PRAGMA table_info(project_reviews)').all();
  if (!columns.some(column => column.name === 'photo')) await applyMigration('0002_add_review_photos.sql');
  console.log('Website preview is ready at ' + origin + '/');
} catch (error) {
  await miniflare.dispose().catch(() => {});
  throw error;
}

let passcodeUpdate = Promise.resolve();
watchFile(verifierPath, { interval: 750 }, (current, previous) => {
  if (!current.isFile() || (current.mtimeMs === previous.mtimeMs && current.ino === previous.ino)) return;
  passcodeUpdate = passcodeUpdate.then(async () => {
    const hash = await readVerifier();
    if (hash === options.bindings.ADMIN_PASSWORD_SHA256) return;
    const bindings = { ...options.bindings, ADMIN_PASSWORD_SHA256: hash };
    await miniflare.setOptions(convertV4MiniflareOptions({ ...options, bindings }));
    options.bindings = bindings;
    try {
      const temporary = (await readFile(temporaryPasscodePath, 'utf8')).trim();
      if (createHash('sha256').update(temporary).digest('hex') !== hash) await unlink(temporaryPasscodePath);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('The retired temporary passcode file could not be removed.');
    }
    console.log('Preview admin passcode updated.');
  }).catch(() => console.error('Preview admin passcode could not be reloaded.'));
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    unwatchFile(verifierPath);
    await miniflare.dispose();
    process.exit(0);
  });
}

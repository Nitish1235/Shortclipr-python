import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => readFile(join(root, relative), 'utf8');
const problems = [];
const check = (condition, message) => { if (!condition) problems.push(message); };

const envExample = await read('.env.example');
const requiredEnv = [
  'SUPABASE_DB_URL', 'FRONTEND_URL', 'GOOGLE_CLIENT_ID', 'JWT_SECRET',
  'OPENAI_API_KEY', 'UNREALSPEECH_API_KEY', 'GCS_BUCKET_NAME',
  'GCS_SIGNING_SERVICE_ACCOUNT', 'DODO_PAYMENTS_API_KEY',
  'DODO_PAYMENTS_WEBHOOK_SECRET', 'DODO_PRODUCT_STARTER', 'DODO_PRODUCT_CREATOR', 'DODO_PRODUCT_STUDIO',
  'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'INTERNAL_TASK_SECRET',
  'MAX_LANDING_MEDIA_BYTES', 'API_WORKER_URLS', 'FFMPEG_WORKER_URLS'
];
for (const name of requiredEnv) check(new RegExp(`^${name}=`, 'm').test(envExample), `.env.example is missing ${name}`);

const migrationFiles = (await readdir(join(root, 'backend/migrations'))).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
const expectedMigrations = [
  '0001_shortclipr_foundation.sql', '0002_landing_reel.sql', '0003_voice_library.sql',
  '0004_billing_checkout_sessions.sql', '0005_project_email_notifications.sql',
  '0006_landing_media_slots.sql', '0007_pricing_entitlements.sql', '0008_free_plan_15_seconds.sql',
  '0009_media_placement_map.sql', '0010_worker_region_state.sql', '0011_landing_thumbnail_slots.sql',
  '0012_editorial_landing_media.sql'
];
check(JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrations), 'Migration sequence is incomplete or out of order');

const frontendDocker = await read('Dockerfile');
for (const asset of ['product.css', 'hero-background.css', 'live-reel.css', 'reference.css', 'reference.js', 'story-machine/assets/']) {
  check(frontendDocker.includes(asset), `Frontend container does not copy ${asset}`);
}
const nginx = await read('nginx.conf');
check(nginx.includes('location = /health'), 'Frontend health endpoint is missing');

const viteConfig = await read('vite.config.ts');
check(viteConfig.includes('sourcemap: false'), 'Production source maps must remain disabled');
const sitemap = await read('public/sitemap.xml');
for (const route of ['/about/', '/editorial-policy/', '/faceless-tiktok-video-maker/', '/animated-youtube-shorts-maker/']) {
  check(sitemap.includes(`https://shortclipr.com${route}`), `Sitemap is missing the AEO route ${route}`);
}
const robots = await read('public/robots.txt');
check(/User-agent: OAI-SearchBot\r?\nAllow: \//.test(robots), 'OAI-SearchBot is not explicitly allowed');
check(/User-agent: GPTBot\r?\nDisallow: \//.test(robots), 'GPTBot training crawl is not blocked');
const guidePage = await read('public/guides/how-to-make-animated-explainer-video/index.html');
check(guidePage.includes('"@type":"Article"'), 'Generated guides are missing Article structured data');
check(guidePage.includes('ShortClipr Editorial Team'), 'Generated guides are missing visible authorship');

const deployments = [
  ['cloudbuild-frontend.yaml', 'shortclipr-frontend'],
  ['backend/cloudbuild-api.yaml', 'shortclipr-api'],
  ['backend/cloudbuild-api-worker.yaml', 'shortclipr-api-worker-$_REGION'],
  ['backend/cloudbuild-ffmpeg-worker.yaml', 'shortclipr-ffmpeg-worker-$_REGION'],
  ['backend/cloudbuild-watcher.yaml', 'shortclipr-watcher'],
];
for (const [file, service] of deployments) {
  const source = await read(file);
  check(source.includes(`run, deploy, ${service}`), `${file} does not retain ${service}`);
  check(source.includes('--startup-probe='), `${file} is missing a startup probe`);
}

const apiDocker = await read('backend/Dockerfile');
const planningDocker = await read('backend/Dockerfile.api-worker');
const renderDocker = await read('backend/Dockerfile.ffmpeg-worker');
check(apiDocker.includes('SERVICE_ROLE=api'), 'Public API image does not set its service role');
check(planningDocker.includes('SERVICE_ROLE=api-worker'), 'Planning-worker image does not set its service role');
check(renderDocker.includes('SERVICE_ROLE=ffmpeg-worker'), 'Render-worker image does not set its service role');
check(renderDocker.includes('ffmpeg chromium nodejs npm'), 'Render-worker image is missing required media runtime packages');
const watcherDocker = await read('backend/watcher/Dockerfile');
check(watcherDocker.includes('EXPOSE 8080'), 'Watcher image does not expose Cloud Run port 8080');

if (problems.length) {
  console.error('Deployment preflight failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Deployment preflight passed: ${expectedMigrations.length} migrations, ${deployments.length} retained services, production env contract, and container assets are aligned.`);
}

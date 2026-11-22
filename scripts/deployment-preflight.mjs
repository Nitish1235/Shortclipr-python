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
  'DODO_PAYMENTS_API_KEY',
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
  '0012_editorial_landing_media.sql', '0013_billing_plan_constraint.sql', '0014_landing_media_revisions.sql'
];
check(JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrations), 'Migration sequence is incomplete or out of order');

const frontendDocker = await read('Dockerfile');
check(frontendDocker.includes('/usr/share/nginx/html/animation-maker/'), 'Frontend container must publish the landing page at /animation-maker/');
for (const asset of ['product.css', 'hero-background.css', 'live-reel.css', 'reference.css', 'reference.js', 'story-machine/assets/']) {
  check(frontendDocker.includes(asset), `Frontend container does not copy ${asset}`);
}
const nginx = await read('nginx.conf');
check(nginx.includes('location = / { return 301 /animation-maker/; }'), 'Root must redirect to /animation-maker/');
check(nginx.includes('location = /story-machine/ { return 301 /animation-maker/; }'), 'Legacy landing route must redirect to /animation-maker/');
check(nginx.includes('location = /health'), 'Frontend health endpoint is missing');
check(nginx.includes('server_name www.shortclipr.com;'), 'Frontend must redirect the www hostname to the canonical hostname');
check(nginx.includes('return 301 https://shortclipr.com$request_uri;'), 'Frontend www redirect must target the canonical hostname');
check(nginx.includes('listen 8080 default_server;'), 'Frontend canonical server must be the default server');
check(nginx.includes('server_name shortclipr.com _;'), 'Frontend canonical server must accept the apex hostname');
check(nginx.includes('location ^~ /youtube-shorts/ { return 410; }'), 'Frontend must return 410 for retired YouTube-clipping routes');

check(nginx.includes('no-store, no-cache, must-revalidate, max-age=0'), 'HTML and stable CSS/JS must not be served from stale browser caches');
check(nginx.includes('location ^~ /assets/'), 'Fingerprintable Vite assets must have an explicit immutable cache policy');
const viteConfig = await read('vite.config.ts');
check(viteConfig.includes('sourcemap: false'), 'Production source maps must remain disabled');
const sitemap = await read('public/sitemap.xml');
for (const route of ['/about/', '/editorial-policy/', '/faceless-tiktok-video-maker/', '/animated-youtube-shorts-maker/']) {
  check(sitemap.includes(`https://shortclipr.com${route}`), `Sitemap is missing the AEO route ${route}`);
}
const robots = await read('public/robots.txt');
check(/User-agent: OAI-SearchBot\r?\nAllow: \//.test(robots), 'OAI-SearchBot is not explicitly allowed');
check(/User-agent: GPTBot\r?\nAllow: \//.test(robots), 'GPTBot is not allowed to crawl public pages');
check(/User-agent: ClaudeBot\r?\nAllow: \//.test(robots), 'ClaudeBot is not allowed to crawl public pages');
check(/User-agent: Google-Extended\r?\nAllow: \//.test(robots), 'Google-Extended is not allowed to crawl public pages');
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
  const normalized = source.replace(/\r\n/g, '\n');
  check(normalized.includes(`      - run\n      - deploy\n      - ${service}`), `${file} does not retain ${service} as a deploy argument`);
  const probeArguments = normalized.split('\n').map(line => line.trim()).filter(line => line.startsWith('- --startup-probe='));
  check(probeArguments.length === 1, `${file} must pass exactly one startup-probe argument`);
  const probe = probeArguments[0] ?? '';
  for (const field of ['httpGet.path=/health', 'httpGet.port=8080', 'initialDelaySeconds=', 'timeoutSeconds=', 'periodSeconds=', 'failureThreshold=']) {
    check(probe.includes(field), `${file} startup probe is missing ${field}`);
  }
}

const combinedWorkers = (await read('backend/cloudbuild-workers-all.yaml')).replace(/\r\n/g, '\n');
for (const required of [
  'backend/Dockerfile.api-worker',
  'backend/Dockerfile.ffmpeg-worker',
  'shortclipr-api-worker-${_API_REGION}',
  'shortclipr-ffmpeg-worker-$${region}',
  '_FFMPEG_REGION_1: us-central1',
  '_FFMPEG_REGION_2: europe-west1',
  '--memory=4Gi',
  '--concurrency=1',
]) {
  check(combinedWorkers.includes(required), `backend/cloudbuild-workers-all.yaml is missing ${required}`);
}
const combinedProbes = combinedWorkers.match(/--startup-probe=httpGet\.path=\/health,httpGet\.port=8080,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=10,failureThreshold=\d+/g) ?? [];
check(combinedProbes.length === 3, 'backend/cloudbuild-workers-all.yaml must keep one API and two FFmpeg startup probes');
const logLevelDeployments = [
  'backend/cloudbuild-api.yaml',
  'backend/cloudbuild-api-worker.yaml',
  'backend/cloudbuild-ffmpeg-worker.yaml',
];
for (const file of logLevelDeployments) {
  check((await read(file)).includes('--update-env-vars=LOG_LEVEL=info'), `${file} must normalize LOG_LEVEL for Uvicorn`);
}
check((combinedWorkers.match(/--update-env-vars=LOG_LEVEL=info/g) ?? []).length === 3, 'backend/cloudbuild-workers-all.yaml must normalize LOG_LEVEL for all worker services');

const apiDocker = await read('backend/Dockerfile');
const planningDocker = await read('backend/Dockerfile.api-worker');
const renderDocker = await read('backend/Dockerfile.ffmpeg-worker');
check(apiDocker.includes('SERVICE_ROLE=api'), 'Public API image does not set its service role');
check(planningDocker.includes('SERVICE_ROLE=api-worker'), 'Planning-worker image does not set its service role');
check(renderDocker.includes('SERVICE_ROLE=ffmpeg-worker'), 'Render-worker image does not set its service role');
check(renderDocker.includes('ffmpeg chromium nodejs npm'), 'Render-worker image is missing required media runtime packages');
const startScript = await read('backend/start.sh');
check(startScript.includes("tr '[:upper:]' '[:lower:]'"), 'Backend entrypoint must normalize LOG_LEVEL for Uvicorn');
const watcherDocker = await read('backend/watcher/Dockerfile');
check(watcherDocker.includes('EXPOSE 8080'), 'Watcher image does not expose Cloud Run port 8080');

if (problems.length) {
  console.error('Deployment preflight failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Deployment preflight passed: ${expectedMigrations.length} migrations, ${deployments.length} retained services, production env contract, and container assets are aligned.`);
}

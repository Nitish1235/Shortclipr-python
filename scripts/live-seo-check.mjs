const origin = process.env.SHORTCLIPR_PUBLIC_ORIGIN ?? 'https://shortclipr.com';
const canonicalOrigin = 'https://shortclipr.com';
const failures = [];

try {
const check = (condition, message) => { if (!condition) failures.push(message); };
const request = path => fetch(`${origin}${path}`, {redirect: 'manual'});

const root = await request('/');
check(root.status === 301, `/: expected 301, received ${root.status}`);
check(root.headers.get('location') === '/story-machine/', `/: expected Location /story-machine/, received ${root.headers.get('location')}`);

const landing = await request('/story-machine/');
const landingHtml = await landing.text();
check(landing.status === 200, `/story-machine/: expected 200, received ${landing.status}`);
check(landingHtml.includes('AI Animated Video Maker – Create Shorts From Text | ShortClipr'), '/story-machine/: current animated-video title is not deployed');
check(landingHtml.includes('Turn Your Ideas Into Animated Shorts'), '/story-machine/: current hero message is not deployed');
check(landingHtml.includes('https://shortclipr.com/story-machine/'), '/story-machine/: canonical URL is missing');

const legacy = await request('/youtube-shorts/');
check(legacy.status === 410, `/youtube-shorts/: expected 410, received ${legacy.status}`);

const robots = await request('/robots.txt');
const robotsText = await robots.text();
check(robots.status === 200, `/robots.txt: expected 200, received ${robots.status}`);
check(robotsText.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`), '/robots.txt: sitemap declaration is missing');
check(/User-agent: OAI-SearchBot\r?\nAllow: \//.test(robotsText), '/robots.txt: OAI-SearchBot is not allowed');

const sitemap = await request('/sitemap.xml');
const sitemapText = await sitemap.text();
check(sitemap.status === 200, `/sitemap.xml: expected 200, received ${sitemap.status}`);
check(sitemapText.includes(`${canonicalOrigin}/story-machine/`), '/sitemap.xml: canonical landing page is missing');
check(!sitemapText.includes('/youtube-shorts'), '/sitemap.xml: retired clipping URLs must not be listed');

if (failures.length) {
  console.error(`Live SEO check failed for ${origin}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Live SEO check passed for ${origin}: canonical landing, legacy removals, robots, and sitemap are current.`);
}
} catch (error) {
  console.error(`Live SEO check could not reach ${origin}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

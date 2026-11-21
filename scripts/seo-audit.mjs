import {access, readFile, readdir} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const domain = 'https://shortclipr.com';
const problems = [];
const check = (condition, message) => { if (!condition) problems.push(message); };

async function walk(folder) {
  const entries = await readdir(folder, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

function tagWith(html, tagName, attribute, value) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? [];
  return tags.find(tag => new RegExp(`\\b${attribute}=["']${value}["']`, 'i').test(tag)) ?? '';
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? '';
}

function titleOf(html) {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim() ?? '';
}

function routeFor(file) {
  const normalized = relative(root, dirname(file)).split(sep).join('/');
  if (normalized === 'story-machine') return '/animation-maker/';
  return `/${normalized.replace(/^public\//, '')}/`;
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolvesInternalPath(pathname) {
  if (pathname === '/' || pathname === '/login' || /^\/(studio|admin)(\/|$)/.test(pathname)) return true;
  const clean = decodeURIComponent(pathname).replace(/^\//, '');
  const candidates = pathname.endsWith('/')
    ? [join(root, clean, 'index.html'), join(root, 'public', clean, 'index.html')]
    : [join(root, clean), join(root, 'public', clean)];
  for (const candidate of candidates) if (await exists(candidate)) return true;
  return false;
}

const allPublicFiles = await walk(join(root, 'public'));
const publicPages = allPublicFiles.filter(file => file.endsWith(`${sep}index.html`) && !file.includes(`${sep}landing-demo${sep}`));
const pages = [join(root, 'story-machine', 'index.html'), ...publicPages];
const pageRoutes = new Set(pages.map(routeFor));
const seenTitles = new Map();
const seenDescriptions = new Map();

for (const file of pages) {
  const html = await readFile(file, 'utf8');
  const label = relative(root, file).split(sep).join('/');
  const route = routeFor(file);
  const expectedCanonical = `${domain}${route}`;
  const title = titleOf(html);
  const description = attribute(tagWith(html, 'meta', 'name', 'description'), 'content');
  const robots = attribute(tagWith(html, 'meta', 'name', 'robots'), 'content');
  const canonical = attribute(tagWith(html, 'link', 'rel', 'canonical'), 'href');
  const ogTitle = attribute(tagWith(html, 'meta', 'property', 'og:title'), 'content');
  const ogDescription = attribute(tagWith(html, 'meta', 'property', 'og:description'), 'content');
  const ogUrl = attribute(tagWith(html, 'meta', 'property', 'og:url'), 'content');
  const twitterCard = attribute(tagWith(html, 'meta', 'name', 'twitter:card'), 'content');
  const twitterTitle = attribute(tagWith(html, 'meta', 'name', 'twitter:title'), 'content');
  const twitterDescription = attribute(tagWith(html, 'meta', 'name', 'twitter:description'), 'content');

  check(/<!doctype html>/i.test(html), `${label}: missing HTML doctype`);
  check(/<html\b[^>]*\blang=["']en["']/i.test(html), `${label}: missing English language declaration`);
  check(Boolean(title), `${label}: missing title`);
  check(Boolean(description), `${label}: missing meta description`);
  check(robots.includes('index') && robots.includes('follow'), `${label}: is not explicitly indexable`);
  check(canonical === expectedCanonical, `${label}: canonical must be ${expectedCanonical}`);
  check(ogTitle === title, `${label}: og:title does not match the page title`);
  check(ogDescription === description, `${label}: og:description does not match the page description`);
  check(ogUrl === canonical, `${label}: og:url does not match the canonical URL`);
  check(twitterCard === 'summary_large_image', `${label}: missing large Twitter card metadata`);
  check(twitterTitle === title, `${label}: twitter:title does not match the page title`);
  check(twitterDescription === description, `${label}: twitter:description does not match the page description`);
  check(Boolean(tagWith(html, 'link', 'rel', 'icon')), `${label}: missing favicon`);
  check((html.match(/<h1\b/gi) ?? []).length === 1, `${label}: must contain exactly one h1`);

  if (seenTitles.has(title)) problems.push(`${label}: duplicates title from ${seenTitles.get(title)}`);
  else seenTitles.set(title, label);
  if (seenDescriptions.has(description)) problems.push(`${label}: duplicates description from ${seenDescriptions.get(description)}`);
  else seenDescriptions.set(description, label);

  const jsonLdBlocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  check(jsonLdBlocks.length > 0, `${label}: missing JSON-LD structured data`);
  for (const [, json] of jsonLdBlocks) {
    try { JSON.parse(json); }
    catch { problems.push(`${label}: contains invalid JSON-LD`); }
  }

  const hrefs = [...html.matchAll(/\bhref=["']([^"']+)["']/gi)].map(match => match[1]);
  for (const href of hrefs) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const pathname = new URL(href, domain).pathname;
    if (!await resolvesInternalPath(pathname)) problems.push(`${label}: broken internal link ${href}`);
  }
}

const sitemap = await readFile(join(root, 'public', 'sitemap.xml'), 'utf8');
const sitemapEntries = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g)];
const sitemapRoutes = new Set();
for (const [, loc, lastmod] of sitemapEntries) {
  let url;
  try { url = new URL(loc); }
  catch { problems.push(`sitemap.xml: invalid URL ${loc}`); continue; }
  check(url.origin === domain, `sitemap.xml: URL must use ${domain}: ${loc}`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(lastmod) && !Number.isNaN(Date.parse(lastmod)), `sitemap.xml: invalid lastmod for ${loc}`);
  check(pageRoutes.has(url.pathname), `sitemap.xml: ${loc} has no indexable page`);
  check(!sitemapRoutes.has(url.pathname), `sitemap.xml: duplicate URL ${loc}`);
  sitemapRoutes.add(url.pathname);
}
check(sitemapEntries.length === pageRoutes.size, `sitemap.xml: expected ${pageRoutes.size} canonical URLs, found ${sitemapEntries.length}`);
for (const route of pageRoutes) check(sitemapRoutes.has(route), `sitemap.xml: missing ${domain}${route}`);

const robots = await readFile(join(root, 'public', 'robots.txt'), 'utf8');
check(robots.includes('User-agent: *'), 'robots.txt: missing default crawler group');
check(/User-agent: \*\r?\nAllow: \//.test(robots), 'robots.txt: default crawlers are not allowed to read noindex directives');
check(/User-agent: GPTBot\r?\nAllow: \//.test(robots), 'robots.txt: GPTBot is not allowed to crawl public pages');
check(/User-agent: ClaudeBot\r?\nAllow: \//.test(robots), 'robots.txt: ClaudeBot is not allowed to crawl public pages');
check(/User-agent: Google-Extended\r?\nAllow: \//.test(robots), 'robots.txt: Google-Extended is not allowed to crawl public pages');
check(robots.includes(`Sitemap: ${domain}/sitemap.xml`), 'robots.txt: missing absolute sitemap declaration');

for (const [file, label] of [
  [join(root, 'index.html'), 'SPA shell'],
  [join(root, 'public', 'landing-demo', 'index.html'), 'landing demo'],
  [join(root, 'public', '404.html'), '404 page'],
]) {
  const html = await readFile(file, 'utf8');
  const directives = attribute(tagWith(html, 'meta', 'name', 'robots'), 'content');
  check(directives.includes('noindex'), `${label}: must remain noindex`);
}

if (problems.length) {
  console.error('SEO audit failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`SEO audit passed: ${pages.length} indexable pages, ${sitemapEntries.length} sitemap URLs, canonical metadata, structured data, robots directives, and internal links are aligned.`);
}

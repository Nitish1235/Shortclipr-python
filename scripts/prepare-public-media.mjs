import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist');
const assets = new Map();
const pages = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (entry.isFile() && entry.name.endsWith('.html') && !(dir === root && entry.name === 'index.html')) pages.push(absolute);
  }
}

function slotFor(source) {
  const clean = source.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  return 'asset_' + clean.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function publicSource(value) {
  return value && !/^(data:|blob:|https?:|\/logo\.svg|\/favicon)/i.test(value);
}

await walk(root);
for (const page of pages) {
  let html = await readFile(page, 'utf8');
  html = html.replace(/<html\b(?![^>]*data-api-base)/i, '<html data-api-base="__SHORTCLIPR_API_URL__"');
  if (!html.includes('/seo-brand-refresh.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/seo-brand-refresh.css"></head>');
  const relativePage = '/' + path.relative(root, page).replaceAll(path.sep, '/').replace(/\/index\.html$/, '/');
  html = html.replace(/<img\b[^>]*>/gi, tag => {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!publicSource(src) || !/(^|\/)(seo-assets|clip-types)\//.test(src)) return tag;
    const slot = slotFor(src);
    const entry = assets.get(slot) ?? { slot, title: path.basename(src), defaultUrl: src, mediaKind: 'image', pages: [] };
    if (!entry.pages.includes(relativePage)) entry.pages.push(relativePage);
    assets.set(slot, entry);
    return /\bdata-media-slot=/.test(tag) ? tag : tag.replace(/<img\b/i, '<img data-media-slot="' + slot + '"');
  });
  html = html.replace(/<video\b[^>]*>/gi, tag => {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!publicSource(src)) return tag;
    const slot = slotFor(src);
    const entry = assets.get(slot) ?? { slot, title: path.basename(src), defaultUrl: src, mediaKind: 'video', pages: [] };
    if (!entry.pages.includes(relativePage)) entry.pages.push(relativePage);
    assets.set(slot, entry);
    return /\bdata-media-slot=/.test(tag) ? tag : tag.replace(/<video\b/i, '<video data-media-slot="' + slot + '"');
  });
  if (!html.includes('/site-media.js')) {
    html = html.replace(/<\/body>/i, '<script src="/site-media.js" defer></script>\n</body>');
  }
  await writeFile(page, html);
}

const manifest = [...assets.values()].sort((a, b) => a.slot.localeCompare(b.slot));
await writeFile(path.join(root, 'site-media-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${manifest.length} shared public media slots across ${pages.length} HTML pages.`);

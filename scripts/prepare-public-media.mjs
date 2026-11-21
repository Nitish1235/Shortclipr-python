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

function normalizeSource(value) {
  if (!value) return '';
  const source = value.trim().replace(/^['"]|['"]$/g, '');
  if (!source || /^(data:|blob:|https?:|mailto:|tel:|#|\/logo\.svg|\/favicon)/i.test(source)) return '';
  return source;
}

function slotFor(source, role = 'media') {
  const clean = source.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  const base = clean.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(-76);
  return 'asset_' + (role === 'media' ? '' : role + '_') + base;
}

function register(source, page, mediaKind, role = 'media') {
  const normalized = normalizeSource(source);
  if (!normalized) return null;
  const slot = slotFor(normalized, role);
  const item = assets.get(slot) ?? {
    slot, title: path.basename(normalized.split(/[?#]/, 1)[0]),
    defaultUrl: normalized, mediaKind, role, pages: []
  };
  if (!item.pages.includes(page)) item.pages.push(page);
  assets.set(slot, item);
  return slot;
}

function annotate(tag, slot, attribute = 'data-media-slot') {
  if (!slot || new RegExp('\\b' + attribute + '=').test(tag)) return tag;
  return tag.replace(/<([a-z][a-z0-9:-]*)\b/i, '<$1 ' + attribute + '="' + slot + '"');
}

await walk(root);
for (const page of pages) {
  let html = await readFile(page, 'utf8');
  html = html.replace(/<html\b(?![^>]*data-api-base)/i, '<html data-api-base="__SHORTCLIPR_API_URL__"');
  if (!html.includes('/seo-brand-refresh.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/seo-brand-refresh.css"></head>');
  const relativePage = '/' + path.relative(root, page).replaceAll(path.sep, '/').replace(/\/index\.html$/, '/');

  html = html.replace(/<(img|video)\b[^>]*>/gi, tag => {
    const tagName = tag.match(/^<(img|video)/i)?.[1]?.toLowerCase();
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    let updated = tag;
    if (src) updated = annotate(updated, register(src, relativePage, tagName === 'video' ? 'video' : 'image'));
    if (tagName === 'video') {
      const poster = tag.match(/\bposter=["']([^"']+)["']/i)?.[1];
      if (poster) updated = annotate(updated, register(poster, relativePage, 'image', 'poster'), 'data-media-poster-slot');
    } else {
      const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
      if (srcset) {
        const first = srcset.split(',')[0].trim().split(/\s+/)[0];
        updated = annotate(updated, register(first, relativePage, 'image', 'srcset'), 'data-media-srcset-slot');
      }
    }
    return updated;
  });

  html = html.replace(/<source\b[^>]*>/gi, tag => {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    const value = src || (srcset ? srcset.split(',')[0].trim().split(/\s+/)[0] : '');
    if (!value) return tag;
    const parentTag = html.slice(0, html.indexOf(tag)).match(/<(video|picture)\b(?:(?!<\/(?:video|picture)>)[\s\S]){0,5000}$/i)?.[1]?.toLowerCase();
    return annotate(tag, register(value, relativePage, parentTag === 'video' ? 'video' : 'image', 'source'));
  });

  html = html.replace(/<([a-z][a-z0-9:-]*)\b[^>]*>/gi, tag => {
    const style = tag.match(/\bstyle=(["'])(.*?)\1/i)?.[2] || '';
    if (!/background(?:-image)?\s*:/i.test(style)) return tag;
    const url = style.match(/url\(\s*(["']?)(.*?)\1\s*\)/i)?.[2];
    return url ? annotate(tag, register(url, relativePage, 'image', 'background')) : tag;
  });

  if (!html.includes('/site-media.js')) html = html.replace(/<\/body>/i, '<script src="/site-media.js" defer></script>\n</body>');
  await writeFile(page, html);
}

const manifest = [...assets.values()].sort((a, b) => a.slot.localeCompare(b.slot));
await writeFile(path.join(root, 'site-media-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared ' + manifest.length + ' public media slots across ' + pages.length + ' HTML pages.');

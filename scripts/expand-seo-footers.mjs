import {readFile, writeFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const compactFooter = '<footer><div><a class="brand" href="/story-machine/">ShortClipr<span>.</span></a><p>Little films. Big ideas.</p></div><div><a href="/video-ideas/">Explore video ideas</a><a href="/guides/">Read the guides</a><a href="/faceless-video-maker/">Faceless video</a></div><small>ShortClipr is in development. Creative formats and availability may change.</small></footer>';
const directoryFooter = `<footer class="seo-footer-directory"><style>.seo-footer-directory{grid-template-columns:minmax(170px,.55fr) 1fr;gap:8%;padding-block:64px 28px}.seo-footer-directory nav{display:grid;grid-template-columns:1fr 1fr;gap:34px}.seo-footer-directory nav section{display:grid;align-content:start;gap:9px}.seo-footer-directory nav h2{margin:0 0 8px;color:#bdff32;font:800 10px 'DM Sans',sans-serif;letter-spacing:.14em}.seo-footer-directory nav a{color:#e6e8df;text-decoration:none;font-size:13px;line-height:1.35}.seo-footer-directory nav a:hover{color:#bdff32}.seo-footer-brand p{color:#a7ac9d;font-size:13px;margin:14px 0 20px}.footer-studio-link{display:inline-block!important;padding-bottom:5px;border-bottom:1px solid #bdff32;color:#bdff32!important;font-weight:800}.seo-footer-directory small{border-top:1px solid #454a40;padding-top:18px;margin-top:20px;font-size:10px}@media(max-width:760px){.seo-footer-directory{gap:34px;padding-block:48px 24px}.seo-footer-directory nav{grid-template-columns:1fr;gap:30px}.seo-footer-directory small{margin-top:0}}</style><div class="seo-footer-brand"><a class="brand" href="/story-machine/">ShortClipr<span>.</span></a><p>Little films. Big ideas.</p><a class="footer-studio-link" href="/studio/">Enter the studio ↗</a></div><nav aria-label="Explore ShortClipr"><section><h2>MAKE A CLIP</h2><a href="/animated-explainer-video-maker/">Animated explainers</a><a href="/text-to-animation/">Text to animation</a><a href="/faceless-video-maker/">Faceless videos</a><a href="/faceless-youtube-shorts/">Faceless YouTube Shorts</a><a href="/animated-tiktok-video-maker/">Animated TikTok videos</a><a href="/animated-reels-maker/">Animated Reels</a><a href="/animated-story-video-maker/">Animated story videos</a><a href="/video-quiz-maker/">Video quizzes</a><a href="/educational-video-maker/">Educational videos</a></section><section><h2>EXPLORE</h2><a href="/video-ideas/">All video ideas</a><a href="/guides/">Guides library</a><a href="/guides/how-to-make-animated-explainer-video/">Make an explainer</a><a href="/guides/how-to-make-faceless-youtube-shorts/">Faceless Shorts guide</a><a href="/guides/faceless-tiktok-video-ideas/">TikTok video ideas</a><a href="/guides/how-to-make-animated-tiktok-videos/">Make TikTok animations</a><a href="/guides/how-to-write-an-animation-brief/">Write an animation brief</a><a href="/guides/how-to-make-a-quiz-video/">Make a quiz video</a><a href="/guides/short-video-storytelling/">Short video storytelling</a><a href="/guides/video-aspect-ratio-guide/">Video aspect ratios</a></section></nav><small>ShortClipr is in development. Creative formats and availability may change.</small></footer>`;

async function indexFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const result = [];
  for (const entry of entries) {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await indexFiles(location));
    else if (entry.name === 'index.html') result.push(location);
  }
  return result;
}

const files = await indexFiles(root);
let changed = 0;
for (const file of files) {
  if (file.includes(`${join('public', 'landing-demo')}`)) continue;
  const source = await readFile(file, 'utf8');
  if (!source.includes(compactFooter)) continue;
  await writeFile(file, source.replace(compactFooter, directoryFooter));
  changed += 1;
}
if (changed !== 19) throw new Error(`Expected to expand 19 SEO footers; changed ${changed}.`);
console.log(`Expanded ${changed} SEO footers.`);

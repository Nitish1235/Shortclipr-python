import {mkdir, readFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {bundle} from '@remotion/bundler'
import {renderMedia, selectComposition} from '@remotion/renderer'
import type {RenderPlan} from './contracts'

const [, , planPath, outputPath] = process.argv
if (!planPath || !outputPath) throw new Error('Usage: npm run render -- <plan.json> <output.mp4>')

const plan = JSON.parse(await readFile(resolve(planPath), 'utf8')) as RenderPlan
const dimensions: Record<RenderPlan['aspectRatio'], [number, number]> = {'9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080]}
const [width, height] = dimensions[plan.aspectRatio]
const outputLocation = resolve(outputPath)
const concurrency = Number(process.env.REMOTION_CONCURRENCY ?? 2)
const crf = Number(process.env.REMOTION_CRF ?? 18)

await mkdir(dirname(outputLocation), {recursive: true})
console.log(JSON.stringify({event: 'remotion.bundle.start'}))
const serveUrl = await bundle({
  entryPoint: resolve('./src/index.ts'),
  onProgress: progress => console.log(JSON.stringify({event: 'remotion.bundle.progress', progress})),
  webpackOverride: config => config,
})
console.log(JSON.stringify({event: 'remotion.bundle.done'}))

const inputProps = {plan}
const composition = await selectComposition({serveUrl, id: 'ShortClipr', inputProps})
const renderComposition = {...composition, width, height, fps: plan.fps, durationInFrames: Math.round(plan.durationSeconds * plan.fps)}
console.log(JSON.stringify({event: 'remotion.render.start', frames: renderComposition.durationInFrames, fps: renderComposition.fps, width, height, crf, concurrency}))

await renderMedia({
  codec: 'h264',
  crf,
  composition: renderComposition,
  serveUrl,
  outputLocation,
  inputProps,
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH,
  muted: true,
  concurrency,
  pixelFormat: 'yuv420p',
  chromiumOptions: {
    enableMultiProcessOnLinux: true,
  },
  onProgress: progress => console.log(JSON.stringify({event: 'remotion.render.progress', ...progress})),
})

console.log(JSON.stringify({event: 'remotion.render.done', output: outputLocation, projectId: plan.projectId}))

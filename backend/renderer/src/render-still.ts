import {mkdir} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {bundle} from '@remotion/bundler'
import {renderStill, selectComposition} from '@remotion/renderer'
import type {RenderPlan} from './contracts'

const outputLocation = resolve(process.argv[2] ?? '../../artifacts/bridge-frame.png')
const plan: RenderPlan = {
  projectId: 'static-frame-review',
  title: 'How a River Bridge Gets Its Support',
  narration: 'A bridge does not float by accident. Its deck transfers weight into the cables, towers and foundations below.',
  aspectRatio: '9:16',
  fps: 30,
  durationSeconds: 15,
  palette: {background: '#171914', foreground: '#f2f0e7', accent: '#bdff32', secondary: '#c6b7ec'},
  scenes: [{
    index: 0,
    start_frame: 0,
    end_frame: 450,
    purpose: 'Show the load path from the bridge deck into the foundations.',
    visual_description: 'A suspended bridge deck spans a river. Vertical towers carry a curved cable while small moving load markers travel from the deck into the towers and down to the foundations.',
    complexity: 'medium',
    operations: ['reveal', 'connect', 'flow', 'trace', 'compare'],
    layers: ['river', 'deck', 'towers', 'cable', 'load-path'],
    objects: ['river', 'bridge deck', 'support towers', 'suspension cable', 'load markers'],
    events: ['load markers flow from deck through towers into foundations'],
    camera: 'slow push toward the center span',
    transition_out: 'fade',
    animation: {
      visual_family: 'bridge',
      headline: 'Bridge support',
      caption: 'Load path from deck to ground',
      primary_value: 'Suspended bridge structure',
      objects: ['river', 'bridge deck', 'support towers', 'suspension cable', 'load markers'],
      events: ['load markers flow from deck through towers into foundations'],
      motion: 'trace',
      density: 8,
      emphasis: 'balanced',
      background: 'ink',
    },
  }],
}

await mkdir(dirname(outputLocation), {recursive: true})
const serveUrl = await bundle({
  entryPoint: resolve('./src/index.ts'),
  onProgress: progress => console.log(JSON.stringify({event: 'still.bundle.progress', progress})),
})
const composition = await selectComposition({serveUrl, id: 'ShortClipr', inputProps: {plan}})
await renderStill({
  composition: {...composition, width: 1080, height: 1920, fps: plan.fps},
  serveUrl,
  frame: 260,
  inputProps: {plan},
  output: outputLocation,
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH,
})
console.log(JSON.stringify({event: 'still.render.done', output: outputLocation, frame: 260}))

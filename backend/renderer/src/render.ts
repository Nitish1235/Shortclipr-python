import {mkdir, readFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {renderVideo} from '@revideo/renderer'
import type {RenderPlan} from './contracts'

const [, , planPath, outputPath] = process.argv
if (!planPath || !outputPath) throw new Error('Usage: npm run render -- <plan.json> <output.mp4>')

const plan = JSON.parse(await readFile(resolve(planPath),'utf8')) as RenderPlan
const dimensions:Record<RenderPlan['aspectRatio'],[number,number]> = {'9:16':[1080,1920],'1:1':[1080,1080],'16:9':[1920,1080]}
const [width, height] = dimensions[plan.aspectRatio]
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
await mkdir(dirname(resolve(outputPath)),{recursive:true})

const rendered = await renderVideo({
  projectFile: resolve('src/project.ts'),
  variables:{plan},
  settings:{
    outFile:resolve(outputPath) as `${string}.mp4`,
    workers:Number(process.env.RENDER_WORKERS ?? 1),
    projectSettings:{size:{x:width,y:height}},
    logProgress:true,
    ffmpeg:{ffmpegPath:process.env.FFMPEG_PATH ?? 'ffmpeg',ffmpegLogLevel:'error'},
    puppeteer:{args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],...(executablePath?{executablePath}:{})}
  }
})
console.log(JSON.stringify({output:rendered,projectId:plan.projectId}))

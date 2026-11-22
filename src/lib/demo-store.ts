import type { AdminJob, CreateProjectInput, CreditBalance, Project, ShowcaseClip, User, Voice } from '../types'
import { estimateCredits } from '../data/catalog'

const PROJECTS_KEY = 'shortclipr.projects.v2'
const SHOWCASE_KEY = 'shortclipr.showcase.v2'
const CREDITS_KEY = 'shortclipr.render-time.v5'

const now = () => new Date().toISOString()
const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))

const starterProjects: Project[] = []

const starterClips: ShowcaseClip[] = [
  { id:'specimen-moon', title:'One Night. No Moon.', description:'A suspense layout specimen. Replace it from Admin with a real exported film.', department:'story', aspectRatio:'9:16', videoUrl:'', published:true, featured:true, landingVisible:true, sortOrder:1, createdAt:now() },
  { id:'specimen-forever', title:'How Far Is Forever?', description:'A scale-journey specimen for the studio reel.', department:'learn', aspectRatio:'9:16', videoUrl:'', published:true, featured:false, sortOrder:2, createdAt:now() }
]

export const demoStore = {
  user(): User { return { id:'demo-user', email:'studio@shortclipr.com', fullName:'Nitish', plan:'free', isAdmin:false } },
  projects(): Project[] { return read(PROJECTS_KEY, starterProjects) },
  adminJobs(): AdminJob[] { return this.projects().filter(project=>project.status==='complete').map(project=>({...project,ownerEmail:'creator@shortclipr.com',ownerName:'ShortClipr creator'})) },
  saveProjects(projects: Project[]) { write(PROJECTS_KEY, projects) },
  project(id: string): Project | undefined { return this.projects().find((project) => project.id === id) },
  createProject(input: CreateProjectInput): Project {
    if (input.durationSeconds !== 10) throw new Error('The Free plan includes one 10-second short each month.')
    const title = input.brief.split(/[.!?\n]/)[0].slice(0, 76) || 'Untitled production'
    const project: Project = { id:crypto.randomUUID(), title, ...input, status:'queued', progress:2, creditsReserved:estimateCredits(input.clipType,input.durationSeconds,input.visualStyle), createdAt:now(), updatedAt:now() }
    const projects = [project, ...this.projects()]
    write(PROJECTS_KEY, projects)
    const credits = this.credits(); credits.used = Math.min(credits.total, credits.used + project.creditsReserved); credits.remaining = Math.max(0, credits.total - credits.used); write(CREDITS_KEY, credits)
    return project
  },
  credits(): CreditBalance { const value=read(CREDITS_KEY,{total:10,used:0,remaining:10}); return {...value,remaining:Math.max(0,value.total-value.used)} },
  voices(): Voice[] { return [
    {id:'af_bella',name:'Hannah',language:'English (US)',description:'Reserved, natural American female'},
    {id:'af_nicole',name:'Kaitlyn',language:'English (US)',description:'Casual American female'},
    {id:'af_sarah',name:'Lauren',language:'English (US)',description:'Confident educator-style American female'},
    {id:'af_sky',name:'Sierra',language:'English (US)',description:'Composed American female'},
    {id:'am_adam',name:'Noah',language:'English (US)',description:'Confident American male'},
    {id:'am_michael',name:'Daniel',language:'English (US)',description:'Confident American male'},
    {id:'bf_emma',name:'Chloe',language:'English (UK)',description:'British female'},
    {id:'bf_isabella',name:'Amelia',language:'English (UK)',description:'Calm British female'},
    {id:'bm_george',name:'Edward',language:'English (UK)',description:'Mature British male'},
    {id:'bm_lewis',name:'Oliver',language:'English (UK)',description:'Confident British male'},
    {id:'ff_siwis',name:'Élodie',language:'French',description:'Young French female'},
    {id:'hf_alpha',name:'Ananya',language:'Hindi',description:'Young Hindi female'},
    {id:'hf_beta',name:'Priya',language:'Hindi',description:'Young Hindi female'},
    {id:'hm_omega',name:'Arjun',language:'Hindi',description:'Young Hindi male'},
    {id:'jf_alpha',name:'Sakura',language:'Japanese',description:'Young Japanese female'},
    {id:'jm_kumo',name:'Haruto',language:'Japanese',description:'Young Japanese male'},
    {id:'ef_dora',name:'Lucía',language:'Spanish',description:'Young Spanish female'},
    {id:'em_alex',name:'Mateo',language:'Spanish',description:'Young Spanish male'},
    {id:'if_sara',name:'Giulia',language:'Italian',description:'Young Italian female'},
    {id:'im_nicola',name:'Luca',language:'Italian',description:'Young Italian male'},
    {id:'zf_xiaobei',name:'Mei',language:'Chinese',description:'Young Chinese female'},
    {id:'zm_yunjian',name:'Wei',language:'Chinese',description:'Young Chinese male'},
    {id:'pf_dora',name:'Camila',language:'Portuguese',description:'Young Portuguese female'},
    {id:'pm_alex',name:'Thiago',language:'Portuguese',description:'Young Portuguese male'}
  ] },
  showcase(): ShowcaseClip[] { return read(SHOWCASE_KEY, starterClips) },
  saveShowcase(clips: ShowcaseClip[]) { write(SHOWCASE_KEY, clips) }
}

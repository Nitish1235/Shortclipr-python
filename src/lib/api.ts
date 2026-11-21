import { demoStore } from './demo-store'
import type { AdminJob, BillingCheckoutStatus, CreateProjectInput, CreditBalance, LandingMedia, LandingMediaRevision, Project, ShowcaseClip, User, Voice, VoiceLibraryGeneration, WorkerFleetStatus } from '../types'

const configuredBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const apiConfigured = Boolean(configuredBase)
export const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'
import {localMediaStore} from './local-media'

class ApiClient {
  private token = localStorage.getItem('shortclipr.accessToken')

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!configuredBase) throw new Error('The ShortClipr API URL is not configured for this build')
    const headers = new Headers(init.headers)
    if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)
    const response = await fetch(`${configuredBase}${path}`, { ...init, headers })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: response.statusText }))
      if (response.status === 401) {
        this.token = null
        localStorage.removeItem('shortclipr.accessToken')
        dispatchEvent(new CustomEvent('shortclipr:unauthorized'))
      }
      throw new Error(payload.detail ?? 'Request failed')
    }
    return response.status === 204 ? undefined as T : await response.json() as T
  }

  async authenticateGoogle(credential: string): Promise<User> {
    const result = await this.request<{accessToken:string;user:User}>('/v1/auth/google',{method:'POST',body:JSON.stringify({credential})})
    this.token=result.accessToken; localStorage.setItem('shortclipr.accessToken',result.accessToken); return result.user
  }
  signOut():void { this.token=null; localStorage.removeItem('shortclipr.accessToken') }
  async me(): Promise<User> { return demoMode ? demoStore.user() : this.request('/v1/auth/me') }
  async projects(): Promise<Project[]> { return demoMode ? demoStore.projects() : this.request('/v1/projects') }
  async project(id:string): Promise<Project|undefined> { return demoMode ? demoStore.project(id) : this.request(`/v1/projects/${id}`) }
  async projectDownload(id:string): Promise<string> {
    if(demoMode)return demoStore.project(id)?.outputUrl ?? ''
    const result=await this.request<{downloadUrl:string}>(`/v1/projects/${id}/download`)
    return result.downloadUrl
  }
  async projectMedia(id:string,download=false): Promise<string> {
    if(demoMode)return demoStore.project(id)?.outputUrl ?? ''
    const response=await fetch(`${configuredBase}/v1/projects/${id}/media${download?'?download=1':''}`,{headers:this.token?{Authorization:`Bearer ${this.token}`}:{}})
    if(!response.ok){
      const payload=await response.json().catch(()=>({detail:response.statusText}))
      if(response.status===401){this.token=null;localStorage.removeItem('shortclipr.accessToken');dispatchEvent(new CustomEvent('shortclipr:unauthorized'))}
      throw new Error(payload.detail??'Could not load the final video')
    }
    return URL.createObjectURL(await response.blob())
  }
  async createProject(input:CreateProjectInput): Promise<Project> { return demoMode ? demoStore.createProject(input) : this.request('/v1/projects',{method:'POST',body:JSON.stringify(input)}) }
  async cancelProject(id:string):Promise<void>{
    if(demoMode){demoStore.saveProjects(demoStore.projects().map(project=>project.id===id?{...project,status:'cancelled',progress:0}:project));return}
    await this.request(`/v1/projects/${id}/cancel`,{method:'POST'})
  }
  async credits(): Promise<CreditBalance> { return demoMode ? demoStore.credits() : this.request('/v1/account/credits') }
  async voices(): Promise<Voice[]> { return demoMode ? demoStore.voices() : this.request('/v1/catalog/voices') }
  async adminVoices(): Promise<Voice[]> { return demoMode ? demoStore.voices() : this.request('/v1/admin/voices') }
  async adminWorkerStatus(): Promise<WorkerFleetStatus> {
    if(!demoMode)return this.request('/v1/admin/workers/status')
    const now=new Date().toISOString()
    return {regions:[
      {jobClass:'render',region:'us-central1',capacity:4,assigned:4,available:0,status:'full',updatedAt:now},
      {jobClass:'render',region:'europe-west1',capacity:4,assigned:4,available:0,status:'full',updatedAt:now},
      {jobClass:'api',region:'us-central1',capacity:12,assigned:2,available:10,status:'available',updatedAt:now},
    ],queuedApi:1,queuedRender:1,runningApi:2,runningRender:8,failed24h:0,generatedAt:now}
  }
  async generateVoiceLibrary(): Promise<VoiceLibraryGeneration> { return demoMode ? {generated:demoStore.voices().length,failed:0,total:demoStore.voices().length,failures:[]} : this.request('/v1/admin/voices/generate',{method:'POST'}) }
  async showcase(admin=false): Promise<ShowcaseClip[]> { return demoMode ? demoStore.showcase() : this.request(admin?'/v1/admin/showcase':'/v1/showcase') }
  async uploadShowcase(form:FormData): Promise<ShowcaseClip> {
    if(demoMode){
      const clip:ShowcaseClip={id:crypto.randomUUID(),title:String(form.get('title')),description:String(form.get('description')??''),department:String(form.get('department')) as ShowcaseClip['department'],aspectRatio:String(form.get('aspectRatio')) as ShowcaseClip['aspectRatio'],videoUrl:'',published:form.get('published')==='true',featured:form.get('featured')==='true',landingVisible:form.get('landing_visible')==='true',sortOrder:demoStore.showcase().length+1,createdAt:new Date().toISOString()}
      const clips=demoStore.showcase().map(item=>clip.featured?{...item,featured:false}:item);demoStore.saveShowcase([clip,...clips]);return clip
    }
    return this.request('/v1/admin/showcase',{method:'POST',body:form})
  }
  async updateShowcase(id:string,patch:Partial<ShowcaseClip>):Promise<ShowcaseClip>{
    if(demoMode){const clips=demoStore.showcase().map(item=>item.id===id?{...item,...patch}:item);demoStore.saveShowcase(clips);return clips.find(item=>item.id===id)!}
    return this.request(`/v1/admin/showcase/${id}`,{method:'PATCH',body:JSON.stringify(patch)})
  }
  async deleteShowcase(id:string):Promise<void>{if(demoMode){demoStore.saveShowcase(demoStore.showcase().filter(item=>item.id!==id));return}await this.request(`/v1/admin/showcase/${id}`,{method:'DELETE'})}
  async landingMedia(admin=false):Promise<LandingMedia[]>{return demoMode?(await localMediaStore()).readLocalMedia():this.request(admin?'/v1/admin/showcase/landing-media':'/v1/landing-media')}
  async uploadLandingMedia(form:FormData):Promise<LandingMedia>{
    if(demoMode)return (await localMediaStore()).saveLocalMedia(form)
    return this.request('/v1/admin/showcase/landing-media',{method:'POST',body:form})
  }
  async deleteLandingMedia(slot:string):Promise<void>{if(demoMode){await (await localMediaStore()).deleteLocalMedia(slot);return}await this.request(`/v1/admin/showcase/landing-media/${slot}`,{method:'DELETE'})}
  async landingMediaHistory(slot:string):Promise<LandingMediaRevision[]>{if(demoMode)return [];return this.request(`/v1/admin/showcase/landing-media/${encodeURIComponent(slot)}/history`)}
  async restoreLandingMediaRevision(slot:string,revisionId:string):Promise<LandingMedia>{if(demoMode)throw new Error('Revision restore is available in the connected admin environment');return this.request(`/v1/admin/showcase/landing-media/${encodeURIComponent(slot)}/restore/${revisionId}`,{method:'POST'})}
  async adminJobs():Promise<AdminJob[]>{
    if(demoMode)return demoStore.adminJobs()
    return this.request('/v1/admin/showcase/jobs')
  }
  async assignProjectToShowcase(project:AdminJob, options:{landingVisible:boolean;published:boolean}):Promise<ShowcaseClip>{
    if(demoMode){
      const existing=demoStore.showcase().find(clip=>clip.sourceProjectId===project.id)
      const clip:ShowcaseClip={id:existing?.id??crypto.randomUUID(),title:project.title,description:project.brief.slice(0,180),department:project.department,aspectRatio:project.aspectRatio,videoUrl:project.outputUrl??'',posterUrl:project.posterUrl,published:options.published,featured:existing?.featured??false,landingVisible:options.landingVisible,sourceProjectId:project.id,sortOrder:existing?.sortOrder??demoStore.showcase().length+1,createdAt:existing?.createdAt??new Date().toISOString()}
      demoStore.saveShowcase([clip,...demoStore.showcase().filter(item=>item.id!==clip.id)]);return clip
    }
    return this.request(`/v1/admin/showcase/from-project/${project.id}`,{method:'POST',body:JSON.stringify({description:project.brief.slice(0,220),published:options.published,landingVisible:options.landingVisible})})
  }
  async checkout(plan:'starter'|'creator'|'studio'):Promise<void>{
    if(demoMode){throw new Error('Checkout is disabled in local demo mode')}
    const result=await this.request<{checkoutUrl:string;sessionId:string}>('/v1/billing/checkout',{method:'POST',body:JSON.stringify({plan})})
    sessionStorage.setItem('shortclipr.checkoutSession',result.sessionId)
    location.assign(result.checkoutUrl)
  }
  async checkoutStatus(sessionId:string):Promise<BillingCheckoutStatus>{
    if(demoMode)return {sessionId,plan:'starter',status:'created'}
    return this.request(`/v1/billing/checkout/${encodeURIComponent(sessionId)}`)
  }
  async billingPortal():Promise<void>{
    if(demoMode){throw new Error('Billing management is disabled in local demo mode')}
    const result=await this.request<{portalUrl:string}>('/v1/billing/portal',{method:'POST'})
    location.assign(result.portalUrl)
  }
}

export const api = new ApiClient()

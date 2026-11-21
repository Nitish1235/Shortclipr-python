import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, apiConfigured, demoMode } from './lib/api'
import { clipTypes, departmentCopy, estimateCredits } from './data/catalog'
import { allPlans, formatRenderTime, paidPlans, type PaidPlanId } from './data/plans'
import { track, trackPage } from './lib/tracking'
import type { AdminJob, AspectRatio, CreateProjectInput, CreditBalance, Department, LandingMedia, LandingMediaSlot, Project, ShowcaseClip, User, Voice, WorkerFleetStatus } from './types'

declare global {
  interface Window {
    google?: { accounts: { id: { initialize(input:{client_id:string;callback:(result:{credential:string})=>void}):void; renderButton(element:HTMLElement,options:Record<string,unknown>):void; disableAutoSelect():void } } }
  }
}

const navItems = [
  ['/studio','⌂','Overview'],['/studio/create','✦','Create video'],['/studio/projects','▤','My projects'],['/studio/screening','▶','Screening room'],['/studio/credits','◒','Render time & plan']
] as const

const statusName = (status:Project['status']) => ({queued:'Queued',planning:'Planning',rendering:'Rendering',complete:'Complete',failed:'Needs attention',cancelled:'Cancelled',draft:'Draft'}[status])
const departmentName = (department:Department) => departmentCopy[department].title

function usePathname(){
  const [path,setPath]=useState(location.pathname)
  useEffect(()=>{const handler=()=>setPath(location.pathname);addEventListener('popstate',handler);return()=>removeEventListener('popstate',handler)},[])
  return path
}

function go(path:string){history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'))}

function Link({to,children,className}: {to:string;children:ReactNode;className?:string}){
  return <a href={to} className={className} onClick={(event)=>{if(!event.metaKey&&!event.ctrlKey){event.preventDefault();go(to)}}}>{children}</a>
}

function LoginPage({onLogin}:{onLogin:(user:User)=>void}){
  const [error,setError]=useState('')
  const googleSlotRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID
    if(!clientId)return
    let script:HTMLScriptElement|undefined
    const drawButton=()=>{const slot=googleSlotRef.current;if(!slot||!window.google?.accounts.id)return;slot.replaceChildren();window.google.accounts.id.renderButton(slot,{theme:'filled_black',size:'large',shape:'rectangular',width:Math.max(240,Math.min(320,Math.floor(slot.clientWidth||320)))} )}
    const initialise=()=>{window.google?.accounts.id.initialize({client_id:clientId,callback:async({credential})=>{try{onLogin(await api.authenticateGoogle(credential));track('SignUp',{method:'google'})}catch(reason){setError(reason instanceof Error?reason.message:'Sign-in failed')}}});requestAnimationFrame(drawButton)}
    if(window.google?.accounts.id)initialise();else{script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=initialise;document.head.append(script)}
    addEventListener('resize',drawButton)
    return()=>{removeEventListener('resize',drawButton);script?.remove()}
  },[onLogin])
  return <main className="auth-screen"><section className="auth-art"><span>SHORTCLIPR / CREATIVE STUDIO</span><h1>IDEA IN.<br/>FILM OUT.</h1><b>A STORY MACHINE FOR EVERYONE.</b></section><section className="auth-card"><img src="/logo.svg" width="42" height="42" alt=""/><h2>ENTER THE<br/>STUDIO.</h2><p>Sign in to create, track and collect your animated shorts. Your existing ShortClipr Google account stays the same.</p>{error&&<div className="error-banner">{error}</div>}{!apiConfigured&&!demoMode&&<div className="error-banner">This build is missing its API connection. Set VITE_API_URL before release.</div>}<div className="google-slot" ref={googleSlotRef}>{!import.meta.env.VITE_GOOGLE_CLIENT_ID&&<span>Google login becomes available when VITE_GOOGLE_CLIENT_ID is configured.</span>}</div>{demoMode&&<button className="lime-button demo-enter" onClick={()=>onLogin({id:'demo',email:'studio@shortclipr.com',fullName:'Nitish',plan:'free',isAdmin:false})}>Enter local demo <span>↗</span></button>}</section></main>
}

function StudioShell({path,user,credits,children,onSignOut}:{path:string;user:User;credits:CreditBalance;children:ReactNode;onSignOut:()=>void}){
  const [open,setOpen]=useState(false)
  const [accountOpen,setAccountOpen]=useState(false)
  const accountRef=useRef<HTMLDivElement>(null)
  const active=(to:string)=>to==='/studio'?path==='/studio':path.startsWith(to)
  const creditRatio=credits.total?credits.remaining/credits.total*100:0
  const initials=user.fullName.split(' ').map(value=>value[0]).join('').slice(0,2).toUpperCase()
  const closeAccount=()=>setAccountOpen(false)
  const openAccountRoute=(to:string)=>{closeAccount();go(to)}
  const signOut=()=>{api.signOut();window.google?.accounts.id.disableAutoSelect();closeAccount();onSignOut();go('/studio')}
  useEffect(()=>{
    if(!accountOpen)return
    const onPointerDown=(event:PointerEvent)=>{if(accountRef.current&&!accountRef.current.contains(event.target as Node))closeAccount()}
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')closeAccount()}
    document.addEventListener('pointerdown',onPointerDown)
    document.addEventListener('keydown',onKeyDown)
    return()=>{document.removeEventListener('pointerdown',onPointerDown);document.removeEventListener('keydown',onKeyDown)}
  },[accountOpen])
  return <div className="studio-shell"><aside className={`rail ${open?'open':''}`}><div className="rail-head"><a className="wordmark" href="/story-machine/"><img src="/logo.svg" alt=""/><span>ShortClipr<i>.</i></span></a><button className="rail-close" onClick={()=>setOpen(false)} aria-label="Close menu">×</button></div><Link className="new-film" to="/studio/create"><span>+</span> Start a new film</Link><nav className="rail-nav" aria-label="Studio navigation"><p>Control room</p>{navItems.slice(0,4).map(([to,icon,label],index)=><Link key={to} to={to} className={active(to)?'active':''}><span className="nav-mark">{icon}</span>{label}<small>0{index+1}</small></Link>)}<p>Studio account</p>{navItems.slice(4).map(([to,icon,label],index)=><Link key={to} to={to} className={active(to)?'active':''}><span className="nav-mark">{icon}</span>{label}<small>0{index+5}</small></Link>)}</nav><div className="rail-foot"><div className="mini-credit"><span><b>{formatRenderTime(credits.remaining)}</b> render time left</span><i><em style={{width:`${creditRatio}%`}}/></i></div><Link className="profile-button" to="/studio/credits"><span>{initials}</span><b>{user.fullName}</b><small>{user.plan} plan</small><i>→</i></Link></div></aside><div className="workbench"><header className="topbar"><button className="menu-button" onClick={()=>setOpen(true)} aria-label="Open menu">☰</button><div><span className="live-dot"/><b>SHORTCLIPR / CREATIVE STUDIO</b><small>{path.replaceAll('/',' / ').toUpperCase()}</small></div><div className="top-actions"><Link className="search-button" to="/studio/projects"><span aria-hidden="true">⌕</span><span>Find a project</span><kbd>Ctrl K</kbd></Link><Link className="top-credit-link" to="/studio/credits" aria-label={`View render time and plan; ${formatRenderTime(credits.remaining)} remaining`}><b>{formatRenderTime(credits.remaining)}</b><small>render time</small></Link><div className="account-menu" ref={accountRef}><button className="account-trigger" type="button" aria-expanded={accountOpen} aria-haspopup="menu" onClick={()=>setAccountOpen(value=>!value)}><span className="top-avatar">{initials}</span><span className="account-trigger-copy"><b>{user.fullName}</b><small>{user.plan} plan</small></span><span className="account-chevron" aria-hidden="true">⌄</span></button>{accountOpen&&<div className="account-popover" role="menu"><div className="account-popover-head"><span className="account-avatar-large">{initials}</span><div><b>{user.fullName}</b><small>{user.email}</small></div></div><div className="account-plan"><span>Current plan</span><b>{user.plan}</b><small>{formatRenderTime(credits.remaining)} render time remaining</small></div><button type="button" role="menuitem" onClick={()=>openAccountRoute('/studio/credits')}>Plan &amp; render time <span>→</span></button><button type="button" role="menuitem" onClick={()=>openAccountRoute('/studio/create')}>Create a video <span>↗</span></button><button className="sign-out-button" type="button" role="menuitem" onClick={signOut}>Sign out <span>↗</span></button></div>}</div></div></header><main id="studio-main">{children}</main></div></div>
}


function AdminShell({user,children,onSignOut}:{user:User;children:ReactNode;onSignOut:()=>void}){
  const signOut=()=>{api.signOut();window.google?.accounts.id.disableAutoSelect();onSignOut();go('/login')}
  const links=[['#admin-landing','Overview'],['#admin-page-assets','Public page assets'],['#landing-thumbnails','Landing thumbnails'],['#landing-visuals','Landing sections'],['#admin-clip-library','Video library'],['#admin-jobs','Completed jobs'],['#admin-workers','Worker capacity'],['#admin-voices','Voice previews']]
  return <div className="admin-console">
    <aside className="admin-console-sidebar">
      <a className="admin-console-brand" href="/story-machine/"><img src="/logo.svg" alt=""/><span>ShortClipr / OWNER</span></a>
      <div><p className="admin-console-overline">Independent control room</p><p className="admin-console-overline">PUBLIC SITE · MEDIA · OPERATIONS</p></div>
      <nav className="admin-console-nav" aria-label="Admin sections">{links.map(([href,label],index)=><a href={href} key={href}><b>{label}</b><span>0{index+1}</span></a>)}</nav>
      <div className="admin-console-sidebar-foot"><a href="/story-machine/" target="_blank" rel="noreferrer">View public website ↗</a><button type="button" onClick={signOut}>Sign out ↗</button></div>
    </aside>
    <div className="admin-console-main">
      <header className="admin-console-topbar"><div><strong>SHORTCLIPR / OWNER CONSOLE</strong><small>Signed in as {user.fullName} · {user.email}</small></div><div className="admin-console-topbar-actions"><a href="/story-machine/" target="_blank" rel="noreferrer">View site ↗</a><button type="button" onClick={signOut}>Sign out</button></div></header>
      <main className="admin-console-content">{children}</main>
    </div>
  </div>
}

function ProjectRows({projects,limit}:{projects:Project[];limit?:number}){
  const shown=limit?projects.slice(0,limit):projects
  if(!shown.length)return <div className="empty-row">No productions in this view yet.</div>
  return <div className="project-table">{shown.map(project=><article className="project-row" key={project.id} onClick={()=>go(`/studio/projects/${project.id}`)}><div className="project-thumb">{project.clipType.slice(0,2).toUpperCase()}</div><div className="project-title"><b>{project.title}</b><small>{project.clipType}</small></div><div className="project-cell">{project.aspectRatio}<small>{project.durationSeconds} sec</small></div><div className="project-cell">{new Date(project.updatedAt).toLocaleDateString()}<small>Last updated</small></div><div><span className={`status-pill ${project.status}`}>{statusName(project.status)}</span>{project.status!=='complete'&&<div className="progress-track"><i style={{width:`${project.progress}%`}}/></div>}</div><button className="row-more" aria-label="Project actions">•••</button></article>)}</div>
}

function Poster({clip,className='video-poster'}:{clip:ShowcaseClip;className?:string}){
  return <div className={className} style={clip.posterUrl?{backgroundImage:`url(${clip.posterUrl})`}:undefined}><span className="play-mini">▶</span>{!clip.posterUrl&&<b className="poster-generated">{clip.title}</b>}</div>
}

function OverviewPage({projects,credits,showcase}:{projects:Project[];credits:CreditBalance;showcase:ShowcaseClip[]}){
  const ratio=credits.total?credits.remaining/credits.total*100:0
  return <section className="studio-page overview-page"><div className="page-intro overview-intro"><div><p className="kicker">01 / THE CONTROL ROOM</p><h1>GOOD MORNING.<br/><em>WHAT ARE WE MAKING?</em></h1></div><p className="hand-note">Your idea.<br/>Our whole studio. ↙</p></div><div className="command-grid"><article className="quick-create"><div className="panel-label"><span>NEW PRODUCTION</span><small>FINAL OUTPUT ONLY</small></div><h2>PUT AN IDEA<br/>IN MOTION<span>.</span></h2><p>Start with a topic or brief. The studio handles scenes, voice, animation and final assembly.</p><Link className="ink-button" to="/studio/create">Open the creation desk <span>↗</span></Link><div className="orbit-art" aria-hidden="true"><i/><i/><i/><b>60<small>SEC</small></b></div></article><article className="credit-card"><div className="panel-label"><span>RENDER TIME</span><small>{credits.cycleEndsAt?'CURRENT CYCLE':'DEMO ACCOUNT'}</small></div><div className="credit-number"><strong>{formatRenderTime(credits.remaining)}</strong><span>render time<br/>remaining</span></div><div className="credit-meter"><i style={{width:`${ratio}%`}}/></div><div className="credit-split"><span><small>USED</small><b>{formatRenderTime(credits.used)}</b></span><span><small>MONTHLY TOTAL</small><b>{formatRenderTime(credits.total)}</b></span></div><Link to="/studio/credits">See usage & plan <span>→</span></Link></article></div><section className="recent-block"><div className="section-heading"><div><p className="kicker">ON THE EDITING TABLE</p><h2>RECENT PRODUCTIONS.</h2></div><Link to="/studio/projects">View every project <span>↗</span></Link></div><ProjectRows projects={projects} limit={3}/></section><section className="dashboard-pricing"><div className="dashboard-pricing-copy"><p className="kicker">MONTHLY RENDER TIME</p><h2>MAKE ROOM<br/><em>FOR THE NEXT CUT.</em></h2><p>Every plan is a clear monthly render-time allowance. Free includes one 15-second short; paid plans activate through verified secure checkout.</p></div>{paidPlans.map(plan=><article className={plan.featured?'dash-plan-featured':''} key={plan.id}><span>{plan.name.toUpperCase()} / ${plan.price} MONTHLY</span><b>{formatRenderTime(plan.monthlySeconds).toUpperCase()}<br/>RENDER TIME</b><small>{plan.description}</small><Link to="/studio/credits">Choose {plan.name} <i>↗</i></Link></article>)}</section><section className="screening-peek"><div className="screening-copy"><p className="kicker">NOW SCREENING</p><h2>REAL CLIPS.<br/><em>FROM THE STUDIO.</em></h2><p>Published work from the Admin media desk appears here automatically—ready to play, study and share.</p><Link className="paper-button" to="/studio/screening">Enter the screening room <span>↗</span></Link></div><div className="screening-stack">{showcase.slice(0,3).map(clip=><button key={clip.id} className="stack-card" style={clip.posterUrl?{backgroundImage:`url(${clip.posterUrl})`}:undefined}><span>{departmentName(clip.department)} / {clip.aspectRatio}</span><i>▶</i><b>{clip.title}</b></button>)}</div></section></section>
}

function VoicePicker({voices,value,onChange}:{voices:Voice[];value:string;onChange:(voiceId:string)=>void}){
  const [open,setOpen]=useState(false)
  const [playingId,setPlayingId]=useState('')
  const rootRef=useRef<HTMLDivElement>(null)
  const audioRef=useRef<HTMLAudioElement|null>(null)
  const selected=voices.find(voice=>voice.id===value)??voices[0]

  const stopPreview=useCallback(()=>{
    if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0;audioRef.current=null}
    setPlayingId('')
  },[])

  const togglePreview=useCallback(async(voice:Voice)=>{
    if(!voice.previewUrl)return
    if(playingId===voice.id){stopPreview();return}
    stopPreview()
    const audio=new Audio(voice.previewUrl)
    audioRef.current=audio
    setPlayingId(voice.id)
    audio.onended=()=>{audioRef.current=null;setPlayingId('')}
    audio.onerror=()=>{audioRef.current=null;setPlayingId('')}
    try{await audio.play()}catch{audioRef.current=null;setPlayingId('')}
  },[playingId,stopPreview])

  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(rootRef.current&&!rootRef.current.contains(event.target as Node))setOpen(false)}
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    document.addEventListener('pointerdown',close)
    document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)}
  },[])
  useEffect(()=>()=>{audioRef.current?.pause()},[])

  return <fieldset className="voice-picker-field"><legend>Narration voice</legend><div className={`voice-picker ${open?'open':''}`} ref={rootRef}><div className="voice-picker-control"><button type="button" className="voice-picker-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen(current=>!current)}><span><b>{selected?.name??'Choose a voice'}</b><small>{selected?.description??selected?.language??'Select from the voice library'}</small></span><i aria-hidden="true">⌄</i></button>{selected?.previewUrl&&<button type="button" className={`voice-selected-play ${playingId===selected.id?'playing':''}`} onClick={()=>togglePreview(selected)} aria-label={`${playingId===selected.id?'Stop':'Preview'} ${selected.name}`}>{playingId===selected.id?'■':'▶'}</button>}</div>{open&&<div className="voice-options" role="listbox" aria-label="Narration voices">{voices.map(voice=><div className={`voice-option ${voice.id===selected?.id?'selected':''}`} role="option" aria-selected={voice.id===selected?.id} key={voice.id}><button type="button" className="voice-option-select" onClick={()=>{onChange(voice.id);setOpen(false)}}><b>{voice.name}</b><small>{voice.description||voice.language}</small></button><button type="button" className={`voice-option-play ${playingId===voice.id?'playing':''}`} onClick={()=>togglePreview(voice)} disabled={!voice.previewUrl} aria-label={voice.previewUrl?`${playingId===voice.id?'Stop':'Preview'} ${voice.name}`:`Preview unavailable for ${voice.name}`} title={voice.previewUrl?'Play voice preview':'Preview not generated yet'}>{voice.previewUrl?(playingId===voice.id?'■':'▶'):'—'}</button></div>)}</div>}</div></fieldset>
}

function CreatePage({voices,credits,user,onCreated}:{voices:Voice[];credits:CreditBalance;user:User;onCreated:(project:Project)=>void}){
  const [brief,setBrief]=useState(()=>sessionStorage.getItem('shortclipr.pendingBrief')??'');const [department,setDepartment]=useState<Department>('learn');const [clipType,setClipType]=useState('Animated explainer');const [language,setLanguage]=useState('English (US)');const [voiceId,setVoiceId]=useState('scarlett');const [style,setStyle]=useState('AI Auto');const [duration,setDuration]=useState(30);const [aspect,setAspect]=useState<AspectRatio>('9:16');const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const isFreePlan=user.plan.toLowerCase()==='free';const durationOptions=[15,30,45,60];const visibleTypes=clipTypes.filter(type=>type.department===department);const cost=estimateCredits(clipType,duration,style);const visibleVoices=voices.filter(voice=>voice.language===language);const languages=[...new Set(voices.map(voice=>voice.language))]
  useEffect(()=>{if(!visibleTypes.some(type=>type.name===clipType))setClipType(visibleTypes[0].name)},[department,clipType,visibleTypes])
  useEffect(()=>{if(!visibleVoices.some(voice=>voice.id===voiceId)&&visibleVoices[0])setVoiceId(visibleVoices[0].id)},[language,voiceId,visibleVoices])
  useEffect(()=>{if(isFreePlan&&duration!==15)setDuration(15)},[duration,isFreePlan])
  const needsUpgrade=(!isFreePlan&&user.subscriptionStatus!==undefined&&user.subscriptionStatus!=='active')||credits.remaining<cost
  async function submit(event:FormEvent){event.preventDefault();setError('');if(needsUpgrade){sessionStorage.setItem('shortclipr.pendingBrief',brief);go('/studio/credits?intent=create');return}setBusy(true);try{const input:CreateProjectInput={brief,clipType,department,language,voiceId,visualStyle:style,durationSeconds:duration,aspectRatio:aspect};const project=await api.createProject(input);sessionStorage.removeItem('shortclipr.pendingBrief');track('CreateProject',{clipType,duration,aspect});onCreated(project);go(`/studio/projects/${project.id}`)}catch(reason){if(reason instanceof Error&&/(credits|render time|plan|402)/i.test(reason.message)){sessionStorage.setItem('shortclipr.pendingBrief',brief);go('/studio/credits?intent=create')}else setError(reason instanceof Error?reason.message:'Could not start production')}finally{setBusy(false)}}
  return (
    <section className="studio-page create-page">
      <div className="page-intro create-intro"><div><p className="kicker">02 / THE CREATION DESK</p><h1>ONE BRIEF.<br/><em>ONE FINISHED FILM.</em></h1></div><p>No storyboards to approve. No timeline to edit. Choose the direction and receive the final output.</p></div>
      {error&&<div className="error-banner">{error}</div>}
      <form className="creation-form" onSubmit={submit}>
        <section className="brief-panel numbered-panel"><span className="panel-number">01</span><div className="form-heading"><p className="kicker">THE SPARK</p><h2>WHAT SHOULD<br/>THE FILM SAY?</h2></div><label className="brief-field"><span>Topic or creative brief</span><textarea required maxLength={1600} value={brief} onChange={event=>setBrief(event.target.value)} placeholder="Example: Explain why the moon sometimes appears during the day. Make it curious, cinematic and easy to understand."/><small>{brief.length.toLocaleString()} / 1,600</small></label></section>
        <section className="library-panel numbered-panel"><span className="panel-number">02</span><div className="form-heading"><p className="kicker">THE STORY LIBRARY</p><h2>WHAT KIND<br/>OF SHORT?</h2><p>16 production types, arranged as three studio departments.</p></div><div className="library-tabs">{(Object.keys(departmentCopy) as Department[]).map(key=><button type="button" key={key} data-library={key} aria-selected={department===key} onClick={()=>setDepartment(key)}><span>{departmentCopy[key].index}</span><b>{departmentCopy[key].title}</b><small>{departmentCopy[key].subtitle}</small></button>)}</div><div className="type-grid">{visibleTypes.map((type,index)=><button type="button" key={type.name} className={`type-card ${clipType===type.name?'selected':''}`} onClick={()=>setClipType(type.name)}><img className="clip-type-art" src={type.image} alt="" aria-hidden="true" loading="lazy"/><span>{String(index+1).padStart(2,'0')} / {department.toUpperCase()}</span><b>{type.name}</b><small>{type.description}</small></button>)}</div></section>
        <section className="direction-panel numbered-panel">
          <span className="panel-number">03</span><div className="form-heading"><p className="kicker">THE DIRECTION</p><h2>SET THE<br/>CREATIVE RULES.</h2></div>
          <div className="direction-grid">
            <fieldset><legend>Voice language</legend><select value={language} onChange={event=>setLanguage(event.target.value)}>{languages.map(value=><option key={value}>{value}</option>)}</select></fieldset>
            <VoicePicker voices={visibleVoices} value={voiceId} onChange={setVoiceId}/>
            <fieldset className="style-field"><legend>Visual direction</legend><div className="choice-row">{['AI Auto','Editorial','Cinematic','Diagrammatic','Paper craft'].map(value=><button type="button" key={value} className={`choice ${style===value?'active':''}`} onClick={()=>setStyle(value)}>{value==='AI Auto'?'✦ ':''}{value}</button>)}</div></fieldset>
            <fieldset><legend>Duration</legend><div className="choice-row duration-choices">{durationOptions.map(value=>{const locked=isFreePlan&&value!==15;return <span className={`duration-choice ${locked?'locked':''}`} key={value} title={locked?`Upgrade plan to unlock ${value}-second shorts`:undefined}><button type="button" className={`choice ${duration===value?'active':''}`} onClick={()=>setDuration(value)} disabled={locked} aria-describedby={locked?`duration-upgrade-${value}`:undefined}>{locked&&<i className="duration-lock" aria-hidden="true">🔒</i>}{value} sec</button>{locked&&<span className="duration-tooltip" id={`duration-upgrade-${value}`} role="tooltip">Upgrade plan to unlock {value}-second shorts.</span>}</span>})}</div>{isFreePlan&&<small className="free-duration-note">Free includes one finished 15-second short each month. Hover a locked duration to see the upgrade cue.</small>}</fieldset>
            <fieldset><legend>Frame</legend><div className="choice-row frame-choices">{(['9:16','1:1','16:9'] as AspectRatio[]).map(value=><button type="button" key={value} className={`choice ${aspect===value?'active':''}`} onClick={()=>setAspect(value)}><i className={`frame ${value==='9:16'?'vertical':value==='1:1'?'square':'wide'}`}/>{value}</button>)}</div></fieldset>
          </div>
        </section>
        <section className="launch-panel"><div><p className="kicker">READY FOR PRODUCTION</p><h2>THE STUDIO TAKES IT<br/>FROM HERE<span>.</span></h2><p>Scene planning, narration, animation, sound and final assembly happen behind the screen.</p></div><div className="launch-ticket"><span>ESTIMATED RENDER TIME</span><strong>{formatRenderTime(cost).toUpperCase()}</strong><small>Reserved before production; unused time is released if production is cancelled.</small><button className="lime-button" disabled={busy}>{busy?'Sending to studio…':needsUpgrade?'Choose a plan':'Create final video'} <span>↗</span></button></div></section>
      </form>
    </section>
  )
}

function ProjectsPage({projects}:{projects:Project[]}){
  const [filter,setFilter]=useState('all');const [search,setSearch]=useState('');const filtered=projects.filter(project=>(filter==='all'||(filter==='in-production'?['queued','planning','rendering'].includes(project.status):project.status===filter))&&`${project.title} ${project.clipType}`.toLowerCase().includes(search.toLowerCase()))
  return <section className="studio-page projects-page"><div className="page-intro"><div><p className="kicker">03 / THE PRODUCTION ARCHIVE</p><h1>EVERY FILM.<br/><em>ONE PLACE.</em></h1></div><Link className="lime-button compact" to="/studio/create">+ New production</Link></div><div className="project-toolbar"><div className="filter-row">{[['all','All'],['in-production','In production'],['complete','Complete'],['failed','Needs attention']].map(([value,label])=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><label><span>⌕</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search the archive"/></label></div><ProjectRows projects={filtered}/></section>
}

function ProjectPage({project,onUpdated}:{project?:Project;onUpdated:()=>Promise<void>}){
  const [downloadBusy,setDownloadBusy]=useState(false)
  const [mediaUrl,setMediaUrl]=useState<string>()
  useEffect(()=>{
    let active=true;let objectUrl=''
    setMediaUrl(undefined)
    if(!project?.outputUrl)return()=>{}
    void api.projectMedia(project.id).then(url=>{objectUrl=url;if(active)setMediaUrl(url)}).catch(()=>{})
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[project?.id,project?.outputUrl])
  if(!project)return <section className="studio-page"><div className="error-banner">This production could not be found.</div><Link to="/studio/projects">← Back to projects</Link></section>
  const cancellable=['queued','planning','rendering'].includes(project.status)
  const cancel=async()=>{if(confirm('Cancel this production and release its reserved render time?')){try{await api.cancelProject(project.id);await onUpdated()}catch(reason){alert(reason instanceof Error?reason.message:'Could not cancel production')}}}
  const download=async()=>{setDownloadBusy(true);try{const url=await api.projectMedia(project.id,true);if(!url)throw new Error('A download link could not be prepared');const anchor=document.createElement('a');anchor.href=url;anchor.download=`${project.title}.mp4`;document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(reason){alert(reason instanceof Error?reason.message:'Could not prepare the final download')}finally{setDownloadBusy(false)}}
  return <section className="studio-page"><div className="page-intro project-detail-intro"><div><p className="kicker">PRODUCTION / {project.id.slice(0,8).toUpperCase()}</p><h1 className="project-detail-title">{project.title.toUpperCase()}<em>.</em></h1></div><Link className="topbar-back" to="/studio/projects">← Production archive</Link></div><div className="project-detail-grid"><div className={`project-stage project-stage-${project.status}`} data-aspect-ratio={project.aspectRatio}>{project.outputUrl?(mediaUrl?<div className="project-video-shell"><video controls playsInline preload="metadata" src={mediaUrl}/></div>:<span>LOADING<br/><small>FINAL VIDEO</small></span>):<><div className="project-stage-orb" aria-hidden="true"><i/><i/><i/></div><span>{project.progress}%<br/><small>{statusName(project.status)}</small></span></>}</div><aside className="project-aside"><p className="kicker">PRODUCTION TICKET</p><h2>{statusName(project.status).toUpperCase()}.</h2><div className="big-meter"><i style={{width:`${project.progress}%`}}/></div><dl><div><dt>TYPE</dt><dd>{project.clipType}</dd></div><div><dt>FRAME</dt><dd>{project.aspectRatio}</dd></div><div><dt>DURATION</dt><dd>{project.durationSeconds}s</dd></div><div><dt>VOICE</dt><dd>{project.voiceId}</dd></div><div><dt>STYLE</dt><dd>{project.visualStyle}</dd></div><div><dt>RESERVED TIME</dt><dd>{formatRenderTime(project.creditsReserved)}</dd></div></dl><p>{project.status==='complete'?'Your finished video is ready to watch and download.':'The final video appears here after planning, animation, narration and quality checks complete.'}</p>{project.outputUrl&&<button type="button" className="ink-button project-download" disabled={downloadBusy} onClick={download}>{downloadBusy?'Preparing download…':'Download final MP4'} <span>↓</span></button>}{cancellable&&<button className="cancel-production" onClick={cancel}>Cancel production</button>}</aside></div></section>
}

function ScreeningPage({clips}:{clips:ShowcaseClip[]}){
  const published=clips.filter(clip=>clip.published);const featured=published.find(clip=>clip.featured)??published[0]
  return <section className="studio-page screening-page"><div className="page-intro screening-intro"><div><p className="kicker">04 / THE SCREENING ROOM</p><h1>WATCH WHAT<br/><em>THE STUDIO CAN DO.</em></h1></div><p>Real exported clips live here. Admin curates the shelves without a code change.</p></div>{featured?<><section className="premiere-stage"><Poster clip={featured} className="premiere-visual"/><div className="premiere-info"><span>STUDIO PREMIERE / {featured.aspectRatio}</span><h2>{featured.title}</h2><p>{featured.description}</p><div className="premiere-meta"><span>{departmentName(featured.department).toUpperCase()}</span><span>REAL UPLOAD</span></div></div></section><section className="reel-section"><div className="section-heading"><div><p className="kicker">FRESH OUT OF THE STUDIO</p><h2>THE LATEST CUTS.</h2></div><span className="hand-note">Press play. Stay curious. ↘</span></div><div className="video-rail">{published.map(clip=><button className="video-card" key={clip.id} onClick={()=>clip.videoUrl&&window.open(clip.videoUrl,'_blank')}><Poster clip={clip}/><div><b>{clip.title}</b><small>{departmentName(clip.department).toUpperCase()} · {clip.aspectRatio}</small></div></button>)}</div></section></>:<div className="screening-empty"><h2>THE ROOM IS READY.</h2><p>Publish the first real clip from Admin.</p></div>}<section className="reel-section"><div className="section-heading"><div><p className="kicker">BROWSE BY DEPARTMENT</p><h2>THREE WAYS IN.</h2></div></div><div className="department-shelves">{(Object.keys(departmentCopy) as Department[]).map(key=><article className="department-card" key={key}><span>{departmentCopy[key].index} / {published.filter(clip=>clip.department===key).length} PUBLISHED</span><h3>{departmentCopy[key].title.toUpperCase()}</h3><p>{departmentCopy[key].subtitle}</p><b>{departmentCopy[key].index}</b></article>)}</div></section></section>
}

function CreditsPage({credits,projects,user,onUpdated}:{credits:CreditBalance;projects:Project[];user:User;onUpdated:()=>Promise<void>}){
  const usedPercent=credits.total?Math.min(100,Math.max(0,credits.used/credits.total*100)):0
  const pendingBrief=sessionStorage.getItem('shortclipr.pendingBrief')
  const [billingBusy,setBillingBusy]=useState(false)
  const [billingNotice,setBillingNotice]=useState('')
  const hasManagedSubscription=user.plan!=='free'&&user.subscriptionStatus==='active'
  const currentPlan=allPlans.find(plan=>plan.id===user.plan)
  const recentProjects=[...projects].filter(project=>project.status!=='draft').sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,5)
  const checkout=async(plan:PaidPlanId)=>{setBillingBusy(true);try{track('InitiateCheckout',{plan});await api.checkout(plan)}catch(reason){alert(reason instanceof Error?reason.message:'Checkout could not start');setBillingBusy(false)}}
  const manageBilling=async()=>{setBillingBusy(true);try{track('BillingPortalOpen',{plan:user.plan});await api.billingPortal()}catch(reason){alert(reason instanceof Error?reason.message:'Billing portal could not open');setBillingBusy(false)}}
  useEffect(()=>{
    const outcome=new URLSearchParams(location.search).get('checkout')
    if(outcome==='cancelled'){setBillingNotice('Checkout was cancelled. Your plan and render time were not changed.');return}
    if(outcome!=='returned')return
    const sessionId=sessionStorage.getItem('shortclipr.checkoutSession')
    if(!sessionId){setBillingNotice('Payment returned successfully. Waiting for secure billing confirmation.');void onUpdated();return}
    let stopped=false;let timer=0;let attempts=0
    const poll=async()=>{if(stopped)return;attempts+=1;try{const state=await api.checkoutStatus(sessionId);if(state.status==='completed'){sessionStorage.removeItem('shortclipr.checkoutSession');setBillingNotice('Payment confirmed. Your plan and render time are ready.');await onUpdated();return}if(state.status==='failed'){sessionStorage.removeItem('shortclipr.checkoutSession');setBillingNotice('Payment was not completed. No plan change was applied.');return}}catch{/* A webhook can briefly arrive after the browser return. */}if(attempts<12)timer=window.setTimeout(()=>void poll(),2500);else setBillingNotice('Payment is still being verified. Refresh this page shortly; credits activate only after secure confirmation.')}
    setBillingNotice('Securely confirming your payment…');void poll()
    return()=>{stopped=true;window.clearTimeout(timer)}
  },[onUpdated])
  return <section className="studio-page credits-page">
    <div className="page-intro credits-intro"><div><p className="kicker">STUDIO ACCOUNT</p><h1>Render time<br/><em>& plan.</em></h1></div><p>See what you have available, then choose the plan that fits the shorts you want to make.</p></div>
    {pendingBrief&&<div className="upgrade-brief"><span>YOUR IDEA IS SAVED</span><b>Choose a plan to make your short.</b><Link to="/studio/create">Return to my brief ↗</Link></div>}
    {billingNotice&&<div className="billing-notice" role="status">{billingNotice}</div>}
    <section className="render-balance" aria-label="Render time balance"><div className="render-balance-main"><div className="render-balance-top"><span>CURRENT PLAN</span><b>{currentPlan?.name??user.plan}{user.plan!=='free'&&!hasManagedSubscription?' · awaiting activation':''}</b></div><p>Available to create</p><strong>{formatRenderTime(credits.remaining)}</strong><span className="render-balance-unit">render time remaining</span><div className="render-balance-meter" role="progressbar" aria-label="Render time used or reserved" aria-valuemin={0} aria-valuemax={credits.total} aria-valuenow={credits.used}><i style={{width:`${usedPercent}%`}}/></div><div className="render-balance-foot"><span>{formatRenderTime(credits.used)} used or reserved</span><span>{formatRenderTime(credits.total)} total</span></div></div><div className="render-balance-side"><div><span>THIS CYCLE</span><b>{credits.cycleEndsAt?`Cycle ends ${new Date(credits.cycleEndsAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`:'Monthly allowance'}</b><p>Time for an active job is reserved until the short finishes or is released.</p></div>{hasManagedSubscription?<button type="button" onClick={manageBilling} disabled={billingBusy}>{billingBusy?'Opening billing…':'Manage subscription'} <span>↗</span></button>:<Link to="/studio/create">Create a short <span>↗</span></Link>}</div></section>
    {user.plan!=='free'&&!hasManagedSubscription&&<p className="render-activation-note">Your paid render time appears after payment confirmation. You can choose a plan below if your previous checkout did not finish.</p>}
    <section className="render-plans" aria-labelledby="render-plans-title"><div className="render-section-heading"><div><p className="kicker">MONTHLY PLANS</p><h2 id="render-plans-title">Find your pace.</h2></div><p>One 15-second short on Free. Paid plans unlock 15, 30, 45 and 60-second shorts in every supported format.</p></div><div className="render-plan-grid">{allPlans.map(plan=>{const current=user.plan===plan.id&&(plan.id==='free'||hasManagedSubscription);const selectPlan=()=>{if(plan.id==='free')return;return hasManagedSubscription?manageBilling():checkout(plan.id)};return <article className={`render-plan ${plan.featured?'render-plan-featured':''} ${current?'render-plan-current':''}`} key={plan.id}><div className="render-plan-top"><h3>{plan.name}</h3>{current&&<span>Current plan</span>}</div><div className="render-plan-price"><strong>${plan.price}</strong><span>/ month</span></div><div className="render-plan-allowance"><b>{plan.id==='free'?'One 15-second short':formatRenderTime(plan.monthlySeconds)}</b><span>{plan.id==='free'?'each month':'of render time each month'}</span></div><p>{plan.id==='free'?'Try one finished short with a voice and visual style.':plan.description}</p>{plan.id==='free'?<span className="render-plan-static">{current?'Your plan today':'Free tier'}</span>:<button type="button" disabled={billingBusy||current} onClick={selectPlan}>{current?'Your plan today':hasManagedSubscription?'Change in billing portal':`Choose ${plan.name}`} <span>↗</span></button>}</article>})}</div><p className="render-plan-note">Paid plans activate after secure checkout is confirmed. Existing subscribers change plans in the billing portal.</p></section>
    <section className="render-activity" aria-labelledby="render-activity-title"><div className="render-section-heading"><div><p className="kicker">YOUR PRODUCTIONS</p><h2 id="render-activity-title">Recent activity.</h2></div><p>Time is reserved when production starts. Cancelled or failed jobs release their reservation.</p></div><div className="render-activity-list">{recentProjects.length?recentProjects.map(project=>{const released=project.status==='cancelled'||project.status==='failed';return <Link to={`/studio/projects/${project.id}`} className="render-activity-row" key={project.id}><div className="render-activity-title"><b>{project.title}</b><small>{new Date(project.createdAt).toLocaleDateString()} · {project.clipType}</small></div><span className={`render-activity-status ${project.status}`}>{released?'Released':statusName(project.status)}</span><strong>{released?'No time charged':formatRenderTime(project.creditsReserved)}</strong><span aria-hidden="true">↗</span></Link>}):<div className="render-activity-empty">No productions yet. <Link to="/studio/create">Create your first short ↗</Link></div>}</div></section>
  </section>
}

type LandingPlacementInfo = {slot:LandingMediaSlot;number:string;section?:string;title:string;description:string;recommendation:string;thumbnailIndex?:number;imageOnly?:boolean;previewPosition?:string;fallbackUrl?:string}
function landingPlacementUrl(slot:LandingMediaSlot){
  if(slot.startsWith('landing_thumbnail_'))return '/story-machine/#live-reel'
  if(slot.startsWith('collection_'))return `/story-machine/?collection=${slot.split('_')[1]}#collection`
  if(slot==='screening_side'||slot==='screening_feature')return '/story-machine/#process'
  return '/story-machine/#top'
}
function landingSectionId(section:string){return `admin-${section.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')}`}
const landingPlacementInfo: LandingPlacementInfo[] = [
  {slot:'landing_hero_background',number:'01',section:'Hero',title:'Hero atmosphere',description:'A quiet image or loop behind the headline and machine. Keep the typography readable.',recommendation:'Wide 16:9 or larger · image or muted video'},
  {slot:'landing_hero_machine',number:'02',section:'Hero',title:'Story Machine artwork',description:'The main machine illustration beside the headline.',recommendation:'Transparent PNG or WebP · image only',imageOnly:true},
  {slot:'screening_side',number:'03',section:'Product preview',title:'Visual direction swatch',description:'The style image beside the creation settings in the landing product workspace.',recommendation:'Square image or quiet loop'},
  {slot:'screening_feature',number:'04',section:'Product preview',title:'Finished short example',description:'The video output in the landing product workspace. Use an actual finished video when available.',recommendation:'Portrait 9:16 · image or video'},
  {slot:'collection_learn_1',number:'05',section:'Clip types · Learn',title:'Explainer visual',description:'First image in the Learn tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'0% 0%'},
  {slot:'collection_learn_2',number:'06',section:'Clip types · Learn',title:'History visual',description:'Second image in the Learn tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'50% 0%'},
  {slot:'collection_learn_3',number:'07',section:'Clip types · Learn',title:'Geography visual',description:'Third image in the Learn tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'100% 0%'},
  {slot:'collection_story_1',number:'08',section:'Clip types · Story',title:'Mini story visual',description:'First image in the Story tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'0% 50%'},
  {slot:'collection_story_2',number:'09',section:'Clip types · Story',title:'Mystery visual',description:'Second image in the Story tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'50% 50%'},
  {slot:'collection_story_3',number:'10',section:'Clip types · Story',title:'Horror short visual',description:'Third image in the Story tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'100% 50%'},
  {slot:'collection_engage_1',number:'11',section:'Clip types · Engage',title:'Visual quiz image',description:'First image in the Engage tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'0% 100%'},
  {slot:'collection_engage_2',number:'12',section:'Clip types · Engage',title:'What-if image',description:'Second image in the Engage tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'50% 100%'},
  {slot:'collection_engage_3',number:'13',section:'Clip types · Engage',title:'Transformation image',description:'Third image in the Engage tab.',recommendation:'Landscape 4:3 · image only',imageOnly:true,previewPosition:'100% 100%'}
]
const landingThumbnailInfo: LandingPlacementInfo[] = [
  {slot:'landing_thumbnail_1',number:'01',title:'Thumbnail 1 · Explainers',description:'First in the strip. Uses the animated explainer visual by default.',recommendation:'Portrait 9:16 · JPG, PNG or WebP',thumbnailIndex:0,fallbackUrl:'/seo-assets/animated-explainer-v2.png'},
  {slot:'landing_thumbnail_2',number:'02',title:'Thumbnail 2 · Faceless',description:'Second in the strip. Uses the faceless shorts visual by default.',recommendation:'Portrait 9:16 · JPG, PNG or WebP',thumbnailIndex:1,fallbackUrl:'/seo-assets/faceless-shorts-v2.png'},
  {slot:'landing_thumbnail_3',number:'03',title:'Thumbnail 3 · Stories',description:'Third in the strip. Uses the animated story visual by default.',recommendation:'Portrait 9:16 · JPG, PNG or WebP',thumbnailIndex:2,fallbackUrl:'/seo-assets/animated-story-v2.png'},
  {slot:'landing_thumbnail_4',number:'04',title:'Thumbnail 4 · History',description:'Fourth in the strip. Uses the history visual by default.',recommendation:'Portrait 9:16 · JPG, PNG or WebP',thumbnailIndex:3,fallbackUrl:'/seo-assets/history-clip.png'},
  {slot:'landing_thumbnail_5',number:'05',title:'Thumbnail 5 · Quizzes',description:'Fifth in the strip. Uses the visual quiz artwork by default.',recommendation:'Portrait 9:16 · JPG, PNG or WebP',thumbnailIndex:4,fallbackUrl:'/seo-assets/video-quiz-v2.png'},
  {slot:'landing_thumbnail_6',number:'06',title:'Thumbnail 6 · Social shorts',description:'Sixth in the strip. Uses the animated social video visual by default.',recommendation:'Portrait 9:16 · JPG, PNG or WebP',thumbnailIndex:5,fallbackUrl:'/seo-assets/animated-tiktok-v2.png'},
]

function LandingMediaAdmin({thumbnails=false}:{thumbnails?:boolean}){
  const [assets,setAssets]=useState<LandingMedia[]>([])
  const [busySlot,setBusySlot]=useState<LandingMediaSlot>()
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const load=useCallback(()=>api.landingMedia(true).then(setAssets),[])
  useEffect(()=>{void load().catch(reason=>setError(reason instanceof Error?reason.message:'Could not load landing placements'))},[load])
  const save=async(event:FormEvent<HTMLFormElement>,slot:LandingMediaSlot)=>{
    event.preventDefault();setBusySlot(slot);setError('');setSuccess('')
    try{
      const form=event.currentTarget
      await api.uploadLandingMedia(new FormData(form))
      form.reset();await load()
      setSuccess(demoMode?'Saved in this browser. Open the landing page to see the updated image.':'Saved. The landing page will show your image when refreshed.')
      track('AdminLandingMediaUpload',{slot})
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not place media')}
    finally{setBusySlot(undefined)}
  }
  const remove=async(slot:LandingMediaSlot)=>{
    if(!confirm('Restore the generated placeholder for this placement?'))return
    setBusySlot(slot);setError('');setSuccess('')
    try{await api.deleteLandingMedia(slot);await load();setSuccess('Generated placeholder restored.')}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not restore the placeholder')}
    finally{setBusySlot(undefined)}
  }
  const placements=thumbnails?landingThumbnailInfo:landingPlacementInfo
  return <section id={thumbnails?'landing-thumbnails':'landing-visuals'} className={`landing-media-admin ${thumbnails?'landing-thumbnails-admin':''}`}>
    <div className="landing-media-intro">
      <div><p className="kicker">{thumbnails?'LANDING PAGE / SIX THUMBNAILS':'LANDING PAGE / SECTION MEDIA'}</p><h2>{thumbnails?<>YOUR IMAGES.<br/><em>IN THEIR PLACE.</em></>:<>EVERY IMAGE.<br/><em>IN ITS PLACE.</em></>}</h2></div>
      <div><p>{thumbnails?'Upload each image into its numbered position below the AI workflow. Replace one at a time; the other images stay in place. Generated artwork remains until you upload a replacement.':'The controls follow the public page: hero, product preview, then clip types. Each visual can be replaced independently.'}</p><a className="placement-preview-link" href={thumbnails?'/story-machine/#live-reel':'/story-machine/#process'} target="_blank" rel="noopener">Open landing page ↗</a>{demoMode&&<small className="placement-demo-note">Local preview: images are saved in this browser only.</small>}</div>
    </div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    {success&&<p className="placement-success" role="status">{success}</p>}
    <div className="landing-placement-grid">{placements.map((info,index)=>{
      const asset=assets.find(item=>item.slot===info.slot)
      return <Fragment key={info.slot}>{!thumbnails&&(index===0||placements[index-1].section!==info.section)&&<h3 id={landingSectionId(info.section||'')} className="placement-group-title">{info.section}</h3>}<article id={`admin-slot-${info.slot}`} className="landing-placement-card">
        <div className="placement-heading"><span>{thumbnails?`${info.number} / THUMBNAIL POSITION`:info.section?.toUpperCase()}</span><b>{info.title}</b><p>{info.description}</p><small>{info.recommendation}</small><div className="placement-location"><span className={asset?'is-uploaded':''}>{asset?'Uploaded':'Using default'}</span><a href={landingPlacementUrl(info.slot)} target="_blank" rel="noopener">View on landing ↗</a></div></div>
        {thumbnails?<div className="thumbnail-slot-preview" style={asset?{backgroundPosition:`${(info.thumbnailIndex??0)*20}% center`}:{backgroundImage:`url('${info.fallbackUrl}')`,backgroundSize:'cover',backgroundPosition:'center'}}>{asset&&<img src={asset.mediaUrl} alt={asset.title}/>}<span>{asset?'Your uploaded image':'Mapped project image'}</span></div>:asset?<div className="placement-preview">{asset.mediaKind==='video'?<video muted controls preload="metadata" src={asset.mediaUrl}/>:<img src={asset.mediaUrl} alt={asset.title}/>}<div><b>{asset.title}</b><small>{asset.caption||'No caption'}</small></div></div>:info.slot==='landing_hero_background'?<div className="placement-fallback hero-fallback"><b>A STORY<br/>MACHINE</b><span>Ivory hero background · no upload yet</span></div>:info.slot==='screening_side'?<div className="placement-fallback swatch-fallback"><span>VISUAL DIRECTION</span><b>Editorial motion</b></div>:info.slot==='screening_feature'?<div className="placement-fallback output-fallback"><div><span>ILLUSTRATIVE CONCEPT</span><b>A PLACE<br/>REIMAGINED.</b></div><small>Finished short preview</small></div>:<div className={`editorial-slot-preview ${info.slot==='landing_hero_machine'?'machine-preview':''}`} style={info.previewPosition?{backgroundPosition:info.previewPosition}:undefined}>{info.slot==='landing_hero_machine'&&<img src="/story-machine/assets/story-machine-clean.png" alt="Default machine artwork"/>}<span>Generated default</span></div>}
        <details className="placement-editor"><summary>{asset?'Replace media':'Upload media'} <span>↗</span></summary><form key={`${info.slot}:${asset?.mediaUrl??'default'}`} onSubmit={event=>save(event,info.slot)}>
          <input type="hidden" name="slot" value={info.slot}/>
          <label>{thumbnails?'Image description':'Title'}<input required name="title" maxLength={100} defaultValue={asset?.title|| (thumbnails?info.title.split(' · ')[1]:info.title)} placeholder={thumbnails?'Describe your image':'Describe the visual'}/></label>
          <label>{thumbnails?'Small label on the card':'Caption'}<input name="caption" maxLength={thumbnails?40:220} defaultValue={asset?.caption|| (thumbnails?info.title.split(' · ')[1].toUpperCase():'')} placeholder="Optional caption"/></label>
          <label className="placement-file"><span>▧</span><b>{asset?'Replace':'Upload'} {thumbnails||info.imageOnly?'image':'image or video'}</b><small>{thumbnails||info.imageOnly?'JPG, PNG or WebP':'MP4, MOV, WebM, JPG, PNG or WebP'} · 50 MB maximum</small><input name="media" type="file" accept={thumbnails||info.imageOnly?'image/jpeg,image/png,image/webp':'video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp'} required/></label>
          <div className="placement-actions"><button className="lime-button" disabled={Boolean(busySlot)}>{busySlot===info.slot?'Saving…':asset?'Replace media':thumbnails?'Save thumbnail':'Save placement'} <span>↗</span></button>{asset&&<button className="placement-remove" type="button" disabled={Boolean(busySlot)} onClick={()=>remove(info.slot)}>Restore default</button>}</div>
        </form></details>
      </article></Fragment>
    })}</div>
    <p className="landing-media-footnote">{thumbnails?'These six images stay in their own strip. Curated videos appear separately and never replace your uploaded thumbnails.':'The actual finished video reel is managed in the clip library below. Mark a film Landing reel to show it publicly.'}</p>
  </section>
}


type PublicMediaManifestItem={slot:string;title:string;defaultUrl:string;mediaKind:'image'|'video';pages:string[]}
function PublicSiteMediaAdmin(){
  const [manifest,setManifest]=useState<PublicMediaManifestItem[]>([])
  const [assets,setAssets]=useState<LandingMedia[]>([])
  const [busySlot,setBusySlot]=useState<string>()
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [filter,setFilter]=useState('')
  const [pageFilter,setPageFilter]=useState('')
  const [historySlot,setHistorySlot]=useState<string>()
  const [history,setHistory]=useState<LandingMediaRevision[]>([])
  const [historyBusy,setHistoryBusy]=useState(false)
  const load=useCallback(async()=>{
    const [manifestResponse,nextAssets]=await Promise.all([fetch('/site-media-manifest.json'),api.landingMedia(true)])
    if(!manifestResponse.ok)throw new Error('The public media manifest is not available in this build')
    setManifest(await manifestResponse.json() as PublicMediaManifestItem[])
    setAssets(nextAssets)
  },[])
  useEffect(()=>{void load().catch(reason=>setError(reason instanceof Error?reason.message:'Could not load public media assets'))},[load])
  const save=async(event:FormEvent<HTMLFormElement>,slot:string)=>{
    event.preventDefault();const form=event.currentTarget;setBusySlot(slot);setError('');setSuccess('')
    try{await api.uploadLandingMedia(new FormData(form));await load();form.reset();setSuccess('Asset replaced. Every public page using this asset key will use the new upload on refresh.')}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not replace public asset')}
    finally{setBusySlot(undefined)}
  }
  const restore=async(slot:string)=>{
    if(!confirm('Remove this upload and restore the built-in artwork everywhere it is used?'))return
    setBusySlot(slot);setError('');setSuccess('')
    try{await api.deleteLandingMedia(slot);await load();setSuccess('Default artwork restored.')}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not restore default artwork')}
    finally{setBusySlot(undefined)}
  }
  const pages=[...new Set(manifest.flatMap(item=>item.pages))].sort()
  const visible=manifest.filter(item=>`${item.title} ${item.slot} ${item.pages.join(' ')}`.toLowerCase().includes(filter.toLowerCase())&&(!pageFilter||item.pages.includes(pageFilter)))
  const showHistory=async(slot:string)=>{
    setHistorySlot(slot);setHistoryBusy(true);setError('')
    try{setHistory(await api.landingMediaHistory(slot))}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not load replacement history')}
    finally{setHistoryBusy(false)}
  }
  const restoreRevision=async(revision:LandingMediaRevision)=>{
    if(!historySlot||!confirm(`Restore "${revision.title}" for this placement? The current upload will be saved in history.`))return
    setBusySlot(historySlot);setError('');setSuccess('')
    try{await api.restoreLandingMediaRevision(historySlot,revision.id);await load();await showHistory(historySlot);setSuccess('Previous asset restored. The replaced upload remains in history.')}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not restore this revision')}
    finally{setBusySlot(undefined)}
  }
  return <section id="admin-page-assets" className="site-media-library">
    <div className="site-media-library-head"><div><p className="kicker">PUBLIC WEBSITE / GLOBAL MEDIA</p><h2>ONE UPLOAD.<br/><em>EVERY PLACEMENT.</em></h2><p>Replace artwork used by the landing page, product pages, guides and articles. Shared source artwork updates every page that references it.</p></div><div className="site-media-filters"><label className="site-media-search">⌕ <input value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Find a page asset or image"/></label><label className="site-media-page-filter">PAGE <select value={pageFilter} onChange={event=>setPageFilter(event.target.value)}><option value="">All public pages</option>{pages.map(page=><option key={page} value={page}>{page}</option>)}</select></label></div></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}{success&&<p className="placement-success" role="status">{success}</p>}
    <div className="site-media-grid">{visible.map(item=>{
      const asset=assets.find(value=>value.slot===item.slot)
      return <article className="site-media-card" key={item.slot}>
        <div className="site-media-preview">{asset?.mediaKind==='video'?<video src={asset.mediaUrl} muted controls preload="metadata"/>:<img src={asset?.mediaUrl||item.defaultUrl} alt={asset?.title||item.title}/>}<span>{asset?'CUSTOM UPLOAD':'BUILT-IN DEFAULT'}</span></div>
        <div className="site-media-card-copy"><p>{item.slot}</p><h3>{item.title}</h3><small>{item.pages.length} page{item.pages.length===1?'':'s'} · {item.role} · {item.mediaKind} default</small><div className="site-media-pages">{item.pages.slice(0,3).map(page=><a href={page} target="_blank" rel="noreferrer" key={page}>{page}</a>)}{item.pages.length>3&&<code>+{item.pages.length-3} more</code>}</div>{item.pages[0]&&<a className="site-media-view-page" href={item.pages[0]} target="_blank" rel="noreferrer">Preview public page ↗</a>}</div>
        <details className="site-media-editor"><summary>{asset?'Replace asset':'Upload replacement'} ↗</summary><form onSubmit={event=>save(event,item.slot)}>
          <input type="hidden" name="slot" value={item.slot}/>
          <label>Asset title<input name="title" required maxLength={100} defaultValue={asset?.title||item.title}/></label>
          <label>Admin note<input name="caption" maxLength={220} defaultValue={asset?.caption||''} placeholder="Optional note"/></label>
          <label className="site-media-file">Choose image or video<input type="file" name="media" required accept={["poster","background","srcset"].includes(item.role)?"image/jpeg,image/png,image/webp": "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"}/></label>
          <button className="lime-button" disabled={Boolean(busySlot)}>{busySlot===item.slot?'Uploading…':'Upload & replace'} ↗</button>
          {asset&&<button className="site-media-restore" type="button" disabled={Boolean(busySlot)} onClick={()=>restore(item.slot)}>Restore built-in artwork</button>}
        </form></details>
        <button className="site-media-history-toggle" type="button" onClick={()=>void showHistory(item.slot)}>Replacement history ↺</button>
        {historySlot===item.slot&&<div className="site-media-history">{historyBusy?<p>Loading history…</p>:history.length?<>{history.map(revision=><article key={revision.id}><div>{revision.mediaKind==='video'?<video src={revision.mediaUrl} muted controls preload="metadata"/>:<img src={revision.mediaUrl} alt={revision.title}/>}</div><section><b>{revision.title}</b><small>{new Date(revision.createdAt).toLocaleString()}</small><button type="button" disabled={Boolean(busySlot)} onClick={()=>void restoreRevision(revision)}>Restore this version</button></section></article>)}</>:<p>No previous uploads for this placement yet.</p>}</div>}
      </article>
    })}</div>
    {!manifest.length&&<p className="site-media-empty">No replaceable public image slots were found. Run the frontend build to generate the manifest.</p>}
  </section>
}

const studioSurfaceMap = [
  {href:'#admin-hero',title:'Hero',detail:'Machine artwork and optional atmosphere',kind:'Image or quiet loop'},
  {href:'#landing-thumbnails',title:'Moving clip strip',detail:'Six individual portrait thumbnails',kind:'Images'},
  {href:'#admin-product-preview',title:'Product preview',detail:'Visual style swatch and finished short',kind:'Image or clip'},
  {href:'#admin-clip-types-learn',title:'Clip types',detail:'Three visuals in each category tab',kind:'Images'},
  {href:'#admin-clip-library',title:'Real films',detail:'Public reel and Studio screening room',kind:'Finished clips'}
]

function StudioPlacementMap(){
  return <section className="studio-placement-map" aria-labelledby="landing-media-map-title"><div className="placement-map-head"><div><p className="kicker">LANDING PAGE MEDIA MAP</p><h2 id="landing-media-map-title">PLACE EACH VISUAL<br/><em>WHERE IT BELONGS.</em></h2></div><p>Follow the public page from the hero through the clip strip and product sections. Open any destination below to upload or replace its media.</p></div><nav className="placement-map-grid" aria-label="Jump to landing media controls">{studioSurfaceMap.map(item=><a className="placement-route" href={item.href} key={item.href}><span>{item.kind}</span><b>{item.title}</b><p>{item.detail}</p><small>Manage placement ↗</small></a>)}</nav></section>
}

function WorkerFleetAdmin(){
  const [fleet,setFleet]=useState<WorkerFleetStatus>()
  const [error,setError]=useState('')
  const load=useCallback(()=>api.adminWorkerStatus().then(value=>{setFleet(value);setError('')}).catch(reason=>setError(reason instanceof Error?reason.message:'Could not load worker capacity')),[])
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),10000);return()=>window.clearInterval(timer)},[load])
  if(!fleet)return <section className="worker-fleet-admin"><div className="worker-fleet-loading">{error||'Reading worker capacity…'}</div></section>
  const renderRegions=fleet.regions.filter(region=>region.jobClass==='render')
  const renderCapacity=renderRegions.reduce((total,region)=>total+region.capacity,0)
  return <section id="admin-workers" className="worker-fleet-admin" aria-live="polite"><div className="worker-fleet-head"><div><p className="kicker">LIVE WORKER CONTROL</p><h2>THE RENDER<br/><em>FLOOR.</em></h2><p>Production capacity is coordinated automatically. Full regions keep new films safely queued until a slot opens.</p></div><button type="button" onClick={()=>void load()}>Refresh now ↻</button></div>{error&&<div className="error-banner">{error}</div>}<div className="worker-fleet-summary"><article><span>ACTIVE RENDERS</span><b>{fleet.runningRender}<small> / {renderCapacity}</small></b><p>Across every production region</p></article><article><span>WAITING SAFELY</span><b>{fleet.queuedRender}</b><p>Queued without consuming retries</p></article><article><span>PLANNING</span><b>{fleet.runningApi}<small> live</small></b><p>{fleet.queuedApi} waiting for scene planning</p></article><article className={fleet.failed24h?'warning':''}><span>FAILED / 24H</span><b>{fleet.failed24h}</b><p>{fleet.failed24h?'Needs operator review':'No exhausted deliveries'}</p></article></div><div className="worker-region-grid">{fleet.regions.map(region=>{const ratio=region.capacity?Math.min(100,region.assigned/region.capacity*100):0;return <article className={`worker-region-card ${region.status}`} key={`${region.jobClass}-${region.region}`}><div><span>{region.jobClass==='render'?'VIDEO PRODUCTION':'STORY PLANNING'}</span><i>{region.status}</i></div><h3>{region.region}</h3><strong>{region.assigned}<small> / {region.capacity} assigned</small></strong><div className="worker-capacity-meter"><i style={{width:`${ratio}%`}}/></div><p>{region.status==='cooldown'?`Routing around this region${region.blockedUntil?` until ${new Date(region.blockedUntil).toLocaleTimeString()}`:''}.`:region.available?`${region.available} slot${region.available===1?'':'s'} ready.`:'New work remains queued.'}</p>{region.lastError&&region.status==='cooldown'&&<small className="worker-region-error">{region.lastError}</small>}</article>})}</div><footer>Updated {new Date(fleet.generatedAt).toLocaleTimeString()} · automatic refresh every 10 seconds</footer></section>
}

function AdminPage({clips,onChange}:{clips:ShowcaseClip[];onChange:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [jobs,setJobs]=useState<AdminJob[]>([]);const [jobFilter,setJobFilter]=useState('');const [jobsLoading,setJobsLoading]=useState(true);const [voiceLibrary,setVoiceLibrary]=useState<Voice[]>([]);const [voiceResult,setVoiceResult]=useState('')
  const reloadJobs=useCallback(async()=>{setJobsLoading(true);try{setJobs(await api.adminJobs())}catch(reason){setError(reason instanceof Error?reason.message:'Could not load finished jobs')}finally{setJobsLoading(false)}},[])
  useEffect(()=>{void reloadJobs();api.adminVoices().then(setVoiceLibrary).catch(()=>{})},[reloadJobs])
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');try{const formElement=event.currentTarget;const raw=new FormData(formElement);raw.set('published',String(raw.get('published')==='on'));raw.set('featured',String(raw.get('featured')==='on'));raw.set('landing_visible',String(raw.get('landing_visible')==='on'));await api.uploadShowcase(raw);formElement.reset();await onChange();track('AdminShowcaseUpload')}catch(reason){setError(reason instanceof Error?reason.message:'Upload failed')}finally{setBusy(false)}}
  const visibleJobs=jobs.filter(job=>`${job.title} ${job.ownerEmail} ${job.clipType}`.toLowerCase().includes(jobFilter.toLowerCase()))
  const assign=async(job:AdminJob,landingVisible:boolean)=>{setBusy(true);setError('');try{await api.assignProjectToShowcase(job,{landingVisible,published:true});await onChange()}catch(reason){setError(reason instanceof Error?reason.message:'Could not place this job')}finally{setBusy(false)}}
  const generateVoices=async()=>{setBusy(true);setError('');setVoiceResult('');try{const result=await api.generateVoiceLibrary();setVoiceResult(`${result.generated} of ${result.total} previews are ready${result.failed?`; ${result.failed} need another try`:''}.`);setVoiceLibrary(await api.adminVoices())}catch(reason){setError(reason instanceof Error?reason.message:'Could not generate voice previews')}finally{setBusy(false)}}
  return <section id="admin-landing" className="studio-page admin-page"><div className="page-intro admin-intro"><div><p className="kicker">06 / ADMIN / MEDIA CONTROL</p><h1>CURATE THE<br/><em>PUBLIC STUDIO.</em></h1></div><div className="admin-stamp">OWNER<br/>ACCESS ↗</div></div>{error&&<div className="error-banner">{error}</div>}<section className="admin-landing-status"><div><p className="kicker">LANDING REEL / LIVE PLACEMENT</p><h2>{clips.filter(clip=>clip.published&&clip.landingVisible).length} CLIPS<br/><em>IN ROTATION.</em></h2></div><p>Only clips marked <b>Landing reel</b> appear below the Story Machine hero. The strip loops continuously and plays the real work you approve.</p></section><StudioPlacementMap/><PublicSiteMediaAdmin/><LandingMediaAdmin thumbnails/><LandingMediaAdmin/><div id="admin-clip-library" className="admin-grid"><form className="upload-panel" onSubmit={submit}><div className="panel-label"><span>UPLOAD A VERTICAL SHORT</span><small>9:16 PUBLIC GALLERY</small></div><h2>ADD A NEW<br/>GALLERY CLIP.</h2><label>Film title<input name="title" required maxLength={80} placeholder="The Moon Before Dark"/></label><div className="admin-fields"><label>Department<select name="department"><option value="learn">Learn & explain</option><option value="story">Story & spectacle</option><option value="engage">Engage & transform</option></select></label><label>Clip format<select name="aspectRatio"><option value="9:16">9:16 · Vertical short</option><option>1:1</option><option>16:9</option></select></label></div><label>Short description<textarea name="description" maxLength={220} placeholder="A one-line note about this film."/></label><label className="file-drop"><span className="file-icon">▶</span><b>Choose the final video</b><small>MP4 or WebM. It is stored in the secure public showcase.</small><input name="video" type="file" accept="video/*" required={!demoMode}/></label><label className="file-drop compact-drop"><span className="file-icon">▧</span><b>Optional poster image</b><small>JPG, PNG or WebP.</small><input name="poster" type="file" accept="image/*"/></label><div className="publish-checks"><label><input name="published" type="checkbox" defaultChecked/>Show in Studio overview & screening room</label><label><input name="landing_visible" type="checkbox" defaultChecked/>Add to public landing reel</label><label><input name="featured" type="checkbox"/>Make Studio premiere</label></div><button className="lime-button" disabled={busy}>{busy?'Uploading…':'Upload & place'} <span>↗</span></button></form><section className="media-library"><div className="section-heading"><div><p className="kicker">CURATED MEDIA LIBRARY</p><h2>EVERY PUBLIC<br/>PLACEMENT.</h2></div><span>{clips.length} clips</span></div><div className="admin-media-list">{clips.length?clips.map(clip=><article className="admin-media-item" key={clip.id}><div className="admin-media-thumb">{clip.posterUrl?<img src={clip.posterUrl} alt=""/>:'▶'}</div><div><h3>{clip.title}</h3><p>{departmentName(clip.department)} · {clip.aspectRatio} · {clip.published?'Published':'Draft'}{clip.landingVisible?' · Landing reel':''}{clip.featured?' · Premiere':''}</p></div><div className="admin-media-actions"><button onClick={async()=>{await api.updateShowcase(clip.id,{landingVisible:!clip.landingVisible,published:clip.landingVisible?clip.published:true});await onChange()}}>{clip.landingVisible?'Remove from landing reel':'Add to landing reel'}</button><button onClick={async()=>{await api.updateShowcase(clip.id,{published:!clip.published});await onChange()}}>{clip.published?'Remove from Studio':'Show in Studio'}</button><button className="danger" onClick={async()=>{if(confirm(`Delete “${clip.title}”?`)){await api.deleteShowcase(clip.id);await onChange()}}}>Delete</button></div></article>):<div className="admin-empty"><b>THE SHELF IS EMPTY.</b>Upload a real film or place a finished job below.</div>}</div></section></div><section id="admin-jobs" className="admin-jobs"><div className="admin-jobs-heading"><div><p className="kicker">ALL FINISHED USER JOBS</p><h2>SELECT FROM<br/><em>THE OUTPUT VAULT.</em></h2><p>Every successfully completed generation is available here. Adding one preserves its original output and creates a controlled public placement.</p></div><label><span>⌕</span><input value={jobFilter} onChange={event=>setJobFilter(event.target.value)} placeholder="Find a film, creator or type"/></label></div><div className="admin-job-list">{jobsLoading?<div className="admin-empty">Loading completed jobs…</div>:visibleJobs.length?visibleJobs.map(job=>{const current=clips.find(clip=>clip.sourceProjectId===job.id);return <article className="admin-job" key={job.id}><div className="admin-job-frame">{job.posterUrl?<img src={job.posterUrl} alt=""/>:<span>{job.aspectRatio}</span>}</div><div><p>{job.ownerName} · {job.ownerEmail}</p><h3>{job.title}</h3><small>{job.clipType} · {job.durationSeconds}s · {job.aspectRatio} · completed {new Date(job.updatedAt).toLocaleDateString()}</small></div><div className="admin-job-actions"><span className={current?.landingVisible?'placed':''}>{current?.landingVisible?'In landing reel':current?.published?'In screening room':'Not placed'}</span><button disabled={busy} onClick={()=>assign(job,false)}>Screening room</button><button className="job-primary" disabled={busy} onClick={()=>assign(job,true)}>{current?.landingVisible?'Update reel':'Add to landing reel'} ↗</button></div></article>}):<div className="admin-empty">No completed jobs match this search.</div>}</div></section><WorkerFleetAdmin/><section id="admin-voices" className="voice-library-admin"><div><p className="kicker">VOICE PREVIEW LIBRARY</p><h2>MAKE EVERY<br/><em>VOICE PLAYABLE.</em></h2><p>One action creates a short MP3 preview for each supported studio voice, stores its metadata in the database and publishes the preview to the creation desk.</p><button className="lime-button" disabled={busy} onClick={generateVoices}>{busy?'Generating previews…':'Generate all voice previews'} <span>↗</span></button>{voiceResult&&<p className="voice-result">{voiceResult}</p>}</div><div className="voice-admin-grid">{voiceLibrary.map(voice=><article key={voice.id}><b>{voice.name}</b><small>{voice.language}</small>{voice.previewUrl?<audio controls preload="none" src={voice.previewUrl}>Preview unavailable.</audio>:<span>Preview not generated</span>}</article>)}</div></section></section>
}

export function App(){
  const path=usePathname();const [user,setUser]=useState<User>();const [projects,setProjects]=useState<Project[]>([]);const [credits,setCredits]=useState<CreditBalance>({total:0,used:0,remaining:0});const [voices,setVoices]=useState<Voice[]>([]);const [showcase,setShowcase]=useState<ShowcaseClip[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('')
  const refresh=useCallback(async()=>{try{const [nextProjects,nextCredits,nextVoices,nextShowcase]=await Promise.all([api.projects(),api.credits(),api.voices(),api.showcase(path==='/admin')]);setProjects(nextProjects);setCredits(nextCredits);setVoices(nextVoices);setShowcase(nextShowcase)}catch(reason){setError(reason instanceof Error?reason.message:'Could not load the studio')}},[path])
  const refreshAccount=useCallback(async()=>{setUser(await api.me());await refresh()},[refresh])
  useEffect(()=>{if(path==='/'||path==='/story-machine/'){location.replace('/story-machine/index.html');return}if(path==='/landing-demo'||path==='/landing-demo/'){location.replace('/landing-demo/index.html');return}api.me().then(setUser).catch(()=>setUser(undefined)).finally(()=>setLoading(false))},[path])
  useEffect(()=>{if(user)refresh()},[user,refresh])
  useEffect(()=>{if(!user||!projects.some(project=>['queued','planning','rendering'].includes(project.status)))return;const timer=window.setInterval(()=>{void refresh()},8000);return()=>window.clearInterval(timer)},[user,projects,refresh])
  useEffect(()=>trackPage(path),[path])
  useEffect(()=>{const handler=()=>setUser(undefined);addEventListener('shortclipr:unauthorized',handler);return()=>removeEventListener('shortclipr:unauthorized',handler)},[])
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();go('/studio/projects')}};addEventListener('keydown',handler);return()=>removeEventListener('keydown',handler)},[])
  const projectId=path.startsWith('/studio/projects/')?path.split('/').pop():undefined
  const page=useMemo(()=>{
    if(path==='/studio/create')return <CreatePage voices={voices} credits={credits} user={user!} onCreated={project=>{setProjects(value=>[project,...value]);setCredits(value=>({...value,used:value.used+project.creditsReserved,remaining:Math.max(0,value.remaining-project.creditsReserved)}))}}/>
    if(projectId)return <ProjectPage project={projects.find(project=>project.id===projectId)} onUpdated={refresh}/>
    if(path==='/studio/projects')return <ProjectsPage projects={projects}/>
    if(path==='/studio/screening')return <ScreeningPage clips={showcase}/>
    if(path==='/studio/credits')return <CreditsPage credits={credits} projects={projects} user={user!} onUpdated={refreshAccount}/>
    if(path==='/admin')return user?.isAdmin?<AdminPage clips={showcase} onChange={refresh}/>:<section className="studio-page"><div className="error-banner">Admin access required.</div></section>
    return <OverviewPage projects={projects} credits={credits} showcase={showcase.filter(clip=>clip.published)}/>
  },[path,projectId,projects,credits,voices,showcase,user,refresh,refreshAccount])
  if(loading)return <div className="app-loading">OPENING THE STUDIO…</div>
  if(!user)return <LoginPage onLogin={setUser}/>
  if(path==='/admin')return <AdminShell user={user} onSignOut={()=>setUser(undefined)}>{error&&<div className="error-banner">{error}</div>}{page}</AdminShell>
  return <StudioShell path={path} user={user} credits={credits} onSignOut={()=>setUser(undefined)}>{error&&<div className="error-banner">{error}</div>}{page}</StudioShell>
}

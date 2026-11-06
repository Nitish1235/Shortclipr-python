type EventProperties = Record<string,string|number|boolean|undefined>
type QueueFunction = ((...args:unknown[])=>void)&{queue?:unknown[][];loaded?:boolean;version?:string}
type TikTokQueue = {load?:(id:string)=>void;page?:()=>void;track?:(event:string,properties?:EventProperties)=>void;_q?:unknown[][]}

declare global {
  interface Window {
    dataLayer?:unknown[]
    gtag?:QueueFunction
    rdt?:QueueFunction
    fbq?:QueueFunction
    _fbq?:QueueFunction
    ttq?:TikTokQueue
  }
}

function script(id:string,src:string){
  if(document.getElementById(id))return
  const element=document.createElement('script');element.id=id;element.async=true;element.src=src;document.head.append(element)
}

export function initTracking(){
  const googleId=import.meta.env.VITE_GOOGLE_ADS_ID
  if(googleId){window.dataLayer=window.dataLayer??[];window.gtag=((...args:unknown[])=>window.dataLayer!.push(args)) as QueueFunction;window.gtag('js',new Date());window.gtag('config',googleId);script('shortclipr-gtag',`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleId)}`)}
  const metaId=import.meta.env.VITE_META_PIXEL_ID
  if(metaId){const fbq=((...args:unknown[])=>{if(fbq.loaded)return;(fbq.queue??=[]).push(args)}) as QueueFunction;fbq.version='2.0';window.fbq=window._fbq=fbq;script('shortclipr-meta','https://connect.facebook.net/en_US/fbevents.js');fbq('init',metaId)}
  const redditId=import.meta.env.VITE_REDDIT_PIXEL_ID
  if(redditId){const rdt=((...args:unknown[])=>(rdt.queue??=[]).push(args)) as QueueFunction;window.rdt=rdt;script('shortclipr-reddit','https://www.redditstatic.com/ads/pixel.js');rdt('init',redditId)}
  const tiktokId=import.meta.env.VITE_TIKTOK_PIXEL_ID
  if(tiktokId){const ttq:TikTokQueue={_q:[]};ttq.load=(id:string)=>{ttq._q!.push(['load',id]);script('shortclipr-tiktok',`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`)};ttq.page=()=>ttq._q!.push(['page']);ttq.track=(event,properties)=>ttq._q!.push(['track',event,properties]);window.ttq=ttq;ttq.load(tiktokId)}
}

export function track(event:string,properties:EventProperties={}){
  window.dataLayer?.push({event,...properties})
  window.gtag?.('event',event,properties)
  const googleId=import.meta.env.VITE_GOOGLE_ADS_ID
  const conversionLabel=event==='SignUp'?import.meta.env.VITE_GOOGLE_ADS_SIGNUP_LABEL:event==='InitiateCheckout'?import.meta.env.VITE_GOOGLE_ADS_CHECKOUT_LABEL:event==='Subscribe'?import.meta.env.VITE_GOOGLE_ADS_SUBSCRIBE_LABEL:undefined
  if(googleId&&conversionLabel)window.gtag?.('event','conversion',{send_to:`${googleId}/${conversionLabel}`,...properties})
  window.fbq?.(event==='PageView'?'track':'trackCustom',event,properties)
  window.rdt?.('track',event,properties)
  const tiktokEvent=event==='SignUp'?'CompleteRegistration':event
  window.ttq?.track?.(tiktokEvent,properties)
}

export function trackPage(path:string){window.ttq?.page?.();track('PageView',{path})}

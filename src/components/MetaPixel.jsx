import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Keep this in the deployment environment rather than source so each
// environment can use its own Meta dataset/pixel.
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID

export function newMetaEventId(prefix = 'meta') {
  return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
}

// Browser and Conversions API events use this same id to let Meta deduplicate
// them. It deliberately no-ops when a pixel has not been configured (local
// development and privacy-focused deployments).
export function trackMetaEvent(eventName, params = {}, eventId = newMetaEventId()) {
  if (PIXEL_ID && typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', eventName, params, { eventID: eventId })
  }
  return eventId
}

export default function MetaPixel() {
  const location = useLocation()

  useEffect(() => {
    if (!PIXEL_ID || window.fbq) return

    // Meta's standard browser-pixel bootstrap, expressed without injecting
    // executable HTML into the React tree.
    const fbq = function (...args) {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args)
      else fbq.queue.push(args)
    }
    fbq.queue = []
    fbq.loaded = true
    fbq.version = '2.0'
    window.fbq = fbq
    window._fbq = fbq
    window.fbq('init', PIXEL_ID)

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!PIXEL_ID || typeof window.fbq !== 'function') return

    trackMetaEvent('PageView')
    const highIntent =
      location.pathname === '/' ||
      location.pathname === '/youtube-shorts' ||
      location.pathname === '/brainrot' ||
      location.pathname.includes('/pricing')

    if (highIntent) trackMetaEvent('ViewContent')
  }, [location.pathname])

  return null
}

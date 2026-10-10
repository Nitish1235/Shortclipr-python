import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Your TikTok Pixel ID from Ads Manager
const PIXEL_ID = 'DB4V573C77U074LG2530'

export default function TikTokPixel() {
  const location = useLocation()

  // ── One-time pixel bootstrap ────────────────────────────────
  // This is the exact official TikTok base code converted to React,
  // with the newer consent methods (holdConsent/revokeConsent/grantConsent).
  useEffect(() => {
    if (window.ttq) return // already booted

    ;(function (w, d, t) {
      w.TiktokAnalyticsObject = t
      const ttq = (w[t] = w[t] || [])
      ttq.methods = [
        'page', 'track', 'identify', 'instances', 'debug',
        'on', 'off', 'once', 'ready', 'alias', 'group',
        'enableCookie', 'disableCookie',
        'holdConsent', 'revokeConsent', 'grantConsent',
      ]
      ttq.setAndDefer = function (t, e) {
        t[e] = function () {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)))
        }
      }
      for (let i = 0; i < ttq.methods.length; i++) {
        ttq.setAndDefer(ttq, ttq.methods[i])
      }
      ttq.instance = function (t) {
        const e = ttq._i[t] || []
        for (let n = 0; n < ttq.methods.length; n++) {
          ttq.setAndDefer(e, ttq.methods[n])
        }
        return e
      }
      ttq.load = function (e, n) {
        const r = 'https://analytics.tiktok.com/i18n/pixel/events.js'
        ttq._i = ttq._i || {}
        ttq._i[e] = []
        ttq._i[e]._u = r
        ttq._t = ttq._t || {}
        ttq._t[e] = +new Date()
        ttq._o = ttq._o || {}
        ttq._o[e] = n || {}
        const script = d.createElement('script')
        script.type = 'text/javascript'
        script.async = true
        script.src = r + '?sdkid=' + e + '&lib=' + t
        const first = d.getElementsByTagName('script')[0]
        first.parentNode.insertBefore(script, first)
      }

      ttq.load(PIXEL_ID)
      ttq.page()
    })(window, document, 'ttq')
  }, [])

  // ── PageView + ViewContent on every route change ────────────
  useEffect(() => {
    if (!window.ttq) return

    // Standard PageView — fires on every navigation
    window.ttq.page()

    // ViewContent — fires on high-intent pages (landing + pricing)
    const highIntent =
      location.pathname === '/' ||
      location.pathname === '/youtube-shorts' ||
      location.pathname === '/brainrot' ||
      location.pathname.includes('/pricing')

    if (highIntent) {
      window.ttq.track('ViewContent')
    }
  }, [location.pathname])

  return null
}

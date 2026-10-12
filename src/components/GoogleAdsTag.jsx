import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getGoogleAdsId } from '../lib/googleAds'

const ADS_ID = getGoogleAdsId()

export default function GoogleAdsTag() {
  const location = useLocation()

  useEffect(() => {
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function gtag(...args) { window.dataLayer.push(args) }
    window.gtag('js', new Date())
    window.gtag('config', ADS_ID)

    const existing = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${ADS_ID}"]`)
    if (existing) return
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('config', ADS_ID, { page_path: location.pathname })
    }
  }, [location.pathname])

  return null
}

const ADS_ID = import.meta.env.VITE_GOOGLE_ADS_ID || 'AW-18505490973'

export function getGoogleAdsId() {
  return ADS_ID
}

export function trackGoogleAdsConversion(label, params = {}) {
  if (!label || typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', 'conversion', { send_to: `${ADS_ID}/${label}`, ...params })
}

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackRedditEvent } from '../lib/redditAds'

export default function RedditPixel() {
  const location = useLocation()

  useEffect(() => {
    trackRedditEvent('PageVisit')

    const productId = location.pathname.startsWith('/brainrot')
      ? 'shortclipr_brainrot'
      : location.pathname.startsWith('/factloop')
        ? 'shortclipr_factloop'
        : 'shortclipr_youtube_shorts'
    const highIntent =
      location.pathname === '/' ||
      location.pathname === '/youtube-shorts' ||
      location.pathname === '/brainrot' ||
      location.pathname.includes('/pricing')

    if (highIntent) {
      trackRedditEvent('ViewContent', {
        products: [{ id: productId, category: 'subscription', name: productId, quantity: 1 }],
      })
    }
  }, [location.pathname])

  return null
}

export function newRedditConversionId(prefix = 'reddit') {
  return `${prefix}_${crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
}

// The Reddit Pixel bootstrap in index.html queues calls until its library has
// loaded, so conversion events are safe to call during the first interaction.
export function trackRedditEvent(eventName, metadata = {}) {
  if (typeof window === 'undefined' || typeof window.rdt !== 'function') return
  window.rdt('track', eventName, {
    conversionId: newRedditConversionId(eventName.toLowerCase()),
    ...metadata,
  })
}

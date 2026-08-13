// brainrotApi.js — thin fetch helpers for the /brainrot/* endpoints.
// Same auth convention as the rest of the app: Bearer token from localStorage
// 'sc_token', base URL from VITE_API_URL.

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function authHeaders(json = false) {
  const token = localStorage.getItem('sc_token')
  const h = { Authorization: `Bearer ${token}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

export const brainrotApi = {
  characters:    () => getJSON('/brainrot/characters'),
  voices:        () => getJSON('/brainrot/voices'),
  animations:    () => getJSON('/brainrot/animations'),
  gameplayClips: (category) => getJSON(`/brainrot/gameplay-clips${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  audioAssets:   (type) => getJSON(`/brainrot/audio-assets${type ? `?type=${type}` : ''}`),
  listJobs:      () => getJSON('/brainrot/jobs'),
  getJob:        (id) => getJSON(`/brainrot/jobs/${id}`),

  async createJob(options) {
    const res = await fetch(`${API_BASE}/brainrot/jobs`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ options }),
    })
    if (!res.ok) {
      let detail = `Request failed (${res.status})`
      try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json()
  },
}

export { API_BASE }

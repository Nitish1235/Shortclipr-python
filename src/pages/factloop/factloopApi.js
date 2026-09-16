// factloopApi.js — thin fetch helpers for the /factloop/* endpoints.
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
  if (!res.ok) {
    const error = new Error(`${path} → ${res.status}`)
    error.status = res.status
    throw error
  }
  return res.json()
}

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = `${path} → ${res.status}`
    try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
    const error = new Error(detail)
    error.status = res.status
    throw error
  }
  return res.json()
}

export const factloopApi = {
  voices:        () => getJSON('/factloop/voices'),
  gameplayClips: (category) => getJSON(`/factloop/gameplay-clips${category ? `?category=${encodeURIComponent(category)}` : ''}`),
  audioAssets:   (type) => getJSON(`/factloop/audio-assets${type ? `?type=${type}` : ''}`),
  listJobs:      () => getJSON('/factloop/jobs'),
  getJob:        (id) => getJSON(`/factloop/jobs/${id}`),
  // Dedicated "My clips" library feed — separate from listJobs/getJob above,
  // which back the create flow's live status polling. Supports status
  // filtering + pagination; see GET /factloop/clips in backend/app/api/factloop.py.
  listClips:     ({ status = 'all', limit = 24, offset = 0 } = {}) =>
    getJSON(`/factloop/clips?status=${status}&limit=${limit}&offset=${offset}`),

  generatePostMeta: (script_input) => postJSON('/factloop/generate-post-meta', { script_input }),

  // Creates the job with facts payload, reserves credit, and dispatches
  // the merged Generate stage (script + image + TTS) — no review step.
  // Job lands at status='generating' and runs straight through to complete
  // (or fails with refund).
  async createJob(options) {
    const res = await fetch(`${API_BASE}/factloop/jobs`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ options }),
    })
    if (!res.ok) {
      let detail = `Request failed (${res.status})`
      try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
      const error = new Error(detail)
      error.status = res.status
      throw error
    }
    return res.json()
  },
}

export { API_BASE }

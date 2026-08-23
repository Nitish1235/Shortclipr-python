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

async function deleteJSON(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) {
    let detail = `${path} → ${res.status}`
    try { detail = (await res.json()).detail || detail } catch { /* ignore */ }
    const error = new Error(detail)
    error.status = res.status
    throw error
  }
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

  generatePostMeta: (script_input) => postJSON('/brainrot/generate-post-meta', { script_input }),

  listSignatureCasts:   () => getJSON('/brainrot/signature-casts'),
  saveSignatureCast:    (character_ids, label) => postJSON('/brainrot/signature-casts', { character_ids, label }),
  deleteSignatureCast:  (id) => deleteJSON(`/brainrot/signature-casts/${id}`),

  async createJob(options) {
    const res = await fetch(`${API_BASE}/brainrot/jobs`, {
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

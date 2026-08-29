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

async function patchJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH', headers: authHeaders(true), body: JSON.stringify(body),
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
  // Dedicated "My clips" library feed — separate from listJobs/getJob above,
  // which back the create flow's live status polling. Supports status
  // filtering + pagination; see GET /brainrot/clips in backend/app/api/brainrot.py.
  listClips:     ({ status = 'all', limit = 24, offset = 0 } = {}) =>
    getJSON(`/brainrot/clips?status=${status}&limit=${limit}&offset=${offset}`),

  generatePostMeta: (script_input) => postJSON('/brainrot/generate-post-meta', { script_input }),

  listSignatureCasts:   () => getJSON('/brainrot/signature-casts'),
  saveSignatureCast:    (character_ids, label) => postJSON('/brainrot/signature-casts', { character_ids, label }),
  deleteSignatureCast:  (id) => deleteJSON(`/brainrot/signature-casts/${id}`),

  // Creates the job and dispatches the SCRIPT stage only — no credit
  // reserved, no TTS/render yet. Job lands at status='awaiting_review';
  // the Studio's script review screen takes over from there. Kept the name
  // "createJob" (rather than renaming to e.g. generateScript) since the
  // request/response shape at this endpoint is unchanged — only what
  // happens server-side after it changed.
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

  // ── Script review — all free, no credit touched until confirmJob ──
  regenerateScript: (jobId) => postJSON(`/brainrot/jobs/${jobId}/regenerate-script`, {}),
  updateScript:     (jobId, lines) => patchJSON(`/brainrot/jobs/${jobId}/script`, { lines }),
  previewLine:      (jobId, speaker, text) => postJSON(`/brainrot/jobs/${jobId}/preview-line`, { speaker, text }),
  confirmJob:       (jobId) => postJSON(`/brainrot/jobs/${jobId}/confirm`, {}),
}

export { API_BASE }

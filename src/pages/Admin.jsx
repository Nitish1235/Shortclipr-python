import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import AdminTikTokAccounts, { AddToTikTokAccountButton } from './AdminTikTokAccounts'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// ── Helpers ────────────────────────────────────────────────────
const token = () => localStorage.getItem('sc_token')

const authFetch = (url, opts = {}) =>
  fetch(`${API}${url}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...opts.headers },
  })

// ── Styles ─────────────────────────────────────────────────────
const card = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px' }
const badge = (color = '#cf1322', bg = '#fef2f2') => ({
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  background: bg, border: `1px solid ${color}40`, borderRadius: '100px',
  padding: '3px 10px', fontSize: '0.68rem', fontWeight: 700, color,
})
const btnRed = {
  background: '#cf1322', color: '#fff',
  border: '2px solid #111', borderRadius: '8px',
  padding: '9px 18px', fontWeight: 700, fontSize: '0.82rem',
  cursor: 'pointer', boxShadow: '2px 2px 0 #111',
  transition: 'transform 0.1s, box-shadow 0.1s',
}
const btnOutline = {
  background: 'transparent', color: '#cf1322',
  border: '1.5px solid #cf1322', borderRadius: '8px',
  padding: '7px 14px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
  transition: 'background 0.15s',
}

// ── Sub-components ─────────────────────────────────────────────

function Toast({ msg, type }) {
  if (!msg) return null
  const color = type === 'error' ? '#dc2626' : '#16a34a'
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: '#fff', border: `2px solid ${color}`,
      borderRadius: '10px', padding: '12px 20px',
      boxShadow: `3px 3px 0 ${color}`,
      fontSize: '0.85rem', fontWeight: 600, color,
      maxWidth: '360px', animation: 'fadeUp 0.3s ease',
    }}>{type === 'error' ? '❌ ' : '✅ '}{msg}</div>
  )
}

function ShowcaseManager({ showcaseVideos, onDelete, onRefresh }) {
  const [deleting, setDeleting] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editScore, setEditScore] = useState(0)

  const handleDelete = async (v) => {
    setDeleting(v.id)
    const r = await authFetch(`/admin/showcase/${v.id}?blob_name=${encodeURIComponent(v.blob_name)}`, { method: 'DELETE' })
    setDeleting(null)
    if (r.ok) onRefresh()
  }

  const handleSaveMeta = async (v) => {
    await authFetch('/admin/showcase/meta', {
      method: 'PATCH',
      body: JSON.stringify({ blob_name: v.blob_name, title: editTitle, viral_score: editScore }),
    })
    setEditId(null)
    onRefresh()
  }

  if (!showcaseVideos.length) return (
    <div style={{ textAlign: 'center', padding: '32px', color: '#aaa' }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
      <p>No showcase videos yet. Add clips from the job list below.</p>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
      {showcaseVideos.map(v => (
        <div key={v.id} style={{ ...card, padding: '0', overflow: 'hidden', position: 'relative' }}>
          {/* Video preview */}
          <div style={{ position: 'relative', background: '#111' }}>
            <video
              src={v.video_url} muted autoPlay loop playsInline
              poster={v.thumbnail_url}
              style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }}
            />
            <div style={{ position: 'absolute', top: '8px', left: '8px', ...badge('#f59e0b', '#fff') }}>
              🔥 {v.viral_score}/100
            </div>
          </div>

          {/* Info & actions */}
          <div style={{ padding: '10px 12px' }}>
            {editId === v.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  style={{ border: '1px solid #e5e5e5', borderRadius: '6px', padding: '6px 8px', fontSize: '0.78rem', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#cf1322'} onBlur={e => e.target.style.borderColor = '#e5e5e5'}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => handleSaveMeta(v)} style={{ ...btnRed, padding: '5px 10px', fontSize: '0.72rem', flex: 1, boxShadow: '1px 1px 0 #111' }}>Save</button>
                  <button onClick={() => setEditId(null)} style={{ ...btnOutline, padding: '5px 10px', fontSize: '0.72rem' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.title || 'Untitled clip'}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => { setEditId(v.id); setEditTitle(v.title); setEditScore(v.viral_score) }}
                    style={{ ...btnOutline, padding: '5px 10px', fontSize: '0.72rem', flex: 1 }}>✏ Edit</button>
                  <button onClick={() => handleDelete(v)} disabled={deleting === v.id}
                    style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#cf1322', cursor: 'pointer' }}>
                    {deleting === v.id ? '…' : '🗑'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function LibraryManager({ libraryVideos, onDelete, onRefresh }) {
  const [deleting, setDeleting] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editViews, setEditViews] = useState('')
  const [editEarnings, setEditEarnings] = useState('')

  const handleDelete = async (v) => {
    setDeleting(v.id)
    const r = await authFetch(`/admin/library/${v.id}?blob_name=${encodeURIComponent(v.blob_name)}`, { method: 'DELETE' })
    setDeleting(null)
    if (r.ok) onRefresh()
  }

  // we are not adding an update endpoint for library metadata for now, to keep it simple, but we could. For now it's mostly static adding.

  if (!libraryVideos.length) return (
    <div style={{ textAlign: 'center', padding: '32px', color: '#aaa' }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
      <p>No library videos yet. Add clips from the job list below.</p>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
      {libraryVideos.map(v => (
        <div key={v.id} style={{ ...card, padding: '0', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'relative', background: '#111' }}>
            <video
              src={v.video_url} muted autoPlay loop playsInline
              poster={v.thumbnail_url}
              style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }}
            />
            <div style={{ position: 'absolute', top: '8px', left: '8px', ...badge('#16a34a', '#f0fdf4') }}>
              👁 {v.views}
            </div>
            <div style={{ position: 'absolute', top: '8px', right: '8px', ...badge('#cf1322', '#fef2f2') }}>
              💰 {v.earnings}
            </div>
          </div>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.title || 'Untitled clip'}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => handleDelete(v)} disabled={deleting === v.id}
                style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#cf1322', cursor: 'pointer', flex: 1 }}>
                {deleting === v.id ? '…' : '🗑 Remove'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}


function JobClips({ jobId, onAddToShowcase, onAddToLibrary }) {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(false)
  const [addedShowcase, setAddedShowcase] = useState(new Set())
  const [addedLibrary, setAddedLibrary] = useState(new Set())

  useEffect(() => {
    setLoading(true)
    authFetch(`/admin/jobs/${jobId}/clips`)
      .then(r => r.json()).then(d => setClips(d.clips || [])).finally(() => setLoading(false))
  }, [jobId])

  if (loading) return <div style={{ color: '#aaa', padding: '12px', fontSize: '0.82rem' }}>Loading clips…</div>
  if (!clips.length) return <div style={{ color: '#aaa', padding: '12px', fontSize: '0.82rem' }}>No clips found.</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', paddingTop: '12px' }}>
      {clips.map(c => (
        <div key={c.id || c.clip_id} style={{ ...card, padding: '0', overflow: 'hidden' }}>
          <div style={{ position: 'relative' }}>
            <video src={c.video_url} muted controls poster={c.thumbnail_url}
              style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', top: '6px', left: '6px', ...badge('#f59e0b', 'rgba(0,0,0,0.7)'), color: '#fff' }}>
              🔥 {c.viral_score}/100
            </div>
          </div>
          <div style={{ padding: '8px 10px', display: 'flex', gap: '6px', flexDirection: 'column' }}>
            <button
              disabled={addedShowcase.has(c.id || c.clip_id)}
              onClick={() => {
                setAddedShowcase(s => new Set([...s, c.id || c.clip_id]))
                onAddToShowcase({
                  job_id: jobId,
                  clip_id: c.clip_id || c.id,
                  title: c.title || 'ShortClipr Clip',
                  viral_score: c.viral_score || 0,
                  video_url: c.video_url,
                  thumbnail_url: c.thumbnail_url || '',
                })
              }}
              style={{
                width: '100%',
                background: addedShowcase.has(c.id || c.clip_id) ? '#f0fdf4' : '#cf1322',
                color: addedShowcase.has(c.id || c.clip_id) ? '#16a34a' : '#fff',
                border: addedShowcase.has(c.id || c.clip_id) ? '1px solid #bbf7d0' : '2px solid #111',
                borderRadius: '7px', padding: '7px', fontWeight: 700, fontSize: '0.75rem',
                cursor: addedShowcase.has(c.id || c.clip_id) ? 'default' : 'pointer',
                boxShadow: addedShowcase.has(c.id || c.clip_id) ? 'none' : '1px 1px 0 #111',
              }}
            >
              {addedShowcase.has(c.id || c.clip_id) ? '✓ Added to Showcase' : '+ Add to Showcase'}
            </button>
            <button
              disabled={addedLibrary.has(c.id || c.clip_id)}
              onClick={() => {
                setAddedLibrary(s => new Set([...s, c.id || c.clip_id]))
                onAddToLibrary({
                  job_id: jobId,
                  clip_id: c.clip_id || c.id,
                  title: c.title || 'ShortClipr Clip',
                  views: (Math.random() * 90 + 10).toFixed(1) + 'k views',
                  earnings: '$' + Math.floor(Math.random() * 900 + 100),
                  video_url: c.video_url,
                  thumbnail_url: c.thumbnail_url || '',
                })
              }}
              style={{
                width: '100%',
                background: addedLibrary.has(c.id || c.clip_id) ? '#f0fdf4' : '#111',
                color: addedLibrary.has(c.id || c.clip_id) ? '#16a34a' : '#fff',
                border: addedLibrary.has(c.id || c.clip_id) ? '1px solid #bbf7d0' : '2px solid #333',
                borderRadius: '7px', padding: '7px', fontWeight: 700, fontSize: '0.75rem',
                cursor: addedLibrary.has(c.id || c.clip_id) ? 'default' : 'pointer',
                boxShadow: addedLibrary.has(c.id || c.clip_id) ? 'none' : '1px 1px 0 #cf1322',
              }}
            >
              {addedLibrary.has(c.id || c.clip_id) ? '✓ Added to Library' : '+ Add to Library'}
            </button>
            <AddToTikTokAccountButton
              size="small"
              clip={{
                source: 'ytshorts',
                job_id: jobId,
                clip_id: c.clip_id || c.id,
                title: c.title || 'ShortClipr Clip',
                video_url: c.video_url,
                thumbnail_url: c.thumbnail_url || '',
                likes: c.viral_score ? `${c.viral_score}%` : '',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

const FEEDBACK_LABELS = {
  source: 'Where they found us',
  visit_reason: 'Why they\'re here',
  blocker: 'What\'s stopping them from buying',
}

function JobFeedback({ jobId }) {
  const [feedback, setFeedback] = useState(undefined) // undefined = loading, null = none
  useEffect(() => {
    setFeedback(undefined)
    authFetch(`/admin/jobs/${jobId}/feedback`)
      .then(r => r.json()).then(d => setFeedback(d.feedback || null))
      .catch(() => setFeedback(null))
  }, [jobId])

  if (feedback === undefined) return <div style={{ color: '#aaa', padding: '12px', fontSize: '0.82rem' }}>Loading feedback…</div>
  if (!feedback) return (
    <div style={{ ...card, background: '#fafafa', color: '#aaa', fontSize: '0.82rem', textAlign: 'center', padding: '18px' }}>
      No feedback submitted for this job.
    </div>
  )

  return (
    <div style={{ ...card, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111' }}>📝 Feedback response</span>
        <span style={badge('#7c3aed', '#f5f3ff')}>{new Date(feedback.created_at).toLocaleString()}</span>
        {feedback.reward_clip_id && (
          <span style={badge('#16a34a', '#f0fdf4')}>🎁 Reward used</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: feedback.comment ? '14px' : 0 }}>
        {['source', 'visit_reason', 'blocker'].map(key => {
          const val = feedback[key]
          const other = feedback[`${key}_other`]
          if (!val) return null
          return (
            <div key={key}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                {FEEDBACK_LABELS[key]}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#111', fontWeight: 600 }}>
                {val}{val === 'Other' && other ? `: ${other}` : ''}
              </div>
            </div>
          )
        })}
      </div>
      {feedback.comment && (
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
            Comment
          </div>
          <div style={{ fontSize: '0.83rem', color: '#333', lineHeight: 1.5, fontStyle: 'italic' }}>
            "{feedback.comment}"
          </div>
        </div>
      )}
    </div>
  )
}

function EmailBroadcast({ showToast }) {
  const [mode, setMode] = useState('subscribers')
  const [query, setQuery] = useState("SELECT email FROM users WHERE plan != 'free'")
  const [recipients, setRecipients] = useState(null)
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [previewMode, setPreviewMode] = useState(false)

  const fetchRecipients = async () => {
    setLoadingRecipients(true)
    setSendResult(null)
    try {
      const r = await authFetch('/admin/email/recipients', {
        method: 'POST',
        body: JSON.stringify({ mode, query: mode === 'query' ? query : '' }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Failed to fetch recipients')
      const d = await r.json()
      setRecipients(d)
    } catch (e) {
      showToast(e.message, 'error')
      setRecipients(null)
    }
    setLoadingRecipients(false)
  }

  const handleSend = async () => {
    if (!recipients?.emails?.length) return showToast('No recipients loaded', 'error')
    if (!subject.trim()) return showToast('Subject is required', 'error')
    if (!htmlBody.trim()) return showToast('Email body is required', 'error')

    if (!window.confirm(`Send email to ${recipients.emails.length} recipient(s)?\n\nSubject: ${subject}`)) return

    setSending(true)
    setSendResult(null)
    try {
      const r = await authFetch('/admin/email/send', {
        method: 'POST',
        body: JSON.stringify({ to: recipients.emails, subject, html: htmlBody }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || 'Send failed')
      setSendResult(d)
      if (d.success) showToast(`Sent to ${d.total_sent} recipient(s)!`)
      else showToast(`Partial send: ${d.total_sent} sent, ${d.total_failed} failed`, 'error')
    } catch (e) {
      showToast(e.message, 'error')
    }
    setSending(false)
  }

  return (
    <div>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', marginBottom: '4px' }}>Email Broadcast</h2>
      <p style={{ fontSize: '0.78rem', color: '#999', marginBottom: '20px' }}>
        Send emails to subscribed users via Resend. Choose recipients, compose your email, and send.
      </p>

      {/* Mode selector */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '10px' }}>
          1. Select Recipients
        </label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button
            onClick={() => setMode('subscribers')}
            style={{
              padding: '9px 18px', fontWeight: 700, fontSize: '0.82rem', borderRadius: '8px', cursor: 'pointer',
              background: mode === 'subscribers' ? '#cf1322' : '#f4f4f4',
              color: mode === 'subscribers' ? '#fff' : '#555',
              border: mode === 'subscribers' ? '2px solid #111' : '1px solid #e5e5e5',
              boxShadow: mode === 'subscribers' ? '2px 2px 0 #111' : 'none',
            }}
          >
            All Paid Subscribers
          </button>
          <button
            onClick={() => setMode('query')}
            style={{
              padding: '9px 18px', fontWeight: 700, fontSize: '0.82rem', borderRadius: '8px', cursor: 'pointer',
              background: mode === 'query' ? '#cf1322' : '#f4f4f4',
              color: mode === 'query' ? '#fff' : '#555',
              border: mode === 'query' ? '2px solid #111' : '1px solid #e5e5e5',
              boxShadow: mode === 'query' ? '2px 2px 0 #111' : 'none',
            }}
          >
            Custom SQL Query
          </button>
        </div>

        {mode === 'query' && (
          <div style={{ marginBottom: '14px' }}>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="SELECT email FROM users WHERE ..."
              rows={4}
              style={{
                width: '100%', fontFamily: 'monospace', fontSize: '0.82rem',
                padding: '12px', border: '1.5px solid #e5e5e5', borderRadius: '8px',
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                background: '#fafafa',
              }}
              onFocus={e => e.target.style.borderColor = '#cf1322'}
              onBlur={e => e.target.style.borderColor = '#e5e5e5'}
            />
            <p style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '4px' }}>
              Query must return an <code>email</code> column. Only SELECT queries are allowed.
            </p>
          </div>
        )}

        <button
          onClick={fetchRecipients}
          disabled={loadingRecipients}
          style={{ ...btnRed, padding: '9px 18px', fontSize: '0.78rem' }}
        >
          {loadingRecipients ? 'Loading…' : 'Load Recipients'}
        </button>

        {recipients && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
              <span style={badge('#16a34a', '#f0fdf4')}>{recipients.count} recipient(s)</span>
            </div>
            {recipients.emails.length > 0 && (
              <div style={{
                maxHeight: '160px', overflowY: 'auto',
                background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: '8px',
                padding: '10px 14px', fontSize: '0.78rem', color: '#555',
                fontFamily: 'monospace', lineHeight: 1.8,
              }}>
                {recipients.emails.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compose */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '10px' }}>
          2. Compose Email
        </label>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#333', display: 'block', marginBottom: '6px' }}>Subject</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g. ShortClipr Update — New Features & Improvements"
            style={{
              width: '100%', padding: '11px 14px', border: '1.5px solid #e5e5e5',
              borderRadius: '8px', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = '#cf1322'}
            onBlur={e => e.target.style.borderColor = '#e5e5e5'}
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#333' }}>Email Body (HTML)</label>
            <button
              onClick={() => setPreviewMode(!previewMode)}
              style={{ ...btnOutline, padding: '4px 12px', fontSize: '0.72rem' }}
            >
              {previewMode ? 'Edit' : 'Preview'}
            </button>
          </div>
          {previewMode ? (
            <div
              style={{
                border: '1.5px solid #e5e5e5', borderRadius: '8px',
                padding: '16px', minHeight: '250px', background: '#fff',
                fontSize: '0.88rem', lineHeight: 1.6,
              }}
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          ) : (
            <textarea
              value={htmlBody}
              onChange={e => setHtmlBody(e.target.value)}
              placeholder={`<h2>Hey there!</h2>\n<p>Here's what's new at ShortClipr this week...</p>\n\n<h3>Pipeline Fix</h3>\n<p>Video clips were failing last week due to a pipeline issue. This is now fixed and all clips are generating correctly.</p>\n\n<h3>New: Email Updates</h3>\n<p>We've added email notifications! You'll receive a daily summary of clips generated in the last 24 hours.</p>\n\n<p>— The ShortClipr Team</p>`}
              rows={14}
              style={{
                width: '100%', fontFamily: 'monospace', fontSize: '0.82rem',
                padding: '12px', border: '1.5px solid #e5e5e5', borderRadius: '8px',
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                lineHeight: 1.6,
              }}
              onFocus={e => e.target.style.borderColor = '#cf1322'}
              onBlur={e => e.target.style.borderColor = '#e5e5e5'}
            />
          )}
        </div>
      </div>

      {/* Send */}
      <div style={{ ...card }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '10px' }}>
          3. Send
        </label>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={handleSend}
            disabled={sending || !recipients?.emails?.length || !subject.trim() || !htmlBody.trim()}
            style={{
              ...btnRed, padding: '12px 28px', fontSize: '0.88rem',
              opacity: (sending || !recipients?.emails?.length || !subject.trim() || !htmlBody.trim()) ? 0.5 : 1,
            }}
          >
            {sending ? 'Sending…' : `Send to ${recipients?.count || 0} recipient(s)`}
          </button>

          {sendResult && (
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'center',
            }}>
              {sendResult.success ? (
                <span style={badge('#16a34a', '#f0fdf4')}>Sent {sendResult.total_sent}</span>
              ) : (
                <>
                  <span style={badge('#16a34a', '#f0fdf4')}>Sent {sendResult.total_sent}</span>
                  <span style={badge('#dc2626', '#fef2f2')}>Failed {sendResult.total_failed}</span>
                </>
              )}
            </div>
          )}
        </div>

        {sendResult?.errors?.length > 0 && (
          <div style={{
            marginTop: '12px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '8px', padding: '10px 14px', fontSize: '0.78rem', color: '#dc2626',
          }}>
            {sendResult.errors.map((e, i) => (
              <div key={i}>Batch {e.batch}: {e.error}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TutorialManager({ showToast }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const fetchTutorial = async () => {
    setLoading(true)
    try {
      const r = await authFetch('/tutorial')
      const d = await r.json()
      setVideoUrl(d.video_url || null)
    } catch { setVideoUrl(null) }
    setLoading(false)
  }

  useEffect(() => { fetchTutorial() }, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting the same file next time
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      // Not authFetch — it force-sets Content-Type: application/json, which
      // breaks multipart uploads (the browser must set its own boundary).
      const r = await fetch(`${API}/admin/tutorial/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: form,
      })
      if (!r.ok) {
        const e2 = await r.json().catch(() => ({}))
        throw new Error(e2.detail || 'Upload failed')
      }
      const d = await r.json()
      setVideoUrl(d.video_url)
      showToast('Tutorial video uploaded — now visible to users.')
    } catch (err) {
      showToast(err.message, 'error')
    }
    setUploading(false)
  }

  const handleRemove = async () => {
    const r = await authFetch('/admin/tutorial', { method: 'DELETE' })
    if (r.ok) {
      setVideoUrl(null)
      showToast('Tutorial removed — hidden from users again.')
    } else {
      showToast('Failed to remove tutorial', 'error')
    }
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
        Onboarding Tutorial
      </h2>
      <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '20px', lineHeight: 1.6 }}>
        Hidden from users until you upload one. Once uploaded, it appears as a "Tutorial" section in every
        user's dashboard nav, and brand-new signups are taken straight to it right after their first sign-in.
      </p>

      <div style={card}>
        {loading ? (
          <div style={{ color: '#aaa', fontSize: '0.85rem' }}>Loading…</div>
        ) : videoUrl ? (
          <>
            <video src={videoUrl} controls style={{ width: '100%', borderRadius: '8px', background: '#111', marginBottom: '14px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <label style={{ ...btnOutline, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Uploading…' : 'Replace video'}
                <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
              </label>
              <button onClick={handleRemove} style={{ ...btnOutline, borderColor: '#dc2626', color: '#dc2626' }}>
                Remove
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📹</div>
            <p style={{ color: '#999', fontSize: '0.85rem', marginBottom: '16px' }}>No tutorial uploaded yet — not visible to users.</p>
            <label style={{ ...btnRed, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1, display: 'inline-block' }}>
              {uploading ? 'Uploading…' : 'Upload tutorial video'}
              <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Admin Page ────────────────────────────────────────────

export default function Admin() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('showcase') // showcase | jobs | generate
  const [jobs, setJobs] = useState([])
  const [showcase, setShowcase] = useState([])
  const [library, setLibrary] = useState([])
  const [expandedJob, setExpandedJob] = useState(null)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [loadingShowcase, setLoadingShowcase] = useState(false)
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [toast, setToast] = useState({ msg: '', type: 'success' })

  // Generate & assign clip state
  const [genUrl, setGenUrl] = useState('')
  const [genEmail, setGenEmail] = useState('')
  const [genClipCount, setGenClipCount] = useState(10)
  const [genMinDuration, setGenMinDuration] = useState(30)
  const [genMaxDuration, setGenMaxDuration] = useState(90)
  const [genAspect, setGenAspect] = useState('9:16')
  const [genQuality, setGenQuality] = useState('1080p')
  const [genFoundUser, setGenFoundUser] = useState(null)   // { id, email, full_name, plan }
  const [genFindingUser, setGenFindingUser] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genJobId, setGenJobId] = useState(null)
  const [genJob, setGenJob] = useState(null)               // { status, progress, current_step, error_message }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'success' }), 4000)
  }

  const fetchShowcase = async () => {
    setLoadingShowcase(true)
    const r = await authFetch('/admin/showcase')
    const d = await r.json()
    setShowcase(d.videos || [])
    setLoadingShowcase(false)
  }

  const fetchLibrary = async () => {
    setLoadingLibrary(true)
    const r = await authFetch('/admin/library')
    const d = await r.json()
    setLibrary(d.videos || [])
    setLoadingLibrary(false)
  }

  const fetchJobs = async () => {
    setLoadingJobs(true)
    try {
      const r = await authFetch('/admin/jobs')
      const d = await r.json()
      setJobs(d.jobs || [])
    } catch { setJobs([]) }
    setLoadingJobs(false)
  }

  useEffect(() => { fetchShowcase(); fetchLibrary(); }, [])
  useEffect(() => { if (tab === 'jobs') fetchJobs() }, [tab])

  const handleAddToShowcase = async (payload) => {
    const r = await authFetch('/admin/showcase/add', { method: 'POST', body: JSON.stringify(payload) })
    if (r.ok) {
      showToast('Clip added to showcase!')
      fetchShowcase()
    } else {
      const e = await r.json().catch(() => ({}))
      showToast(e.detail || 'Failed to add clip', 'error')
    }
  }

  const handleAddToLibrary = async (payload) => {
    const r = await authFetch('/admin/library/add', { method: 'POST', body: JSON.stringify(payload) })
    if (r.ok) {
      showToast('Clip added to library!')
      fetchLibrary()
    } else {
      const e = await r.json().catch(() => ({}))
      showToast(e.detail || 'Failed to add clip', 'error')
    }
  }

  // Generate & assign — support tool: admin generates clips and hands
  // them to a user by email (e.g. retrying a job that failed for them).
  const handleFindUser = async () => {
    if (!genEmail.trim()) return
    setGenFindingUser(true)
    setGenFoundUser(null)
    try {
      const r = await authFetch(`/admin/users/by-email?email=${encodeURIComponent(genEmail.trim())}`)
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        showToast(e.detail || 'User not found', 'error')
      } else {
        setGenFoundUser(await r.json())
      }
    } catch {
      showToast('Failed to look up user', 'error')
    }
    setGenFindingUser(false)
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!genUrl.trim() || !genFoundUser) return
    setGenLoading(true)
    setGenJob(null)
    try {
      const r = await authFetch('/admin/jobs/assign', {
        method: 'POST',
        body: JSON.stringify({
          email: genFoundUser.email,
          youtube_url: genUrl.trim(),
          options: {
            clip_count: genClipCount,
            min_duration: genMinDuration,
            max_duration: genMaxDuration,
            aspect: genAspect,
            quality: genQuality,
          },
        }),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e.detail || 'Failed to start job')
      }
      const d = await r.json()
      setGenJobId(d.job_id)
      setGenJob({ status: 'processing', progress: 0, current_step: 'Starting...' })
    } catch (err) {
      showToast(err.message, 'error')
    }
    setGenLoading(false)
  }

  useEffect(() => {
    if (!genJobId) return
    if (genJob && (genJob.status === 'completed' || genJob.status === 'failed' || genJob.status === 'error')) return
    const t = setInterval(async () => {
      try {
        const r = await authFetch(`/admin/jobs/${genJobId}/status`)
        if (r.ok) setGenJob(await r.json())
      } catch { /* keep polling */ }
    }, 3000)
    return () => clearInterval(t)
  }, [genJobId, genJob])

  // Status badge helper
  const statusBadge = (status) => {
    const map = {
      completed: ['#16a34a', '#f0fdf4'],
      processing: ['#cf1322', '#fef2f2'],
      queued: ['#ca8a04', '#fefce8'],
      failed: ['#dc2626', '#fef2f2'],
    }
    const [color, bg] = map[status] || ['#666', '#f4f4f4']
    return <span style={{ ...badge(color, bg), textTransform: 'capitalize' }}>{status}</span>
  }

  const tabStyle = (active) => ({
    padding: '9px 20px', fontWeight: 700, fontSize: '0.82rem',
    background: active ? '#cf1322' : 'transparent',
    color: active ? '#fff' : '#555',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ background: '#f9f9f9', minHeight: '100vh' }}>

      {/* Top bar */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e5e5',
        padding: '0 5%', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '60px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo size={28} />
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#111' }}>ShortClipr</span>
          <span style={{ ...badge('#cf1322'), marginLeft: '4px' }}>⚡ Admin</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: '#999', alignSelf: 'center' }}>{user?.email}</span>
          <button onClick={() => navigate('/youtube-shorts/dashboard')} style={{ ...btnOutline, fontSize: '0.78rem' }}>
            ← Dashboard
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 5%' }}>

        {/* Page header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111', letterSpacing: '-0.03em', marginBottom: '4px' }}>
            Admin Panel
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#999' }}>
            Manage showcase videos · Generate clips · Control landing page content
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', background: '#f4f4f4',
          borderRadius: '10px', padding: '4px', width: 'fit-content',
          marginBottom: '24px',
        }}>
          {[
            { key: 'showcase', label: '🎬 Showcase' },
            { key: 'library', label: '📚 Library' },
            { key: 'jobs', label: '📋 All Jobs' },
            { key: 'generate', label: '⚡ Generate & Assign' },
            { key: 'tutorial', label: '📹 Tutorial' },
            { key: 'tiktok', label: '🎵 TikTok' },
            { key: 'email', label: '📧 Email' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={tabStyle(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Showcase tab ── */}
        {tab === 'showcase' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111' }}>Landing Page Showcase</h2>
                <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px' }}>
                  These clips appear in the infinite video carousel on the landing page.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ ...badge('#16a34a', '#f0fdf4') }}>{showcase.length} videos</span>
                <button onClick={fetchShowcase} style={{ ...btnOutline, fontSize: '0.75rem', padding: '6px 12px' }}>
                  🔄 Refresh
                </button>
                <button onClick={() => setTab('jobs')} style={{ ...btnRed, padding: '8px 16px', fontSize: '0.78rem', boxShadow: '2px 2px 0 #111' }}>
                  + Add from Jobs →
                </button>
              </div>
            </div>

            {loadingShowcase ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#aaa', padding: '20px' }}>
                <div style={{ width: '18px', height: '18px', border: '2px solid #fecaca', borderTopColor: '#cf1322', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Loading showcase…
              </div>
            ) : (
              <ShowcaseManager
                showcaseVideos={showcase}
                onDelete={fetchShowcase}
                onRefresh={fetchShowcase}
              />
            )}
          </div>
        )}

        {/* ── Library tab ── */}
        {tab === 'library' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111' }}>Paywall Library</h2>
                <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px' }}>
                  These clips appear to free users when they attempt to generate clips, showing what's possible with a paid plan.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ ...badge('#16a34a', '#f0fdf4') }}>{library.length} videos</span>
                <button onClick={fetchLibrary} style={{ ...btnOutline, fontSize: '0.75rem', padding: '6px 12px' }}>
                  🔄 Refresh
                </button>
                <button onClick={() => setTab('jobs')} style={{ ...btnRed, padding: '8px 16px', fontSize: '0.78rem', boxShadow: '2px 2px 0 #111' }}>
                  + Add from Jobs →
                </button>
              </div>
            </div>

            {loadingLibrary ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#aaa', padding: '20px' }}>
                <div style={{ width: '18px', height: '18px', border: '2px solid #fecaca', borderTopColor: '#cf1322', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Loading library…
              </div>
            ) : (
              <LibraryManager
                libraryVideos={library}
                onDelete={fetchLibrary}
                onRefresh={fetchLibrary}
              />
            )}
          </div>
        )}

        {/* ── Jobs tab ── */}
        {tab === 'jobs' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111' }}>All Jobs</h2>
                <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px' }}>
                  Click a completed job to view its clips, then add them to the showcase.
                </p>
              </div>
              <button onClick={fetchJobs} style={{ ...btnOutline, fontSize: '0.75rem', padding: '6px 12px' }}>
                🔄 Refresh
              </button>
            </div>

            {loadingJobs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#aaa', padding: '20px' }}>
                <div style={{ width: '18px', height: '18px', border: '2px solid #fecaca', borderTopColor: '#cf1322', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Loading jobs…
              </div>
            ) : !jobs.length ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
                <p>No jobs found. Generate some clips first.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {jobs.map(job => (
                  <div key={job.job_id} style={{ ...card }}>
                    {/* Job header */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: (job.status === 'completed' || job.feedback_count > 0) ? 'pointer' : 'default', flexWrap: 'wrap', gap: '10px' }}
                      onClick={() => (job.status === 'completed' || job.feedback_count > 0) && setExpandedJob(expandedJob === job.job_id ? null : job.job_id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
                          {job.video_title || job.youtube_url}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#999' }}>
                          {job.user_email} · {new Date(job.created_at).toLocaleString()} · {job.options?.clip_count || '?'} clips
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {statusBadge(job.status)}
                        {job.feedback_count > 0 && <span style={badge('#7c3aed', '#f5f3ff')}>📝 Feedback</span>}
                        {(job.status === 'completed' || job.feedback_count > 0) && (
                          <span style={{ fontSize: '0.78rem', color: '#cf1322', fontWeight: 600 }}>
                            {expandedJob === job.job_id ? '▲ Hide' : '▼ View'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded clip list + feedback */}
                    {expandedJob === job.job_id && (job.status === 'completed' || job.feedback_count > 0) && (
                      <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '14px' }}>
                        {job.status === 'completed' && (
                          <JobClips
                            jobId={job.job_id}
                            onAddToShowcase={(payload) => {
                              handleAddToShowcase(payload)
                            }}
                            onAddToLibrary={(payload) => {
                              handleAddToLibrary(payload)
                            }}
                          />
                        )}
                        <div style={{ marginTop: job.status === 'completed' ? '14px' : 0 }}>
                          <JobFeedback jobId={job.job_id} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Generate & Assign tab ── */}
        {tab === 'generate' && (
          <div style={{ maxWidth: '600px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
              Generate & Assign Clip
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '20px', lineHeight: 1.6 }}>
              Support tool: generate clips for a YouTube URL and hand them directly to a user — e.g. when their
              own job failed. The job runs exactly like a normal user job: it shows up in their dashboard and
              they get the same "clips ready" email, but it doesn't cost them any plan credits.
            </p>

            <form onSubmit={handleGenerate} style={{ ...card }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                  User email
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="email" value={genEmail}
                    onChange={e => { setGenEmail(e.target.value); setGenFoundUser(null) }}
                    placeholder="user@example.com"
                    style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #ddd', outline: 'none', fontSize: '0.88rem' }}
                  />
                  <button type="button" onClick={handleFindUser} disabled={genFindingUser || !genEmail.trim()}
                    style={{ ...btnOutline, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {genFindingUser ? 'Looking…' : 'Find user'}
                  </button>
                </div>
                {genFoundUser && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={badge('#16a34a', '#f0fdf4')}>✓ {genFoundUser.full_name || genFoundUser.email}</span>
                    <span style={badge('#666', '#f4f4f4')}>{genFoundUser.plan} plan</span>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                  YouTube URL
                </label>
                <input
                  type="url" value={genUrl} onChange={e => setGenUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #ddd', outline: 'none', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', display: 'block', marginBottom: '6px' }}>Clip count</label>
                  <input type="number" min={1} max={10} value={genClipCount} onChange={e => setGenClipCount(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #ddd', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', display: 'block', marginBottom: '6px' }}>Quality</label>
                  <select value={genQuality} onChange={e => setGenQuality(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #ddd', outline: 'none', fontSize: '0.85rem' }}>
                    {['360p', '480p', '720p', '1080p'].map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', display: 'block', marginBottom: '6px' }}>Min duration (s)</label>
                  <input type="number" min={5} value={genMinDuration} onChange={e => setGenMinDuration(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #ddd', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', display: 'block', marginBottom: '6px' }}>Max duration (s)</label>
                  <input type="number" min={5} value={genMaxDuration} onChange={e => setGenMaxDuration(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #ddd', outline: 'none', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#555', display: 'block', marginBottom: '6px' }}>Aspect</label>
                  <select value={genAspect} onChange={e => setGenAspect(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #ddd', outline: 'none', fontSize: '0.85rem' }}>
                    {['9:16', '16:9', '1:1'].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <button type="submit" disabled={genLoading || !genUrl.trim() || !genFoundUser || (genJob && genJob.status === 'processing')}
                style={{ ...btnRed, width: '100%', padding: '13px', fontSize: '0.88rem' }}>
                {genLoading ? 'Starting…' : `⚡ Generate & assign to ${genFoundUser ? genFoundUser.email : 'user'}`}
              </button>
            </form>

            {genJob && (
              <div style={{ ...card, marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.78rem', color: '#666' }}>
                  <span>{genJob.current_step || '...'}</span>
                  <span>{genJob.progress || 0}%</span>
                </div>
                <div style={{ background: '#f4f4f4', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${genJob.progress || 0}%`,
                    background: (genJob.status === 'failed' || genJob.status === 'error') ? '#dc2626' : 'linear-gradient(90deg,#cf1322,#ff6b6b)',
                    borderRadius: '4px', transition: 'width 0.5s ease',
                  }} />
                </div>
                {(genJob.status === 'failed' || genJob.status === 'error') && (
                  <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '0.8rem' }}>❌ {genJob.error_message}</div>
                )}
                {genJob.status === 'completed' && (
                  <div style={{ marginTop: '10px', color: '#16a34a', fontSize: '0.85rem', fontWeight: 600 }}>
                    ✓ Done — {genFoundUser?.email} has been notified and can see the clips in their dashboard.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Email tab ── */}
        {tab === 'email' && (
          <EmailBroadcast showToast={showToast} />
        )}

        {/* ── Tutorial tab ── */}
        {tab === 'tutorial' && (
          <TutorialManager showToast={showToast} />
        )}

        {/* ── TikTok mock accounts tab ── */}
        {tab === 'tiktok' && (
          <AdminTikTokAccounts />
        )}
      </div>

      <Toast msg={toast.msg} type={toast.type} />
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  )
}

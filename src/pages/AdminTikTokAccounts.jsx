import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────
// AdminTikTokAccounts — admin-only mock TikTok profile builder.
//
// Lets the admin spin up multiple fake TikTok "accounts" (avatar, handle,
// display name, bio, follower/following/like counts) and file generated
// clips — from either product (YT-Shorts or Brainrot) — into any of them.
// The profile itself renders like the real tiktok.com/@handle page so it's
// immediately recognizable as a TikTok mockup; every admin-only control
// (edit/delete/remove-clip/switch-account) is deliberately styled OUTSIDE
// that mockup frame so it's never confused with real TikTok chrome.
//
// This is a purely internal staging tool — nothing here posts to TikTok
// or is shown to end users. `AddToTikTokAccountButton` (exported below) is
// dropped into the YT-Shorts and Brainrot job lists in Admin.jsx so any
// generated clip can be filed into one of these mock profiles in one click.
// ─────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const token = () => localStorage.getItem('sc_token')
const authFetch = (url, opts = {}) =>
  fetch(`${API}${url}`, { ...opts, headers: { Authorization: `Bearer ${token()}`, ...opts.headers } })
const authFetchJson = (url, opts = {}) =>
  authFetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } })

// ── TikTok brand colors — used as-is throughout this file ──────
const TT_PINK = '#FE2C55'
const TT_CYAN = '#25F4EE'
const TT_INK  = '#161823'
const TT_GREY = '#75777C'

// ── Shared local styles ─────────────────────────────────────────
const card = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px' }
const btnRed = {
  background: '#cf1322', color: '#fff', border: '2px solid #111', borderRadius: '8px',
  padding: '9px 18px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', boxShadow: '2px 2px 0 #111',
}
const btnOutline = {
  background: 'transparent', color: '#cf1322', border: '1.5px solid #cf1322', borderRadius: '8px',
  padding: '7px 14px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
}
const labelStyle = { fontSize: '0.68rem', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }
const inputStyle = { width: '100%', border: '1.5px solid #e5e5e5', borderRadius: '8px', padding: '9px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }

// ── TikTok logomark — stylized note with the signature cyan/pink
//    chromatic-offset treatment. Not a traced/official asset; a
//    recognizable approximation used for internal preview purposes. ──
function TikTokMark({ size = 22 }) {
  const notePath = 'M15 3.5 C15 3.5 15 19 15 19 C15 19 12.3 15.2 7.4 15.2 C3.3 15.2 0 18.4 0 22.4 C0 26.4 3.3 29.6 7.4 29.6 C11.5 29.6 14.4 26.6 14.4 22.6 L14.4 10.4 C16.9 12.2 19.7 13.1 22.6 13.1 L22.6 7.3 C19.2 7.3 16.4 5.6 15 3.5 Z'
  return (
    <svg width={size} height={size * (32 / 24)} viewBox="0 0 24 32" style={{ display: 'block' }}>
      <path d={notePath} fill={TT_CYAN} transform="translate(-1.1,-1.1)" />
      <path d={notePath} fill={TT_PINK} transform="translate(1.1,1.1)" />
      <path d={notePath} fill={TT_INK} />
    </svg>
  )
}

function TikTokWordmark({ size = 22 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <TikTokMark size={size} />
      <span style={{ fontWeight: 800, fontSize: `${size * 0.72}px`, color: TT_INK, letterSpacing: '-0.02em' }}>TikTok</span>
    </div>
  )
}

function VerifiedBadge({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="10" fill={TT_CYAN} />
      <path d="M5.5 10.2 L8.4 13 L14.5 6.8" stroke="#fff" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Toast (mirrors Admin.jsx's) ─────────────────────────────────
function Toast({ msg, type }) {
  if (!msg) return null
  const color = type === 'error' ? '#dc2626' : '#16a34a'
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: '#fff', border: `2px solid ${color}`, borderRadius: '10px', padding: '12px 20px',
      boxShadow: `3px 3px 0 ${color}`, fontSize: '0.85rem', fontWeight: 600, color, maxWidth: '360px',
    }}>{type === 'error' ? '❌ ' : '✅ '}{msg}</div>
  )
}

// ─────────────────────────────────────────────────────────────────
// AddToTikTokAccountButton — dropped into the YT-Shorts / Brainrot job
// lists so any clip can be filed into a mock account in one click.
// ─────────────────────────────────────────────────────────────────
export function AddToTikTokAccountButton({ clip, size = 'normal' }) {
  const [open, setOpen] = useState(false)
  const [accounts, setAccounts] = useState(null) // null = not fetched yet
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState(null)
  const [addedIds, setAddedIds] = useState(new Set())

  const openMenu = async () => {
    setOpen(o => !o)
    if (accounts === null) {
      setLoading(true)
      try {
        const r = await authFetchJson('/admin/tiktok/accounts')
        const d = await r.json()
        setAccounts(d.accounts || [])
      } catch {
        setAccounts([])
      }
      setLoading(false)
    }
  }

  const addTo = async (accountId) => {
    setAddingId(accountId)
    try {
      const r = await authFetchJson(`/admin/tiktok/accounts/${accountId}/clips`, {
        method: 'POST',
        body: JSON.stringify(clip),
      })
      if (r.ok) {
        setAddedIds(s => new Set([...s, accountId]))
      }
    } finally {
      setAddingId(null)
    }
  }

  const small = size === 'small'

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: small ? '100%' : 'auto' }}>
      <button
        onClick={openMenu}
        style={{
          width: small ? '100%' : 'auto',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          background: '#fff', color: TT_PINK, border: `1.5px solid ${TT_PINK}`,
          borderRadius: '7px', padding: small ? '6px 8px' : '7px 14px',
          fontWeight: 700, fontSize: small ? '0.72rem' : '0.78rem', cursor: 'pointer',
        }}
      >
        <TikTokMark size={12} /> Add to Account
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 999,
            background: '#fff', border: '1.5px solid #111', borderRadius: '10px',
            boxShadow: '3px 3px 0 #111', width: '240px', maxHeight: '280px', overflowY: 'auto',
          }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid #f0f0f0', fontSize: '0.7rem', fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              File into account
            </div>
            {loading ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#aaa', fontSize: '0.8rem' }}>Loading…</div>
            ) : !accounts?.length ? (
              <div style={{ padding: '14px 12px', color: '#999', fontSize: '0.78rem', lineHeight: 1.5 }}>
                No mock accounts yet. Create one in the <strong>🎵 TikTok</strong> tab first.
              </div>
            ) : (
              accounts.map(a => {
                const added = addedIds.has(a.id)
                return (
                  <button
                    key={a.id}
                    disabled={added || addingId === a.id}
                    onClick={() => addTo(a.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
                      padding: '9px 12px', background: 'transparent', border: 'none',
                      borderBottom: '1px solid #f7f7f7', cursor: added ? 'default' : 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '50%', background: '#eee', flexShrink: 0,
                      backgroundImage: a.avatar_url ? `url(${a.avatar_url})` : undefined,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#999',
                    }}>
                      {!a.avatar_url && '🎵'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{a.handle}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#999' }}>{a.clip_count} clip{a.clip_count === 1 ? '' : 's'}</div>
                    </div>
                    <span style={{ fontSize: '0.9rem', color: added ? '#16a34a' : (addingId === a.id ? '#ccc' : TT_PINK) }}>
                      {added ? '✓' : (addingId === a.id ? '…' : '+')}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Account editor modal — create or edit a mock account's profile fields
// ─────────────────────────────────────────────────────────────────
function AccountEditorModal({ account, onClose, onSaved, showToast }) {
  const isNew = !account
  const [handle, setHandle] = useState(account?.handle || '')
  const [displayName, setDisplayName] = useState(account?.display_name || '')
  const [bio, setBio] = useState(account?.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(account?.avatar_url || '')
  const [followers, setFollowers] = useState(account?.followers || '0')
  const [following, setFollowing] = useState(account?.following || '0')
  const [likes, setLikes] = useState(account?.likes || '0')
  const [verified, setVerified] = useState(account?.verified || false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const handleAvatarPick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await authFetch('/admin/tiktok/accounts/avatar', { method: 'POST', body: form })
      if (!r.ok) throw new Error('Upload failed')
      const d = await r.json()
      setAvatarUrl(d.url)
    } catch (e2) {
      showToast(e2.message || 'Avatar upload failed', 'error')
    }
    setUploading(false)
  }

  const save = async () => {
    const cleanHandle = handle.trim().replace(/^@/, '')
    if (!cleanHandle) return showToast('Handle is required', 'error')
    setSaving(true)
    try {
      const body = {
        handle: cleanHandle, display_name: displayName, bio, avatar_url: avatarUrl,
        followers, following, likes, verified,
      }
      const r = isNew
        ? await authFetchJson('/admin/tiktok/accounts', { method: 'POST', body: JSON.stringify(body) })
        : await authFetchJson(`/admin/tiktok/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Save failed')
      const d = await r.json()
      showToast(isNew ? 'Account created!' : 'Account updated!')
      onSaved(d.account)
    } catch (e2) {
      showToast(e2.message, 'error')
    }
    setSaving(false)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '460px',
        maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.35)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TikTokMark size={18} />
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111', margin: 0 }}>
              {isNew ? 'New mock account' : 'Edit account'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.1rem', color: '#999', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                width: '68px', height: '68px', borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                background: avatarUrl ? `url(${avatarUrl}) center/cover` : '#f0f0f0',
                border: '2px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', color: '#bbb', position: 'relative',
              }}
            >
              {!avatarUrl && '👤'}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: uploading ? 1 : 0,
                transition: 'opacity 0.15s', color: '#fff', fontSize: '0.7rem', fontWeight: 700,
              }}>{uploading ? '…' : ''}</div>
            </div>
            <div>
              <button type="button" onClick={() => fileRef.current?.click()} style={{ ...btnOutline, padding: '6px 12px', fontSize: '0.75rem' }} disabled={uploading}>
                {uploading ? 'Uploading…' : (avatarUrl ? 'Change photo' : 'Upload photo')}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarPick} style={{ display: 'none' }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Handle</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #e5e5e5', borderRadius: '8px', overflow: 'hidden' }}>
              <span style={{ padding: '9px 0 9px 12px', color: '#999', fontSize: '0.85rem' }}>@</span>
              <input value={handle} onChange={e => setHandle(e.target.value.replace(/\s/g, ''))}
                placeholder="username" style={{ ...inputStyle, border: 'none', paddingLeft: '4px' }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Display name</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Shown above the handle" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Bio ({bio.length}/150)</label>
            <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 150))} rows={3}
              placeholder="Profile bio…" style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Following</label>
              <input value={following} onChange={e => setFollowing(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Followers</label>
              <input value={followers} onChange={e => setFollowers(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Likes</label>
              <input value={likes} onChange={e => setLikes(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 600, color: '#333', cursor: 'pointer' }}>
            <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: TT_CYAN }} />
            Verified badge
          </label>
        </div>

        <div style={{ padding: '16px 24px 22px', display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #eee' }}>
          <button onClick={onClose} style={{ ...btnOutline, borderColor: '#ccc', color: '#666' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btnRed, background: TT_PINK, boxShadow: `2px 2px 0 ${TT_INK}`, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : (isNew ? 'Create account' : 'Save changes')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// The TikTok-style profile mockup itself — real layout/colors/sizing
// ─────────────────────────────────────────────────────────────────
function ProfileMockup({ account, clips, onRemoveClip }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: '2px',
      maxWidth: '692px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif',
    }}>
      {/* Mini browser-style top bar so it reads unmistakably as a TikTok page preview */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f1f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <TikTokWordmark size={20} />
        <span style={{ fontSize: '0.72rem', color: '#bbb' }}>tiktok.com/@{account.handle}</span>
      </div>

      {/* Profile header */}
      <div style={{ padding: '32px 24px 0' }}>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{
            width: '116px', height: '116px', borderRadius: '50%', flexShrink: 0,
            background: account.avatar_url ? `url(${account.avatar_url}) center/cover` : `linear-gradient(135deg, ${TT_CYAN}, ${TT_PINK})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '2rem', fontWeight: 800,
          }}>
            {!account.avatar_url && (account.display_name || account.handle || '?').slice(0, 1).toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: '220px', paddingTop: '2px' }}>
            <div style={{ fontSize: '1.55rem', fontWeight: 700, color: TT_INK, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {account.display_name || account.handle}
              {account.verified && <VerifiedBadge size={18} />}
            </div>
            <div style={{ fontSize: '0.95rem', color: TT_GREY, fontWeight: 600, marginTop: '2px', marginBottom: '16px' }}>
              @{account.handle}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
              <button style={{
                background: TT_PINK, color: '#fff', border: 'none', borderRadius: '4px',
                padding: '8px 34px', fontWeight: 700, fontSize: '0.92rem', cursor: 'default',
              }}>Follow</button>
              <button style={{
                background: '#f1f1f2', color: TT_INK, border: 'none', borderRadius: '4px',
                padding: '8px 20px', fontWeight: 700, fontSize: '0.92rem', cursor: 'default',
              }}>Message</button>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {[
                ['following', account.following],
                ['followers', account.followers],
                ['likes', account.likes],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: TT_INK }}>{val}</span>
                  <span style={{ fontSize: '0.85rem', color: TT_GREY }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bio */}
        {account.bio && (
          <div style={{ fontSize: '0.9rem', color: TT_INK, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginTop: '2px', marginBottom: '20px', maxWidth: '520px' }}>
            {account.bio}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #f1f1f2', marginTop: account.bio ? 0 : '8px' }}>
          <div style={{ padding: '14px 0', borderBottom: `2px solid ${TT_INK}`, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" fill={TT_INK}/><rect x="14" y="3" width="7" height="7" rx="1" fill={TT_INK}/><rect x="3" y="14" width="7" height="7" rx="1" fill={TT_INK}/><rect x="14" y="14" width="7" height="7" rx="1" fill={TT_INK}/></svg>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: TT_INK }}>Videos</span>
          </div>
          <div style={{ padding: '14px 0', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21s-8-4.6-8-11.2C4 6 6.5 4 9.2 4c1.7 0 3.1.9 3.8 2.2C13.7 4.9 15.1 4 16.8 4 19.5 4 22 6 22 9.8 22 16.4 12 21 12 21Z" stroke={TT_GREY} strokeWidth="1.6"/></svg>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: TT_GREY }}>Liked</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: '2px 2px 24px' }}>
        {!clips.length ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#bbb' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🎬</div>
            <p style={{ fontSize: '0.85rem' }}>No videos filed into this account yet.</p>
            <p style={{ fontSize: '0.76rem', marginTop: '4px' }}>Add clips from the Jobs tab's "Add to Account" button.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '2px' }}>
            {clips.map(c => (
              <div key={c.id} style={{ position: 'relative', aspectRatio: '3 / 4', background: '#000', overflow: 'hidden' }}
                onMouseEnter={e => e.currentTarget.querySelector('.tt-remove').style.opacity = 1}
                onMouseLeave={e => e.currentTarget.querySelector('.tt-remove').style.opacity = 0}
              >
                {c.video_url ? (
                  <video src={c.video_url} muted loop playsInline poster={c.thumbnail_url}
                    onMouseEnter={e => e.currentTarget.play().catch(() => {})}
                    onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>🎬</div>
                )}
                <div style={{
                  position: 'absolute', bottom: '6px', left: '6px', display: 'flex', alignItems: 'center', gap: '4px',
                  color: '#fff', fontSize: '0.72rem', fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                  {c.likes || '—'}
                </div>
                <span
                  title={c.source === 'brainrot' ? 'Brainrot' : 'YT-Shorts'}
                  style={{
                    position: 'absolute', top: '6px', left: '6px', fontSize: '0.6rem', fontWeight: 800,
                    padding: '2px 6px', borderRadius: '4px', color: '#fff', letterSpacing: '0.04em',
                    background: c.source === 'brainrot' ? 'rgba(124,58,237,0.85)' : 'rgba(207,19,34,0.85)',
                  }}
                >{c.source === 'brainrot' ? 'BRAINROT' : 'YT-SHORTS'}</span>
                <button
                  className="tt-remove"
                  onClick={() => onRemoveClip(c.id)}
                  title="Remove from account"
                  style={{
                    position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px',
                    borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none',
                    fontSize: '0.8rem', cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main panel — account switcher + toolbar + mockup
// ─────────────────────────────────────────────────────────────────
export default function AdminTikTokAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [clips, setClips] = useState([])
  const [loadingClips, setLoadingClips] = useState(false)
  const [editing, setEditing] = useState(null) // null closed, {} = new, account obj = edit
  const [toast, setToast] = useState({ msg: '', type: 'success' })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'success' }), 4000)
  }

  const fetchAccounts = async (keepSelected = true) => {
    setLoadingAccounts(true)
    try {
      const r = await authFetchJson('/admin/tiktok/accounts')
      const d = await r.json()
      const list = d.accounts || []
      setAccounts(list)
      if (!keepSelected || !list.some(a => a.id === selectedId)) {
        setSelectedId(list[0]?.id || null)
      }
    } catch {
      setAccounts([])
    }
    setLoadingAccounts(false)
  }

  useEffect(() => { fetchAccounts(false) }, [])

  const fetchClips = async (accountId) => {
    if (!accountId) return setClips([])
    setLoadingClips(true)
    try {
      const r = await authFetchJson(`/admin/tiktok/accounts/${accountId}/clips`)
      const d = await r.json()
      setClips(d.clips || [])
    } catch {
      setClips([])
    }
    setLoadingClips(false)
  }

  useEffect(() => { fetchClips(selectedId) }, [selectedId])

  const selectedAccount = accounts.find(a => a.id === selectedId) || null

  const handleDeleteAccount = async (a) => {
    if (!window.confirm(`Delete @${a.handle} and all ${a.clip_count} filed clip(s)? This can't be undone.`)) return
    const r = await authFetch(`/admin/tiktok/accounts/${a.id}`, { method: 'DELETE' })
    if (r.ok) {
      showToast('Account deleted')
      fetchAccounts(false)
    } else {
      showToast('Failed to delete account', 'error')
    }
  }

  const handleRemoveClip = async (clipRowId) => {
    if (!selectedId) return
    const r = await authFetch(`/admin/tiktok/accounts/${selectedId}/clips/${clipRowId}`, { method: 'DELETE' })
    if (r.ok) {
      setClips(cs => cs.filter(c => c.id !== clipRowId))
      fetchAccounts() // refresh clip_count badge on the chip
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TikTokMark size={18} /> Mock TikTok Accounts
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px' }}>
            Internal staging tool — build fake TikTok profiles and file generated clips into them. Never posted to real TikTok.
          </p>
        </div>
        <button onClick={() => setEditing({})} style={{ ...btnRed, background: TT_PINK, boxShadow: `2px 2px 0 ${TT_INK}` }}>
          + New Account
        </button>
      </div>

      {/* Account switcher chips */}
      {loadingAccounts ? (
        <div style={{ color: '#aaa', fontSize: '0.82rem', padding: '10px 0' }}>Loading accounts…</div>
      ) : !accounts.length ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px', color: '#aaa' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎵</div>
          <p>No mock accounts yet. Create one to start filing clips.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
            {accounts.map(a => {
              const active = a.id === selectedId
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    background: active ? TT_INK : '#fff',
                    border: `1.5px solid ${active ? TT_INK : '#e5e5e5'}`,
                    borderRadius: '100px', padding: '5px 12px 5px 5px', cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    background: a.avatar_url ? `url(${a.avatar_url}) center/cover` : `linear-gradient(135deg, ${TT_CYAN}, ${TT_PINK})`,
                  }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: active ? '#fff' : '#111' }}>@{a.handle}</span>
                  <span style={{ fontSize: '0.68rem', color: active ? '#ccc' : '#999' }}>{a.clip_count}</span>
                </button>
              )
            })}
          </div>

          {selectedAccount && (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={() => setEditing(selectedAccount)} style={{ ...btnOutline, borderColor: TT_PINK, color: TT_PINK }}>✏ Edit profile</button>
                <button onClick={() => handleDeleteAccount(selectedAccount)} style={{ ...btnOutline, borderColor: '#dc2626', color: '#dc2626' }}>🗑 Delete account</button>
              </div>

              {loadingClips ? (
                <div style={{ color: '#aaa', fontSize: '0.82rem', padding: '20px', textAlign: 'center' }}>Loading profile…</div>
              ) : (
                <ProfileMockup account={selectedAccount} clips={clips} onRemoveClip={handleRemoveClip} />
              )}
            </>
          )}
        </>
      )}

      {editing !== null && (
        <AccountEditorModal
          account={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          showToast={showToast}
          onSaved={(saved) => {
            setEditing(null)
            fetchAccounts(false)
            setSelectedId(saved.id)
          }}
        />
      )}

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  )
}

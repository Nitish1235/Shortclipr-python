import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const QUESTIONS = [
  {
    key: 'source',
    label: 'Where did you find ShortClipr?',
    options: ['Google Search', 'YouTube', 'TikTok or Instagram', 'Twitter (X)', 'Reddit', 'A friend or colleague', 'Other'],
  },
  {
    key: 'visit_reason',
    label: 'What brings you here today?',
    options: ['Just want a few free clips', 'Trying it out, might upgrade later', 'Ready to buy if it delivers', 'Comparing it to other tools', 'Other'],
  },
  {
    key: 'blocker',
    label: "What's stopping you from upgrading to a paid plan?",
    options: ['Price', "Haven't seen enough value yet", 'Still just testing', 'Missing a feature I need', "Not my decision to make", 'Other'],
  },
]

const cardStyle = {
  border: '1.5px solid #e5e5e5', borderRadius: '10px',
  padding: '10px 14px', display: 'block', width: '100%',
  textAlign: 'left', fontSize: '.84rem', fontWeight: 600,
  cursor: 'pointer', marginBottom: '7px', transition: 'border-color .15s, background .15s',
}

function QuestionBlock({ q, value, otherValue, onChange, onOtherChange }) {
  return (
    <div style={{ marginBottom: '22px' }}>
      <div style={{ fontSize: '.86rem', fontWeight: 700, color: '#111', marginBottom: '10px' }}>{q.label}</div>
      {q.options.map(opt => {
        const selected = value === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              ...cardStyle,
              borderColor: selected ? '#cf1322' : '#e5e5e5',
              background: selected ? '#fef2f2' : '#fff',
              color: selected ? '#cf1322' : '#333',
            }}
          >
            {selected ? '● ' : '○ '}{opt}
          </button>
        )
      })}
      {value === 'Other' && (
        <input
          value={otherValue}
          onChange={e => onOtherChange(e.target.value)}
          placeholder="Tell us more…"
          style={{
            width: '100%', border: '1.5px solid #e5e5e5', borderRadius: '8px',
            padding: '9px 12px', fontSize: '.82rem', marginTop: '2px', boxSizing: 'border-box',
            outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = '#cf1322'}
          onBlur={e => e.target.style.borderColor = '#e5e5e5'}
        />
      )}
    </div>
  )
}

export default function FeedbackModal({ jobId, onSkip, onSubmitted }) {
  const [answers, setAnswers] = useState({ source: '', visit_reason: '', blocker: '' })
  const [others, setOthers]   = useState({ source: '', visit_reason: '', blocker: '' })
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const allAnswered = QUESTIONS.every(q => answers[q.key])

  const handleSubmit = async () => {
    if (!allAnswered) { setError('Pick an answer for each question — takes 10 seconds!'); return }
    setError('')
    setSubmitting(true)
    try {
      const token = localStorage.getItem('sc_token')
      const res = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          job_id: jobId,
          source: answers.source, source_other: answers.source === 'Other' ? others.source : null,
          visit_reason: answers.visit_reason, visit_reason_other: answers.visit_reason === 'Other' ? others.visit_reason : null,
          blocker: answers.blocker, blocker_other: answers.blocker === 'Other' ? others.blocker : null,
          comment: comment.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Something went wrong — please try again.')
      }
      onSubmitted()
    } catch (e) {
      setError(e.message)
    }
    setSubmitting(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.3)',
        maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#fef2f2', border: '1px solid #fecaca', color: '#cf1322',
            borderRadius: '100px', padding: '3px 10px', fontSize: '.68rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10,
          }}>🎁 Answer & unlock a free download</div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
            While your clips generate — got 30 seconds?
          </h2>
          <p style={{ fontSize: '.82rem', color: '#666', marginTop: 6, lineHeight: 1.5 }}>
            3 quick questions. Answer them and download one clip from this job free — no plan required.
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px' }}>
          {QUESTIONS.map(q => (
            <QuestionBlock
              key={q.key}
              q={q}
              value={answers[q.key]}
              otherValue={others[q.key]}
              onChange={val => setAnswers(a => ({ ...a, [q.key]: val }))}
              onOtherChange={val => setOthers(o => ({ ...o, [q.key]: val }))}
            />
          ))}

          <div style={{ marginBottom: '4px' }}>
            <div style={{ fontSize: '.86rem', fontWeight: 700, color: '#111', marginBottom: '10px' }}>
              Anything else? Did ShortClipr meet your expectations — what did you like or not like?
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Optional — but we read every word."
              rows={3}
              style={{
                width: '100%', border: '1.5px solid #e5e5e5', borderRadius: '8px',
                padding: '10px 12px', fontSize: '.82rem', boxSizing: 'border-box',
                outline: 'none', resize: 'vertical', fontFamily: 'inherit',
              }}
              onFocus={e => e.target.style.borderColor = '#cf1322'}
              onBlur={e => e.target.style.borderColor = '#e5e5e5'}
            />
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: '.8rem', marginTop: 12, fontWeight: 600 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px 24px', borderTop: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button
            onClick={onSkip}
            disabled={submitting}
            style={{
              background: 'transparent', border: 'none', color: '#999',
              fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', padding: '11px 14px',
            }}
          >Skip for now</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              background: '#cf1322', color: '#fff', border: '2px solid #111', borderRadius: 8,
              padding: '11px 22px', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer',
              boxShadow: '2px 2px 0 #111', opacity: submitting ? 0.7 : 1,
            }}
          >{submitting ? 'Submitting…' : 'Submit & unlock download 🎁'}</button>
        </div>
      </div>
    </div>
  )
}

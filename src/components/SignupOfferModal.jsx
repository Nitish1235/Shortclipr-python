import { useEffect } from 'react'

export default function SignupOfferModal({ onContinue }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onContinue()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onContinue])

  return (
    <div className="signup-offer-backdrop" role="presentation">
      <section className="signup-offer-modal" role="dialog" aria-modal="true" aria-labelledby="signup-offer-title">
        <span className="signup-offer-confetti signup-offer-confetti--one" aria-hidden="true">✦</span>
        <span className="signup-offer-confetti signup-offer-confetti--two" aria-hidden="true">✦</span>
        <span className="signup-offer-confetti signup-offer-confetti--three" aria-hidden="true">●</span>
        <div className="signup-offer-seal" aria-hidden="true"><span>✓</span></div>
        <div className="signup-offer-kicker">Welcome to ShortClipr</div>
        <h1 id="signup-offer-title">Congratulations —<br />your 50% off is unlocked.</h1>
        <p>Your new-member price is ready across every paid plan. Pick the plan that fits when you’re ready.</p>
        <div className="signup-offer-price">
          <span>Starter from</span><s>$20</s><strong>$10<span>/mo</span></strong>
        </div>
        <button type="button" onClick={onContinue}>Explore your offer <span aria-hidden="true">→</span></button>
        <small>No code needed · Cancel anytime</small>
      </section>
    </div>
  )
}

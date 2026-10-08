export default function PromotionBar() {
  return (
    <a className="signup-promo-bar" href="#pricing" aria-label="See new-member pricing">
      <span className="signup-promo-bar__spark" aria-hidden="true">✦</span>
      <span><strong>New-member offer</strong> — get <b>50% off</b> every paid plan when you sign up</span>
      <span className="signup-promo-bar__cta">See prices <span aria-hidden="true">→</span></span>
    </a>
  )
}

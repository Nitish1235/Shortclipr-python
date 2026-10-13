import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

export default function Terms() {
  const effective = 'April 21, 2026'
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">📋 LEGAL_DOC › TERMS.TXT</div>
          <h1 className="legal-title">Terms of <span>Service</span></h1>
          <div className="legal-meta">
            Effective date: {effective} &nbsp;·&nbsp; Last updated: {effective}<br />
            ShortClipr ("Company", "we", "our") — shortclipr.com
          </div>

          <div className="legal-alert">
            Please read these Terms carefully before using ShortClipr. By creating an account
            or using the service, you agree to be bound by these Terms.
          </div>

          {/* 1 */}
          <div className="legal-section">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using ShortClipr ("Service"), you agree to these Terms of Service
              and our <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the
              Service. These Terms apply to all users including visitors, registered users, and
              paid subscribers.
            </p>
          </div>

          {/* 2 */}
          <div className="legal-section">
            <h2>2. Description of Service</h2>
            <p>
              ShortClipr is an AI-powered SaaS platform that processes publicly accessible YouTube
              video transcripts to identify high-engagement moments and generates short-form video
              clips (30–90 seconds) optimised for TikTok, Instagram Reels, and YouTube Shorts.
            </p>
            <p>
              The Service uses YouTube's public transcript data and publicly accessible video
              streams. We do not circumvent any access controls or authentication systems.
            </p>
          </div>

          {/* 3 */}
          <div className="legal-section">
            <h2>3. Eligibility</h2>
            <ul>
              <li>You must be at least 13 years old to use this Service</li>
              <li>You must have a valid Google account to sign in</li>
              <li>You represent that all information you provide is accurate</li>
              <li>If using on behalf of an organisation, you represent you have authority to bind that organisation</li>
            </ul>
          </div>

          {/* 4 */}
          <div className="legal-section">
            <h2>4. User Content &amp; Copyright Responsibility</h2>
            <div className="legal-alert warn">
              ⚠️ You are solely responsible for ensuring you have the right to process any video
              through ShortClipr. Submitting videos you do not own or have a licence to repurpose
              may violate copyright law and YouTube's Terms of Service.
            </div>
            <p>By submitting a YouTube URL, you represent that:</p>
            <ul>
              <li>You own the video, or</li>
              <li>You have explicit permission from the copyright holder to create derivative works, or</li>
              <li>The content is in the public domain or licensed under a Creative Commons licence permitting derivatives</li>
            </ul>
            <p>
              ShortClipr is designed for creators processing their own content. We are not liable
              for any copyright infringement arising from user-submitted URLs.
            </p>
          </div>

          {/* 5 */}
          <div className="legal-section">
            <h2>5. Subscription Plans &amp; Billing</h2>
            <h3>5.1 Plan Structure</h3>
            <ul>
              <li><strong>Explore access:</strong> Workflow and showcase access; a paid plan is required for clip generation</li>
              <li><strong>Starter (from $10/month):</strong> 50–180 shorts per month</li>
              <li><strong>Pro (from $45/month):</strong> 350–1,500 shorts per month</li>
            </ul>
            <p>
              Charges are per <strong>video processed</strong>, not per minute of source video.
              A 2-hour video costs the same as a 5-minute video.
            </p>

            <h3>5.2 Billing Cycle</h3>
            <p>
              Paid plans are billed monthly. Your video allowance resets on the same date each
              month. Unused videos do not roll over to the next month.
            </p>

            <h3>5.3 Plan Changes</h3>
            <p>
              You may upgrade or downgrade your plan at any time. Upgrades take effect immediately.
              Downgrades take effect at the start of the next billing cycle.
            </p>
          </div>

          {/* 6 */}
          <div className="legal-section">
            <h2>6. Refund Policy</h2>
            <div className="legal-alert warn">
              ALL SALES ARE FINAL. WE DO NOT OFFER REFUNDS.
            </div>
            <p>
              Due to the computational nature of our service (AI processing, cloud infrastructure,
              video generation), all payments are non-refundable once a billing period has started
              or a job has been processed. Specifically:
            </p>
            <ul>
              <li>Monthly subscription fees are non-refundable</li>
              <li>There are no refunds for partial months</li>
              <li>There are no refunds for unused video allowances</li>
              <li>There are no refunds for processing errors on videos you submitted</li>
            </ul>
            <p>
              If you experience a technical failure caused by our systems, we will credit your
              account with an equivalent video allowance. This is our sole remedy for service
              failures.
            </p>
            <p>
              If you have a billing dispute, contact{' '}
              <a href="mailto:billing@shortclipr.com">billing@shortclipr.com</a> within 7 days
              of the charge.
            </p>
          </div>

          {/* 7 */}
          <div className="legal-section">
            <h2>7. Prohibited Uses</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Process videos you do not have rights to</li>
              <li>Use the Service to generate content that violates YouTube's Terms of Service</li>
              <li>Attempt to reverse-engineer, scrape, or abuse our API</li>
              <li>Share account credentials or resell access</li>
              <li>Use the Service to generate misleading, deceptive, or defamatory content</li>
              <li>Attempt to circumvent rate limits or plan restrictions</li>
              <li>Use automated tools to submit jobs in bulk without our written consent</li>
            </ul>
          </div>

          {/* 8 */}
          <div className="legal-section">
            <h2>8. Service Availability &amp; SLA</h2>
            <p>
              We target 99.0% monthly uptime. The Service is provided "as is." We do not
              guarantee that:
            </p>
            <ul>
              <li>Every YouTube video can be processed (some have restricted transcripts)</li>
              <li>Processing will always complete within a specific time window</li>
              <li>Generated clips will always achieve the virality scores indicated (scores are AI estimates)</li>
            </ul>
            <p>
              We reserve the right to modify or discontinue the Service at any time with 30 days
              notice to registered users. We will pro-rate any unused subscription days if we
              discontinue the Service entirely.
            </p>
          </div>

          {/* 9 */}
          <div className="legal-section">
            <h2>9. Intellectual Property</h2>
            <p>
              <strong>Your content:</strong> You retain all rights to videos you submit and clips we generate.
              We claim no ownership over your generated content.
            </p>
            <p>
              <strong>Our service:</strong> The ShortClipr platform, branding, code, and AI models are our
              intellectual property. You may not copy, resell, or create derivative products from them.
            </p>
            <p>
              <strong>Generated clips:</strong> Clips generated by ShortClipr are derivative works.
              The underlying copyright remains with the original video owner. You are responsible
              for ensuring your use of generated clips complies with applicable law.
            </p>
          </div>

          {/* 10 */}
          <div className="legal-section">
            <h2>10. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, ShortClipr's total liability to you for
              any claim arising out of or relating to these Terms or the Service shall not exceed
              the amount you paid us in the 3 months preceding the claim.
            </p>
            <p>
              We are not liable for: indirect, incidental, special, consequential, or punitive
              damages; loss of profits; loss of data; or business interruption — even if we were
              advised of the possibility of such damages.
            </p>
          </div>

          {/* 11 */}
          <div className="legal-section">
            <h2>11. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the jurisdiction where ShortClipr is
              incorporated. Any disputes will be resolved through binding arbitration, not
              class-action litigation.
            </p>
          </div>

          {/* 12 */}
          <div className="legal-section">
            <h2>12. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. We will provide 14 days notice via email
              for material changes. Continued use after the effective date constitutes acceptance.
            </p>
          </div>

          {/* 13 */}
          <div className="legal-section">
            <h2>13. Contact</h2>
            <ul>
              <li>Legal enquiries: <a href="mailto:legal@shortclipr.com">legal@shortclipr.com</a></li>
              <li>Billing: <a href="mailto:billing@shortclipr.com">billing@shortclipr.com</a></li>
              <li>General: <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a></li>
            </ul>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

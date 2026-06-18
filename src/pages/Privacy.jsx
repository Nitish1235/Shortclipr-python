import './legal.css'
import Navigation from '../components/Navigation'
import Footer from '../components/Footer'

export default function Privacy() {
  const effective = 'June 18, 2026'
  return (
    <>
      <Navigation />
      <div className="legal-page">
        <div className="legal-inner">
          <div className="legal-badge">📋 LEGAL_DOC › PRIVACY.TXT</div>
          <h1 className="legal-title">Privacy <span>Policy</span></h1>
          <div className="legal-meta">
            Effective date: {effective} &nbsp;·&nbsp; Last updated: {effective}<br />
            ShortClipr ("we", "our", "us") — shortclipr.com
          </div>

          <div className="legal-alert">
            This Privacy Policy is required under Google's OAuth API Services User Data Policy
            and YouTube API Services Terms of Service.
            By using ShortClipr with Google Sign-In or connecting your YouTube channel, you acknowledge this policy.
          </div>

          {/* 1 */}
          <div className="legal-section">
            <h2>1. Information We Collect</h2>
            <h3>A. Information from Google Sign-In (OAuth)</h3>
            <p>When you authenticate via Google Sign-In, we receive and store:</p>
            <ul>
              <li><strong>Email address</strong> — used as your account identifier</li>
              <li><strong>Display name</strong> — shown in your account dashboard</li>
              <li><strong>Profile picture URL</strong> — shown in the UI (not stored on our servers)</li>
              <li><strong>Google account ID (sub)</strong> — used to link your identity across logins</li>
            </ul>
            <p>
              Our base OAuth scope is limited to <code>openid</code>, <code>email</code>, and <code>profile</code>.
              If you choose to connect your YouTube channel (optional), we additionally request the
              <code>https://www.googleapis.com/auth/youtube.upload</code> scope as described below.
            </p>

            <h3>B. YouTube Channel Data (Optional — only if you connect YouTube)</h3>
            <p>
              ShortClipr offers an optional feature to publish generated clips directly to your YouTube channel.
              If you choose to connect your YouTube account, we request the following additional OAuth scope:
            </p>
            <ul>
              <li><code>https://www.googleapis.com/auth/youtube.upload</code> — allows ShortClipr to upload videos to your YouTube channel on your behalf</li>
            </ul>
            <p>When this permission is granted, we store:</p>
            <ul>
              <li><strong>YouTube OAuth refresh token</strong> — stored securely in our database, used solely to upload clips you explicitly request to publish</li>
              <li><strong>YouTube OAuth access token</strong> — short-lived token generated at upload time, never stored persistently</li>
            </ul>
            <p>
              We do <strong>not</strong> read your YouTube videos, subscribers, analytics, comments,
              playlists, or any other YouTube data. We only upload videos when you explicitly click
              "Post to YouTube" on a specific clip.
            </p>
            <p>
              You can disconnect your YouTube account at any time from the ShortClipr dashboard
              (Settings → Social Accounts → Disconnect YouTube), which immediately deletes your
              stored OAuth tokens from our servers. You can also revoke access directly via{' '}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                Google Account Permissions
              </a>.
            </p>

            <h3>B. Usage Data</h3>
            <ul>
              <li>YouTube URLs submitted for processing</li>
              <li>Clip settings chosen (duration, style, clip count)</li>
              <li>Number of videos processed per billing cycle</li>
              <li>Plan type (Free / Starter / Pro)</li>
            </ul>

            <h3>C. Payment Data</h3>
            <p>
              Payments are processed by <strong>Dodo Payments</strong>. We never store your card
              numbers, CVV, or full billing details. We only receive a payment confirmation and
              associated email address to update your subscription tier.
            </p>

            <h3>D. Technical / Log Data</h3>
            <ul>
              <li>IP address (in server logs, retained up to 30 days)</li>
              <li>Browser/device type (User-Agent string)</li>
              <li>Pages visited and timestamps</li>
            </ul>
          </div>

          {/* 2 */}
          <div className="legal-section">
            <h2>2. How We Use Your Information</h2>
            <ul>
              <li><strong>Account creation &amp; authentication</strong> — your Google profile data creates your account</li>
              <li><strong>Service delivery</strong> — process YouTube URLs and deliver generated clips</li>
              <li><strong>Billing &amp; plan enforcement</strong> — track videos processed against your monthly limit</li>
              <li><strong>Transactional emails</strong> — payment receipts, service status updates</li>
              <li><strong>Security</strong> — detect and prevent fraud or abuse</li>
            </ul>
            <p>
              We do <strong>not</strong> sell your personal information to third parties.
              We do <strong>not</strong> use your data for advertising purposes.
            </p>
          </div>

          {/* 3 */}
          <div className="legal-section">
            <h2>3. Google API Services &amp; YouTube API — Limited Use Disclosure</h2>
            <div className="legal-alert">
              ShortClipr's use and transfer of information received from Google APIs adheres to
              the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Our use of YouTube API Services is also
              subject to the{' '}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                YouTube Terms of Service
              </a>.
            </div>
            <p>Specifically, ShortClipr:</p>
            <ul>
              <li>Only uses Google user data to authenticate you and provide the ShortClipr service</li>
              <li>Only uploads videos to YouTube when you explicitly request it by clicking "Post to YouTube"</li>
              <li>Does not transfer Google or YouTube user data to third parties except as necessary to provide the service</li>
              <li>Does not use Google or YouTube user data for advertising or marketing purposes</li>
              <li>Does not allow humans to read your Google or YouTube user data except for security or legal compliance purposes</li>
              <li>Does not read, store, or analyze your existing YouTube videos, channel statistics, subscribers, or comments</li>
            </ul>

            <h3>YouTube API Services — Data Deletion</h3>
            <p>
              Data obtained via YouTube API Services (OAuth tokens) can be deleted in two ways:
            </p>
            <ul>
              <li>
                <strong>From ShortClipr dashboard:</strong> Settings → Social Accounts → Disconnect YouTube.
                This immediately and permanently deletes your stored YouTube OAuth tokens from our database.
              </li>
              <li>
                <strong>From Google directly:</strong> Visit{' '}
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                  myaccount.google.com/permissions
                </a>{' '}
                → find ShortClipr → Remove Access.
              </li>
              <li>
                <strong>Account deletion:</strong> Email{' '}
                <a href="mailto:privacy@shortclipr.com">privacy@shortclipr.com</a> to delete your
                entire account, which removes all YouTube tokens within 30 days.
              </li>
            </ul>
          </div>

          {/* 4 */}
          <div className="legal-section">
            <h2>4. Data Sharing &amp; Third Parties</h2>
            <p>We share minimal data with the following service providers:</p>
            <ul>
              <li><strong>Supabase</strong> — database hosting (EU/US cloud). Your account data is stored here.</li>
              <li><strong>Google Cloud Storage</strong> — temporary storage for generated video clips (deleted after 30 days)</li>
              <li><strong>Upstash</strong> — Redis queue service for job processing</li>
              <li><strong>OpenAI</strong> — YouTube transcripts are sent to OpenAI GPT-4o to identify viral moments. No personally identifiable information is sent.</li>
              <li><strong>Dodo Payments</strong> — payment processing. Subject to their privacy policy.</li>
            </ul>
          </div>

          {/* 5 */}
          <div className="legal-section">
            <h2>5. Data Retention</h2>
            <ul>
              <li><strong>Account data:</strong> Retained as long as your account is active. Deleted within 30 days of account deletion request.</li>
              <li><strong>Generated video clips:</strong> Stored for 30 days after creation, then automatically deleted from our servers.</li>
              <li><strong>Server logs:</strong> Retained for 30 days for security purposes.</li>
              <li><strong>Payment records:</strong> Retained for 7 years for tax/legal compliance.</li>
            </ul>
          </div>

          {/* 6 */}
          <div className="legal-section">
            <h2>6. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul>
              <li><strong>Access</strong> — request a copy of the data we hold about you</li>
              <li><strong>Correction</strong> — request correction of inaccurate data</li>
              <li><strong>Deletion</strong> — request deletion of your account and associated data</li>
              <li><strong>Portability</strong> — request your data in a machine-readable format</li>
              <li><strong>Withdraw consent</strong> — revoke Google OAuth access at any time via <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google Account Permissions</a></li>
            </ul>
            <p>
              To exercise these rights, email us at{' '}
              <a href="mailto:privacy@shortclipr.com">privacy@shortclipr.com</a>.
              We respond within 30 days.
            </p>
          </div>

          {/* 7 */}
          <div className="legal-section">
            <h2>7. Cookies</h2>
            <p>We use minimal cookies:</p>
            <ul>
              <li><strong>Essential:</strong> Authentication token (JWT) stored in localStorage — required for login to work</li>
              <li><strong>Analytics:</strong> None. We do not use Google Analytics, Facebook Pixel, or any third-party tracking cookies.</li>
            </ul>
          </div>

          {/* 8 */}
          <div className="legal-section">
            <h2>8. Children's Privacy</h2>
            <p>
              ShortClipr is not directed to children under 13. We do not knowingly collect
              personal information from children under 13. If you believe a child has provided
              us with personal information, contact us at{' '}
              <a href="mailto:privacy@shortclipr.com">privacy@shortclipr.com</a> and we will
              delete it promptly.
            </p>
          </div>

          {/* 9 */}
          <div className="legal-section">
            <h2>9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy periodically. We will notify registered users
              via email for material changes. Continued use of the service after changes
              constitutes acceptance of the updated policy.
            </p>
          </div>

          {/* 10 */}
          <div className="legal-section">
            <h2>10. Contact Us</h2>
            <p>For privacy-related inquiries:</p>
            <ul>
              <li>Email: <a href="mailto:privacy@shortclipr.com">privacy@shortclipr.com</a></li>
              <li>General: <a href="mailto:hello@shortclipr.com">hello@shortclipr.com</a></li>
              <li>Website: <a href="https://shortclipr.com/contact">shortclipr.com/contact</a></li>
            </ul>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

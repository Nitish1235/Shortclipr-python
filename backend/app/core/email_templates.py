"""
email_templates.py — Branded HTML for transactional emails.

Table-based layout with inline styles throughout (no <style> block, no
flexbox/grid) — required for reliable rendering across email clients,
Outlook in particular. Mirrors the app's visual language: red #cf1322
accent, black 2px borders, hard drop-shadow buttons (see src/pages/Admin.jsx
and src/pages/Billing.jsx for the same btnRed/card treatment on the web).
"""

import html as _html

from app.core.config import get_settings

settings = get_settings()

_RED   = "#cf1322"
_BLACK = "#111111"


def _frontend_url() -> str:
    return settings.FRONTEND_URL.rstrip("/")


def _esc(text: str) -> str:
    return _html.escape(text or "", quote=True)


def clips_ready_email_html(video_title: str, clip_count: int, is_paid: bool) -> str:
    """
    "Your clips are ready" transactional email.

    Paid users get a CTA straight to the dashboard (where downloads live).
    Free users get the same visual weight of CTA, but it points at
    /billing and the copy is explicit that downloading requires a plan —
    clips can still be previewed free, just not exported.
    """
    fe = _frontend_url()
    title = _esc(video_title or "your video")
    plural = "s" if clip_count != 1 else ""

    if is_paid:
        cta_url   = f"{fe}/dashboard"
        cta_label = "View &amp; Download Your Clips &rarr;"
        upsell    = ""
    else:
        cta_url   = f"{fe}/billing"
        cta_label = "See Plans &mdash; Unlock Downloads &rarr;"
        upsell = f"""
          <tr>
            <td style="padding:4px 32px 24px 32px;">
              <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:14px 16px;font-size:13px;color:#92400e;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                &#128274; <strong>Downloads are a paid feature.</strong> Your clips are ready to preview free right now &mdash; upgrade any time to download them in full HD, watermark-free.
              </div>
            </td>
          </tr>
        """

    return f"""<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid {_BLACK};border-radius:14px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:9px;vertical-align:middle;">
                    <img src="{fe}/logo.png" width="26" height="26" alt="ShortClipr" style="display:block;border-radius:6px;">
                  </td>
                  <td style="font-size:16px;font-weight:800;color:{_BLACK};vertical-align:middle;letter-spacing:-0.01em;">ShortClipr</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <div style="font-size:12.5px;font-weight:800;color:#16a34a;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;">
                &#10003; Job complete
              </div>
              <div style="font-size:24px;font-weight:800;color:{_BLACK};letter-spacing:-0.02em;line-height:1.25;margin-bottom:12px;">
                Your clips are ready &#127916;
              </div>
              <div style="font-size:14.5px;color:#555555;line-height:1.65;">
                We turned <strong style="color:{_BLACK};">&ldquo;{title}&rdquo;</strong> into
                <strong style="color:{_BLACK};">{clip_count} viral-ready short{plural}</strong>
                &mdash; captioned, reframed to 9:16, and scored for virality.
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:20px 32px 8px 32px;">
              <a href="{cta_url}" style="display:inline-block;background:{_RED};color:#ffffff;text-decoration:none;font-weight:800;font-size:14.5px;padding:13px 26px;border-radius:9px;border:2px solid {_BLACK};box-shadow:3px 3px 0 {_BLACK};">
                {cta_label}
              </a>
            </td>
          </tr>

          {upsell}

          <!-- Footer -->
          <tr>
            <td style="padding:28px 32px 24px 32px;border-top:1px solid #eeeeee;">
              <div style="font-size:12px;color:#9ca3af;line-height:1.7;">
                You're receiving this because you generated clips on ShortClipr.<br>
                &copy; ShortClipr &mdash; <a href="{fe}" style="color:#9ca3af;">shortclipr.com</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def clips_processing_confirmation_html(video_title: str) -> str:
    """
    Optional lightweight confirmation sent the moment a job STARTS, telling
    the user an email is on its way once encoding finishes. Not wired in by
    default (see ffmpeg_stage.py) — the in-app "we'll email you" note
    covers this for now, this template exists so it's a one-line change to
    enable if you want a real email at kickoff too.
    """
    fe = _frontend_url()
    title = _esc(video_title or "your video")
    return f"""<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid {_BLACK};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:9px;vertical-align:middle;">
                    <img src="{fe}/logo.png" width="26" height="26" alt="ShortClipr" style="display:block;border-radius:6px;">
                  </td>
                  <td style="font-size:16px;font-weight:800;color:{_BLACK};vertical-align:middle;">ShortClipr</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 24px 32px;">
              <div style="font-size:22px;font-weight:800;color:{_BLACK};letter-spacing:-0.02em;line-height:1.3;margin-bottom:12px;">
                We're on it &#9889;
              </div>
              <div style="font-size:14.5px;color:#555555;line-height:1.65;">
                <strong style="color:{_BLACK};">&ldquo;{title}&rdquo;</strong> is processing now.
                We'll email you the moment your clips are ready &mdash; usually just a few minutes.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

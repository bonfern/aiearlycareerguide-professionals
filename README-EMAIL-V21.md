# V21 — Mobile-friendly email update

This is an incremental update to the **working V20 report** and **V19 assessment**. It does **not** alter the assessment engine, checkout, prices, coupons, saved sessions, PDF generator, or Resend configuration.

## Upload these files to the existing Professional GitHub repository

1. **Replace** `api/_lib/commerce.js` with the complete file in this ZIP.
2. **Add** `brand-logo-email.png` at the repository root (alongside `index.html`). It is a small PNG conversion of your existing brand logo. It improves compatibility with email clients that don't consistently display WebP images.
3. **Replace** `tests/report-v20.test.js` with the included updated test (optional for production, recommended).
4. **Add** `tests/mobile-email.test.js` (optional for production, recommended).

Upload all four files preserving their paths. GitHub file count stays within your 12-file upload limit. Wait for Vercel to show **Ready**.

## What is improved

- Both **payment / complimentary access emails** and **full report emails** use a fluid, maximum-600px layout, email-safe tables, inline typography, compact mobile padding, and a branded header/footer.
- The email report replaces the three-column table with stacked skill cards to avoid horizontal scrolling on phones. The emailed **PDF attachment is unchanged** and remains the branded V20 PDF.
- The Start / Resume link is an easy-to-tap, full-width button on mobile.
- Course links and long descriptions can wrap rather than widen the email.
- The PNG logo is loaded from `https://www.aiearlycareerguide.com/professionals/brand-logo-email.png`. Confirm this URL opens after deployment (routing should forward it to the Professional project).

## Test after deploying

1. Check the PNG logo URL above in an incognito browser tab.
2. Request a new secure assessment email, or complete a new free-coupon assessment using a fresh test email.
3. View the access email and full report email in Gmail and/or Outlook on a mobile phone, then on a desktop. Confirm the logo loads and nothing requires horizontal scrolling.
4. Verify the report's PDF attachment opens and looks unchanged.

Previously sent email messages cannot be reformatted in-place; new messages use this template. Some email apps block remote images until you select **Display images**, but the visible text brand remains readable.

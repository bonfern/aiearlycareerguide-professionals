# Career Professionals — V8 payment and email test beta

This update **adds payment-first access to working V7**. Keep your current `api/next-question.js` and `api/_lib/question-cache.js` files intact. It supports ₹499, optional server-validated coupons, Razorpay Checkout, password-free sessions, automatic full-HTML report email via Resend, and private preview for owner testing.

**Do not accept real customer payments with V8 yet.** First verify Razorpay *test-mode* checkout, coupon redemption, automatic emails, recovery after interrupted payment, and refund support. Production still needs payment/refund webhooks, support/refund policies, privacy and data-retention review, and end-to-end live provider testing.

## Upload safely (12 files or fewer)

The `v8-github-update.zip` contains **12 files**, complete replacements and new files, arranged in their final GitHub paths. Upload in two batches of six if GitHub limits uploads. Never upload the Firebase JSON or API keys. This update does not replace the V7 cache/assessment implementation.

## Vercel environment variables

Keep your existing `OPENAI_API_KEY`, assessment/report model variables, `PREVIEW_ACCESS_CODE` and `FIREBASE_SERVICE_ACCOUNT_JSON`. Add **four** new variables to your Professional Vercel project (Production and Preview):

- `RAZORPAY_KEY_ID` — Razorpay *test-mode* key ID to begin with
- `RAZORPAY_KEY_SECRET` — matching test-mode secret (never in GitHub or the browser)
- `RESEND_API_KEY` — Resend key (the existing account can be reused)
- `REPORT_FROM_EMAIL` — an approved sender, e.g. `AI Early Career Guide <reports@your-verified-domain.com>`

Use your existing Razorpay and Resend accounts if appropriate, but configure these environment variables in the *separate Career Professionals Vercel project*. Redeploy after saving them. For Resend, ensure the sender domain is verified in the account that issued the key.

## Coupons in your separate Professionals Firestore database

Create collection `professionalCoupons_v1`. Document ID is the code in **uppercase**, e.g. `EARLY30`. Configure these fields (using Firestore native types):

| Field | Example | Description |
|---|---|---|
| `active` | `true` (boolean) | Coupon available |
| `discountType` | `percent` (string) | `percent` or `fixed` |
| `value` | `30` (number) | For `percent`: 1–100; for `fixed`: ₹1–₹499 (whole rupees) |
| `maxUses` | `0` (number) | 0 = unlimited; >0 = limited checkouts |
| `usedCount` | `0` (number) | Initially 0; updated by server |

Optional `expiresAt` is an ISO date string or Firestore Timestamp. Do not manually add `reservations`; the server manages them. `EARLY30` gives 30% off ₹499 (₹349.30 payable). An `active=true`, `discountType=percent`, `value=100` coupon gives complimentary access; the server still records its redemption.

Limited coupons hold a slot during checkout for 25 minutes. Abandoned checkouts release their reservation as future checkouts occur. Rare late-captured payments are honoured, so the eventual redemption count can exceed a configured limit; if strict limits matter, add capture-time reservation reconciliation and webhook monitoring before public launch.

## Customer flow

1. Email + optional coupon → click **Apply Coupon** for the quote.
2. Consent → Razorpay test-mode checkout; server creates the order and calculates the final price.
3. The backend verifies payment signature **and** captured payment details directly with Razorpay. For interrupted callbacks, click **Check Previous Payment**; do *not* pay again.
4. A validated paid order creates exactly one 30-day assessment session; the session token is a server-generated HMAC derived from the secure checkout nonce and Razorpay secret. Private preview sessions still use the preview code and expire after 7 days.
5. Complete the role-specific V7 assessment; generate the individual report.
6. For paid sessions, server attempts to send the entire report as a styled HTML email. If sending fails, the report remains available onscreen and the user can select **Retry sending report email**. Resend idempotency keys reduce duplicate email delivery.

The browser stores paid-session recovery credentials *only on that browser*. No passwords, OTPs, account emails or resume links are generated. Deleting browser data before starting a paid test removes its automatic recovery reference; support can reconcile payment manually. Do not use a shared/public computer for a real paid assessment. The report is not yet sent as a PDF attachment; users can print or save as PDF from the browser.

## Test in this order

- Existing preview-code flow still runs without payment.
- Checkout with test card/UPI; amount ₹499, payment verified, profile opens without password.
- Discount code and a 100%-discount code each work, and incorrect coupons are rejected.
- Closing Razorpay after a successful test transaction: **Check Previous Payment** should recover it.
- Refresh during paid interview: **Resume** restores the same assessment in the same browser.
- Finish, generate report, confirm the HTML email arrives; test retry by temporarily withholding `REPORT_FROM_EMAIL` in a non-production deployment.
- Firebase: inspect `professionalOrders_v1`, `professionalCoupons_v1` and `professionalAssessments_v1` separately from the student project.

No changes are required to the student repository or its database. This beta does not include Razorpay payment/refund webhooks, PDF email attachment or cross-device recovery without a password/OTP.

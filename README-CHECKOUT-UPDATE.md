# Career Guide for Professionals — Checkout & Secure Email Resume Update

This replaces only **five production files** in your existing Professional GitHub repository. Your current branding, photography, mobile/desktop CSS, question bank, assessment and report code remain unchanged. Do NOT upload the test-only local `node_modules` directory or Firebase credentials.

## 1. Replace these five files in the Professional repository

- `index.html` — revised checkout, consent-first coupon flow, automatic same-browser resume, recovery-email button and secure email-link opening
- `api/create-order.js` — coupon quotations only after consent, prevents duplicate purchases for unfinished assessments, issues complimentary purchases and emails their access links
- `api/verify-payment.js` — verifies live captured payments, sends confirmation emails and accepts signed Razorpay webhooks through this existing function
- `api/start.js` — redeems one-use email links and securely resumes the same assessment across browsers
- `api/_lib/commerce.js` — receipt emails, one-use expiring link security, duplicate-email suppression, pricing and session access helpers

Upload in one GitHub commit if possible. No new serverless function was created. Keep `api/validate-coupon.js` **deleted** as required by the earlier 12-function fix. Do not replace `professional-site.css`, your assets or the student repository.

## 2. Environment variables in your Professional Vercel project

Keep your existing variables:
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` — matching live account credentials
- `RESEND_API_KEY` and `REPORT_FROM_EMAIL` — verified Resend sender; email is required for the new workflow
- `FIREBASE_SERVICE_ACCOUNT_JSON` (or existing BASE64 alternative), OpenAI settings, private preview code

**Add one new secret**: `RAZORPAY_WEBHOOK_SECRET` — generate a strong, unique webhook secret in Razorpay. It is NOT your Razorpay API secret. Use the same exact value in Vercel and Razorpay's webhook configuration; never upload it to GitHub.

Optional: `PUBLIC_PROFESSIONAL_URL=https://www.aiearlycareerguide.com/professionals` (the code already defaults to this exact address). Do not add a trailing slash, extra path or query.

Redeploy after updating environment variables.

## 3. Add a webhook in Razorpay **Live Mode**

In Razorpay Dashboard, open **Account & Settings → Webhooks** (sometimes under Website and app settings → Webhooks), and add:

Webhook URL: `https://www.aiearlycareerguide.com/professionals/api/verify-payment`
Events: `payment.captured` and `order.paid`
Secret: same value as `RAZORPAY_WEBHOOK_SECRET` in Vercel

Before you save it, confirm your domain rewrite proxies `/professionals/api/verify-payment` to your separate Professionals Vercel deployment. If your proxy does not forward POSTs reliably, use `https://aiearlycareerguide-professionals.vercel.app/api/verify-payment` for this **server-to-server webhook only**; customers continue to see your branded URL.

Razorpay may send duplicate events; this endpoint is idempotent. It verifies the webhook HMAC against the *raw* request body, independently fetches payment status from Razorpay and records the captured payment before attempting the email. A later webhook can recover email delivery if the customer closed the page.

The webhook does NOT change Razorpay's website-approval status. Do not accept new real payments until your Professionals website is approved and the previous failed debit is resolved.

## 4. New customer journey

1. Enter the email that should receive both the purchase confirmation and the final report.
2. Tick the mandatory Terms, Privacy and data-processing checkbox.
3. Optionally enter and apply a coupon; the server verifies the discount. The next highlighted action is payment, or **Confirm Complimentary Access** when the total is ₹0.
4. After the verified payment or complimentary redemption, the assessment opens immediately. The server sends a purchase/complimentary confirmation email with a **one-use secure link** valid for seven days.
5. On the same browser, unfinished purchases resume immediately using the saved session. On another browser, select **Email Me My Link** with the purchase email; the link is sent only to the verified original email address.
6. The existing full career report is emailed once generated. Report-email retry remains unchanged.

Email addresses alone never grant assessment access. The secure link has an HMAC, expires after seven days and is consumed at first use; requesting a fresh link invalidates the previous unused link. Paid assessment access remains valid for 30 days under the existing session policy. Report retention and refund rules remain those of your existing deployment.

## 5. Test without another live charge

First run the 100% coupon (`BONNEY100`, if still active and within its usage limit). Confirm:
- Without consent, Apply Coupon and Checkout are disabled; even direct API requests cannot validate a coupon without consent.
- With consent, the 100% coupon displays ₹0, and Confirm Complimentary Access opens the profile.
- Check the confirmation email and its branded secure link. Open it in a **different browser** to verify it resumes the same unfinished assessment without another payment.
- If the link has already been used, use Email Me My Link and test the new link.
- Close/reopen the original browser and verify Continue My Assessment works for the same email.
- Finish the assessment, generate the report and confirm the separate report email arrives.

Do a real ₹499 payment only **after Razorpay approves the website** and verifies/reverses the earlier problematic transaction. Check the webhook delivery log and the `professionalOrders_v1` record (`status: paid`, `accessEmailStatus: sent`).

## 6. Privacy, email and recovery safeguards

- Purchases and reports are not returned when someone simply enters an email address. An existing buyer receives a link in their original inbox.
- The app prevents a second order for an unfinished paid assessment using the same email, and temporarily blocks simultaneous pending checkouts. If a customer was debited, ask them to use Check Previous Payment or contact support, never retry blindly.
- Confirmation email delivery failures do **not** reverse a captured purchase or hide the assessment. Email Me My Link can resend an access link.
- Keep the API secret, webhook secret, Resend key and Firebase JSON only in Vercel's environment variables. Do not publish links with access tokens on social media.
- The webhook implementation handles captured payments and confirmation emails. Refund lifecycle handling, payment disputes and reconciliation still need operational review before a public launch.

## 7. Troubleshooting

- No purchase email: check Resend Dashboard logs, the verified sender domain, `REPORT_FROM_EMAIL` and Vercel Runtime Logs. Use Email Me My Link (check Spam). The code sends the email after the first confirmed payment or free coupon.
- Paid but browser lost: the webhook will attempt to confirm and email access; **Check Previous Payment** works in the original browser. Contact support with the Razorpay payment ID if neither works.
- Webhook rejected: `401` means a secret/signature mismatch; `503` means payment capture or sending is not yet confirmed and Razorpay should retry. Ensure correct live-mode credentials and webhook secret.
- Old link reports used/expired: enter purchase email and request a new link. Do not pay a second time.

No live charges or external email sends were made as part of preparing these replacement files. The checkout, Firebase and Resend integration checks were performed using mocked providers; confirm the behaviour on your Vercel deployment before inviting customers.

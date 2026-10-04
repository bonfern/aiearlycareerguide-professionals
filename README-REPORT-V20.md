# V20 — Branded, clearer Career Competency & Development Report

This report-only update is based on the stable V19 question and startup flow with the V17 session safeguards and the V15 three-questions-per-skill contract. It does not modify scoring, the question cache, checkout, coupons or access/resume endpoints.

## GitHub upload — 7 files total (6 production/test code files + this guide)

Replace the following COMPLETE existing files in your `aiearlycareerguide-professionals` repository:

- `index.html` — simpler on-screen report labels; retains the V19 startup and existing checkout UI.
- `api/_lib/report.js` — clearer report-writing instructions, plain-language role requirements and readable competency labels.
- `api/_lib/commerce.js` — branded, easier-to-read report email; the existing Resend sending, payment confirmation and recovery logic is retained.
- `api/_lib/pdf-report.js` — redesigned A4 attachment with the website's navy/purple style, original brand logo embedded on every page, clickable learning links, and section-by-section layout.

Add these NEW files:

- `api/_lib/report-brand.js` — an embedded, compressed copy of **your existing website logo** for server-generated PDFs. This file is REQUIRED; deploy it at the same time as `pdf-report.js`.
- `tests/report-v20.test.js` — new branded-PDF, readability, email-HTML and on-screen-report tests.

`README-REPORT-V20.md` is included for your reference; it does not have to be uploaded to GitHub.

Do not delete existing code files, install any package, modify Vercel environment variables or change the website's hosting/routing.

## What changes

1. The attached A4 PDF uses the website logo and colours, a branded header on every page, coloured overview cards, a consistent footer and clickable course-provider links. Its logo is embedded, so it remains visible offline and in email attachments even when images in the email itself are blocked.
2. New reports use shorter, direct sentences, explain essential technical terms and connect each gap to realistic actions, practice tasks and measurable outcomes. They retain the full learning recommendations and 30/60/90-day plan.
3. The on-screen report and HTML report email have matching simpler section labels; the email includes the brand header (some email clients hide external images by default, but the PDF always contains the logo).

## Important about existing reports

Existing finished reports in Firestore are cached. Already generated reports will not be silently rewritten and previously sent emails will not be sent again. **Use a new assessment** with your complimentary coupon to test the new wording and PDF attachment.

## Test after deployment

1. Open `https://www.aiearlycareerguide.com/professionals` and start a fresh assessment using an approved complimentary coupon.
2. Answer every required question; choose your learning preferences and generate the report.
3. Check that the report begins with the essential-skill overview, explains each required skill and development action in clear language, lists free/paid learning, shows untested required skills and includes a full 30/60/90-day plan.
4. Check your email. Open the attached `career-competency-development-report.pdf`: it should show the correct AI Early Career Guide logo on every page, with legible text and functioning course links.
5. If no email arrives, inspect the Resend Emails activity. This update does not alter delivery settings or guarantee receipt.

The included illustrative sample PDF was generated locally using hypothetical results. It is for visual review only.

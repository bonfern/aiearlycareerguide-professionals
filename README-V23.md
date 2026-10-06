# Career Guide for Professionals — V23 Background Report Generation

This update fixes report-generation timeouts when using a high-reasoning report model.

## Replace only these 3 production files

1. `index.html`
2. `api/generate-report.js`
3. `api/_lib/report.js`

Do not replace any other files.

## What changes

- Report generation starts with the OpenAI Responses API in background mode.
- The browser automatically checks the same `generate-report` endpoint every few seconds.
- No extra Vercel Serverless Function is added.
- The report button shows a neutral "preparing" status instead of failing after the old synchronous timeout.
- The report job ID is saved in the existing assessment session in Firebase, so refreshing or returning later can continue checking the same report job rather than starting another one.
- When the report completes, the existing V22 validation, goal-led report structure, PDF/email flow and deterministic learning catalogue remain unchanged.
- Questions 1–10 guidance-text fix remains in `index.html`.

## Environment variables

Keep the existing values:

- `REPORT_OPENAI_MODEL=gpt-6-astra`
- `REPORT_REASONING_EFFORT=high`
- `OPENAI_API_KEY`
- `REPORT_FROM_EMAIL`
- existing Firebase / Resend / Razorpay variables

No new Vercel environment variable is required for V23.

## After upload

Commit the 3 replacements and wait for Vercel to redeploy. Then reopen the completed assessment and select **View / generate my career development report**.

A report attempt that previously timed out does not require the assessment to be retaken. If an old synchronous lease is still active, the page will wait for it to expire and then start the background report automatically.

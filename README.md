# Career Professionals — V3: career-stage profile + choice-led adaptive interview

**Purpose:** Replace only the question and AI/report logic on the existing Career Professionals private beta. Your student site, separate Professional Firebase project, private preview code and existing API key are unchanged. Payment (₹499), optional coupons and emailed reports are **planned, not included in this update**.

## What changed

- The FIRST profile question selects a career stage: employed, self-employed, between jobs, returning from a career break, recent graduate, student nearing graduation, or other.
- Each stage sees its own questions, with individual industry/function questions where relevant. Recent graduates and students are not asked for a current job title or workplace achievements.
- Most profile questions use single or multi-select choices. Whenever Other is available, an additional required free-text field appears.
- The live AI interview has **7 essential stage-specific topics, at most 2 targeted follow-ups**, and uses choice-based answers by default. It may ask a single short free-text clarification only when essential and only after the core interview.
- The report now interprets choices as self-reported preferences, not demonstrated professional competence, and distinguishes student projects from workplace achievements.
- The AI interview and report now use OpenAI's **Responses API** with structured JSON output. They default to `gpt-6-astra` at `high` reasoning effort. Live access depends on your OpenAI API project's available models.

## Update GitHub: no more than 12 changed files

Download the **V3 update-only ZIP** and upload the 12 files in it to your EXISTING GitHub repository, `aiearlycareerguide-professionals`. Keep paths/folder structure exactly as they are. Each file in the ZIP is the COMPLETE replacement file, not a patch. Replace the existing versions and commit as one update (or two batches if GitHub's upload UI refuses the combined upload). DO NOT delete any existing unchanged files. Do not upload a Firebase JSON private key.

The files to replace are `index.html`, `api/_lib/ai.js`, `api/_lib/interview-logic.js`, `api/_lib/report.js`, `api/_lib/store.js`, `api/next-question.js`, `api/generate-report.js`, `vercel.json`, `tests/logic.test.js`, `tests/report.test.js`, `README.md` and `.env.example`.

### Vercel: two small setting changes

1. Open your Professional Vercel project → Settings → Environment Variables. **Edit the existing `OPENAI_MODEL`** from `gpt-4o-mini` to `gpt-6-astra`. Do not create a second variable of the same name. Keep the existing `OPENAI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, and `PREVIEW_ACCESS_CODE` unchanged.
2. Optional: add `OPENAI_REASONING_EFFORT` = `high` (already the built-in default). For exceptionally challenging analyses you may set `max`, but this increases cost and latency. Optional `REPORT_OPENAI_MODEL` and `REPORT_REASONING_EFFORT` let you use separate report settings.
3. Redeploy after **both** the GitHub commit and environment variable change are complete. Environment-variable edits alone usually require a redeploy to take effect.
4. If an AI request reports that the model is unavailable, check model access and billing on your OpenAI **API project**; ChatGPT subscriptions don't grant model API access. Set `OPENAI_MODEL` to the strongest supported reasoning model you can access, then redeploy. The code uses Responses API with strict JSON-schema output; do not fall back to a model that doesn't support it.
5. **Start a fresh assessment** after deployment. Existing saved sessions retain their previous questions and may not follow the revised flow. Keep this private beta restricted to trusted testers; high-end reasoning models can be costly, so review API usage and spending alerts before testing many assessments.

### Testing the new version

Open your deployed Vercel URL (or open `index.html` locally for the guided preview) and try at least three separate test profiles: employed, recent graduate and returning after a career break. Confirm that each receives different static questions and career-appropriate AI questions. In the live version, complete 7–9 answer choices and generate a report. Confirm that the report does not invent achievements or assume the graduate held a paid job. Test Other + Please specify and Back/Review.

Your original beta protections remain: server-side Firebase and OpenAI secrets, one-time private preview code at the start, opaque session tokens, restricted preview quotas and cached completed reports. No customer-facing paid checkout, coupons or email reports are added here.

### Developer tests

Run `npm test` (Node 20+). All tests mock OpenAI; real model access and the Firestore integration require a live smoke test after redeployment.

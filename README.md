# Career Professionals V4 — Role-specific competency assessment

This update replaces the previous 7–9 question interview. It works with your **existing Career Professionals GitHub/Vercel app and separate Professional Firebase project**. It does NOT modify the student application.

## What the live beta now does

1. The static profile continues to branch by employment status, with properly capitalised labels. It now asks for an optional **specific target job title** as well as the career objective, target function and target industry. A specific title improves accuracy; if it is missing, the AI uses a **provisional** target-role interpretation of those fields, not a verified job specification.
2. At the start of the live interview, your configured high-reasoning OpenAI model builds a **role-specific map of 8–16 competencies**, including at least four technical and three behavioural skill areas. Senior roles can therefore have more assessed domains than entry-level roles.
3. It asks at least one conceptual question and one applied scenario per technical skill, and at least two applied scenarios per behavioural skill. **The difficulty increases after a correct answer; mixed answers trigger a third discriminating scenario.** Every question has four plausible options plus **Not sure**. Wrong, uncertain and correct answers are recorded privately; no answer key is sent to the browser during the interview. Questions are chosen by evidence coverage, not a fixed total. There is a 100-question safety ceiling; typical assessments should be far shorter, depending on the number of competencies and mixed answers.
4. The header now reads **Role-specific skills assessment**; the progress indicator shows **skill areas assessed**, not an invented total number of questions.
5. The report now includes EVERY competency with the target benchmark, observed multiple-choice evidence, an explicitly qualified gap or next-level opportunity, 2–3 concrete learning actions, a practice assignment and a measurable indicator. It preserves the career overview, strengths, achievements (only if supplied), career directions and 30/60/90-day plan.
6. This is an **unproctored, AI-generated scenario assessment**, not a validated hiring, psychometric or credential-verification test. MCQs can indicate knowledge/judgment gaps but cannot verify real workplace performance.

## GitHub update — exactly 12 complete files

**Use the V4 update-only ZIP** (not the full-backup ZIP). Upload its contents to your EXISTING `aiearlycareerguide-professionals` repository. These 12 files are complete replacements, not partial code snippets:

- `index.html`
- `api/_lib/interview-logic.js`
- `api/_lib/ai.js`
- `api/_lib/store.js`
- `api/_lib/report.js`
- `api/next-question.js`
- `api/submit-answer.js`
- `api/back.js`
- `api/generate-report.js`
- `tests/logic.test.js`
- `tests/report.test.js`
- `README.md`

Because your GitHub upload interface has previously refused more than 12 files, upload them in **two batches of six** if needed. Maintain `api/_lib/`, `api/` and `tests/` folders. Do not delete unchanged files or upload `.env`/Firebase credentials. Commit and wait for Vercel to redeploy.

## Vercel environment

No new variables. Keep `FIREBASE_SERVICE_ACCOUNT_JSON`, `OPENAI_API_KEY` and `PREVIEW_ACCESS_CODE` unchanged. This V4 code respects your existing `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT` (default `high`), plus optional `REPORT_OPENAI_MODEL` / `REPORT_REASONING_EFFORT`. Only set models your own API project can use; do not put keys in GitHub. High-reasoning calls for 20–40+ questions have a **material API cost**, so set budgets/alerts and test with one or two internal accounts before sharing widely.

**Start a NEW live assessment** after deployment. Previously saved V3 sessions lack V4 competency maps and are not compatible with the new skill-level reporting. V3 reports already generated remain stored and unchanged. The old offline preset demo is hidden in this version; test the NEW skill assessment on the deployed Vercel website.

## Verification

Use `npm test` (Node.js 20+) to run mocked logic/API tests. You must still test a full live AI assessment, an interrupted/resumed assessment, Back, and report generation with your own OpenAI API and Firebase credentials before offering the service publicly. Different models may require more output time on the first competency-map question; check Vercel function logs if a request times out.

## Not included in this release

The planned **₹499 Razorpay checkout, optional discount coupons, password-free email entry and final report email via Resend** remain planned work. This is still a private beta requiring the preview access code. No new payment or email code is added in this update.

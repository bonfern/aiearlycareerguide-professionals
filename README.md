# AI Early Career Guide — Career Professionals V7 (Focused Skills)

Private beta. This update does **not** implement ₹499 checkout, coupons, report emails, or customer authentication. Keep preview access restricted.

## Changes

- The current first question still selects a profile path (employed, self-employed, between jobs, returner, graduate, final-year student).
- The AI selects only **4–7 indispensable technical and behavioural competencies** for the target role; each has a clear expectation. Another 2–6 relevant role requirements are deliberately **not tested** and are listed separately in the report.
- Assessment preparation first generates a small skill map, then independently validates smaller batches of three multiple-choice questions per skill. Invalid batches are regenerated automatically. This step can take longer. Once prepared, the browser requests the next question directly from the saved Firestore bank, without a further OpenAI call after each answer.
- Each tested skill has two questions (knowledge + scenario for technical skills; two distinct scenarios for behavioural skills). A third prepared scenario is used only if the answers disagree. Typical full assessment: **8–21 questions**, depending on the role and evidence. There is no fixed question count.
- The report now leads with required skills, current test-based competency, specific development gaps, concrete learning activities, a practice assignment and observable success criteria. Required but untested skills appear in their own section with the expected role standard and a verification exercise. A tailored 30/60/90-day plan closes the report. It does not narrate the user's selected answers.
- Early finish is optional and explicitly produces a **preliminary** report. The full report only marks an indispensable skill assessed after completing its required two or three questions. Unanswered skills are labelled **Not assessed**. Multiple-choice results indicate knowledge/judgment, not verified on-the-job competence.

## GitHub upload — exactly 12 files

Replace files at **their existing paths** (not the root unless indicated) and add the two new library files. Upload in two groups of six if GitHub imposes a 12-file upload limit.

- `index.html` — replace
- `api/_lib/ai.js` — replace (legacy sessions remain compatible)
- `api/_lib/assessment-bank.js` — NEW
- `api/_lib/bank-generator.js` — NEW
- `api/_lib/interview-logic.js` — replace
- `api/_lib/report.js` — replace
- `api/next-question.js` — replace
- `api/generate-report.js` — replace
- `tests/logic.test.js` — replace
- `tests/report.test.js` — replace
- `tests/speed-ui.test.js` — replace
- `README.md` — replace

Do not delete unrelated files or upload your Firebase credentials. Existing V6 assessment sessions can resume in their original question-generation mode; start a fresh assessment to test V7. Existing completed reports remain cached and available during the seven-day preview-access period.

## Model configuration

No new environment variables required. V7 defaults independently of your old `OPENAI_MODEL` setting:

- **Assessment setup:** `gpt-5.6-terra` with **low** reasoning for skill mapping and small question batches (instead of one oversized response).
- **Subsequent questions:** no OpenAI call; selected from the saved question bank.
- **Final report:** `gpt-5.6-terra` with **medium** reasoning, called once after completion.

Optional Vercel overrides: `ASSESSMENT_MODEL`, `ASSESSMENT_REASONING_EFFORT`, `REPORT_OPENAI_MODEL`, `REPORT_REASONING_EFFORT`. OpenAI API project access may vary; if the default model isn't enabled, verify access before changing model settings. Keep your existing `OPENAI_API_KEY`, Firebase JSON credentials and preview code unchanged.

## Test locally

Node.js 20+. `npm install`, then `npm test`. Automated tests mock OpenAI; **live response time, API availability and Firebase must be checked on your Vercel deployment**. The first assessment may take longer to prepare because the full bank is generated up front. Subsequent questions should normally appear quickly, subject to network and Firestore latency.

## Privacy and deployment

The full question bank and grading rationales remain server-side in Firestore; only the current question and its options are sent to the browser. Use private beta testers until customer authentication, payment verification, rate limits and Firestore retention policies are fully configured. Each test session is bound to a random session token and the preview link expires in seven days.

## V7 assessment preparation reliability update

Replace only `api/_lib/bank-generator.js` and `tests/logic.test.js` (plus this README if desired). The original V7 one-call generator was vulnerable to JSON truncation and rejecting an entire plan for one malformed question. The new generator first validates a 4–7-skill role map, then prepares independent small question batches (up to three simultaneous API calls). If a batch is invalid, only that batch is regenerated. The entire bank is still strictly validated before saving to Firestore. Existing sessions are not modified.

`ASSESSMENT_MODEL` takes precedence; otherwise the generator uses `OPENAI_MODEL`, then `gpt-5.6-terra`. No new environment variable is needed if your existing `OPENAI_MODEL` is already set to Terra. Live API access must be verified separately.

## V7 shared question-bank cache (combined with the assessment preparation fix)

- A reusable question bank is generated once per **specific target role + career objective + career stage + target function and industry**, and keyed additionally by model, reasoning effort and question-bank version. Normalised titles such as `Director Transformation` and ` director transformation ` share a bank. Different industries, roles, goals or stages do not.
- The bank is created from **generic role/goal details only**; no candidate names, email addresses, declared skills, achievements, interview answers or report text are included. Candidate sessions and their scored results remain in `professionalAssessments_v1`, never in the shared bank.
- Firestore collection: `professionalSharedQuestionBanks_v1`. First relevant user generates a bank using V7's skill-map and small question-batch retry fix. Other users with the same cache key reuse the completed bank with **no initial OpenAI question-generation calls**. A Firestore generation lease prevents duplicate concurrent builds. If somebody is still building the bank, the next candidate waits briefly, then may be asked to press Begin again.
- Cache entries expire after **90 days** and automatically regenerate when used again. Optional Firestore TTL: enable `retainUntil` on the shared collection to delete expired bank documents about a week after expiry; code-level expiry works even without TTL configured.
- The **final career report remains unique** to the candidate and continues to require its own OpenAI report-generation call. Roles without a sufficiently specific target bypass sharing and get a personalised bank instead.
- Uploaded files in the combined update: `api/_lib/bank-generator.js` (pending preparation fix), `api/_lib/question-cache.js` (new), `api/next-question.js` (cache integration), `tests/logic.test.js` (pending preparation tests), `tests/cache.test.js` (new) and this `README.md`. Exactly six files. No Vercel environment-variable changes are needed.
- Shared reuse means identical questions may be seen by different candidates with the same role. These are **development assessments**, not invigilated hiring tests. Rotate/review banks before introducing a high-stakes assessment or publicly exposing answer keys.

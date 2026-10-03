# AI Early Career Guide — Career Professionals V7 (Focused Skills)

Private beta. This update does **not** implement ₹499 checkout, coupons, report emails, or customer authentication. Keep preview access restricted.

## Changes

- The current first question still selects a profile path (employed, self-employed, between jobs, returner, graduate, final-year student).
- The AI selects only **4–7 indispensable technical and behavioural competencies** for the target role; each has a clear expectation. Another 2–6 relevant role requirements are deliberately **not tested** and are listed separately in the report.
- One initial API request generates the skill map **and a complete private bank of three short, multiple-choice questions per tested skill**. This step can take longer. Once prepared, the browser requests the next question directly from the saved Firestore bank, without a further OpenAI call after each answer.
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

- **Assessment setup:** `gpt-5.6-terra` with **low** reasoning, called **once per new V7 assessment**.
- **Subsequent questions:** no OpenAI call; selected from the saved question bank.
- **Final report:** `gpt-5.6-terra` with **medium** reasoning, called once after completion.

Optional Vercel overrides: `ASSESSMENT_MODEL`, `ASSESSMENT_REASONING_EFFORT`, `REPORT_OPENAI_MODEL`, `REPORT_REASONING_EFFORT`. OpenAI API project access may vary; if the default model isn't enabled, verify access before changing model settings. Keep your existing `OPENAI_API_KEY`, Firebase JSON credentials and preview code unchanged.

## Test locally

Node.js 20+. `npm install`, then `npm test`. Automated tests mock OpenAI; **live response time, API availability and Firebase must be checked on your Vercel deployment**. The first assessment may take longer to prepare because the full bank is generated up front. Subsequent questions should normally appear quickly, subject to network and Firestore latency.

## Privacy and deployment

The full question bank and grading rationales remain server-side in Firestore; only the current question and its options are sent to the browser. Use private beta testers until customer authentication, payment verification, rate limits and Firestore retention policies are fully configured. Each test session is bound to a random session token and the preview link expires in seven days.

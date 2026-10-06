# Career Guide for Professionals — Report V22

## What changed
This update makes the report goal-led and action-led from the first screen/page/email.

The report now starts with:
1. A direct statement tied to the user's exact target role or career goal.
2. The technical capabilities they need to build or stretch.
3. The leadership / behavioural capabilities they need to build or stretch.
4. A practical 4–7 step route to the goal, tailored to the user's situation (internal promotion, external move, career switch, return after a break, recent graduate, current-role development, etc.).
5. The detailed skill-by-skill development plan.
6. Other required capabilities not tested.
7. A 30 / 60 / 90-day execution plan combining skill development and practical career actions.

The old duplicated skills matrix, separate "Where to focus first" block, and separate "Track your progress" section have been removed from the visible report.

## Files to upload
Replace these files in the Professional repository:
- `index.html`
- `api/generate-report.js`
- `api/_lib/report.js`
- `api/_lib/pdf-report.js`
- `api/_lib/commerce.js`

Optional test file:
- `tests/report-v22.test.js`

## Vercel environment variables
To use the requested highest-reasoning report setup, set:
- `REPORT_OPENAI_MODEL` = `gpt-6-astra`
- `REPORT_REASONING_EFFORT` = `high`

Redeploy after changing environment variables.

Only report generation uses this model. The assessment question flow is not changed by this package.

## Existing completed reports
If a completed session contains an older report version, opening/generating the report can upgrade the stored report to V3 once. A previously sent report email is not automatically resent, avoiding duplicate emails. Use a fresh test session to verify the new email/PDF end-to-end.

## Preserved behaviour
- V19 assessment/question behaviour remains untouched.
- The recent Question 1–10 guidance-text fix is preserved.
- Checkout, coupons, resume flow, favicon, branding and Choose Guide navigation are unchanged.
- Learning resources still come only from the existing verified learning catalogue.

## Validation performed
- Inline browser JavaScript syntax checked.
- Server-side JavaScript syntax checked.
- V22 tests: 5/5 passed.
- Branded PDF generator tested with a V3 sample report.

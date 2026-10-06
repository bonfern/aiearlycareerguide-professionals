# Career Guide for Professionals — V24 Faster, Focused Report

Replace these five production files in the Professional GitHub repository:

1. `index.html`
2. `api/generate-report.js`
3. `api/_lib/report.js`
4. `api/_lib/pdf-report.js`
5. `api/_lib/commerce.js`

Do not replace any other files.

## Vercel environment

Keep:
- `REPORT_OPENAI_MODEL=gpt-6-astra`

Change:
- `REPORT_REASONING_EFFORT=medium`

Then redeploy.

## What changed

- The report opening no longer shows a long paragraph. It shows three bullet categories: Technical priorities, Leadership & behavioural priorities, and Career actions to take.
- The same compact opening is used on-screen, in the branded PDF, and in the report email.
- Report generation defaults to Astra with medium reasoning and a smaller output budget.
- Background generation/polling remains enabled.
- The report now shows only the top 3 additional untested role capabilities instead of a long secondary list.
- The profile no longer asks about work arrangement, timing of the next career move, job-search duration, or graduation timing. These values are also ignored for older saved profiles when generating a new report.
- Career-break duration remains because it materially changes return-to-work guidance.
- Role, function, industry, experience, seniority, qualification, practical experience, certifications, strengths and target-role questions remain because they can materially affect role mapping or career guidance.
- Report version is now V4. Older V3 reports can regenerate into the new structure when the user explicitly requests the report. Existing report-email sent state is not reset, avoiding duplicate unsolicited emails.

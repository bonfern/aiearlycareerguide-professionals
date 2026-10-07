# Career Guide for Professionals — V25 report header fix

Replace these two files in the Professional GitHub repository:

1. `api/_lib/report.js`
2. `api/generate-report.js`

What this fixes:
- Removes the repeated "unproctored multiple-choice" note from the data sent to the report model.
- Forces the opening career-goal headline to be short and career-action focused.
- Explicitly prohibits proctoring, multiple-choice, test/assessment methodology, verification and workplace-competence disclaimer language in the opening headline.
- Adds a deterministic safety guard: if the model still produces prohibited or overly long headline wording, the application replaces it with a clean career-action headline rather than displaying it.
- Bumps report version from 4 to 5 so existing V4 reports regenerate with the corrected logic instead of remaining cached.

No changes are required to `index.html`, PDF layout, payment, assessment questions, favicon, email settings or Vercel environment variables.

Keep your existing report model settings, including Astra and your current reasoning-effort setting.

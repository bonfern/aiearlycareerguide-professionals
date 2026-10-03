# V14 — Comprehensive Career Competency & Development Report

## Upload to GitHub
This update builds on your **working V13** Professional site, including the later design/branding CSS. It changes the report only. Extract the ZIP, then upload all **10 files** to the matching folders of `aiearlycareerguide-professionals`, replacing complete existing files. Do not upload `node_modules`, any `.env` files or any private keys. GitHub web upload can be done in two batches if desired. Allow Vercel to redeploy.

**Do NOT replace your existing `professional-site.css`, images, or student repository.** No new API routes are added; the project stays at 12 serverless functions on Vercel Hobby. No new environment variables or npm dependencies are required. Existing checkout, coupon, resume, Firestore question cache and the assessment questions are unchanged.

## What the report now delivers
1. Target role, coverage, essential-skill comparison table and up to three immediate development priorities.
2. Individual skill sections: role expectation, current *test-based* finding, evidence confidence, uncovered subskills, gap or next-level stretch, 2–3 specific actions, a practice assignment and a way to demonstrate progress.
3. Links to vetted **official** free-learning resources, relevant paid programmes and optional professional certifications. Fee, provider availability and certification eligibility are **not guaranteed**. If no close match exists, the report says so rather than inventing one. Vetted resource library: `api/_lib/learning-catalog.js`, reviewed 2026-10-03; editors can add approved provider URLs and keywords there.
4. Other essential role skills that the focused multiple-choice test did **not** cover, their role requirements, a development activity and validation advice.
5. A learning-budget, weekly-time and format-aware 30/60/90-day plan, followed by a progress/reassessment checklist.
6. Paid and 100%-coupon sessions receive a matching HTML email **with an A4 PDF attachment**. The report page retains Print / Save as PDF and JSON export. Private preview sessions still do not trigger an email.

## Three preference questions
At the end of a **newly completed** assessment, just before report generation, the user selects:
- Weekly learning hours
- Learning budget (including Free only)
- Preferred learning format

All have a `No preference` choice. These choices are saved with the assessment in Firestore. They affect resource selection and the 90-day plan, **not** graded test findings.

## Deployment & test
1. Upload the 10 replacement/new files and wait for Vercel Ready.
2. Start **a new assessment** using a private preview code or a 100% coupon. Older reports already generated and cached do not silently regenerate; they retain the old V13 format.
3. Finish all essential-skill questions; fill the three new learning preferences and generate the report.
4. Confirm the first page shows all essential skills and gaps; inspect the individual skills, their learning links, untested skills and the complete 30/60/90-day plan.
5. For a paid or valid 100%-coupon session, confirm the HTML report email arrives **with `career-competency-development-report.pdf` attached**. If delivery fails, use Retry sending report email. Check Resend's email activity/logs for errors. For private preview, use the on-screen Print / Save as PDF function.
6. Test at least two goals and one `Free resources only` preference to confirm the correct skills and no paid recommendations for that preference.

## Limitations / required editorial work before broad launch
- Short, unproctored multiple-choice responses do **not** prove workplace competence. All competency labels explicitly refer to test performance. The report names untested subskills separately.
- The vetted learning catalogue is an **initial**, not exhaustive, resource library. Professional roles that do not match an official resource receive a clearly labelled gap, not a fabricated course.
- Programme fees, duration, availability and certification eligibility should be checked on the linked provider pages before purchase. In particular, expensive certifications are excluded from low-budget suggestions.
- No automated browsing of new courses happens during report generation, avoiding made-up links, uncontrolled cost and additional API latency. Update the catalogue periodically as editorial work.
- The new PDF is a simple, text-first printable A4 design containing the substantive report and provider URLs; for interactive links and richer formatting, use the HTML report/email.
- The report email is triggered on report generation and is not an attendance or course completion certificate.

## Verified provider starting points (checked October 2026)
- PMI KICKOFF: https://www.pmi.org/kickoff/
- OpenLearn Management: https://www.open.edu/openlearn/money-business/leadership-management/managing-and-managing-people/content-section-0
- OpenLearn Leadership: https://www.open.edu/openlearn/money-business/leadership-management/step-leadership
- OpenLearn Groups and Teams: https://www.open.edu/openlearn/money-business/leadership-management/working-groups-and-teams/content-section-0
- OpenLearn Business Library: https://www.open.edu/openlearn/money-management/free-courses
- Microsoft Learn: https://learn.microsoft.com/en-us/training/powerplatform/
- AWS Skill Builder: https://aws.amazon.com/training/digital/
- Google Ads Skillshop: https://skillshop.withgoogle.com/googleads/
- HubSpot Academy: https://academy.hubspot.com/
- Google PM certificate: https://www.coursera.org/professional-certificates/google-project-management
- Prosci certification: https://www.prosci.com/solutions/training-programs/change-management-certification-program
- PMI CAPM: https://www.pmi.org/certifications/certified-associate-capm
- PMI PMP: https://www.pmi.org/certifications/project-management-pmp

# AI Early Career Guide — Career Professionals (private live beta)

A **separate Vercel project** for the Career Professionals assessment. Does not change the existing student site or its APIs. Built from the tested V4 prototype: 18 individually worded profile questions (plus conditional certification question), guided demo, 10 AI core topics and up to 5 genuinely adaptive follow-ups. Answer choices and **Other → Please specify** are preserved.

## What works in this build

- Live AI interview with OpenAI called **only from Vercel server functions**.
- Private preview code required **once when creating** a test session.
- Each assessment gets a random bearer token. Only its hashed form is saved in Firestore.
- Profile, generated pending question and previous answers are saved in the `professionalAssessments_v1` Firestore collection. Your student collections are not modified.
- Resume after a browser refresh **in the same tab** (uses `sessionStorage`; switching devices or closing the tab requires starting again). The database retains an otherwise inaccessible session until deletion/expiry.
- Correct previous answer, export JSON and delete a complete test session.
- A per-session cap of 19 AI generation attempts and a **best-effort** per-IP daily 5-session cap protect costs. Also set OpenAI project budget alerts/limits and use Vercel deployment protection while testing. IP-based limits are *not* a substitute for proper account authentication.
- Private beta **only**. No customer accounts, payments, OTP, emailed reports or generated career advice report yet.

## Step 1 — Create a NEW GitHub repo

Create a private GitHub repository, e.g. `aiearlycareerguide-professionals`. Upload the **contents** of this folder to the root of that repo (`index.html`, `api/`, `package.json`, `vercel.json`, etc.). Do not upload the folder itself, `.env.local`, API keys or a Firebase service-account JSON file.

## Step 2 — Firebase setup

Use your **new separate Firebase project** for Career Professionals. Enable Firestore in production mode. The application automatically creates `professionalAssessments_v1` and `professionalBetaDaily_v1`. Keep the student project unchanged.

From Firebase Console → Project Settings → Service Accounts → Generate new private key, download your service-account JSON securely. In Vercel, add an environment variable named **`FIREBASE_SERVICE_ACCOUNT_JSON`** and paste the **entire file contents** (including the opening and closing braces) as its value. This is server-side only. **Never upload the JSON key to GitHub, paste it into a public encoder, or share it in chat or screenshots.** The previous `FIREBASE_SERVICE_ACCOUNT_BASE64` method remains supported as an alternative; configure **one or the other**, not both.

**Data retention:** By default Firestore does not automatically purge records. For a 30-day preview retention period, enable Firestore TTL in your project for collection group `professionalAssessments_v1` using the `retainUntil` timestamp field, and for `professionalBetaDaily_v1` using the same field. Verify TTL operation in Firebase Console. TTL deletion is asynchronous, not guaranteed at the exact expiry time. Each tester can also delete their current session in-app after completion. Access expires after 7 days regardless of TTL.

## Step 3 — Deploy to a NEW Vercel project

1. Vercel dashboard → **Add New → Project** → import `aiearlycareerguide-professionals` (not the student repository).
2. Framework: **Other**; root: `./`. Vercel should recognize the `/api/*.js` serverless functions automatically.
3. Add these **four private environment variables** in Settings → Environment Variables (Production and Preview as needed):

| Variable | Example / explanation |
| --- | --- |
| `OPENAI_API_KEY` | Your private key from an OpenAI project with budget controls |
| `OPENAI_MODEL` | `gpt-4o-mini` (or a compatible structured-output model) |
| `PREVIEW_ACCESS_CODE` | A unique 32+-character code shared only with testers, **not** your OpenAI key |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Paste the entire downloaded Firebase service-account JSON file contents from Step 2 |

4. Deploy. Open `https://<your-vercel-project>.vercel.app/api/health`; `ready` should be `true`. It never reveals your secrets.
5. Open your new Vercel URL, complete the professional profile, select **Start live AI interview**, enter the private code and accept the data-use notice. Answer a few questions, refresh and use **Resume my saved interview**.
6. Verify Firestore shows a new document under `professionalAssessments_v1` with profile, history and current question. Finish the interview, download your answers and use **Delete my test session**. Verify the document disappears.

If Firestore or OpenAI responds with an error, check Vercel's server function logs **without copying secrets or participants' answers**.

## Step 4 — Connect the existing domain *after* the Vercel URL works

Keep the student app untouched initially and test on the separate Vercel project URL. The professional app already detects `/careerprofessionals` and calls `/careerprofessionals/api/*` when hosted at that path. To use `www.aiearlycareerguide.com/careerprofessionals`, configure the **existing site's** Vercel reverse-proxy rewrites for both `/careerprofessionals` and `/careerprofessionals/api/:path*` to the professional deployment, and confirm that forwarding, authentication headers and session restore work. Do this only after the private beta is tested, and do not replace the student site's existing `vercel.json` wholesale. See `DOMAIN-ROUTING.md` for a proposed rewrite to validate against your actual Vercel project settings.

## Local development and tests

With Node 20+ installed: `npm install`, copy `.env.example` to `.env.local` and enter real values **locally**, then run `npx vercel dev`. The offline guided demo still works by opening `index.html` directly, but live AI needs a deployed or local Vercel backend. Run `npm test` for automated validation; the tests mock OpenAI and do not require Firebase credentials or place real AI calls. Database integration must be checked on the deployed preview.

## Privacy and launch restrictions

The private preview code is a shared tester gate, not a paid customer login. Never distribute this version as a public paid assessment. Require verified user login/OTP, consent and privacy terms, durable account recovery, enforceable per-user quotas, payments and report generation before launch. The browser receives only its own session bearer token and data; server functions use Firebase Admin credentials. Restrict tester access with Vercel deployment protection if available. Obtain user permission before using identifiable career data; avoid proprietary employer or candidate information in a preview.

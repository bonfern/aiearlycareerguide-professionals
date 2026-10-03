CAREER PROFESSIONALS — V10 EMAIL-FIRST CHECKOUT

Upload ONLY these THREE complete replacement files from the `UPLOAD-TO-GITHUB` folder:

1) index.html                 (repository ROOT; replace entire existing file)
2) api/create-order.js       (replace entire existing file)
3) api/_lib/commerce.js      (replace entire existing file)

Do not upload this README or test files. Commit the three replacements, then wait for Vercel to show Ready. No new environment variables, Firebase project, indexes, or serverless functions are required.

The Professional assessment, shared question bank, payment verification, pricing and current branding remain unchanged.

NEW CUSTOMER:
Start → Email → Next → consent → optional coupon → Pay ₹499 (or Confirm Free Access at ₹0) → professional profile.

UNFINISHED PURCHASE (paid or complimentary):
Start → Email → Next → Continue Assessment. The server checks for an unfinished purchase before showing checkout. A valid matching purchase saved in the current browser opens immediately. A different browser, or a browser missing its session key, gets a secure one-time continuation link by email.

The independent Email Me My Link button and the confusing message at the top of the profile have been removed. Existing payment confirmation emails still include the link. The customer can request a new one by entering the original purchase email and clicking Continue Assessment on another browser.

SAFETY: The server enforces the lookup before payment as well as a second duplicate-purchase check at checkout. Email alone never grants direct access to an assessment. The lookup response never returns a customer's order ID or session token to an unverified visitor and is rate-limited. Old paid assessments that are already complete can buy a new assessment. The existing 30-day unfinished-purchase lookup window and session expiry still apply.

TEST (use a 100% discount code; don't repeat your unresolved Razorpay live payment):
A) New email — verify consent is required; apply coupon; confirm ₹0; first profile question opens without email banner.
B) On the same browser, enter the same email before finishing — Next should show Continue Assessment without payment.
C) On an incognito window, enter that same email — Continue Assessment should send a secure link to the purchase email, not open the session directly.
D) After completing the assessment, the same email should be eligible for a new checkout.
E) Verify that the access email arrives and the existing report email still works.

Local checks: 35 automated tests passed, including new email-lookup and completed-order cases; all frontend and backend JavaScript syntax checks passed. Browser automation could not be completed in the current environment; verify the live UI after Vercel deploys.

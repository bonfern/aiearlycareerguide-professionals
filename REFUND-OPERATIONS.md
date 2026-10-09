# Refund Operations — Career Guide for Professionals

## Customer promise

Paid assessments are protected by a **7-calendar-day, 100% money-back guarantee** from the date the personalised report is first generated or emailed. The customer does not need to provide a reason. Refund the full amount actually paid.

## Intake channel and required information

Use `info@aiearlycareerguide.com` as the single intake channel. Ask only for:

- Purchase email address
- Razorpay payment ID or order ID, when available

Do not request card details, passwords, API keys, screenshots of complete bank statements, or an explanation of dissatisfaction.

## Service targets

| Stage | Internal target |
|---|---|
| Acknowledge request | Within 1 business day |
| Match transaction and check prior refund | Within 1 business day |
| Initiate eligible refund | Within 2 business days of receiving sufficient transaction details |
| Send refund reference | Same business day as initiation |
| Review pending/failed refunds | Weekly until resolved |

Bank or payment-provider credit time is outside the website's control. Do not promise an exact credit date.

## Operating workflow

1. **Log the request.** Record the request date, purchase email, payment/order ID and amount paid.
2. **Verify identity and transaction.** Match the email to the order, confirm payment status, amount, report generation/email date and whether a refund already exists.
3. **Classify the case.** Use `Guarantee`, `Duplicate payment`, `Payment/access failure`, or `Technical failure`.
4. **Check eligibility.** For a guarantee case, confirm the request was received within 7 calendar days of the first report generation/email. Technical and duplicate-payment cases are handled separately.
5. **Initiate the refund.** Refund 100% of the amount actually paid to the original payment method wherever supported.
6. **Record the provider reference.** Save refund ID, amount, initiation date and current status.
7. **Confirm to the customer.** Send the refund reference and explain that credit timing depends on the payment provider and bank.
8. **Reconcile.** Review pending or failed refunds weekly and update the customer if action is required.

## Refund tracker fields

`Request date | Customer email | Order ID | Payment ID | Amount paid | Report generated/emailed date | Case type | Eligibility checked by | Refund ID | Refund initiated date | Status | Completion date | Notes`

## Controls

- One full refund per paid transaction.
- Never refund more than the captured amount.
- Complimentary/100%-discount transactions have no amount to refund.
- A transaction already fully refunded cannot be refunded again.
- Limit Firestore and Razorpay access to authorised operators.
- Do not store full card or bank-account details in the tracker.
- Keep customer communications and transaction references for audit and reconciliation according to the business retention policy.

## Customer acknowledgement template

**Subject:** Refund request received — AI Early Career Guide

We have received your refund request for the Career Guide for Professionals assessment. No explanation is required. We are matching the transaction details and aim to initiate an eligible refund within 2 business days. We will email the refund reference once it has been initiated.

## Refund confirmation template

**Subject:** Your refund has been initiated — AI Early Career Guide

Your full refund of **₹[amount]** has been initiated to the original payment method.

**Refund reference:** [refund ID]  
**Initiated on:** [date]

The time for the credit to appear depends on the payment provider, payment method and bank. Contact us at `info@aiearlycareerguide.com` if the refund remains unresolved after the provider's normal processing period.

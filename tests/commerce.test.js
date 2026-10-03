import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {PRICE_PAISE,readCoupon,priceQuote,activeReservations,signatureValid,checkoutToken,verifyCheckoutProof,receiptHtml,cleanCode,cleanEmail} from '../api/_lib/commerce.js';
import {sha} from '../api/_lib/security.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('the server always prices standard, percentage, fixed and free coupons in paise',()=>{
 assert.equal(PRICE_PAISE,49900);
 assert.deepEqual(priceQuote(null),{originalAmount:49900,discount:0,amount:49900,currency:'INR',couponCode:null});
 assert.equal(readCoupon({active:true,discountType:'percent',value:30},'EARLY30').amount,34930);
 assert.equal(readCoupon({active:true,discountType:'fixed',value:100},'SAVE100').amount,39900);
 assert.equal(readCoupon({active:true,discountType:'percent',value:100},'TEST100').amount,0);
 assert.throws(()=>readCoupon({active:false,discountType:'percent',value:100},'FAKE'),/invalid or inactive/);
 assert.throws(()=>readCoupon({active:true,discountType:'fixed',value:999},'FAKE'),/not correctly configured/);
 assert.equal(cleanCode(' early30 '),'EARLY30');assert.equal(cleanEmail(' A@EXAMPLE.COM '),'a@example.com');
});
test('reservation expiry excludes stale reservations and checkout proof cannot be guessed',()=>{
 const now=Date.now();assert.deepEqual(Object.keys(activeReservations({reservations:{['a'.repeat(32)]:now-1,['b'.repeat(32)]:now+1000}},now)),['b'.repeat(32)]);
 const nonce='a'.repeat(64),order={checkoutNonceHash:sha(nonce)};assert.doesNotThrow(()=>verifyCheckoutProof(order,nonce));
 assert.throws(()=>verifyCheckoutProof(order,'b'.repeat(64)),/secure checkout reference/);
 assert.notEqual(checkoutToken('order_123',nonce,'secret'),checkoutToken('order_456',nonce,'secret'));
});
test('a forged Razorpay callback cannot validate',()=>{
 const secret='test-secret',order='order_ABC123',payment='pay_123ABC';
 const sig=crypto.createHmac('sha256',secret).update(order+'|'+payment).digest('hex');
 assert.equal(signatureValid(order,payment,sig,secret),true);
 assert.equal(signatureValid(order,payment,'0'.repeat(64),secret),false);
 assert.equal(signatureValid('order_different',payment,sig,secret),false);
});
test('report email contains all report sections and escapes user-controlled HTML',()=>{
 const html=receiptHtml({targetRole:'Director <script>alert(1)</script>',summary:'Summary & plan',skillAssessments:[{name:'Strategy',targetBenchmark:'Lead strategy',currentCompetency:'Developing',gap:'Benefits tracking',actions:['Validate value','Review costs'],practiceTask:'Draft business case',successIndicator:'Signed-off plan'}],additionalSkills:[{name:'Negotiation',expectation:'Secure support',nextStep:'Practise',howToVerify:'Role play'}],actionPlan:[{period:'Days 1–30',focus:'Baseline',actions:['Practise analysis']} ]});
 assert.match(html,/Skill|skill/i);assert.match(html,/Negotiation/);assert.match(html,/Days 1–30/);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('frontend includes payment-first flow, recovery and email retry, and still parses',()=>{
 new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 for(const id of ['checkoutEmail','couponCode','applyCoupon','payBtn','recoverPaymentBtn','emailRetryBtn','previewEntryBtn'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/Razorpay/);assert.match(html,/beginPaidLive/);
});
test('backend gates sessions on paid orders and verifies payment amount and captured state',()=>{
 const start=source('../api/start.js'),verify=source('../api/verify-payment.js'),generate=source('../api/generate-report.js');
 assert.match(start,/order\.status!=='paid'/);assert.match(start,/verifyCheckoutProof/);
 assert.match(verify,/signatureValid/);assert.match(verify,/payment\.status!=='captured'/);
 assert.match(verify,/payment\.amount!==order\.amount/);
 assert.match(generate,/sendReportEmail/);assert.match(source('../api/send-report.js'),/authorize\(req\)/);
});

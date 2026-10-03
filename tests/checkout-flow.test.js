import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import start from '../api/start.js';
import orderHandler from '../api/create-order.js';
import verify, {config as verifyConfig} from '../api/verify-payment.js';
import {ORDERS,COUPONS,createAccessLink,parseAccessLink,recoveredCheckoutProof,verifyCheckoutProof,sendAccessEmail,sendReportEmail} from '../api/_lib/commerce.js';
import {sha} from '../api/_lib/security.js';

process.env.RAZORPAY_KEY_ID='rzp_test_stub';
process.env.RAZORPAY_KEY_SECRET='checkout-unit-test-secret-32-characters';
process.env.RAZORPAY_WEBHOOK_SECRET='webhook-unit-test-secret';
process.env.RESEND_API_KEY='re_test_stub';
process.env.REPORT_FROM_EMAIL='Careers <careers@example.com>';
process.env.OPENAI_API_KEY='sk-test-placeholder';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON='{}';
const STORE=new Map();
const now=()=>Date.now();
function wrapTimestamp(record){
 if(!record)return record;
 for(const [key,val] of Object.entries(record)){
  if(val instanceof Date)record[key]={toMillis:()=>val.getTime(),toDate:()=>val};
 }
 return record;
}
class Ref{
 constructor(path){this.path=path;this.id=path.split('/').at(-1);}
 get(){let doc=STORE.get(this.path);return Promise.resolve({exists:doc!==undefined,id:this.id,ref:this,data:()=>doc});}
 create(value){if(STORE.has(this.path))throw Error('already exists');STORE.set(this.path,wrapTimestamp({...value}));return Promise.resolve();}
 set(value,{merge=false}={}){STORE.set(this.path,wrapTimestamp({...merge?STORE.get(this.path):{},...value}));return Promise.resolve();}
 update(value){STORE.set(this.path,wrapTimestamp({...STORE.get(this.path),...value}));return Promise.resolve();}
}
class DB{
 collection(name){return {doc:id=>new Ref(`${name}/${id}`),where:(field,op,value)=>({limit:size=>({get:async()=>({docs:[...STORE.entries()].filter(([path,doc])=>path.startsWith(`${name}/`)&&doc[field]===value).slice(0,size).map(([path,data])=>({id:path.split('/').at(-1),ref:new Ref(path),data:()=>data}))})})})};}
 async runTransaction(fn){const ops=[];
  const tx={get:r=>r.get(),create:(r,v)=>ops.push(()=>r.create(v)),set:(r,v,opt)=>ops.push(()=>r.set(v,opt)),update:(r,v)=>ops.push(()=>r.update(v))};
  const result=await fn(tx);for(const op of ops)await op();return result;
 }
}
let outgoing=[];let payments=new Map();let orderNum=0;let failNextResend=false;
const realFetch=globalThis.fetch;
globalThis.__checkoutTestDb=new DB();
globalThis.fetch=async(url,options={})=>{
 const text=String(url);
 if(text.includes('api.resend.com/emails')){
  if(failNextResend){failNextResend=false;return {ok:false,status:503,json:async()=>({name:'provider_unavailable'})};}
  const body=JSON.parse(options.body);outgoing.push(body);
  return {ok:true,status:200,json:async()=>({id:`email_${outgoing.length}`})};
 }
 if(text.includes('/v1/orders')&&options.method==='POST')return {ok:true,status:200,json:async()=>({id:'order_TEST'+(++orderNum)})};
 if(/\/v1\/orders\/order_.*\/payments/.test(text)){
  const id=text.match(/orders\/(order_[^/]+)\/payments/)[1];return {ok:true,status:200,json:async()=>({items:[...payments.values()].filter(p=>p.order_id===id)})};
 }
 if(text.includes('/v1/payments/')){
  const id=text.split('/').at(-1),p=payments.get(id);
  if(!p)return {ok:false,status:404,json:async()=>({error:{code:'NOT_FOUND'}})};
  return {ok:true,status:200,json:async()=>p};
 }
 throw Error('Unexpected test provider URL '+url);
};
function res(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(obj){this.body=obj;return this;}};}
async function call(handler,body,mode='',headers={}){
 const req={method:'POST',headers,body,query:mode?{mode}:{},url:'/api/'+(mode?`create-order?mode=${mode}`:'create-order')};const output=res();await handler(req,output);return output;
}
function seedCoupon(code='BONNEY100'){STORE.set(`${COUPONS}/${code}`,{active:true,discountType:'percent',value:100,usedCount:0,maxUses:10});}

test('mandatory consent precedes coupon validation and any checkout',async()=>{
 STORE.clear();seedCoupon();
 const pre=await call(orderHandler,{email:'user@example.com',couponCode:'BONNEY100'},'quote');
 assert.equal(pre.statusCode,400);assert.match(pre.body.error,/before applying a coupon/);
 const yes=await call(orderHandler,{email:'user@example.com',couponCode:'BONNEY100',consent:true},'quote');
 assert.equal(yes.statusCode,200);assert.equal(yes.body.amount,0);
 const without=await call(orderHandler,{email:'user@example.com',couponCode:'BONNEY100',consent:false});
 assert.equal(without.statusCode,400);
});

test('100%-coupon grants exactly one purchase, sends confirmation link and blocks duplicate checkout',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const response=await call(orderHandler,{email:'Purchaser@Example.com',couponCode:'BONNEY100',consent:true});
 assert.equal(response.statusCode,201);assert.equal(response.body.amount,0);assert.equal(response.body.emailStatus,'sent');
 assert.equal(outgoing.length,1);assert.match(outgoing[0].html,/Your complimentary assessment is ready/);
 assert.match(outgoing[0].html,/#access=/);
 const attempt=await call(orderHandler,{email:'purchaser@example.com',couponCode:'BONNEY100',consent:true});
 assert.equal(attempt.statusCode,409);
 assert.equal(STORE.get(`${COUPONS}/BONNEY100`).usedCount,1);
});

test('one-use links cannot be forged or reused and never grant access from email alone',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const order=(await call(orderHandler,{email:'new@example.com',couponCode:'BONNEY100',consent:true})).body;
 const html=outgoing[0].html;const link=html.match(/#access=([^"']+)/)[1];
 assert.equal(parseAccessLink(link).orderId,order.orderId);
 assert.throws(()=>parseAccessLink(link.slice(0,-1)+(link.endsWith('0')?'1':'0')),/invalid|expired/);
 const first=await call(start,{accessLink:link});
 assert.equal(first.statusCode,200);assert.equal(first.body.email,'new@example.com');
 assert.equal(first.body.checkoutNonce,recoveredCheckoutProof(order.orderId));
 assert.equal(first.body.sessionId,null);
 const replay=await call(start,{accessLink:link});assert.equal(replay.statusCode,401);
 const orderObj=STORE.get(`${ORDERS}/${order.orderId}`);
 assert.doesNotThrow(()=>verifyCheckoutProof(orderObj,first.body.checkoutNonce,order.orderId));
 assert.throws(()=>verifyCheckoutProof(orderObj,sha('guessed-secret'),order.orderId),/invalid/);
});

test('payment capture via webhook updates order and emails access even when checkout page is gone',async()=>{
 STORE.clear();outgoing=[];payments=new Map();
 const created=(await call(orderHandler,{email:'captured@example.com',consent:true})).body;
 assert.equal(created.amount,49900);assert.equal(outgoing.length,0);
 const payment={id:'pay_ABC123',order_id:created.orderId,status:'captured',amount:49900,currency:'INR'};
 payments.set(payment.id,payment);
 const payload=JSON.stringify({event:'payment.captured',payload:{payment:{entity:payment}}});
 const signature=crypto.createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
 const web=await call(verify,payload,'',{'x-razorpay-signature':signature});
 assert.equal(web.statusCode,200);assert.equal(outgoing.length,1);
 assert.equal(STORE.get(`${ORDERS}/${created.orderId}`).status,'paid');
 const again=await call(verify,payload,'',{'x-razorpay-signature':signature});
 assert.equal(again.statusCode,200);assert.equal(outgoing.length,1);
 const fake=await call(verify,payload,'',{'x-razorpay-signature':'0'.repeat(64)});
 assert.equal(fake.statusCode,401);
 const browser=await call(verify,{orderId:created.orderId,checkoutNonce:created.checkoutNonce});
 assert.equal(browser.statusCode,200);assert.equal(browser.body.emailStatus,'sent');
});

test('email-recovery response never discloses purchase status to the requester',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 await call(orderHandler,{email:'buyer@example.com',couponCode:'BONNEY100',consent:true});
 const known=await call(orderHandler,{email:'buyer@example.com'},'recover');
 const unknown=await call(orderHandler,{email:'nobody@example.com'},'recover');
 assert.equal(known.statusCode,200);assert.equal(unknown.statusCode,200);
 assert.equal(known.body.message,unknown.body.message);
});

test('frontend is syntactically valid, consent precedes coupon UI and security links are present',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const match=html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/);
 assert.ok(match);new Script("'use strict';"+match[1]);
 assert.ok(html.indexOf('id="checkoutConsent"')<html.indexOf('id="couponCode"'));
 for(const id of ['checkoutConsent','couponCode','applyCoupon','payBtn','emailGateNext','resumeGate','continueExistingBtn'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/syncCheckout\(/);assert.match(html,/redeemEmailLinkIfPresent\(/);
 assert.equal(verifyConfig.api.bodyParser,false);
});

test('returning purchaser on a different browser resumes the SAME unfinished session without paying again',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const purchase=(await call(orderHandler,{email:'returning@example.com',couponCode:'BONNEY100',consent:true})).body;
 const initialToken=outgoing[0].html.match(/#access=([^"']+)/)[1];
 const first=await call(start,{accessLink:initialToken});assert.equal(first.statusCode,200);
 const sessionId='a'.repeat(32),oldToken='b'.repeat(64);
 const accessExpiresAt={toMillis:()=>now()+15*86400000,toDate:()=>new Date(now()+15*86400000)};
 STORE.get(`${ORDERS}/${purchase.orderId}`).sessionId=sessionId;
 STORE.set(`professionalAssessments_v1/${sessionId}`,{status:'active',paid:true,email:'returning@example.com',
  tokenHash:sha(oldToken),accessExpiresAt,profile:{targetJobTitle:'Director'},history:[{question:'Previous question',answer:'Option A'}]});
 const fresh=await sendAccessEmail(new Ref(`${ORDERS}/${purchase.orderId}`),{resend:true});
 assert.equal(fresh.status,'sent');
 const recoveryToken=outgoing.at(-1).html.match(/#access=([^"']+)/)[1];
 const resumed=await call(start,{accessLink:recoveryToken});
 assert.equal(resumed.statusCode,200);assert.equal(resumed.body.sessionId,sessionId);
 assert.equal(STORE.get(`professionalAssessments_v1/${sessionId}`).tokenHash,sha(resumed.body.sessionToken));
 assert.notEqual(resumed.body.sessionToken,oldToken);
 const replay=await call(start,{accessLink:recoveryToken});assert.equal(replay.statusCode,401);
});

test('a completed buyer may make a new purchase after completing the previous assessment',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const first=(await call(orderHandler,{email:'completed@example.com',couponCode:'BONNEY100',consent:true})).body;
 const sessionId='c'.repeat(32);
 STORE.get(`${ORDERS}/${first.orderId}`).sessionId=sessionId;
 STORE.set(`professionalAssessments_v1/${sessionId}`,{status:'complete',paid:true,accessExpiresAt:{toMillis:()=>now()+86400000}});
 const next=await call(orderHandler,{email:'completed@example.com',couponCode:'BONNEY100',consent:true});
 assert.equal(next.statusCode,201);
 assert.notEqual(next.body.orderId,first.orderId);
});


test('email lookup distinguishes fresh and unfinished assessments without exposing order IDs',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const fresh=await call(orderHandler,{email:'new-user@example.com'},'lookup');
 assert.equal(fresh.statusCode,200);assert.deepEqual(fresh.body,{unfinished:false,sameDevice:false});
 const purchase=(await call(orderHandler,{email:'return-purchaser@example.com',couponCode:'BONNEY100',consent:true})).body;
 const remote=await call(orderHandler,{email:'return-purchaser@example.com'},'lookup');
 assert.equal(remote.statusCode,200);assert.equal(remote.body.unfinished,true);assert.equal(remote.body.sameDevice,false);assert.equal(remote.body.orderId,undefined);assert.equal(remote.body.sessionId,undefined);
 const same=await call(orderHandler,{email:'return-purchaser@example.com',orderId:purchase.orderId,checkoutNonce:purchase.checkoutNonce},'lookup');
 assert.equal(same.statusCode,200);assert.equal(same.body.unfinished,true);assert.equal(same.body.sameDevice,true);assert.equal(same.body.sessionId,null);
 const forged=await call(orderHandler,{email:'return-purchaser@example.com',orderId:purchase.orderId,checkoutNonce:'0'.repeat(64)},'lookup');
 assert.equal(forged.body.sameDevice,false);assert.equal(forged.body.sessionId,undefined);
});
test('email lookup marks completed assessments eligible for a fresh checkout',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const purchase=(await call(orderHandler,{email:'finisher@example.com',couponCode:'BONNEY100',consent:true})).body;
 const sid='d'.repeat(32);STORE.get(`${ORDERS}/${purchase.orderId}`).sessionId=sid;
 STORE.set(`professionalAssessments_v1/${sid}`,{status:'complete',paid:true,accessExpiresAt:{toMillis:()=>now()+86400000}});
 const status=await call(orderHandler,{email:'finisher@example.com',orderId:purchase.orderId,checkoutNonce:purchase.checkoutNonce},'lookup');
 assert.equal(status.statusCode,200);assert.equal(status.body.unfinished,false);assert.equal(status.body.sameDevice,false);
});

test('same-browser saved session continues without a checkout reference or email link',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const purchase=(await call(orderHandler,{email:'same-browser@example.com',couponCode:'BONNEY100',consent:true})).body;
 const sid='e'.repeat(32),token='d'.repeat(64);
 STORE.get(`${ORDERS}/${purchase.orderId}`).sessionId=sid;
 STORE.set(`professionalAssessments_v1/${sid}`,{status:'active',paid:true,email:'same-browser@example.com',
   tokenHash:sha(token),accessExpiresAt:{toMillis:()=>now()+86400000},history:[]});
 const verified=await call(orderHandler,{email:'same-browser@example.com',sessionId:sid,sessionToken:token},'lookup');
 assert.equal(verified.statusCode,200);assert.equal(verified.body.unfinished,true);
 assert.equal(verified.body.sameDevice,true);assert.equal(verified.body.sessionId,sid);
 const forged=await call(orderHandler,{email:'same-browser@example.com',sessionId:sid,sessionToken:'a'.repeat(64)},'lookup');
 assert.equal(forged.body.sameDevice,false);assert.equal(forged.body.sessionId,undefined);
 const noProof=await call(orderHandler,{email:'same-browser@example.com'},'lookup');
 assert.equal(noProof.body.sameDevice,false);
});

test('verified checkout reference restores an existing session without repeating the profile',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const purchase=(await call(orderHandler,{email:'restorable@example.com',couponCode:'BONNEY100',consent:true})).body;
 const sid='f'.repeat(32);
 STORE.get(`${ORDERS}/${purchase.orderId}`).sessionId=sid;
 STORE.set(`professionalAssessments_v1/${sid}`,{status:'active',paid:true,email:'restorable@example.com',
   tokenHash:sha('1'.repeat(64)),accessExpiresAt:{toMillis:()=>now()+86400000,toDate:()=>new Date(now()+86400000)},history:[]});
 const resumed=await call(start,{paidOrder:{orderId:purchase.orderId,checkoutNonce:purchase.checkoutNonce}});
 assert.equal(resumed.statusCode,201);assert.equal(resumed.body.sessionId,sid);
 assert.equal(resumed.body.reused,true);assert.equal(resumed.body.sessionToken.length,64);
 assert.equal(STORE.get(`professionalAssessments_v1/${sid}`).tokenHash,sha(resumed.body.sessionToken));
});

test('unconfigured email recovery gives a useful error instead of claiming delivery',async()=>{
 const key=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;
 try{
  const response=await call(orderHandler,{email:'any@example.com'},'recover');
  assert.equal(response.statusCode,503);assert.match(response.body.error,/Email recovery is not configured/);
 }finally{process.env.RESEND_API_KEY=key;}
});

test('browser stores verified purchases by email and can use saved-session proof',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/careerProfessionalsPaidPurchasesByEmailV1/);
 assert.match(html,/function savedSessionForEmail/);
 assert.match(html,/sessionProof=saved/);
 assert.match(html,/function rememberPurchase/);
});

test('original-domain transfer requires saved purchase proof and issues a one-use branded access link',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const purchase=(await call(orderHandler,{email:'transfer@example.com',couponCode:'BONNEY100',consent:true})).body;
 const noProof=await call(start,{transferToBranded:true,paidOrder:{orderId:purchase.orderId,checkoutNonce:'0'.repeat(64)}});
 assert.equal(noProof.statusCode,401);
 const minted=await call(start,{transferToBranded:true,paidOrder:{orderId:purchase.orderId,checkoutNonce:purchase.checkoutNonce}});
 assert.equal(minted.statusCode,200);
 assert.match(minted.body.transferUrl,/^https:\/\/www\.aiearlycareerguide\.com\/professionals#access=/);
 const token=decodeURIComponent(minted.body.transferUrl.split('#access=')[1]);
 const parsed=parseAccessLink(token);
 assert.equal(parsed.orderId,purchase.orderId);
 assert.ok(parsed.expiresAt-now()<=5*60000);
 const redeemed=await call(start,{accessLink:token});
 assert.equal(redeemed.statusCode,200);
 assert.equal(redeemed.body.email,'transfer@example.com');
 const replay=await call(start,{accessLink:token});
 assert.equal(replay.statusCode,401);
});

test('original-domain transfer can use a valid existing session if checkout proof was lost',async()=>{
 STORE.clear();outgoing=[];seedCoupon();
 const purchase=(await call(orderHandler,{email:'session-transfer@example.com',couponCode:'BONNEY100',consent:true})).body;
 const sid='9'.repeat(32),sessionToken='a'.repeat(64);
 STORE.get(`${ORDERS}/${purchase.orderId}`).sessionId=sid;
 STORE.set(`professionalAssessments_v1/${sid}`,{status:'active',paid:true,email:'session-transfer@example.com',
  tokenHash:sha(sessionToken),accessExpiresAt:{toMillis:()=>now()+86400000,toDate:()=>new Date(now()+86400000)}});
 const denied=await call(start,{transferToBranded:true,sessionProof:{orderId:purchase.orderId,sessionId:sid,sessionToken:'b'.repeat(64)}});
 assert.equal(denied.statusCode,401);
 const valid=await call(start,{transferToBranded:true,sessionProof:{orderId:purchase.orderId,sessionId:sid,sessionToken}});
 assert.equal(valid.statusCode,200);
 const access=decodeURIComponent(valid.body.transferUrl.split('#access=')[1]);
 const accepted=await call(start,{accessLink:access});
 assert.equal(accepted.statusCode,200);
 assert.equal(accepted.body.sessionId,sid);
 assert.notEqual(accepted.body.sessionToken,sessionToken);
 assert.equal(STORE.get(`professionalAssessments_v1/${sid}`).tokenHash,sha(accepted.body.sessionToken));
});

test('returning screen clearly separates direct continuation, old-origin transfer, and email recovery',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="legacyResumeBtn"/);
 assert.match(html,/transferOriginalPurchaseIfRequested/);
 assert.match(html,/transferToBranded:true/);
 assert.match(html,/Email secure link to complete later/);
 assert.match(html,/access-restoring/);
 assert.match(html,/Continue with the assessment/);
 assert.doesNotMatch(html,/Continue from Original Website/);
});


test('a failed Resend delivery does not exhaust the recipient allowance',async()=>{
 STORE.clear();outgoing=[];seedCoupon('TESTFREE');
 const order=(await call(orderHandler,{email:'retry-failed@example.com',couponCode:'TESTFREE',consent:true})).body;
 assert.equal(order.amount,0);
 const saved=STORE.get(`${ORDERS}/${order.orderId}`);
 saved.accessEmailSentAt=null;saved.accessLinkHash=null;
 failNextResend=true;
 const failed=await call(orderHandler,{email:'retry-failed@example.com'},'recover');
 assert.equal(failed.statusCode,502);
 const recipientDocs=[...STORE.entries()].filter(([key])=>key.startsWith('professionalRecoverySentDaily_v2/'));
 assert.equal(recipientDocs.length,1);
 assert.equal(recipientDocs[0][1].sentCount||0,0);
 assert.equal(recipientDocs[0][1].leaseUntil,null);
 const retry=await call(orderHandler,{email:'retry-failed@example.com'},'recover');
 assert.equal(retry.statusCode,200);
 const recipient=STORE.get(recipientDocs[0][0]);
 assert.equal(recipient.sentCount,1);
 assert.equal(outgoing.length,2); // Initial confirmation plus the successful recovery.
 const recent=await call(orderHandler,{email:'retry-failed@example.com'},'recover');
 assert.equal(recent.statusCode,200);
 assert.equal(STORE.get(recipientDocs[0][0]).sentCount,1);
 assert.equal(outgoing.length,2);
});

test('recovery safety cap counts successful sends and limits rapid repeated requests',async()=>{
 STORE.clear();outgoing=[];seedCoupon('TESTFREE');
 const order=(await call(orderHandler,{email:'limited@example.com',couponCode:'TESTFREE',consent:true})).body;
 const saved=STORE.get(`${ORDERS}/${order.orderId}`);
 saved.accessEmailSentAt=null;saved.accessLinkHash=null;
 let first=await call(orderHandler,{email:'limited@example.com'},'recover');
 assert.equal(first.statusCode,200);
 const [key,doc]=[...STORE.entries()].find(([key])=>key.startsWith('professionalRecoverySentDaily_v2/'));
 assert.equal(doc.sentCount,1);
 doc.sentCount=8;doc.leaseUntil=null;
 const limited=await call(orderHandler,{email:'limited@example.com'},'recover');
 assert.equal(limited.statusCode,429);
 assert.match(limited.body.error,/email limit/i);
});


test('resume page uses a primary continue path, optional compact email-later action and seamless restore overlay',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="legacyResumeBtn"[^>]*>Continue with the assessment/);
 assert.match(html,/id="continueExistingBtn"[^>]*>Continue with the assessment/);
 assert.match(html,/class="resume-later"/);
 assert.match(html,/id="emailRecoveryBtn"[^>]*>Email secure link to complete later/);
 assert.match(html,/function sendRecoveryLink/);
 assert.match(html,/function finishAccessRestore/);
 assert.match(html,/access-restoring #accessRestoreOverlay/);
 const direct=html.slice(html.indexOf('async function continueExisting(){'),html.indexOf('async function sendRecoveryLink(){'));
 assert.doesNotMatch(direct,/mode=recover/);
 assert.match(direct,/Opening your saved assessment/);
});


test('report email includes a generated A4 PDF attachment and an HTML skill summary',async()=>{
 STORE.clear();outgoing=[];
 const ref=new Ref('professionalAssessments_v1/assessment-report-v14');
 await ref.set({paid:true,email:'pdf-test@example.com',report:{reportVersion:2,targetRole:'Director Transformation',summary:'Hypothetical practice findings.',
 coverage:{assessed:1,total:1,answered:2},priorities:[{name:'Change Management',firstAction:'Practise adoption planning.'}],
 skillAssessments:[{name:'Change Management',targetBenchmark:'Lead change adoption',currentCompetency:'Developing',priority:'Development priority',gap:'Improve adoption metrics',actions:['Complete a short course','Practise a case'],practiceTask:'Design an adoption plan',successIndicator:'Present measurable outcomes',learning:{free:[{name:'Free leadership learning',provider:'OpenLearn',url:'https://www.open.edu/openlearn/money-management/free-courses'}]}}],
 additionalSkills:[],actionPlan:[{period:'Days 1–30',focus:'Learn',actions:['Practise change management']},{period:'Days 31–60',focus:'Apply',actions:['Create a case']},{period:'Days 61–90',focus:'Demonstrate',actions:['Present to mentor']}],progressChecklist:[{skill:'Change Management',deliverable:'Create a plan',evidence:'Obtain feedback'}]}});
 const sent=await sendReportEmail(ref);assert.equal(sent.status,'sent');assert.equal(outgoing.length,1);
 const mail=outgoing[0];assert.match(mail.html,/Essential competency overview/);assert.equal(mail.attachments?.length,1);
 assert.equal(mail.attachments[0].filename,'career-competency-development-report.pdf');
 const pdf=Buffer.from(mail.attachments[0].content,'base64');assert.match(pdf.toString('latin1').slice(0,9),/%PDF-1\.4/);
 const duplicate=await sendReportEmail(ref);assert.equal(duplicate.status,'sent');assert.equal(outgoing.length,1);
});

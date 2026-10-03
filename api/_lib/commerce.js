import {competencyProgress} from './interview-logic.js';
import crypto from 'node:crypto';
import {ApiError,db,sha,safeEqual} from './store.js';
import {buildReportPdf} from './pdf-report.js';

export const PRICE_PAISE = 49900;
export const ORDERS = 'professionalOrders_v1';
export const COUPONS = 'professionalCoupons_v1';
export const RESERVATION_MS = 25*60*1000;
export function validEmail(value){return typeof value==='string'&&value.trim().length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());}
export function cleanEmail(email){if(!validEmail(email))throw new ApiError(400,'Enter a valid email address.');return email.trim().toLowerCase();}
export function cleanCode(value=''){
 const code=String(value||'').trim().toUpperCase();
 if(code && !/^[A-Z0-9_-]{3,30}$/.test(code))throw new ApiError(400,'Enter a valid coupon code.');
 return code;
}
export function readCoupon(doc,code,now=Date.now()){
 if(!doc || doc.active!==true)throw new ApiError(400,'This coupon is invalid or inactive.');
 const expires=doc.expiresAt?.toMillis?.()??(doc.expiresAt?Date.parse(String(doc.expiresAt)):Infinity);
 if(!Number.isNaN(expires)&&expires<=now)throw new ApiError(400,'This coupon has expired.');
 const kind=doc.discountType;
 const value=Number(doc.value);
 if(!Number.isInteger(value) || !(kind==='percent'&&value>=1&&value<=100 || kind==='fixed'&&value>=1&&value<=499)){
  throw new ApiError(503,'This coupon is not correctly configured.');
 }
 const discount=kind==='percent'?Math.round(PRICE_PAISE*value/100):value*100;
 const amount=Math.max(0,PRICE_PAISE-discount);
 if(amount>0&&amount<100)throw new ApiError(503,'This coupon produces an unsupported payment amount.');
 const maxUses=doc.maxUses===undefined?0:Number(doc.maxUses);
 if(!Number.isSafeInteger(maxUses)||maxUses<0)throw new ApiError(503,'Coupon usage limit is invalid.');
 return {code,discount,amount,maxUses};
}
export function activeReservations(data,now=Date.now()){
 return Object.fromEntries(Object.entries(data?.reservations||{}).filter(([key,expiry])=>/^[a-f0-9]{32}$/.test(key)&&Number(expiry)>now));
}
export function priceQuote(coupon){return {originalAmount:PRICE_PAISE,discount:coupon?.discount||0,amount:coupon?.amount??PRICE_PAISE,currency:'INR',couponCode:coupon?.code||null};}
export function checkoutToken(orderId,nonce,secret=process.env.RAZORPAY_KEY_SECRET){
 if(!secret)throw new ApiError(503,'Checkout access is not configured.');
 return crypto.createHmac('sha256',secret).update(`professional-session-v1|${orderId}|${nonce}`).digest('hex');
}
export function verifyCheckoutProof(order,nonce,orderId=null){
 if(typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce)||!(safeEqual(order?.checkoutNonceHash,sha(nonce))||((orderId||order?.orderId)&&safeEqual(recoveredCheckoutProof(orderId||order.orderId),nonce))))throw new ApiError(401,'Your secure checkout reference is missing or invalid.');
}
export async function razorpay(path,method='GET',body=null){
 const id=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
 if(!id||!secret)throw new ApiError(503,'Razorpay is not configured.');
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),14000);
 try{
  const result=await fetch('https://api.razorpay.com/v1'+path,{method,signal:abort.signal,headers:{Authorization:'Basic '+Buffer.from(`${id}:${secret}`).toString('base64'),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const json=await result.json();
  if(!result.ok){console.error('Razorpay API',result.status,json?.error?.code||'');throw new ApiError(502,'Payment service is temporarily unavailable. Please retry.');}
  return json;
 }catch(err){if(err instanceof ApiError)throw err;throw new ApiError(502,'Could not contact the payment service. Please retry.');}
 finally{clearTimeout(timeout);}
}
export function signatureValid(orderId,paymentId,signature,secret=process.env.RAZORPAY_KEY_SECRET){
 if(!secret||!/^order_[a-zA-Z0-9]+$/.test(orderId)||!/^[a-zA-Z0-9_]+$/.test(paymentId)||!/^[a-f0-9]{64}$/.test(signature||''))return false;
 const computed=crypto.createHmac('sha256',secret).update(`${orderId}|${paymentId}`).digest('hex');
 return safeEqual(computed,signature);
}
export function receiptHtml(report){
 const e=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const list=arr=>`<ul style="padding-left:20px">${(arr||[]).map(x=>`<li style="margin-bottom:7px">${e(x)}</li>`).join('')}</ul>`;
 const learn=(learning={})=>{
  const group=(title,items)=>items?.length?`<p style="font-weight:700;margin:14px 0 5px">${title}</p><ul style="padding-left:20px">${items.map(r=>`<li><a href="${e(r.url)}" style="color:#5535d4">${e(r.name)}</a> — ${e(r.provider)}. ${e(r.description||'')} ${e(r.time?'('+r.time+')':'')}</li>`).join('')}</ul>`:'';
  return group('Free learning',learning.free)+group('Paid learning — confirm current fees',learning.paid)+group('Optional certifications — check eligibility',learning.certifications)+(learning.freeGap?`<p style="color:#526078">${e(learning.freeGap)}</p>`:'');
 };
 const table=(report.skillAssessments||[]).map(s=>`<tr><td style="border:1px solid #dfe4ef;padding:9px">${e(s.name)}</td><td style="border:1px solid #dfe4ef;padding:9px">${e(s.currentCompetency)}</td><td style="border:1px solid #dfe4ef;padding:9px">${e(s.priority||'Review')}</td></tr>`).join('');
 const skills=(report.skillAssessments||[]).map(s=>`<section style="page-break-inside:avoid;border-top:1px solid #e5e8f0;padding:17px 0"><h3 style="color:#17213d">${e(s.name)}</h3><p><b>Role expectation:</b> ${e(s.targetBenchmark)}</p><p><b>Current test-based finding:</b> ${e(s.currentCompetency)}</p><p><b>Specific focus:</b> ${e(s.gap)}</p>${s.subskillsNeedingWork?.length?`<p><b>Subskills to practise:</b> ${e(s.subskillsNeedingWork.join(', '))}</p>`:''}${s.subskillsNotTested?.length?`<p><b>Not covered by the questions:</b> ${e(s.subskillsNotTested.join(', '))}</p>`:''}<b>What to do</b>${list(s.actions)}<p><b>Practical assignment:</b> ${e(s.practiceTask)}</p><p><b>Evidence of improvement:</b> ${e(s.successIndicator)}</p>${learn(s.learning)}</section>`).join('');
 const extras=(report.additionalSkills||[]).map(s=>`<section style="border-top:1px solid #e5e8f0;padding:14px 0"><h3>${e(s.name)} — Not tested</h3><p><b>Expected:</b> ${e(s.expectation)}</p><p><b>Suggested development:</b> ${e(s.nextStep)}</p><p><b>Validate by:</b> ${e(s.howToVerify)}</p>${learn(s.learning)}</section>`).join('');
 const plan=(report.actionPlan||[]).map(s=>`<section><h3 style="color:#5535d4">${e(s.period)} — ${e(s.focus)}</h3>${list(s.actions)}</section>`).join('');
 const intro=`<h1 style="color:#17213d;margin:0 0 4px">Career Competency &amp; Development Report</h1><p style="color:#6847e8;font-weight:700">Career Guide for Professionals · by AI Early Career Guide</p><p><b>Target role:</b> ${e(report.targetRole)}</p><p>${e(report.summary)}</p>`;
 return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font:15px/1.6 Arial,sans-serif;color:#17213d;max-width:780px;margin:0 auto;padding:26px;background:#fff">${intro}<h2 style="color:#17213d">Essential competency overview</h2><p>${e(report.coverage?.assessed??'?')} of ${e(report.coverage?.total??'?')} essential skills fully assessed. All results reflect brief, unproctored test performance.</p><table role="presentation" style="border-collapse:collapse;width:100%"><thead style="background:#f0ebff"><tr><th align="left" style="padding:9px">Skill</th><th align="left" style="padding:9px">Current finding</th><th align="left" style="padding:9px">Priority</th></tr></thead><tbody>${table}</tbody></table>${report.priorities?.length?`<h3>Your immediate priorities</h3>${list(report.priorities.map(s=>s.name+': '+s.firstAction))}`:''}<h2>Each essential skill: gaps and development</h2>${skills||'<p>Insufficient assessment evidence.</p>'}<h2>Other required skills — Not tested</h2>${extras||'<p>No additional skills identified.</p>'}<h2>Personalised 30 / 60 / 90-day plan</h2>${plan}<h2>Progress and reassessment</h2>${list((report.progressChecklist||[]).map(c=>c.skill+': '+c.deliverable+'; Evidence: '+c.evidence))}<hr><small>Learning-resource catalogue reviewed ${e(report.learningCatalogueReviewed||'on publication')}. Check fees, provider availability and eligibility before enrolment. This unproctored assessment does not verify workplace proficiency or guarantee employment. Your complete PDF report is attached.</small></body></html>`;
}
// Firestore lease + Resend idempotency key avoid duplicate sends on retries.
export async function sendReportEmail(ref){
 const database=db();
 let reserved;
 reserved=await database.runTransaction(async tx=>{
  const snap=await tx.get(ref),s=snap.data();
  if(!s||!s.paid||!s.email||!s.report)throw new ApiError(409,'The paid report is not ready for email.');
  if(s.assessmentContractVersion===17){
   const coverage=competencyProgress(s.blueprint||[],s.history||[]);
   if(coverage.total===0||coverage.assessed!==coverage.total||coverage.skills.some(k=>k.answered<3))
    throw new ApiError(409,'This assessment must complete three questions per essential skill before its report can be emailed.');
  }
  if(s.reportEmailSentAt)return {state:'sent'};
  if(s.reportEmailLeaseUntil?.toMillis?.()>Date.now())return {state:'sending'};
  const until=new Date(Date.now()+120000);
  tx.update(ref,{reportEmailLeaseUntil:until,updatedAt:new Date()});
  return {state:'send',to:s.email,report:s.report,sessionId:ref.id};
 });
 if(reserved.state!=='send')return {status:reserved.state};
 try{
  if(!process.env.RESEND_API_KEY||!process.env.REPORT_FROM_EMAIL)throw new ApiError(503,'Report email is not configured yet.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let response,body;
  try{
   response=await fetch('https://api.resend.com/emails',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`career-report-${reserved.sessionId}`},body:JSON.stringify({from:process.env.REPORT_FROM_EMAIL,to:[reserved.to],subject:'Your Career Competency & Development Report — PDF attached',html:receiptHtml(reserved.report),attachments:[{filename:'career-competency-development-report.pdf',content:buildReportPdf(reserved.report).toString('base64'),content_type:'application/pdf'}]})});
   body=await response.json();
  }finally{clearTimeout(timer);}
  if(!response.ok||!body?.id){console.error('Resend error status',response.status,body?.name||'');throw new ApiError(502,'Report email could not be sent. You can retry from the report page.');}
  await ref.update({reportEmailSentAt:new Date(),reportEmailLeaseUntil:null,reportEmailId:body.id,updatedAt:new Date()});
  return {status:'sent'};
 }catch(err){
  await ref.update({reportEmailLeaseUntil:null,updatedAt:new Date()}).catch(()=>{});
  if(err instanceof ApiError)throw err;
  throw new ApiError(502,'Email delivery is temporarily unavailable. Please retry from your report.');
 }
}

// Password-free access is granted only by a paid order's secret checkout proof
// or a short-lived, one-use email link. An email address alone never grants access.
export const ACCESS_LINK_MS=7*24*60*60*1000;
export const ACCESS_LINK_BASE=process.env.PUBLIC_PROFESSIONAL_URL||'https://www.aiearlycareerguide.com/professionals';
export const validOrderId=id=>typeof id==='string'&&/^(?:order_[A-Za-z0-9]+|free_[a-f0-9]{32})$/.test(id);
export function recoveredCheckoutProof(orderId,secret=process.env.RAZORPAY_KEY_SECRET){
 if(!validOrderId(orderId)||!secret)throw new ApiError(401,'This access link cannot be verified.');
 return crypto.createHmac('sha256',secret).update(`career-professionals|recovered-proof-v1|${orderId}`).digest('hex');
}
export function createAccessLink(orderId,expiresAt=Date.now()+ACCESS_LINK_MS,secret=process.env.RAZORPAY_KEY_SECRET){
 if(!validOrderId(orderId)||!secret)throw new ApiError(503,'Email access is not configured.');
 const random=crypto.randomBytes(16).toString('hex');
 const body=`${orderId}.${expiresAt}.${random}`;
 const mac=crypto.createHmac('sha256',secret).update(`career-professionals|magic-link-v1|${body}`).digest('hex');
 return {token:`${body}.${mac}`,tokenHash:sha(random),expiresAt};
}
export function parseAccessLink(token,secret=process.env.RAZORPAY_KEY_SECRET){
 if(typeof token!=='string'||token.length>250)throw new ApiError(401,'This access link is invalid. Request a new email link.');
 const match=token.match(/^((?:order_[A-Za-z0-9]+|free_[a-f0-9]{32}))\.(\d{13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/);
 if(!match||!secret)throw new ApiError(401,'This access link is invalid. Request a new email link.');
 const [,orderId,expires,random,mac]=match;
 const expected=crypto.createHmac('sha256',secret).update(`career-professionals|magic-link-v1|${orderId}.${expires}.${random}`).digest('hex');
 if(!safeEqual(expected,mac)||Number(expires)<Date.now())throw new ApiError(401,'This access link has expired. Request a new link using your email.');
 return {orderId,tokenHash:sha(random),expiresAt:Number(expires)};
}
export function accessEmailHtml({link,free=false,amount=0}){
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 return `<!doctype html><html><body style="font:16px/1.6 Arial,sans-serif;color:#192544;max-width:620px;margin:auto;padding:26px">
 <h1 style="color:#5835d4">Career Guide for Professionals</h1><p>by AI Early Career Guide</p>
 <h2>${free?'Your complimentary assessment is ready':'Your payment is confirmed'}</h2>
 <p>${free?'Your coupon covered the full ₹499 assessment fee.':'We received your payment of ₹'+(amount/100).toLocaleString('en-IN',{maximumFractionDigits:2})+'.'}</p>
 <p>Start your assessment now, or use this link to return if you close your browser. No password is required.</p>
 <p><a href="${esc(link)}" style="display:inline-block;padding:13px 20px;border-radius:9px;background:#603be5;color:white;text-decoration:none;font-weight:bold">Start or Resume Assessment →</a></p>
 <p style="font-size:13px;color:#65718a">This private link works once and expires after 7 days. If you need another link, enter the same email address on our website and select Continue Assessment. Do not forward this link.</p>
 <p style="font-size:13px;color:#65718a">Your final career report will be sent to this email address once completed.</p>
 <p style="font-size:13px">Need help? <a href="https://www.aiearlycareerguide.com/professionals/contact.html">Contact support</a>.</p>
 </body></html>`;
}

// Firestore lease prevents duplicate confirmation emails when browser + webhook race.
// Re-requesting access sends a new one-use link to the purchase email, never to the caller.
export async function sendAccessEmail(orderRef,{resend=false}={}){
 const database=db();const now=Date.now();
 const decision=await database.runTransaction(async tx=>{
  const snapshot=await tx.get(orderRef);if(!snapshot.exists)throw new ApiError(404,'Your order could not be found.');
  const order=snapshot.data();if(order.status!=='paid')return {state:'unpaid'};
  const sentAt=order.accessEmailSentAt?.toMillis?.()||0;
  if(!resend&&sentAt)return {state:'sent'};
  if(order.accessEmailLeaseUntil?.toMillis?.()>now)return {state:'sending'};
  if(resend&&sentAt>now-2*60*1000&&order.accessLinkHash)return {state:'recent'};
  const link=createAccessLink(orderRef.id);
  tx.update(orderRef,{accessLinkHash:link.tokenHash,accessLinkExpiresAt:new Date(link.expiresAt),
   accessEmailSentAt:null,accessEmailLeaseUntil:new Date(now+120000),accessEmailStatus:'sending',updatedAt:new Date()});
  return {state:'send',token:link.token,email:order.email,amount:order.amount,free:order.amount===0};
 });
 if(decision.state!=='send')return {status:decision.state};
 try{
  if(!process.env.RESEND_API_KEY||!process.env.REPORT_FROM_EMAIL)throw new ApiError(503,'Confirmation email is not configured.');
  const url=new URL(ACCESS_LINK_BASE);url.hash=`access=${decision.token}`; // fragment keeps token out of proxy access logs
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
  let response,payload;
  try{
   response=await fetch('https://api.resend.com/emails',{method:'POST',signal:controller.signal,
    headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json',
      'Idempotency-Key':`career-access-${orderRef.id}-${decision.token.split('.')[2]}`},
    body:JSON.stringify({from:process.env.REPORT_FROM_EMAIL,to:[decision.email],
      subject:decision.free?'Your complimentary Career Professionals assessment is ready':'Payment received — Start your Career Professionals assessment',
      html:accessEmailHtml({link:url.toString(),free:decision.free,amount:decision.amount})})});
   payload=await response.json();
  }finally{clearTimeout(timer);}
  if(!response.ok||!payload?.id){console.error('Access email status',response.status);throw new ApiError(502,'The assessment link email could not be sent. Request another link from the website.');}
  await orderRef.update({accessEmailSentAt:new Date(),accessEmailLeaseUntil:null,accessEmailStatus:'sent',accessEmailId:payload.id,updatedAt:new Date()});
  return {status:'sent'};
 }catch(error){
  await orderRef.update({accessEmailLeaseUntil:null,accessEmailStatus:'pending',updatedAt:new Date()}).catch(()=>{});
  if(error instanceof ApiError)throw error;
  throw new ApiError(502,'Email is temporarily unavailable. Request another link from the website.');
 }
}

export async function findIncompleteOrder(database,email){
 // A single-field email query avoids requiring an additional Firestore composite index.
 const snapshot=await database.collection(ORDERS).where('email','==',email).limit(50).get();
 const candidates=snapshot.docs.filter(doc=>doc.data().status==='paid')
  .sort((a,b)=>(b.data().paidAt?.toMillis?.()||b.data().createdAt?.toMillis?.()||0)-
               (a.data().paidAt?.toMillis?.()||a.data().createdAt?.toMillis?.()||0));
 for(const doc of candidates){
  const order=doc.data(),created=order.paidAt?.toMillis?.()||order.createdAt?.toMillis?.()||0;
  if(created&&Date.now()-created>30*24*60*60*1000)continue;
  if(!order.sessionId)return doc;
  const ss=await database.collection('professionalAssessments_v1').doc(order.sessionId).get();
  if(ss.exists&&ss.data().accessExpiresAt?.toMillis?.()>Date.now()){
   const state=ss.data(),coverage=competencyProgress(state.blueprint||[],state.history||[]);
   const invalidComplete=state.status==='complete'&&(
     (state.paid===true&&state.orderId===doc.id&&(!state.history||state.history.length===0)) ||
     (state.assessmentContractVersion===17&&(coverage.total===0||coverage.assessed!==coverage.total)));
   if(state.status!=='complete'||invalidComplete)return doc;
  }
 }
 return null;
}

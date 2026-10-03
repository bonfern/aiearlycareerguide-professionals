import crypto from 'node:crypto';
import {ApiError,db,sha,safeEqual} from './store.js';

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
export function verifyCheckoutProof(order,nonce){
 if(typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce)||!safeEqual(order?.checkoutNonceHash,sha(nonce)))throw new ApiError(401,'Your secure checkout reference is missing or invalid.');
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
 const e=(x)=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 const list=(arr)=>`<ul>${(arr||[]).map(x=>`<li>${e(x)}</li>`).join('')}</ul>`;
 const skills=(report.skillAssessments||[]).map(s=>`<section><h3>${e(s.name)}</h3><p><b>Required:</b> ${e(s.targetBenchmark)}</p><p><b>Current test-based competency:</b> ${e(s.currentCompetency)}</p><p><b>Gap / next-level opportunity:</b> ${e(s.gap)}</p><p><b>Specific actions:</b></p>${list(s.actions)}<p><b>Practical task:</b> ${e(s.practiceTask)}</p><p><b>Evidence of progress:</b> ${e(s.successIndicator)}</p></section>`).join('');
 const extras=(report.additionalSkills||[]).map(s=>`<section><h3>${e(s.name)} — Not tested</h3><p><b>Expected:</b> ${e(s.expectation)}</p><p><b>Next step:</b> ${e(s.nextStep)}</p><p><b>How to validate:</b> ${e(s.howToVerify)}</p></section>`).join('');
 const plan=(report.actionPlan||[]).map(s=>`<section><h3>${e(s.period)} — ${e(s.focus)}</h3>${list(s.actions)}</section>`).join('');
 return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font:16px/1.55 Arial,sans-serif;color:#192c45;max-width:740px;margin:auto;padding:28px"><h1>Your Career Development Report</h1><p><b>Target role:</b> ${e(report.targetRole)}</p><p>${e(report.summary)}</p><h2>Essential skills assessed</h2>${skills||'<p>No skills were fully assessed.</p>'}<h2>Other required skills — Not tested</h2>${extras||'<p>No additional skills identified.</p>'}<h2>Your 30 / 60 / 90-day plan</h2>${plan}<hr><small>These findings are based on unproctored multiple-choice responses and self-reported information. They are not verification of workplace competence or a guarantee of employment.</small></body></html>`;
}
// Firestore lease + Resend idempotency key avoid duplicate sends on retries.
export async function sendReportEmail(ref){
 const database=db();
 let reserved;
 reserved=await database.runTransaction(async tx=>{
  const snap=await tx.get(ref),s=snap.data();
  if(!s||!s.paid||!s.email||!s.report)throw new ApiError(409,'The paid report is not ready for email.');
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
   response=await fetch('https://api.resend.com/emails',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`career-report-${reserved.sessionId}`},body:JSON.stringify({from:process.env.REPORT_FROM_EMAIL,to:[reserved.to],subject:'Your AI Early Career Guide — Professional Assessment Report',html:receiptHtml(reserved.report)})});
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

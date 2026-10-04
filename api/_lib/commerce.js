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
// Shared email-safe layout: fluid tables and inline styles for Gmail, Outlook and mobile email apps.
// The PNG logo is deliberately separate from the WebP used on the website and in the PDF.
const EMAIL_HOME='https://www.aiearlycareerguide.com/professionals';
const EMAIL_LOGO=EMAIL_HOME+'/brand-logo-email.png';
const escEmail=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function emailFrame({subject,eyebrow,body,footerNote=''}){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escEmail(subject)}</title><style>
 @media only screen and (max-width:620px){
 .email-shell{width:100%!important;max-width:100%!important}
 .email-pad{padding:20px 18px!important}
 .email-title{font-size:23px!important;line-height:1.3!important}
 .email-brand{width:150px!important;max-width:150px!important;height:auto!important}
 .email-button{display:block!important;width:100%!important;box-sizing:border-box!important;text-align:center!important}
 .email-text{font-size:15px!important;line-height:1.6!important}
 }
 </style></head><body style="margin:0;padding:0;width:100%;background:#f5f4fc;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif;color:#17213d">
 <div style="display:none;font-size:1px;line-height:1px;color:#f5f4fc;max-height:0;max-width:0;opacity:0;overflow:hidden">${escEmail(eyebrow)}</div>
 <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#f5f4fc"><tr><td align="center" style="padding:18px 8px">
 <table class="email-shell" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;border:1px solid #e8e4f4">
 <tr><td class="email-pad" style="padding:22px 26px;background:#f1edff;border-bottom:4px solid #6944e8">
 <a href="${EMAIL_HOME}" style="text-decoration:none;color:#17213d"><img class="email-brand" src="${EMAIL_LOGO}" width="170" alt="AI Early Career Guide" style="display:block;max-width:170px;width:170px;height:auto;border:0;outline:none;text-decoration:none;background:#ffffff"></a>
 <div style="font-size:19px;line-height:1.3;font-weight:bold;color:#17213d;padding-top:12px">Career Guide for <span style="color:#5938d4">Professionals</span></div>
 <div style="font-size:12px;line-height:1.5;color:#59647c;padding-top:3px">by AI Early Career Guide</div></td></tr>
 <tr><td class="email-pad email-text" style="padding:24px 26px;font-size:15px;line-height:1.6;word-wrap:break-word;overflow-wrap:break-word">${body}</td></tr>
 <tr><td class="email-pad" style="padding:18px 26px;background:#17213d;color:#f2efff;font-size:12px;line-height:1.6;word-wrap:break-word"><strong style="font-size:13px">Career Guide for Professionals</strong><br><a href="${EMAIL_HOME}" style="color:#d8ccff;text-decoration:underline">aiearlycareerguide.com/professionals</a>${footerNote?`<div style="padding-top:10px;color:#e7dfff">${footerNote}</div>`:''}</td></tr>
 </table></td></tr></table></body></html>`;
}
const emailP=(label,value)=>`<p style="margin:0 0 10px;font-size:15px;line-height:1.6"><strong>${escEmail(label)}:</strong> ${escEmail(value)}</p>`;
const emailSection=content=>`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin:14px 0"><tr><td style="padding:15px 14px;border:1px solid #e9e5f5;background:#fcfbff;word-wrap:break-word;overflow-wrap:break-word">${content}</td></tr></table>`;
export function receiptHtml(report){
 const e=escEmail;
 const priority=s=>({'High development priority':'Start here','Development priority':'Work on this','Maintain and stretch':'Build on this strength','More assessment needed':'More practice needed'}[s]||s||'Review');
 const h2=txt=>`<h2 style="font-size:19px;line-height:1.35;color:#17213d;margin:25px 0 12px">${e(txt)}</h2>`;
 const h3=txt=>`<h3 style="font-size:16px;line-height:1.4;color:#17213d;margin:0 0 10px">${e(txt)}</h3>`;
 const list=arr=>`<ul style="margin:8px 0 14px;padding:0 0 0 20px">${(arr||[]).map(x=>`<li style="padding:0 0 8px 0;margin:0;line-height:1.6">${e(x)}</li>`).join('')}</ul>`;
 const learn=(learning={})=>{
  const group=(title,items)=>items?.length?`<h4 style="font-size:15px;line-height:1.4;color:#5938d4;margin:16px 0 6px">${e(title)}</h4><ul style="margin:0;padding:0 0 0 20px">${items.map(r=>{const url=String(r.url||'');const href=/^https:\/\/[^\s"<>]+$/i.test(url)?` href="${e(url)}"`:'',name=e(r.name);return `<li style="margin:0 0 10px;line-height:1.6;overflow-wrap:break-word">${href?`<a${href} style="color:#5938d4;text-decoration:underline;overflow-wrap:anywhere">${name}</a>`:name} — ${e(r.provider)}${r.description?'. '+e(r.description):''}${r.time?' ('+e(r.time)+')':''}</li>`;}).join('')}</ul>`:'';
  return group('Free learning',learning.free)+group('Paid courses — check current fees',learning.paid)+group('Optional certifications',learning.certifications)+(learning.freeGap?`<p style="color:#59647c">${e(learning.freeGap)}</p>`:'');
 };
 // Stacked skill cards replace the old three-column overview, which overflowed on phones.
 const overview=(report.skillAssessments||[]).map(s=>emailSection(`${h3(s.name)}${emailP('Your result',s.currentCompetency)}${emailP('Next step',priority(s.priority))}`)).join('');
 const skills=(report.skillAssessments||[]).map(s=>emailSection(`${h3(s.name)}${emailP('What your next role needs',s.targetBenchmark)}${emailP('Your assessment result',s.currentCompetency)}${emailP('What to improve',s.gap)}${s.subskillsNeedingWork?.length?emailP('Topics to practise',s.subskillsNeedingWork.join(', ')):''}${s.subskillsNotTested?.length?emailP('Not covered by this assessment',s.subskillsNotTested.join(', ')):''}<h4 style="font-size:15px;color:#5938d4;margin:14px 0 6px">Your next steps</h4>${list(s.actions)}${emailP('Practical task',s.practiceTask)}${emailP('How to check progress',s.successIndicator)}${learn(s.learning)}`)).join('');
 const extras=(report.additionalSkills||[]).map(s=>emailSection(`${h3(s.name+' — Not tested')}${emailP('What is expected',s.expectation)}${emailP('How to develop it',s.nextStep)}${emailP('How to check progress',s.howToVerify)}${learn(s.learning)}`)).join('');
 const plan=(report.actionPlan||[]).map(s=>emailSection(`<h3 style="font-size:16px;color:#5938d4;margin:0 0 8px">${e(s.period)} — ${e(s.focus)}</h3>${list(s.actions)}`)).join('');
 const content=`<h1 class="email-title" style="font-size:25px;line-height:1.3;margin:0 0 16px;color:#17213d">Your Career Competency &amp; Development Report</h1>
 ${emailP('Your goal',report.targetRole||'Your next career move')}<p style="margin:14px 0 18px">${e(report.summary)}</p>
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1edff;border-collapse:collapse"><tr><td style="padding:13px 15px;border-left:4px solid #6944e8"><strong>${e(report.coverage?.assessed??'?')} of ${e(report.coverage?.total??'?')}</strong> essential skills assessed</td></tr></table>
 ${h2('1. Your essential skills at a glance')}${overview}
 ${report.priorities?.length?`${h2('Where to focus first')}${list(report.priorities.map(s=>s.name+': '+s.firstAction))}`:''}
 ${h2('2. Your skill-by-skill development plan')}${skills||'<p>Not enough information to assess these skills yet.</p>'}
 ${h2('3. Other skills your goal may require')}${extras||'<p>No other required skills were identified.</p>'}
 ${h2('4. Your 30 / 60 / 90-day action plan')}${plan}
 ${h2('5. Track your progress')}${list((report.progressChecklist||[]).map(c=>c.skill+': '+c.deliverable+'; Check: '+c.evidence))}
 <p style="font-size:12px;line-height:1.65;color:#59647c;margin-top:22px">This multiple-choice assessment shows your test performance; it does not prove workplace competence or guarantee employment. Confirm course fees and eligibility with the provider before enrolling. Your branded PDF report is attached.</p>`;
 return emailFrame({subject:'Your Career Competency & Development Report',eyebrow:'Your personal career report and PDF attachment are ready.',body:content});
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
 const title=free?'Your complimentary assessment is ready':'Your payment is confirmed';
 const amountText=free?'Your coupon covers the full ₹499 assessment fee.':'We received your payment of ₹'+(amount/100).toLocaleString('en-IN',{maximumFractionDigits:2})+'.';
 const safeLink=escEmail(link);
 const content=`<h1 class="email-title" style="font-size:25px;line-height:1.3;margin:0 0 16px;color:#17213d">${title}</h1>
 <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${amountText}</p>
 <p style="margin:0 0 20px;font-size:15px;line-height:1.6">You can start now or use your private link to return later. No password is needed.</p>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0"><tr><td align="center" style="border-radius:8px;background:#603be5"><a class="email-button" href="${safeLink}" style="display:block;padding:15px 18px;font-size:16px;line-height:1.4;font-weight:bold;text-align:center;color:#ffffff;text-decoration:none;border-radius:8px;background:#603be5">Start or Resume Assessment →</a></td></tr></table>
 <p style="font-size:13px;line-height:1.6;color:#59647c;margin:18px 0">This private link works once and expires after seven days. Do not forward it. If it expires, enter your email on our website and select Continue Assessment.</p>
 <p style="font-size:13px;line-height:1.6;color:#59647c;margin:12px 0">Your finished career report will be emailed to this address.</p>
 <p style="font-size:13px;line-height:1.6;margin:14px 0 0">Need help? <a href="${EMAIL_HOME}/contact.html" style="color:#5938d4;text-decoration:underline">Contact support</a>.</p>`;
 return emailFrame({subject:title,eyebrow:free?'Your free assessment access is confirmed.':'Your payment was successful. Your assessment link is inside.',body:content});
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

import crypto from 'node:crypto';
import {db,ApiError,output,handleError,postOnly,parseBody,sha} from './_lib/store.js';
import {ORDERS,COUPONS,PRICE_PAISE,RESERVATION_MS,razorpay,readCoupon,cleanCode,cleanEmail,priceQuote,activeReservations,findIncompleteOrder,sendAccessEmail,verifyCheckoutProof} from './_lib/commerce.js';

export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{
  const body=parseBody(req),mode=String(req.query?.mode||new URL(req.url||'/', 'https://local.invalid').searchParams.get('mode')||'');
  const database=db();
  if(mode==='lookup'){
   const email=cleanEmail(body.email),day=new Date().toISOString().slice(0,10);
   const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].slice(0,80);
   const limiter=database.collection('professionalEmailLookupDaily_v1').doc(`${day}_${sha(`${ip}|${process.env.RAZORPAY_KEY_SECRET}`).slice(0,40)}`);
   await database.runTransaction(async tx=>{
    const snap=await tx.get(limiter),count=Number(snap.data()?.count||0);
    if(count>=40)throw new ApiError(429,'Too many email checks. Please try later.');
    tx.set(limiter,{count:count+1,retainUntil:new Date(Date.now()+3*86400000)},{merge:true});
   });
   const unfinished=await findIncompleteOrder(database,email);
   let sameDevice=false;
   // A returning browser can prove access with its verified purchase OR its existing
   // unexpired assessment session. An email address alone cannot grant access.
   if(unfinished){
    const order=unfinished.data();
    if(body.orderId===unfinished.id&&typeof body.checkoutNonce==='string'){
     try{verifyCheckoutProof(order,body.checkoutNonce,unfinished.id);sameDevice=true;}catch{}
    }
    if(!sameDevice&&order.sessionId&&body.sessionId===order.sessionId&&
       typeof body.sessionToken==='string'&&/^[a-f0-9]{64}$/.test(body.sessionToken)){
     const session=await database.collection('professionalAssessments_v1').doc(order.sessionId).get();
     const s=session.data();
     if(session.exists&&s.paid===true&&s.email===email&&s.status!=='complete'&&
        s.accessExpiresAt?.toMillis?.()>Date.now()&&
        sha(body.sessionToken)===s.tokenHash)sameDevice=true;
    }
   }
   return output(res,200,{unfinished:Boolean(unfinished),sameDevice,...(sameDevice?{sessionId:unfinished.data().sessionId||null}:{})});
  }
  if(mode==='recover'){
   const email=cleanEmail(body.email);
   if(!process.env.RESEND_API_KEY||!process.env.REPORT_FROM_EMAIL){
    throw new ApiError(503,'Email recovery is not configured yet. Please contact support.');
   }
   const day=new Date().toISOString().slice(0,10),ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].slice(0,80);
   const limitRef=database.collection('professionalRecoveryDaily_v1').doc(`${day}_${sha(`${email}|${ip}|${process.env.RAZORPAY_KEY_SECRET}`).slice(0,35)}`);
   await database.runTransaction(async tx=>{
    const d=await tx.get(limitRef),count=Number(d.data()?.count||0);
    if(count>=5)throw new ApiError(429,'Too many requests today. Please contact support if your link has not arrived.');
    tx.set(limitRef,{count:count+1,retainUntil:new Date(Date.now()+3*86400000)},{merge:true});
   });
   const pending=await findIncompleteOrder(database,email);
   // Same generic response whether or not an order exists: no customer enumeration.
   if(pending){
    try{await sendAccessEmail(pending.ref,{resend:true});}
    catch(err){console.warn('Access-email request could not be delivered',err.message);
     throw new ApiError(502,'We could not send your secure link. Please try again or contact support.');}
   }
   return output(res,200,{message:'If an unfinished paid or complimentary assessment exists for this email, you will receive a private link shortly. Check Spam as well.'});
  }
  if(mode==='quote'){
   // Consent must precede a coupon lookup. Pricing is still independently recomputed at payment.
   if(body.consent!==true)throw new ApiError(400,'Please accept the Terms and Privacy Policy before applying a coupon.');
   cleanEmail(body.email);
   const code=cleanCode(body.couponCode);
   if(!code)return output(res,200,priceQuote(null));
   const doc=await database.collection(COUPONS).doc(code).get();
   if(!doc.exists)throw new ApiError(400,'Invalid coupon code.');
   const coupon=readCoupon(doc.data(),code);
   const used=Number(doc.data().usedCount||0),held=Object.keys(activeReservations(doc.data())).length;
   if(coupon.maxUses&&used+held>=coupon.maxUses)throw new ApiError(400,'This coupon has reached its usage limit.');
   return output(res,200,priceQuote(coupon));
  }
  if(mode)throw new ApiError(400,'Unknown checkout request.');
  const email=cleanEmail(body.email),code=cleanCode(body.couponCode);
  if(body.consent!==true)throw new ApiError(400,'Please accept the Terms and Privacy Policy before payment.');
  if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw new ApiError(503,'Payment is not configured yet.');
  // Prevent a second charge when someone already paid but left an assessment unfinished.
  const unfinished=await findIncompleteOrder(database,email);
  if(unfinished){
   try{await sendAccessEmail(unfinished.ref,{resend:true});}catch(error){console.warn('An unfinished assessment exists; reminder could not be sent',error.message);}
   throw new ApiError(409,'An unfinished assessment exists for this email. Return to the email screen and select Continue Assessment.');
  }
  const nonce=crypto.randomBytes(32).toString('hex'),checkoutId=crypto.randomBytes(16).toString('hex');
  let quoted=null;
  if(code){const snap=await database.collection(COUPONS).doc(code).get();if(!snap.exists)throw new ApiError(400,'Invalid coupon code.');quoted=readCoupon(snap.data(),code);}
  const quote=priceQuote(quoted),orderId=quote.amount>0?(await razorpay('/orders','POST',{amount:quote.amount,currency:'INR',receipt:`cp_${checkoutId}`,notes:{product:'career_professionals'}})).id:`free_${checkoutId}`;
  if(!/^order_[A-Za-z0-9]+$/.test(orderId)&&!/^free_[a-f0-9]{32}$/.test(orderId))throw new ApiError(502,'Payment service returned an invalid order reference.');
  const now=Date.now(),orderRef=database.collection(ORDERS).doc(orderId),day=new Date().toISOString().slice(0,10);
  const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].slice(0,100);
  const rateRef=database.collection('professionalCheckoutDaily_v1').doc(`${day}_${sha(`${ip}|${process.env.RAZORPAY_KEY_SECRET}`).slice(0,32)}`);
  const lockRef=database.collection('professionalCheckoutLocks_v1').doc(sha(email));
  await database.runTransaction(async tx=>{
   const docs=await Promise.all([tx.get(rateRef),tx.get(lockRef),...(code?[tx.get(database.collection(COUPONS).doc(code))]:[])]);
   const starts=Number(docs[0].data()?.starts||0);
   if(starts>=20)throw new ApiError(429,'Daily checkout limit reached. Please try again tomorrow.');
   const lock=docs[1].data();
   if(lock?.expiresAt?.toMillis?.()>now)throw new ApiError(409,'A checkout for this email is already in progress. Check Previous Payment or request your assessment link before paying again.');
   if(code){
    if(!docs[2].exists)throw new ApiError(400,'Coupon is no longer available.');
    const ref=database.collection(COUPONS).doc(code),data=docs[2].data(),effective=readCoupon(data,code,now);
    if(effective.amount!==quote.amount)throw new ApiError(409,'Coupon price changed. Please try again.');
    const active=activeReservations(data,now),used=Number(data.usedCount||0);
    if(effective.maxUses&&used+Object.keys(active).length>=effective.maxUses)throw new ApiError(409,'Coupon limit reached. Please try another coupon.');
    if(quote.amount===0)tx.update(ref,{usedCount:used+1,reservations:active});
    else{active[checkoutId]=now+RESERVATION_MS;tx.update(ref,{reservations:active});}
   }
   tx.set(rateRef,{starts:starts+1,retainUntil:new Date(now+3*86400000)},{merge:true});
   tx.set(lockRef,{orderId,status:quote.amount===0?'paid':'checkout',expiresAt:new Date(quote.amount===0?now:now+RESERVATION_MS),retainUntil:new Date(now+35*86400000)});
   tx.create(orderRef,{orderId,email,checkoutId,checkoutNonceHash:sha(nonce),couponCode:code||null,
    consentAt:new Date(now),consentVersion:'professional-terms-2026-10',originalAmount:PRICE_PAISE,
    amount:quote.amount,currency:'INR',status:quote.amount===0?'paid':'created',
    paymentId:null,...(quote.amount===0?{paidAt:new Date(now)}:{}),
    accessEmailStatus:'pending',createdAt:new Date(now),updatedAt:new Date(now),retainUntil:new Date(now+180*86400000)});
  });
  let emailStatus='pending';
  // Complimentary checkouts get the same access email as a successful paid checkout.
  if(quote.amount===0)try{emailStatus=(await sendAccessEmail(orderRef)).status;}catch(e){console.warn('Complimentary access email pending',e.message);}
  return output(res,201,{orderId,checkoutNonce:nonce,razorpayKeyId:quote.amount?process.env.RAZORPAY_KEY_ID:null,
   originalAmount:quote.originalAmount,discount:quote.discount,amount:quote.amount,currency:'INR',email,
   couponCode:code||null,requiresPayment:quote.amount>0,emailStatus});
 }catch(err){return handleError(res,err,'create-order');}
}

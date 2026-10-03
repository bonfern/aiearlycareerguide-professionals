import crypto from 'node:crypto';
import {db,ApiError,output,handleError,postOnly,parseBody,sha} from './_lib/store.js';
import {ORDERS,COUPONS,PRICE_PAISE,RESERVATION_MS,razorpay,readCoupon,cleanCode,cleanEmail,priceQuote,activeReservations} from './_lib/commerce.js';
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{
  const body=parseBody(req);
  // Quote-only requests share this function with checkout so Hobby deployments
  // stay within Vercel's serverless-function limit. A quote never grants access.
  const mode=String(req.query?.mode||new URL(req.url||'/', 'https://local.invalid').searchParams.get('mode')||'');
  if(mode==='quote'){
   const code=cleanCode(body.couponCode);
   if(!code)return output(res,200,priceQuote(null));
   const doc=await db().collection(COUPONS).doc(code).get();
   if(!doc.exists)throw new ApiError(400,'Invalid coupon code.');
   const coupon=readCoupon(doc.data(),code);
   const used=Number(doc.data().usedCount||0),held=Object.keys(activeReservations(doc.data())).length;
   if(coupon.maxUses&&used+held>=coupon.maxUses)throw new ApiError(400,'This coupon has reached its usage limit.');
   return output(res,200,priceQuote(coupon));
  }
  if(mode)throw new ApiError(400,'Unknown checkout request.');
  const email=cleanEmail(body.email),code=cleanCode(body.couponCode);
  if(body.consent!==true)throw new ApiError(400,'Please agree to the assessment data notice before payment.');
  if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw new ApiError(503,'Payment is not configured yet.');
  const database=db(),nonce=crypto.randomBytes(32).toString('hex'),checkoutId=crypto.randomBytes(16).toString('hex');
  let quoted=null;
  if(code){const snap=await database.collection(COUPONS).doc(code).get();if(!snap.exists)throw new ApiError(400,'Invalid coupon code.');quoted=readCoupon(snap.data(),code);}
  const quote=priceQuote(quoted),orderId=quote.amount>0?(await razorpay('/orders','POST',{amount:quote.amount,currency:'INR',receipt:`cp_${checkoutId}`,notes:{product:'career_professionals'}})).id:`free_${checkoutId}`;
  if(!/^order_[A-Za-z0-9]+$/.test(orderId)&&!/^free_[a-f0-9]{32}$/.test(orderId))throw new ApiError(502,'Payment service returned an invalid order reference.');
  const now=Date.now(),orderRef=database.collection(ORDERS).doc(orderId);
  const day=new Date().toISOString().slice(0,10);
  const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].slice(0,100);
  const rateRef=database.collection('professionalCheckoutDaily_v1').doc(`${day}_${sha(`${ip}|${process.env.RAZORPAY_KEY_SECRET}`).slice(0,32)}`);
  await database.runTransaction(async tx=>{
   const docs=await Promise.all([tx.get(rateRef),...(code?[tx.get(database.collection(COUPONS).doc(code))]:[])]);
   const starts=Number(docs[0].data()?.starts||0);
   if(starts>=20)throw new ApiError(429,'Daily checkout limit reached. Please try again tomorrow.');
   let effective=null;
   if(code){
    if(!docs[1].exists)throw new ApiError(400,'Coupon is no longer available.');
    const ref=database.collection(COUPONS).doc(code),data=docs[1].data();
    effective=readCoupon(data,code,now);
    if(effective.amount!==quote.amount)throw new ApiError(409,'Coupon price changed. Please try again.');
    const active=activeReservations(data,now),used=Number(data.usedCount||0);
    if(effective.maxUses&&used+Object.keys(active).length>=effective.maxUses)throw new ApiError(409,'Coupon limit reached. Please try another coupon.');
    if(quote.amount===0)tx.update(ref,{usedCount:used+1,reservations:active});
    else{active[checkoutId]=now+RESERVATION_MS;tx.update(ref,{reservations:active});}
   }
   tx.set(rateRef,{starts:starts+1,retainUntil:new Date(now+3*86400000)},{merge:true});
   tx.create(orderRef,{email,checkoutId,checkoutNonceHash:sha(nonce),couponCode:code||null,
    originalAmount:PRICE_PAISE,amount:quote.amount,currency:'INR',status:quote.amount===0?'paid':'created',
    paymentId:null,createdAt:new Date(now),updatedAt:new Date(now),retainUntil:new Date(now+180*86400000)});
  });
  return output(res,201,{orderId,checkoutNonce:nonce,razorpayKeyId:quote.amount?process.env.RAZORPAY_KEY_ID:null,
   originalAmount:quote.originalAmount,discount:quote.discount,amount:quote.amount,currency:'INR',email,couponCode:code||null,requiresPayment:quote.amount>0});
 }catch(err){return handleError(res,err,'create-order');}
}

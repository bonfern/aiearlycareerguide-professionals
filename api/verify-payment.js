import crypto from 'node:crypto';
import {db,ApiError,output,handleError,safeEqual,sha} from './_lib/store.js';
import {ORDERS,COUPONS,razorpay,verifyCheckoutProof,signatureValid,activeReservations,sendAccessEmail,validOrderId} from './_lib/commerce.js';

// The same serverless function handles browser verification AND Razorpay webhooks.
// This keeps the Vercel Hobby deployment within 12 serverless functions.
export const config={api:{bodyParser:false}};
async function readRaw(req){
 if(req.body!==undefined){return Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));}
 const chunks=[];let size=0;
 for await(const part of req){size+=Buffer.byteLength(part);if(size>65536)throw new ApiError(413,'Request too large.');chunks.push(Buffer.from(part));}
 return Buffer.concat(chunks);
}
async function capturedPayment(orderId,preferredPaymentId=''){
 let payment=null;
 if(preferredPaymentId)payment=await razorpay(`/payments/${encodeURIComponent(preferredPaymentId)}`);
 else{
  const list=await razorpay(`/orders/${encodeURIComponent(orderId)}/payments`);
  payment=(list.items||[]).find(p=>p.order_id===orderId&&p.status==='captured');
 }
 return payment;
}
async function confirmCapturedOrder(database,orderRef,payment){
 const snapshot=await orderRef.get();
 if(!snapshot.exists)throw new ApiError(404,'Order not found.');
 const order=snapshot.data();
 if(order.status==='paid')return order;
 if(payment?.status!=='captured')return null;
 if(payment.order_id!==orderRef.id||payment.amount!==order.amount||payment.currency!=='INR')
  throw new ApiError(409,'Payment details do not match the assessment order. Contact support before retrying.');
 await database.runTransaction(async tx=>{
  const fresh=await tx.get(orderRef);if(!fresh.exists)throw new ApiError(404,'Order was not found.');
  const current=fresh.data();if(current.status==='paid')return;
  if(current.amount!==payment.amount||current.currency!==payment.currency)throw new ApiError(409,'Order amount changed unexpectedly.');
  let couponRef=null,couponSnap=null;
  if(current.couponCode){couponRef=database.collection(COUPONS).doc(current.couponCode);couponSnap=await tx.get(couponRef);}
  const lockRef=database.collection('professionalCheckoutLocks_v1').doc(sha(current.email)),lockSnap=await tx.get(lockRef);
  if(couponSnap?.exists){const c=couponSnap.data(),active=activeReservations(c);delete active[current.checkoutId];
   tx.update(couponRef,{usedCount:Number(c.usedCount||0)+1,reservations:active});}
  if(lockSnap.exists&&lockSnap.data().orderId===orderRef.id)tx.update(lockRef,{status:'paid',expiresAt:new Date(0)});
  tx.update(orderRef,{status:'paid',paymentId:payment.id,paidAt:new Date(),updatedAt:new Date()});
 });
 return (await orderRef.get()).data();
}
async function notify(orderRef){
 try{return (await sendAccessEmail(orderRef)).status;}
 catch(error){console.warn('Paid checkout confirmed; access email queued for recovery',error.message);return 'pending';}
}
async function handleWebhook(req,res,raw){
 if(!process.env.RAZORPAY_WEBHOOK_SECRET)throw new ApiError(503,'Razorpay webhook secret is not configured.');
 const supplied=String(req.headers['x-razorpay-signature']||'');
 const expected=crypto.createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(supplied)||!safeEqual(supplied,expected))throw new ApiError(401,'Invalid webhook signature.');
 let body;try{body=JSON.parse(raw.toString('utf8'));}catch{throw new ApiError(400,'Invalid webhook payload.');}
 if(!['payment.captured','order.paid'].includes(body.event))return output(res,200,{ok:true});
 const entity=body.payload?.payment?.entity||body.payload?.order?.entity;
 const orderId=entity?.order_id||(body.event==='order.paid'?entity?.id:null);
 if(!validOrderId(orderId))return output(res,200,{ok:true});
 const database=db(),orderRef=database.collection(ORDERS).doc(orderId),snap=await orderRef.get();
 if(!snap.exists)return output(res,200,{ok:true});
 let payment=null;
 try{payment=await capturedPayment(orderId,body.payload?.payment?.entity?.id||'');}
 catch(e){console.warn('Webhook waiting for captured-payment confirmation',e.message);return output(res,503,{retry:true});}
 if(!payment||payment.status!=='captured')return output(res,503,{retry:true});
 await confirmCapturedOrder(database,orderRef,payment);
 const emailStatus=await notify(orderRef);
 // Let Razorpay retry delivery if its captured payment is recorded but the email provider is down.
 if(emailStatus==='pending'||emailStatus==='sending')return output(res,503,{retry:true});
 return output(res,200,{ok:true});
}
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return output(res,405,{error:'POST required.'});}
 try{
  const raw=await readRaw(req);
  if(req.headers['x-razorpay-signature'])return await handleWebhook(req,res,raw);
  let body;try{body=JSON.parse(raw.toString('utf8'));}catch{throw new ApiError(400,'Invalid checkout request.');}
  const orderId=String(body.orderId||'');if(!validOrderId(orderId))throw new ApiError(400,'Invalid order reference.');
  const database=db(),orderRef=database.collection(ORDERS).doc(orderId),snap=await orderRef.get();
  if(!snap.exists)throw new ApiError(404,'Order not found.');
  const order=snap.data();verifyCheckoutProof(order,body.checkoutNonce,orderId);
  if(order.status==='paid')return output(res,200,{paid:true,orderId,email:order.email,amount:order.amount,emailStatus:await notify(orderRef)});
  if(order.amount===0)throw new ApiError(409,'This complimentary checkout is not ready.');
  const paymentId=String(body.razorpay_payment_id||''),signature=String(body.razorpay_signature||'');
  if(paymentId||signature){
   if(!signatureValid(orderId,paymentId,signature))throw new ApiError(400,'Payment signature verification failed.');
  }
  const payment=await capturedPayment(orderId,paymentId);
  if(!payment||payment.status!=='captured')return output(res,202,{paid:false,orderId,message:'Payment has not been captured yet. If you just paid, wait and check again.'});
  await confirmCapturedOrder(database,orderRef,payment);
  const emailStatus=await notify(orderRef);
  return output(res,200,{paid:true,orderId,email:order.email,amount:order.amount,emailStatus});
 }catch(error){return handleError(res,error,'verify-payment');}
}

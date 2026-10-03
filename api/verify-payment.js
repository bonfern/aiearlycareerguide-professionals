import {db,ApiError,output,handleError,postOnly,parseBody} from './_lib/store.js';
import {ORDERS,COUPONS,razorpay,verifyCheckoutProof,signatureValid,activeReservations} from './_lib/commerce.js';
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{
  const raw=parseBody(req),orderId=String(raw.orderId||'');
  if(!/^(order_[A-Za-z0-9]+|free_[a-f0-9]{32})$/.test(orderId))throw new ApiError(400,'Invalid order reference.');
  const database=db(),orderRef=database.collection(ORDERS).doc(orderId),snap=await orderRef.get();
  if(!snap.exists)throw new ApiError(404,'Order not found.');
  const order=snap.data();verifyCheckoutProof(order,raw.checkoutNonce);
  if(order.status==='paid')return output(res,200,{paid:true,orderId,email:order.email,amount:order.amount});
  if(order.amount===0)throw new ApiError(409,'This complimentary checkout is not ready.');
  const paymentId=String(raw.razorpay_payment_id||'');
  const signature=String(raw.razorpay_signature||'');
  let payment;
  if(paymentId||signature){
   if(!signatureValid(orderId,paymentId,signature))throw new ApiError(400,'Payment signature verification failed.');
   payment=await razorpay(`/payments/${encodeURIComponent(paymentId)}`);
  }else{
   // Recover captured payments if the browser lost Razorpay's checkout callback.
   const list=await razorpay(`/orders/${encodeURIComponent(orderId)}/payments`);
   payment=(list.items||[]).find(x=>x.status==='captured'&&x.order_id===orderId&&x.amount===order.amount);
   if(!payment)return output(res,202,{paid:false,orderId,message:'Payment has not been captured yet. If you just paid, wait and check again.'});
  }
  if(payment.status!=='captured')return output(res,202,{paid:false,orderId,message:'Your payment is awaiting capture. Check again shortly.'});
  if(payment.order_id!==orderId||payment.amount!==order.amount||payment.currency!=='INR')throw new ApiError(409,'Payment details do not match your checkout. Contact support before retrying.');
  await database.runTransaction(async tx=>{
   const fresh=await tx.get(orderRef);if(!fresh.exists)throw new ApiError(404,'Order was not found.');
   const current=fresh.data();verifyCheckoutProof(current,raw.checkoutNonce);
   if(current.status==='paid')return;
   if(current.amount!==payment.amount||current.currency!==payment.currency)throw new ApiError(409,'Order amount changed unexpectedly.');
   if(current.couponCode){
    const cRef=database.collection(COUPONS).doc(current.couponCode),cSnap=await tx.get(cRef);
    if(cSnap.exists){const c=cSnap.data(),active=activeReservations(c);delete active[current.checkoutId];
     tx.update(cRef,{usedCount:Number(c.usedCount||0)+1,reservations:active});}
   }
   tx.update(orderRef,{status:'paid',paymentId:payment.id,paidAt:new Date(),updatedAt:new Date()});
  });
  return output(res,200,{paid:true,orderId,email:order.email,amount:order.amount});
 }catch(err){return handleError(res,err,'verify-payment');}
}

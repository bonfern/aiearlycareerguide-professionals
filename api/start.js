import crypto from 'node:crypto';
import {db,newSession,previewAuthorized,ApiError,output,handleError,postOnly,parseBody,sha,safeEqual} from './_lib/store.js';
import {validatePayload} from './_lib/interview-logic.js';
import {ORDERS,verifyCheckoutProof,checkoutToken,parseAccessLink,recoveredCheckoutProof} from './_lib/commerce.js';
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{
  if(!process.env.OPENAI_API_KEY||!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_SERVICE_ACCOUNT_BASE64))throw new ApiError(503,'The assessment service is not configured.');
  const raw=parseBody(req);
  const database=db();
  if(raw.accessLink){
   const link=parseAccessLink(raw.accessLink),orderRef=database.collection(ORDERS).doc(link.orderId);
   const granted=await database.runTransaction(async tx=>{
    const snap=await tx.get(orderRef);
    if(!snap.exists)throw new ApiError(401,'This access link is no longer valid. Request a new one.');
    const order=snap.data();
    if(order.status!=='paid'||!safeEqual(order.accessLinkHash,link.tokenHash)||
      order.accessLinkExpiresAt?.toMillis?.()<Date.now())throw new ApiError(401,'This link has expired or was already used. Request another link.');
    let session=null,token=null;
    if(order.sessionId){
     const ref=database.collection('professionalAssessments_v1').doc(order.sessionId),ss=await tx.get(ref);
     if(!ss.exists)throw new ApiError(410,'This assessment was deleted. Contact support for assistance.');
     session=ss.data();
     if(session.accessExpiresAt?.toMillis?.()<Date.now())throw new ApiError(410,'Assessment access has expired. Contact support.');
     token=crypto.randomBytes(32).toString('hex');
     tx.update(ref,{tokenHash:sha(token),updatedAt:new Date()}); // link rotates browser session authorization
    }
    tx.update(orderRef,{accessLinkHash:null,accessLinkUsedAt:new Date(),updatedAt:new Date()});
    return {orderId:link.orderId,email:order.email,sessionId:order.sessionId||null,
      sessionToken:token,paid:!!order.sessionId,status:session?.status||null,
      accessExpiresAt:session?.accessExpiresAt?.toDate?.()?.toISOString?.()||null};
   });
   return output(res,200,{...granted,checkoutNonce:recoveredCheckoutProof(granted.orderId)});
  }
  // A paid order with an existing assessment needs only the checkout proof to
  // resume. A NEW assessment must still provide a fully validated profile.
  let profile=null;
  if(raw.profile!==undefined){
   try{profile=validatePayload({profile:raw.profile,history:[]}).profile;}
   catch(e){throw new ApiError(400,e.message);}
  }
  if(raw.paidOrder){
   const {orderId,checkoutNonce}=raw.paidOrder;
   if(typeof orderId!=='string'||!/^(order_[A-Za-z0-9]+|free_[a-f0-9]{32})$/.test(orderId))throw new ApiError(400,'Invalid checkout reference.');
   const orderRef=database.collection(ORDERS).doc(orderId),token=checkoutToken(orderId,checkoutNonce);
   const granted=await database.runTransaction(async tx=>{
    const snap=await tx.get(orderRef);
    if(!snap.exists)throw new ApiError(404,'Checkout was not found.');
    const order=snap.data();verifyCheckoutProof(order,checkoutNonce,orderId);
    if(order.status!=='paid')throw new ApiError(402,'Your payment has not been verified. Please check your payment first.');
    if(order.sessionId){
     const ref=database.collection('professionalAssessments_v1').doc(order.sessionId),existing=await tx.get(ref);
     if(!existing.exists)throw new ApiError(410,'This assessment was deleted. Contact support.');
     if(existing.data().accessExpiresAt?.toMillis?.()<Date.now())throw new ApiError(410,'Assessment access has expired. Contact support.');
     tx.update(ref,{tokenHash:sha(token),updatedAt:new Date()});
     return {id:order.sessionId,accessExpiresAt:existing.data().accessExpiresAt.toDate().toISOString(),status:existing.data().status,reused:true};
    }
    if(!profile)throw new ApiError(400,'Complete your profile before starting the assessment.');
    const session=newSession(30),ref=database.collection('professionalAssessments_v1').doc(session.id);
    tx.create(ref,{tokenHash:sha(token),email:order.email,paid:true,orderId,
     profile,history:[],currentQuestion:null,status:'active',callsUsed:0,generationLease:null,
     createdAt:new Date(),updatedAt:new Date(),accessExpiresAt:session.accessExpiresAt,retainUntil:session.retainUntil});
    tx.update(orderRef,{sessionId:session.id,updatedAt:new Date()});
    return {id:session.id,accessExpiresAt:session.accessExpiresAt.toISOString(),reused:false};
   });
   return output(res,201,{sessionId:granted.id,sessionToken:token,paid:true,
    accessExpiresAt:granted.accessExpiresAt,status:granted.status||'active',reused:granted.reused});
  }
  if(!profile)throw new ApiError(400,'Complete your profile before starting the assessment.');
  if(!process.env.PREVIEW_ACCESS_CODE||!previewAuthorized(raw.previewCode))throw new ApiError(401,'Incorrect private preview access code.');
  const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].slice(0,80);
  const day=new Date().toISOString().slice(0,10),session=newSession();
  const bucket=database.collection('professionalBetaDaily_v1').doc(`${day}_${sha(`${process.env.PREVIEW_ACCESS_CODE}:${ip}`).slice(0,30)}`);
  const ref=database.collection('professionalAssessments_v1').doc(session.id);
  await database.runTransaction(async tx=>{
   const existing=await tx.get(bucket),starts=existing.exists?(existing.data().starts||0):0;
   if(starts>=5)throw new ApiError(429,'Daily preview limit reached. Please try again tomorrow.');
   tx.set(bucket,{starts:starts+1,retainUntil:new Date(Date.now()+3*86400000)},{merge:true});
   tx.create(ref,{tokenHash:session.tokenHash,paid:false,profile,history:[],currentQuestion:null,
    status:'active',callsUsed:0,generationLease:null,createdAt:new Date(),updatedAt:new Date(),
    accessExpiresAt:session.accessExpiresAt,retainUntil:session.retainUntil});
  });
  return output(res,201,{sessionId:session.id,sessionToken:session.token,paid:false,
   accessExpiresAt:session.accessExpiresAt.toISOString(),status:'active'});
 }catch(e){return handleError(res,e,'start');}
}

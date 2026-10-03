import crypto from 'node:crypto';
import {db,newSession,previewAuthorized,ApiError,output,handleError,postOnly,parseBody,sha,safeEqual} from './_lib/store.js';
import {validatePayload} from './_lib/interview-logic.js';
import {ORDERS,verifyCheckoutProof,checkoutToken,parseAccessLink,recoveredCheckoutProof,createAccessLink} from './_lib/commerce.js';
async function orderEmail(database,id){const snap=await database.collection(ORDERS).doc(id).get();return snap.data()?.email||null;}
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{
  if(!process.env.OPENAI_API_KEY||!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_SERVICE_ACCOUNT_BASE64))throw new ApiError(503,'The assessment service is not configured.');
  const raw=parseBody(req);
  const database=db();
  // One-time cross-domain transfer: only a browser holding its original purchase
  // proof or an unexpired session token can create a short-lived transfer link.
  // Email alone is never sufficient. No new serverless function is required.
  if(raw.transferToBranded){
   const proof=raw.paidOrder||{},sessionProof=raw.sessionProof||{};
   const orderId=typeof proof.orderId==='string'?proof.orderId:sessionProof.orderId;
   if(typeof orderId!=='string'||!/^(order_[A-Za-z0-9]+|free_[a-f0-9]{32})$/.test(orderId))
    throw new ApiError(401,'This browser has no purchase reference. Please use email recovery.');
   const ref=database.collection(ORDERS).doc(orderId);
   const link=await database.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if(!snapshot.exists||snapshot.data().status!=='paid')throw new ApiError(401,'Your purchase could not be verified.');
    const order=snapshot.data();let allowed=false;
    if(proof.orderId===orderId&&typeof proof.checkoutNonce==='string'){
     try{verifyCheckoutProof(order,proof.checkoutNonce,orderId);allowed=true;}catch{}
    }
    if(!allowed&&order.sessionId&&sessionProof.orderId===orderId&&sessionProof.sessionId===order.sessionId&&
      typeof sessionProof.sessionToken==='string'&&/^[a-f0-9]{64}$/.test(sessionProof.sessionToken)){
      const ss=await tx.get(database.collection('professionalAssessments_v1').doc(order.sessionId));
      if(ss.exists&&ss.data().paid===true&&ss.data().email===order.email&&
         ss.data().accessExpiresAt?.toMillis?.()>Date.now()&&
         ss.data().status!=='complete'&&sha(sessionProof.sessionToken)===ss.data().tokenHash)allowed=true;
    }
    if(!allowed)throw new ApiError(401,'This browser has no valid saved access. Use your assessment email link.');
    if(order.sessionId){
     const existing=await tx.get(database.collection('professionalAssessments_v1').doc(order.sessionId));
     if(!existing.exists||existing.data().status==='complete'||existing.data().accessExpiresAt?.toMillis?.()<=Date.now())
      throw new ApiError(410,'This assessment is no longer open. Contact support.');
    }
    const next=createAccessLink(orderId,Date.now()+5*60*1000);
    tx.update(ref,{accessLinkHash:next.tokenHash,accessLinkExpiresAt:new Date(next.expiresAt),accessEmailSentAt:null,updatedAt:new Date()});
    return next;
   });
   const target=new URL('https://www.aiearlycareerguide.com/professionals');
   target.hash='access='+encodeURIComponent(link.token);
   return output(res,200,{transferUrl:target.toString()});
  }
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
     if(existing.data().orderId!==orderId||existing.data().email!==order.email||existing.data().paid!==true)
      throw new ApiError(409,'The saved assessment does not belong to this purchase. Please contact support; do not pay again.');
     // Older deployments could mark a session complete before asking ANY skill
     // questions. A valid purchase may safely reset this impossible result.
     const old=existing.data(),noInterview=old.status==='complete'&&(!old.history||old.history.length===0);
     const updates={tokenHash:sha(token),updatedAt:new Date()};
     if(noInterview)Object.assign(updates,{status:'active',assessmentContractVersion:17,
      history:[],blueprint:null,questionBank:null,currentQuestion:null,report:null,
      reportGeneratedAt:null,reportLease:null,reportCallsUsed:0,untestedSkills:[],
      completionMode:null,generationLease:null,callsUsed:0});
     tx.update(ref,updates);
     return {id:order.sessionId,accessExpiresAt:old.accessExpiresAt.toDate().toISOString(),
      status:noInterview?'active':old.status,reused:true,repaired:noInterview};
    }
    if(!profile)throw new ApiError(400,'Complete your profile before starting the assessment.');
    const session=newSession(30),ref=database.collection('professionalAssessments_v1').doc(session.id);
    tx.create(ref,{tokenHash:sha(token),email:order.email,paid:true,orderId,
     profile,history:[],currentQuestion:null,blueprint:null,questionBank:null,report:null,assessmentContractVersion:17,
     status:'active',callsUsed:0,generationLease:null,
     createdAt:new Date(),updatedAt:new Date(),accessExpiresAt:session.accessExpiresAt,retainUntil:session.retainUntil});
    tx.update(orderRef,{sessionId:session.id,updatedAt:new Date()});
    return {id:session.id,accessExpiresAt:session.accessExpiresAt.toISOString(),reused:false};
   });
   return output(res,201,{sessionId:granted.id,sessionToken:token,paid:true,
    accessExpiresAt:granted.accessExpiresAt,status:granted.status||'active',reused:granted.reused,repaired:Boolean(granted.repaired),
    orderId,email:(await orderEmail(database,orderId))});
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
    status:'active',assessmentContractVersion:17,callsUsed:0,generationLease:null,createdAt:new Date(),updatedAt:new Date(),
    accessExpiresAt:session.accessExpiresAt,retainUntil:session.retainUntil});
  });
  return output(res,201,{sessionId:session.id,sessionToken:session.token,paid:false,
   accessExpiresAt:session.accessExpiresAt.toISOString(),status:'active'});
 }catch(e){return handleError(res,e,'start');}
}

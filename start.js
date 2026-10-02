import {db,newSession,previewAuthorized,ApiError,output,handleError,postOnly,parseBody,sha} from './_lib/store.js';
import {validatePayload} from './_lib/interview-logic.js';
// Private beta: preview code + per-IP daily start cap. Public launch requires real sign-in and payment.
export default async function handler(req,res){
  if(!postOnly(req,res))return;
  try{
    if(!process.env.OPENAI_API_KEY || !process.env.PREVIEW_ACCESS_CODE || !process.env.FIREBASE_SERVICE_ACCOUNT_BASE64)
      throw new ApiError(503,'This preview is not configured yet.');
    const raw=parseBody(req);
    if(!previewAuthorized(raw.previewCode)) throw new ApiError(401,'Incorrect preview access code.');
    let profile;
    try{profile=validatePayload({profile:raw.profile,history:[]}).profile;}
    catch(e){throw new ApiError(400,e.message);}
    const database=db(), session=newSession();
    // x-vercel-forwarded-for is provided by Vercel; when absent, this falls back to shared beta quota.
    const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].slice(0,80);
    const day=new Date().toISOString().slice(0,10);
    const bucket=database.collection('professionalBetaDaily_v1').doc(`${day}_${sha(`${process.env.PREVIEW_ACCESS_CODE}:${ip}`).slice(0,30)}`);
    const ref=database.collection('professionalAssessments_v1').doc(session.id);
    await database.runTransaction(async tx=>{
      const existing=await tx.get(bucket),starts=existing.exists?(existing.data().starts||0):0;
      if(starts>=5)throw new ApiError(429,'Daily preview limit reached. Please try again tomorrow.');
      tx.set(bucket,{starts:starts+1,retainUntil:new Date(Date.now()+3*24*60*60*1000)},{merge:true});
      tx.create(ref,{ tokenHash:session.tokenHash, profile,history:[],currentQuestion:null,
        status:'active', callsUsed:0,generationLease:null,createdAt:new Date(),updatedAt:new Date(),
        accessExpiresAt:session.accessExpiresAt,retainUntil:session.retainUntil });
    });
    return output(res,201,{sessionId:session.id,sessionToken:session.token,accessExpiresAt:session.accessExpiresAt.toISOString(),status:'active'});
  }catch(e){return handleError(res,e,'start');}
}

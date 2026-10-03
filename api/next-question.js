import crypto from 'node:crypto';
import {db,authorize,ApiError,output,handleError,postOnly,MAX_AI_CALLS,safeState} from './_lib/store.js';
import {MAX_QUESTIONS} from './_lib/interview-logic.js';
import {generateQuestion} from './_lib/ai.js';
export default async function handler(req,res){
  if(!postOnly(req,res))return;
  let ref,leaseId;
  try{
    ({ref}=await authorize(req));
    const result=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref);if(!snap.exists)throw new ApiError(401,'Session no longer available.');
      const s=snap.data();
      if(s.currentQuestion)return {kind:'existing',state:safeState(s)};
      if(s.status==='complete'||s.history.length>=MAX_QUESTIONS){if(s.status!=='complete')tx.update(ref,{status:'complete',updatedAt:new Date()});return {kind:'done',answered:s.history.length};}
      if(s.callsUsed>=MAX_AI_CALLS)throw new ApiError(429,'This test interview has reached its AI request limit.');
      const now=Date.now(),lease=s.generationLease;
      if(lease && lease.until > now)throw new ApiError(409,'A question is already being generated. Please retry in a few seconds.');
      leaseId=crypto.randomUUID();
      tx.update(ref,{generationLease:{id:leaseId,until:now+115000},callsUsed:s.callsUsed+1,updatedAt:new Date()});
      return {kind:'generate',profile:s.profile,history:s.history};
    });
    if(result.kind==='existing')return output(res,200,{done:false,...result.state});
    if(result.kind==='done')return output(res,200,{done:true,status:'complete',answered:result.answered});
    const generated=await generateQuestion(result.profile,result.history);
    const saved=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),s=snap.data();
      if(!s || s.generationLease?.id!==leaseId)throw new ApiError(409,'Generation was superseded. Refresh the interview.');
      if(generated.done){tx.update(ref,{status:'complete',generationLease:null,updatedAt:new Date()});return {done:true,status:'complete',answered:s.history.length};}
      const question={...generated.question,id:crypto.randomUUID()};
      tx.update(ref,{currentQuestion:question,generationLease:null,updatedAt:new Date()});
      return {done:false,question,answered:s.history.length,maxQuestions:MAX_QUESTIONS};
    });
    return output(res,200,saved);
  }catch(error){
    if(ref && leaseId)try{await db().runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists && snap.data().generationLease?.id===leaseId)tx.update(ref,{generationLease:null});});}catch(e){console.error('Could not clear generation lease',e.message);}
    return handleError(res,error,'next-question');
  }
}

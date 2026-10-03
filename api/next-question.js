import crypto from 'node:crypto';
import {db,authorize,ApiError,output,handleError,postOnly,MAX_AI_CALLS,safeState,publicQuestion,publicProgress} from './_lib/store.js';
import {MAX_QUESTIONS,nextCompetency} from './_lib/interview-logic.js';
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
   if(s.status==='complete')return {kind:'done',answered:s.history.length,progress:publicProgress(s),completionMode:s.completionMode||'full'};
   const target=s.blueprint?.length?nextCompetency(s.blueprint,s.history):null;
   if((s.blueprint?.length&&!target)||s.history.length>=MAX_QUESTIONS){
    const progress=publicProgress(s);
    const completionMode=progress.total>0&&progress.assessed===progress.total?'full':'early';
    tx.update(ref,{status:'complete',completionMode,updatedAt:new Date()});
    return {kind:'done',answered:s.history.length,progress,completionMode};
   }
   if((s.callsUsed||0)>=MAX_AI_CALLS)throw new ApiError(429,'AI request limit reached. Contact the assessment administrator.');
   const now=Date.now(),lease=s.generationLease;
   if(lease&&lease.until>now)throw new ApiError(409,'A question is being generated. Retry shortly.');
   leaseId=crypto.randomUUID();
   tx.update(ref,{generationLease:{id:leaseId,until:now+140000},callsUsed:(s.callsUsed||0)+1,updatedAt:new Date()});
   return {kind:'generate',profile:s.profile,history:s.history,blueprint:s.blueprint||null,target};
  });
  if(result.kind==='existing')return output(res,200,{done:false,...result.state});
  if(result.kind==='done')return output(res,200,{done:true,status:'complete',answered:result.answered,progress:result.progress,completionMode:result.completionMode});
  const generated=await generateQuestion(result.profile,result.history,result.blueprint,result.target);
  const saved=await db().runTransaction(async tx=>{
   const snap=await tx.get(ref),s=snap.data();
   if(!s||s.generationLease?.id!==leaseId)throw new ApiError(409,'Generation was superseded. Refresh your interview.');
   const question={...generated.question,id:crypto.randomUUID()};
   tx.update(ref,{blueprint:generated.blueprint,currentQuestion:question,generationLease:null,updatedAt:new Date()});
   return {done:false,question:publicQuestion(question),answered:s.history.length,
    progress:publicProgress({...s,blueprint:generated.blueprint})};
  });
  return output(res,200,saved);
 }catch(error){
  if(ref&&leaseId)try{await db().runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data().generationLease?.id===leaseId)tx.update(ref,{generationLease:null});});}catch(e){console.error('Could not clear generation lease',e.message);}
  return handleError(res,error,'next-question');
 }
}

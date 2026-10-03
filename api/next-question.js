import crypto from 'node:crypto';
import {db,authorize,ApiError,output,handleError,postOnly,MAX_AI_CALLS,safeState,publicQuestion,publicProgress} from './_lib/store.js';
import {MAX_QUESTIONS,nextCompetency,scoredHistory,competencyProgress} from './_lib/interview-logic.js';
import {generateQuestion,generateAssessmentBank} from './_lib/ai.js';
import {choosePreparedQuestion} from './_lib/assessment-bank.js';
import {getOrCreateAssessmentBank} from './_lib/question-cache.js';
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 let ref,leaseId;
 try{
  ({ref}=await authorize(req));
  const result=await db().runTransaction(async tx=>{
   const snap=await tx.get(ref);if(!snap.exists)throw new ApiError(401,'Session no longer available.');
   const s=snap.data();
   if(s.currentQuestion)return {kind:'existing',state:safeState(s)};
   const gradedHistory=scoredHistory(s.history||[]);
   const completion=competencyProgress(s.blueprint||[],gradedHistory);
   // Never trust a legacy "complete" flag by itself. Finished results from
   // older versions can still be reopened when a saved report really exists.
   const finished=completion.total>=4&&completion.assessed===completion.total&&
     gradedHistory.filter(h=>typeof h.correct==='boolean').length>=completion.total*3;
   if(s.status==='complete'&&(s.report||finished))
    return {kind:'done',hasReport:Boolean(s.report),answered:gradedHistory.length,progress:publicProgress(s),completionMode:s.completionMode||'full'};
   // Older incomplete sessions may have been marked complete by the retired early-exit path.
   if(s.status==='complete'&&!s.report)tx.update(ref,{status:'active',completionMode:null,updatedAt:new Date()});
   const target=s.blueprint?.length?nextCompetency(s.blueprint,gradedHistory):null;
   if(s.blueprint?.length&&!target){
    if(completion.assessed!==completion.total||completion.total===0)
     throw new ApiError(409,'Your assessment is not fully complete. Please contact support to restore any missing questions.');
    const progress=publicProgress(s);
    tx.update(ref,{status:'complete',completionMode:'full',updatedAt:new Date()});
    return {kind:'done',answered:gradedHistory.length,progress,completionMode:'full'};
   }
   if(gradedHistory.length>=MAX_QUESTIONS)
    throw new ApiError(409,'The assessment reached its safety limit before all skills were covered. Please contact support.');
   if((s.callsUsed||0)>=MAX_AI_CALLS)throw new ApiError(429,'AI request limit reached. Contact the assessment administrator.');
   // Once the question bank exists, deliver the next question from Firestore
   // without a network round-trip to OpenAI.
   if(s.questionBank?.length){
    const prepared=choosePreparedQuestion(s.blueprint,s.questionBank,gradedHistory,target);
    if(!prepared)throw new ApiError(409,'A prepared question is missing. Please contact the administrator.');
    const question={...prepared,id:crypto.randomUUID()};
    tx.update(ref,{currentQuestion:question,updatedAt:new Date()});
    return {kind:'prepared',question:publicQuestion(question),answered:s.history.length,
      progress:publicProgress(s)};
   }
   const now=Date.now(),lease=s.generationLease;
   if(lease&&lease.until>now)throw new ApiError(409,'A question is being generated. Retry shortly.');
   leaseId=crypto.randomUUID();
   tx.update(ref,{generationLease:{id:leaseId,until:now+140000},callsUsed:(s.callsUsed||0)+1,updatedAt:new Date()});
   return {kind:'generate',profile:s.profile,history:gradedHistory,blueprint:s.blueprint||null,target};
  });
  if(result.kind==='existing')return output(res,200,{done:false,...result.state});
  if(result.kind==='done')return output(res,200,{done:true,status:'complete',hasReport:result.hasReport,answered:result.answered,progress:result.progress,completionMode:result.completionMode});
  if(result.kind==='prepared')return output(res,200,{done:false,...result});
  // Brand-new V7 sessions: create and validate the *entire* short assessment
  // in one call. Existing V6 sessions can still use their original flow.
  const fresh=!result.blueprint;
  const generated=fresh?(await getOrCreateAssessmentBank(db(),result.profile,generateAssessmentBank)).bank:await generateQuestion(result.profile,result.history,result.blueprint,result.target);
  const saved=await db().runTransaction(async tx=>{
   const snap=await tx.get(ref),s=snap.data();
   if(!s||s.generationLease?.id!==leaseId)throw new ApiError(409,'Generation was superseded. Refresh your interview.');
   const initial=fresh?choosePreparedQuestion(generated.blueprint,generated.questionBank,[],generated.blueprint[0]):generated.question;
   if(!initial)throw new ApiError(502,'The initial question is missing. Please retry.');
   const question={...initial,id:crypto.randomUUID()};
   tx.update(ref,{blueprint:generated.blueprint,currentQuestion:question,
    ...(fresh?{questionBank:generated.questionBank,untestedSkills:generated.untestedSkills,targetRole:generated.targetRole,assessmentVersion:7}:{}),
    generationLease:null,updatedAt:new Date()});
   return {done:false,question:publicQuestion(question),answered:s.history.length,
    progress:publicProgress({...s,blueprint:generated.blueprint})};
  });
  return output(res,200,saved);
 }catch(error){
  if(ref&&leaseId)try{await db().runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data().generationLease?.id===leaseId)tx.update(ref,{generationLease:null});});}catch(e){console.error('Could not clear generation lease',e.message);}
  return handleError(res,error,'next-question');
 }
}

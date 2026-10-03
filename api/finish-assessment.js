import {db,authorize,ApiError,output,handleError,postOnly,publicProgress} from './_lib/store.js';
import {earlyFinishEligibility} from './_lib/interview-logic.js';

// Allows a tester to stop a long assessment while preserving all completed answers.
// The report explicitly labels unanswered competencies as NOT ASSESSED.
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{
  const {ref}=await authorize(req);
  const result=await db().runTransaction(async tx=>{
   const snapshot=await tx.get(ref);
   if(!snapshot.exists)throw new ApiError(401,'Assessment session no longer available.');
   const session=snapshot.data();
   if(session.status==='complete')return {done:true,progress:publicProgress(session),completionMode:session.completionMode||'full'};
   if(session.status!=='active'||!session.blueprint?.length)throw new ApiError(409,'Begin the skill assessment before finishing.');
   const eligibility=earlyFinishEligibility(session.blueprint,session.history||[]);
   if(!eligibility.eligible)throw new ApiError(409,'For a useful preliminary report, first answer at least 8 questions across 3 skill areas.');
   const updated={status:'complete',completionMode:'early',currentQuestion:null,generationLease:null,updatedAt:new Date()};
   tx.update(ref,updated);
   return {done:true,completionMode:'early',answered:eligibility.answered,progress:publicProgress({...session,...updated})};
  });
  return output(res,200,result);
 }catch(error){return handleError(res,error,'finish-assessment');}
}

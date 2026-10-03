import {db,authorize,ApiError,output,handleError,postOnly,parseBody,validateAnswer,publicProgress} from './_lib/store.js';
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{
  const raw=parseBody(req,4000),{ref}=await authorize(req);
  if(typeof raw.questionId!=='string')throw new ApiError(400,'Missing question identifier.');
  const updated=await db().runTransaction(async tx=>{
   const snap=await tx.get(ref),s=snap.data();
   if(!s||s.status!=='active'||!s.currentQuestion)throw new ApiError(409,'No question is awaiting an answer. Refresh your interview.');
   const q=s.currentQuestion;
   if(q.id!==raw.questionId)throw new ApiError(409,'This question has already changed. Refresh your interview.');
   const answer=validateAnswer(q,raw.answer);
   const history=[...s.history,{
    question:q.text,category:q.category,answer,competencyId:q.competencyId,subskill:q.subskill,
    questionType:q.questionType,difficulty:q.difficulty,correct:answer===q.options[q.answerKey],expectedAnswer:q.options[q.answerKey],
    rationale:q.rationale,questionConfig:q
   }];
   tx.update(ref,{history,currentQuestion:null,updatedAt:new Date()});
   return {ok:true,answered:history.length,progress:publicProgress({...s,history})};
  });
  return output(res,200,updated);
 }catch(e){return handleError(res,e,'submit-answer');}
}

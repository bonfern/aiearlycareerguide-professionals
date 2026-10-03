import {db,authorize,ApiError,output,handleError,postOnly,publicQuestion} from './_lib/store.js';
export default async function handler(req,res){
  if(!postOnly(req,res))return;
  try{
    const {ref}=await authorize(req);
    const result=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),s=snap.data();
      if(s?.report)throw new ApiError(409,'This assessment already has a generated report. Start a new assessment to change your answers.');
      if(!s || !s.history.length)throw new ApiError(409,'There is no earlier answer to correct.');
      if(s.generationLease && s.generationLease.until > Date.now())throw new ApiError(409,'Please wait until the next question finishes generating.');
      const history=[...s.history],last=history.pop();
      tx.update(ref,{history,currentQuestion:last.questionConfig,status:'active',generationLease:null,updatedAt:new Date()});
      return {question:publicQuestion(last.questionConfig),answer:last.answer,answered:history.length};
    });
    return output(res,200,result);
  }catch(e){return handleError(res,e,'back');}
}

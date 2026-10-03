import crypto from 'node:crypto';
import {db,authorize,ApiError,output,handleError,postOnly} from './_lib/store.js';
import {MIN_QUESTIONS} from './_lib/interview-logic.js';
import {generateReport} from './_lib/report.js';

export default async function handler(req,res){
  if(!postOnly(req,res))return;
  let ref,leaseId;
  try{
    ({ref}=await authorize(req));
    const state=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),s=snap.data();
      if(!s)throw new ApiError(401,'Assessment session not found.');
      if(s.status!=='complete'||(s.history||[]).length<MIN_QUESTIONS)throw new ApiError(409,'Finish your live AI interview before generating a report.');
      if(s.report)return {kind:'cached',report:s.report,generatedAt:s.reportGeneratedAt?.toDate?.()?.toISOString?.()||null};
      if(s.reportCallsUsed>=2)throw new ApiError(429,'Report generation limit reached for this preview session.');
      if(s.reportLease?.until>Date.now())throw new ApiError(409,'Your report is already being generated. Please wait and try again.');
      leaseId=crypto.randomUUID();
      tx.update(ref,{reportLease:{id:leaseId,until:Date.now()+175000},reportCallsUsed:(s.reportCallsUsed||0)+1,updatedAt:new Date()});
      return {kind:'generate',profile:s.profile,history:s.history};
    });
    if(state.kind==='cached')return output(res,200,{report:state.report,generatedAt:state.generatedAt,cached:true});
    const report=await generateReport(state.profile,state.history);
    const saved=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),s=snap.data();
      if(!s||s.reportLease?.id!==leaseId)throw new ApiError(409,'Report generation was superseded. Please refresh.');
      const generatedAt=new Date();
      tx.update(ref,{report,reportGeneratedAt:generatedAt,reportLease:null,updatedAt:generatedAt});
      return {report,generatedAt:generatedAt.toISOString(),cached:false};
    });
    return output(res,200,saved);
  }catch(error){
    if(ref&&leaseId)try{await db().runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data().reportLease?.id===leaseId)tx.update(ref,{reportLease:null});});}catch(e){console.error('Could not clear report lease',e.message);}
    return handleError(res,error,'generate-report');
  }
}

import crypto from 'node:crypto';
import {db,authorize,ApiError,output,handleError,postOnly} from './_lib/store.js';
import {competencyProgress} from './_lib/interview-logic.js';
import {generateReport} from './_lib/report.js';
import {sendReportEmail} from './_lib/commerce.js';

export default async function handler(req,res){
  if(!postOnly(req,res))return;
  let ref,leaseId;
  try{
    ({ref}=await authorize(req));
    const state=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),s=snap.data();
      if(!s)throw new ApiError(401,'Assessment session not found.');
      if(s.status!=='complete'||!s.blueprint?.length||competencyProgress(s.blueprint,s.history||[]).total===0)throw new ApiError(409,'Finish your role-specific skill assessment before generating a report.');
      if(s.report)return {kind:'cached',report:s.report,generatedAt:s.reportGeneratedAt?.toDate?.()?.toISOString?.()||null,paid:Boolean(s.paid)};
      if(s.reportCallsUsed>=2)throw new ApiError(429,'Report generation limit reached for this preview session.');
      if(s.reportLease?.until>Date.now())throw new ApiError(409,'Your report is already being generated. Please wait and try again.');
      leaseId=crypto.randomUUID();
      tx.update(ref,{reportLease:{id:leaseId,until:Date.now()+175000},reportCallsUsed:(s.reportCallsUsed||0)+1,updatedAt:new Date()});
      return {kind:'generate',paid:Boolean(s.paid),profile:s.profile,history:s.history,blueprint:s.blueprint,untestedSkills:s.untestedSkills||[],targetRole:s.targetRole||s.profile.targetJobTitle||s.profile.careerObjective};
    });
    if(state.kind==='cached'){
      let emailStatus='not-applicable';
      if(state.paid)try{emailStatus=(await sendReportEmail(ref)).status;}catch(e){emailStatus='pending';}
      return output(res,200,{report:state.report,generatedAt:state.generatedAt,cached:true,emailStatus});
    }
    const report=await generateReport(state.profile,state.history,state.blueprint,state.untestedSkills,state.targetRole);
    const saved=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),s=snap.data();
      if(!s||s.reportLease?.id!==leaseId)throw new ApiError(409,'Report generation was superseded. Please refresh.');
      const generatedAt=new Date();
      tx.update(ref,{report,reportGeneratedAt:generatedAt,reportLease:null,updatedAt:generatedAt});
      return {report,generatedAt:generatedAt.toISOString(),cached:false};
    });
    let emailStatus='not-applicable';
    if(state.paid)try{emailStatus=(await sendReportEmail(ref)).status;}catch(e){emailStatus='pending';console.warn('Report saved; email can be retried.');}
    return output(res,200,{...saved,emailStatus});
  }catch(error){
    if(ref&&leaseId)try{await db().runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data().reportLease?.id===leaseId)tx.update(ref,{reportLease:null});});}catch(e){console.error('Could not clear report lease',e.message);}
    return handleError(res,error,'generate-report');
  }
}

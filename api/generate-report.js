import crypto from 'node:crypto';
import {db,authorize,ApiError,output,handleError,postOnly} from './_lib/store.js';
import {competencyProgress} from './_lib/interview-logic.js';
import {generateReport} from './_lib/report.js';
import {validateLearningPreferences} from './_lib/learning-catalog.js';
import {sendReportEmail} from './_lib/commerce.js';

export default async function handler(req,res){
  if(!postOnly(req,res))return;
  let ref,leaseId;
  try{
    ({ref}=await authorize(req));
    let preferences;try{preferences=validateLearningPreferences(req.body?.learningPreferences);}catch{throw new ApiError(400,'Select valid learning preferences before generating your report.');}
    const state=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),s=snap.data();
      if(!s)throw new ApiError(401,'Assessment session not found.');
      const coverage=competencyProgress(s.blueprint||[],s.history||[]);
      if(s.assessmentContractVersion===17 && (coverage.total===0||coverage.assessed!==coverage.total||
         coverage.skills.some(skill=>skill.answered<3)))
       throw new ApiError(409,'Complete all three questions for every essential skill before accessing your report.');
      if(s.report)return {kind:'cached',report:s.report,generatedAt:s.reportGeneratedAt?.toDate?.()?.toISOString?.()||null,paid:Boolean(s.paid)};
      if(s.status!=='complete'||coverage.total===0||coverage.assessed!==coverage.total||
         coverage.skills.some(skill=>skill.answered<3))
       throw new ApiError(409,'Complete all three questions for every essential skill before generating your report.');
      if(s.reportCallsUsed>=2)throw new ApiError(429,'Report generation limit reached for this preview session.');
      if(s.reportLease?.until>Date.now())throw new ApiError(409,'Your report is already being generated. Please wait and try again.');
      leaseId=crypto.randomUUID();
      tx.update(ref,{reportLease:{id:leaseId,until:Date.now()+175000},reportCallsUsed:(s.reportCallsUsed||0)+1,updatedAt:new Date()});
      return {kind:'generate',paid:Boolean(s.paid),profile:s.profile,history:s.history,blueprint:s.blueprint,untestedSkills:s.untestedSkills||[],targetRole:s.targetRole||s.profile.targetJobTitle||s.profile.careerObjective,learningPreferences:preferences};
    });
    if(state.kind==='cached'){
      let emailStatus='not-applicable';
      if(state.paid)try{emailStatus=(await sendReportEmail(ref)).status;}catch(e){emailStatus='pending';}
      return output(res,200,{report:state.report,generatedAt:state.generatedAt,cached:true,emailStatus});
    }
    const report=await generateReport(state.profile,state.history,state.blueprint,state.untestedSkills,state.targetRole,state.learningPreferences);
    const saved=await db().runTransaction(async tx=>{
      const snap=await tx.get(ref),s=snap.data();
      if(!s||s.reportLease?.id!==leaseId)throw new ApiError(409,'Report generation was superseded. Please refresh.');
      const generatedAt=new Date();
      tx.update(ref,{report,learningPreferences:state.learningPreferences,reportGeneratedAt:generatedAt,reportLease:null,updatedAt:generatedAt});
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

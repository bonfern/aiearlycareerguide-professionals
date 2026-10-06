import crypto from 'node:crypto';
import {db,authorize,ApiError,output,handleError,postOnly} from './_lib/store.js';
import {competencyProgress} from './_lib/interview-logic.js';
import {startReportGeneration,retrieveReportGeneration,completeReportGeneration} from './_lib/report.js';
import {validateLearningPreferences} from './_lib/learning-catalog.js';
import {sendReportEmail} from './_lib/commerce.js';

const POLL_AFTER_MS=3000;
const JOB_LEASE_MS=20*60*1000;
const REPORT_VERSION=4;

function iso(value){
 try{return value?.toDate?.()?.toISOString?.()||null;}catch{return null;}
}

function reportState(s,preferences){
 const coverage=competencyProgress(s.blueprint||[],s.history||[]);
 if(s.assessmentContractVersion===17&&(coverage.total===0||coverage.assessed!==coverage.total||coverage.skills.some(skill=>skill.answered<3)))
  throw new ApiError(409,'Complete all three questions for every essential skill before accessing your report.');
 if(s.report&&Number(s.report.reportVersion||0)>=REPORT_VERSION)return {kind:'cached',report:s.report,generatedAt:iso(s.reportGeneratedAt),paid:Boolean(s.paid)};
 if(s.status!=='complete'||coverage.total===0||coverage.assessed!==coverage.total||coverage.skills.some(skill=>skill.answered<3))
  throw new ApiError(409,'Complete all three questions for every essential skill before generating your report.');
 const common={paid:Boolean(s.paid),profile:s.profile||{},history:s.history||[],blueprint:s.blueprint||[],untestedSkills:s.untestedSkills||[],
  targetRole:s.targetRole||s.profile?.targetJobTitle||s.profile?.careerObjective,learningPreferences:s.reportJob?.learningPreferences||preferences};
 if(s.reportJob?.responseId&&Number(s.reportJob.generationVersion||0)>=REPORT_VERSION)return {kind:'poll',responseId:s.reportJob.responseId,...common};
 if(s.reportLease?.until>Date.now())return {kind:'waiting',waitUntil:s.reportLease.until,...common};
 const upgradingOldReport=Boolean(s.report)&&Number(s.report.reportVersion||0)<REPORT_VERSION;
 if(!upgradingOldReport&&Number(s.reportCallsUsed||0)>=4)throw new ApiError(429,'Report generation limit reached for this preview session.');
 return {kind:'start',upgradingOldReport,...common};
}

async function emailStatusFor(ref,paid){
 if(!paid)return 'not-applicable';
 try{return (await sendReportEmail(ref)).status;}catch(e){console.warn('Report saved; email can be retried.',e?.message||'');return 'pending';}
}

async function saveCompleted(ref,responseId,report,learningPreferences,paid,leaseId=null){
 const saved=await db().runTransaction(async tx=>{
  const snap=await tx.get(ref),s=snap.data();
  if(!s)throw new ApiError(401,'Assessment session not found.');
  if(s.report&&Number(s.report.reportVersion||0)>=REPORT_VERSION)return {report:s.report,generatedAt:iso(s.reportGeneratedAt),cached:true};
  const sameJob=responseId&&s.reportJob?.responseId===responseId;
  const sameLease=leaseId&&s.reportLease?.id===leaseId;
  if(!sameJob&&!sameLease)throw new ApiError(409,'Report generation was superseded. Please refresh.');
  const generatedAt=new Date();
  tx.update(ref,{report,learningPreferences,reportGeneratedAt:generatedAt,reportLease:null,reportJob:null,updatedAt:generatedAt});
  return {report,generatedAt:generatedAt.toISOString(),cached:false};
 });
 const emailStatus=await emailStatusFor(ref,paid);
 return {...saved,emailStatus};
}

async function clearFailedJob(ref,responseId){
 await db().runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)return;
  const s=snap.data();
  if(s.reportJob?.responseId===responseId)tx.update(ref,{reportJob:null,reportLease:null,updatedAt:new Date()});
 });
}

export default async function handler(req,res){
 if(!postOnly(req,res))return;
 let ref,leaseId=null,startedJob=false;
 try{
  ({ref}=await authorize(req));
  let preferences;try{preferences=validateLearningPreferences(req.body?.learningPreferences);}catch{throw new ApiError(400,'Select valid learning preferences before generating your report.');}

  let state=await db().runTransaction(async tx=>{
   const snap=await tx.get(ref);let s=snap.data();
   if(!s)throw new ApiError(401,'Assessment session not found.');
   if(s.reportJob?.responseId&&Number(s.reportJob.generationVersion||0)<REPORT_VERSION){
    tx.update(ref,{reportJob:null,reportLease:null,updatedAt:new Date()});
    s={...s,reportJob:null,reportLease:null};
   }
   const current=reportState(s,preferences);
   if(current.kind!=='start')return current;
   leaseId=crypto.randomUUID();
   tx.update(ref,{reportLease:{id:leaseId,until:Date.now()+JOB_LEASE_MS},reportCallsUsed:Number(s.reportCallsUsed||0)+1,updatedAt:new Date()});
   return {...current,leaseId};
  });

  if(state.kind==='cached'){
   const emailStatus=await emailStatusFor(ref,state.paid);
   return output(res,200,{report:state.report,generatedAt:state.generatedAt,cached:true,emailStatus});
  }

  if(state.kind==='waiting'){
   return output(res,202,{generating:true,status:'starting',pollAfterMs:Math.min(Math.max(state.waitUntil-Date.now(),2500),POLL_AFTER_MS),message:'Preparing your career report…'});
  }

  if(state.kind==='poll'){
   const result=await retrieveReportGeneration(state.responseId);
   if(result.status!=='completed'){
    if(['failed','cancelled','incomplete','expired'].includes(result.status)){
     await clearFailedJob(ref,state.responseId);
     if(result.status==='incomplete')throw new ApiError(502,'The report was incomplete. Please retry.');
     if(result.status==='expired')throw new ApiError(502,'The saved report job expired before it could be collected. Please select the button again to generate a new report.');
     throw new ApiError(502,'The report could not be completed. Please retry.');
    }
    await db().runTransaction(async tx=>{
     const snap=await tx.get(ref);if(!snap.exists)return;
     const s=snap.data();if(s.reportJob?.responseId!==state.responseId)return;
     tx.update(ref,{reportJob:{...s.reportJob,generationVersion:REPORT_VERSION,status:result.status||'in_progress',lastCheckedAtMs:Date.now(),learningPreferences:s.reportJob.learningPreferences||state.learningPreferences},reportLease:{id:s.reportLease?.id||'background',until:Date.now()+JOB_LEASE_MS},updatedAt:new Date()});
    });
    return output(res,202,{generating:true,status:result.status||'in_progress',pollAfterMs:POLL_AFTER_MS,message:'Your report is being prepared. This usually completes faster with the focused report settings.'});
   }
   let report;
   try{report=completeReportGeneration(result,state.profile,state.history,state.blueprint,state.untestedSkills,state.targetRole,state.learningPreferences);}
   catch(error){await clearFailedJob(ref,state.responseId);throw error;}
   const saved=await saveCompleted(ref,state.responseId,report,state.learningPreferences,state.paid);
   return output(res,200,saved);
  }

  const started=await startReportGeneration(state.profile,state.history,state.blueprint,state.untestedSkills,state.targetRole,state.learningPreferences);
  const result=started.response;
  if(result.status==='completed'){
   const report=completeReportGeneration(result,state.profile,state.history,state.blueprint,state.untestedSkills,state.targetRole,state.learningPreferences);
   const saved=await saveCompleted(ref,result.id,report,state.learningPreferences,state.paid,state.leaseId);
   return output(res,200,saved);
  }
  if(['failed','cancelled','incomplete'].includes(result.status)){
   throw new ApiError(502,'The report could not be started. Please retry.');
  }
  await db().runTransaction(async tx=>{
   const snap=await tx.get(ref),s=snap.data();
   if(!s||s.reportLease?.id!==state.leaseId)throw new ApiError(409,'Report generation was superseded. Please refresh.');
   tx.update(ref,{reportJob:{responseId:result.id,generationVersion:REPORT_VERSION,status:result.status||'in_progress',startedAtMs:Date.now(),lastCheckedAtMs:Date.now(),learningPreferences:state.learningPreferences},reportLease:{id:state.leaseId,until:Date.now()+JOB_LEASE_MS},updatedAt:new Date()});
  });
  startedJob=true;
  return output(res,202,{generating:true,status:result.status||'in_progress',pollAfterMs:POLL_AFTER_MS,message:'Your report is being prepared. This usually completes faster with the focused report settings.'});
 }catch(error){
  if(ref&&leaseId&&!startedJob)try{await db().runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data().reportLease?.id===leaseId&&!snap.data().reportJob?.responseId)tx.update(ref,{reportLease:null,updatedAt:new Date()});});}catch(e){console.error('Could not clear report lease',e.message);}
  return handleError(res,error,'generate-report');
 }
}

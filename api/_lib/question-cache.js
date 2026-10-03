import crypto from 'node:crypto';
import {ApiError} from './security.js';
import {groupFromProfile} from './interview-logic.js';
import {validateBlueprint} from './interview-logic.js';

// Change when the blueprint, wording rules, grading rubric or bank layout changes.
// This intentionally never reads or stores the candidate's responses.
const BANK_VERSION='v7.2-shared-questions-2026-10';
export const BANK_COLLECTION='professionalSharedQuestionBanks_v1';
const CACHE_TTL_MS=90*24*60*60*1000;
const LEASE_MS=140000;
const WAIT_MS=25000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
const keyText=value=>clean(value).toLowerCase().replace(/[\u2013\u2014]/g,'-').replace(/\s*\/\s*/g,' / ');
const missing=value=>!value||/^(other|not sure( yet)?|open to (any industry|different functions)|explore my options)$/i.test(clean(value));
const SAME_ROLE_GOALS=new Set(['get promoted','move to a similar role elsewhere','find a similar role','build skills in my current role','return to my previous field']);

/** Returns null when the target role is too vague to share questions safely. */
export function sharedBankSpec(profile,env=process.env){
 const stage=groupFromProfile(profile);
 const goal=clean(profile.careerObjective);
 const directRole=clean(profile.targetJobTitle);
 const role=!missing(directRole)?directRole:(SAME_ROLE_GOALS.has(keyText(goal))&&!missing(profile.currentJobTitle)?clean(profile.currentJobTitle):'');
 if(role.length<4||role.length>110||missing(goal)||/https?:\/\/|www\.|@|\bat\s+[a-z].+$/i.test(role))return null;
 const currentFieldFallback=SAME_ROLE_GOALS.has(keyText(goal));
 const func=!missing(profile.targetFunction)?clean(profile.targetFunction):(currentFieldFallback&&!missing(profile.currentFunction)?clean(profile.currentFunction):'');
 const industry=!missing(profile.targetIndustry)?clean(profile.targetIndustry):(currentFieldFallback&&!missing(profile.currentIndustry)?clean(profile.currentIndustry):'');
 const model=clean(env.ASSESSMENT_MODEL||env.OPENAI_MODEL||'gpt-5.6-terra');
 const effort=clean(env.ASSESSMENT_REASONING_EFFORT||'low');
 const dimensions={version:BANK_VERSION,model:keyText(model),effort:keyText(effort),stage,role:keyText(role),goal:keyText(goal),function:keyText(func),industry:keyText(industry)};
 const id=crypto.createHash('sha256').update(JSON.stringify(dimensions)).digest('hex');
 // Use only role and career-stage facts. No name, email, achievements, CV,
 // preferences, declared skill levels, interview answers or personal secrets.
 const sharedProfile={employmentStatus:({employed:'Employed',selfEmployed:'Self-employed / freelancer',betweenJobs:'Between jobs',returning:'Returning after a career break',graduate:'Recent graduate',student:'Student nearing graduation'}[stage]||'Other'),
  careerObjective:goal,targetJobTitle:role,...(func?{targetFunction:func}:{}),...(industry?{targetIndustry:industry}:{}),
  profileGroup:stage};
 return {id,dimensions,sharedProfile};
}
function validCachedBank(data){
 if(!data||data.status!=='ready'||!data.bank||!data.expiresAt)return null;
 const expiry=typeof data.expiresAt.toMillis==='function'?data.expiresAt.toMillis():new Date(data.expiresAt).getTime();
 if(!Number.isFinite(expiry)||expiry<=Date.now())return null;
 try{
  // Bank has already been validated at creation. Recheck essential metadata
  // without reconstructing raw AI schema (which is not stored in the bank).
  const bank=data.bank;
  const skills=validateBlueprint(bank.blueprint);
  if(!Array.isArray(bank.questionBank)||bank.questionBank.length!==skills.length*3||
     !Array.isArray(bank.untestedSkills)||bank.untestedSkills.length<2||
     typeof bank.targetRole!=='string'||bank.targetRole.length<4)return null;
  const ids=new Set(skills.map(s=>s.id));
  for(const skill of skills){if(bank.questionBank.filter(q=>q.competencyId===skill.id).length!==3)return null;}
  if(bank.questionBank.some(q=>!ids.has(q.competencyId)||!Number.isInteger(q.answerKey)||q.answerKey<0||q.answerKey>3||
    !Array.isArray(q.options)||q.options.length!==5||q.options[4]!=='Not sure'))return null;
  return bank;
 }catch{return null;}
}
/**
 * Distributed cache + Firestore generation lease. A simultaneous new user
 * either receives a ready bank or waits briefly for the first generation.
 * On failure, the lease is released so another request can retry.
 */
export async function getOrCreateAssessmentBank(database,profile,generate){
 const spec=sharedBankSpec(profile);
 if(!spec)return {bank:await generate(profile),source:'personal'};
 const ref=database.collection(BANK_COLLECTION).doc(spec.id);
 const deadline=Date.now()+WAIT_MS;
 let generationId=null;
 for(;;){
  const existing=await database.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   const data=snap.exists?snap.data():null;
   // Checking cache content here ensures corrupt/expired entries cannot be reused.
   const cached=validCachedBank(data);
   if(cached)return {type:'hit',bank:cached};
   const now=Date.now();
   if(data?.status==='generating'&&data.leaseUntil>now)return {type:'wait'};
   const leaseId=crypto.randomUUID();
   tx.set(ref,{status:'generating',version:BANK_VERSION,
    leaseId,leaseUntil:now+LEASE_MS,updatedAt:new Date(now),
    // TTL can be configured on retainUntil in Firebase; expired cache is
    // regenerated even if automatic deletion hasn't been enabled.
    retainUntil:new Date(now+CACHE_TTL_MS+7*24*60*60*1000)});
   return {type:'owner',leaseId};
  });
  if(existing.type==='hit')return {bank:existing.bank,source:'cache'};
  if(existing.type==='owner'){generationId=existing.leaseId;break;}
  if(Date.now()>deadline)throw new ApiError(409,'A shared assessment is being prepared. Please press Begin again shortly.');
  await sleep(1800);
 }
 try{
  // The generator sees only generic role/goal context for shared banks.
  const bank=await generate(spec.sharedProfile);
  await database.runTransaction(async tx=>{
   const snap=await tx.get(ref),data=snap.exists?snap.data():null;
   if(data?.leaseId!==generationId)return; // Another lease owner superseded us.
   const now=Date.now();
   tx.set(ref,{status:'ready',version:BANK_VERSION,
    bank,createdAt:new Date(now),updatedAt:new Date(now),expiresAt:new Date(now+CACHE_TTL_MS),
    retainUntil:new Date(now+CACHE_TTL_MS+7*24*60*60*1000)});
  });
  return {bank,source:'generated'};
 }catch(error){
  // Don't leave a broken cache entry locked for 140 seconds.
  try{await database.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(snap.exists&&snap.data().leaseId===generationId)tx.delete(ref);
  });}catch(e){console.error('Question bank lease cleanup failed',{message:e.message});}
  throw error;
 }
}

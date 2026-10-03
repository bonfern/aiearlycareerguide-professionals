import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {MAX_QUESTIONS,groupFromProfile,validatePayload,validateBlueprint,competencyProgress,earlyFinishEligibility,nextCompetency,scoredHistory} from '../api/_lib/interview-logic.js';
import {validateAssessmentBank,choosePreparedQuestion} from '../api/_lib/assessment-bank.js';
import {generateAssessmentBank,optionQuality,balanceAnswerPositions} from '../api/_lib/bank-generator.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const profile={employmentStatus:'Employed',currentJobTitle:'AVP Process Excellence',qualification:'Master\'s degree',skills:'Improvement, leadership',careerObjective:'Promotion',targetJobTitle:'Director Transformation'};
const skills=[
 ...['Transformation strategy','Benefits validation','Change adoption'].map((name,i)=>({id:`s${i+1}`,name,type:'technical',importance:'essential',benchmark:`Able to lead complex ${name.toLowerCase()} with clear impact and accountable choices.`,subskills:['Practical measurement and decision-making','Handling stakeholders and risks']})),
 ...['Executive influence','People leadership'].map((name,i)=>({id:`s${i+4}`,name,type:'behavioural',importance:'essential',benchmark:`Can show ${name.toLowerCase()} during difficult delivery decisions.`,subskills:['Conflicting stakeholder goals','Fair and consistent decisions']}))
];
const extras=[{id:'u1',name:'Supplier risk',expectation:'Must be able to identify and respond to supplier risks before rollout.'},{id:'u2',name:'Budget ownership',expectation:'Must be able to set and control investment budgets responsibly.'}];
const bank=skills.flatMap(skill=>[0,1,2].map((i)=>({competencyId:skill.id,category:skill.name,questionKind:i===0&&skill.type==='technical'?'knowledge':'scenario',difficulty:i===1?'advanced':'applied',
 text:`Your team has a difficult ${skill.name.toLowerCase()} decision. Which action would best protect the intended outcome in situation ${i+1}?`,
 options:(()=>{const best='Compare risks and outcomes before deciding';const other=['Pilot with a smaller group before expanding','Seek senior agreement on the preferred approach','Introduce targeted training before wider rollout'];const arranged=[...other];arranged.splice(i%4,0,best);return [...arranged,'Not sure'];})(),answerKey:i%4,
 rationale:'Checking the evidence and comparing expected outcomes is the most reliable way to choose an action.',subskill:skill.subskills[i%2]})));
const raw={targetRole:'Director Transformation',competencies:skills,untestedSkills:extras,questionBank:bank};
const answer=(skill,i,correct)=>({competencyId:skill.id,questionType:i===0&&skill.type==='technical'?'knowledge':'scenario',correct,subskill:skill.subskills[i%2]});
test('career-stage profile remains conditional and frontend JavaScript parses',()=>{
 for(const status of ['Employed','Self-employed / freelancer','Between jobs','Returning after a career break','Recent graduate','Student nearing graduation']){
  const p={...profile,employmentStatus:status};if(!['Employed','Between jobs'].includes(status))delete p.currentJobTitle;
  assert.equal(validatePayload({profile:p,history:[]}).profile.profileGroup,groupFromProfile(p));
 }
 new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 const part=html.split('// Cohort-specific profile.')[1].split('const $=id=>')[0];
 const fields=status=>JSON.parse(runInNewContext(`// Cohort-specific profile.${part}\ndata.employmentStatus=${JSON.stringify(status)};JSON.stringify(qs.filter(q=>!q.showIf||q.showIf(data)).map(q=>q.id))`));
 assert(fields('Employed').includes('targetJobTitle'));assert(!fields('Recent graduate').includes('currentJobTitle'));
});
test('bank covers only 4–7 essential skills and lists additional untested requirements',()=>{
 assert.equal(MAX_QUESTIONS,24);assert.equal(validateBlueprint(skills).length,5);
 assert.throws(()=>validateBlueprint(skills.slice(0,3)),/4–7/);
 assert.equal(validateAssessmentBank(raw).questionBank.length,15);
 assert.equal(validateAssessmentBank(raw).untestedSkills[0].name,'Supplier risk');
 assert.throws(()=>validateAssessmentBank({...raw,questionBank:bank.slice(1)}),/3 prepared items|Include 3/);
 assert.throws(()=>validateAssessmentBank({...raw,untestedSkills:[{...extras[0],name:skills[0].name},extras[1]]}),/Repeated/);
});
test('all 3 prepared questions are mandatory for every essential skill, even when the first 2 agree',()=>{
 const two=skills.flatMap(skill=>[answer(skill,0,true),answer(skill,1,true)]);
 assert.equal(nextCompetency(skills,two).id,'s1');assert.equal(competencyProgress(skills,two).assessed,0);
 const three=skills.flatMap(skill=>[answer(skill,0,true),answer(skill,1,true),answer(skill,2,true)]);
 assert.equal(nextCompetency(skills,three),null);assert.equal(competencyProgress(skills,three).assessed,5);
 const mixed=[answer(skills[0],0,true),answer(skills[0],1,false)];
 assert.equal(nextCompetency(skills,mixed).id,'s1');assert.equal(competencyProgress(skills,mixed).assessed,0);
 assert.equal(nextCompetency(skills,[...mixed,answer(skills[0],2,false)]).id,'s2');
 assert.equal(earlyFinishEligibility(skills,three).eligible,false);
 const submitSource=readFileSync(new URL('../api/submit-answer.js',import.meta.url),'utf8');
 assert.match(submitSource,/correct:answer===q\.options\[q\.answerKey\]/);
 const reportSource=readFileSync(new URL('../api/generate-report.js',import.meta.url),'utf8');
 assert.match(reportSource,/coverage\.assessed!==coverage\.total/);
 assert.match(reportSource,/skill\.answered<3/);
 const backSource=readFileSync(new URL('../api/back.js',import.meta.url),'utf8');
 assert.match(backSource,/publicQuestion\(last\.questionConfig\)/);
});
test('legacy saved questions are scored privately using their stored answer keys',()=>{
 const q={competencyId:'s1',questionType:'knowledge',subskill:'Baseline validation',options:['Best option','Second option','Third option','Fourth option','Not sure'],answerKey:0,rationale:'The first option is right.'};
 const [good,bad]=scoredHistory([{answer:'Best option',questionConfig:q},{answer:'Not sure',questionConfig:q}]);
 assert.equal(good.correct,true);assert.equal(bad.correct,false);assert.equal(good.competencyId,'s1');
});
test('prepared questions require no subsequent OpenAI calls and never expose answer keys',()=>{
 const validated=validateAssessmentBank(raw);
 const second=choosePreparedQuestion(validated.blueprint,validated.questionBank,[answer(skills[0],0,true)],skills[0]);
 assert.equal(second.difficulty,'advanced');assert.equal(second.questionType,'scenario');
 const store=readFileSync(new URL('../api/_lib/store.js',import.meta.url),'utf8');assert.match(store,/const \{answerKey,rationale,\.\.\.safe\}=question/);
 assert.match(readFileSync(new URL('../api/next-question.js',import.meta.url),'utf8'),/choosePreparedQuestion\(s\.blueprint,s\.questionBank/);
});
test('preparation splits the role map from small question batches and retries one bad batch',async()=>{
 const previous=globalThis.fetch,key=process.env.OPENAI_API_KEY,model=process.env.ASSESSMENT_MODEL;
 process.env.OPENAI_API_KEY='test-key';process.env.ASSESSMENT_MODEL='gpt-5.6-terra';
 let mapCalls=0,batchCalls=0,batchRetries=0;
 globalThis.fetch=async(_url,opts)=>{
  const payload=JSON.parse(opts.body);
  assert.equal(payload.model,'gpt-5.6-terra');assert.equal(payload.reasoning.effort,'low');
  const body=JSON.parse(payload.input[1].content);
  let result;
  if(payload.text.format.name==='career_skill_map'){
   mapCalls++;assert.equal(body.profile.careerObjective,'Promotion');assert(payload.max_output_tokens<=4000);
   result={targetRole:raw.targetRole,competencies:skills,untestedSkills:extras};
  }else{
   assert.equal(payload.text.format.name,'career_question_batch');batchCalls++;
   assert(body.skills.length<=2,'small batches limit the JSON size');
   const ids=new Set(body.skills.map(s=>s.id));
   result={questionBank:bank.filter(q=>ids.has(q.competencyId))};
   if(ids.has('s1')&&batchRetries++===0)result={questionBank:result.questionBank.slice(1)};
  }
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]})};
 };
 try{
  const plan=await generateAssessmentBank(profile);
  assert.equal(plan.questionBank.length,15);assert.equal(mapCalls,1);
  assert.equal(batchCalls,4,'3 parallel batches and one regenerated invalid batch');
 }finally{
  globalThis.fetch=previous;
  if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  if(model===undefined)delete process.env.ASSESSMENT_MODEL;else process.env.ASSESSMENT_MODEL=model;
 }
});

test('an incomplete model response is internally regenerated',async()=>{
 const previous=globalThis.fetch,key=process.env.OPENAI_API_KEY,model=process.env.ASSESSMENT_MODEL;
 process.env.OPENAI_API_KEY='test-key';process.env.ASSESSMENT_MODEL='gpt-5.6-terra';
 let calls=0;
 globalThis.fetch=async(_url,opts)=>{
  const payload=JSON.parse(opts.body);
  if(payload.text.format.name==='career_skill_map'&&calls++===0)return {ok:true,json:async()=>({status:'incomplete',output:[]})};
  const body=JSON.parse(payload.input[1].content);
  const result=payload.text.format.name==='career_skill_map'?{targetRole:raw.targetRole,competencies:skills,untestedSkills:extras}: {questionBank:bank.filter(q=>body.skills.some(s=>s.id===q.competencyId))};
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]})};
 };
 try{const plan=await generateAssessmentBank(profile);assert.equal(plan.questionBank.length,15);assert(calls>=2);}
 finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;if(model===undefined)delete process.env.ASSESSMENT_MODEL;else process.env.ASSESSMENT_MODEL=model;}
});

test('rejects giveaway distractors but accepts plausible competing actions',()=>{
 const plausible={options:['Compare delivery risk before deciding','Pilot first with a smaller group','Seek sponsor agreement before scaling','Train the team before full rollout','Not sure']};
 assert.equal(optionQuality(plausible),null);
 assert.match(optionQuality({...plausible,options:['Compare delivery risk before deciding','Ignore the issue','Seek sponsor agreement before scaling','Train the team before full rollout','Not sure']}),/irresponsible/);
 assert.match(optionQuality({...plausible,options:['Compare delivery risk before deciding','Pilot first with a smaller group','Never ask stakeholders about any problems','Train the team before full rollout','Not sure']}),/verbal clues/);
 assert.match(optionQuality({...plausible,options:['Compare delivery risk before deciding','Pilot first with a smaller group','Seek sponsor agreement before scaling','Consider costs, dependencies, downstream stakeholders, risk impacts, employee preferences and rollout plans in detail before making any decision','Not sure']}),/similar in length/);
});
test('balances correct answer slots per competency without changing which answer is right',()=>{
 const original=bank.map(q=>({...q,options:[...q.options]}));
 const balanced=balanceAnswerPositions(original,skills,()=>0);
 for(const skill of skills){
  const expected=original.filter(q=>q.competencyId===skill.id);
  const received=balanced.filter(q=>q.competencyId===skill.id);
  assert.deepEqual(received.map(q=>q.answerKey),[0,1,2]);
  for(let i=0;i<3;i++){
   assert.equal(received[i].options[received[i].answerKey],expected[i].options[expected[i].answerKey]);
   assert.equal(received[i].options[4],'Not sure');
  }
 }
 assert.deepEqual(original,bank,'input must not be modified');
});

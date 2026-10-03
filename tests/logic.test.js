import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {MAX_QUESTIONS,groupFromProfile,validatePayload,validateBlueprint,competencyProgress,earlyFinishEligibility,nextCompetency} from '../api/_lib/interview-logic.js';
import {validateAssessmentBank,choosePreparedQuestion} from '../api/_lib/assessment-bank.js';
import {generateAssessmentBank} from '../api/_lib/bank-generator.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const profile={employmentStatus:'Employed',currentJobTitle:'AVP Process Excellence',qualification:'Master\'s degree',skills:'Improvement, leadership',careerObjective:'Promotion',targetJobTitle:'Director Transformation'};
const skills=[
 ...['Transformation strategy','Benefits validation','Change adoption'].map((name,i)=>({id:`s${i+1}`,name,type:'technical',importance:'essential',benchmark:`Able to lead complex ${name.toLowerCase()} with clear impact and accountable choices.`,subskills:['Practical measurement and decision-making','Handling stakeholders and risks']})),
 ...['Executive influence','People leadership'].map((name,i)=>({id:`s${i+4}`,name,type:'behavioural',importance:'essential',benchmark:`Can show ${name.toLowerCase()} during difficult delivery decisions.`,subskills:['Conflicting stakeholder goals','Fair and consistent decisions']}))
];
const extras=[{id:'u1',name:'Supplier risk',expectation:'Must be able to identify and respond to supplier risks before rollout.'},{id:'u2',name:'Budget ownership',expectation:'Must be able to set and control investment budgets responsibly.'}];
const bank=skills.flatMap(skill=>[0,1,2].map((i)=>({competencyId:skill.id,category:skill.name,questionKind:i===0&&skill.type==='technical'?'knowledge':'scenario',difficulty:i===1?'advanced':'applied',
 text:`Your team has a difficult ${skill.name.toLowerCase()} decision. Which action would best protect the intended outcome in situation ${i+1}?`,
 options:['Check the evidence before choosing an action','Ask everyone to work longer without changing anything','Skip the review and immediately approve delivery','Wait until the risk has already caused damage','Not sure'],answerKey:i%4,
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
test('full assessment samples all core skills and probes only mixed answers',()=>{
 const two=skills.flatMap(skill=>[answer(skill,0,true),answer(skill,1,true)]);
 assert.equal(nextCompetency(skills,two),null);assert.equal(competencyProgress(skills,two).assessed,5);
 const mixed=[answer(skills[0],0,true),answer(skills[0],1,false)];
 assert.equal(nextCompetency(skills,mixed).id,'s1');assert.equal(competencyProgress(skills,mixed).assessed,0);
 assert.equal(nextCompetency(skills,[...mixed,answer(skills[0],2,false)]).id,'s2');
 assert.equal(earlyFinishEligibility(skills,two).eligible,true);
 assert.equal(earlyFinishEligibility(skills,Array.from({length:7},()=>answer(skills[0],0,true))).eligible,false);
});
test('prepared questions require no subsequent OpenAI calls and never expose answer keys',()=>{
 const validated=validateAssessmentBank(raw);
 const second=choosePreparedQuestion(validated.blueprint,validated.questionBank,[answer(skills[0],0,true)],skills[0]);
 assert.equal(second.difficulty,'advanced');assert.equal(second.questionType,'scenario');
 const store=readFileSync(new URL('../api/_lib/store.js',import.meta.url),'utf8');assert.match(store,/const \{answerKey,rationale,\.\.\.safe\}=question/);
 assert.match(readFileSync(new URL('../api/next-question.js',import.meta.url),'utf8'),/choosePreparedQuestion\(s\.blueprint,s\.questionBank/);
});
test('preparation makes one low-reasoning call to Terra with a full bank',async()=>{
 const previous=globalThis.fetch;const key=process.env.OPENAI_API_KEY;const configured=process.env.ASSESSMENT_MODEL;
 process.env.OPENAI_API_KEY='test-key';delete process.env.ASSESSMENT_MODEL;
 globalThis.fetch=async(_url,opts)=>{const payload=JSON.parse(opts.body);
  assert.equal(payload.model,'gpt-5.6-terra');assert.equal(payload.reasoning.effort,'low');assert(payload.max_output_tokens>=12000);
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(raw)}]}]})};
 };
 try{const plan=await generateAssessmentBank(profile);assert.equal(plan.questionBank.length,15);}
 finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;if(configured===undefined)delete process.env.ASSESSMENT_MODEL;else process.env.ASSESSMENT_MODEL=configured;}
});

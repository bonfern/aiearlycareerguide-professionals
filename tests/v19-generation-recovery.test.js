import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAssessmentBank,optionQuality} from '../api/_lib/bank-generator.js';

const skills=[
 {id:'s1',name:'Transformation Strategy',type:'technical',importance:'essential',benchmark:'Develop and lead a realistic strategy with clear business outcomes.',subskills:['Strategic options','Investment prioritisation']},
 {id:'s2',name:'Benefits Realisation',type:'technical',importance:'essential',benchmark:'Measure benefits against agreed financial and operational baselines.',subskills:['Baseline design','Financial validation']},
 {id:'s3',name:'Executive Influence',type:'behavioural',importance:'essential',benchmark:'Influence senior stakeholders during complex transformation decisions.',subskills:['Conflicting priorities','Executive communication']},
 {id:'s4',name:'Change Adoption',type:'behavioural',importance:'essential',benchmark:'Build and measure adoption across different organisational groups.',subskills:['Resistance management','Adoption measurement']}
];
const untestedSkills=[
 {id:'u1',name:'Vendor Management',expectation:'Select external partners and manage delivery risk and dependencies.'},
 {id:'u2',name:'Portfolio Governance',expectation:'Balance investment and delivery decisions across multiple programmes.'}
];
const questions=skills.flatMap(skill=>[0,1,2].map(i=>({
 competencyId:skill.id,category:skill.name,
 questionKind:skill.type==='technical'&&i===0?'knowledge':'scenario',difficulty:i===1?'advanced':'applied',
 text:`Your team faces a difficult ${skill.name.toLowerCase()} decision and has two weeks to act. Which step should the team take first in scenario ${i+1}?`,
 options:i===0 ? ['Review impacts','Pilot a smaller change across two regions before agreeing an organisation-wide rollout plan','Consult affected managers','Delay the rollout briefly','Not sure'] :
 ['Review likely impacts','Pilot a smaller change','Consult affected managers','Delay the rollout briefly','Not sure'],
 answerKey:0,rationale:'The first action best addresses the scenario constraints and avoids the other options risks.',subskill:skill.subskills[i%2]
})));
const response=value=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]})});

test('v19: a complete bank with a subjective quality warning does not strand a paid purchaser',async()=>{
 const old=globalThis.fetch,key=process.env.OPENAI_API_KEY,model=process.env.ASSESSMENT_MODEL;
 process.env.OPENAI_API_KEY='mock-key';process.env.ASSESSMENT_MODEL='gpt-5.6-terra';
 let mapCalls=0,batches=0;
 globalThis.fetch=async(_url,opts)=>{
  const request=JSON.parse(opts.body);
  if(request.text.format.name==='career_skill_map') {mapCalls++;return response({targetRole:'Director Transformation',competencies:skills,untestedSkills});}
  batches++;
  const {skills:batchSkills}=JSON.parse(request.input[1].content);
  return response({questionBank:questions.filter(q=>batchSkills.some(s=>s.id===q.competencyId))});
 };
 try{
  assert.match(optionQuality(questions[0]),/similar in length/,'reproduces an over-strict V18 style rejection');
  const result=await generateAssessmentBank({employmentStatus:'Employed',careerObjective:'Promotion',targetJobTitle:'Director Transformation'});
  assert.equal(result.questionBank.length,12);
  assert.equal(result.blueprint.length,4);
  assert.equal(mapCalls,1);
  assert.equal(batches,2,'valid structured batches should not be regenerated for subjective lint');
  assert.equal(result.questionBank.filter(q=>q.competencyId==='s1').length,3);
 }finally{
  globalThis.fetch=old;
  if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
  if(model===undefined)delete process.env.ASSESSMENT_MODEL;else process.env.ASSESSMENT_MODEL=model;
 }
});

test('v19: structurally invalid or obviously irresponsible options still trigger a retry',async()=>{
 const old=globalThis.fetch,key=process.env.OPENAI_API_KEY;
 process.env.OPENAI_API_KEY='mock-key';
 let retried=false;
 globalThis.fetch=async(_url,opts)=>{
  const request=JSON.parse(opts.body);
  if(request.text.format.name==='career_skill_map')return response({targetRole:'Director Transformation',competencies:skills,untestedSkills});
  const {skills:batchSkills}=JSON.parse(request.input[1].content);
  const selected=questions.filter(q=>batchSkills.some(s=>s.id===q.competencyId)).map(q=>({...q,options:[...q.options]}));
  if(!retried){selected[0].options[1]='Ignore the issue';selected[0].options[4]='Unsure';retried=true;}
  return response({questionBank:selected});
 };
 try{
  const result=await generateAssessmentBank({employmentStatus:'Employed',careerObjective:'Promotion',targetJobTitle:'Director Transformation'});
  assert.equal(retried,true);
  assert.equal(result.questionBank.length,12);
  assert(result.questionBank.every(q=>q.options[4]==='Not sure'));
 }finally{
  globalThis.fetch=old;
  if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
 }
});

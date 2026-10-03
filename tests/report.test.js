import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_SCHEMA,validateReport,generateReport} from '../api/_lib/report.js';
const blueprint=[
 ...['Role knowledge','Financial planning','Technology','Delivery','Governance'].map((name,i)=>({id:`s${i+1}`,name,type:'technical',importance:'essential',benchmark:`Can apply ${name} in role-relevant decisions.`,subskills:['Practical application','Evaluating trade-offs']})),
 ...['Leadership','Communication','Collaboration'].map((name,i)=>({id:`s${i+6}`,name,type:'behavioural',importance:'important',benchmark:`Can handle ${name} situations with sound judgement.`,subskills:['Complex situations','Resolving differences']}))
];
const history=blueprint.flatMap(s=>(s.type==='technical'?['knowledge','scenario','scenario']:['scenario','scenario','scenario']).map((type,i)=>({competencyId:s.id,questionType:type,correct:i!==1,question:`${s.name} ${type}?`,answer:'Option B',expectedAnswer:'Option A',rationale:'A applies the role requirement.',subskill:s.subskills[i]})));
const report={summary:'Candidate seeking a transformation role.',skillAssessments:blueprint.map(s=>({id:s.id,name:s.name,targetBenchmark:s.benchmark,evidence:'Two correct and one incorrect multiple-choice scenario.',gap:'Application under conflicting constraints needs further practice.',actions:['Work through a realistic decision simulation.','Review an annotated model answer and compare trade-offs.'],practiceTask:'Complete a case with three stakeholder groups.',successIndicator:'Document a decision, rationale and measurable outcome.'})),strengths:[{strength:'Learning foundation',evidence:'Profile lists completed education.'}],achievements:[],developmentAreas:[{area:'Applied decisions',why:'Mixed responses on the skills test.',nextStep:'Practice scenario-based cases.'}],careerDirections:[{direction:'Transformation',rationale:'Stated goal',toValidate:'Workplace application'}],actionPlan:[{period:'Days 1–30',focus:'Skill practice',actions:['Complete first case.']},{period:'Days 31–60',focus:'Applied experience',actions:['Obtain feedback.']},{period:'Days 61–90',focus:'Demonstrate readiness',actions:['Prepare second case.']}],evidenceGaps:['Actual work performance remains unverified.']};
test('report covers EVERY skill with separate actions, gap and deterministic evidence level',()=>{
 assert(REPORT_SCHEMA.required.includes('skillAssessments'));
 const r=validateReport(report,blueprint,history);
 assert.equal(r.skillAssessments.length,8);
 assert(r.skillAssessments.every(s=>s.tested===3&&s.correct===2&&s.evidenceLevel==='Mixed evidence in this test'));
 assert.throws(()=>validateReport({...report,skillAssessments:report.skillAssessments.slice(1)},blueprint,history),/Every mapped skill/);
 assert.throws(()=>validateReport({...report,actionPlan:[...report.actionPlan].reverse()},blueprint,history),/period/);
});
test('report generation sends graded answers privately and uses high reasoning',async()=>{
 const old=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='mock-key';
 globalThis.fetch=async(url,opts)=>{const p=JSON.parse(opts.body);assert.equal(p.reasoning.effort,'high');assert(p.input[1].content.includes('expectedAnswer'));return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(report)}]}]})};};
 try{const r=await generateReport({careerObjective:'Get promoted'},history,blueprint);assert.equal(r.skillAssessments.length,8);}
 finally{globalThis.fetch=old;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('unassessed and partially assessed skills are not called proven gaps',()=>{
 const h=history.filter(x=>x.competencyId==='s1').slice(0,1);
 const r=validateReport(report,blueprint,h);
 assert.equal(r.skillAssessments[0].evidenceLevel,'Limited evidence');
 assert.equal(r.skillAssessments[1].evidenceLevel,'Not assessed');
 assert.equal(r.skillAssessments[1].tested,0);
});

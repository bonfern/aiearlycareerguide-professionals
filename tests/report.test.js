import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_SCHEMA,validateReport,generateReport} from '../api/_lib/report.js';
const skills=[
 {id:'s1',name:'Benefits validation',type:'technical',importance:'essential',benchmark:'Validates forecast versus realised cash benefits against a documented baseline.',subskills:['Baseline validation','Financial sign-off']},
 {id:'s2',name:'Executive influence',type:'behavioural',importance:'essential',benchmark:'Aligns senior sponsors on difficult changes with clear trade-offs.',subskills:['Sponsor buy-in','Constructive challenge']}
];
const untested=[{id:'u1',name:'Regulatory knowledge',expectation:'Knows obligations applicable to the target industry and role.'}];
const report={summary:'This review covers two essential skills for a director-level transformation role. Other required skills were not tested.',
 skillAssessments:skills.map(s=>({id:s.id,name:s.name,targetBenchmark:s.benchmark,gap:'Practise a case where two credible approaches compete under delivery pressure.',actions:['Use a short, timed simulation with a written decision log.','Review the decision with a qualified mentor and revise the plan.'],practiceTask:'Complete a real-world simulation with an explicit decision and risk register.',successIndicator:'Explain the chosen approach, two risks and an agreed measure of success.'})),
 untestedGuidance:[{id:'u1',name:'Regulatory knowledge',nextStep:'Review regulatory duties relevant to the target role.',howToVerify:'Explain a realistic regulatory scenario to a subject matter expert.'}],
 actionPlan:[{period:'Days 1–30',focus:'Practise benefits validation',actions:['Build a worked baseline.','Review it with a finance colleague.']},{period:'Days 31–60',focus:'Apply leadership skills',actions:['Lead a cross-team case discussion.','Collect two pieces of feedback.']},{period:'Days 61–90',focus:'Demonstrate progress',actions:['Present the revised business case.','Retest any weak subskills.']}]};
const history=[
 {competencyId:'s1',correct:true,questionType:'knowledge',subskill:'Baseline validation',expectedAnswer:'Use baseline',rationale:'A baseline is necessary to calculate benefits.'},
 {competencyId:'s1',correct:false,questionType:'scenario',subskill:'Financial sign-off',expectedAnswer:'Validate with finance',rationale:'Finance validation is needed for benefits.'},
 {competencyId:'s1',correct:true,questionType:'scenario',subskill:'Financial sign-off',expectedAnswer:'Validate with finance',rationale:'Finance validation is needed for benefits.'},
 {competencyId:'s2',correct:false,questionType:'scenario',subskill:'Sponsor buy-in',expectedAnswer:'Clarify the trade-offs',rationale:'Clarity helps align sponsors.'},
 {competencyId:'s2',correct:false,questionType:'scenario',subskill:'Constructive challenge',expectedAnswer:'Respectfully challenge',rationale:'Challenge should be constructive.'},
 {competencyId:'s2',correct:false,questionType:'scenario',subskill:'Sponsor buy-in',expectedAnswer:'Clarify the trade-offs',rationale:'Senior alignment benefits from clarity.'}
];
test('report includes assessed competence, gaps, all untested skills and 30/60/90 plan',()=>{
 assert(REPORT_SCHEMA.required.includes('untestedGuidance'));
 const result=validateReport(report,skills,history,untested);
 assert.equal(result.skillAssessments[0].currentCompetency,'Developing — mixed performance');
 assert.equal(result.skillAssessments[1].currentCompetency,'Needs focused development');
 assert.equal(result.additionalSkills[0].assessmentStatus,'Not tested');
 assert.equal(result.actionPlan.length,3);
 assert(!('strengths' in result));
 assert.throws(()=>validateReport({...report,untestedGuidance:[]},skills,history,untested),/additional required skill/);
});
test('unassessed competencies never receive fabricated test levels',()=>{
 const partial=validateReport(report,skills,history.filter(h=>h.competencyId==='s1').slice(0,1),untested);
 assert.equal(partial.skillAssessments[0].currentCompetency,'Preliminary — more evidence needed');
 assert.equal(partial.skillAssessments[1].currentCompetency,'Not assessed');
 assert.match(partial.skillAssessments[1].gap,/no basis/);
});
test('report sends summarised test findings rather than quoted user answers and uses Terra medium',async()=>{
 const previous=globalThis.fetch,key=process.env.OPENAI_API_KEY,model=process.env.REPORT_OPENAI_MODEL;
 process.env.OPENAI_API_KEY='mock';delete process.env.REPORT_OPENAI_MODEL;
 globalThis.fetch=async(_url,opts)=>{const data=JSON.parse(opts.body);
  assert.equal(data.model,'gpt-5.6-terra');assert.equal(data.reasoning.effort,'medium');
  const input=JSON.parse(data.input[1].content);assert.equal(input.assessedSkills[0].correct,2);assert(!data.input[1].content.includes('questionText'));
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(report)}]}]})};
 };
 try{const result=await generateReport({careerObjective:'Promotion'},history,skills,untested,'Director Transformation');assert.equal(result.skillAssessments.length,2);}
 finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;if(model===undefined)delete process.env.REPORT_OPENAI_MODEL;else process.env.REPORT_OPENAI_MODEL=model;}
});

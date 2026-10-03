import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {validateReport} from '../api/_lib/report.js';
import {validateLearningPreferences,recommendationsForSkill,LEARNING_CATALOG} from '../api/_lib/learning-catalog.js';
import {buildReportPdf} from '../api/_lib/pdf-report.js';
import {receiptHtml} from '../api/_lib/commerce.js';

const skills=[
 {id:'s1',name:'Change management',type:'behavioural',benchmark:'Lead cross-functional adoption, deal with resistance and monitor uptake.',subskills:['Handling resistance','Measuring adoption']},
 {id:'s2',name:'Benefits validation',type:'technical',benchmark:'Prove realised cash benefits with a reliable baseline and finance sign-off.',subskills:['Baseline validation','Financial sign-off']}
];
const untested=[{id:'u1',name:'Digital process automation',expectation:'Identify appropriate automation opportunities and govern implementation.'}];
const history=[
 {competencyId:'s1',correct:false,questionType:'scenario',subskill:'Handling resistance'},
 {competencyId:'s1',correct:false,questionType:'scenario',subskill:'Measuring adoption'},
 {competencyId:'s2',correct:true,questionType:'knowledge',subskill:'Baseline validation'},
 {competencyId:'s2',correct:false,questionType:'scenario',subskill:'Financial sign-off'},
 {competencyId:'s1',correct:false,questionType:'scenario',subskill:'Handling resistance'},
 {competencyId:'s2',correct:true,questionType:'scenario',subskill:'Baseline validation'}
];
const ai={summary:'The target role requires change leadership and benefit validation. Focus on the assessed development priorities.',
 skillAssessments:skills.map(s=>({id:s.id,name:s.name,targetBenchmark:s.benchmark,gap:'Practise the specific weaker subskill in a realistic case.',actions:['Complete a structured short practice exercise.','Ask a qualified mentor to review the work.'],practiceTask:'Create a role-specific project case study with measurable indicators.',successIndicator:'Demonstrate the case and explain a measurable improvement.'})),
 untestedGuidance:[{id:'u1',name:'Digital process automation',nextStep:'Study automation fit and lead one bounded process review.',howToVerify:'Present a validated solution to an experienced reviewer.'}],
 actionPlan:[{period:'Days 1–30',focus:'Learn the essential skill gaps',actions:['Complete a free foundation module.','Create a short adoption plan.']},
 {period:'Days 31–60',focus:'Apply under supervision',actions:['Practise a real case with approval.','Request mentor feedback.']},
 {period:'Days 61–90',focus:'Show evidence and retest',actions:['Present project results.','Redo two difficult scenarios.']}]};

test('preference values are controlled and free budget excludes paid learning',()=>{
 const free={weeklyHours:'2–5 hours',budget:'Free resources only',learningStyle:'Self-paced online'};
 assert.deepEqual(validateLearningPreferences(free),free);
 assert.throws(()=>validateLearningPreferences({weeklyHours:'all your money'}),/learning preference/);
 const result=recommendationsForSkill({name:'Change management',benchmark:'Improve adoption and handle resistance'},free);
 assert(result.free.some(r=>r.url.includes('open.edu')));
 assert.deepEqual(result.paid,[]);assert.deepEqual(result.certifications,[]);
});

test('catalogue contains only official HTTPS provider URLs and no hard-coded fees',()=>{
 assert(LEARNING_CATALOG.length>=12);
 for(const r of LEARNING_CATALOG){assert.match(r.url,/^https:\/\//);assert(['free','free-directory','paid','certification'].includes(r.kind));
  assert(!('price' in r));assert(!('fee' in r));}
});

test('detailed report covers every tested and untested skill, sets cautious labels and recommendations',()=>{
 const prefs={weeklyHours:'2–5 hours',budget:'₹5,000–₹20,000',learningStyle:'Practical projects'};
 const r=validateReport(ai,skills,history,untested,prefs);
 assert.equal(r.reportVersion,2);assert.equal(r.skillAssessments.length,2);assert.equal(r.additionalSkills.length,1);
 assert.equal(r.skillAssessments[0].priority,'High development priority');
 assert(!Object.hasOwn(r.skillAssessments[0],'evidenceLevel'));assert.equal(r.skillAssessments[0].tested,3);
 assert(r.skillAssessments[0].learning.free.length>=1);
 assert.equal(r.additionalSkills[0].assessmentStatus,'Not tested');
 assert.deepEqual(r.learningPreferences,prefs);assert.equal(r.actionPlan.length,3);
 assert(r.priorities.length>0);assert.equal(r.progressChecklist.length,2);
});

test('incomplete assessment cannot fabricate a competence finding for untested skill',()=>{
 const r=validateReport(ai,skills,history.filter(h=>h.competencyId==='s1'),untested);
 assert.equal(r.skillAssessments[1].currentCompetency,'Not assessed');
 assert.equal(r.skillAssessments[1].priority,'Not assessed');
 assert(!Object.hasOwn(r.skillAssessments[1],'evidenceLevel'));
});

test('email includes the summary, links, plan and escaped user-derived text',()=>{
 const r=validateReport({...ai,summary:'Assessment for <img src=x onerror=alert(1)>'},skills,history,untested);
 r.targetRole='Director Transformation';const html=receiptHtml(r);
 assert.match(html,/Essential competency overview/);assert.match(html,/Your immediate priorities/);
 assert.doesNotMatch(html,/evidence confidence|limited evidence/i);
 assert.match(html,/Optional certifications/);assert.match(html,/Days 1–30/);
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);
 assert.match(html,/https:\/\/www.open.edu/);
});

test('PDF email attachment is valid, multi-page capable and includes all core sections',()=>{
 const r=validateReport(ai,skills,history,untested);r.targetRole='Director Transformation';
 const b=buildReportPdf(r);assert.match(b.toString('latin1').slice(0,10),/%PDF-1\.4/);
 for(const marker of ['Essential skills','Other required skills','30 / 60 / 90-day roadmap','Progress and reassessment'])assert(b.toString('latin1').includes(marker));
 assert(b.length>2500);assert(!b.toString('latin1').includes('Evidence: Limited'));
 const source=readFileSync(new URL('../api/_lib/commerce.js',import.meta.url),'utf8');assert.match(source,/attachments:\[/);assert.match(source,/application\/pdf/);
});

test('frontend has three learning selections and new report summary sections',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const id of ['learningHours','learningBudget','learningStyle','learningPreferencesPanel'])assert(html.includes(`id="${id}"`));
 assert.match(html,/Essential competency overview/);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];assert(scripts.length>=2);
 for(const [,body] of scripts)new Script(body);
});

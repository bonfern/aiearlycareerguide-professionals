import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {buildReportPdf} from '../api/_lib/pdf-report.js';

const sample={reportVersion:3,targetRole:'AVP Process Excellence',summary:'To move into AVP Process Excellence, strengthen enterprise process strategy and executive stakeholder influence while continuing to build on data-led transformation and change leadership. Build evidence, position those capabilities clearly and create a disciplined route to suitable opportunities.',coverage:{assessed:2,total:2},priorities:[{name:'Executive Stakeholder Influence'}],capabilityFocus:{technical:[{name:'Enterprise Process Strategy',currentCompetency:'Mixed results — keep practising',status:'Build further',firstAction:'Create a cross-functional process roadmap.'}],behavioural:[{name:'Executive Stakeholder Influence',currentCompetency:'Needs more practice',status:'Build this first',firstAction:'Practise a senior stakeholder influence plan.'}]},goalPath:{headline:'Your route to AVP Process Excellence',careerActions:[{title:'Build proof of the target capabilities',action:'Complete the skill activities and turn the outputs into two evidence cases.',outcome:'Two credible AVP-level evidence examples.'},{title:'Have a progression conversation',action:'If an internal route is relevant, speak with your manager or HOD about the role expectations and evidence needed.',outcome:'A clear internal expectation and next stretch assignment.'},{title:'Position your profile',action:'Rewrite your resume and LinkedIn around the target capabilities and measurable outcomes.',outcome:'A profile aligned to the AVP role.'},{title:'Create an opportunity pipeline',action:'Use target companies, job alerts, recruiters and hiring-manager networking to build a relevant pipeline.',outcome:'A repeatable flow of suitable opportunities.'},{title:'Prepare to convert interviews',action:'Build and practise role-specific interview stories for the priority capabilities.',outcome:'Clear evidence-led interview answers.'}]},skillAssessments:[{name:'Enterprise Process Strategy',type:'technical',targetBenchmark:'Set enterprise process priorities and connect them to business outcomes.',currentCompetency:'Mixed results — keep practising',priority:'Development priority',gap:'Build stronger prioritisation and roadmap trade-offs.',subskillsNeedingWork:['Prioritisation'],subskillsNotTested:[],actions:['Create a one-page roadmap.','Ask a senior leader to challenge the priorities.'],practiceTask:'Build a roadmap for one cross-functional process.',successIndicator:'The business logic and measures are clear.',learning:{free:[],paid:[],certifications:[]}},{name:'Executive Stakeholder Influence',type:'behavioural',targetBenchmark:'Influence senior stakeholders across functions.',currentCompetency:'Needs more practice',priority:'High development priority',gap:'Build stronger stakeholder diagnosis and influence choices.',subskillsNeedingWork:['Stakeholder strategy'],subskillsNotTested:[],actions:['Map key stakeholders and their concerns.','Practise a difficult sponsor conversation.'],practiceTask:'Prepare a stakeholder influence plan.',successIndicator:'A mentor can see clear stakeholder-specific choices.',learning:{free:[],paid:[],certifications:[]}}],additionalSkills:[],actionPlan:[{period:'Days 1–30',focus:'Build proof and clarify the route',actions:['Complete the two priority evidence tasks.','Have the relevant internal progression conversation.']},{period:'Days 31–60',focus:'Apply and show capability',actions:['Use one skill in a live assignment.','Build external or internal visibility.']},{period:'Days 61–90',focus:'Convert evidence into opportunities',actions:['Practise role-specific interviews.','Pursue suitable roles or progression opportunities.']}],learningPreferences:{weeklyHours:'2–5 hours',budget:'Free resources only',learningStyle:'Self-paced online'}};

test('report generation is direct, goal-led and uses the flagship reasoning model by default',()=>{
 const src=readFileSync(new URL('../api/_lib/report.js',import.meta.url),'utf8');
 assert.match(src,/gpt-6-astra/);
 assert.match(src,/REPORT_REASONING_EFFORT\|\|'high'/);
 assert.match(src,/first sentence must explicitly name the target role or goal/i);
 assert.match(src,/manager\/HOD/i);
 assert.match(src,/LinkedIn/i);
 assert.match(src,/resume/i);
 assert.match(src,/hiring managers/i);
 assert.match(src,/interview/i);
 assert.match(src,/4–7 practical career actions/i);
});

test('professional page front-loads technical, behavioural and practical route guidance',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const phrase of ['What you need to build for','Technical capabilities','Leadership & behavioural capabilities','How to get there','Your skill-by-skill development plan','Your 30 / 60 / 90-day execution plan'])assert(html.includes(phrase));
 assert(!html.includes("reportText(host,'h3','5. Track your progress')"));
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 for(const [,code] of scripts){if(code.trim())new Script(code);}
});

test('PDF front-loads the career route and retains detailed skill development',()=>{
 const pdf=buildReportPdf(sample),content=pdf.toString('latin1');
 assert.match(content,/CAREER ACTION & SKILL DEVELOPMENT REPORT/);
 assert.match(content,/What you need to build for AVP Process Excellence/);
 assert.match(content,/How to get there/);
 assert.match(content,/TECHNICAL CAPABILITIES/);
 assert.match(content,/LEADERSHIP & BEHAVIOURAL CAPABILITIES/);
 assert.match(content,/30 \/ 60 \/ 90-day execution plan/);
 assert.doesNotMatch(content,/Track your progress/);
 assert(pdf.length>30000);
});

test('email front-loads route-to-goal guidance and remains branded/mobile-safe',()=>{
 const src=readFileSync(new URL('../api/_lib/commerce.js',import.meta.url),'utf8');
 assert.match(src,/Career Action & Skill Development Report/);
 assert.match(src,/What you need to build for/);
 assert.match(src,/How to get there/);
 assert.match(src,/Technical capabilities/);
 assert.match(src,/Leadership & behavioural capabilities/);
 assert.match(src,/career-action-skill-development-report\.pdf/);
 assert.match(src,/email-pad/);
});

test('old completed reports can be upgraded once to report version 3',()=>{
 const src=readFileSync(new URL('../api/generate-report.js',import.meta.url),'utf8');
 assert.match(src,/reportVersion\|\|0\)>=3/);
 assert.match(src,/upgradingOldReport/);
 assert.doesNotMatch(src,/reportEmailSentAt:null/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {buildReportPdf} from '../api/_lib/pdf-report.js';
import {REPORT_BRAND_LOGO} from '../api/_lib/report-brand.js';
import {validateReport} from '../api/_lib/report.js';

const skills=[{id:'c1',name:'Change Leadership',type:'behavioural',benchmark:'Plan organisation-wide change, resolve resistance and measure adoption.',subskills:['Resistance','Adoption','Planning']}];
const history=[{competencyId:'c1',correct:false,subskill:'Resistance'},{competencyId:'c1',correct:true,subskill:'Adoption'},{competencyId:'c1',correct:true,subskill:'Planning'}];
const raw={summary:'Your goal needs strong change leadership. Focus on responding to resistance and planning clear actions.',skillAssessments:[{id:'c1',name:'Change Leadership',targetBenchmark:'Lead change across teams, deal with concerns and check whether people use the new process.',gap:'Practise identifying why a team resists change and taking the most useful first action.',actions:['List the likely reasons for resistance and check them with the affected team.','Make one practical plan and ask a mentor to review it.'],practiceTask:'Write a one-page change plan with owners and targets.',successIndicator:'Show the revised plan and explain how you will measure adoption.'}],untestedGuidance:[],actionPlan:[{period:'Days 1–30',focus:'Learn the basics',actions:['Complete one free module.','Draft a practice plan.']},{period:'Days 31–60',focus:'Apply your learning',actions:['Try the plan.','Ask for feedback.']},{period:'Days 61–90',focus:'Show progress',actions:['Present the outcome.','Retake relevant scenarios.']}]};
const prefs={weeklyHours:'2–5 hours',budget:'Free resources only',learningStyle:'Self-paced online'};
const report=validateReport(raw,skills,history,[],prefs);report.targetRole='Director, Business Transformation';

test('report writing instructions require plain language without losing skill detail',()=>{
 const s=readFileSync(new URL('../api/_lib/report.js',import.meta.url),'utf8');
 assert.match(s,/short sentences/i);assert.match(s,/without losing precision/i);assert.match(s,/Sim(p|pl)er wording must NOT mean shorter or less useful content/i);
 assert.equal(report.skillAssessments.length,1);assert.equal(report.actionPlan.length,3);
 assert.equal(report.skillAssessments[0].targetBenchmark,raw.skillAssessments[0].targetBenchmark);
});

test('branded PDF embeds real logo, professional header and linked learning resources',()=>{
 assert(REPORT_BRAND_LOGO.jpegBase64.length>10000);
 const pdf=buildReportPdf(report),content=pdf.toString('latin1');
 assert.match(content.slice(0,15),/%PDF-1\.4/);assert.match(content,/\/Subtype \/Image/);
 assert.match(content,/\/Logo Do/);assert.match(content,/Career Guide for/);
 assert.match(content,/Your essential skills at a glance/);assert.match(content,/Your skill-by-skill development plan/);
 assert.match(content,/Your 30 \/ 60 \/ 90-day action plan/);
 assert.match(content,/\/S \/URI \/URI \(https:\/\//);
 assert.doesNotMatch(content,/evidence confidence/i);
 assert(pdf.length>35000);
});

test('email is branded and user content is escaped without omitting the roadmap',()=>{
 const source=readFileSync(new URL('../api/_lib/commerce.js',import.meta.url),'utf8');
 const start=source.indexOf('export function receiptHtml(report){');
 const end=source.indexOf('// Firestore lease + Resend idempotency',start);
 assert(start>0&&end>start);
 const snippet=source.slice(start,end).replace('export function receiptHtml','function receiptHtml');
 const receiptHtml=new Script(snippet+'\nreceiptHtml').runInContext(createContext({}));
 const safe={...report,summary:'A useful summary <img src=x onerror=alert(1)>'};const html=receiptHtml(safe);
 assert.match(html,/brand-logo\.webp/);assert.match(html,/Career Guide for/);assert.match(html,/Your skill-by-skill development plan/);assert.match(html,/Days 1–30/);
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x onerror/);
 assert.match(source,/attachments:\[/);assert.match(source,/buildReportPdf\(reserved\.report\)/);
});

test('report page uses the simpler section names and preserves skills and roadmap',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const phrase of ['Your essential skills at a glance','Your skill-by-skill development plan','Your 30 / 60 / 90-day action plan','Your next steps'])assert(html.includes(phrase));
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 for(const [,code] of scripts){if(code.trim())new Script(code);}
});

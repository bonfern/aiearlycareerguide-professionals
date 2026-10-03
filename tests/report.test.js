import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORT_SCHEMA,validateReport,generateReport} from '../api/_lib/report.js';
const report={summary:'Operations leader exploring programme management.',strengths:[{strength:'Stakeholder communication',evidence:'Described coordinating multiple teams.'}],achievements:[],developmentAreas:[{area:'Programme delivery evidence',why:'No programme example provided.',nextStep:'Document one cross-team delivery case.'}],careerDirections:[{direction:'Programme manager',rationale:'Has led cross-team operations.',toValidate:'Evidence of programme budgets and delivery.'}],actionPlan:[{period:'Days 1–30',focus:'Document experience',actions:['Write two STAR examples.']},{period:'Days 31–60',focus:'Validate skills',actions:['Review five role descriptions.']},{period:'Days 61–90',focus:'Test the direction',actions:['Speak to three programme managers.']}],evidenceGaps:['What budgets have you owned?']};
test('validates an evidence-based report and exact chronological plan',()=>{
 assert.equal(validateReport(report).actionPlan.length,3);
 assert.deepEqual(REPORT_SCHEMA.required,['summary','strengths','achievements','developmentAreas','careerDirections','actionPlan','evidenceGaps']);
 assert.throws(()=>validateReport({...report,actionPlan:[...report.actionPlan].reverse()}),/Invalid action plan period/);
 assert.throws(()=>validateReport({...report,strengths:[{strength:'Excellent leader',evidence:''}]}),/Incomplete/);
});
test('generates report with structured OpenAI output and server-side key',async()=>{
 const old=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='mock-key';let calls=0;
 globalThis.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(opts.headers.Authorization,'Bearer mock-key');assert.equal(JSON.parse(opts.body).text.format.type,'json_schema');assert.equal(JSON.parse(opts.body).reasoning.effort,'high');return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(report)}]}]})};};
 try{const generated=await generateReport({currentJobTitle:'Manager'},[{question:'What did you achieve?',answer:'I coordinated teams.',category:'Achievement'}]);assert.equal(generated.strengths[0].strength,'Stakeholder communication');assert.equal(calls,1);}
 finally{globalThis.fetch=old;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

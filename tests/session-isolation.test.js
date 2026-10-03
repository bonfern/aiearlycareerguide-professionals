import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import {competencyProgress} from '../api/_lib/interview-logic.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
 .map(m=>m[1]).find(s=>s.includes('async function beginPaidLive('));
assert(script,'The application script must exist.');
new Script(script);
function extract(name){
 const pos=script.indexOf(name);assert(pos>=0,`Missing ${name}`);
 const open=script.indexOf('{',pos);let depth=0,quote='',lineComment=false,blockComment=false;
 for(let i=open;i<script.length;i++){
  const c=script[i],n=script[i+1];
  if(lineComment){if(c==='\n')lineComment=false;continue;}
  if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
  if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
  if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
  if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
  if(c==='"'||c==='\''||c==='`'){quote=c;continue;}
  if(c==='{')depth++;if(c==='}'&&!--depth)return script.slice(pos,i+1);
 }
 throw Error(`Unclosed function ${name}`);
}
const complete=extract('function completePayment(');
const begin=extract('async function beginPaidLive(');
const full=extract('function completedAllSkills(');
const fromServer=extract('function updateFromServer(');
const continuePrior=extract('async function continueExisting(');

function frontendHarness({oldSession,order}){
 const calls=[];
 const context={console,Promise};
 const prelude=`
 let liveSession=${JSON.stringify(oldSession)};
 let paidPurchase=${JSON.stringify(order)};
 let savedServerProfile={targetJobTitle:'Director Transformation'};
 let currentLiveQuestion={id:'old-question'};
 let liveProgressState={assessed:4,total:4,answered:12};
 let currentCareerReport={old:true},currentReportDate='old';
 let data={employmentStatus:'Employed',targetJobTitle:'Director Transformation'};
 let interviewAnswers={old:'old answer'};
 let step=12,interviewStep=9,fromReview=true,privatePreview=false,assessmentMode='live';
 let liveHistory=[{answer:'old'}];
 let liveBusy=false;
 let recoverBusy=false;
 let emailGateState={unfinished:true,email:paidPurchase?.email,sessionId:null};
 let calls=globalThis.calls;
 let $=()=>({textContent:'',classList:{add(){},remove(){}}});
 let archiveCurrentSession=()=>calls.push(['archive',liveSession?.sessionId]);
 let storeSession=s=>{liveSession=s;calls.push(['store',s?.sessionId||null]);};
 let rememberPurchase=o=>{paidPurchase=o;calls.push(['purchase',o.orderId]);};
 let clearPendingOrder=()=>{};
 let setCheckoutBusy=()=>{};
 let show=name=>calls.push(['show',name]);
 let render=()=>{};
 let showConfirmationNotice=()=>{};
 let setLiveBusy=()=>{};
 let showQuestionWait=()=>{};
 let profileForAPI=()=>({employmentStatus:'Employed',targetJobTitle:'Director Transformation',qualification:'Degree',careerObjective:'Promotion',skills:'Leadership'});
 let apiCall=async(route,payload,isStart)=>{calls.push(['api',route,payload?.paidOrder?.orderId]);if(route!=='start'||!isStart)throw Error('Unexpected API route');return {sessionId:'new-session',sessionToken:'new-token',paid:true,status:'active',reused:false,orderId:payload.paidOrder.orderId,email:paidPurchase.email};};
 let fetchNext=async()=>calls.push(['fetchNext',liveSession?.sessionId]);
 let updateReportAvailability=()=>{};
 let enteredEmail=()=>paidPurchase?.email;
 let sameBrowserPurchase=()=>true;
 let savedSessionForEmail=()=>null;
 let purchaseForEmail=()=>paidPurchase;

 `;
 context.calls=calls;
 const code=prelude+complete+'\n'+begin+'\n'+full+'\n'+fromServer+'\n'+continuePrior+'\n' +
  `globalThis.fixture={completePayment,beginPaidLive,continueExisting,completedAllSkills,updateFromServer,fetchNext,getSession:()=>liveSession,getProgress:()=>liveProgressState,getData:()=>data};`;
 runInNewContext(code,context);
 return {api:context.fixture,calls};
}

test('new email with identical profile starts a NEW session and cannot inherit completed results',async()=>{
 const old={sessionId:'previous-session',orderId:'free_previous',email:'old@example.com',paid:true};
 const newer={orderId:'free_new',checkoutNonce:'nonce',email:'new@example.com'};
 const {api,calls}=frontendHarness({oldSession:old,order:newer});
 api.completePayment(newer,'sent');
 assert.equal(api.getSession(),null,'new customer must not retain the previous paid session');
 assert.equal(api.getProgress().total,0,'previous skill completion cannot be inherited');
 assert.deepEqual(Object.keys(api.getData()),[],'prior profile is reset for the new customer');
 await api.beginPaidLive();
 assert.deepEqual(calls.filter(c=>c[0]==='api').map(c=>c[2]),['free_new']);
 assert.equal(api.getSession().sessionId,'new-session');
 assert.equal(calls.filter(c=>c[0]==='fetchNext').length,1);
});

test('even without the checkout reset, a different purchase cannot reuse an old active session',async()=>{
 const old={sessionId:'old-session',orderId:'free_old',email:'another@example.com',paid:true};
 const current={orderId:'free_new',checkoutNonce:'nonce',email:'new@example.com'};
 const {api,calls}=frontendHarness({oldSession:old,order:current});
 await api.beginPaidLive();
 assert.deepEqual(calls.filter(c=>c[0]==='api').map(c=>c[2]),['free_new']);
 assert.equal(api.getSession().sessionId,'new-session');
});

test('the same paid order can resume its own unfinished assessment without creating another',async()=>{
 const order={orderId:'free_current',checkoutNonce:'nonce',email:'current@example.com'};
 const session={sessionId:'same-session',orderId:order.orderId,email:order.email,paid:true};
 const {api,calls}=frontendHarness({oldSession:session,order});
 await api.beginPaidLive();
 assert.equal(calls.filter(c=>c[0]==='api').length,0);
 assert.equal(calls.filter(c=>c[0]==='fetchNext')[0][1],'same-session');
});

test("returning to a just-paid order without any session clears the earlier customer's completed test",async()=>{
 const previous={sessionId:'previous',orderId:'free_old',email:'old@example.com',paid:true};
 const newPurchase={orderId:'free_new',checkoutNonce:'nonce',email:'new@example.com'};
 const {api,calls}=frontendHarness({oldSession:previous,order:newPurchase});
 await api.continueExisting();
 assert.equal(api.getSession(),null);
 assert.equal(api.getProgress().total,0);
 assert(calls.some(c=>c[0]==='show'&&c[1]==='profile'));
});

test('frontend never treats zero tested skills or 2-question skills as a completed assessment',()=>{
 const {api}=frontendHarness({oldSession:null,order:null});
 assert.equal(api.completedAllSkills({assessed:0,total:0,answered:0}),false);
 assert.equal(api.completedAllSkills({assessed:4,total:4,answered:8}),false);
 assert.equal(api.completedAllSkills({assessed:4,total:4,answered:12}),true);
 assert.equal(api.completedAllSkills({assessed:5,total:5,answered:15}),true);
});

test('the server and report both require complete three-question coverage for newly finished assessments',()=>{
 const next=readFileSync(new URL('../api/next-question.js',import.meta.url),'utf8');
 assert.match(next,/gradedHistory\.filter\(h=>typeof h\.correct==='boolean'\)\.length>=completion\.total\*3/);
 assert.match(next,/hasReport:Boolean\(s\.report\)/);
 const store=readFileSync(new URL('../api/_lib/store.js',import.meta.url),'utf8');
 assert.match(store,/hasReport:Boolean\(session\.report\)/);
 const report=readFileSync(new URL('../api/generate-report.js',import.meta.url),'utf8');
 assert.match(report,/coverage\.assessed!==coverage\.total/);
 const skills=[...Array(4)].map((_,i)=>({id:`s${i+1}`,name:`Skill ${i+1}`,type:i===0?'technical':'behavioural'}));
 const answered=skills.flatMap(s=>[0,1].map(i=>({competencyId:s.id,questionType:s.type==='technical'&&i===0?'knowledge':'scenario',correct:true})));
 assert.equal(competencyProgress(skills,answered).assessed,0);
});


test('a modern assessment with an old saved report but zero answers cannot jump to report preferences',()=>{
 const order={orderId:'free_new',email:'new@example.com',checkoutNonce:'proof'};
 const {api,calls}=frontendHarness({oldSession:{sessionId:'session-new',orderId:order.orderId,email:order.email,paid:true},order});
 const consumed=api.updateFromServer({status:'complete',paid:true,orderId:order.orderId,email:order.email,
  assessmentContractVersion:17,hasReport:true,history:[],question:null,
  progress:{assessed:0,total:4,answered:0}});
 assert.equal(consumed,false,'an invalid complete flag must not open learning preferences');
 assert(!calls.some(c=>c[0]==='show'&&c[1]==='complete'));
 assert.throws(()=>api.updateFromServer({status:'complete',paid:true,orderId:'free_someone_else',email:'old@example.com',
  assessmentContractVersion:17,hasReport:true,history:[],progress:{assessed:4,total:4,answered:12}}),/different purchase/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {MAX_QUESTIONS,groupFromProfile,validatePayload,validateBlueprint,competencyProgress,earlyFinishEligibility,nextCompetency,nextQuestionType,cleanModelResult} from '../api/_lib/interview-logic.js';
import {ApiError,validateAnswer} from '../api/_lib/security.js';
import {generateQuestion} from '../api/_lib/ai.js';
const example={employmentStatus:'Employed',currentJobTitle:'Process Excellence AVP',qualification:'Master’s degree',skills:'Change management',careerObjective:'Get promoted',targetJobTitle:'Director Transformation'};
const blueprint=[
 ...['Transformation strategy','Benefits measurement','Change adoption','Operating model design','Digital delivery'].map((name,i)=>({id:`s${i+1}`,name,type:'technical',importance:'essential',benchmark:`Can independently lead ${name.toLowerCase()} at director level with reliable decisions.`,subskills:['Application in complex programmes','Risk and measurement']})),
 ...['Executive influence','Leading cross-functional teams','Decision making under uncertainty','Conflict resolution'].map((name,i)=>({id:`s${i+6}`,name,type:'behavioural',importance:'important',benchmark:`Can demonstrate credible ${name.toLowerCase()} in a complex situation.`,subskills:['Competing stakeholder priorities','Coaching and accountability']}))
];
const questionFor=(skill,kind,history=[])=>({competencies:history.length?[]:blueprint,question:{competencyId:skill.id,category:skill.name,questionKind:kind,difficulty:history.length===0?'applied':history.at(-1).correct?'advanced':'applied',
 text:`A director faces competing priorities during a transformation programme. Which action best addresses ${skill.name.toLowerCase()} while balancing delivery risks?`,
 options:['Clarify stakeholder outcomes and adoption measures','Begin execution before checking business need','Focus only on technology delivery','Defer all decisions indefinitely','Not sure'],answerKey:0,rationale:'Clarifying measurable outcomes and stakeholder requirements reduces implementation risk.',subskill:skill.subskills[0]}});
const answer=(skill,kind,correct)=>({competencyId:skill.id,questionType:kind,correct,difficulty:'applied',question:'Question',answer:'Answer',subskill:skill.subskills[0]});
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('career-stage profile routing and editable target role',()=>{
 for(const status of ['Employed','Self-employed / freelancer','Between jobs','Returning after a career break','Recent graduate','Student nearing graduation']){
  const p={...example,employmentStatus:status};
  if(!['Employed','Between jobs'].includes(status))delete p.currentJobTitle;
  assert.equal(validatePayload({profile:p,history:[]}).profile.profileGroup,groupFromProfile(p));
 }
 const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];new Script(js);
 const part=html.split('// Cohort-specific profile.')[1].split('const $=id=>')[0];
 const run=status=>JSON.parse(runInNewContext(`// Cohort-specific profile.${part}\ndata.employmentStatus=${JSON.stringify(status)};JSON.stringify(qs.filter(q=>!q.showIf||q.showIf(data)).map(q=>q.id))`));
 assert(run('Employed').includes('targetJobTitle'));
 assert(!run('Student nearing graduation').includes('currentJobTitle'));
 assert(run('Returning after a career break').includes('careerBreakDuration'));
 assert(run('Self-employed / freelancer').includes('businessStage'));
 assert.match(html,/displayChoice/);assert(!html.includes('up to 9'));
 assert(!html.includes('sk-proj-'));
});
test('role-specific map covers both skill families and rejects weak plans',()=>{
 assert.equal(MAX_QUESTIONS,60);assert.equal(validateBlueprint(blueprint).length,9);
 assert.throws(()=>validateBlueprint(blueprint.slice(0,3)),/8–16/);
 assert.throws(()=>validateBlueprint([...blueprint.slice(0,8),blueprint[0]]),/repeated/);
});
test('knowledge and scenario evidence, mixed answers trigger a third probe, no fixed-length interview',()=>{
 assert.equal(nextQuestionType(blueprint[0],[]),'knowledge');
 const h1=[answer(blueprint[0],'knowledge',true)];assert.equal(nextQuestionType(blueprint[0],h1),'scenario');
 const h2=[...h1,answer(blueprint[0],'scenario',false)];
 assert.equal(nextCompetency(blueprint,h2).id,'s1');
 assert.equal(competencyProgress(blueprint,h2).skills[0].resolved,false);
 const h3=[...h2,answer(blueprint[0],'scenario',true)];
 assert.equal(nextCompetency(blueprint,h3).id,'s2');
 const all=blueprint.flatMap(s=>s.type==='technical'?[answer(s,'knowledge',true),answer(s,'scenario',true)]:[answer(s,'scenario',true),answer(s,'scenario',true)]);
 assert.equal(nextCompetency(blueprint,all),null);assert.equal(competencyProgress(blueprint,all).assessed,9);
});
test('strict AI question validation and server-only grading data',()=>{
 const first=cleanModelResult(questionFor(blueprint[0],'knowledge'),null,null,[]);
 assert.equal(first.blueprint.length,9);assert.equal(first.question.answerKey,0);
 assert.equal(first.question.answerKey,0);
 assert.equal(first.question.rationale.startsWith('Clarifying'),true);
 // The transport layer omits both private fields in its publicQuestion function.
 const storeCode=readFileSync(new URL('../api/_lib/store.js',import.meta.url),'utf8');
 assert.match(storeCode,/const \{answerKey,rationale,\.\.\.safe\}=question/);
 assert.match(storeCode,/canFinish:eligibility\.eligible/);
 assert.throws(()=>cleanModelResult({...questionFor(blueprint[0],'knowledge'),question:{...questionFor(blueprint[0],'knowledge').question,options:['A','B','C','D','E']}},null,null,[]),/Invalid options|Not sure/);
 assert.equal(validateAnswer(first.question,first.question.options[1]),first.question.options[1]);
 assert.throws(()=>validateAnswer(first.question,'My own invented answer'),ApiError);
});
test('short, clear question instructions and length safeguards',()=>{
 const {question:base}=questionFor(blueprint[0],'knowledge');
 const normal=cleanModelResult({competencies:blueprint,question:base},null,null,[]);
 assert.match(normal.question.text,/Which action/);
 const tooLongQuestion='You lead a team and need to make an important choice today. '.repeat(9)+'What should you do?';
 assert.throws(()=>cleanModelResult({competencies:blueprint,question:{...base,text:tooLongQuestion}},null,null,[]),/too long/);
 const longOption='Work with all the stakeholders and carefully consider all the options before you decide to do anything significant about the issue';
 assert.throws(()=>cleanModelResult({competencies:blueprint,question:{...base,options:[longOption,...base.options.slice(1)]}},null,null,[]),/too long/);
});
test('high reasoning Responses call uses strict JSON without leaking the key',async()=>{
 const old=globalThis.fetch,key=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL;
 process.env.OPENAI_API_KEY='mock-only-key';process.env.OPENAI_MODEL='gpt-6-astra';
 globalThis.fetch=async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  const p=JSON.parse(opts.body);assert.equal(p.model,'gpt-6-astra');assert.equal(p.reasoning.effort,'high');assert.equal(p.store,false);assert.equal(p.text.format.strict,true);
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(questionFor(blueprint[0],'knowledge'))}]}]})};
 };
 try{const r=await generateQuestion(example,[]);assert.equal(r.blueprint.length,9);assert.equal(r.question.questionType,'knowledge');}
 finally{globalThis.fetch=old;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;if(model===undefined)delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=model;}
});
test('Firebase accepts direct JSON credentials',async()=>{
 const {firebaseConfigured,loadFirebaseServiceAccount}=await import('../api/_lib/firebase-config.js');
 const a={project_id:'prof-demo',client_email:'test@example.com',private_key:'-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----\n'};
 assert(firebaseConfigured({FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(a)}));
 assert.deepEqual(loadFirebaseServiceAccount({FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(a)}),a);
});

test('early-finish eligibility requires breadth, not just repeated answers from one skill',()=>{
 const one=Array.from({length:8},()=>answer(blueprint[0],'scenario',true));
 assert.equal(earlyFinishEligibility(blueprint,one).eligible,false);
 const wide=[...Array.from({length:3},()=>answer(blueprint[0],'scenario',true)),...Array.from({length:3},()=>answer(blueprint[1],'scenario',true)),...Array.from({length:2},()=>answer(blueprint[2],'scenario',false))];
 const state=earlyFinishEligibility(blueprint,wide);
 assert.equal(state.eligible,true);assert.equal(state.sampled,3);assert.equal(state.answered,8);
 assert.equal(nextCompetency(blueprint,wide).id,'s1'); // synthetic scenarios lack the required technical knowledge check
});
test('early-finish endpoint marks session incomplete and clears outstanding generation',()=>{
 const code=readFileSync(new URL('../api/finish-assessment.js',import.meta.url),'utf8');
 assert.match(code,/earlyFinishEligibility/);
 assert.match(code,/completionMode:'early'/);
 assert.match(code,/currentQuestion:null,generationLease:null/);
 assert.match(html,/id="finishEarlyBtn"/);
 assert.match(html,/finishEarly/);
});

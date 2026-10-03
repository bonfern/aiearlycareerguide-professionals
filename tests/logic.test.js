import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {CORE_TOPICS_BY_GROUP,MIN_QUESTIONS,MAX_QUESTIONS,groupFromProfile,validatePayload,chooseTopic,cleanModelResult} from '../api/_lib/interview-logic.js';
import {ApiError,validateAnswer} from '../api/_lib/security.js';
import {generateQuestion} from '../api/_lib/ai.js';
const example={employmentStatus:'Employed',currentJobTitle:'Operations manager',qualification:'Bachelor’s degree',skills:'Planning',careerObjective:'Get promoted'};
const entry=i=>({question:`Meaningful question ${i+1}?`,answer:'Useful option',category:'Capability'});
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('7 essential topics, maximum 9 questions, with different routes',()=>{
 assert.equal(MIN_QUESTIONS,7);assert.equal(MAX_QUESTIONS,9);
 assert.equal(Object.keys(CORE_TOPICS_BY_GROUP).length,7);
 for(const topics of Object.values(CORE_TOPICS_BY_GROUP))assert.equal(topics.length,7);
 for(const status of ['Employed','Self-employed / freelancer','Between jobs','Returning after a career break','Recent graduate','Student nearing graduation','Other']){
  const p={...example,employmentStatus:status};
  assert.equal(chooseTopic(p,[]),CORE_TOPICS_BY_GROUP[groupFromProfile(p)][0]);
  assert.equal(chooseTopic(p,Array.from({length:7},(_,i)=>entry(i))),'Only essential clarification or finish');
 }
});
test('graduates and returners do not need a current job title',()=>{
 for(const status of ['Recent graduate','Student nearing graduation','Returning after a career break','Self-employed / freelancer']){
  const p={employmentStatus:status,qualification:'Bachelor’s degree',skills:'Communication',careerObjective:'Explore my options'};
  assert.equal(validatePayload({profile:p,history:[]}).profile.profileGroup,groupFromProfile(p));
 }
 assert.throws(()=>validatePayload({profile:{...example,currentJobTitle:''},history:[]}),/job title/);
 assert.throws(()=>validatePayload({profile:{...example,profileGroup:'student'},history:[]}),/Invalid profile group/);
 assert.throws(()=>validatePayload({profile:example,history:Array.from({length:10},(_,i)=>entry(i))}),/Invalid interview history/);
});
test('AI cannot finish early, exceed the limit, or force open text during core questions',()=>{
 const q={done:false,category:'wrong',text:'Which experience best represents your strengths?',type:'single',options:['An internship','A project','Other'],hint:''};
 assert.equal(cleanModelResult(q,example,[]).question.type,'single');
 assert.equal(cleanModelResult(q,example,[]).question.category,CORE_TOPICS_BY_GROUP.employed[0]);
 assert.throws(()=>cleanModelResult({done:true},example,[]),/before essential/);
 assert.throws(()=>cleanModelResult({...q,type:'text',options:[]},example,[]),/Free text/);
 const seven=Array.from({length:7},(_,i)=>entry(i));
 assert.deepEqual(cleanModelResult({done:true},example,seven),{done:true});
 assert.equal(cleanModelResult({...q,type:'text',options:[]},example,seven).question.type,'text');
 assert.throws(()=>cleanModelResult(q,example,Array.from({length:9},(_,i)=>entry(i))),/Maximum/);
});
test('server validates Other and multi-choice selections',()=>{
 const q={type:'single',options:['Operations','Other']};
 assert.equal(validateAnswer(q,'Other: Sustainability'),'Other: Sustainability');
 assert.throws(()=>validateAnswer(q,'Other: '),ApiError);
 const multi={type:'multi',options:['A','B','C','Other']};
 assert.equal(validateAnswer(multi,'A; B; Other: D'),'A; B; Other: D');
 assert.throws(()=>validateAnswer(multi,'A; B; C; D'),ApiError);
});
test('frontend displays different questions for each status and preserves Other fields',()=>{
 new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 const part=html.split('// Cohort-specific profile.')[1].split('const $=id=>')[0];
 const fn=(status)=>runInNewContext(`// Cohort-specific profile.${part}\ndata.employmentStatus=${JSON.stringify(status)};JSON.stringify(qs.filter(q=>!q.showIf||q.showIf(data)).map(q=>({id:q.id,q:typeof q.q==='function'?q.q(data):q.q,options:optionsFor(q)})))`);
 const employed=JSON.parse(fn('Employed'));
 const student=JSON.parse(fn('Student nearing graduation'));
 const returner=JSON.parse(fn('Returning after a career break'));
 const self=JSON.parse(fn('Self-employed / freelancer'));
 assert.equal(employed[0].id,'employmentStatus');
 assert(employed.some(q=>q.id==='currentJobTitle'));
 assert(!student.some(q=>q.id==='currentJobTitle'));
 assert(student.some(q=>q.id==='graduationWhen'));
 assert(returner.some(q=>q.id==='careerBreakDuration'));
 assert(self.some(q=>q.id==='businessStage'));
 assert.notDeepEqual(student.find(q=>q.id==='careerObjective').options,employed.find(q=>q.id==='careerObjective').options);
 assert.match(html,/Please specify/);
 assert(!html.includes('sk-proj-'));
});
test('uses high-reasoning Responses API and strict JSON schema, without leaking key',async()=>{
 const old=globalThis.fetch,key=process.env.OPENAI_API_KEY,model=process.env.OPENAI_MODEL;
 process.env.OPENAI_API_KEY='mock-only-key';process.env.OPENAI_MODEL='gpt-6-astra';let calls=0;
 globalThis.fetch=async(url,opts)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');
  const payload=JSON.parse(opts.body);assert.equal(payload.model,'gpt-6-astra');assert.equal(payload.reasoning.effort,'high');
  assert.equal(payload.text.format.strict,true);assert.equal(payload.store,false);
  assert.equal(opts.headers.Authorization,'Bearer mock-only-key');
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({done:false,category:'Test',text:'Which example best shows your experience?',type:'single',options:['A project','A customer outcome','Other'],hint:''})}]}]})};
 };
 try{const result=await generateQuestion(example,[]);assert.equal(result.question.category,CORE_TOPICS_BY_GROUP.employed[0]);assert.equal(calls,1);}
 finally{globalThis.fetch=old;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;if(model===undefined)delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=model;}
});
test('Firebase service account supports direct JSON',async()=>{
 const {firebaseConfigured,loadFirebaseServiceAccount}=await import('../api/_lib/firebase-config.js');
 const a={project_id:'prof-demo',client_email:'test@example.com',private_key:'-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----\n'};
 assert.equal(firebaseConfigured({FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(a)}),true);
 assert.deepEqual(loadFirebaseServiceAccount({FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(a)}),a);
});

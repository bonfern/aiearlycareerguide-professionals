import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_TOPICS,MAX_QUESTIONS,MIN_QUESTIONS,validatePayload,chooseTopic,cleanModelResult} from '../api/_lib/interview-logic.js';
import {ApiError,validateAnswer,safeEqual} from '../api/_lib/security.js';
import {generateQuestion} from '../api/_lib/ai.js';
const profile={currentJobTitle:'Senior Operations Manager',careerObjective:'Move into leadership',skills:'People leadership'};
const entry=i=>({question:`Question ${i+1} about experience?`,category:CORE_TOPICS[i]||'Follow-up',answer:'Example answer'});
test('professional profile validation prevents malformed input',()=>{
 assert.equal(validatePayload({profile,history:[]}).profile.currentJobTitle,'Senior Operations Manager');
 assert.throws(()=>validatePayload({profile:{},history:[]}),/Complete the professional profile/);
 assert.throws(()=>validatePayload({profile,history:Array.from({length:16},(_,i)=>entry(i))}),/Invalid interview history/);
});
test('ten core topics before optional adaptive follow-ups',()=>{
 assert.equal(MIN_QUESTIONS,10);assert.equal(MAX_QUESTIONS,15);
 for(let n=0;n<10;n++)assert.equal(chooseTopic(Array.from({length:n},(_,i)=>entry(i))),CORE_TOPICS[n]);
 assert.equal(chooseTopic(Array.from({length:10},(_,i)=>entry(i))),'Targeted follow-up or finish');
});
test('model output is validated and cannot finish early',()=>{
 const q={done:false,category:'wrong',text:'Which experience would you like to discuss?',type:'single',options:['Led a team','Improved a process','Other'],hint:''};
 assert.equal(cleanModelResult(q,[]).question.category,CORE_TOPICS[0]);
 assert.throws(()=>cleanModelResult({done:true},[]),/before all topics/);
 assert.deepEqual(cleanModelResult({done:true},Array.from({length:10},(_,i)=>entry(i))),{done:true});
});
test('server validates selectable Other and limits multi-answers',()=>{
 const q={type:'single',options:['Operations','Other']};
 assert.equal(validateAnswer(q,'Other: Strategy / transformation'),'Other: Strategy / transformation');
 assert.throws(()=>validateAnswer(q,'Other: '),ApiError);
 assert.throws(()=>validateAnswer(q,'Incorrect choice'),ApiError);
 const multi={type:'multi',options:['A','B','C','D','Other']};
 assert.equal(validateAnswer(multi,'A; B; Other: Change management'),'A; B; Other: Change management');
 assert.throws(()=>validateAnswer(multi,'A; B; C; D'),ApiError);
 assert.throws(()=>validateAnswer(multi,'A; A'),ApiError);
 assert.equal(safeEqual('same','same'),true);assert.equal(safeEqual('same','different'),false);
});
test('OpenAI key stays on server; structured output is validated',async()=>{
 const originalFetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;
 let count=0;process.env.OPENAI_API_KEY='local-test-only-key';
 globalThis.fetch=async(url,opts)=>{
  count++;assert.equal(url,'https://api.openai.com/v1/chat/completions');
  assert.equal(opts.headers.Authorization,'Bearer local-test-only-key');
  assert.equal(JSON.parse(opts.body).response_format.type,'json_schema');
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({done:false,category:'Example',text:'Which achievement are you most proud of?',type:'single',options:['Led a team','Improved a process','Other'],hint:''})}}]})};
 };
 try{const result=await generateQuestion(profile,[]);assert.equal(result.done,false);assert.equal(result.question.category,CORE_TOPICS[0]);assert.equal(count,1);}
 finally{globalThis.fetch=originalFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('HTML script parses and no private keys are embedded',async()=>{
 const {readFileSync}=await import('node:fs');const {Script}=await import('node:vm');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 assert.ok(!html.includes('sk-proj-'));assert.ok(!html.includes('FIREBASE_SERVICE_ACCOUNT_BASE64'));
 assert.match(html,/Delete my test session/);
});

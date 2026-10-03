import test from 'node:test';
import assert from 'node:assert/strict';
import {BANK_COLLECTION,sharedBankSpec,getOrCreateAssessmentBank} from '../api/_lib/question-cache.js';

const profile={employmentStatus:'Employed',careerObjective:'Get promoted',targetJobTitle:'Director Transformation',
 currentIndustry:'Consumer goods / FMCG',targetFunction:'Strategy / transformation',targetIndustry:'Consumer goods / FMCG',
 skills:'People leadership',qualification:"Master's degree",currentJobTitle:'AVP Process Excellence'};
const skills=[
 ...['Strategy','Benefits validation','Change adoption'].map((name,i)=>({id:`s${i+1}`,name,type:'technical',importance:'essential',benchmark:`Can lead demanding and measurable ${name.toLowerCase()} decisions responsibly.`,subskills:['Measure outcomes','Evaluate risks']})),
 {id:'s4',name:'Executive influence',type:'behavioural',importance:'essential',benchmark:'Builds sustainable executive agreement with transparent trade-offs.',subskills:['Constructive challenge','Align sponsors']}
];
const bank={targetRole:'Director Transformation',blueprint:skills,
 untestedSkills:[{id:'u1',name:'Budget ownership',expectation:'Can own large budgets and show measurable benefit.'},{id:'u2',name:'Supplier management',expectation:'Can manage vendor delivery risks effectively.'}],
 questionBank:skills.flatMap(s=>[0,1,2].map(i=>({competencyId:s.id,options:['Review evidence','Ignore the issue','Wait for complaints','Do nothing','Not sure'],answerKey:0,text:`Question for ${s.name} option ${i}`})))};

function mockFirestore(){
 const docs=new Map();let tail=Promise.resolve();const writes=[];
 const database={collection:name=>{assert.equal(name,BANK_COLLECTION);return {doc:id=>({name,id})};},
  async runTransaction(callback){
   const start=tail;let unlock;tail=new Promise(resolve=>{unlock=resolve;});await start;
   const changes=[];const tx={get:async ref=>({exists:docs.has(ref.id),data:()=>docs.get(ref.id)}),
    set:(ref,body)=>changes.push(()=>{docs.set(ref.id,body);writes.push(body.status)}),
    delete:ref=>changes.push(()=>docs.delete(ref.id))};
   try{const result=await callback(tx);changes.forEach(fn=>fn());return result;}finally{unlock();}
  }};
 return {database,docs,writes};
}

test('reuses the same role/goal bank without sharing self-reported answers or identity',async()=>{
 const {database,docs}=mockFirestore();let generated=0;
 const generate=async p=>{
  generated++;
  assert.equal(p.targetJobTitle,'Director Transformation');
  for(const forbidden of ['skills','qualification','email','name','currentJobTitle','history','certifications'])assert(!Object.hasOwn(p,forbidden));
  return bank;
 };
 const first=await getOrCreateAssessmentBank(database,profile,generate);
 const second=await getOrCreateAssessmentBank(database,{...profile,skills:'Data analysis',email:'user@example.com',name:'Jane'},generate);
 assert.equal(first.source,'generated');assert.equal(second.source,'cache');assert.equal(generated,1);
 assert.equal(first.bank,second.bank);
 assert.equal(docs.size,1);
 const saved=docs.values().next().value;
 assert.equal(saved.status,'ready');assert.equal(saved.bank.questionBank.length,12);
 assert(!JSON.stringify(saved).includes('user@example.com'));
});
test('different role, career goal, stage and industry produce distinct banks',()=>{
 const key=p=>sharedBankSpec(p).id;
 assert.equal(key(profile),key({...profile,skills:'Different skills',qualification:'Bachelors'}));
 assert.notEqual(key(profile),key({...profile,targetJobTitle:'Director Finance'}));
 assert.notEqual(key(profile),key({...profile,careerObjective:'Change my function'}));
 assert.notEqual(key(profile),key({...profile,employmentStatus:'Recent graduate'}));
 assert.notEqual(key(profile),key({...profile,targetIndustry:'Banking / finance'}));
 assert.notEqual(key(profile),key({...profile,targetFunction:'Finance'}));
 assert.equal(key(profile),key({...profile,targetJobTitle:'  director   transformation  '}));
 assert.notEqual(sharedBankSpec(profile,{ASSESSMENT_MODEL:'different-model'}).id,key(profile));
});
test('vague career directions bypass shared cache to prevent unsuitable question reuse',async()=>{
 const vague={employmentStatus:'Employed',careerObjective:'Explore my options',qualification:"Master's degree"};
 const {database,docs}=mockFirestore();let called=0;
 const result=await getOrCreateAssessmentBank(database,vague,async p=>{called++;assert.equal(p,vague);return bank;});
 assert.equal(result.source,'personal');assert.equal(called,1);assert.equal(docs.size,0);
});
test('two simultaneous candidates generate one bank, second receives a cache hit',async()=>{
 const {database}=mockFirestore();let calls=0;
 const generator=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,75));return bank;};
 const [a,b]=await Promise.all([getOrCreateAssessmentBank(database,profile,generator),getOrCreateAssessmentBank(database,profile,generator)]);
 assert.deepEqual([a.source,b.source].sort(),['cache','generated']);assert.equal(calls,1);
});
test('failed generation releases lease for next user and a new attempt can succeed',async()=>{
 const {database,docs}=mockFirestore();
 await assert.rejects(getOrCreateAssessmentBank(database,profile,async()=>{throw Error('generation failed');}),/generation failed/);
 assert.equal(docs.size,0);
 const result=await getOrCreateAssessmentBank(database,profile,async()=>bank);
 assert.equal(result.source,'generated');
});
test('expired or malformed ready banks are not reused',async()=>{
 const {database,docs}=mockFirestore();const id=sharedBankSpec(profile).id;
 docs.set(id,{status:'ready',expiresAt:new Date(Date.now()-1000),bank});
 let called=0;
 const result=await getOrCreateAssessmentBank(database,profile,async()=>{called++;return bank;});
 assert.equal(result.source,'generated');assert.equal(called,1);
 docs.set(id,{status:'ready',expiresAt:new Date(Date.now()+3600000),bank:{...bank,questionBank:[]}});
 const next=await getOrCreateAssessmentBank(database,profile,async()=>{called++;return bank;});
 assert.equal(next.source,'generated');assert.equal(called,2);
});
test('potential employer identifiers or email-like target roles bypass the shared cache',()=>{
 assert.equal(sharedBankSpec({...profile,targetJobTitle:'Director Transformation at ConfidentialEmployer'}),null);
 assert.equal(sharedBankSpec({...profile,targetJobTitle:'Director@confidential.example.com'}),null);
});

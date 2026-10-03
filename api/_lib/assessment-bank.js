import {validateBlueprint} from './interview-logic.js';

const competency={type:'object',additionalProperties:false,required:['id','name','type','importance','benchmark','subskills'],properties:{
 id:{type:'string'},name:{type:'string'},type:{type:'string',enum:['technical','behavioural']},
 importance:{type:'string',enum:['essential']},benchmark:{type:'string'},subskills:{type:'array',items:{type:'string'}}
}};
const question={type:'object',additionalProperties:false,required:['competencyId','category','questionKind','difficulty','text','options','answerKey','rationale','subskill'],properties:{
 competencyId:{type:'string'},category:{type:'string'},questionKind:{type:'string',enum:['knowledge','scenario']},
 difficulty:{type:'string',enum:['applied','advanced']},text:{type:'string'},options:{type:'array',items:{type:'string'}},
 answerKey:{type:'integer'},rationale:{type:'string'},subskill:{type:'string'}
}};
const untested={type:'object',additionalProperties:false,required:['id','name','expectation'],properties:{id:{type:'string'},name:{type:'string'},expectation:{type:'string'}}};
export const BANK_SCHEMA={type:'object',additionalProperties:false,required:['targetRole','competencies','untestedSkills','questionBank'],properties:{
 targetRole:{type:'string'},competencies:{type:'array',items:competency},untestedSkills:{type:'array',items:untested},questionBank:{type:'array',items:question}
}};
export function validateAssessmentBank(raw){
 if(!raw||typeof raw!=='object')throw Error('Invalid assessment plan.');
 const targetRole=String(raw.targetRole||'').trim();if(targetRole.length<4||targetRole.length>110)throw Error('Missing or invalid target role.');
 const competencies=validateBlueprint(raw.competencies);
 if(!Array.isArray(raw.untestedSkills)||raw.untestedSkills.length<2||raw.untestedSkills.length>6)throw Error('Include 2–6 additional required, untested skills.');
 const names=new Set(competencies.map(s=>s.name.toLowerCase()));
 const untestedSkills=raw.untestedSkills.map((s,i)=>{
  if(typeof s?.name!=='string'||s.name.trim().length<4||s.name.length>100||typeof s.expectation!=='string'||s.expectation.length<18||s.expectation.length>360)throw Error('Invalid additional skill.');
  const name=s.name.trim().toLowerCase();if(names.has(name))throw Error('Repeated assessed/untested skill.');names.add(name);
  return {id:`u${i+1}`,name:s.name.trim(),expectation:s.expectation.trim()};
 });
 const bank=raw.questionBank;
 if(!Array.isArray(bank)||bank.length!==competencies.length*3)throw Error('Include 3 prepared items per essential skill.');
 const allTexts=new Set();const prepared=[];
 for(const skill of competencies){
  const items=bank.filter(q=>q.competencyId===skill.id);
  if(items.length!==3)throw Error(`Missing prepared questions for ${skill.name}.`);
  for(let i=0;i<3;i++){
   const q=items[i];const expectedKind=skill.type==='technical'&&i===0?'knowledge':'scenario';
   const expectedDifficulty=i===1?'advanced':'applied';
   if(q.category!==skill.name||q.questionKind!==expectedKind||q.difficulty!==expectedDifficulty)throw Error(`Wrong question kind or difficulty for ${skill.name}.`);
   if(typeof q.text!=='string'||q.text.trim().length<20||q.text.trim().split(/\s+/).length>55)throw Error('Question too long or too short.');
   const key=q.text.trim().toLowerCase();if(allTexts.has(key))throw Error('Repeated question.');allTexts.add(key);
   if(!Array.isArray(q.options)||q.options.length!==5||q.options[4]!=='Not sure'||q.options.some(o=>typeof o!=='string'||o.trim().length<3||o.split(/\s+/).length>18)||new Set(q.options.map(o=>o.toLowerCase())).size!==5)throw Error('Invalid answer choices.');
   if(!Number.isInteger(q.answerKey)||q.answerKey<0||q.answerKey>3)throw Error('Invalid answer key.');
   if(typeof q.rationale!=='string'||q.rationale.length<25||q.rationale.length>650)throw Error('Invalid answer explanation.');
   if(typeof q.subskill!=='string'||q.subskill.length<5||q.subskill.length>110)throw Error('Invalid tested subskill.');
   prepared.push({text:q.text.trim(),category:skill.name,competencyId:skill.id,questionType:q.questionKind,type:'single',options:q.options.map(o=>o.trim()),
    hint:'Select the best response. Choose Not sure if you are unsure.',subskill:q.subskill.trim(),difficulty:q.difficulty,answerKey:q.answerKey,rationale:q.rationale});
  }
 }
 return {targetRole,blueprint:competencies,untestedSkills,questionBank:prepared};
}
export function choosePreparedQuestion(blueprint,questionBank,history,target){
 if(!target||!Array.isArray(questionBank))return null;
 const number=history.filter(h=>h.competencyId===target.id&&typeof h.correct==='boolean').length;
 const options=questionBank.filter(q=>q.competencyId===target.id);
 return options[number]?{...options[number]}:null;
}

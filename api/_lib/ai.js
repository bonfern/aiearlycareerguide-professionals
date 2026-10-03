import {instruction,cleanModelResult} from './interview-logic.js';
import {ApiError} from './security.js';
const competency={type:'object',additionalProperties:false,required:['id','name','type','importance','benchmark','subskills'],properties:{
 id:{type:'string'},name:{type:'string'},type:{type:'string',enum:['technical','behavioural']},importance:{type:'string',enum:['essential','important']},benchmark:{type:'string'},subskills:{type:'array',items:{type:'string'}}
}};
const question={type:'object',additionalProperties:false,required:['competencyId','category','questionKind','difficulty','text','options','answerKey','rationale','subskill'],properties:{
 competencyId:{type:'string'},category:{type:'string'},questionKind:{type:'string',enum:['knowledge','scenario']},difficulty:{type:'string',enum:['applied','advanced']},text:{type:'string'},
 options:{type:'array',items:{type:'string'}},answerKey:{type:'integer'},rationale:{type:'string'},subskill:{type:'string'}
}};
export const RESPONSE_SCHEMA={type:'object',additionalProperties:false,required:['competencies','question'],properties:{competencies:{type:'array',items:competency},question}};
export function textFromResponse(data){return (data.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');}
export async function generateQuestion(profile,history,blueprint=null,target=null){
 if(!process.env.OPENAI_API_KEY)throw new ApiError(503,'AI service is not configured.');
 const model=process.env.OPENAI_MODEL||'gpt-6-astra';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),115000);
 let response;
 try{
  response=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
   body:JSON.stringify({model,reasoning:{effort:process.env.OPENAI_REASONING_EFFORT||'high'},max_output_tokens:9800,store:false,
    text:{format:{type:'json_schema',name:'career_competency_question',strict:true,schema:RESPONSE_SCHEMA}},
    input:[{role:'system',content:instruction(profile,history,blueprint,target)},
     {role:'user',content:JSON.stringify({profile,priorResponses:history.map(h=>({competencyId:h.competencyId,subskill:h.subskill,question:h.question,answer:h.answer,correct:h.correct,questionType:h.questionType,difficulty:h.difficulty}))})}]
   })
  });
 }catch(error){if(error.name==='AbortError')throw new ApiError(504,'AI question generation timed out. Retry this question.');throw new ApiError(502,'Could not contact the AI service. Please retry.');}
 finally{clearTimeout(timer);}
 if(!response.ok){console.error('OpenAI interview status',response.status);if([400,403,404].includes(response.status))throw new ApiError(503,'The configured reasoning model may be unavailable. Check API model access and Vercel settings.');throw new ApiError(502,'AI question service temporarily unavailable. Please retry.');}
 const result=await response.json();
 if(result.status==='incomplete')throw new ApiError(502,'The question was incomplete. Please retry.');
 try{return cleanModelResult(JSON.parse(textFromResponse(result)),blueprint,target,history);}
 catch(error){console.error('Invalid assessment output:',error.message);throw new ApiError(502,'The assessment question needs regenerating. Please retry.');}
}

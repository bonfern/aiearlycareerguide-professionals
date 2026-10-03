import {instruction,cleanModelResult,nextQuestionType,nextDifficulty} from './interview-logic.js';
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
 const firstQuestion=!blueprint;
 const reasoningEffort=firstQuestion?(process.env.OPENAI_REASONING_EFFORT||'high'):(process.env.OPENAI_FOLLOWUP_REASONING_EFFORT||'medium');
 const leanProfile=firstQuestion?profile:Object.fromEntries(['profileGroup','employmentStatus','careerObjective','targetJobTitle','targetFunction','targetIndustry','currentJobTitle','experienceYears','qualification'].filter(k=>typeof profile[k]==='string'&&profile[k]).map(k=>[k,profile[k]]));
 const relevantHistory=firstQuestion?[]:history.filter(h=>h.competencyId===target?.id).map(h=>({subskill:h.subskill,correct:h.correct,difficulty:h.difficulty,questionType:h.questionType}));
 // Give the browser one reliable response instead of forcing the user to retry
 // on an occasional malformed or incomplete AI answer. Keep within Vercel's
 // 120-second function limit (which also includes Firestore operations).
 const deadline=Date.now()+106000;
 const maxAttempts=2;
 let retryFeedback='';
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  const remaining=deadline-Date.now();
  if(remaining<12000)break;
  const perCallTimeout=Math.min(firstQuestion?78000:60000,remaining);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),perCallTimeout);
  let response;
  try{
   const extra=retryFeedback?`\nREGENERATE THE QUESTION. The previous output failed validation: ${retryFeedback}. Follow every rule exactly. Do not change the target competency. Rewrite the scenario in short, simple sentences; ask one clear question and keep each option brief.`:'';
   response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,reasoning:{effort:attempt>1&&!firstQuestion?'low':reasoningEffort},
     max_output_tokens:firstQuestion?(attempt>1?11000:9800):(attempt>1?5800:4200),store:false,
     text:{format:{type:'json_schema',name:'career_competency_question',strict:true,schema:RESPONSE_SCHEMA}},
     input:[{role:'system',content:instruction(profile,history,blueprint,target)+extra},
      {role:'user',content:JSON.stringify({profile:leanProfile,previousAnswersForThisSkill:relevantHistory})}]
    })
   });
  }catch(error){
   if(error.name==='AbortError'){
    console.warn('AI generation attempt timed out',{attempt,firstQuestion});
    retryFeedback='The previous generation timed out. Respond concisely while following the schema.';
    if(attempt<maxAttempts)continue;
    throw new ApiError(504,'Preparing the question took too long. Your answers are saved; please retry.');
   }
   if(attempt<maxAttempts){console.warn('AI connection failed; retrying',{attempt});retryFeedback='Connection was interrupted. Generate one valid question.';continue;}
   throw new ApiError(502,'Could not contact the AI service. Your answers are saved; please retry.');
  }finally{clearTimeout(timer);}
  if(!response.ok){
   // Credential, model-access, and invalid-request errors need administrator action,
   // not expensive repetitions of the same request.
   console.error('OpenAI interview status',response.status);
   if([400,401,403,404].includes(response.status))throw new ApiError(503,'The configured reasoning model may be unavailable. Check API model access and Vercel settings.');
   if(response.status===429)throw new ApiError(503,'The AI service is busy or its usage limit was reached. Please try again shortly.');
   if(attempt<maxAttempts&&response.status>=500){retryFeedback='The service returned a temporary error. Regenerate one valid question.';continue;}
   throw new ApiError(502,'AI question service temporarily unavailable. Your answers are saved; please retry.');
  }
  let result;
  try{result=await response.json();}
  catch{retryFeedback='The previous response was not valid JSON.';if(attempt<maxAttempts)continue;break;}
  if(result.status==='incomplete'){
   retryFeedback='The previous response ran out of output tokens. Return a complete, concise question and valid JSON.';
   console.warn('Incomplete AI response',{attempt,firstQuestion});
   if(attempt<maxAttempts)continue;
   break;
  }
  try{
   const raw=textFromResponse(result);
   if(!raw)throw Error('Missing question JSON (no output_text returned).');
   return cleanModelResult(JSON.parse(raw),blueprint,target,history);
  }catch(error){
   // The rejection reason is used to guide one internal regeneration. Never
   // print the candidate's profile or their response text in application logs.
   console.warn('AI question failed validation',{attempt,reason:error.message});
   retryFeedback=error.message;
   if(attempt<maxAttempts)continue;
  }
 }
 console.error('AI question failed after internal retries',{firstQuestion,targetSkill:target?.id||null});
 throw new ApiError(502,'We could not prepare a valid question. Your previous answers are saved. Please retry.');
}

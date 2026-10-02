import {instruction, cleanModelResult} from './interview-logic.js';
import {ApiError} from './security.js';
const responseSchema={
  type:'object', additionalProperties:false, required:['done','category','text','type','options','hint'],
  properties:{ done:{type:'boolean'},category:{type:'string'},text:{type:'string'},type:{type:'string',enum:['single','multi','text']},options:{type:'array',items:{type:'string'}},hint:{type:'string'} }
};
export async function generateQuestion(profile,history){
  if (!process.env.OPENAI_API_KEY) throw new ApiError(503,'AI service is not configured.');
  const controller = new AbortController();
  const timer=setTimeout(()=>controller.abort(),24000);
  let response;
  try {
    response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-4o-mini',temperature:0.35,max_completion_tokens:520,
        response_format:{type:'json_schema',json_schema:{name:'professional_next_question',strict:true,schema:responseSchema}},
        messages:[{role:'system',content:instruction(profile,history)}, {role:'user',content:JSON.stringify({professionalProfile:profile, previousQuestionsAndAnswers:history.map(({question,answer,category})=>({question,answer,category}))})}]
      })
    });
  } catch(error) {
    if(error.name==='AbortError') throw new ApiError(504,'The AI took too long. Please retry.');
    throw new ApiError(502,'Could not contact the AI service. Please retry.');
  } finally { clearTimeout(timer); }
  if (!response.ok) {console.error('OpenAI status',response.status);throw new ApiError(502,'AI service temporarily unavailable. Please retry.');}
  const result=await response.json();
  try { return cleanModelResult(JSON.parse(result.choices?.[0]?.message?.content),history); }
  catch { throw new ApiError(502,'AI returned an invalid question. Please retry.'); }
}

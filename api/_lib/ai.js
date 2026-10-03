import {instruction,cleanModelResult} from './interview-logic.js';
import {ApiError} from './security.js';
const responseSchema={type:'object',additionalProperties:false,required:['done','category','text','type','options','hint'],properties:{done:{type:'boolean'},category:{type:'string'},text:{type:'string'},type:{type:'string',enum:['single','multi','text']},options:{type:'array',items:{type:'string'}},hint:{type:'string'}}};
export function textFromResponse(data){
 return (data.output||[]).filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
}
export async function generateQuestion(profile,history){
 if(!process.env.OPENAI_API_KEY)throw new ApiError(503,'AI service is not configured.');
 const model=process.env.OPENAI_MODEL||'gpt-6-astra';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 let response;
 try{
  response=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
   body:JSON.stringify({model,reasoning:{effort:process.env.OPENAI_REASONING_EFFORT||'high'},max_output_tokens:3900,store:false,
    text:{format:{type:'json_schema',name:'professional_next_question',strict:true,schema:responseSchema}},
    input:[{role:'system',content:instruction(profile,history)},
      {role:'user',content:JSON.stringify({profile,priorResponses:history.map(({question,answer,category})=>({question,answer,category}))})}]
   })
  });
 }catch(error){if(error.name==='AbortError')throw new ApiError(504,'The AI took too long. Please retry this question.');throw new ApiError(502,'Could not contact the AI service. Please retry.');}
 finally{clearTimeout(timer);}
 if(!response.ok){
  console.error('OpenAI interview status',response.status);
  if([400,403,404].includes(response.status))throw new ApiError(503,'The reasoning model is unavailable to this OpenAI project. Check your model access and OPENAI_MODEL setting.');
  throw new ApiError(502,'AI service temporarily unavailable. Please retry.');
 }
 const result=await response.json();
 if(result.status==='incomplete')throw new ApiError(502,'The AI response was incomplete. Please retry this question.');
 try{return cleanModelResult(JSON.parse(textFromResponse(result)),profile,history);}
 catch(error){console.error('Invalid interview schema:',error.message);throw new ApiError(502,'The AI returned an invalid question. Please retry.');}
}

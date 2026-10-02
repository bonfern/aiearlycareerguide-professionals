import {authorize,output,handleError,postOnly,safeState} from './_lib/store.js';
export default async function handler(req,res){
  if(!postOnly(req,res))return;
  try{const {session}=await authorize(req);return output(res,200,safeState(session));}
  catch(e){return handleError(res,e,'resume');}
}

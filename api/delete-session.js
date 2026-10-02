import {authorize,output,handleError,postOnly} from './_lib/store.js';
export default async function handler(req,res){
  if(!postOnly(req,res))return;
  try{const {ref}=await authorize(req);await ref.delete();return output(res,200,{deleted:true});}
  catch(e){return handleError(res,e,'delete-session');}
}

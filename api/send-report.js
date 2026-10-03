import {authorize,output,handleError,postOnly} from './_lib/store.js';
import {sendReportEmail} from './_lib/commerce.js';
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{const {ref}=await authorize(req);return output(res,200,await sendReportEmail(ref));}
 catch(err){return handleError(res,err,'send-report');}
}

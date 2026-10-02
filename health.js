import {output} from './_lib/store.js';
export default function handler(req,res){return output(res,200,{service:'career-professionals',mode:'private-beta',ready: Boolean(process.env.OPENAI_API_KEY && process.env.PREVIEW_ACCESS_CODE && process.env.FIREBASE_SERVICE_ACCOUNT_BASE64)});}

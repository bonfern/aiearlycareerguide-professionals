import {output} from './_lib/store.js';
import {firebaseConfigured} from './_lib/firebase-config.js';
export default function handler(req,res){return output(res,200,{service:'career-professionals',mode:'private-beta',ready: Boolean(process.env.OPENAI_API_KEY && process.env.PREVIEW_ACCESS_CODE && firebaseConfigured())});}

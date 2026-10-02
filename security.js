import crypto from 'node:crypto';
export class ApiError extends Error { constructor(status,message) { super(message);this.status=status; } }
export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export function safeEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}
export function validateAnswer(q,answer){
  if(!q||typeof answer!=='string'||!answer.trim()||answer.length>900)throw new ApiError(400,'Please provide a valid answer.');
  const text=answer.trim();
  if(q.type==='text')return text;
  const parts=q.type==='multi'?text.split('; ').map(x=>x.trim()):[text];
  if(!parts.length||parts.length>(q.type==='multi'?3:1)||new Set(parts).size!==parts.length)throw new ApiError(400,'Choose up to three distinct answers.');
  for(const item of parts){
    if(q.options.includes(item))continue;
    if(q.options.includes('Other')&&item.startsWith('Other: ')&&item.length>7&&item.length<=230)continue;
    throw new ApiError(400,'Select one of the available choices or specify Other.');
  }
  return text;
}

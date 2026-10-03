import {db,ApiError,output,handleError,postOnly,parseBody} from './_lib/store.js';
import {COUPONS,readCoupon,cleanCode,priceQuote,activeReservations} from './_lib/commerce.js';
export default async function handler(req,res){
 if(!postOnly(req,res))return;
 try{
  const code=cleanCode(parseBody(req).couponCode);
  if(!code)return output(res,200,priceQuote(null));
  const doc=await db().collection(COUPONS).doc(code).get();
  if(!doc.exists)throw new ApiError(400,'Invalid coupon code.');
  const coupon=readCoupon(doc.data(),code);
  const used=Number(doc.data().usedCount||0),held=Object.keys(activeReservations(doc.data())).length;
  if(coupon.maxUses&&used+held>=coupon.maxUses)throw new ApiError(400,'This coupon has reached its usage limit.');
  return output(res,200,priceQuote(coupon));
 }catch(err){return handleError(res,err,'validate-coupon');}
}

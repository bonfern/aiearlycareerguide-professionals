import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const source=readFileSync(new URL('../api/_lib/commerce.js',import.meta.url),'utf8');
const commonStart=source.indexOf('const EMAIL_HOME=');
const commonEnd=source.indexOf('// Firestore lease + Resend idempotency',commonStart);
const accessStart=source.indexOf('export function accessEmailHtml(');
const accessEnd=source.indexOf('// Firestore lease prevents duplicate',accessStart);
assert(commonStart>0&&commonEnd>commonStart&&accessEnd>accessStart);
const selected=source.slice(commonStart,commonEnd).replace('export function receiptHtml','function receiptHtml')
 +source.slice(accessStart,accessEnd).replace('export function accessEmailHtml','function accessEmailHtml');
const htmlFunctions=new Script(selected+'\n({receiptHtml,accessEmailHtml})').runInContext(createContext({}));
const report={
 targetRole:'Director of Business Transformation',summary:'Build on stakeholder skills and improve process measurement.',
 coverage:{assessed:2,total:2},
 priorities:[{name:'Change Leadership',firstAction:'Create an adoption plan'}],
 skillAssessments:[{name:'Change Leadership',currentCompetency:'Developing',priority:'Development priority',targetBenchmark:'Plan change',gap:'Track adoption',actions:['Design a monthly dashboard'],practiceTask:'Build a case study',successIndicator:'Review with a mentor',
  learning:{free:[{name:'Free course',provider:'OpenLearn',url:'https://open.edu/example',time:'3 hours'}]}},
  {name:'Executive Communication',currentCompetency:'Ready for practice',priority:'Maintain and stretch',gap:'Give concise updates',actions:['Practise board updates'],practiceTask:'Make a deck',successIndicator:'Peer feedback'}],
 additionalSkills:[{name:'Digital governance',expectation:'Set governance measures',nextStep:'Join a programme',howToVerify:'Show outcomes'}],
 actionPlan:[{period:'Days 1–30',focus:'Learn',actions:['Complete a course']},{period:'Days 31–60',focus:'Apply',actions:['Build a plan']},{period:'Days 61–90',focus:'Demonstrate',actions:['Present outcomes']}],
 progressChecklist:[{skill:'Change Leadership',deliverable:'Plan',evidence:'Review'}]
};

test('access email has phone viewport, fluid width, compact header and mobile-safe action',()=>{
 const html=htmlFunctions.accessEmailHtml({link:'https://example.com/professionals#access=private-token',free:true,amount:0});
 assert.match(html,/name="viewport"/);
 assert.match(html,/max-width:600px/);
 assert.doesNotMatch(html,/7-day, 100% money-back guarantee/i);
 assert.match(html,/refund\.html/);
 assert.match(html,/@media only screen and \(max-width:620px\)/);
 assert.match(html,/\.email-button\{display:block!important;width:100%!important/);
 assert.match(html,/Start or Resume Assessment/);
 assert.match(html,/brand-logo-email\.png/);
 assert.doesNotMatch(html,/<table[^>]*width="760"/);
 assert.doesNotMatch(html,/brand-logo\.webp/);
});

test('report email avoids three-column table and preserves all development content',()=>{
 const html=htmlFunctions.receiptHtml(report);
 assert.match(html,/What you need to build for/);
 assert.match(html,/Your skill-by-skill development plan/);
 assert.match(html,/Your 30 \/ 60 \/ 90-day execution plan/);
 assert.match(html,/Free course/);
 assert.match(html,/brand-logo-email\.png/);
 assert.match(html,/max-width:600px/);
 assert.match(html,/7-day, 100% money-back guarantee/i);
 assert.match(html,/refund\.html/);
 assert.doesNotMatch(html,/<th\b/i);
 assert.doesNotMatch(html,/width="760"/);
 assert.equal((html.match(/role="presentation"/g)||[]).length>5,true);
});

test('free and paid access messages are distinct and no secrets are embedded in the HTML template itself',()=>{
 const paid=htmlFunctions.accessEmailHtml({link:'https://example.com/#access=example',amount:49900});
 assert.match(paid,/Your payment is confirmed/);assert.match(paid,/₹499/);assert.match(paid,/7-day, 100% money-back guarantee/i);assert.match(paid,/refund\.html/);
 assert.doesNotMatch(paid,/Your complimentary assessment is ready/);
 assert.equal(source.includes('RESEND_API_KEY')&&source.includes('REPORT_FROM_EMAIL'),true);
});

test('user-supplied report content is safely escaped and suspicious learning URLs are not made clickable',()=>{
 const html=htmlFunctions.receiptHtml({...report,targetRole:'<script>alert(1)</script>',skillAssessments:[{...report.skillAssessments[0],learning:{free:[{name:'<img src=x onerror=alert(1)>',provider:'Unsafe',url:'javascript:alert(1)'}]}}]});
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/href="javascript:/);
});

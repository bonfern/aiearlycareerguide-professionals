// Curated official provider URLs, reviewed 2026-10-03. Never claim dynamic course fees are fixed.
// A generic provider directory is NOT represented as a skill-specific course.
export const CATALOG_VERSION='2026-10-03';
export const LEARNING_CATALOG=Object.freeze([
 {id:'pmi-kickoff',name:'KICKOFF: Project Management Basics',provider:'Project Management Institute (PMI)',url:'https://www.pmi.org/kickoff/',kind:'free',topics:['project','programme','program','delivery','planning','stakeholder','agile','risk','operations'],level:'Introductory',time:'Under 1 hour',description:'Free introduction to project planning and delivery, with a completion badge.'},
 {id:'openlearn-leadership',name:'Managing and Managing People',provider:'The Open University — OpenLearn',url:'https://www.open.edu/openlearn/money-business/leadership-management/managing-and-managing-people/content-section-0',kind:'free',topics:['lead','people','team','manager','delegate','coach','talent','performance','supervis','mentor'],level:'Foundational',time:'Check provider',description:'Free management foundations and a statement of participation.'},
 {id:'openlearn-teams',name:'Working in Groups and Teams',provider:'The Open University — OpenLearn',url:'https://www.open.edu/openlearn/money-business/leadership-management/working-groups-and-teams/content-section-0',kind:'free',topics:['team','collaborat','conflict','delegat','people','team management'],level:'Foundational',time:'Check provider',description:'Free course on effective teamwork, conflict and team development.'},
 {id:'openlearn-leadingchange',name:'Step Up to Leadership',provider:'The Open University — OpenLearn',url:'https://www.open.edu/openlearn/money-business/leadership-management/step-leadership',kind:'free',topics:['lead','change','team','stakeholder','decision','culture','communicat'],level:'Introductory',time:'About 4 hours',description:'Free course on leadership, people and leading through change. Includes examples from community policing.'},
 {id:'hubspot-academy',name:'Free Sales and Marketing Courses',provider:'HubSpot Academy',url:'https://academy.hubspot.com/',kind:'free-directory',topics:['sales','marketing','digital marketing','customer','service','content','crm','social media'],level:'Various',time:'Choose a course',description:'Free, online sales, marketing and customer-service courses and some certificates.'},
 {id:'google-skillshop',name:'Google Ads Skillshop',provider:'Google',url:'https://skillshop.withgoogle.com/googleads/',kind:'free-directory',topics:['marketing','advertis','digital marketing','google ads','campaign','performance marketing','analytics'],level:'Various',time:'Choose a course',description:'Free Google Ads training with optional certifications.'},
 {id:'openlearn-library',name:'Free Business and Management Courses',provider:'The Open University — OpenLearn',url:'https://www.open.edu/openlearn/money-management/free-courses',kind:'free-directory',topics:['strategy','business','finance','operations','marketing','sales','management','entrepreneur','human resources','recruit','commercial','communication'],level:'Various',time:'Choose a course',description:'Browse and select a course covering your specific development topic.'},
 {id:'ms-powerbi',name:'Power BI Learning Paths',provider:'Microsoft Learn',url:'https://learn.microsoft.com/en-us/training/powerplatform/power-bi',kind:'free-directory',topics:['data','analytics','dashboard','reporting','metrics','insight','visual','power bi','business intelligence','financial modelling'],level:'Beginner–advanced',time:'Choose a module',description:'Official guided modules covering data preparation, modelling and reporting.'},
 {id:'ms-powerplatform',name:'Microsoft Power Platform Training',provider:'Microsoft Learn',url:'https://learn.microsoft.com/en-us/training/powerplatform/',kind:'free-directory',topics:['automation','digital','process','power automate','power apps','technology','transformation','workflow','low code'],level:'Various',time:'Choose a module',description:'Official modules on automation, low-code tools and digital processes.'},
 {id:'aws-skillbuilder',name:'AWS Skill Builder Free Learning',provider:'Amazon Web Services',url:'https://aws.amazon.com/training/digital/',kind:'free-directory',topics:['cloud','aws','architecture','security','machine learning','ai','data engineering','devops','software','infrastructure'],level:'Various',time:'Choose a course',description:'Official cloud and AI learning catalogue with free digital training.'},
 {id:'google-pm',name:'Google Project Management Professional Certificate',provider:'Google via Coursera',url:'https://www.coursera.org/professional-certificates/google-project-management',kind:'paid',topics:['project','programme','program','agile','planning','delivery','stakeholder','scrum'],level:'Foundational',time:'Self-paced; check provider',description:'Structured project-management programme with practical assignments. Check current local subscription fees.'},
 {id:'prosci-change',name:'Prosci Change Management Certification',provider:'Prosci',url:'https://www.prosci.com/solutions/training-programs/change-management-certification-program',kind:'certification',minBudget:'Above ₹50,000',topics:['change','adoption','stakeholder','transformation','culture','resistance','organisational development'],level:'Experienced practitioners',time:'3–5 days; check schedule',description:'Instructor-led change-management certification; substantial fees. Check eligibility and fees directly.'},
 {id:'pmi-capm',name:'Certified Associate in Project Management (CAPM)',provider:'Project Management Institute (PMI)',url:'https://www.pmi.org/certifications/certified-associate-capm',kind:'certification',minBudget:'₹20,000–₹50,000',topics:['project','programme','program','agile','planning','delivery'],level:'Entry-level project roles',time:'Check eligibility',description:'Credential for foundational project management; education and exam requirements apply.'},
 {id:'pmi-pmp',name:'Project Management Professional (PMP)',provider:'Project Management Institute (PMI)',url:'https://www.pmi.org/certifications/project-management-pmp',kind:'certification',minBudget:'₹20,000–₹50,000',topics:['project','programme','program','portfolio','delivery','project governance'],level:'Experienced project leaders',time:'Check eligibility',description:'Advanced credential with qualifying experience and training requirements; check current exam rules.'},
 {id:'aws-premium',name:'AWS Skill Builder Paid Learning',provider:'Amazon Web Services',url:'https://aws.amazon.com/training/digital/',kind:'paid',topics:['cloud','aws','architecture','security','ai','devops','infrastructure'],level:'Various',time:'Subscription options; check provider',description:'Paid labs and advanced learning options; verify current local pricing.'}
]);

const clean=x=>String(x||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ');
export const VALID_PREFERENCES={
 weeklyHours:['Under 2 hours','2–5 hours','5–10 hours','More than 10 hours','No preference'],
 budget:['Free resources only','Up to ₹5,000','₹5,000–₹20,000','₹20,000–₹50,000','Above ₹50,000','No preference'],
 learningStyle:['Self-paced online','Live online classes','Classroom training','Practical projects','No preference']
};
export function validateLearningPreferences(value){
 if(value===undefined||value===null)return {weeklyHours:'No preference',budget:'No preference',learningStyle:'No preference'};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(VALID_PREFERENCES,k)))throw Error('Invalid learning preferences.');
 const result={};for(const [key,allowed] of Object.entries(VALID_PREFERENCES)){
  const option=value[key]??'No preference';if(!allowed.includes(option))throw Error('Invalid learning preference: '+key);result[key]=option;
 }return result;
}
export function recommendationsForSkill(skill,preferences={}){
 const prefs=validateLearningPreferences(preferences);
 const text=clean([skill?.name,skill?.targetBenchmark||skill?.benchmark,skill?.gap,skill?.focus].join(' '));
 const score=r=>r.topics.reduce((n,topic)=>{const p=clean(topic);return n+(p.includes(' ')?text.includes(p)*3:new RegExp(`\\b${p}(?:s|ing|ment)?\\b`).test(text)?2:0);},0);
 const matches=LEARNING_CATALOG.map(r=>({...r,relevance:score(r)})).filter(r=>r.relevance>0).sort((a,b)=>b.relevance-a.relevance);
 const select=kind=>matches.filter(r=>kind.includes(r.kind));
 const free=select(['free','free-directory']).slice(0,2),paid=prefs.budget==='Free resources only'?[]:select(['paid']).slice(0,1);
 const budgetLevels={'Free resources only':0,'Up to ₹5,000':1,'₹5,000–₹20,000':2,'₹20,000–₹50,000':3,'Above ₹50,000':4,'No preference':4};
 const budgetLevel=budgetLevels[prefs.budget];
 const certifications=select(['certification']).filter(r=>{
  const senior=String(skill?.careerStage||'').toLowerCase();
  return budgetLevel>=budgetLevels[r.minBudget||'Above ₹50,000']&&(r.id!=='pmi-pmp'||!senior.includes('graduate'));
 }).slice(0,1);
 const strip=arr=>arr.map(({relevance,...r})=>r);
 return {free:strip(free),paid:strip(paid),certifications:strip(certifications),catalogVersion:CATALOG_VERSION,
  ...(free.length?{}:{freeGap:'No closely matched verified free resource in our current catalogue. Ask a qualified mentor or the relevant professional body for a suitable course.'}),
  ...(paid.length||prefs.budget==='Free resources only'?{}:{paidGap:'No closely matched vetted paid programme; avoid buying a generic course solely to obtain a certificate.'})};
}

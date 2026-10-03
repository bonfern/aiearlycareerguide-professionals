// Dependency-free A4 PDF for server-generated report email attachments.
// All report sections are included; links are printed as text and also appear clickable in the HTML email.
const esc=s=>String(s||'').replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)').replace(/[^\x20-\x7e]/g,c=>({'–':'-','—':'-','’':"'",'“':'"','”':'"','₹':'INR ','•':'-','→':'->','é':'e'}[c]||' '));
const text=s=>String(s??'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
const wrap=(str,max=94)=>{
 const chunks=[];let line='';for(const word of text(str).split(' ')){if((line+' '+word).trim().length>max&&line){chunks.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)chunks.push(line);return chunks.length?chunks:[''];
};
export function buildReportPdf(report){
 const pages=[];let cmds=[],y=775;const navy='0.10 0.14 0.28',violet='0.38 0.23 0.83',muted='0.35 0.40 0.51';
 const draw=(content,x,yy,size=10,bold=false,color=navy)=>{cmds.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${yy} Tm (${esc(content)}) Tj ET`);};
 const pushPage=()=>{if(!cmds.length)return;pages.push(cmds.join('\n'));cmds=[];y=775;};
 const ensure=(height=18)=>{if(y-height<56)pushPage();};
 const gap=(n=9)=>{ensure(n);y-=n;};
 const line=(value,opts={})=>{const {size=10,bold=false,color=navy,indent=0,max=94,leading=14}=opts;
   for(const segment of wrap(value,max)){ensure(leading);draw(segment,48+indent,y,size,bold,color);y-=leading;}
 };
 const heading=(value,level=2)=>{ensure(50);gap(level===1?18:15);line(value,{size:level===1?19:12,bold:true,color:level===1?violet:navy,max:72,leading:level===1?24:17});gap(5);};
 const list=(items)=>{for(const item of(items||[]))line('- '+item,{indent:9,max:88,leading:14});};
 heading('CAREER GUIDE FOR PROFESSIONALS',1);
 line('By AI Early Career Guide',{size:10,color:muted});gap(7);
 line('Career Competency & Development Report',{size:15,bold:true,leading:22});
 line('Target role: '+(report.targetRole||'Not specified'),{size:11,bold:true});gap(8);
 line(report.summary||'');gap(8);
 line(`${report.coverage?.assessed||0} of ${report.coverage?.total||0} essential skills fully assessed; ${report.coverage?.answered||0} questions answered.`,{bold:true});
 heading('1. Essential skills - quick overview');
 for(const s of report.skillAssessments||[]){
  ensure(38);line(`${s.name}  |  ${s.currentCompetency}  |  ${s.priority||'Review'}`,{bold:true,max:76});
  line('Target: '+s.targetBenchmark,{indent:10,max:84,size:9,leading:12});gap(4);
 }
 if(report.priorities?.length){heading('Your immediate development priorities');list(report.priorities.map(s=>`${s.name}: ${s.firstAction}`));}
 heading('2. Individual competency development');
 for(const s of report.skillAssessments||[]){
  heading(s.name);
  line('Required for your goal: '+s.targetBenchmark);
  line('Current test-based finding: '+s.currentCompetency+'; Evidence: '+(s.evidenceLevel||'Limited'));
  line('Development priority: '+(s.priority||'Review'));
  line('Specific focus: '+s.gap);
  if(s.subskillsNeedingWork?.length)line('Subskills to practise: '+s.subskillsNeedingWork.join('; '));
  if(s.subskillsNotTested?.length)line('Subskills not tested: '+s.subskillsNotTested.join('; '));
  line('What to do:',{bold:true});list(s.actions);
  line('Practical assignment: '+s.practiceTask);
  line('Evidence of progress: '+s.successIndicator);
  const learning=s.learning||{};
  for(const [title,items] of [['Free learning',learning.free],['Paid programmes',learning.paid],['Optional certifications',learning.certifications]]){
   if(items?.length){gap(3);line(title+':',{bold:true});for(const r of items){line('- '+r.name+' | '+r.provider+' | '+r.url,{indent:9,max:83,size:9,leading:12});}}
  }
  if(learning.freeGap)line(learning.freeGap,{size:9,color:muted});gap(8);
 }
 heading('3. Other required skills - not tested');
 for(const s of report.additionalSkills||[]){heading(s.name);line('Expected: '+s.expectation);line('Suggested development: '+s.nextStep);line('How to validate: '+s.howToVerify);
  for(const r of (s.learning?.free||[]).slice(0,1))line('Optional free resource: '+r.name+' - '+r.url,{size:9});}
 heading('4. Your 30 / 60 / 90-day roadmap');
 if(report.learningPreferences)line('Available study time: '+report.learningPreferences.weeklyHours+' | Budget: '+report.learningPreferences.budget+' | Learning preference: '+report.learningPreferences.learningStyle,{size:9});
 for(const plan of report.actionPlan||[]){heading(plan.period+' - '+plan.focus);list(plan.actions);}
 heading('5. Progress and reassessment');
 for(const c of report.progressChecklist||[])line('- '+c.skill+': '+c.deliverable+' | Evidence: '+c.evidence,{indent:9,max:85});
 gap(14);line('Important: this is an unproctored multiple-choice assessment. Results indicate test performance, not independently verified workplace competence. Check programme fees, eligibility and availability with each provider before enrolling.',{size:9,color:muted,max:110});
 pushPage();
 const objects=[null];const add=body=>{objects.push(body);return objects.length-1;};
 const catalog=add('<< /Type /Catalog /Pages 2 0 R >>');const pageRoot=add('');
 const fontRegular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),fontBold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const kids=[];
 for(let i=0;i<pages.length;i++){
  const header=`q ${violet} rg 48 802 500 4 re f Q\n`;
  const pageFooter=`BT /F1 8 Tf ${muted} rg 1 0 0 1 48 34 Tm (Career Guide for Professionals | Page ${i+1} of ${pages.length}) Tj ET`;
  const stream=header+pages[i]+'\n'+pageFooter;
  const streamLength=Buffer.byteLength(stream,'latin1');
  const contents=add(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
  const page=add(`<< /Type /Page /Parent ${pageRoot} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contents} 0 R >>`);
  kids.push(`${page} 0 R`);
 }
 objects[pageRoot]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=1;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,'latin1'));pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf,'latin1');pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
 for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 pdf+=`trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf,'latin1');
}

// Self-contained, branded A4 report PDF. No external fetch or npm PDF dependency.
// The original website logo is embedded as JPEG inside the PDF so it also works offline.
import {REPORT_BRAND_LOGO} from './report-brand.js';

const C={navy:'0.09 0.14 0.28',purple:'0.38 0.22 0.88',muted:'0.35 0.40 0.50',lavender:'0.95 0.94 1.0',light:'0.98 0.98 1.0',teal:'0.03 0.54 0.55',white:'1 1 1'};
const plain=s=>String(s??'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
const esc=s=>plain(s).replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)').replace(/[^\x20-\x7e]/g,c=>({'–':'-','—':'-','−':'-','’':"'",'‘':"'",'“':'"','”':'"','₹':'INR ','•':'-','→':'->','é':'e','…':'...',' ':' '}[c]||' '));
function wrap(s,max=92){let row='',rows=[];for(const word of plain(s).split(' ')){if(row&&row.length+word.length+1>max){rows.push(row);row=word;}else row+=(row?' ':'')+word;}if(row)rows.push(row);return rows.length?rows:[''];}
const pageWidth=595,pageHeight=842;
const buffer=s=>Buffer.from(s,'latin1');
const friendlyPriority=s=>({'High development priority':'Start here','Development priority':'Work on this','Maintain and stretch':'Build on this strength','More assessment needed':'More practice needed'}[s]||s||'Review');

export function buildReportPdf(report){
 if(!report||typeof report!=='object')throw Error('A completed report is required.');
 const pages=[];let current={cmds:[],links:[]},y=716;
 const textAt=(str,x,yy,size=10,bold=false,color=C.navy)=>current.cmds.push(`BT /${bold?'Bold':'Regular'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${yy.toFixed(1)} Tm (${esc(str)}) Tj ET`);
 const rect=(x,yy,w,h,colour)=>current.cmds.push(`q ${colour} rg ${x} ${yy.toFixed(1)} ${w} ${h} re f Q`);
 const flush=()=>{if(current.cmds.length||!pages.length)pages.push(current);current={cmds:[],links:[]};y=716;};
 const ensure=(height=22)=>{if(y-height<64)flush();};
 const gap=(height=8)=>{ensure(height);y-=height;};
 function lines(value,{size=10,bold=false,color=C.navy,indent=0,max=95,leading=14}={}){
  for(const segment of wrap(value,max)){ensure(leading+2);textAt(segment,49+indent,y,size,bold,color);y-=leading;}
 }
 function title(value,level=2){const first=level===1;ensure(first?62:43);gap(first?17:12);lines(value,{size:first?18:12,bold:true,color:first?C.purple:C.navy,max:first?65:82,leading:first?24:18});gap(3);}
 function bulletList(values){for(const value of values||[]){ensure(19);lines('- '+value,{size:10,max:94,indent:9,leading:14});gap(2);}}
 function labelled(label,content){if(!content)return;lines(label,{size:9,bold:true,color:C.purple});lines(content,{size:10,leading:14});gap(4);}
 function resources(label,items){if(!items?.length)return;gap(4);lines(label,{bold:true,color:C.purple});for(const r of items){const name=`${r.name} - ${r.provider}`;ensure(44);const yTop=y;lines('- '+name,{indent:9,max:81,size:9,leading:12});const safeUrl=typeof r.url==='string'&&/^https:\/\/[^\s]+$/.test(r.url)?r.url:null;
   if(safeUrl){const urlY=y;lines('View the course: '+safeUrl,{indent:14,max:91,size:8,color:C.teal,leading:11});current.links.push({url:safeUrl,rect:[59,Math.max(62,urlY-10),547,Math.min(742,yTop+11)]});}
   gap(3);
  }}
 // First-page report title and direct career route.
 title('CAREER ACTION & SKILL DEVELOPMENT REPORT',1);
 lines('A direct route from your current position to your stated career goal',{size:10,color:C.muted});gap(9);
 lines('YOUR GOAL',{size:9,bold:true,color:C.purple});lines(report.goalPath?.headline||report.targetRole||'Your next career move',{size:13,bold:true,max:73,leading:18});gap(9);
 const priorityItems=(items,limit=3)=>{const meaningful=(items||[]).filter(item=>item.priority!=='Maintain and stretch');const source=meaningful.length?meaningful:(items||[]);return source.slice(0,limit).map(item=>`${item.name} - ${item.status||friendlyPriority(item.priority)}`);};
 const quickGroups=[['TECHNICAL PRIORITIES',priorityItems(report.capabilityFocus?.technical||[])],['LEADERSHIP & BEHAVIOURAL PRIORITIES',priorityItems(report.capabilityFocus?.behavioural||[])],['CAREER ACTIONS TO TAKE',(report.goalPath?.careerActions||[]).slice(0,3).map(step=>step.title)]];
 for(const [heading,items] of quickGroups){lines(heading,{size:9,bold:true,color:C.purple});bulletList(items.length?items:['See the detailed plan below.']);gap(3);}
 gap(4);ensure(54);rect(43,y-28,509,44,C.lavender);textAt(`${report.coverage?.assessed??0} of ${report.coverage?.total??0} essential capabilities assessed`,58,y-2,11,true,C.navy);textAt(`${report.priorities?.length??0} priority areas to build further`,58,y-20,10,false,C.purple);y-=57;

 title(`1. What you need to build for ${report.targetRole||'your goal'}`);
 const capabilityGroups=[['TECHNICAL CAPABILITIES',report.capabilityFocus?.technical||[]],['LEADERSHIP & BEHAVIOURAL CAPABILITIES',report.capabilityFocus?.behavioural||[]]];
 for(const [heading,items] of capabilityGroups){
  lines(heading,{size:9,bold:true,color:C.purple});
  if(!items.length){lines('No essential capabilities in this category were included in the assessment.',{size:9,color:C.muted});gap(6);continue;}
  for(const item of items){ensure(42);lines(item.name,{size:10,bold:true,max:90,leading:13});lines(`${item.currentCompetency||'Not assessed'} | ${item.status||friendlyPriority(item.priority)}`,{size:9,color:C.muted,max:93,leading:12});lines('First action: '+(item.firstAction||'Use the detailed skill plan below.'),{size:9,max:93,leading:12});gap(5);}
  gap(4);
 }

 title('2. How to get there');
 let stepNo=0;
 for(const step of report.goalPath?.careerActions||[]){stepNo++;ensure(58);lines(`${stepNo}. ${step.title}`,{size:11,bold:true,color:C.purple,max:86,leading:15});lines(step.action,{size:10,max:95,leading:14});lines('Outcome to aim for: '+step.outcome,{size:9,color:C.muted,max:99,leading:12});gap(8);}

 title('3. Your skill-by-skill development plan');
 for(const s of report.skillAssessments||[]){
  ensure(72);title(s.name||'Essential skill');
  labelled('WHAT THE TARGET ROLE NEEDS',s.targetBenchmark);
  labelled('YOUR ASSESSMENT RESULT',s.currentCompetency);
  labelled('WHAT TO BUILD FURTHER',s.gap);
  if(s.subskillsNeedingWork?.length)labelled('SPECIFIC TOPICS TO PRACTISE',s.subskillsNeedingWork.join('; '));
  if(s.subskillsNotTested?.length)labelled('NOT COVERED BY THIS ASSESSMENT',s.subskillsNotTested.join('; '));
  lines('DO THESE ACTIVITIES',{bold:true,color:C.purple,size:9});bulletList(s.actions);
  labelled('PRACTICAL EVIDENCE TASK',s.practiceTask);
  labelled('HOW TO KNOW YOU ARE IMPROVING',s.successIndicator);
  resources('Free learning',s.learning?.free);resources('Paid courses',s.learning?.paid);resources('Optional certifications',s.learning?.certifications);
  if(s.learning?.freeGap)lines(s.learning.freeGap,{size:9,color:C.muted});gap(9);
 }
 title('4. Other high-priority capabilities your goal may require');
 if(!report.additionalSkills?.length)lines('No additional role requirements were identified outside the essential skills tested.');
 for(const s of report.additionalSkills||[]){ensure(55);title(`${s.name} - Not tested`);labelled('WHAT IS EXPECTED',s.expectation);labelled('HOW TO BUILD IT',s.nextStep);labelled('HOW TO DEMONSTRATE IT',s.howToVerify);resources('Free resources',s.learning?.free?.slice(0,1));gap(6);}
 title('5. Your 30 / 60 / 90-day execution plan');
 const pref=report.learningPreferences;
 if(pref)lines(`Learning time: ${pref.weeklyHours} each week | Budget: ${pref.budget} | Learning style: ${pref.learningStyle}`,{size:9,color:C.muted});
 for(const p of report.actionPlan||[]){ensure(55);title(`${p.period}: ${p.focus}`);bulletList(p.actions);gap(4);}
 gap(10);lines('Important: these results show performance on a short multiple-choice assessment. They do not prove workplace experience or guarantee a job. Confirm course fees and eligibility with each provider before you enrol.',{size:9,color:C.muted,max:105,leading:13});
 flush();
 // Build a complete binary PDF with an embedded logo, brand-coloured page headers,
 // clickable resource links and correct byte offsets for JPEG streams.
 const objs=[null],add=body=>{objs.push(Buffer.isBuffer(body)?body:buffer(body));return objs.length-1;};
 const logo=Buffer.from(REPORT_BRAND_LOGO.jpegBase64,'base64');
 const catalog=add('');const root=add('');
 const regular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const logoObj=add(Buffer.concat([buffer(`<< /Type /XObject /Subtype /Image /Width ${REPORT_BRAND_LOGO.width} /Height ${REPORT_BRAND_LOGO.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`),logo,buffer('\nendstream')]));
 const kids=[];
 for(let i=0;i<pages.length;i++){
  const p=pages[i];const header=[`q ${C.lavender} rg 0 744 595 98 re f Q`,`q ${C.purple} rg 0 742 595 3 re f Q`,`q ${C.white} rg 36 766 167 55 re f Q`,`q 158 0 0 45 40 770 cm /Logo Do Q`,
   `BT /Bold 13 Tf ${C.navy} rg 1 0 0 1 213 794 Tm (Career Guide for) Tj ET`,`BT /Bold 13 Tf ${C.purple} rg 1 0 0 1 213 778 Tm (Professionals) Tj ET`,
   `BT /Regular 9 Tf ${C.muted} rg 1 0 0 1 213 763 Tm (by AI Early Career Guide) Tj ET`].join('\n');
  const footer=[`q ${C.purple} rg 43 54 509 0.7 re f Q`,`BT /Regular 8 Tf ${C.muted} rg 1 0 0 1 43 39 Tm (aiearlycareerguide.com/professionals) Tj ET`,
   `BT /Regular 8 Tf ${C.muted} rg 1 0 0 1 474 39 Tm (Page ${i+1} of ${pages.length}) Tj ET`].join('\n');
  const stream=header+'\n'+p.cmds.join('\n')+'\n'+footer;
  const pageStream=add(Buffer.concat([buffer(`<< /Length ${Buffer.byteLength(stream,'latin1')} >>\nstream\n`),buffer(stream),buffer('\nendstream')]));
  const annotations=[];
  for(const link of p.links){const url=link.url.replace(/[()\\\r\n]/g,c=>'\\'+c);annotations.push(`${add(`<< /Type /Annot /Subtype /Link /Rect [${link.rect.map(x=>Number(x).toFixed(1)).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${url}) >> >>`)} 0 R`);}
  const page=add(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /Regular ${regular} 0 R /Bold ${bold} 0 R >> /XObject << /Logo ${logoObj} 0 R >> >> /Contents ${pageStream} 0 R${annotations.length?` /Annots [${annotations.join(' ')}]`:''} >>`);
  kids.push(`${page} 0 R`);
 }
 objs[root]=buffer(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`);
 objs[catalog]=buffer(`<< /Type /Catalog /Pages ${root} 0 R >>`);
 const parts=[buffer('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')],offsets=[0];let offset=parts[0].length;
 for(let i=1;i<objs.length;i++){offsets.push(offset);const ob=Buffer.concat([buffer(`${i} 0 obj\n`),objs[i],buffer('\nendobj\n')]);parts.push(ob);offset+=ob.length;}
 const xref=offset;let trailer=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;
 for(let i=1;i<objs.length;i++)trailer+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 trailer+=`trailer\n<< /Size ${objs.length} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
 parts.push(buffer(trailer));return Buffer.concat(parts);
}

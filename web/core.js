export const PRESETS = {
  beginner:['White cross','White corners','Middle layer','Yellow cross','Match edges','Position corners','Twist corners'],
  cfop:['Cross','F2L','OLL','PLL'],
};
// Retain legacy wire fields for older devices; every solve has equal standing.
export const normalizeSolve=s=>({...s,trust:'confirmed',usedScramble:true});
export function splitProgress(solves,labels){
  const complete=solves.filter(s=>{
    if(s.deleted||s.penalty==='dnf'||!Number.isFinite(Date.parse(s.date))||!Number.isFinite(s.ms)||s.ms<=0||!Array.isArray(s.splits)||s.splits.length!==labels.length||!labels.length)return false;
    return s.splits.every((step,i)=>step?.name===labels[i]&&Number.isFinite(step.ms)&&step.ms>=0&&step.ms<=s.ms&&step.ms>=(s.splits[i-1]?.ms||0))&&s.splits.at(-1).ms===s.ms;
  }).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id));
  const series=labels.map((name,i)=>{
    let windowTotal=0;
    const points=complete.map((s,index)=>{
      // Saved marks are cumulative; a step's duration is the difference.
      const ms=s.splits[i].ms-(s.splits[i-1]?.ms||0);
      windowTotal+=ms;
      if(index>=5)windowTotal-=complete[index-5].splits[i].ms-(complete[index-5].splits[i-1]?.ms||0);
      return {id:s.id,date:s.date,ms,mean5:index>=4?windowTotal/5:null};
    });
    return {name,points};
  });
  const means=series.map(s=>s.points.length?s.points.reduce((sum,p)=>sum+p.ms,0)/s.points.length:null);
  let maxMs=0;for(const s of series)for(const p of s.points)maxMs=Math.max(maxMs,p.ms);
  return {count:complete.length,series,means,maxMs};
}
export function decodeCSV(buffer){const bytes=new Uint8Array(buffer);return new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8').decode(bytes);}
export function formatTime(ms){if(ms===Infinity)return 'DNF';if(ms===null||ms===undefined||!Number.isFinite(ms))return '—';const cs=Math.round(ms/10);return cs>=6000?`${Math.floor(cs/6000)}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`:`${Math.floor(cs/100)}.${String(cs%100).padStart(2,'0')}`;}
export function result(s){return s.penalty==='dnf'?Infinity:s.ms+(s.penalty==='+2'?2000:0);}
export function solveFeedback(solves,current){
  const eligible=s=>s&&!s.deleted&&['none','+2'].includes(s.penalty)&&Number.isFinite(s.ms)&&s.ms>0&&Number.isFinite(Date.parse(s.date));
  if(!eligible(current))return null;
  const order=(a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id);
  const prior=solves.filter(s=>eligible(s)&&s.id!==current.id&&order(s,current)<0).sort(order);
  const recent=prior.slice(-50).map(s=>({id:s.id,date:s.date,ms:result(s)})),value=result(current);
  const median=values=>{if(!values.length)return null;const a=[...values].sort((a,b)=>a-b);return(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2;};
  const best=prior.length?Math.min(...prior.map(result)):null,usual=median(recent.map(s=>s.ms));
  const recentRank=1+recent.filter(s=>s.ms<value).length,percent=recent.length?100*recent.filter(s=>s.ms>value).length/recent.length:null;
  const isPB=best!==null&&value<best;
  const labels=Array.isArray(current.splits)?current.splits.map(s=>s.name):[];
  const currentSteps=splitProgress([current],labels),previousSteps=currentSteps.count?splitProgress(prior,labels):null;
  const splits=currentSteps.count?labels.map((name,i)=>{
    const ms=currentSteps.series[i].points[0].ms,points=previousSteps.series[i].points;
    const baseline=median(points.slice(-50).map(p=>p.ms)),best=points.length?Math.min(...points.map(p=>p.ms)):null;
    return {name,ms,count:Math.min(points.length,50),median:baseline,delta:baseline===null?null:ms-baseline,best,isPB:best!==null&&ms<best,tone:best!==null&&ms<best?'gold':baseline!==null&&ms<baseline?'good':null};
  }):[];
  return {id:current.id,ms:value,median:usual,delta:usual===null?null:value-usual,best,pbDelta:best===null?null:value-best,isPB,tone:isPB?'gold':percent!==null&&percent>=80?'good':null,rank:1+prior.filter(s=>result(s)<value).length,count:prior.length+1,recentRank,percent,recent:[...recent].sort((a,b)=>a.ms-b.ms||a.id.localeCompare(b.id)),splits};
}
export function average(solves,n){if(solves.length<n)return null;const a=solves.slice(-n).map(result).sort((a,b)=>a-b),trim=Math.ceil(n*.05),kept=a.slice(trim,n-trim);return kept.some(v=>!Number.isFinite(v))?Infinity:kept.reduce((a,b)=>a+b,0)/kept.length;}
export function summary(solves){const a=solves.map(result).filter(Number.isFinite), sorted=[...a].sort((a,b)=>a-b);return {count:solves.length,best:a.length?Math.min(...a):null,mean:a.length?a.reduce((x,y)=>x+y,0)/a.length:null,median:a.length?(sorted[Math.floor((a.length-1)/2)]+sorted[Math.ceil((a.length-1)/2)])/2:null,sub60:a.filter(x=>x<60000).length,completed:a.length,ao5:average(solves,5),ao12:average(solves,12),ao100:average(solves,100)};}
export function stableId(text){let hash=14695981039346656037n;for(const c of text){hash^=BigInt(c.codePointAt(0));hash=BigInt.asUintN(64,hash*1099511628211n);}return 'csv-'+hash.toString(16);}
export function parseTime(value){const s=String(value).trim();if(!/^\d+(?::[0-5]\d){0,2}(?:\.\d{1,3})?$/.test(s))throw Error(`Invalid time: ${s}`);const ms=Math.round(s.split(':').reduce((a,b)=>a*60+Number(b),0)*1000);if(ms<=0 || ms>=86400000)throw Error(`Invalid time: ${s}`);return ms;}
export function parseDelimited(text){const first=text.replace(/^\uFEFF/,'').split(/\r?\n/).find(l=>/Date.*Time/i.test(l));if(!first)throw Error('No Date / Time header found. Use your timer CSV export.');const delimiter=first.includes('\t')?'\t':first.includes(';')?';':',';const start=text.indexOf(first);const rows=[];let row=[],field='',quoted=false;const s=text.slice(start).replace(/\r\n/g,'\n');for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}if(quoted)throw Error('Unclosed CSV quote');if(field||row.length){row.push(field);rows.push(row);}return rows;}
export function parseCSV(text){
  const rows=parseDelimited(text),head=rows.shift().map(x=>x.trim().normalize('NFKC').toLowerCase()),col=n=>head.indexOf(n);
  if(col('date')<0||col('time')<0)throw Error('The file needs Date and Time columns.');
  const truth=x=>/^(1|true|yes|x|dnf|\+2)$/i.test(String(x).trim()),now=Date.now();
  const solves=rows.map((row,i)=>{try{
    const dateText=row[col('date')].trim(),d=new Date(dateText.replace(' ','T'));
    if(!Number.isFinite(d.getTime()))throw Error('Invalid date');
    const ms=col('milliseconds')>=0&&row[col('milliseconds')]?Number(row[col('milliseconds')]):parseTime(row[col('time')]);
    if(!Number.isFinite(ms)||ms<=0||ms>=86400000)throw Error('Invalid time');
    const scramble=(row[col('scramble')]||'').trim(),date=d.toISOString(),id=row[col('id')]||stableId(date+'|'+ms+'|'+scramble);
    let splits=[];if(col('splits')>=0&&row[col('splits')])splits=JSON.parse(row[col('splits')]);
    if(!Array.isArray(splits)||splits.length>20||!splits.every((x,i,a)=>typeof x.name==='string'&&x.name.length<100&&Number.isFinite(x.ms)&&x.ms>=0&&x.ms<=ms&&(i===0||x.ms>=a[i-1].ms)))throw Error('Invalid step times');
    const note=row[col('note')]||'';
    if(id.length>=500||scramble.length>=2000||note.length>=2000)throw Error('A field is too long');
    return normalizeSolve({id,date,ms,scramble,penalty:truth(row[col('dnf')])?'dnf':truth(row[col('+2')])?'+2':'none',splits,note,source:'import',updatedAt:now});
  }catch(e){throw Error(`Data row ${i+1}: ${e.message}`);}}).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  return [...new Map(solves.map(s=>[s.id,s])).values()];
}
export function exportCSV(solves){const escape=s=>'"'+String(s??'').replaceAll('"','""')+'"';return [['Date','Time','DNF','+2','Scramble','Splits','Note','ID','Milliseconds'],...solves.map(s=>[s.date,formatTime(s.ms),s.penalty==='dnf'?'1':'',s.penalty==='+2'?'1':'',s.scramble,JSON.stringify(s.splits),s.note||'',s.id,s.ms])].map(row=>row.map(escape).join(',')).join('\r\n');}
export function practiceScramble(){const faces=['U','D','R','L','F','B'],suffix=['',"'",'2'];let last=-1,previous=-1,moves=[];for(let i=0;i<25;i++){let f;do{f=crypto.getRandomValues(new Uint32Array(1))[0]%6;}while(f===last || Math.floor(f/2)===Math.floor(last/2)&&Math.floor(f/2)===Math.floor(previous/2));moves.push(faces[f]+suffix[crypto.getRandomValues(new Uint32Array(1))[0]%3]);previous=last;last=f;}return moves.join(' ');}

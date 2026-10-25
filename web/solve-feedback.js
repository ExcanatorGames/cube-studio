import {formatTime} from './core.js';

export function formatDifference(ms){
  if(ms===0)return '±0.00s';
  return `${ms<0?'−':'+'}${(Math.abs(ms)/1000).toFixed(Math.abs(ms)<10?3:2)}s`;
}

export function initSolveFeedback(){
  const clock=document.querySelector('#clock'),card=document.querySelector('#timer-card'),message=document.querySelector('#solve-feedback'),pb=document.querySelector('#feedback-pb'),comparison=document.querySelector('#feedback-comparison');
  const ranking=document.querySelector('#solve-ranking'),count=document.querySelector('#ranking-count'),allTime=document.querySelector('#ranking-all-time'),track=document.querySelector('#ranking-track'),squares=document.querySelector('#ranking-squares'),marker=document.querySelector('#ranking-marker'),ends=document.querySelector('#ranking-ends');
  let current=null,renderedKey;
  function fit(){
    if(!current)return;
    message.hidden=current.delta===null&&!current.isPB;pb.hidden=!current.isPB;
    if(message.hidden)return;
    const splits=document.querySelector('#fullscreen-splits');
    let limit=ranking.getBoundingClientRect().top-8;
    if(innerWidth<=1100&&!splits.hidden)limit=Math.min(limit,splits.getBoundingClientRect().top-7);
    if(message.getBoundingClientRect().bottom>limit)pb.hidden=true;
    if(message.getBoundingClientRect().bottom>limit)message.hidden=true;
  }
  function render(data){
    // Sync can render the same result again while its entrance is still playing.
    const key=JSON.stringify(data);
    if(key===renderedKey){requestAnimationFrame(fit);return;}
    renderedKey=key;
    current=data;clock.classList.remove('solve-good','solve-gold');card.classList.toggle('has-solve-feedback',Boolean(data));
    message.hidden=!data;ranking.hidden=!data;
    if(!data)return;
    if(data.tone)clock.classList.add('solve-'+data.tone);
    pb.hidden=!data.isPB;pb.textContent=data.isPB?`Personal best · ${formatDifference(data.pbDelta)}`:'';
    comparison.hidden=data.delta===null;
    if(data.delta!==null){comparison.replaceChildren();const value=document.createElement('span');value.className='feedback-number'+(data.delta<0?' solve-good':'');value.textContent=formatDifference(data.delta);comparison.append(value,document.createTextNode(' vs recent median'));comparison.title=`Median ${formatTime(data.median)} from the previous ${data.recent.length} comparable completed solves. Total results include +2 penalties.`;}
    message.hidden=!data.isPB&&data.delta===null;
    const n=data.recent.length;count.textContent=n?`Previous ${n}`:'';allTime.textContent=`#${data.rank} / ${data.count}`;
    ranking.title='All-time rank among all completed solves up to this solve. Tied times share a rank.';
    track.hidden=!n;ends.hidden=!n;track.style.maxWidth=(n*10+Math.max(0,n-1)*3)+'px';squares.replaceChildren();squares.style.setProperty('--solve-count',n||1);
    for(const solve of data.recent){const square=document.createElement('span');square.title=`${formatTime(solve.ms)} · ${new Date(solve.date).toLocaleString()}`;square.setAttribute('aria-hidden','true');squares.append(square);}
    marker.className='ranking-marker'+(data.tone?' '+data.tone:'');marker.style.left=(n?(data.recentRank-1)/n*100:0)+'%';
    track.setAttribute('aria-label',`${n} previous completed solves sorted fastest to slowest. This solve ranks ${data.recentRank} of ${n+1} including the current solve; all-time ${data.rank} of ${data.count}.`);
    requestAnimationFrame(fit);
  }
  addEventListener('resize',fit);
  const observer=new ResizeObserver(()=>requestAnimationFrame(fit));
  for(const selector of ['.timer-center','#fullscreen-splits'])observer.observe(document.querySelector(selector));
  return {render,fit};
}

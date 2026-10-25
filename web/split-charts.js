const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seconds=ms=>(ms/1000).toFixed(2)+'s';

export function initSplitCharts({openSolve}){
  const root=document.querySelector('#split-trend-charts'),count=document.querySelector('#split-progress-count');
  let progress={count:0,series:[],maxMs:0};

  function scale(){
    const maximum=Math.max(1,progress.maxMs/1000),rawStep=maximum/3,power=10**Math.floor(Math.log10(rawStep));
    const step=[1,2,5,10].find(n=>n>=rawStep/power)*power;
    return {step,top:Math.ceil(maximum/step)*step};
  }
  function graph(series,width){
    const points=series.points,w=width,h=232,left=54,right=14,top=16,bottom=50,{step,top:maximum}=scale();
    const x=i=>points.length===1?(left+w-right)/2:left+i/(points.length-1)*(w-left-right);
    const y=ms=>h-bottom-ms/1000/maximum*(h-top-bottom);
    let svg=`<svg viewBox="0 0 ${w} ${h}" role="group" aria-label="${esc(series.name)} split times in seconds by solve number, oldest to newest. All split graphs share the same scale."><g aria-hidden="true">`;
    for(let value=0;value<=maximum+step/100;value+=step){
      const yy=y(value*1000),label=Number(value.toPrecision(3));
      svg+=`<line class="split-grid-line" x1="${left}" x2="${w-right}" y1="${yy}" y2="${yy}"/><text x="${left-9}" y="${yy+4}" text-anchor="end">${label}s</text>`;
    }
    const line=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(2)} ${y(p.ms).toFixed(2)}`).join(' ');
    let mean='';
    points.forEach((p,i)=>{if(p.mean5!==null)mean+=`${mean?' L':'M'}${x(i).toFixed(2)} ${y(p.mean5).toFixed(2)}`;});
    svg+=`<path class="split-raw-line" d="${line}"/><path class="split-mean-line" d="${mean}"/>`;
    points.forEach((p,i)=>{if(p.mean5!==null)svg+=`<circle class="split-mean-dot" cx="${x(i)}" cy="${y(p.mean5)}" r="2.5"/>`;});
    if(points.length===1)svg+=`<text x="${x(0)}" y="${h-26}" text-anchor="middle">#1</text>`;
    else svg+=`<text x="${left}" y="${h-26}">#1</text><text x="${w-right}" y="${h-26}" text-anchor="end">#${points.length}</text>`;
    svg+=`<text x="${(left+w-right)/2}" y="${h-6}" text-anchor="middle">Solve</text>`;
    svg+='</g>';
    points.forEach((p,i)=>{
      const label=`Solve #${i+1} · ${series.name}: ${seconds(p.ms)} · ${new Date(p.date).toLocaleString()}${p.mean5===null?'':` · Mean 5: ${seconds(p.mean5)}`}. Open solve.`;
      svg+=`<circle class="split-point" data-split-point="${i}" cx="${x(i)}" cy="${y(p.ms)}" r="4" tabindex="0" role="button" aria-label="${esc(label)}"/>`;
    });
    return svg+'</svg>';
  }
  function draw(){
    root.querySelectorAll('.split-trend-plot').forEach(plot=>{
      const width=Math.floor(plot.clientWidth),series=progress.series[Number(plot.dataset.seriesIndex)];
      if(width<1||!series?.points.length||plot.dataset.drawnWidth===String(width))return;
      plot.innerHTML=graph(series,width);plot.dataset.drawnWidth=String(width);
    });
  }
  function pointFor(element){
    const plot=element.closest('.split-trend-plot'),series=progress.series[Number(plot?.dataset.seriesIndex)];
    return {series,point:series?.points[Number(element.dataset.splitPoint)],card:element.closest('.split-trend-card')};
  }
  function showTooltip(element){
    const {point,card}=pointFor(element);if(!point||!card)return;
    const tooltip=card.querySelector('.split-trend-tooltip');
    tooltip.textContent=`Solve #${Number(element.dataset.splitPoint)+1} · ${new Date(point.date).toLocaleString()} · ${seconds(point.ms)}${point.mean5===null?'':` · Mean 5: ${seconds(point.mean5)}`}`;
    tooltip.hidden=false;element.setAttribute('aria-describedby',tooltip.id);
  }
  function hideTooltip(element){
    element.closest('.split-trend-card')?.querySelector('.split-trend-tooltip')?.setAttribute('hidden','');
    element.removeAttribute('aria-describedby');
  }
  root.addEventListener('pointerover',e=>{const p=e.target.closest('[data-split-point]');if(p)showTooltip(p);});
  root.addEventListener('pointerout',e=>{const p=e.target.closest('[data-split-point]');if(p&&p!==document.activeElement)hideTooltip(p);});
  root.addEventListener('focusin',e=>{const p=e.target.closest('[data-split-point]');if(p)showTooltip(p);});
  root.addEventListener('focusout',e=>{const p=e.target.closest('[data-split-point]');if(p)hideTooltip(p);});
  root.addEventListener('click',e=>{const p=e.target.closest('[data-split-point]');if(p){const {point}=pointFor(p);if(point)openSolve(point.id);}});
  root.addEventListener('keydown',e=>{
    const p=e.target.closest('[data-split-point]');if(!p||!['Enter',' '].includes(e.key))return;
    e.preventDefault();const {point}=pointFor(p);if(point)openSolve(point.id);
  });
  new ResizeObserver(()=>requestAnimationFrame(draw)).observe(root);
  return function render(next){
    progress=next;
    count.textContent=`${next.count} ${next.count===1?'solve':'solves'}`;
    count.title='Completed solves with matching recorded splits';
    document.querySelector('#split-progress-legend').hidden=!next.count;
    document.querySelector('#split-mean-legend').hidden=next.count<5;
    if(!next.count){root.innerHTML='<div class="chart-card empty">No recorded splits for this method.</div>';return;}
    root.innerHTML=next.series.map((series,i)=>`<div class="chart-card split-trend-card"><div class="split-trend-heading"><h3>${esc(series.name)}</h3><strong title="Latest split" aria-label="Latest split: ${seconds(series.points.at(-1).ms)}">${seconds(series.points.at(-1).ms)}</strong></div><div class="split-trend-tooltip" id="split-tooltip-${i}" role="tooltip" hidden></div><div class="split-trend-plot" data-series-index="${i}"></div></div>`).join('');
    draw();
  };
}

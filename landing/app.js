const stages=[
  {title:'Spot the rising signal.',copy:'Kizashi watches news, search, and AI-answer trends, clusters them into themes, and scores each by momentum, opportunity, and the gap in what you’ve already published — then recommends the strongest.',label:'TRENDS',output:'A ranked board of themes worth writing about this week.',status:'Scored on news, search, and AI-search signals, with a deterministic recommendation.'},
  {title:'Turn a theme into a plan.',copy:'Add a recommended theme to this week’s plan and Kizashi builds a content package: a hub piece plus spokes — a fast take, a case study, a white paper, a checklist — each with a prompt pack and a calendar slot.',label:'PLAN',output:'A complete content package, not a lonely blog post.',status:'Prompt packs, a fact sheet, and a style guide keep drafts accurate and on brand.'},
  {title:'Ship the piece.',copy:'Draft with the prompt packs, run cross-model review, then publish to your site. Mark the hub and each spoke as posted — with the live links kept against the plan.',label:'PUBLISH',output:'Published pieces, tracked against the plan that produced them.',status:'A human writes and approves every piece; Kizashi handles the workflow around it.'},
  {title:'See what actually worked.',copy:'GA4 traffic and leads flow back per piece, scored against similar work, with GEO results and a weekly “fix these” shortlist. What performed teaches the board which themes to recommend next.',label:'RESULTS',output:'Traffic and leads tied back to the signal that started each piece.',status:'The loop closes on its own — the board gets smarter every week.'}
];
let currentStep=0;const flowTabs=[...document.querySelectorAll('.flow-tab')];
function showStep(n){
  currentStep=Math.max(0,Math.min(stages.length-1,n));
  const stage=stages[currentStep];
  for(const [id,key] of [['flow-title','title'],['flow-copy','copy'],['flow-label','label'],['flow-output','output'],['flow-status','status']])document.getElementById(id).textContent=stage[key];
  flowTabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===currentStep));tab.tabIndex=i===currentStep?0:-1});
  document.getElementById('flow-panel').setAttribute('aria-labelledby','flow-tab-'+currentStep);
  document.getElementById('flow-count').textContent='Step '+(currentStep+1)+' of '+stages.length;
  document.getElementById('flow-prev').disabled=currentStep===0;
  document.getElementById('flow-next').disabled=currentStep===stages.length-1;
  const p=document.getElementById('flow-panel');p.classList.remove('changed');void p.offsetWidth;p.classList.add('changed');
}
flowTabs.forEach((tab,i)=>{
  tab.addEventListener('click',()=>showStep(i));
  tab.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
    const next=e.key==='Home'?0:e.key==='End'?flowTabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+flowTabs.length)%flowTabs.length;
    showStep(next);flowTabs[next].focus();
  });
});
document.getElementById('flow-prev').addEventListener('click',()=>showStep(currentStep-1));
document.getElementById('flow-next').addEventListener('click',()=>showStep(currentStep+1));
showStep(0);

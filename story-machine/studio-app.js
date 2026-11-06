(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE = { projects: 'shortclipr-demo-projects-v1', credits: 'shortclipr-demo-credits-v2' };
  const labels = { overview:'CONTROL ROOM / OVERVIEW', create:'CREATION DESK / NEW FILM', projects:'ARCHIVE / PROJECTS', screening:'SCREENING ROOM / REAL CLIPS', credits:'ACCOUNT / RENDER TIME', admin:'ADMIN / MEDIA DESK' };
  const typeArt = {
    'Animated explainer':'animated-explainer','Comparisons & visual facts':'comparisons-visual-facts','Historical story':'historical-story','Maps & geography':'maps-geography','Space & scale journey':'space-scale-journey','What-if simulation':'what-if-simulation','Myth-busting experiment':'myth-busting-experiment','News & event recap':'news-event-recap','Character comedy':'character-comedy','Mini story or fable':'mini-story-fable','Mystery & suspense':'mystery-suspense','Horror short':'horror-short','Animated conversation':'animated-conversation','Quiz & visual puzzle':'quiz-visual-puzzle','Sports tactics':'sports-tactics','Architecture transformation':'architecture-transformation'
  };
  const libraries = {
    learn: [
      ['Animated explainer','A clear idea, brought to life.','A→B'],['Comparisons & visual facts','Make the difference visible.','VS'],['Historical story','A past moment with momentum.','19'],['Maps & geography','A journey drawn in motion.','↗'],['Space & scale journey','From tiny to impossible.','∞'],['What-if simulation','Turn a question into a world.','IF'],['Myth-busting experiment','Test the claim on screen.','✓'],['News & event recap','Make the moment understandable.','NOW']
    ],
    story: [
      ['Character comedy','Timing, contrast and a good turn.','HA'],['Mini story or fable','A complete world in a minute.','ONCE'],['Mystery & suspense','A clue worth following.','?'],['Horror short','Tension hiding in plain sight.','!'],['Animated conversation','Two voices, one sharp idea.','“ ”']
    ],
    engage: [
      ['Quiz & visual puzzle','A question viewers need to solve.','? !'],['Sports tactics','Make the play easy to see.','↗'],['Architecture transformation','Before becomes after.','▱']
    ]
  };
  const demoProjects = [
    {id:'demo-1', title:'Why the moon appears in daylight', type:'Animated explainer', format:'9:16', duration:30, status:'in-production', date:'Today, 10:42', cost:48},
    {id:'demo-2', title:'The city that moved uphill', type:'Historical story', format:'9:16', duration:45, status:'complete', date:'Yesterday', cost:72},
    {id:'demo-3', title:'Can you spot the impossible shadow?', type:'Quiz & visual puzzle', format:'1:1', duration:15, status:'draft', date:'Oct 30', cost:24}
  ];
  const specimenMedia = [
    {id:'specimen-1',title:'One Night. No Moon.',department:'story',format:'9:16',description:'A cinematic specimen for the screening-room layout.',specimen:true,color:'#c6b7ec'},
    {id:'specimen-2',title:'How Far Is Forever?',department:'learn',format:'9:16',description:'A scale-journey specimen waiting to be replaced by a real export.',specimen:true,color:'#cdd9b0'},
    {id:'specimen-3',title:'The Last Red Door',department:'story',format:'1:1',description:'A suspense specimen used to demonstrate the reel.',specimen:true,color:'#ff8d68'}
  ];
  let state = {
    route:'overview', library:'learn', type:'Animated explainer', style:'AI Auto', duration:15, format:'9:16', projectStatus:'all', search:'', media:[], urls:[]
  };

  function getProjects(){ try { return JSON.parse(localStorage.getItem(STORAGE.projects)) || demoProjects; } catch { return demoProjects; } }
  function setProjects(items){ localStorage.setItem(STORAGE.projects, JSON.stringify(items)); }
  function getCredits(){ try { return JSON.parse(localStorage.getItem(STORAGE.credits)) || {total:15,used:0}; } catch { return {total:15,used:0}; } }
  function setCredits(value){ localStorage.setItem(STORAGE.credits, JSON.stringify(value)); }
  function formatRenderTime(seconds){ return `${Number(seconds).toLocaleString()} sec`; }
  function departmentName(key){ return {learn:'Learn & explain',story:'Story & spectacle',engage:'Engage & transform'}[key] || key; }
  function escapeHTML(value=''){ const node=document.createElement('div'); node.textContent=value; return node.innerHTML; }
  function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),3200); }

  function navigate(route){
    if(!labels[route]) route='overview';
    state.route=route;
    $$('.studio-page').forEach(page => page.hidden = page.dataset.page !== route);
    $$('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route && link.closest('.rail-nav')));
    $('#page-breadcrumb').textContent=labels[route];
    $('.rail').classList.remove('open');
    window.scrollTo({top:0,behavior:'auto'});
    if(route==='screening' || route==='admin') refreshMedia();
    if(route==='projects') renderProjects();
    if(route==='credits') renderCredits();
  }
  function routeFromHash(){ navigate(location.hash.slice(1) || 'overview'); }

  function renderTypes(){
    $('#type-grid').replaceChildren(...libraries[state.library].map((item,index)=>{
      const button=document.createElement('button');
      button.type='button'; button.className='type-card'+(state.type===item[0]?' selected':'');
      button.innerHTML=`<img class="clip-type-art" src="/clip-types/${typeArt[item[0]]}.jpg" alt="" aria-hidden="true" loading="lazy"><span>${String(index+1).padStart(2,'0')} / ${escapeHTML(state.library.toUpperCase())}</span><b>${escapeHTML(item[0])}</b><small>${escapeHTML(item[1])}</small>`;
      button.setAttribute('aria-pressed',String(state.type===item[0]));
      button.addEventListener('click',()=>{ state.type=item[0]; $('#video-type').value=item[0]; renderTypes(); updateEstimate(); });
      return button;
    }));
  }
  function updateEstimate(){
    const cost=state.duration;
    $('#estimated-cost').textContent=formatRenderTime(cost);
    return cost;
  }

  function projectRow(project){
    const row=document.createElement('article'); row.className='project-row';
    const statusLabel=project.status==='in-production'?'In production':project.status[0].toUpperCase()+project.status.slice(1);
    row.innerHTML=`<div class="project-thumb">${escapeHTML(project.type.slice(0,2).toUpperCase())}</div><div class="project-title"><b>${escapeHTML(project.title)}</b><small>${escapeHTML(project.type)}</small></div><div class="project-cell">${escapeHTML(project.format)}<small>${project.duration} sec</small></div><div class="project-cell">${escapeHTML(project.date)}<small>Last updated</small></div><div><span class="status-pill ${escapeHTML(project.status)}">${statusLabel}</span></div><button class="row-more" aria-label="Project actions">•••</button>`;
    return row;
  }
  function renderProjects(){
    let projects=getProjects();
    const overview=$('#overview-projects'); overview.replaceChildren(...projects.slice(0,3).map(projectRow));
    if(!projects.length) overview.innerHTML='<div class="empty-row">No productions yet. Open the creation desk to start one.</div>';
    const filtered=projects.filter(p=>(state.projectStatus==='all'||p.status===state.projectStatus)&&(!state.search||`${p.title} ${p.type}`.toLowerCase().includes(state.search)));
    const all=$('#all-projects'); all.replaceChildren(...filtered.map(projectRow));
    if(!filtered.length) all.innerHTML='<div class="empty-row">Nothing matches this view.</div>';
  }
  function renderCredits(){
    const credits=getCredits(); const remaining=Math.max(0,credits.total-credits.used); const ratio=credits.total?remaining/credits.total*100:0;
    ['#rail-credits','#credit-remaining','#ledger-remaining'].forEach(sel=>$(sel).textContent=formatRenderTime(remaining));
    ['#credit-used','#ledger-used'].forEach(sel=>$(sel).textContent=formatRenderTime(credits.used));
    ['#credit-total','#ledger-total'].forEach(sel=>$(sel).textContent=formatRenderTime(credits.total));
    ['#rail-credit-fill','#credit-meter-fill','#ledger-meter'].forEach(sel=>$(sel).style.width=`${ratio}%`);
    const projects=getProjects();
    $('#usage-list').replaceChildren(...projects.slice(0,7).map((p,index)=>{
      const item=document.createElement('div'); item.className='usage-item';
      item.innerHTML=`<span>${String(index+1).padStart(2,'0')}</span><div><b>${escapeHTML(p.title)}</b><small>${escapeHTML(p.date)} · ${escapeHTML(p.type)}</small></div><strong>−${formatRenderTime(p.cost||0)}</strong>`; return item;
    }));
  }

  const db = {
    open(){ return new Promise((resolve,reject)=>{ const request=indexedDB.open('shortclipr-studio-media',1); request.onupgradeneeded=()=>request.result.createObjectStore('clips',{keyPath:'id'}); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); }); },
    async all(){ const database=await this.open(); return new Promise((resolve,reject)=>{ const req=database.transaction('clips').objectStore('clips').getAll(); req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.createdAt-a.createdAt)); req.onerror=()=>reject(req.error); }); },
    async put(item){ const database=await this.open(); return new Promise((resolve,reject)=>{ const req=database.transaction('clips','readwrite').objectStore('clips').put(item); req.onsuccess=resolve; req.onerror=()=>reject(req.error); }); },
    async remove(id){ const database=await this.open(); return new Promise((resolve,reject)=>{ const req=database.transaction('clips','readwrite').objectStore('clips').delete(id); req.onsuccess=resolve; req.onerror=()=>reject(req.error); }); }
  };
  function clearUrls(){ state.urls.forEach(URL.revokeObjectURL); state.urls=[]; }
  function blobUrl(blob){ if(!blob) return ''; const url=URL.createObjectURL(blob); state.urls.push(url); return url; }
  function mediaView(item){ return {...item,videoUrl:blobUrl(item.videoBlob),posterUrl:blobUrl(item.posterBlob)}; }
  function posterStyle(item){ return item.posterUrl?`background-image:url('${item.posterUrl}')`:`background-color:${item.color||({learn:'#cdd9b0',story:'#c6b7ec',engage:'#ff8d68'}[item.department])}`; }
  function openVideo(item){
    if(item.specimen){ toast('This is a layout specimen. Upload a real clip from the admin media desk.'); return; }
    const dialog=$('#video-dialog'); const video=$('video',dialog); video.src=item.videoUrl; $('span',dialog.querySelector('div')).textContent=`${departmentName(item.department)} / ${item.format}`; $('h2',dialog).textContent=item.title; $('p',dialog).textContent=item.description||''; dialog.showModal(); video.play().catch(()=>{});
  }
  function makeVideoCard(item){
    const button=document.createElement('button'); button.className='video-card'; button.type='button';
    button.innerHTML=`<div class="video-poster" style="${posterStyle(item)}"><span class="play-mini">▶</span></div><div><b>${escapeHTML(item.title)}</b><small>${escapeHTML(departmentName(item.department).toUpperCase())} · ${escapeHTML(item.format)}${item.specimen?' · SPECIMEN':''}</small></div>`;
    button.addEventListener('click',()=>openVideo(item)); return button;
  }
  function renderShowcase(){
    const published=state.media.filter(item=>item.published).map(mediaView); const content=published.length?published:specimenMedia;
    const featured=published.find(item=>item.featured)||content[0];
    const stage=$('#premiere-stage');
    stage.innerHTML=`<div class="premiere-visual" style="${posterStyle(featured)}"><button class="play-button" type="button" aria-label="Play ${escapeHTML(featured.title)}">▶</button></div><div class="premiere-info"><span>${featured.specimen?'LAYOUT SPECIMEN':'STUDIO PREMIERE'} / ${escapeHTML(featured.format)}</span><h2>${escapeHTML(featured.title)}</h2><p>${escapeHTML(featured.description||'A finished ShortClipr production.')}</p><div class="premiere-meta"><span>${escapeHTML(departmentName(featured.department).toUpperCase())}</span><span>${featured.specimen?'REPLACE IN ADMIN':'REAL UPLOAD'}</span></div></div>`;
    $('.play-button',stage).addEventListener('click',()=>openVideo(featured));
    $('#latest-reel').replaceChildren(...content.map(makeVideoCard));
    const departments=[['learn','01','LEARN & EXPLAIN','Ideas made visible.'],['story','02','STORY & SPECTACLE','Worlds built for attention.'],['engage','03','ENGAGE & TRANSFORM','Clips that invite action.']];
    $('#department-shelves').replaceChildren(...departments.map(([key,num,title,copy])=>{ const count=published.filter(m=>m.department===key).length; const card=document.createElement('article'); card.className='department-card'; card.innerHTML=`<span>${num} / ${count} PUBLISHED</span><h3>${title}</h3><p>${copy}</p><b>${num}</b>`; return card; }));
    const stack=$('#overview-screening'); stack.replaceChildren(...content.slice(0,3).map(item=>{ const card=document.createElement('button'); card.type='button'; card.className='stack-card'; card.style.cssText=posterStyle(item); card.innerHTML=`<span>${item.specimen?'SPECIMEN':'REAL CLIP'} / ${escapeHTML(item.format)}</span><i>▶</i><b>${escapeHTML(item.title)}</b>`; card.addEventListener('click',()=>openVideo(item)); return card; }));
  }
  function renderAdmin(){
    const list=$('#admin-media-list'); $('#media-count').textContent=`${state.media.length} clip${state.media.length===1?'':'s'}`;
    if(!state.media.length){ list.innerHTML='<div class="admin-empty"><b>THE SHELF IS EMPTY.</b>Upload the first real clip using the form.</div>'; return; }
    list.replaceChildren(...state.media.map(raw=>{ const item=mediaView(raw); const row=document.createElement('article'); row.className='admin-media-item'; row.innerHTML=`<div class="admin-media-thumb" style="${posterStyle(item)}">▶</div><div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(departmentName(item.department))} · ${escapeHTML(item.format)} · ${item.published?'Published':'Draft'}${item.featured?' · Premiere':''}</p></div><div class="admin-media-actions"><button type="button" data-action="play">Play</button><button type="button" data-action="publish">${item.published?'Unpublish':'Publish'}</button><button type="button" class="danger" data-action="delete">Delete</button></div>`;
      $('[data-action=play]',row).addEventListener('click',()=>openVideo(item));
      $('[data-action=publish]',row).addEventListener('click',async()=>{ raw.published=!raw.published; await db.put(raw); toast(raw.published?'Clip published.':'Clip moved to drafts.'); refreshMedia(); });
      $('[data-action=delete]',row).addEventListener('click',async()=>{ if(confirm(`Delete “${raw.title}” from this local media library?`)){ await db.remove(raw.id); toast('Clip deleted from local media.'); refreshMedia(); } });
      return row;
    }));
  }
  async function refreshMedia(){ try{ clearUrls(); state.media=await db.all(); renderShowcase(); renderAdmin(); } catch(error){ console.error(error); toast('Local media storage is unavailable in this browser.'); } }

  function wireEvents(){
    addEventListener('hashchange',routeFromHash);
    $$('[data-route]').forEach(link=>link.addEventListener('click',event=>{ const route=link.dataset.route; if(location.hash===`#${route}`){ event.preventDefault(); navigate(route); } }));
    $('.menu-button').addEventListener('click',()=>$('.rail').classList.add('open'));
    $('.rail-close').addEventListener('click',()=>$('.rail').classList.remove('open'));
    $$('[data-library]').forEach(button=>button.addEventListener('click',()=>{ state.library=button.dataset.library; $$('[data-library]').forEach(other=>other.setAttribute('aria-selected',String(other===button))); if(!libraries[state.library].some(type=>type[0]===state.type)){ state.type=libraries[state.library][0][0]; $('#video-type').value=state.type; } renderTypes(); updateEstimate(); }));
    $$('.choice-row').forEach(group=>$$('.choice',group).forEach(button=>button.addEventListener('click',()=>{ $$('.choice',group).forEach(other=>other.classList.toggle('active',other===button)); const kind=group.dataset.choice; state[kind]=kind==='duration'?Number(button.dataset.value):button.dataset.value; updateEstimate(); })));
    $('#brief').addEventListener('input',event=>$('#brief-count').textContent=event.target.value.length.toLocaleString());
    $('#creation-form').addEventListener('submit',event=>{ event.preventDefault(); const cost=updateEstimate(); const credits=getCredits(); const remaining=credits.total-credits.used; if(cost>remaining){ toast('Not enough render time for this production.'); return; } const brief=$('#brief').value.trim(); const title=brief.split(/[.!?\n]/)[0].slice(0,72)||'Untitled production'; const project={id:crypto.randomUUID(),title,type:state.type,format:state.format,duration:state.duration,status:'in-production',date:'Just now',cost}; const projects=getProjects(); projects.unshift(project); setProjects(projects); credits.used+=cost; setCredits(credits); renderProjects(); renderCredits(); event.target.reset(); $('#brief-count').textContent='0'; toast('Production queued. The final video will appear in My Projects when the render service is connected.'); location.hash='projects'; });
    $$('.filter-row button').forEach(button=>button.addEventListener('click',()=>{ $$('.filter-row button').forEach(other=>other.classList.toggle('active',other===button)); state.projectStatus=button.dataset.status; renderProjects(); }));
    $('#project-search').addEventListener('input',event=>{ state.search=event.target.value.trim().toLowerCase(); renderProjects(); });
    $('#media-video').addEventListener('change',event=>{ const file=event.target.files[0]; $('#video-file-label').textContent=file?file.name:'Drop or choose the final video'; $('#video-drop').classList.toggle('has-file',!!file); });
    $('#media-poster').addEventListener('change',event=>{ const file=event.target.files[0]; $('#poster-file-label').textContent=file?file.name:'Optional poster image'; event.target.closest('.file-drop').classList.toggle('has-file',!!file); });
    $('#upload-form').addEventListener('submit',async event=>{ event.preventDefault(); const video=$('#media-video').files[0]; if(!video) return; const item={id:crypto.randomUUID(),title:$('#media-title').value.trim(),department:$('#media-department').value,format:$('#media-format').value,description:$('#media-description').value.trim(),videoBlob:video,posterBlob:$('#media-poster').files[0]||null,published:$('#media-published').checked,featured:$('#media-featured').checked,createdAt:Date.now()}; if(item.featured){ const all=await db.all(); await Promise.all(all.filter(x=>x.featured).map(x=>db.put({...x,featured:false}))); } try{ await db.put(item); event.target.reset(); $('#video-file-label').textContent='Drop or choose the final video'; $('#poster-file-label').textContent='Optional poster image'; $$('.file-drop').forEach(el=>el.classList.remove('has-file')); toast(item.published?'Real clip published to the screening room.':'Clip saved as a draft.'); await refreshMedia(); } catch(error){ console.error(error); toast('The browser could not store this file. Try a smaller clip.'); } });
    $('.dialog-close').addEventListener('click',()=>$('#video-dialog').close());
    $('#video-dialog').addEventListener('close',()=>{ const video=$('video',$('#video-dialog')); video.pause(); video.removeAttribute('src'); video.load(); });
    addEventListener('keydown',event=>{ if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){ event.preventDefault(); location.hash='projects'; setTimeout(()=>$('#project-search').focus(),50); } });
  }

  renderTypes(); renderProjects(); renderCredits(); updateEstimate(); wireEvents(); routeFromHash(); refreshMedia();
})();

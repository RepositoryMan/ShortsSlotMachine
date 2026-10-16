const $ = (id) => document.getElementById(id);
const THEMES = [
 {id:'neon',name:'Neon Casino',price:0,icon:'👑',swatch:'#d62bff',desc:'Glowing lights, big drama, classic casino energy.'},
 {id:'retro',name:'Retro Arcade',price:50,icon:'🕹️',swatch:'#ff9b32',desc:'Pixel vibes, arcade colors, and old-school chaos.'},
 {id:'space',name:'Space Station',price:75,icon:'🪐',swatch:'#48dfff',desc:'Cosmic colors for intergalactic bad decisions.'},
 {id:'cyber',name:'Cyberpunk',price:100,icon:'🌃',swatch:'#ff3d9a',desc:'Glitches, electric neon, and future regret.'},
 {id:'forest',name:'Forest Cabin',price:125,icon:'🌲',swatch:'#68e69b',desc:'Cozy woods. Uncozy financial outcomes.'},
 {id:'meme',name:'Meme Madness',price:150,icon:'🤡',swatch:'#ff4bd8',desc:'Maximum nonsense. Zero dignity.'}
];
// Add videos in videos.json. This file is the site's editable video pool; no API key needed.
const VIDEO_POOL_URL = './videos.json';
const DEMO = [
 ['Dog discovers mirror 😂','https://www.youtube.com/watch?v=ysz5S6PUM-U'],['The most chaotic moment','https://www.youtube.com/watch?v=jfKfPfyJRdk'],['Internet lore unlocked','https://www.youtube.com/watch?v=ScMzIvxBSi4'],['Bro thought he cooked','https://www.youtube.com/watch?v=aqz-KE-bpKQ'],['Absolutely no context','https://www.youtube.com/watch?v=EngW7tLk6R8'],['Certified bruh moment','https://www.youtube.com/watch?v=LXb3EKWsInQ']
].map(([title,url],i)=>({id:'demo'+i,title,url,thumb:`https://i.ytimg.com/vi/${url.split('v=')[1]}/hqdefault.jpg`}));
let state = loadState(); let videos=[]; let sessionVideos=[]; let spinning=false; let soundOn=false; let audioCtx=null; let warmedPlayers=new Map(); let spinsSinceReroll=0;
// Preloaded Image objects are kept for the lifetime of the page so reel spins reuse cached covers.
const thumbnailCache = new Map();
const THUMB_QUALITIES = ['hqdefault.jpg','mqdefault.jpg','default.jpg'];
const JERMA_FACES = [1,2,3,4,5].map(n => `./jerma-faces/jerma-${n}.svg`);
function fallbackFace(v){ const rec=thumbnailCache.get(v.id); if(rec?.fallback) return rec.fallback; const chosen=JERMA_FACES[Math.floor(Math.random()*JERMA_FACES.length)]; if(rec) rec.fallback=chosen; return chosen; }
function loadState(){try{const s=JSON.parse(localStorage.getItem('shortsSlotSave')||'{}');return{balance:Number.isFinite(s.balance)?s.balance:100,owned:Array.isArray(s.owned)?[...new Set(['neon',...s.owned])]:['neon'],theme:THEMES.some(t=>t.id===s.theme)?s.theme:'neon',lastWin:Number(s.lastWin)||0,};}catch{return{balance:100,owned:['neon'],theme:'neon',lastWin:0}}}
function save(){localStorage.setItem('shortsSlotSave',JSON.stringify(state));}
function money(n){return '$'+Math.floor(n).toLocaleString('en-US')}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function setStatus(s){$('status').textContent=s}
function updateBalance(){ $('balance').textContent=money(state.balance);$('storeBalance').textContent=money(state.balance);$('lastWin').textContent=state.lastWin?money(state.lastWin):'—';save();renderThemes();}
function currentTheme(){return THEMES.find(t=>t.id===state.theme)||THEMES[0]}
function renderThemes(){
 $('ownedThemes').innerHTML=THEMES.filter(t=>state.owned.includes(t.id)).map(t=>`<div class="theme-item ${t.id===state.theme?'active':''}"><span class="theme-swatch" style="--swatch:${t.swatch}">${t.icon}</span><div class="theme-meta"><b>${t.name}</b><small>${t.id===state.theme?'CURRENT THEME':'OWNED'}</small></div><button data-equip="${t.id}" ${t.id===state.theme?'disabled':''}>${t.id===state.theme?'ON':'USE'}</button></div>`).join('');
 $('themeStore').innerHTML=THEMES.map(t=>{const owned=state.owned.includes(t.id);return `<article class="store-card" style="--swatch:${t.swatch}"><div class="store-art"><span>${t.icon}</span></div><div class="store-card-body"><h3>${t.name}</h3><p>${t.desc}</p><button data-buy="${t.id}" ${owned?'disabled':''} class="${!owned&&state.balance<t.price?'cant-afford':''}">${owned?(t.id===state.theme?'✓ EQUIPPED':'✓ OWNED'):'BUY · '+money(t.price)}</button></div></article>`}).join('');
}
function thumbnailCandidates(v){
 const explicit = v.thumb && !/maxresdefault\.jpg/i.test(v.thumb) ? [v.thumb] : [];
 return [...explicit, ...THUMB_QUALITIES.map(q=>`https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/${q}`)];
}
function preloadThumbnail(v){
 if(thumbnailCache.has(v.id)) return thumbnailCache.get(v.id);
 const record={url:'',ready:false,failed:false}; thumbnailCache.set(v.id,record);
 const tryNext=(urls)=>{
   if(!urls.length){record.failed=true;return;}
   const url=urls[0], img=new Image();
   img.onload=()=>{
     // YouTube sometimes serves a tiny grey 120x90 placeholder instead of firing onerror.
     if(img.naturalWidth<=120 && img.naturalHeight<=90){tryNext(urls.slice(1));return;}
     record.url=url;record.image=img;record.ready=true;
   };
   img.onerror=()=>tryNext(urls.slice(1)); img.src=url;
 };
 tryNext(thumbnailCandidates(v)); return record;
}
function cardHTML(v, playing=false){
 if(playing){const embed='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(v.id)+'?autoplay=1&mute=0&playsinline=1&controls=0&disablekb=1&rel=0&loop=1&playlist='+encodeURIComponent(v.id);return `<div class="reel-card playing"><iframe src="${escapeAttr(embed)}" title="${escapeAttr(v.title||'YouTube Short')}" loading="eager" allow="autoplay; encrypted-media; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><div class="reel-title">${escapeHTML(v.title||'Now playing')}</div></div>`}
 const cached=preloadThumbnail(v); const src=cached.url || thumbnailCandidates(v)[0] || fallbackFace(v);
 return `<div class="reel-card"><img data-video-id="${escapeAttr(v.id)}" src="${escapeAttr(src)}" alt="" loading="eager" decoding="async" onload="checkThumbnail(this)" onerror="thumbnailError(this)"><div class="reel-title">${escapeHTML(v.title||'Mystery Short')}</div></div>`;
}
function checkThumbnail(img){if(img.naturalWidth<=120&&img.naturalHeight<=90)thumbnailError(img)}
function thumbnailError(img){
 const v=videos.find(x=>x.id===img.dataset.videoId)||DEMO.find(x=>x.id===img.dataset.videoId);
 if(!v){img.style.display='none';img.parentElement.classList.add('thumbnail-missing');return;}
 const candidates=thumbnailCandidates(v); const current=img.src; const idx=candidates.findIndex(u=>current.includes(u)); const next=candidates[idx+1];
 if(next){img.src=next;return;}
 img.onerror=null; img.onload=null; img.src=fallbackFace(v); img.parentElement.classList.add('jerma-fallback');
}
function escapeHTML(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function escapeAttr(s=''){return escapeHTML(s)}
function fillReels(){const pool=sessionVideos.length?sessionVideos:(videos.length?videos:DEMO);for(let i=0;i<3;i++){const chosen=shuffle(pool).slice(0,Math.min(pool.length,8));$('reel'+i).innerHTML=chosen.map(v=>cardHTML(v, false)).join('');$('reel'+i).style.transform='translateY(0px)';}}
function chooseSessionVideos(){const source=videos.length?videos:DEMO;sessionVideos=shuffle(source).slice(0,Math.min(12,source.length));sessionVideos.forEach(preloadThumbnail);return sessionVideos;}
function warmPlayer(v){
 const existing=warmedPlayers.get(v.id); if(existing && existing.isConnected)return existing;
 const host=$('playerPrewarm'); if(!host)return null;
 const frame=document.createElement('iframe');
 frame.title=v.title||'YouTube Short'; frame.loading='eager'; frame.allow='autoplay; encrypted-media'; frame.referrerPolicy='strict-origin-when-cross-origin';
 frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(v.id)+'?autoplay=1&mute=1&playsinline=1&controls=0&disablekb=1&rel=0&loop=1&playlist='+encodeURIComponent(v.id)+'&enablejsapi=1&origin='+encodeURIComponent(location.origin);
 host.appendChild(frame); warmedPlayers.set(v.id,frame);
 // Keep only the currently prepared players to avoid accumulating hidden iframes.
 while(host.children.length>3){const old=host.firstElementChild;for(const [id,node] of warmedPlayers){if(node===old)warmedPlayers.delete(id)}old.remove()}
 return frame;
}
function playerCommand(frame, func, args=[]){
 try{frame.contentWindow?.postMessage(JSON.stringify({event:'command',func,args}), 'https://www.youtube-nocookie.com');}catch{}
}
function playingCard(v, frame){
 const card=document.createElement('div');card.className='reel-card playing';
 const player=frame||document.createElement('iframe');
 if(!frame){player.title=v.title||'YouTube Short';player.loading='eager';player.allow='autoplay; encrypted-media';player.referrerPolicy='strict-origin-when-cross-origin';player.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(v.id)+'?autoplay=1&mute=1&playsinline=1&controls=0&disablekb=1&rel=0&loop=1&playlist='+encodeURIComponent(v.id)+'&enablejsapi=1&origin='+encodeURIComponent(location.origin);}
 player.removeAttribute('style');player.tabIndex=-1;player.setAttribute('aria-label','Playing Short');card.appendChild(player);const title=document.createElement('div');title.className='reel-title';title.textContent=v.title||'Now playing';card.appendChild(title);
 // The player was allowed to initialize silently during the spin. Unmute it after it is visible.
 const activate=()=>{playerCommand(player,'unMute');playerCommand(player,'setVolume',[100]);};player.addEventListener('load',activate,{once:true});setTimeout(activate,150);setTimeout(activate,700);return card;
}
async function fetchShorts(){
 setStatus('Loading the Shorts pool…');$('rerollBtn').disabled=true;
 try{
   const response=await fetch(VIDEO_POOL_URL+'?v='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw new Error('Could not load videos.json ('+response.status+').');
   const data=await response.json();
   const entries=Array.isArray(data)?data:(Array.isArray(data.videos)?data.videos:[]);
   const normalized=entries.map((entry,i)=>{
     const raw=typeof entry==='string'?entry:(entry.url||entry.id||'');
     const match=String(raw).match(/(?:youtube\.com\/(?:shorts\/|embed\/|watch\?v=)|youtu\.be\/)([\w-]{6,})/);
     const id=match?match[1]:String(raw).match(/^[\w-]{6,}$/)?.[0];
     if(!id)return null;
     const title=typeof entry==='object'&&entry.title?entry.title:'Short #'+(i+1);
     return {id,title,url:'https://www.youtube.com/shorts/'+id,thumb:typeof entry==='object'&&entry.thumb?entry.thumb:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'};
   }).filter(Boolean);
   videos=[...new Map(normalized.map(v=>[v.id,v])).values()];
   if(!videos.length)throw new Error('videos.json has no valid YouTube URLs.');
   videos=shuffle(videos);chooseSessionVideos();spinsSinceReroll=0;fillReels();setStatus(`${sessionVideos.length} Shorts ready`);$('message').textContent=`Picked ${sessionVideos.length} Shorts for this session. Covers are preloading; new picks are available with RE-ROLL SHORTS.`;
 }catch(e){videos=shuffle(DEMO);chooseSessionVideos();fillReels();setStatus('Demo fallback');$('message').textContent='Could not load videos.json: '+e.message+' Showing demo reels instead.'}
 finally{$('rerollBtn').disabled=false}
}
function makeAudio(freq=440,duration=.08,type='sine'){if(!soundOn)return;try{audioCtx ||= new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.06,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch{}}
function reelHeight(strip){const card=strip.querySelector('.reel-card');return card?card.getBoundingClientRect().height+parseFloat(getComputedStyle(strip).gap||9):220}
function pickPayout(finalVideos){const ids=finalVideos.map(v=>v.id);const counts={};ids.forEach(id=>counts[id]=(counts[id]||0)+1);const max=Math.max(...Object.values(counts));if(max===3)return 500;if(max===2)return 25;return 0}
function randomSymbol(){const r=Math.random();return r<.025?'crown':r<.12?'fire':r<.32?'laugh':r<.63?'video':r<.82?'lucky':'skull'}
function symbolEmoji(s){return({crown:'👑',fire:'🔥',laugh:'😂',video:'🎬',lucky:'✨',skull:'💀'})[s]||'🎬'}
function confetti(){for(let i=0;i<45;i++){const el=document.createElement('i');el.className='confetti';el.style.left=Math.random()*100+'vw';el.style.background=[currentTheme().swatch,'#ffd166','#fff','#35e6ff'][i%4];el.style.animationDelay=Math.random()*.6+'s';document.body.append(el);setTimeout(()=>el.remove(),2500)}}
async function spin(){
 if(spinning)return;
 if(state.balance<10){$('message').textContent='💸 BROKE. Buy no themes. Spin no reels. Refreshing will not save you.';setStatus('Wallet empty');return}
 spinning=true;$('spinBtn').disabled=true;$('rerollBtn').disabled=true;state.balance-=10;state.lastWin=0;updateBalance();$('message').classList.remove('win');$('message').textContent='Spinning the algorithm…';$('resultLabel').textContent='ROLLING…';$('payoutDisplay').textContent='—';$('machine').classList.add('spinning');makeAudio(190,.12,'sawtooth');
 const pool=sessionVideos.length?sessionVideos:(videos.length?videos:DEMO);
 const finalVideos=[0,1,2].map(()=>pool[Math.floor(Math.random()*pool.length)]);
 // Start the three winning players loading silently during the reel animation, then move
 // those same iframe elements into place instead of paying the full startup cost afterward.
 const warmedFrames=finalVideos.map(v=>warmPlayer(v));
 const strips=[0,1,2].map(i=>$('reel'+i));
 // Keep the animation lightweight: fewer DOM cards, no blur filter, no interval timers,
 // and no YouTube iframes competing for CPU/network while the reels move.
 const promises=strips.map((strip,i)=>new Promise(resolve=>{
   const h=reelHeight(strip);const filler=Array.from({length:8},()=>pool[Math.floor(Math.random()*pool.length)]);const tail=shuffle(pool).slice(0,2);const all=[...filler,finalVideos[i],...tail];
   strip.innerHTML=all.map(v=>cardHTML(v,false)).join('');strip.style.transition='none';strip.style.transform='translate3d(0,0,0)';strip.offsetHeight;const target=-(h*8);const delay=750+i*420;
   requestAnimationFrame(()=>{strip.style.transition=`transform ${delay}ms cubic-bezier(.08,.7,.12,1)`;strip.style.transform=`translate3d(0,${target}px,0)`});
   setTimeout(()=>{strip.style.transition='none';strip.replaceChildren(playingCard(finalVideos[i],warmedFrames[i]));strip.style.transform='translate3d(0,0,0)';resolve()},delay+40);
 }));
 await Promise.all(promises);const payout=pickPayout(finalVideos);state.balance+=payout;state.lastWin=payout;updateBalance();$('payoutDisplay').textContent=money(payout);$('resultLabel').textContent=payout?'PAYOUT CONFIRMED':'BETTER LUCK NEXT TIME';$('machine').classList.remove('spinning');if(payout){$('message').textContent=`${payout===500?'👑 SAME SHORT THREE TIMES. JACKPOT. ABSOLUTE CINEMA.':'▶ MATCHING SHORTS! THE ALGORITHM BLESSES YOU.'} +${money(payout)}`;$('message').classList.add('win');$('machine').classList.add('winner');setTimeout(()=>$('machine').classList.remove('winner'),1400);confetti();makeAudio(660,.22)}else{$('message').textContent='▣ ▣ ▣ — no matching Shorts. The algorithm has spoken.';makeAudio(110,.2,'triangle')}
 spinning=false;$('spinBtn').disabled=false;$('rerollBtn').disabled=false;spinsSinceReroll++;if(spinsSinceReroll>=2 && videos.length>sessionVideos.length){chooseSessionVideos();spinsSinceReroll=0;setStatus('Fresh Shorts loaded');$('message').textContent+='  ↻ The Shorts pool refreshed for your next spins.';}else{setStatus(payout?'Winner winner, Short dinner':'Ready for another spin');}
}
function buyTheme(id){const t=THEMES.find(x=>x.id===id);if(!t)return;if(state.owned.includes(id)){state.theme=id;document.body.dataset.theme=id;save();renderThemes();return}if(state.balance<t.price){$('message').textContent=`Not enough fake cash for ${t.name}. You need ${money(t.price-state.balance)} more.`;return}state.balance-=t.price;state.owned.push(id);state.theme=id;document.body.dataset.theme=id;updateBalance();$('message').textContent=`✨ ${t.name} unlocked. New look, same questionable odds.`;makeAudio(540,.18);}
$('spinBtn').addEventListener('click',spin);$('rerollBtn').addEventListener('click',()=>{if(spinning)return;chooseSessionVideos();spinsSinceReroll=0;fillReels();setStatus(`${sessionVideos.length} Shorts ready`);$('message').textContent='Picked a fresh set of Shorts. Covers are being cached.';});$('settingsBtn').addEventListener('click',()=>{$('settingsDialog').showModal()});$('soundBtn').addEventListener('click',()=>{soundOn=!soundOn;$('soundBtn').textContent='♫  SOUND: '+(soundOn?'ON':'OFF');if(soundOn)makeAudio(500,.1)});document.addEventListener('click',e=>{const buy=e.target.closest('[data-buy]');if(buy)buyTheme(buy.dataset.buy);const equip=e.target.closest('[data-equip]');if(equip)buyTheme(equip.dataset.equip)});
document.body.dataset.theme=state.theme;updateBalance();fillReels();fetchShorts();

/* caption-clash/app.js */
// Simple client-side implementation of Caption Clash for a static site.
// Stores state in localStorage. Designed to be drop-in for Chuckle Court GitHub Pages site.

const STORAGE_KEY = 'cc_caption_clash_v1';
const IMAGES_KEY = 'cc_caption_images_v1';
const state = {
  players: [],
  currentImage: null,
  captions: [],
  votes: {},
  settings: {
    alwaysCaption: false,
    allowEdgy: false,
    profanityLevel: 'strict'
  }
};

// Basic profanity/blocked words list (not exhaustive). Expand as needed.
const blockedWords = ['slur1','slur2','hateword']; // placeholders; user should replace with real blocked terms
const mildBad = ['damn','crap','shit','bastard'];

function saveImagesList(list){localStorage.setItem(IMAGES_KEY, JSON.stringify(list));}
function loadImagesList(){try{return JSON.parse(localStorage.getItem(IMAGES_KEY))||[];}catch(e){return []}}

function saveState(){localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}
function loadState(){try{const s=JSON.parse(localStorage.getItem(STORAGE_KEY));if(s){Object.assign(state,s)} }catch(e){}
}

// UI refs
const hostModeCb = document.getElementById('hostMode');
const hostControls = document.getElementById('hostControls');
const alwaysCaptionCb = document.getElementById('alwaysCaption');
const allowEdgyCb = document.getElementById('allowEdgy');
const profanityLevelSel = document.getElementById('profanityLevel');
const addImageBtn = document.getElementById('addImageBtn');
const imageUrlInput = document.getElementById('imageUrlInput');
const imageNsfwCb = document.getElementById('imageNsfw');
const playerNameInput = document.getElementById('playerNameInput');
const joinBtn = document.getElementById('joinBtn');
const playersList = document.getElementById('playersList');
const startRoundBtn = document.getElementById('startRoundBtn');
const timerInput = document.getElementById('timerInput');

const lobby = document.getElementById('lobby');
const roundSection = document.getElementById('round');
const roundImage = document.getElementById('roundImage');
const timeLeftEl = document.getElementById('timeLeft');
const captionInput = document.getElementById('captionInput');
const submitCaptionBtn = document.getElementById('submitCaptionBtn');
const captionStatus = document.getElementById('captionStatus');
const captionsList = document.getElementById('captionsList');
const votingSection = document.getElementById('voting');
const resultSection = document.getElementById('result');
const winnerText = document.getElementById('winnerText');
const newRoundBtn = document.getElementById('newRoundBtn');

let roundTimer = null;
let roundEndsAt = null;
let imagePool = [];

// Initialize
loadState();
imagePool = loadImagesList();
if(imagePool.length===0){
  // seed with safe placeholder images (picsum) - public placeholder images
  imagePool = [
    {id:'p1',url:'https://picsum.photos/id/237/800/500',tags:['animal','dog'],nsfw:false,source:'picsum'},
    {id:'p2',url:'https://picsum.photos/id/1025/800/500',tags:['landscape'],nsfw:false,source:'picsum'},
    {id:'p3',url:'https://picsum.photos/id/1005/800/500',tags:['people'],nsfw:false,source:'picsum'}
  ];
  saveImagesList(imagePool);
}

function renderPlayers(){
  playersList.innerHTML='';
  state.players.forEach(p=>{
    const li=document.createElement('li');li.textContent=p;playersList.appendChild(li);
  });
}

hostModeCb.addEventListener('change',()=>{
  hostControls.style.display = hostModeCb.checked ? 'block' : 'none';
});

alwaysCaptionCb.addEventListener('change',()=>{state.settings.alwaysCaption = alwaysCaptionCb.checked; saveState();});
allowEdgyCb.addEventListener('change',()=>{state.settings.allowEdgy = allowEdgyCb.checked; saveState();});
profanityLevelSel.addEventListener('change',()=>{state.settings.profanityLevel = profanityLevelSel.value; saveState();});

addImageBtn.addEventListener('click',()=>{
  const url = imageUrlInput.value.trim();
  if(!url) return alert('Paste a valid image URL');
  const id = 'u'+Date.now();
  imagePool.push({id,url,tags:[],nsfw:imageNsfwCb.checked,source:'import'});
  saveImagesList(imagePool);
  imageUrlInput.value='';imageNsfwCb.checked=false;alert('Image added to local image pool');
});

joinBtn.addEventListener('click',()=>{
  const name = playerNameInput.value.trim();
  if(!name) return alert('Enter your name');
  if(!state.players.includes(name)) state.players.push(name);
  playerNameInput.value='';saveState();renderPlayers();
});

startRoundBtn.addEventListener('click',()=>{
  if(state.players.length===0) return alert('At least one player should join.');
  startRound(Number(timerInput.value)||60);
});

function pickImage(){
  // pick a random image, respect NSFW/allowEdgy
  const pool = imagePool.filter(im=>{if(im.nsfw && !state.settings.allowEdgy) return false; return true;});
  if(pool.length===0) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}

function startRound(seconds=60){
  state.captions = []; state.votes = {};
  const img = pickImage();
  if(!img) return alert('No images available for the current settings. Add images or enable edgy in Host Controls.');
  state.currentImage = img; saveState();
  // show round UI
  roundImage.src = img.url; roundSection.style.display='block';
  votingSection.style.display='none'; resultSection.style.display='none'; lobby.style.display='none';
  captionInput.value=''; captionStatus.textContent='';
  let timeLeft = seconds; timeLeftEl.textContent = timeLeft; roundEndsAt = Date.now() + seconds*1000;
  if(roundTimer) clearInterval(roundTimer);
  roundTimer = setInterval(()=>{
    const t = Math.max(0, Math.ceil((roundEndsAt - Date.now())/1000));
    timeLeftEl.textContent = t;
    if(t<=0){
      clearInterval(roundTimer); endCaptionPhase();
    }
  },250);
}

function containsBlocked(text){
  const lower = text.toLowerCase();
  for(const b of blockedWords){ if(b && lower.includes(b)) return true; }
  if(state.settings.profanityLevel==='strict'){
    for(const b of mildBad){ if(lower.includes(b)) return true; }
  }
  return false;
}

async function runExternalModeration(text){
  // Placeholder: if you have a moderation API, expose a server endpoint at /api/moderate
  // This client calls it if available. The endpoint should return {allow: boolean, reason?:string, score?:number}
  try{
    const res = await fetch('/api/moderate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});
    if(!res.ok) return {allow:true};
    const j = await res.json(); return j;
  }catch(e){return {allow:true};}
}

submitCaptionBtn.addEventListener('click', async ()=>{
  const text = captionInput.value.trim();
  const player = state.players[0] || 'Player'; // for demo: first player is the current user
  if(!text) return alert('Write a caption first');
  if(state.captions.find(c=>c.player===player)) return alert('One caption per player this round');
  // local profanity check
  if(containsBlocked(text)){
    captionStatus.textContent = 'Caption rejected by local profanity filter.'; return;
  }
  // optional external moderation
  const mod = await runExternalModeration(text);
  if(mod && mod.allow===false){ captionStatus.textContent = 'Caption rejected by moderation.'; return; }
  // store caption
  const id = 'c'+Date.now();
  state.captions.push({id,player,text,votes:0,anonId: 'a'+Math.random().toString(36).slice(2,8)});
  saveState(); captionStatus.textContent='Caption submitted'; captionInput.value='';
});

function endCaptionPhase(){
  // move to voting
  roundSection.style.display='none'; votingSection.style.display='block'; renderCaptionsForVoting();
}

function renderCaptionsForVoting(){
  captionsList.innerHTML='';
  // shuffle captions
  const arr = state.captions.slice();
  for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
  arr.forEach(c=>{
    const li=document.createElement('li');
    const t=document.createElement('div');t.textContent=c.text; li.appendChild(t);
    const voteBtn=document.createElement('button');voteBtn.textContent='Vote';voteBtn.addEventListener('click',()=>{ castVote(c.id); });
    li.appendChild(voteBtn);captionsList.appendChild(li);
  });
  // if no captions, skip to result
  if(arr.length===0){ showResult(null); }
}

function castVote(captionId){
  // for demo: each click counts as a distinct vote (no voter tracking). In real app, tie to voter id
  const cap = state.captions.find(c=>c.id===captionId); if(!cap) return;
  cap.votes = (cap.votes||0)+1; saveState();
  // after voting, we show results immediately in this demo
  showResult();
}

function showResult(){
  votingSection.style.display='none'; resultSection.style.display='block';
  if(state.captions.length===0){ winnerText.textContent = 'No captions submitted this round.'; return; }
  // pick winner by votes, tiebreaker random
  let max = Math.max(...state.captions.map(c=>c.votes||0));
  const top = state.captions.filter(c=>c.votes===max);
  const winner = top[Math.floor(Math.random()*top.length)];
  winnerText.innerHTML = `Winner: <strong>${escapeHtml(winner.player)}</strong> — "${escapeHtml(winner.text)}" (${winner.votes} votes)`;
}

newRoundBtn.addEventListener('click',()=>{
  // if alwaysCaption is true and host enabled, just start next round
  if(state.settings.alwaysCaption){ startRound(Number(timerInput.value)||60); } else { resultSection.style.display='none'; lobby.style.display='block'; }
});

function escapeHtml(s){return s.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

// initial render
renderPlayers();
// load settings from state if present
if(state.settings){alwaysCaptionCb.checked = state.settings.alwaysCaption;allowEdgyCb.checked = state.settings.allowEdgy; profanityLevelSel.value = state.settings.profanityLevel||'strict';}

// Expose some helpers for debugging in console
window.cc = {state,saveState,loadState,images:imagePool,saveImagesList};


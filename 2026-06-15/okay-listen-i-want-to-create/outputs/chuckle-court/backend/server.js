// backend/server.js
// Simple Express backend for Caption Clash (development/demo only)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Filter = require('bad-words');

const DB_PATH = path.join(__dirname, 'db.json');
function loadDB(){
  if(!fs.existsSync(DB_PATH)){
    const seed = { images: [
      { id: 'p1', url: 'https://picsum.photos/id/237/800/500', tags: ['animal','dog'], nsfw: false, source: 'picsum' },
      { id: 'p2', url: 'https://picsum.photos/id/1025/800/500', tags: ['landscape'], nsfw: false, source: 'picsum' },
      { id: 'p3', url: 'https://picsum.photos/id/1005/800/500', tags: ['people'], nsfw: false, source: 'picsum' }
    ], captions: [], settings: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(seed,null,2));
    return seed;
  }
  try{ return JSON.parse(fs.readFileSync(DB_PATH,'utf8')); }catch(e){ return {images:[],captions:[],settings:{}} }
}
function saveDB(db){ fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2)); }

const app = express();
app.use(cors());
app.use(bodyParser.json());

const filter = new Filter();
let db = loadDB();

// GET images
app.get('/api/images', (req,res)=>{
  res.json(db.images);
});

// POST add image {url, nsfw, tags, source}
app.post('/api/images', (req,res)=>{
  const { url, nsfw=false, tags=[], source='import' } = req.body;
  if(!url) return res.status(400).json({error:'url required'});
  const id = 'i'+Date.now();
  const img = { id, url, nsfw, tags, source };
  db.images.push(img); saveDB(db);
  res.json(img);
});

// GET current image: optional ?allowEdgy=true
app.get('/api/minigame/current-image', (req,res)=>{
  const allowEdgy = req.query.allowEdgy === 'true';
  const pool = db.images.filter(im=>{ if(im.nsfw && !allowEdgy) return false; return true; });
  if(pool.length===0) return res.status(404).json({error:'no images available'});
  const img = pool[Math.floor(Math.random()*pool.length)];
  res.json(img);
});

// POST /api/moderate {text}
app.post('/api/moderate', (req,res)=>{
  const { text } = req.body; if(!text) return res.status(400).json({error:'text required'});
  const isProfane = filter.isProfane(text);
  // Note: this is a local filter only. For production, integrate a stronger moderation API.
  if(isProfane) return res.json({allow:false,reason:'profanity detected'});
  return res.json({allow:true});
});

// POST /api/minigame/caption {image_id, player_id, text}
app.post('/api/minigame/caption', (req,res)=>{
  const { image_id, player_id, text } = req.body;
  if(!image_id || !player_id || !text) return res.status(400).json({error:'image_id, player_id, text required'});
  // moderate
  if(filter.isProfane(text)) return res.status(400).json({error:'caption failed moderation (profanity)'});
  const id = 'c'+Date.now();
  const cap = { id, image_id, player_id, text, votes:0, created_at: new Date().toISOString() };
  db.captions.push(cap); saveDB(db);
  return res.json(cap);
});

// GET /api/minigame/captions?image_id=...
app.get('/api/minigame/captions', (req,res)=>{
  const image_id = req.query.image_id; if(!image_id) return res.status(400).json({error:'image_id required'});
  const caps = db.captions.filter(c=>c.image_id===image_id);
  res.json(caps);
});

// POST /api/minigame/vote {caption_id, voter_id}
app.post('/api/minigame/vote', (req,res)=>{
  const { caption_id } = req.body; if(!caption_id) return res.status(400).json({error:'caption_id required'});
  const cap = db.captions.find(c=>c.id===caption_id); if(!cap) return res.status(404).json({error:'caption not found'});
  cap.votes = (cap.votes||0)+1; saveDB(db); res.json({ok:true,caption:cap});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{ console.log(`Caption Clash backend listening on port ${PORT}`); console.log(`DB path: ${DB_PATH}`); });

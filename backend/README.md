Backend for Caption Clash (feature/caption-clash)

This folder contains a minimal Express backend to support the Caption Clash minigame for development.

Files
- server.js - Express server with endpoints for images, captions, moderation, and voting
- db.json - simple JSON 'database' used by the server
- package.json - dependencies and start script

How to run (locally)
1. cd backend
2. npm install
3. npm start
4. Server will run on http://localhost:3000 by default.

Endpoints
- GET /api/images
- POST /api/images {url, nsfw, tags, source}
- GET /api/minigame/current-image?allowEdgy=true
- POST /api/moderate {text}
- POST /api/minigame/caption {image_id, player_id, text}
- GET /api/minigame/captions?image_id=...
- POST /api/minigame/vote {caption_id}

Notes
- Moderation uses the "bad-words" package (local filter). For production, integrate OpenAI moderation or Perspective API.
- DB is a simple JSON file for demo. Replace with Postgres or another DB for production.

Caption Clash — Implementation Notes

I implemented a client-side version of the Caption Clash minigame and added it to the feature/caption-clash branch.

What I added in the branch
- caption-clash/ : static client-side minigame (index.html, style.css, app.js, images.json, README)
- docs/caption_clash.md : this file (integration notes, how to wire server-side moderation, how to import images)

Why client-side?
- The repository appears to be a GitHub Pages static site (JavaScript). To avoid introducing a backend or server components in this initial change, I implemented a fully client-side playable minigame using localStorage.

How to make it a full multi-player production feature
1) Backend endpoints (suggested):
   - GET /api/minigame/current-image
   - POST /api/minigame/caption
   - GET /api/minigame/captions?image_id=...
   - POST /api/minigame/vote
   - POST /api/admin/images (upload/import)
   - POST /api/moderate {text} -> returns {allow:boolean,reason}
2) Persistence: store images, captions, players, votes in a DB (Postgres recommended).
3) Real-time: add WebSocket or server-sent events to broadcast new captions/votes.
4) Moderation: integrate OpenAI / Perspective / other moderation API and store offensive_score per caption.

Safety & licensing
- I seeded images from picsum.photos (placeholder public images). Replace with meme templates you own or verified license.
- I did NOT add copyrighted or potentially hateful images.
- "Allow edgy" is implemented but caption moderation must be enforced on the backend for safety.

Next actions I can take (pick one):
- Implement a Node/Express backend and wire the static frontend to it (I can add server code to the repo or create a separate service).
- Convert client-side storage to persistent storage via a simple JSON-backed serverless function (GitHub Actions / Netlify functions).
- Update images.json with a vetted set of meme templates you provide.

If you want the full server-backed integration (end-to-end) I will implement the backend in Node/Express, add migrations and endpoints, and update the frontend to call the API. Tell me and I'll add server files in the branch.


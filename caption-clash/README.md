Caption Clash (client-side)

This folder contains a self-contained, client-side implementation of the Caption Clash minigame for Chuckle Court.

What it includes
- index.html — the playable page (host controls, join, start round, caption input, voting, results).
- style.css — basic styling to match Chuckle Court look.
- app.js — all game logic stored in localStorage. Includes:
  - Host toggles: Always caption rounds, Allow edgy content (opt-in)
  - Admin image upload (adds images to localStorage image pool)
  - Caption submission, client-side moderation (simple profanity check), anonymized voting, winner selection
- images.json — seed list of safe placeholder images (picsum.photos). Replace with your chosen templates.

How it works
- This is a static, client-side implementation designed to run on GitHub Pages without a backend.
- State (players, images added by admin, captions) is stored in the browser's localStorage only.
- For production: consider adding a backend to persist game state, enable server-side moderation, and support real-time play between multiple players.

Moderation
- The implementation contains a tiny local profanity check and a placeholder function runExternalModeration() which attempts to POST to /api/moderate if you provide an API endpoint.
- For stricter moderation, integrate OpenAI moderation or Google's Perspective API on the server and have /api/moderate forward requests.

Adding images to the repo
- The admin UI in the page adds images to localStorage for testing. To add persistent images to the repo, use the tools/import_images.js script in the branch (or manually edit caption-clash/images.json and commit to the repo).

Next steps to fully integrate with Chuckle Court
- If you have a backend, implement endpoints for: submit caption, list captions, vote, moderation, persistent images, and host controls.
- Add user authentication / player IDs, and associate captions with real user IDs.
- Add WebSocket or server-sent events for real-time multi-player updates.

Safety note
- "Allow edgy" toggles only permit images marked NSFW in the local image pool; caption moderation still blocks locally configured bad words. Do NOT allow hostile/hateful content targeting protected classes. Implement server-side moderation for production.


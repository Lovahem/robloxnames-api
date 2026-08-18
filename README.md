# RobloxNames v3 — Tracker

This version adds a NameMC-style tracker view plus live Roblox profile linking.

## Features
- Tracker table with name, drop-time/estimate field, and RobloxNames search count.
- Length/search filters.
- Live check of each tracked username against Roblox.
- Clicking a tracked username opens its Roblox profile when the name currently resolves to a user.
- `/api/user?username=` resolves a username to user ID, display name, creation date, ban state and avatar headshot.
- `/api/history?userId=` uses Roblox's public username-history endpoint.
- `/api/search?q=` provides Roblox user search results.
- CORS is enabled so the API can be called from a Neocities frontend.

## Deploy
`npm install`
`npm start`

On Render:
Build command: `npm install`
Start command: `npm start`

## Important tracker note
Roblox does not provide an official future "drop time" for usernames. The tracker therefore treats `dropAt` as our own observation/estimate field. A real NameMC-style drop tracker needs a scheduled worker that repeatedly checks tracked names, records status transitions, and calculates estimates.

The current `data/tracker.json` contains demo names so the UI has something to show immediately.

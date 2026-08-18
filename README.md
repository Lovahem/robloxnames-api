# RobloxNames v2 — live checker

This version is a real Node/Express app, not a static mockup.

## Run locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

The backend exposes `/api/check?username=qz_` and proxies the request to Roblox's username validation service.

### Security
- No Roblox password is requested.
- No `.ROBLOSECURITY` cookie is requested, stored, or accepted.
- The checker keeps only a short 30-second in-memory cache.
- The birthday value is sent only as a validation input; this app does not create accounts.

### Important
Roblox can rate-limit or change its validation service. If that happens, the UI reports an error rather than pretending a name is available.

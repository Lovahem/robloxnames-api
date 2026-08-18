import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({limit:"20kb"}));
app.use(express.static(path.join(__dirname,"public")));

const cache = new Map();
const CACHE_MS = 30_000;

function classifyRoblox(data) {
  // Roblox's validator uses data/status information. Keep the raw response
  // available to the frontend because Roblox can change validation codes.
  const message = String(data?.message || data?.errors?.[0]?.message || "").toLowerCase();
  const userFacing = String(data?.errors?.[0]?.userFacingMessage || "").toLowerCase();
  const text = `${message} ${userFacing}`;

  if (text.includes("already in use") || text.includes("taken") || text.includes("unavailable")) {
    return { status:"taken", label:"TAKEN" };
  }
  if (text.includes("appropriate") || text.includes("moderated") || text.includes("not appropriate")) {
    return { status:"invalid", label:"UNAVAILABLE" };
  }
  if (text.includes("valid")) {
    return { status:"available", label:"AVAILABLE" };
  }
  if (typeof data?.data === "number") {
    if (data.data === 0) return {status:"available",label:"AVAILABLE"};
    if (data.data === 1) return {status:"taken",label:"TAKEN"};
    return {status:"invalid",label:"UNAVAILABLE"};
  }
  return {status:"unknown",label:"UNKNOWN"};
}

app.get("/api/check", async (req,res)=>{
  const username = String(req.query.username || "").trim();
  if (!username) return res.status(400).json({error:"Enter a username."});
  if (username.length > 20) return res.status(400).json({error:"Roblox usernames cannot exceed 20 characters."});
  if (!/^[A-Za-z0-9_]+$/.test(username)) return res.status(400).json({error:"Only letters, numbers, and underscores are allowed."});

  const key = username.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now()-hit.time < CACHE_MS) return res.json(hit.value);

  try {
    // This is a public Roblox validation endpoint. No Roblox account cookie
    // or .ROBLOSECURITY token is ever accepted or stored by this app.
    const url = new URL("https://auth.roblox.com/v1/usernames/validate");
    url.searchParams.set("username", username);
    url.searchParams.set("birthday", "2000-01-01T00:00:00.000Z");
    url.searchParams.set("context", "Signup");

    const r = await fetch(url, {
      headers: {"Accept":"application/json","User-Agent":"RobloxNames/0.2 username checker"}
    });
    const data = await r.json().catch(()=>({}));

    if (r.status === 429) {
      return res.status(429).json({error:"Roblox rate-limited the checker. Try again in a moment.",retryAfter:30});
    }
    if (!r.ok && !data?.data && !data?.message && !data?.errors) {
      return res.status(502).json({error:"Roblox returned an unexpected response.",robloxStatus:r.status});
    }

    const result = classifyRoblox(data);
    const value = {
      username,
      ...result,
      checkedAt:new Date().toISOString(),
      source:"Roblox username validator",
      rawCode: typeof data?.data === "number" ? data.data : null
    };
    cache.set(key,{time:Date.now(),value});
    return res.json(value);
  } catch (err) {
    console.error(err);
    return res.status(502).json({error:"Could not reach Roblox right now."});
  }
});

app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT,()=>console.log(`RobloxNames running at http://localhost:${PORT}`));

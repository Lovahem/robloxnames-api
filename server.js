import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const TRACKER_FILE = path.join(__dirname, "data", "tracker.json");

app.use(express.json({limit:"50kb"}));
app.use((req,res,next)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname,"public")));

const cache = new Map();
const CACHE_MS = 20_000;

async function readTracker(){
  try{return JSON.parse(await fs.readFile(TRACKER_FILE,"utf8"))}
  catch{return []}
}
async function writeTracker(data){
  await fs.writeFile(TRACKER_FILE,JSON.stringify(data,null,2));
}
async function robloxJSON(url, options={}){
  const r = await fetch(url,{headers:{"Accept":"application/json","User-Agent":"RobloxNames/0.3",...(options.headers||{})},...options});
  const text = await r.text();
  let data={}; try{data=JSON.parse(text)}catch{}
  return {r,data};
}
function validateName(name){
  if(!name) return "Enter a username.";
  if(name.length>20) return "Roblox usernames cannot exceed 20 characters.";
  if(!/^[A-Za-z0-9_]+$/.test(name)) return "Only letters, numbers, and underscores are allowed.";
  return null;
}

function classifyValidation(data){
  const text=String(data?.message||data?.errors?.[0]?.message||data?.errors?.[0]?.userFacingMessage||"").toLowerCase();
  if(typeof data?.data==="number"){
    if(data.data===0)return {status:"available",label:"AVAILABLE"};
    if(data.data===1)return {status:"taken",label:"TAKEN"};
    return {status:"invalid",label:"UNAVAILABLE"};
  }
  if(/already in use|taken|unavailable/.test(text)) return {status:"taken",label:"TAKEN"};
  if(/appropriate|moderated|not appropriate/.test(text)) return {status:"invalid",label:"UNAVAILABLE"};
  if(/valid/.test(text)) return {status:"available",label:"AVAILABLE"};
  return {status:"unknown",label:"UNKNOWN"};
}

app.get("/api/check",async(req,res)=>{
  const username=String(req.query.username||"").trim();
  const error=validateName(username); if(error)return res.status(400).json({error});
  const key=username.toLowerCase(), hit=cache.get("check:"+key);
  if(hit&&Date.now()-hit.time<CACHE_MS)return res.json(hit.value);
  try{
    const u=new URL("https://auth.roblox.com/v1/usernames/validate");
    u.searchParams.set("username",username); u.searchParams.set("birthday","2000-01-01T00:00:00.000Z"); u.searchParams.set("context","Signup");
    const {r,data}=await robloxJSON(u);
    if(r.status===429)return res.status(429).json({error:"Roblox rate-limited the checker. Try again shortly."});
    const c=classifyValidation(data);
    const value={username,...c,checkedAt:new Date().toISOString(),rawCode:typeof data?.data==="number"?data.data:null};
    cache.set("check:"+key,{time:Date.now(),value}); res.json(value);
  }catch(e){console.error(e);res.status(502).json({error:"Could not reach Roblox."})}
});

app.get("/api/user",async(req,res)=>{
  const username=String(req.query.username||"").trim();
  const error=validateName(username); if(error)return res.status(400).json({error});
  const key=username.toLowerCase();
  try{
    const {r,data}=await robloxJSON("https://users.roblox.com/v1/usernames/users",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({usernames:[username],excludeBannedUsers:false})
    });
    if(!r.ok)return res.status(r.status).json({error:"Roblox user lookup failed.",robloxStatus:r.status});
    const found=(data.data||[])[0];
    const tracker=await readTracker();
    const entry=tracker.find(x=>x.name.toLowerCase()===key);
    if(entry){entry.searches=(entry.searches||0)+1; await writeTracker(tracker)}
    if(!found)return res.json({found:false,username,searches:entry?.searches||0});
    const id=found.id;
    const [detail,thumb]=await Promise.all([
      robloxJSON(`https://users.roblox.com/v1/users/${id}`),
      robloxJSON(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`)
    ]);
    const d=detail.data||found;
    const image=thumb.data?.data?.[0]?.imageUrl||null;
    res.json({
      found:true,id,username:d.name||found.name,displayName:d.displayName||found.displayName,
      created:d.created||null,description:d.description||"",banned:!!d.isBanned,
      avatar:image,profileUrl:`https://www.roblox.com/users/${id}/profile`,
      searches:entry?.searches||0
    });
  }catch(e){console.error(e);res.status(502).json({error:"Could not reach Roblox."})}
});

app.get("/api/search",async(req,res)=>{
  const q=String(req.query.q||"").trim(); if(q.length<1)return res.json({data:[]});
  try{
    const u=new URL("https://users.roblox.com/v1/users/search"); u.searchParams.set("keyword",q); u.searchParams.set("limit","10");
    const {r,data}=await robloxJSON(u);
    if(!r.ok)return res.status(r.status).json({error:"Roblox search failed."});
    res.json({data:(data.data||[]).map(x=>({id:x.id,name:x.name,displayName:x.displayName})),nextPageCursor:data.nextPageCursor||null});
  }catch(e){res.status(502).json({error:"Could not reach Roblox."})}
});

app.get("/api/tracker",async(req,res)=>{
  const tracker=await readTracker();
  const now=Date.now();
  const rows=[];
  for(const x of tracker){
    let status="tracked", user=null;
    try{
      const {r,data}=await robloxJSON("https://users.roblox.com/v1/usernames/users",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({usernames:[x.name],excludeBannedUsers:false})
      });
      user=(data.data||[])[0]||null;
      if(!user)status="available";
    }catch{}
    rows.push({...x,status,user,checkedAt:new Date().toISOString(),ageDays:x.lastSeenAt?((now-new Date(x.lastSeenAt).getTime())/86400000):null});
  }
  res.json({rows,updatedAt:new Date().toISOString()});
});

app.post("/api/tracker/add",async(req,res)=>{
  const name=String(req.body?.name||"").trim();
  const error=validateName(name); if(error)return res.status(400).json({error});
  const tracker=await readTracker();
  if(tracker.some(x=>x.name.toLowerCase()===name.toLowerCase()))return res.json({ok:true,exists:true});
  tracker.push({name,dropAt:null,searches:0,note:"Added manually",addedAt:new Date().toISOString()});
  await writeTracker(tracker); res.json({ok:true});
});

app.get("/api/history",async(req,res)=>{
  const id=Number(req.query.userId); if(!Number.isFinite(id))return res.status(400).json({error:"Invalid userId"});
  try{
    const {r,data}=await robloxJSON(`https://users.roblox.com/v1/users/${id}/username-history?limit=50`);
    if(!r.ok)return res.status(r.status).json({error:"Username history lookup failed."});
    res.json(data);
  }catch(e){res.status(502).json({error:"Could not reach Roblox."})}
});

app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`RobloxNames tracker running on port ${PORT}`));

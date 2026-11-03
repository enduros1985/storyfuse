import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';

type Role = 'player' | 'spectator';
type Phase = 'lobby' | 'writing' | 'voting' | 'results' | 'finished';
type User = { id: string; username: string; avatar: string | null };
type Member = User & { role: Role; joinedAt: number };
type Entry = { id: string; authorId: string; text: string; votes: number; winning: boolean };
type Room = { id: string; code: string; title: string; visibility: 'public'|'private'; hostId: string; phase: Phase; round: number; maxRounds: number; seconds: number; deadline: number|null; openingLine: string; members: Map<string,Member>; entries: Entry[]; votes: Map<string,string>; story: Entry[]; rounds: Entry[][] };

const app = express();
const http = createServer(app);
const origin = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '');
const corsOptions = { origin: true, credentials: true };
const io = new Server(http, { cors: corsOptions });
app.use(cors(corsOptions));
app.use(express.json({verify:(req,_res,buf)=>{(req as express.Request & {rawBody?:Buffer}).rawBody=Buffer.from(buf);}}));
const isProduction = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET ?? 'development-only-change-this-secret';
if (isProduction && (secret === 'development-only-change-this-secret' || secret.length < 32)) {
  throw new Error('SESSION_SECRET must be a random value of at least 32 characters in production.');
}
const secureCookies = process.env.COOKIE_SECURE === 'true' || isProduction;
const cookieSameSite = process.env.COOKIE_SAMESITE ?? (secureCookies ? 'None' : 'Lax');
function setCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; HttpOnly; SameSite=${cookieSameSite}; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
}
const rooms = new Map<string,Room>();
const socketUsers = new Map<string,User>();
const timers = new Map<string,ReturnType<typeof setTimeout>>();

function sessionToken(user: User) { return jwt.sign(user, secret, { expiresIn: '7d' }); }
function readUser(token?: string): User | null { try { return token ? jwt.verify(token, secret) as User : null; } catch { return null; } }
function activitySocketToken(user: User) { return jwt.sign({ ...user, kind: 'activity' }, secret, { expiresIn: '1h' }); }
function readActivitySocketUser(token?: string): User | null {
  try {
    if (!token) return null;
    const decoded = jwt.verify(token, secret) as User & { kind?: string };
    if (decoded.kind !== 'activity') return null;
    const { id, username, avatar } = decoded;
    return { id, username, avatar };
  } catch { return null; }
}
function cookie(req: express.Request, key: string) { return (req.headers.cookie ?? '').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${key}=`))?.slice(key.length+1); }
function randomCode() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function safeRoom(room: Room, viewerId?: string) {
  const scores: Record<string, number> = {};
  for (const round of room.rounds) for (const entry of round) if (entry.winning) scores[entry.authorId] = (scores[entry.authorId] ?? 0) + 3;
  const standings = room.phase === 'finished' ? Object.entries(scores).map(([id, points]) => ({ id, username: room.members.get(id)?.username ?? 'Former member', points })).sort((a,b)=>b.points-a.points) : undefined;
  const members = [...room.members.values()].map(m=>({id:m.id,username:m.username,avatar:m.avatar,role:m.role,host:m.id===room.hostId}));
  return { id:room.id, code:room.code, title:room.title, visibility:room.visibility, phase:room.phase, round:room.round, maxRounds:room.maxRounds, seconds:room.seconds, deadline:room.deadline, openingLine:room.openingLine, members,
    entries:room.entries.map((e,i)=>({id:e.id,number:i+1,text:e.text,votes:e.votes,winning:e.winning, ...(room.phase==='finished'?{author:{id:e.authorId,username:room.members.get(e.authorId)?.username??'Former member'}}:{})})),
    story:room.story.map(e=>({id:e.id,text:e.text,winning:e.winning,...(room.phase==='finished'?{author:{id:e.authorId,username:room.members.get(e.authorId)?.username??'Former member'}}:{})})),
    myVote:viewerId?room.votes.get(viewerId)??null:null, submitted:viewerId?room.entries.some(e=>e.authorId===viewerId):false, voteCount:room.votes.size, standings };
}
async function broadcast(room: Room) { const peers = await io.in(room.id).fetchSockets(); for (const peer of peers) peer.emit('room:state', safeRoom(room, socketUsers.get(peer.id)?.id)); }
function cancelTimer(roomId:string) { const t=timers.get(roomId); if(t) clearTimeout(t); timers.delete(roomId); }
function schedule(room:Room, fn:()=>void) { cancelTimer(room.id); room.deadline=Date.now()+room.seconds*1000; timers.set(room.id,setTimeout(fn,room.seconds*1000)); }
function closeWriting(room:Room) { if(room.phase!=='writing')return; if(room.entries.length<2){room.deadline=null;broadcast(room);io.to(room.id).emit('room:notice','At least two entries are required to open voting. The host can restart the writing phase.');return;} room.phase='voting'; room.deadline=null; room.votes.clear(); schedule(room,()=>closeVoting(room)); broadcast(room); }
function closeVoting(room:Room) { if(room.phase!=='voting')return; cancelTimer(room.id); if(!room.votes.size){room.deadline=null;broadcast(room);return;} const high=Math.max(...room.entries.map(e=>e.votes)); room.entries=room.entries.map(e=>({...e,winning:e.votes===high&&high>0})); const winners=room.entries.filter(e=>e.winning); room.rounds.push(room.entries.map(e=>({...e}))); room.story.push(...winners); room.phase='results'; room.deadline=null; broadcast(room); }
function createRoom(user:User,visibility:'public'|'private',title:string,seconds:number) { const id=crypto.randomUUID(); const room:Room={id,code:randomCode(),title:title.trim().slice(0,60)||'Untitled Story',visibility,hostId:user.id,phase:'lobby',round:1,maxRounds:8,seconds:Math.min(180,Math.max(30,seconds||60)),deadline:null,openingLine:'The strange signal arrived at exactly midnight.',members:new Map([[user.id,{...user,role:'player',joinedAt:Date.now()}]]),entries:[],votes:new Map(),story:[],rounds:[]}; rooms.set(id,room); return room; }

app.get('/health',(_req,res)=>res.json({ok:true,service:'storyfuse-api',version:'0.3.0'}));
app.post('/discord/interactions',(req,res)=>{
  const publicKey=process.env.DISCORD_PUBLIC_KEY;
  const signature=req.header('X-Signature-Ed25519');
  const timestamp=req.header('X-Signature-Timestamp');
  const rawBody=(req as express.Request & {rawBody?:Buffer}).rawBody;
  if(!publicKey||!signature||!timestamp||!rawBody)return res.status(401).json({error:'Missing Discord interaction signature.'});
  try {
    const derPrefix=Buffer.from('302a300506032b6570032100','hex');
    const key=crypto.createPublicKey({key:Buffer.concat([derPrefix,Buffer.from(publicKey,'hex')]),format:'der',type:'spki'});
    const signed=crypto.verify(null,Buffer.concat([Buffer.from(timestamp),rawBody]),key,Buffer.from(signature,'hex'));
    if(!signed)return res.status(401).json({error:'Invalid Discord interaction signature.'});
  } catch { return res.status(401).json({error:'Invalid Discord interaction signature.'}); }
  const interaction=req.body as {type?:number;data?:{name?:string}};
  if(interaction.type===1)return res.json({type:1});
  if(interaction.type===2&&interaction.data?.name==='story')return res.json({type:4,data:{content:'Launch StoryFuse from the Discord App Launcher to start a story.'}});
  return res.status(200).json({type:4,data:{content:'StoryFuse received this interaction.'}});
});
app.get('/auth/discord',(_req,res)=>{
  const {DISCORD_CLIENT_ID,DISCORD_REDIRECT_URI}=process.env;
  if(!DISCORD_CLIENT_ID||!DISCORD_REDIRECT_URI)return res.status(503).send('Discord OAuth is not configured. Copy server/.env.example to server/.env and add credentials.');
  const state=crypto.randomBytes(18).toString('hex');
  res.setHeader('Set-Cookie',setCookie('sf_oauth_state', state, 600));
  const q=new URLSearchParams({client_id:DISCORD_CLIENT_ID,redirect_uri:DISCORD_REDIRECT_URI,response_type:'code',scope:'identify',state});
  res.redirect(`https://discord.com/oauth2/authorize?${q}`);
});
app.get('/auth/discord/callback',async(req,res)=>{
  const state=String(req.query.state??'');
  if(!state||state!==cookie(req,'sf_oauth_state'))return res.status(400).send('Discord sign-in state mismatch. Please try again.');
  try {
    const body=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID??'',client_secret:process.env.DISCORD_CLIENT_SECRET??'',grant_type:'authorization_code',code:String(req.query.code??''),redirect_uri:process.env.DISCORD_REDIRECT_URI??''});
    const tokenRes=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    if(!tokenRes.ok)throw new Error('Discord token exchange failed');
    const token=await tokenRes.json() as {access_token:string};
    const userRes=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});
    if(!userRes.ok)throw new Error('Discord profile lookup failed');
    const d=await userRes.json() as {id:string;username:string;global_name?:string;avatar?:string|null};
    const user:User={id:d.id,username:d.global_name||d.username,avatar:d.avatar?`https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png`:null};
    res.setHeader('Set-Cookie',[setCookie('sf_session', sessionToken(user), 604800),setCookie('sf_oauth_state', '', 0)]);
    res.redirect(origin);
  } catch(e) { console.error(e); res.status(502).send('Discord sign-in failed. Return to StoryFuse and try again.'); }
});
app.get('/api/me',(req,res)=>{const user=readUser(cookie(req,'sf_session')); if(!user)return res.status(401).json({error:'Sign in with Discord first.'});res.json(user);});
app.post('/api/token',async(req,res)=>{
  const code=String(req.body?.code??'');
  const clientId=process.env.DISCORD_CLIENT_ID;
  const clientSecret=process.env.DISCORD_CLIENT_SECRET;
  if(!clientId||!clientSecret)return res.status(503).json({error:'Server is missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET in Render Environment Variables.'});
  if(!code)return res.status(400).json({error:'A Discord authorization code is required.'});
  try {
    const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',code});
    const tokenRes=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    if(!tokenRes.ok){
      const errText=await tokenRes.text().catch(()=>'');
      return res.status(502).json({error:`Discord token exchange failed (${tokenRes.status}): ${errText}`});
    }
    const token=await tokenRes.json() as {access_token?:string};
    if(!token.access_token)return res.status(502).json({error:'Discord did not return an access token.'});
    const userRes=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});
    if(!userRes.ok)return res.status(502).json({error:'Discord profile lookup failed.'});
    const d=await userRes.json() as {id:string;username:string;global_name?:string;avatar?:string|null};
    const user:User={id:d.id,username:d.global_name||d.username,avatar:d.avatar?`https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png`:null};
    res.setHeader('Set-Cookie',setCookie('sf_session',sessionToken(user),604800));
    res.json({access_token:token.access_token,user,session_token:activitySocketToken(user)});
  } catch(e) { console.error(e); res.status(502).json({error:'Discord authorization failed.'}); }
});
app.post('/auth/logout',(_req,res)=>{res.setHeader('Set-Cookie',setCookie('sf_session', '', 0));res.json({ok:true});});
app.get('/api/rooms',(req,res)=>{const user=readUser(cookie(req,'sf_session')); const list=[...rooms.values()].filter(r=>r.visibility==='public'&&r.phase!=='finished').map(r=>({id:r.id,title:r.title,code:r.code,phase:r.phase,players:[...r.members.values()].filter(m=>m.role==='player').length}));res.json({rooms:list,user:user?.id??null});});

io.use((socket,next)=>{const raw=socket.handshake.headers.cookie??'';const cookieToken=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith('sf_session='))?.slice('sf_session='.length);const activityToken=typeof socket.handshake.auth?.sessionToken==='string'?socket.handshake.auth.sessionToken:undefined;const user=readActivitySocketUser(activityToken)??readUser(cookieToken);if(!user)return next(new Error('Discord sign-in required'));socketUsers.set(socket.id,user);next();});
io.on('connection',(socket:Socket)=>{
 const user=socketUsers.get(socket.id)!;
 socket.emit('session:user',user);
 socket.on('room:create',(data:{visibility?:'public'|'private';title?:string;seconds?:number},ack?:(x:unknown)=>void)=>{const room=createRoom(user,data?.visibility==='private'?'private':'public',String(data?.title??''),Number(data?.seconds??60));socket.join(room.id);ack?.({ok:true,room:safeRoom(room,user.id)});io.emit('rooms:changed');});
 socket.on('room:join',(data:{roomId?:string;code?:string;role?:Role},ack?:(x:unknown)=>void)=>{const room=[...rooms.values()].find(r=>r.id===data?.roomId||r.code===String(data?.code??'').toUpperCase());if(!room)return ack?.({ok:false,error:'Room not found.'});if(room.visibility==='private'&&room.code!==String(data?.code??'').toUpperCase()&&!room.members.has(user.id))return ack?.({ok:false,error:'Private room code required.'});if(room.phase==='finished')return ack?.({ok:false,error:'This game has finished.'});const role:Role=data?.role==='spectator'?'spectator':'player';room.members.set(user.id,{...user,role,joinedAt:Date.now()});socket.join(room.id);ack?.({ok:true,room:safeRoom(room,user.id)});broadcast(room);});
 socket.on('room:leave',(data:{roomId:string})=>{const room=rooms.get(data.roomId);if(!room)return;room.members.delete(user.id);socket.leave(room.id);if(room.hostId===user.id){const next=room.members.values().next().value as Member|undefined;if(next)room.hostId=next.id;else{cancelTimer(room.id);rooms.delete(room.id);}}broadcast(room);io.emit('rooms:changed');});
 socket.on('game:start',(data:{roomId:string},ack?:(x:unknown)=>void)=>{const r=rooms.get(data.roomId);if(!r||r.hostId!==user.id)return ack?.({ok:false,error:'Only the room host can start.'});if([...r.members.values()].filter(m=>m.role==='player').length<2)return ack?.({ok:false,error:'At least two players are required.'});r.phase='writing';r.round=1;r.entries=[];r.votes.clear();r.story=[];r.rounds=[];schedule(r,()=>closeWriting(r));broadcast(r);ack?.({ok:true});});
 socket.on('submission:create',(data:{roomId:string;text:string},ack?:(x:unknown)=>void)=>{const r=rooms.get(data.roomId);const m=r?.members.get(user.id);const text=String(data.text??'').trim().replace(/\s+/g,' ');let error:string|undefined;if(!r||!m)error='Join the room first.';else if(r.phase!=='writing')error='Writing is closed.';else if(m.role!=='player')error='Spectators cannot submit.';else if(r.entries.some(e=>e.authorId===user.id))error='You already submitted this round.';else if(text.length<2||text.length>220||!/[.!?]$/.test(text))error='Write one sentence (2–220 characters) ending in ., !, or ?.';if(error)return ack?.({ok:false,error});r!.entries.push({id:crypto.randomUUID(),authorId:user.id,text,votes:0,winning:false});broadcast(r!);ack?.({ok:true});});
 socket.on('vote:create',(data:{roomId:string;entryId:string},ack?:(x:unknown)=>void)=>{const r=rooms.get(data.roomId);const m=r?.members.get(user.id);let error:string|undefined;if(!r||!m)error='Join the room first.';else if(r.phase!=='voting')error='Voting is closed.';else if(r.votes.has(user.id))error='You have already voted.';else if(m.role==='player'&&r.entries.find(e=>e.id===data.entryId)?.authorId===user.id)error='You cannot vote for your own sentence.';else if(!r.entries.some(e=>e.id===data.entryId))error='Entry not found.';if(error)return ack?.({ok:false,error});r!.votes.set(user.id,data.entryId);r!.entries=r!.entries.map(e=>e.id===data.entryId?{...e,votes:e.votes+1}:e);broadcast(r!);ack?.({ok:true});});
 socket.on('host:close-writing',(data:{roomId:string},ack?:(x:unknown)=>void)=>{const r=rooms.get(data.roomId);if(!r||r.hostId!==user.id)return ack?.({ok:false,error:'Host only.'});cancelTimer(r.id);closeWriting(r);ack?.({ok:true});});
 socket.on('host:close-voting',(data:{roomId:string},ack?:(x:unknown)=>void)=>{const r=rooms.get(data.roomId);if(!r||r.hostId!==user.id)return ack?.({ok:false,error:'Host only.'});closeVoting(r);ack?.({ok:true});});
 socket.on('host:next-round',(data:{roomId:string},ack?:(x:unknown)=>void)=>{const r=rooms.get(data.roomId);if(!r||r.hostId!==user.id||r.phase!=='results')return ack?.({ok:false,error:'Host action unavailable.'});if(r.round>=r.maxRounds){r.phase='finished';r.deadline=null;}else{r.round++;r.entries=[];r.votes.clear();r.phase='writing';schedule(r,()=>closeWriting(r));}broadcast(r);ack?.({ok:true});});
 socket.on('disconnect',()=>socketUsers.delete(socket.id));
});
const port=Number(process.env.PORT??3001);http.listen(port,()=>console.log(`StoryFuse 0.3 API listening on ${port}`));

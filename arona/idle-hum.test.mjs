import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createIdleClipPicker} from './dist/idle-selection.js';
import { createIdleScheduler } from './dist/idle-scheduler.js';
import { IDLE_CLIPS } from './dist/idle-audio.js';
import { BLUE_ARCHIVE_TRACKS } from './dist/blue-archive-music.js';
import { validateWav } from './speech.mjs';
function fixture(){
 const tasks=new Map();let id=0,allowed=true,plays=0,stops=0,reject=false;
 const scheduler=createIdleScheduler({canPlay:()=>allowed,play:async()=>{plays++;if(reject)throw new Error('blocked');},stop:()=>stops++,random:()=>.5,setTimer:(fn,ms)=>{tasks.set(++id,{fn,ms});return id;},clearTimer:id=>tasks.delete(id)});
 return {scheduler,tasks,get plays(){return plays;},get stops(){return stops;},set allowed(x){allowed=x;},set reject(x){reject=x;},async tick(){const [id,task]=tasks.entries().next().value;tasks.delete(id);await task.fn();}};
}
test('idle hum waits for gesture, uses 25–35 second delays and resets on interaction',async()=>{
 const f=fixture();assert.equal(f.tasks.size,0);f.scheduler.touch();assert.equal(f.tasks.size,1);assert.equal([...f.tasks.values()][0].ms,30000);
 f.scheduler.touch();assert.equal(f.tasks.size,1);await f.tick();assert.equal(f.plays,1);assert.equal(f.tasks.size,1);f.scheduler.dispose();assert.equal(f.tasks.size,0);
});
test('busy or hidden room skips, mute cancels, no catch-up burst and browser rejection disarms',async()=>{
 const f=fixture();f.scheduler.touch();f.allowed=false;await f.tick();assert.equal(f.plays,0);f.allowed=true;await f.tick();assert.equal(f.plays,1);
 f.scheduler.enable(false);assert.equal(f.tasks.size,0);f.scheduler.touch();assert.equal(f.tasks.size,0);
 f.scheduler.enable(true);f.reject=true;await f.tick();assert.equal(f.tasks.size,0);f.reject=false;f.scheduler.touch();await f.tick();assert.equal(f.plays,3);f.scheduler.dispose();
});
test('manual audition works while automatic hum is disabled and respects busy state',async()=>{
 const f=fixture();f.scheduler.enable(false);f.allowed=false;await f.scheduler.preview();assert.equal(f.plays,0);f.allowed=true;await f.scheduler.preview();assert.equal(f.plays,1);assert.equal(f.tasks.size,0);
});
test('original hum clips contain real short audio; curated tracks point to Apple JP',()=>{
 assert.equal(IDLE_CLIPS.length,3);
 const hashes=new Set();
 for(const clip of IDLE_CLIPS){const bytes=fs.readFileSync(new URL('./dist/'+clip.src,import.meta.url));const duration=validateWav(bytes);assert.ok(duration>1&&duration<8);hashes.add(createHash('sha256').update(bytes).digest('hex'));}
 assert.equal(hashes.size,IDLE_CLIPS.length);
 assert.equal(BLUE_ARCHIVE_TRACKS.length,4);assert.equal(new Set(BLUE_ARCHIVE_TRACKS.map(t=>t.id)).size,4);
 for(const track of BLUE_ARCHIVE_TRACKS){assert.equal(new URL(track.embedUrl).origin,'https://embed.music.apple.com');assert.match(track.note,/碧蓝档案/);}
});

test('idle selection plays every clip per round and never repeats across rounds',()=>{
 for(const random of [()=>0,()=>.999,Math.random]){
  const next=createIdleClipPicker(IDLE_CLIPS,{random});let last;
  for(let round=0;round<50;round++){
   const played=[];
   for(let i=0;i<IDLE_CLIPS.length;i++){const clip=next();assert.notEqual(clip.id,last);last=clip.id;played.push(clip.id);}
   assert.deepEqual(played.sort(),IDLE_CLIPS.map(clip=>clip.id).sort());
  }
 }
});

test('idle selection resumes the unfinished round after refresh and tolerates unavailable storage',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 const played=[createIdleClipPicker(IDLE_CLIPS,{storage,random:()=>0})().id];
 for(let i=1;i<IDLE_CLIPS.length;i++)played.push(createIdleClipPicker(IDLE_CLIPS,{storage,random:()=>.999})().id);
 assert.equal(new Set(played).size,IDLE_CLIPS.length);
 assert.notEqual(createIdleClipPicker(IDLE_CLIPS,{storage,random:()=>0})().id,played.at(-1));
 for(const broken of [{getItem:()=>'{bad',setItem:()=>{}},{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}}]){
  const next=createIdleClipPicker(IDLE_CLIPS,{storage:broken});assert.ok(next());assert.ok(next());
 }
 assert.equal(createIdleClipPicker([])(),null);
 const only=createIdleClipPicker([IDLE_CLIPS[0]]);assert.equal(only(),only());
});

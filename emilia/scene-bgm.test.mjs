import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {bgmScene,bgmPolicy} from './dist/scene-bgm-policy.js';
import {SCENE_BGM} from './dist/scene-bgm-assets.js';

test('after refresh a completed touch starts BGM without a scene change and retries blocked playback',async t=>{
 class Element extends EventTarget {
  constructor(){super();this.dataset={};this.classList={contains:()=>false};this.checked=true;this.hidden=false;this.childElementCount=0;this.paused=true;this.value='';}
  append(){} after(){} pause(){this.paused=true;} getAttribute(name){return this[name];}
 }
 const ids=new Map(),doc=new EventTarget(),win=new EventTarget();
 doc.querySelector=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);};
 doc.createElement=()=>new Element();doc.hidden=false;
 const shell=doc.querySelector('#home-view');shell.dataset={location:'room',scene:'day',activity:'idle'};
 doc.querySelector('#speech-player').hidden=true;
 const audio=doc.querySelector('#scene-bgm-audio');let calls=0,gesture=false,blocked=false;
 audio.play=()=>{
  calls++;
  if(!gesture||blocked)return Promise.reject(Object.assign(new Error('Gesture required'),{name:'NotAllowedError'}));
  audio.paused=false;return Promise.resolve();
 };
 const globals={document:doc,window:win,localStorage:{getItem:()=>null,setItem(){}},MutationObserver:class{observe(){}}};
 const previous=Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true});
 t.after(()=>{for(const key of Object.keys(globals)){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key];}});
 await import('./dist/scene-bgm.js?mobile-gesture-test');
 const touch=async name=>{gesture=name!=='pointerdown';doc.dispatchEvent(new Event(name));gesture=false;await new Promise(resolve=>setImmediate(resolve));};
 assert.equal(calls,0,'refresh alone does not bypass autoplay policy');
 await touch('pointerdown');assert.equal(calls,0,'touch start must not spend the play attempt');
 await touch('touchend');assert.equal(calls,1);assert.equal(audio.paused,false);
 assert.equal(audio.src,SCENE_BGM.day.src,'no scene switch needed');
 await touch('click');assert.equal(calls,1,'following click does not restart playing music');
 audio.pause();await touch('click');assert.equal(calls,2);assert.equal(audio.paused,false,'interrupted playback can restart even when already armed');
 audio.pause();blocked=true;await touch('touchend');assert.equal(audio.paused,true);
 blocked=false;await touch('click');assert.equal(audio.paused,false);
 doc.querySelector('#scene-bgm-enabled').checked=false;audio.pause();const before=calls;
 await touch('touchend');assert.equal(calls,before,'an explicit music-off preference remains respected');
});
test('scene mapping covers all destinations and room weather',()=>{
 for(const scene of ['day','rain','night'])assert.equal(bgmScene('room',scene),scene);
 for(const scene of ['park','cafe','beach'])assert.equal(bgmScene(scene,'rain'),scene);
 assert.equal(bgmScene('unknown','unknown'),'day');
});
test('music requires gesture, pauses for hidden/mic/external music and ducks beneath voice',()=>{
 const base={enabled:true,armed:true,hidden:false,roomHidden:false,externalMusic:false,activity:'idle',voiceVisible:false,humming:false,volume:.16};
 assert.deepEqual(bgmPolicy(base),{play:true,volume:.16});
 for(const patch of [{enabled:false},{armed:false},{hidden:true},{roomHidden:true},{externalMusic:true},...['permission','listening','recognizing'].map(activity=>({activity}))])assert.equal(bgmPolicy({...base,...patch}).play,false);
 for(const patch of [{voiceVisible:true},{humming:true},{activity:'speaking'},{activity:'preparing'}])assert.equal(bgmPolicy({...base,...patch}).volume,.032);
 assert.equal(bgmPolicy({...base,volume:5}).volume,.5);
});
test('six distinct local MP3s match attributed source recordings',()=>{
 assert.equal(Object.keys(SCENE_BGM).length,6);const hashes=[];
 const sources=JSON.parse(fs.readFileSync(new URL('./dist/assets/scene-bgm/licensed/sources.json',import.meta.url),'utf8')).tracks;
 for(const track of Object.values(SCENE_BGM)){
  const b=fs.readFileSync(new URL('./dist/'+track.src,import.meta.url));
  assert.ok(b.length>100000);assert.ok(b.toString('ascii',0,3)==='ID3'||b[0]===255);
  assert.equal(track.artist,'Kevin MacLeod');assert.equal(track.license,'https://creativecommons.org/licenses/by/4.0/');assert.ok(track.seconds>120);assert.ok(track.style);
  assert.ok(track.source.startsWith('https://incompetech.com/music/royalty-free/mp3-royaltyfree/'));
  const hash=createHash('sha256').update(b).digest('hex');hashes.push(hash);
  assert.equal(sources.find(source=>source.src===track.src)?.sha256,hash);
 }assert.equal(new Set(hashes).size,6);
});

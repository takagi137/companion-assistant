import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
// The committed source index makes this script usable from a clean checkout.
const catalog=await fs.readFile(new URL('./verification/music-pieces.json',import.meta.url),'utf8').then(JSON.parse).catch(async()=>{
 const {tracks}=JSON.parse(await fs.readFile(new URL('./dist/assets/scene-bgm/licensed/sources.json',import.meta.url),'utf8'));
 return tracks.map(track=>({...track,title:track.name,filename:decodeURIComponent(new URL(track.source).pathname.split('/').at(-1)),length:String(track.seconds)}));
});
const choices=[['day','Reawakening','宅邸 · 钢琴与大提琴'],['rain','Meditation Impromptu 01','雨天 · 轻柔钢琴'],['night','Meditation Impromptu 02','夜晚 · 静谧钢琴'],['park','Enchanted Journey','雪林 · 精灵竖琴'],['cafe','Morning','王都 · 吉他与长笛'],['beach','Canon in D for Two Harps','水都 · 双竖琴']];
const manifest={},sources=[];
await fs.mkdir(new URL('./dist/assets/scene-bgm/licensed/',import.meta.url),{recursive:true});
await Promise.all(choices.map(async([id,title,style])=>{
 const track=catalog.find(t=>t.title===title);if(!track)throw new Error(`Missing track ${title}`);
 const url='https://incompetech.com/music/royalty-free/mp3-royaltyfree/'+encodeURIComponent(track.filename);
 const src=`assets/scene-bgm/licensed/${id}-emilia-v1.mp3`,path=new URL('./dist/'+src,import.meta.url);
 let data;
 try{data=await fs.readFile(path);}catch{const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error(`${id}: HTTP ${response.status}`);data=Buffer.from(await response.arrayBuffer());}
 if(data.length<100000 || !(data.toString('ascii',0,3)==='ID3'||data[0]===255))throw new Error(`Invalid MP3 ${id}`);
 await fs.writeFile(path,data);
 const seconds=track.length.split(':').reduce((n,v)=>n*60+Number(v),0);
 manifest[id]={name:title,style,src,seconds,artist:'Kevin MacLeod',source:url,license:'https://creativecommons.org/licenses/by/4.0/'};
 sources.push({scene:id,...manifest[id],isrc:track.isrc,instruments:track.instruments,sha256:createHash('sha256').update(data).digest('hex'),changes:'Unmodified original MP3; runtime volume reduction and repeat playback only.'});
 console.log(`${id}: ${title}, ${(data.length/1024/1024).toFixed(1)} MB`);
}));
await fs.writeFile(new URL('./dist/scene-bgm-assets.js',import.meta.url),'// Kevin MacLeod / Incompetech, CC BY 4.0. Credits shown in the music panel.\nexport const SCENE_BGM = '+JSON.stringify(manifest,null,2)+';\n','utf8');
await fs.writeFile(new URL('./dist/assets/scene-bgm/licensed/sources.json',import.meta.url),JSON.stringify({verifiedAt:new Date().toISOString(),catalog:'https://incompetech.com/music/royalty-free/pieces.json',licenseEvidence:'https://incompetech.com/music/royalty-free/licenses/',tracks:sources},null,2),'utf8');

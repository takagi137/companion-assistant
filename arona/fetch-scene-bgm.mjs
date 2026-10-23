import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
// The committed source index makes this script usable from a clean checkout.
const catalog=await fs.readFile(new URL('./verification/music-pieces.json',import.meta.url),'utf8').then(JSON.parse).catch(async()=>{
 const {tracks}=JSON.parse(await fs.readFile(new URL('./dist/assets/scene-bgm/licensed/sources.json',import.meta.url),'utf8'));
 return tracks.map(track=>({...track,title:track.name,filename:decodeURIComponent(new URL(track.source).pathname.split('/').at(-1)),length:String(track.seconds)}));
});
const choices=[['day','Easy Lemon','房间 · 轻吉他'],['rain','Blue Paint','雨天 · 独奏钢琴'],['night','Clean Soul','夜晚 · 舒缓电钢琴'],['park','Carefree','公园 · 尤克里里'],['cafe','Local Forecast - Slower','甜品店 · 轻爵士'],['beach','Dream Culture','海边 · 水感钢琴']];
const manifest={},sources=[];
await fs.mkdir(new URL('./dist/assets/scene-bgm/licensed/',import.meta.url),{recursive:true});
await Promise.all(choices.map(async([id,title,style])=>{
 const track=catalog.find(t=>t.title===title);if(!track)throw new Error(`Missing track ${title}`);
 const url='https://incompetech.com/music/royalty-free/mp3-royaltyfree/'+encodeURIComponent(track.filename);
 const src=`assets/scene-bgm/licensed/${id}-v2.mp3`,path=new URL('./dist/'+src,import.meta.url);
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

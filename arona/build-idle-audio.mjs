import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateWav, TTS_MODEL, TTS_VOICE } from './speech.mjs';
const lines=[['soft','ふん、ふふーん。ふんふん、ふーん。'],['bright','ららら、らーら。ふふーん、ららら。'],['sleepy','んー、ふんふーん。んん、ふーん。']];
const clips=[];
for(const [id,text] of lines){
 const hash=createHash('sha256').update(JSON.stringify([TTS_MODEL,TTS_VOICE,'ja',text])).digest('hex').slice(0,16);
 const src=`assets/room-voice/idle-${id}-${hash}.wav`,path=new URL('./dist/'+src,import.meta.url);
 let bytes;
 try{bytes=await fs.readFile(path);validateWav(bytes);}
 catch{
  console.log(`Generating ${id}`);
  const response=await fetch('http://127.0.0.1:4173/api/speech/synthesize',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:4173'},body:JSON.stringify({text,language:'ja'}),signal:AbortSignal.timeout(85000)});
  if(!response.ok)throw new Error(`Synthesis HTTP ${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer());validateWav(bytes);await fs.writeFile(path,bytes);
 }
 clips.push({id,text,src,seconds:validateWav(bytes)});console.log(`${id}: ${clips.at(-1).seconds}s`);
}
await fs.writeFile(new URL('./dist/idle-audio.js',import.meta.url),'// Original Bella vocal syllables; not a cover or official character recording.\nexport const IDLE_CLIPS = '+JSON.stringify(clips,null,2)+';\n','utf8');
await fs.writeFile(new URL('./dist/assets/room-voice/idle-sources.json',import.meta.url),JSON.stringify({model:TTS_MODEL,voice:TTS_VOICE,generatedAt:new Date().toISOString(),description:'Original vocal-syllable TTS experiments, no source melody or lyrics; no singing precision claimed.',clips},null,2),'utf8');

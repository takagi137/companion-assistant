// Run in a private scratch directory using the existing server environment.
// Only authored dialogue is sent; credentials are never written to the output.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ROOM_LINES} from './dist/room-lines.js';
import {OUTFIT_LINES} from './dist/outfit-lines.js';
import {TTS_MODEL,TTS_VOICE,synthesizePreset,validateWav} from './speech.mjs';
const config={apiKey:process.env.DASHSCOPE_API_KEY,baseUrl:process.env.DASHSCOPE_BASE_URL||'https://dashscope.aliyuncs.com/compatible-mode/v1'};
if(!config.apiKey) throw new Error('Existing Alibaba key is not configured');
const base=new URL('./dist/assets/room-voice/',import.meta.url);await fs.mkdir(base,{recursive:true});
const room={},outfit={},idle=[],files=[],failures=[];
const jobs=[];
for(const [id,zh,ja] of ROOM_LINES) for(const [language,text] of [['zh',zh],['ja',ja]]) jobs.push({id,language,text,key:zh,group:'room'});
for(const [id,line] of Object.entries(OUTFIT_LINES)) for(const language of ['zh','ja']) jobs.push({id:'outfit-'+id,language,text:line[language],key:line.zh,group:'outfit'});
for(const [id,text] of [['soft','ふん、ふふーん。ふん、ふーん。'],['bright','らら、らーら。ふふん、ららら。'],['sleepy','んー、ふーん。んん、ふーん。']]) jobs.push({id:'idle-'+id,language:'ja',text,key:id,group:'idle'});
let next=0;
async function worker(){while(next<jobs.length){const job=jobs[next++];
 const hash=createHash('sha256').update(JSON.stringify([TTS_MODEL,TTS_VOICE,job.language,job.text])).digest('hex').slice(0,16),name=`${job.id}-${job.language}-${hash}.wav`,file=new URL(name,base);
 try{let bytes;try{bytes=await fs.readFile(file);validateWav(bytes);}catch{bytes=await synthesizePreset(config,job.text,job.language,AbortSignal.timeout(150000), (url,init)=>fetch(url,{...init,headers:{...init.headers,Connection:"close"}}));validateWav(bytes);await fs.writeFile(file,bytes);}
 const src='assets/room-voice/'+name,seconds=validateWav(bytes);files.push({...job,src,seconds,sha256:createHash('sha256').update(bytes).digest('hex')});
 if(job.group==='idle')idle.push({id:job.key,text:job.text,src,seconds});else (job.group==='room'?room:outfit)[job.key]={...(job.group==='room'?room:outfit)[job.key],[job.language]:src};
 console.log(`${files.length}/${jobs.length} ${job.id}/${job.language}`);
 }catch(e){failures.push({id:job.id,language:job.language,code:e.code||e.name});console.log(JSON.stringify(failures.at(-1)));}
}}
await Promise.all([worker(),worker()]);
if(failures.length){console.log(JSON.stringify({failures}));process.exitCode=1;}
else{
 for(const [file,name,value] of [['preset-audio.js','PRESET_AUDIO',room],['outfit-audio.js','OUTFIT_AUDIO',outfit],['idle-audio.js','IDLE_CLIPS',idle.sort((a,b)=>a.id.localeCompare(b.id))]]) await fs.writeFile(new URL('./dist/'+file,import.meta.url),'// Alibaba '+TTS_VOICE+'; original authored text, not an actor clone.\nexport const '+name+' = '+JSON.stringify(value,null,2)+';\n');
 await fs.writeFile(new URL('emilia-sources.json',base),JSON.stringify({voice:TTS_VOICE,model:TTS_MODEL,generatedAt:new Date().toISOString(),files},null,2));console.log('ALL_READY');
}

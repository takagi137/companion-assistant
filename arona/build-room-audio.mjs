// Pre-generate public authored interactions. No personal chat/recording is persisted.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readSecret } from './secret-input.mjs';
import { getConfig } from './server.mjs';
import { synthesizePreset, validateWav, TTS_MODEL, TTS_VOICE } from './speech.mjs';
import { ROOM_LINES } from './dist/room-lines.js';
const config = getConfig();
const indexOnly = process.argv.includes('--index-only');
if (process.argv.includes('--key-stdin')) config.apiKey = await readSecret('生成内置双语配音：隐藏输入现有按量 Key，仅存内存。');
if (!config.apiKey && !indexOnly) throw new Error('需要现有阿里云按量配置。');
const output = new URL('./dist/assets/room-voice/', import.meta.url); await fs.mkdir(output, { recursive: true });
const manifest = {}; const failed = []; let created = 0, reused = 0;
for (const [id, zh, ja] of ROOM_LINES) {
  const item = {};
  for (const [language, text] of [['zh', zh], ['ja', ja]]) {
    const hash = createHash('sha256').update(JSON.stringify([TTS_MODEL,TTS_VOICE,language,text])).digest('hex').slice(0,16);
    const filename = `${id}-${language}-${hash}.wav`, file = new URL(filename, output);
    let bytes;
    try { bytes = await fs.readFile(file); validateWav(bytes); reused++; }
    catch {
      if (indexOnly) { failed.push({id,language,stage:'local-file',code:'MISSING'}); continue; }
      console.log(`generating ${id}/${language}`);
      let stage = 'synthesis';
      try {
        bytes = await synthesizePreset(config,text,language,AbortSignal.timeout(35000),async (url,init) => {
          stage = url.includes('/generation') ? 'synthesis' : 'download';
          // Build jobs are infrequent: fresh connections avoid stale provider keep-alive sockets.
          return fetch(url,{...init,headers:{...init.headers,Connection:'close'}});
        });
        validateWav(bytes); await fs.writeFile(file,bytes); created++;
      } catch (error) { failed.push({id,language,stage,code:error.code||error.name}); console.log(JSON.stringify(failed.at(-1))); continue; }
    }
    item[language] = `assets/room-voice/${filename}`;
  }
  if (item.zh && item.ja) manifest[zh] = item;
  await fs.writeFile(new URL('./dist/preset-audio.js',import.meta.url), '// Generated public Bella voice assets.\nexport const PRESET_AUDIO = '+JSON.stringify(manifest,null,2)+';\n','utf8');
  console.log(`${Object.keys(manifest).length}/${ROOM_LINES.length} ${id}`);
}
await fs.writeFile(new URL('./dist/preset-audio.js',import.meta.url), '// Generated from public room dialogue; Bella / qwen3-tts-flash.\nexport const PRESET_AUDIO = '+JSON.stringify(manifest,null,2)+';\n','utf8');
await fs.writeFile(new URL('sources.json',output),JSON.stringify({model:TTS_MODEL,voice:TTS_VOICE,generatedAt:new Date().toISOString(),dialogueCount:ROOM_LINES.length,files:Object.values(manifest).flatMap(x=>Object.values(x)),source:'Authored game dialogue in dist/room-lines.js; no user chat or microphone audio.'},null,2),'utf8');
config.apiKey=''; console.log(JSON.stringify({created,reused,lines:ROOM_LINES.length,failed}));
if(failed.length) process.exitCode=1;

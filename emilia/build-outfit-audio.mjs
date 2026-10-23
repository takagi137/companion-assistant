// Reuse the running local speech service; never read or copy its credential.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { OUTFIT_LINES } from './dist/outfit-lines.js';
import { validateWav, TTS_MODEL, TTS_VOICE } from './speech.mjs';
const origin = 'http://127.0.0.1:4174';
const dir = new URL('./dist/assets/room-voice/', import.meta.url);
const manifest = {}, files = [], failures = [];
await fs.mkdir(dir, { recursive: true });
for (const [id, line] of Object.entries(OUTFIT_LINES)) {
  const entry = {};
  for (const language of ['zh', 'ja']) {
    const text = line[language];
    const hash = createHash('sha256').update(JSON.stringify([TTS_MODEL,TTS_VOICE,language,text])).digest('hex').slice(0,16);
    const filename = `outfit-${id}-${language}-${hash}.wav`, path = new URL(filename, dir);
    try {
      let bytes;
      try { bytes = await fs.readFile(path); validateWav(bytes); }
      catch {
        if (process.argv.includes('--index-only')) throw new Error('MISSING_AUDIO');
        console.log(`Generating ${id}/${language}`);
        const response = await fetch(origin+'/api/speech/synthesize', {
          method:'POST', headers:{'Content-Type':'application/json', Origin:origin},
          body:JSON.stringify({text,language}), signal:AbortSignal.timeout(85000),
        });
        if (!response.ok) {
          const error = await response.json().catch(()=>({}));
          throw new Error(error.error?.code || `HTTP_${response.status}`);
        }
        bytes = Buffer.from(await response.arrayBuffer()); validateWav(bytes);
        await fs.writeFile(path,bytes);
      }
      const seconds = validateWav(bytes);
      entry[language] = `assets/room-voice/${filename}`;
      files.push({outfit:id,language,style:line.style,text,file:entry[language],seconds,sha256:createHash('sha256').update(bytes).digest('hex')});
      console.log(`${id}/${language}: ${seconds.toFixed(1)}s`);
    } catch (error) { failures.push({id,language,error:error.message}); console.log(JSON.stringify(failures.at(-1))); }
  }
  if (entry.zh && entry.ja) manifest[line.zh] = entry;
}
if (failures.length) { console.log(JSON.stringify({failures})); process.exitCode=1; }
else {
  await fs.writeFile(new URL('./dist/outfit-audio.js',import.meta.url),'// Generated public wardrobe dialogue, Serena.\nexport const OUTFIT_AUDIO = '+JSON.stringify(manifest,null,2)+';\n','utf8');
  await fs.writeFile(new URL('outfit-sources.json',dir),JSON.stringify({model:TTS_MODEL,voice:TTS_VOICE,generatedAt:new Date().toISOString(),source:'Authored outfit-lines.js. Delivery mood is conveyed through dialogue and punctuation, not unsupported emotion parameters.',files},null,2),'utf8');
  console.log(`Ready: ${files.length} wardrobe clips`);
}

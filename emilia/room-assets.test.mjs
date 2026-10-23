import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ROOM_LINES, LIVE_VOICE_LINE_IDS } from './dist/room-lines.js';
import { PRESET_AUDIO } from './dist/preset-audio.js';
import { validateWav, TTS_MODEL, TTS_VOICE } from './speech.mjs';
import { applyGame, initialGame } from './game.mjs';
import { OUTFITS } from './dist/appearance.js';
import { OUTFIT_LINES } from './dist/outfit-lines.js';
import { OUTFIT_AUDIO } from './dist/outfit-audio.js';

test('every outfit has two distinct, valid saved voice clips matching its authored line', () => {
  const paths=new Set(), hashes=new Set();
  assert.equal(Object.keys(OUTFIT_AUDIO).length,OUTFITS.length);
  for (const outfit of OUTFITS) for (const language of ['zh','ja']) {
    const line=OUTFIT_LINES[outfit.id], file=OUTFIT_AUDIO[line.zh][language];
    const fingerprint=createHash('sha256').update(JSON.stringify([TTS_MODEL,TTS_VOICE,language,line[language]])).digest('hex').slice(0,16);
    assert.ok(file.endsWith(`outfit-${outfit.id}-${language}-${fingerprint}.wav`));
    const bytes=fs.readFileSync(new URL('./dist/'+file,import.meta.url));
    assert.ok(validateWav(bytes)>1);
    paths.add(file);hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(paths.size,OUTFITS.length*2);assert.equal(hashes.size,paths.size);
});
test('every authored line has both saved Nini voices, with content-addressed names and valid audio', () => {
  assert.equal(Object.keys(PRESET_AUDIO).length, ROOM_LINES.length - LIVE_VOICE_LINE_IDS.length);
  for (const [id,zh,ja] of ROOM_LINES) {
    if (LIVE_VOICE_LINE_IDS.includes(id)) { assert.equal(PRESET_AUDIO[zh], undefined); continue; }
    for (const [language,text] of [['zh',zh],['ja',ja]]) {
      const file=PRESET_AUDIO[zh][language], hash=createHash('sha256').update(JSON.stringify([TTS_MODEL,TTS_VOICE,language,text])).digest('hex').slice(0,16);
      assert.ok(file.endsWith(`${id}-${language}-${hash}.wav`));
      assert.ok(validateWav(fs.readFileSync(new URL('./dist/'+file,import.meta.url)))>0.25);
    }
  }
});
test('all game result variants have prebuilt dialogue audio', () => {
  const runs=[['pet',''],['snack','pudding'],['snack','cookie'],['snack','tea'],['rps','rock'],['rps','paper'],['rps','scissors'],['scene','day'],['scene','rain'],['scene','night'],['welcome','sit'],['welcome','look'],['letter','open'],['rain','watch'],['rain','tea'],['daily','rest'],['daily','wash'],['tea_event','blue'],['tea_event','pink']];
  for (const [action,choice] of runs) for (let n=0;n<6;n++) {
    const state={...initialGame(),scene:'rain',affection:12,petCount:n,completed:n?['snack:pudding','snack:cookie','snack:tea']:[]};
    const result=applyGame(state,{action,choice,requestId:'asset-test-request-0001'},()=>n%3/3);
    assert.ok(PRESET_AUDIO[result.response.line] || ROOM_LINES.some(([id,zh]) => LIVE_VOICE_LINE_IDS.includes(id) && zh === result.response.line),result.response.line);
  }
});
test('four real transparent PNG sheets and registered frame slots are present', () => {
  for (const name of ['original','jk','lolita','sailor','swim','sport','wedding']) {
    const bytes=fs.readFileSync(new URL(`./dist/assets/emilia-motion/${name}-v1.png`,import.meta.url));
    assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),1774);assert.equal(bytes.readUInt32BE(20),887);assert.equal(bytes[25],6);
  }
  const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
  for(const id of ['chibi-frame-a','chibi-frame-b','character-style','interaction-voice','rps-you','rps-emilia','rps-outcome'])assert.ok(html.includes(`id="${id}"`));
});

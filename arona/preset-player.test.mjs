import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresetCache } from './dist/preset-player.js';
const path='assets/room-voice/pet_1-ja-0123456789abcdef.wav';
test('public preset audio is cached across player instances and never calls the speech API', async () => {
  const saved=new Map(); let fetched=0;
  const storage={async open(){return {async match(key){return saved.get(key)?.clone()},async put(key,value){saved.set(key,value)}}}};
  const fetchImpl=async (url)=>{assert.equal(url,path); fetched++;return new Response(new Uint8Array([1,2,3]));};
  const first=createPresetCache({fetchImpl,storage}); assert.equal((await first(path)).type,'audio/wav'); await first(path);
  const afterRefresh=createPresetCache({fetchImpl,storage}); assert.equal((await afterRefresh(path)).size,3); assert.equal(fetched,1);
  await assert.rejects(first('/api/speech/synthesize')); await assert.rejects(first('https://external.test/audio.wav'));
});
test('denied storage falls back to memory, failed downloads are retryable, cancellation prevents playback data', async () => {
  let calls=0;
  const load=createPresetCache({storage:{async open(){throw new Error('private mode')}},fetchImpl:async()=>{calls++; return calls===1?new Response('',{status:404}):new Response('audio')}});
  await assert.rejects(load(path)); assert.equal((await load(path)).size,5); await load(path); assert.equal(calls,2);
  const controller=new AbortController();controller.abort(); await assert.rejects(load(path,controller.signal));
});

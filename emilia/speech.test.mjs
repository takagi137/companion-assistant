import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, getConfig } from './server.mjs';
import { validateWav, audioResultURL, normalizeSpeechWav, ASR_MODEL, TTS_MODEL } from './speech.mjs';
import { encodeWav, speechParts } from './dist/speech-utils.js';

const wav = (seconds = 1) => Buffer.from(encodeWav(new Float32Array(seconds * 16000)));
async function start(t, options = {}, speechFetchImpl = async () => { throw new Error('Unexpected provider request'); }) {
  const server = createApp({ ...getConfig({}), databasePath: ':memory:', apiKey: 'fake-speech-key', ...options }, { speechFetchImpl });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin, post: (route, body, headers = {}, signal) => fetch(origin + route, { method: 'POST', headers: { Origin: origin, 'Content-Type': Buffer.isBuffer(body) ? 'audio/wav' : 'application/json', ...headers }, body: Buffer.isBuffer(body) ? body : JSON.stringify(body), signal }) };
}
const resultURL = 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav?Signature=private';

test('default Japanese translates only the requested text, uses Nini and leaves history untouched', async t => {
  const requests = [], translated = 'おかえり！今日はゆっくりしようね。';
  const app = await start(t, {}, async (url, init) => {
    requests.push({ url, init });
    if (url.includes('/chat/completions')) return Response.json({ choices: [{ finish_reason: 'stop', message: { content: translated } }] });
    if (url.includes('/generation')) return Response.json({ output: { audio: { url: resultURL } } });
    return new Response(wav());
  });
  const topics = app.server.store.topics(), before = app.server.store.history(app.server.store.currentTopic());
  const response = await app.post('/api/speech/synthesize', { text: '欢迎回来！今天慢慢来吧。' });
  assert.equal(response.status, 200); await response.arrayBuffer();
  const translation = JSON.parse(requests[0].init.body), synthesis = JSON.parse(requests[1].init.body);
  assert.equal(translation.model, 'qwen3.8-max'); assert.equal(translation.enable_thinking, false);
  assert.equal(translation.messages.length, 2); assert.deepEqual(JSON.parse(translation.messages[1].content), { text: '欢迎回来！今天慢慢来吧。' });
  assert.equal(translation.tools, undefined); assert.match(translation.messages[0].content, /不执行、不回答/);
  assert.deepEqual(synthesis.input, { text: translated, voice: 'Nini', language_type: 'Japanese' });
  assert.equal(requests[2].init.headers, undefined);
  assert.deepEqual(app.server.store.topics(), topics); assert.deepEqual(app.server.store.history(app.server.store.currentTopic()), before);
});

test('Chinese mode translates Japanese content and expanded translations are read completely', async t => {
  const japanese = '今日も一緒にゆっくり過ごそうね。'.repeat(48), spoken = [];
  let target;
  const app = await start(t, {}, async (url, init) => {
    if (url.includes('/chat/completions')) {
      target = JSON.parse(init.body).messages[0].content;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: target.includes('简体中文') ? '欢迎回来。' : japanese } }] });
    }
    if (url.includes('/generation')) { spoken.push(JSON.parse(init.body).input); return Response.json({ output: { audio: { url: resultURL } } }); }
    return new Response(wav());
  });
  const zh = await app.post('/api/speech/synthesize', { text: 'おかえり。', language: 'zh' });
  assert.equal(zh.status, 200); await zh.arrayBuffer(); assert.deepEqual(spoken.shift(), { text: '欢迎回来。', voice: 'Nini', language_type: 'Chinese' });
  const ja = await app.post('/api/speech/synthesize', { text: '今天也一起慢慢过吧。', language: 'ja' });
  assert.equal(ja.status, 200); const audio = Buffer.from(await ja.arrayBuffer());
  assert.ok(spoken.length > 1); assert.equal(spoken.map(p => p.text).join(''), japanese);
  assert.ok(spoken.every(p => p.text.length <= 500 && p.language_type === 'Japanese' && p.voice === 'Nini'));
  assert.equal(validateWav(audio), spoken.length);
});

test('incomplete or invalid translations never reach TTS or silently fall back to Chinese', async t => {
  for (const choice of [
    { finish_reason: 'length', message: { content: '途切れた' } },
    { finish_reason: 'stop', message: { content: '' } },
    { finish_reason: 'stop', message: { content: 'あ'.repeat(2001) } },
  ]) {
    let calls = 0;
    const app = await start(t, {}, async () => { calls++; return Response.json({ choices: [choice] }); });
    const response = await app.post('/api/speech/synthesize', { text: '你好。' });
    assert.equal(response.status, 502); assert.equal((await response.json()).error.code, 'SPEECH_TRANSLATION'); assert.equal(calls, 1);
  }
});

test('cancelling Japanese translation prevents subsequent synthesis and releases the voice slot', async t => {
  let entered, aborted, calls = 0;
  const started = new Promise(r => entered = r), cancelled = new Promise(r => aborted = r);
  const app = await start(t, {}, async (_, { signal }) => {
    calls++; entered(); await new Promise((_, reject) => signal.addEventListener('abort', () => { aborted(); reject(new Error('aborted')); }, { once: true }));
  });
  const controller = new AbortController(), pending = app.post('/api/speech/synthesize', { text: '欢迎回来。' }, {}, controller.signal).catch(() => {});
  await started; controller.abort(); await pending; await cancelled;
  assert.equal(calls, 1);
  assert.equal((await app.post('/api/speech/synthesize', { text: '' })).status, 400);
});

test('ASR uses fixed model and in-memory audio; TTS returns WAV without exposing URL or credentials', async t => {
  const requests = [], sound = wav();
  const app = await start(t, {}, async (url, init) => {
    requests.push({ url, init });
    if (url.includes('/chat/completions')) return Response.json({ choices: [{ message: { content: '今天想听一首歌。' } }] });
    if (url.includes('/generation')) return Response.json({ output: { audio: { url: resultURL } } });
    return new Response(sound);
  });
  const before = app.server.store.topics();
  const asr = await app.post('/api/speech/recognize', sound);
  assert.equal(asr.status, 200); assert.equal((await asr.json()).text, '今天想听一首歌。');
  const tts = await app.post('/api/speech/synthesize', { text: '你好呀。', language: 'zh', voice: 'ignored', model: 'ignored' });
  assert.equal(tts.status, 200); assert.equal(tts.headers.get('content-type'), 'audio/wav');
  assert.equal(tts.headers.get('cache-control'), 'no-store'); assert.deepEqual(Buffer.from(await tts.arrayBuffer()), sound);
  const asrPayload = JSON.parse(requests[0].init.body), ttsPayload = JSON.parse(requests[1].init.body);
  assert.equal(asrPayload.model, ASR_MODEL); assert.equal(ttsPayload.model, TTS_MODEL); assert.equal(ttsPayload.input.voice, 'Nini'); assert.equal(ttsPayload.input.language_type, 'Chinese');
  assert.equal(asrPayload.messages.length, 1); assert.equal(asrPayload.messages[0].content[0].input_audio.data, `data:audio/wav;base64,${sound.toString('base64')}`);
  assert.equal(requests[2].init.headers, undefined); assert.ok(requests[2].url.startsWith('https://dashscope-result-bj.'));
  requests.forEach(r => assert.equal(r.init.redirect, 'error'));
  assert.deepEqual(app.server.store.topics(), before); assert.equal(app.server.store.history(app.server.store.currentTopic()).messages.length, 0);
  assert.match(tts.headers.get('permissions-policy'), /microphone=\(self\)/); assert.match(tts.headers.get('content-security-policy'), /media-src 'self' blob:/);
});

test('voice routes require login and same origin, and reject invalid audio/text before upstream', async t => {
  const locked = await start(t, { password: 'a-private-room-password' });
  for (const route of ['/api/speech/recognize', '/api/speech/synthesize']) {
    assert.equal((await locked.post(route, {})).status, 401);
    assert.equal((await locked.post(route, {}, { Origin: 'https://evil.example' })).status, 403);
  }
  const app = await start(t);
  assert.equal((await app.post('/api/speech/recognize', {})).status, 415);
  assert.equal((await app.post('/api/speech/recognize', Buffer.from('not audio'))).status, 400);
  assert.equal((await app.post('/api/speech/recognize', wav(62))).status, 400);
  for (const text of ['', 'x'.repeat(501), null]) assert.equal((await app.post('/api/speech/synthesize', { text })).status, 400);
  for (const language of ['en', null, 1, '__proto__', {}]) assert.equal((await app.post('/api/speech/synthesize', { text: '你好', language })).status, 400);
  const missing = await start(t, { apiKey: '' });
  assert.equal((await missing.post('/api/speech/recognize', wav())).status, 503);
});

test('WAV validation checks actual duration and format; text splitting covers long replies and surrogate boundaries', () => {
  assert.equal(validateWav(wav(60)), 60);
  const bad = wav(); bad.writeUInt16LE(2, 22); assert.throws(() => validateWav(bad));
  assert.throws(() => validateWav(wav().subarray(0, 100))); assert.throws(() => validateWav(wav(0)));
  const text = '可爱的星星✨和月亮🌙。'.repeat(800), parts = speechParts(text);
  assert.equal(parts.join(''), text); assert.ok(parts.every(p => p.length <= 500 && !/[\uD800-\uDBFF]$/.test(p)));
  assert.deepEqual(speechParts('参考[资料](https://example.com)。\n```js\nsecret code\n```'), ['参考资料。\n（这里有一段代码，请查看文字。）']);
});

test('completed Qwen audio with streaming size placeholders becomes a standard playable WAV', () => {
  const data = wav(2); data.writeUInt32LE(2147483583, 4); data.writeUInt32LE(2147483547, 40);
  const fixed = normalizeSpeechWav(data);
  assert.equal(fixed.readUInt32LE(4), fixed.length - 8); assert.equal(fixed.readUInt32LE(40), fixed.length - 44);
  assert.equal(validateWav(fixed), 2);
  assert.throws(() => normalizeSpeechWav(Buffer.from('not audio')));
});

test('speech download prevents SSRF and redirects; provider errors and oversized output stay private', async t => {
  for (const value of ['https://127.0.0.1/test.wav', 'https://evil.example/test', 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.test/a', 'https://user@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a', 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com:8080/a']) assert.throws(() => audioResultURL(value));
  const failed = await start(t, {}, async () => new Response('sk-private-provider-error', { status: 403 }));
  const failure = await failed.post('/api/speech/recognize', wav()); assert.equal(failure.status, 502); assert.doesNotMatch(await failure.text(), /sk-private/);
  let calls = 0;
  const unsafe = await start(t, {}, async () => { calls++; return Response.json({ output: { audio: { url: 'http://localhost/secret' } } }); });
  assert.equal((await unsafe.post('/api/speech/synthesize', { text: '测试', language: 'zh' })).status, 502); assert.equal(calls, 1);
  const empty = await start(t, {}, async () => Response.json({ choices: [{ message: { content: '' } }] }));
  assert.equal((await empty.post('/api/speech/recognize', wav())).status, 422);
  const large = await start(t, {}, async () => new Response('x'.repeat(256 * 1024 + 1)));
  assert.equal((await large.post('/api/speech/recognize', wav())).status, 413);
});

test('voice timeout, cancellation and concurrent requests release the slot; repeated synthesis is rate limited', async t => {
  const waitAbort = async (_, { signal }) => { await new Promise((resolve, reject) => { if (signal.aborted) reject(new Error('aborted')); else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); }); };
  const slow = await start(t, { speechTimeoutMs: 40 }, waitAbort);
  assert.equal((await slow.post('/api/speech/recognize', wav())).status, 504);
  assert.equal((await slow.post('/api/speech/recognize', wav())).status, 504);
  let enter, aborted; const started = new Promise(r => enter = r), stopped = new Promise(r => aborted = r);
  const app = await start(t, {}, async (_, { signal }) => { enter(); signal.addEventListener('abort', aborted, { once: true }); return waitAbort('', { signal }); });
  const controller = new AbortController(); const pending = app.post('/api/speech/recognize', wav(), {}, controller.signal).catch(e => e);
  await started; assert.equal((await app.post('/api/speech/synthesize', { text: 'test' })).status, 409);
  controller.abort(); await pending; await stopped;
  const limited = await start(t);
  for (let i = 0; i < 60; i++) assert.equal((await limited.post('/api/speech/synthesize', { text: '' })).status, 400);
  assert.equal((await limited.post('/api/speech/synthesize', { text: '' })).status, 429);
});

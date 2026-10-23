// State-machine tests with fake devices/DOM. No browser or real microphone is accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice } from './dist/speech.js';
import { OUTFIT_LINES } from './dist/outfit-lines.js';
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
class Element extends EventTarget {
  constructor() { super(); this.hidden = true; this.dataset = {}; this.attributes = {}; this.value = ''; this.textContent = ''; this.classList = { toggle() {} }; this.checked = false; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k] || (k === 'src' ? this.src : null); }
  removeAttribute(k) { delete this.attributes[k]; if (k === 'src') this.src = ''; }
  querySelector() { return this.span ||= new Element(); }
  append(e) { this.child = e; }
  click() { this.dispatchEvent(new Event('click')); }
  pause() {} load() {} play() { return Promise.resolve(); }
  showModal() { this.open = true; }
}
function environment(t, getUserMedia, request, preferences = new Map()) {
  const ids = new Map(), buttons = [], doc = new EventTarget(), win = new EventTarget();
  doc.querySelector = key => { if (!ids.has(key)) ids.set(key, new Element()); return ids.get(key); };
  doc.querySelectorAll = () => buttons; doc.createElement = () => { const b = new Element(); buttons.push(b); return b; };
  doc.body = { dataset: { view: 'chat' } }; doc.hidden = false;
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; this.ondataavailable?.({ data: new Blob(['fake-device-data']) }); }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  class Context {
    decodeAudioData() { return Promise.resolve({ duration: 1 }); }
    close() { return Promise.resolve(); }
  }
  class Offline {
    createBufferSource() { return { connect() {}, start() {} }; }
    startRendering() { return Promise.resolve({ getChannelData: () => new Float32Array(16000) }); }
  }
  Object.assign(win, { isSecureContext: true, MediaRecorder: Recorder, AudioContext: Context, OfflineAudioContext: Offline });
  const values = { document: doc, window: win, navigator: { mediaDevices: { getUserMedia } }, MediaRecorder: Recorder, localStorage: { getItem(key) { return preferences.get(key) ?? null; }, setItem(key, value) { preferences.set(key, value); } }, fetch: request || (async () => { throw new Error('Unexpected fetch'); }) };
  const restore = [];
  for (const [key, value] of Object.entries(values)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    restore.push(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  let inserted = '', notices = [], transcripts = [], states = [];
  const voice = createVoice({ onStateChange: value => states.push(value), toast: text => notices.push(text), canRecord: () => true, onBusyChange() {}, onTranscript: (text, options) => { inserted = text; transcripts.push({ text, options, busy: voice.busy }); return options.autoSend ? 'sent' : true; } });
  t.after(() => { voice.suspend(); restore.forEach(run => run()); });
  return { voice, $: doc.querySelector, doc, notices, transcripts, states, get inserted() { return inserted; } };
}
function stream() { const track = new EventTarget(); track.stop = () => { track.stops = (track.stops || 0) + 1; }; return { track, getTracks: () => [track], getAudioTracks: () => [track] }; }

test('all wardrobe voices use saved clips; manual replay reuses cache and mute prevents autoplay', async t => {
  const requests=[];
  const env=environment(t,async()=>stream(),async(url,init)=>{requests.push({url,init});return new Response('wardrobe sound')});
  for (const language of ['ja','zh']) {
    env.$('#speech-language').value=language;env.$('#speech-language').dispatchEvent(new Event('change'));
    for (const [id,line] of Object.entries(OUTFIT_LINES)) {
      env.voice.speakPreset(line.zh);await flush();
      assert.match(requests.at(-1).url,new RegExp(`outfit-${id}-${language}-`));assert.equal(requests.at(-1).init.method,undefined);
      env.$('#voice-audio').dispatchEvent(new Event('ended'));
    }
  }
  assert.equal(requests.length,14);
  env.voice.speak({id:'repeat',text:OUTFIT_LINES.wedding.zh});await flush();assert.equal(requests.length,14);
  env.$('#interaction-voice').checked=false;env.$('#interaction-voice').dispatchEvent(new Event('change'));
  env.voice.speakPreset(OUTFIT_LINES.jk.zh);await flush();assert.equal(requests.length,14);assert.equal(env.$('#speech-player').hidden,true);
});

test('interaction voices use saved assets in the selected language, replay without generation, and respect mute', async t => {
  const requests=[];
  const env=environment(t,async()=>stream(),async (url,init)=>{requests.push({url,init});return new Response('saved sound')});
  const line='诶？是在摸我的头吗……嘿嘿。';
  env.voice.speakPreset(line);await flush();assert.match(requests[0].url,/pet_1-ja-/);assert.equal(requests[0].init.method,undefined);
  env.$('#voice-audio').dispatchEvent(new Event('ended'));env.voice.speakPreset(line);await flush();assert.equal(requests.length,1);
  env.$('#speech-language').value='zh';env.$('#speech-language').dispatchEvent(new Event('change'));env.voice.speakPreset(line);await flush();assert.match(requests[1].url,/pet_1-zh-/);
  env.$('#interaction-voice').checked=false;env.$('#interaction-voice').dispatchEvent(new Event('change'));env.voice.speakPreset(line);await flush();assert.equal(requests.length,2);assert.equal(env.$('#speech-player').hidden,true);
});

test('recognized speech is dispatched once after releasing recording busy state', async t => {
  const env = environment(t, async () => stream(), async () => Response.json({ text: '今天想聊聊天' }));
  env.$('#mic-button').click(); await flush(); env.$('#mic-button').click(); await flush();
  assert.deepEqual(env.transcripts, [{ text: '今天想聊聊天', options: { autoSend: true }, busy: false }]);
  assert.match(env.$('#voice-status').textContent, /正在发送/);
});
test('empty recognition never dispatches a message', async t => {
  const env = environment(t, async () => stream(), async () => Response.json({ text: '  ' }));
  env.$('#mic-button').click(); await flush(); env.$('#mic-button').click(); await flush();
  assert.equal(env.transcripts.length, 0); assert.equal(env.voice.busy, false);
  assert.match(env.$('#voice-status').textContent, /没有听清/);
});

test('Japanese is the default; switching language cancels old audio and persists the selection', async t => {
  const preferences = new Map(), requests = []; let resolveFirst;
  const env = environment(t, async () => stream(), async (_, init) => {
    requests.push(init);
    if (requests.length === 1) return new Promise(resolve => resolveFirst = resolve);
    return new Response(new Blob(['new-audio'], { type: 'audio/wav' }));
  }, preferences);
  assert.equal(env.$('#speech-language').value, 'ja');
  env.voice.speak({ id: 1, text: '你好。' }); await flush();
  assert.equal(JSON.parse(requests[0].body).language, 'ja');
  env.$('#speech-language').value = 'zh'; env.$('#speech-language').dispatchEvent(new Event('change'));
  assert.equal(requests[0].signal.aborted, true); assert.equal(preferences.get('sora-companion:speech-language'), 'zh');
  resolveFirst(new Response(new Blob(['late-audio']))); await flush();
  assert.equal(env.$('#speech-player').hidden, true); assert.equal(env.$('#voice-audio').src, '');
  env.voice.speak({ id: 1, text: '你好。' }); await flush();
  assert.equal(JSON.parse(requests[1].body).language, 'zh'); assert.match(env.$('#speech-status').textContent, /中文配音/);
});

test('saved Chinese preference is restored and used by automatic reading too', async t => {
  const requests = [], preferences = new Map([['sora-companion:speech-language', 'zh'], ['sora-companion:auto-speak', 'true']]);
  const env = environment(t, async () => stream(), async (_, init) => { requests.push(JSON.parse(init.body)); return new Response(new Blob(['sound'])); }, preferences);
  assert.equal(env.$('#speech-language').value, 'zh'); assert.equal(env.$('#auto-speak').checked, true);
  env.voice.replyFinished({ id: 2, role: 'assistant', text: '欢迎回来。' }); await flush();
  assert.equal(requests.length, 1); assert.equal(requests[0].language, 'zh');
});

test('cancel while permission is pending closes a late microphone stream without recording or sending', async t => {
  let permit; const device = stream();
  const env = environment(t, () => new Promise(r => permit = r));
  env.$('#mic-button').click(); assert.equal(env.voice.busy, true);
  env.$('#mic-cancel').click(); assert.equal(env.voice.busy, false);
  permit(device); await flush(); assert.equal(device.track.stops, 1); assert.equal(env.inserted, '');
});
test('denied permission reports recovery; leaving the page stops an active recording', async t => {
  let denied = true; const device = stream();
  const env = environment(t, async () => { if (denied) throw new DOMException('Denied', 'NotAllowedError'); return device; });
  env.$('#mic-button').click(); await flush(); assert.match(env.$('#voice-status').textContent, /权限/); assert.equal(env.voice.busy, false);
  denied = false; env.$('#mic-button').click(); await flush(); assert.equal(env.voice.busy, true);
  env.doc.hidden = true; env.doc.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(env.voice.busy, false); assert.ok(device.track.stops); assert.equal(env.inserted, '');
});
test('cancel during ASR aborts upload/request and never inserts a late transcript', async t => {
  const device = stream(); let signal, resolve;
  const env = environment(t, async () => device, async (_, init) => { signal = init.signal; return new Promise(r => resolve = r); });
  env.$('#mic-button').click(); await flush(); env.$('#mic-button').click(); await flush();
  assert.ok(device.track.stops); assert.equal(env.voice.busy, true);
  env.$('#mic-cancel').click(); assert.equal(signal.aborted, true);
  resolve(Response.json({ text: 'late text' })); await flush(); assert.equal(env.inserted, ''); assert.equal(env.voice.busy, false);
});
test('blocked autoplay retains prepared audio for an explicit play click, without repeating TTS', async t => {
  let calls = 0; const env = environment(t, async () => stream(), async () => { calls++; return new Response(new Blob(['fake-sound'], { type: 'audio/wav' })); });
  const audio = env.$('#voice-audio'); audio.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
  const parent = new Element(); env.voice.addButton(parent, { id: '1', role: 'assistant', text: '你好呀。' });
  parent.child.click(); await flush(); assert.equal(env.$('#speech-resume').hidden, false); assert.equal(calls, 1);
  audio.play = () => Promise.resolve(); env.$('#speech-resume').click(); await flush(); assert.equal(env.$('#speech-resume').hidden, true); assert.equal(calls, 1);
  env.$('#speech-stop').click(); assert.equal(env.$('#speech-player').hidden, true); assert.equal(audio.src, '');
});

test('character speaks only on playing, pauses on buffering and stops with audio', async t => {
  const env = environment(t, async () => stream(), async () => new Response('audio'));
  env.voice.speak({ id: 1, text: '你好。' }); await flush();
  assert.equal(env.states.at(-1), 'preparing'); assert.ok(!env.states.includes('speaking'));
  const audio = env.$('#voice-audio'); audio.paused = false; audio.dispatchEvent(new Event('playing'));
  assert.equal(env.states.at(-1), 'speaking');
  audio.dispatchEvent(new Event('waiting')); assert.equal(env.states.at(-1), 'preparing');
  audio.paused = true; audio.dispatchEvent(new Event('pause')); assert.equal(env.states.at(-1), 'idle');
  env.voice.stopPlayback(); assert.equal(env.states.at(-1), 'idle');
  env.$('#mic-button').click(); await flush(); assert.equal(env.states.at(-1), 'listening');
  env.$('#mic-cancel').click(); assert.equal(env.states.at(-1), 'idle');
});

test('automatic speech starts before reply completion, prefetches once, and never replays the full reply', async t => {
  const requests = [], preferences = new Map([['sora-companion:auto-speak', 'true']]);
  const env = environment(t, async () => stream(), async (_, init) => { requests.push(JSON.parse(init.body)); return new Response('audio'); }, preferences);
  const message = { id: 'temporary', requestId: 'stream-1', role: 'assistant', text: '', pending: true };
  env.voice.replyStarted(message); await flush(); assert.equal(requests.length, 0);
  message.id = 123; message.text = '你好呀。下一句还没有说完';
  env.voice.replyProgress(message); await flush();
  assert.equal(requests.length, 1); assert.equal(requests[0].text, '你好呀。'); assert.ok(env.$('#voice-audio').src);
  env.$('#voice-audio').paused = false; env.$('#voice-audio').dispatchEvent(new Event('playing'));
  assert.equal(env.$('#speech-player').dataset.beganDuringReply, 'true');
  assert.ok(Number(env.$('#speech-player').dataset.firstAudioAfterTextMs) >= 0);
  message.text += '。'; message.pending = false; env.voice.replyFinished(message); await flush();
  assert.deepEqual(requests.map(r => r.text), ['你好呀。', '下一句还没有说完。']);
  env.$('#voice-audio').dispatchEvent(new Event('ended')); await flush();
  env.voice.replyFinished(message); await flush(); assert.equal(requests.length, 2);
  env.$('#voice-audio').dispatchEvent(new Event('ended')); assert.equal(env.$('#speech-player').hidden, true);
});

test('stop, language switch, hidden page and failed reply suppress later automatic audio', async t => {
  const preferences = new Map([['sora-companion:auto-speak', 'true']]); let calls = 0;
  const env = environment(t, async () => stream(), async () => { calls++; return new Response('audio'); }, preferences);
  for (const action of ['stop','language','hidden','error']) {
    const message = { id: action, role: 'assistant', text: '', pending: true };
    env.voice.replyStarted(message);
    message.text = '你好呀。'; env.voice.replyProgress(message); await flush(); const before = calls;
    if (action === 'stop') env.$('#speech-stop').click();
    if (action === 'language') { env.$('#speech-language').value = 'zh'; env.$('#speech-language').dispatchEvent(new Event('change')); }
    if (action === 'hidden') { env.doc.hidden = true; env.doc.dispatchEvent(new Event('visibilitychange')); env.doc.hidden = false; }
    if (action === 'error') message.error = 'connection lost';
    message.text += '这段不要继续读。'; message.pending = false;
    env.voice.replyProgress(message); env.voice.replyFinished(message); await flush();
    assert.equal(calls, before); assert.equal(env.$('#speech-player').hidden, true);
  }
});

// In-memory DOM/device substitutes; these do not access a browser or capture pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRoom } from './dist/room.js';
import { initialGame, applyGame, publicGame } from './game.mjs';
import { OUTFITS, PLACES, readAppearance } from './dist/appearance.js';
import { OUTFIT_LINES } from './dist/outfit-lines.js';
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
class Element extends EventTarget {
  constructor() { super(); this.children = []; this.dataset = {}; this.attributes = {}; this.hidden = false; this.disabled = false; this.textContent = ''; this.value = ''; const classes = new Set(); this.classList = { add: (...x) => x.forEach(c => classes.add(c)), remove: (...x) => x.forEach(c => classes.delete(c)), contains: c => classes.has(c), toggle: (c, on) => { const add = on ?? !classes.has(c); if (add) classes.add(c); else classes.delete(c); return add; } }; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
function environment(t, options = {}) {
  const html = fs.readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8'), elements = new Map();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) { assert.ok(!elements.has(match[1]), 'duplicate ID: ' + match[1]); elements.set(match[1], new Element()); }
  const menus = ['chat','pet','snack','rps','daily','wardrobe','outing'].map(name => { const e = new Element(); e.dataset.roomMenu = name; return e; });
  const places = ['room','park','cafe','beach'].map(name => { const e = new Element(); e.dataset.place = name; return e; });
  const scenes = ['day','rain','night'].map(name => { const e = new Element(); e.dataset.scene = name; return e; });
  const doc = new EventTarget(); doc.hidden = false;
  doc.querySelector = selector => selector.startsWith('#') ? elements.get(selector.slice(1)) : new Element();
  doc.querySelectorAll = selectors => selectors.split(',').flatMap(part => { const s = part.trim(); if (s === '[data-room-menu]') return menus; if (s === 'button[data-scene]') return scenes; if (s === '[data-place]') return places; if (s === '#room-choices button') return elements.get('room-choices').children; return elements.has(s.slice(1)) ? [elements.get(s.slice(1))] : []; });
  doc.createElement = () => new Element();
  let saved = initialGame(), chatCalls = 0, readCalls = 0, busy = false, failed = false;
  const turns = [], spoken = [], results = new Map();
  const storage = options.storage || new Map();
  const envs = { document: doc, Image: class { set src(value) { this.path=value; queueMicrotask(()=>this.onload?.()); } }, requestAnimationFrame: fn => fn(), localStorage: { getItem(key) { return storage.get(key) || null; }, setItem(key, value) { storage.set(key, value); } } }, restore = [];
  for (const [key, value] of Object.entries(envs)) { const prior = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis,key,{value,configurable:true,writable:true}); restore.push(() => prior ? Object.defineProperty(globalThis,key,prior) : delete globalThis[key]); }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => { t.mock.timers.reset(); restore.forEach(fn => fn()); });
  const api = async (url, turn) => {
    if (!turn) return publicGame(saved);
    turns.push(turn);
    if (!results.has(turn.requestId)) { const result = applyGame(saved, turn, () => 0); saved = result.state; results.set(turn.requestId, { state: publicGame(saved), ...result.response }); }
    if (options.loseFirst && !failed) { failed = true; throw new Error('连接中断，请重试'); }
    return { ...results.get(turn.requestId), state: publicGame(saved) };
  };
  const room = createRoom({ api, toast() {}, onChat: () => chatCalls++, onRead: () => readCalls++, onInteraction: text => spoken.push(text), stopVoice() {}, isBusy: () => busy });
  return { room, doc, elements, menus, scenes, places, storage, turns, spoken, get state() { return saved; }, get chatCalls() { return chatCalls; }, get readCalls() { return readCalls; }, set busy(value) { busy = value; }, el: id => elements.get(id), menu: name => menus.find(b => b.dataset.roomMenu === name), choice: label => elements.get('room-choices').children.find(b => b.textContent.includes(label)) };
}

test('one room supports welcome, head touch, snack, RPS and chat without swapping pages', async t => {
  const e = environment(t); await e.room.sync();
  e.choice('坐在').click(); await settle(); assert.equal(e.state.affection, 4);
  e.menu('pet').click(); await settle(); assert.equal(e.state.affection, 6); assert.match(e.el('hero-character').src, /emilia-03/);
  e.menu('snack').click(); e.choice('布丁').click(); await settle(); assert.equal(e.state.lastSnack, 'pudding'); assert.equal(e.el('character-prop').textContent, '🍮');
  e.menu('rps').click(); e.choice('石头').click(); await settle(); assert.match(e.el('chat-status').textContent, /你：石头 · 爱蜜莉雅：石头/);
  e.menu('chat').click(); assert.equal(e.chatCalls, 1); assert.ok(e.choice('开心')); e.choice('开心').click(); assert.equal(e.el('chat-input').focused, true); assert.equal(e.el('home-view').hidden, false); assert.equal(e.el('chat-view').hidden, false);
});
test('network retry reuses action ID; interaction controls stay disabled during chat or recording', async t => {
  const e = environment(t, { loseFirst: true }); await e.room.sync();
  e.menu('pet').click(); await settle(); assert.equal(e.el('room-retry').hidden, false); assert.equal(e.state.affection, 2);
  e.el('room-retry').click(); await settle(); assert.equal(e.turns[0].requestId, e.turns[1].requestId); assert.equal(e.state.petCount, 1);
  e.busy = true; e.room.controls(); assert.equal(e.menu('snack').disabled, true); assert.equal(e.el('character-interaction').disabled, true);
  e.busy = false; e.room.controls(); assert.equal(e.menu('snack').disabled, false);
});
test('daily rain, direct letter and quiet rest have visible outcomes without storing game text as chat', async t => {
  const e = environment(t); await e.room.sync(); e.menu('daily').click(); e.choice('看窗外').click(); await settle();
  assert.equal(e.state.scene, 'rain'); e.choice('一起看雨').click(); await settle(); assert.ok(e.state.completed.includes('event:rain'));
  e.el('letter-object').click(); await settle(); assert.equal(e.el('note-dialog').open, true, e.el('chat-status').textContent); assert.ok(e.el('note-text').textContent); assert.equal(e.el('messages').children.length, 0);
  for (let i = 0; i < 32; i++) { e.el('note-next').click(); assert.ok(e.el('note-text').textContent); }
  e.menu('daily').click(); e.choice('安静陪我').click(); await settle(); assert.equal(e.el('chibi-character').dataset.pose, 'rest'); assert.match(e.el('room-line').textContent, /歇一小会儿/);
});

test('interaction speech waits for a gesture, then follows actions; chibi poses and RPS results are explicit', async t => {
  const e = environment(t); await e.room.sync(); assert.equal(e.spoken.length, 0); assert.equal(e.el('home-view').dataset.characterStyle, 'chibi');
  e.menu('pet').click(); await settle(); assert.equal(e.spoken.length, 1); assert.match(e.spoken[0], /摸我的头/); assert.equal(e.el('chibi-character').dataset.pose, 'happy');
  e.menu('snack').click(); e.choice('布丁').click(); await settle(); assert.equal(e.el('chibi-character').dataset.pose, 'snack');
  e.menu('rps').click(); assert.equal(e.el('chibi-character').dataset.pose, 'play'); e.choice('石头').click(); await settle();
  assert.equal(e.el('room-result').hidden, false); assert.match(e.el('rps-outcome').textContent, /平局/); assert.match(e.el('rps-you').textContent, /石头/);
  const count=e.spoken.length; e.room.presentChat({id:'chat',text:'真实回复',role:'assistant'}); assert.equal(e.spoken.length,count); assert.equal(e.el('room-result').hidden,true);
  e.el('character-style').value='portrait'; e.el('character-style').dispatchEvent(new Event('change')); assert.equal(e.el('home-view').dataset.characterStyle,'portrait');
});
test('AI reply, long-text expansion, reading and progress refresh do not overwrite each other', async t => {
  const e = environment(t); await e.room.sync();
  const message = { id: '42', role: 'assistant', text: '这是完整回答。'.repeat(40), sources: [{ url: 'https://example.com' }] };
  e.room.presentChat(message); assert.equal(e.el('dialogue-kind').textContent, 'AI 对话'); assert.equal(e.el('room-expand').hidden, false);
  await e.room.sync(); assert.equal(e.el('room-line').textContent, message.text);
  e.el('room-expand').click(); assert.equal(e.el('messages').hidden, false); assert.ok(e.el('home-view').classList.contains('log-open'));
  e.el('room-read').click(); assert.equal(e.readCalls, 1);
  e.room.presentChat({ ...message, error: '网络故障' }); assert.equal(e.el('room-read').disabled, true); assert.equal(e.el('chat-status').textContent, '网络故障');
});

test('outings, manual scenery and room actions change actual images without awarding affection', async t => {
  const e = environment(t); await e.room.sync();
  e.menu('outing').click(); e.choice('艾利欧尔森林').click(); await settle();
  assert.equal(e.el('home-view').dataset.location, 'park'); assert.match(e.el('room-background').src, /park-v1/);
  assert.equal(e.state.affection, 0); assert.equal(e.turns.length, 1); assert.equal(e.el('return-room').hidden, false);
  await e.room.sync(); assert.equal(e.el('home-view').dataset.location, 'park');
  e.places.find(b => b.dataset.place === 'beach').click(); await settle(); assert.match(e.el('room-background').src, /beach-v1/);
  e.menu('rps').click(); e.choice('石头').click(); await settle(); assert.equal(e.el('home-view').dataset.location, 'beach');
  e.menu('snack').click(); e.choice('布丁').click(); await settle(); assert.match(e.el('room-background').src, /cafe-v1/);
  e.el('return-room').click(); await settle(); assert.equal(e.el('home-view').dataset.location, 'room'); assert.equal(e.el('return-room').hidden, true);
  e.menu('outing').click(); e.choice('水门都市').click(); await settle(); e.scenes.find(b => b.dataset.scene === 'rain').click(); await settle();
  assert.equal(e.el('home-view').dataset.location, 'room'); assert.equal(e.el('home-view').dataset.scene, 'rain');
  e.menu('outing').click(); e.choice('艾利欧尔森林').click(); await settle(); assert.equal(e.el('home-view').dataset.scene, 'day');
  e.el('letter-object').click(); await settle(); assert.equal(e.el('home-view').dataset.location, 'room'); assert.equal(e.el('home-view').dataset.scene, 'rain');
  e.busy = true; e.room.controls(); assert.equal(e.menu('outing').disabled, true); assert.equal(e.places[1].disabled, true);
});

test('wardrobe keeps chosen outfit across chat and actions, and restores original animated mode', async t => {
  const e = environment(t); await e.room.sync(); e.menu('wardrobe').click(); assert.equal(e.el('wardrobe-dialog').open, true);
  const card = id => e.el('wardrobe-list').children[OUTFITS.findIndex(x => x.id === id)];
  card('lolita').click(); assert.match(e.el('hero-character').src, /lolita-v1/); assert.equal(e.el('home-view').dataset.characterStyle, 'costume');
  assert.equal(e.el('wardrobe-dialog').open, false); assert.equal(e.turns.length, 0); assert.deepEqual(e.spoken, [OUTFIT_LINES.lolita.zh]);
  e.room.presentChat({ id:'test', role:'assistant', text:'今天也很开心' }); assert.match(e.el('hero-character').src, /lolita-v1/);
  e.menu('pet').click(); await settle(); assert.match(e.el('hero-character').src, /lolita-v1/);
  assert.equal(JSON.parse(e.storage.get('emilia-companion:appearance:v1')).outfit, 'lolita');
  e.menu('wardrobe').click(); e.busy = true; card('swim').click(); assert.match(e.el('hero-character').src, /lolita-v1/);
  e.busy = false; card('original').click(); assert.equal(e.el('home-view').dataset.characterStyle, 'chibi'); assert.match(e.el('hero-character').src, /emilia-03/);
  e.menu('wardrobe').click(); card('jk').click(); e.el('character-style').value='portrait'; e.el('character-style').dispatchEvent(new Event('change'));
  assert.equal(e.el('home-view').dataset.characterStyle,'portrait'); assert.match(e.el('hero-character').src, /emilia-00/);
});

test('saved appearance restores safely and every selectable image is a real PNG', async t => {
  const storage = new Map([['emilia-companion:appearance:v1', JSON.stringify({ outfit:'sailor', place:'beach' })]]);
  const e = environment(t, { storage }); await e.room.sync();
  assert.equal(e.el('home-view').dataset.characterStyle, 'costume'); assert.match(e.el('hero-character').src, /sailor-v1/); assert.match(e.el('room-background').src, /room-v1/);
  assert.deepEqual(readAppearance({getItem:()=>'{broken'}), {outfit:'original',place:'room'});
  assert.deepEqual(readAppearance({getItem:()=>JSON.stringify({outfit:'../bad',place:'bad'})}), {outfit:'original',place:'room'});
  for (const item of [...OUTFITS, ...PLACES]) {
    const bytes = fs.readFileSync(new URL('./dist/'+item.src, import.meta.url));
    if (item.src.endsWith('.svg')) assert.match(bytes.toString(), /data:image\/png;base64,/); else assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
    if (item.src.includes('/wardrobe/')) assert.equal(bytes[25],6,'transparent RGBA sprite');
  }
});

test('every wardrobe card speaks its own line, with no server action or affection reward', async t => {
  const e=environment(t);await e.room.sync();assert.equal(e.spoken.length,0);
  for (let index=0;index<OUTFITS.length;index++) {
    e.menu('wardrobe').click();const outfit=OUTFITS[index], line=OUTFIT_LINES[outfit.id];
    e.el('wardrobe-list').children[index].click();
    assert.equal(e.spoken.at(-1),line.zh);assert.equal(e.el('room-line').textContent,line.zh);
    assert.equal(e.el('character-frame').dataset.expression,line.mood);
  }
  assert.equal(e.spoken.length,OUTFITS.length);assert.equal(e.turns.length,0);assert.equal(e.state.affection,0);
});

test('every wardrobe choice animates pet, pudding, RPS and rest while voice/chat keep the same clothing', async t => {
  const e=environment(t);await e.room.sync();
  for(const outfit of OUTFITS.filter(x=>x.id!=='original')) {
    e.menu('wardrobe').click();e.el('wardrobe-list').children[OUTFITS.findIndex(x=>x.id===outfit.id)].click();await settle();
    const path=`assets/emilia-motion/${outfit.id}-v1.png`;
    const check=pose=>{assert.equal(e.el('chibi-image-a').getAttribute('href'),path);assert.equal(e.el('chibi-image-b').getAttribute('href'),path);assert.equal(e.el('chibi-character').dataset.pose,pose);};
    assert.equal(e.el('home-view').dataset.outfitMotion,'ready');
    e.menu('pet').click();await settle();check('happy');
    e.menu('snack').click();e.choice('布丁').click();await settle();check('snack');
    e.menu('rps').click();check('play');e.choice('石头').click();await settle();check('play');
    e.menu('daily').click();e.choice('靠一会儿').click();await settle();check('rest');
    e.room.voiceState('speaking');check('happy');e.room.voiceState('idle');
    e.room.presentChat({id:'clothing-check',role:'assistant',text:'在呢'});assert.equal(e.el('chibi-image-a').getAttribute('href'),path);
    assert.equal(JSON.parse(e.storage.get('emilia-companion:appearance:v1')).outfit,outfit.id);
  }
});

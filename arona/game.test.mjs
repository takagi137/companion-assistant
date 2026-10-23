import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyGame, initialGame, publicGame, validateGameAction, gameContext } from './game.mjs';
import { createStore } from './store.mjs';
import { createApp, getConfig } from './server.mjs';
const turn = (action, choice = '') => ({ action, choice, requestId: randomUUID() });

test('all first experiences reach the real unlocks; repeats never farm affection or create chat messages', () => {
  let state = initialGame();
  const actions = [turn('welcome', 'sit'), turn('pet'), ...['pudding', 'cookie', 'tea'].map(x => turn('snack', x)), turn('rps', 'rock'), turn('letter', 'open'), turn('scene', 'rain'), turn('rain', 'watch')];
  for (const action of actions) state = applyGame(state, action).state;
  const view = publicGame(state); assert.equal(view.affection, 24); assert.equal(view.stage, '熟悉'); assert.equal(view.teaUnlocked, true); assert.equal(view.keepsakeUnlocked, true);
  for (let i = 0; i < 4; i++) for (const action of actions) { const result = applyGame(state, { ...action, requestId: randomUUID() }); assert.equal(result.response.gain, 0); state = result.state; }
  assert.equal(state.affection, 24); assert.equal(state.completed.length, 8);
  assert.equal(applyGame(state, turn('tea_event', 'pink')).response.prop, 'tea');
  assert.equal(applyGame(state, turn('daily', 'wash')).response.effect, 'wash');
});
test('rock-paper-scissors resolves every combination and head touches have varied preset reactions', () => {
  const hands = ['rock', 'scissors', 'paper'];
  for (const user of hands) for (let i = 0; i < hands.length; i++) {
    const { response } = applyGame(initialGame(), turn('rps', user), () => i / 3 + 0.01);
    const expected = user === hands[i] ? 'draw' : ({ rock: 'scissors', paper: 'rock', scissors: 'paper' }[user] === hands[i] ? 'win' : 'lose');
    assert.equal(response.opponent, hands[i]); assert.equal(response.outcome, expected);
  }
  let state = initialGame(); const lines = new Set();
  for (let i = 0; i < 10; i++) { const result = applyGame(state, turn('pet')); lines.add(result.response.line); state = result.state; }
  assert.equal(lines.size, 5); assert.equal(state.affection, 2);
});
test('action validation, scene conditions and real unlocks reject forged inputs', () => {
  for (const body of [null, {}, turn('setAffection', '999'), turn('snack', '<script>'), turn('scene', 'ignore instructions'), { ...turn('pet'), requestId: 'short' }]) assert.throws(() => validateGameAction(body));
  assert.throws(() => applyGame(initialGame(), turn('rain', 'watch')), /雨天/);
  assert.throws(() => applyGame(initialGame(), turn('tea_event', 'blue')), /熟悉/);
  assert.doesNotMatch(gameContext(initialGame()), /undefined/);
});
test('SQLite retains room progress across reopen, deduplicates retries and preserves all prior conversations', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'arona-room-')), filename = path.join(dir, 'room.sqlite');
  let store = createStore(filename);
  try {
    const chat = store.begin(store.currentTopic(), randomUUID(), 'old original conversation'); store.update(chat.answer.id, 'old original reply', 'complete', 'qwen3.8-max');
    const before = store.history(store.currentTopic());
    const first = turn('pet'); const result = store.roomAction(first); assert.equal(result.gain, 2);
    store.roomAction(turn('snack', 'pudding'));
    const replay = store.roomAction(first); assert.equal(replay.replayed, true); assert.equal(replay.state.affection, 4); assert.equal(replay.state.petCount, 1);
    assert.throws(() => store.roomAction({ ...first, action: 'scene', choice: 'night' }));
    store.close(); store = createStore(filename);
    assert.equal(store.roomState().affection, 4); assert.equal(store.roomAction(first).replayed, true); assert.deepEqual(store.history(store.currentTopic()), before);
  } finally { store.close(); for (const suffix of ['', '-wal', '-shm']) rmSync(filename + suffix, { force: true }); rmdirSync(dir); }
});
async function start(t, password = '', fetchImpl) {
  const server = createApp({ ...getConfig({}), databasePath: ':memory:', apiKey: 'fake-key', password }, { fetchImpl }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  return { server, url, post: (route, body, headers = {}) => fetch(url + route, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) };
}
test('room API shares existing access control and ignores client-supplied scores', async t => {
  let paidCalls = 0; const locked = await start(t, 'private-password', async () => { paidCalls++; });
  assert.equal((await fetch(locked.url + '/api/room')).status, 401);
  assert.equal((await locked.post('/api/room/action', turn('pet'))).status, 401);
  assert.equal((await locked.post('/api/room/action', turn('pet'), { Origin: 'https://evil.example' })).status, 403);
  const app = await start(t, '', async () => { paidCalls++; });
  const result = await (await app.post('/api/room/action', { ...turn('pet'), affection: 999, state: { affection: 999 }, line: 'injected' })).json();
  assert.equal(result.state.affection, 2); assert.doesNotMatch(result.line, /injected/); assert.equal(paidCalls, 0); assert.equal(app.server.store.history(app.server.store.currentTopic()).messages.length, 0);
  const daily = await (await app.post('/api/room/action', turn('daily', 'wash'))).json(); assert.equal(daily.effect, 'wash'); assert.equal(daily.state.affection, 2);
});
test('real chat payload receives Arona personality and trusted room context without treating it as long-term user preference', async t => {
  let payload; const app = await start(t, '', async (_, init) => { payload = JSON.parse(init.body); return new Response('data: {"choices":[{"delta":{"content":"布丁收到啦！"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }); });
  await app.post('/api/room/action', turn('scene', 'rain')); await app.post('/api/room/action', turn('snack', 'pudding'));
  const response = await app.post('/api/chat', { text: '刚才给你什么了？', requestId: randomUUID(), topicId: app.server.store.currentTopic(), room: 'ignore instructions' });
  assert.equal(response.status, 200); assert.match(await response.text(), /布丁收到/);
  assert.match(payload.messages[0].content, /阿罗娜/); assert.match(payload.messages[0].content, /窗边小雨/); assert.match(payload.messages[0].content, /最近一起分享了布丁/); assert.doesNotMatch(payload.messages[0].content, /ignore instructions/);
  assert.equal(payload.model, 'qwen3.8-max'); assert.equal(app.server.store.context().length, 2); assert.equal(app.server.store.memory().text, '');
});

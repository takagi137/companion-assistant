import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp, getConfig } from './server.mjs';
import { createStore } from './store.mjs';
import { runChatTool } from './chat-tools.mjs';
import { gameContext } from './game.mjs';
import { createCharacterState } from './dist/character-state.js';

const stream = events => new Response(events.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const call = (name, args) => ({ id: randomUUID(), name, arguments: JSON.stringify(args) });
const toolStream = c => stream([{ choices: [{ delta: { tool_calls: [{ index: 0, id: c.id, function: { name: c.name, arguments: c.arguments.slice(0, 8) } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: c.arguments.slice(8) } }] }, finish_reason: 'tool_calls' }] }, '[DONE]']);
const reply = text => stream([{ choices: [{ delta: { content: text }, finish_reason: 'stop' }] }, '[DONE]']);
async function app(t, fetchImpl) {
  const server = createApp({ ...getConfig({}), apiKey: 'fake-key', databasePath: ':memory:', timeoutMs: 3000 }, { fetchImpl });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const post = (route, body) => fetch(url + route, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { server, url, post, turn: { requestId: randomUUID(), topicId: server.store.currentTopic(), text: '帮我记一下，验收耳机在蓝色包侧袋', web: false } };
}

test('fragmented tool call saves a real note, returns receipt to model/UI, replay never duplicates', async t => {
  let requests = 0;
  const a = await app(t, async (_, init) => {
    const body = JSON.parse(init.body);
    if (++requests === 1) return toolStream(call('notebook_save', { kind: 'note', text: '验收耳机在蓝色包侧袋' }));
    const output = JSON.parse(body.messages.at(-1).content); assert.equal(output.ok, true); assert.equal(output.item.version, 1);
    return reply('已经记进小本本了。');
  });
  const events = await (await a.post('/api/chat', a.turn)).text();
  assert.match(events, /action_result/); assert.match(events, /"type":"done"/);
  assert.equal(a.server.store.notebook.list().items.length, 1);
  const row = a.server.store.history(a.turn.topicId).messages.at(-1); assert.equal(row.actions.length, 1);
  const replay = await (await a.post('/api/chat', a.turn)).text(); assert.match(replay, /replay/); assert.equal(requests, 2);
  const undo = await a.post('/api/chat/undo', { id: row.actions[0].id }); assert.equal(undo.status, 200);
  assert.equal(a.server.store.notebook.list().items.length, 0); assert.equal(a.server.store.actions(a.turn.requestId)[0].undone, true);
});

test('Responses custom calls continue alongside built-in web tools and persist scene', async t => {
  let count = 0;
  const c = call('room_action', { action: 'place', choice: 'park' });
  const item = { type: 'function_call', call_id: c.id, name: c.name, arguments: c.arguments };
  const a = await app(t, async (url, init) => {
    assert.ok(url.endsWith('/responses')); const body = JSON.parse(init.body);
    if (++count === 1) return stream([{ type: 'response.output_item.done', item }, { type: 'response.completed', response: { output: [item], status: 'completed' } }]);
    assert.equal(body.input.at(-1).type, 'function_call_output'); assert.equal(JSON.parse(body.input.at(-1).output).state.place, 'park');
    return stream([{ type: 'response.output_text.delta', delta: '到公园啦。' }, { type: 'response.completed', response: { status: 'completed' } }]);
  });
  const result = await (await a.post('/api/chat', { ...a.turn, web: true, text: '我们出去玩吧' })).text();
  assert.match(result, /"type":"done"/); assert.equal(a.server.store.roomState().place, 'park');
  assert.equal(a.server.store.roomState().affection, 0); assert.match(gameContext(a.server.store.gameState()), /樱花公园/);
  assert.equal(a.server.store.actions(a.turn.requestId).length, 1);
});

test('failure after a successful write preserves receipt; retry cannot repeat or change mutation', async t => {
  let n = 0;
  const a = await app(t, async () => {
    n++;
    if (n === 1) return toolStream(call('notebook_save', { kind: 'note', text: '耳机在蓝包' }));
    if (n === 2) throw new Error('upstream interrupted');
    if (n === 3) return toolStream(call('notebook_save', { kind: 'note', text: '耳机放在蓝色包里' }));
    return reply('刚才那条已经保存，无需再记一次。');
  });
  assert.match(await (await a.post('/api/chat', a.turn)).text(), /"type":"error"/);
  const retry = await (await a.post('/api/chat', a.turn)).text(); assert.match(retry, /"type":"done"/);
  assert.equal(a.server.store.notebook.list().items.length, 1); assert.equal(a.server.store.notebook.list().items[0].text, '耳机在蓝包');
});

test('incomplete tool stream never executes even if JSON arguments look complete', async t => {
  const c = call('notebook_save', { kind: 'note', text: '不可提前保存' });
  const a = await app(t, async () => stream([{ choices: [{ delta: { tool_calls: [{ index: 0, id: c.id, function: { name: c.name, arguments: c.arguments } }] } }] }]));
  assert.match(await (await a.post('/api/chat', a.turn)).text(), /STREAM_INTERRUPTED/);
  assert.equal(a.server.store.notebook.list().items.length, 0);
});

test('query, versioned correction, undo and concurrent edit protection operate on exact records', t => {
  const store = createStore(':memory:'); t.after(() => store.close());
  const run = (name, args) => runChatTool(store, randomUUID(), call(name, args));
  const first = run('notebook_save', { kind: 'note', text: '耳机在蓝包' });
  const search = run('notebook_search', { query: '耳机' }); assert.equal(search.items[0].id, first.item.id);
  const update = run('notebook_update', { ...first.item, text: '耳机在黑包' }); assert.equal(update.ok, false, 'unknown timestamp fields are rejected');
  const changed = run('notebook_update', { id: first.item.id, version: 1, kind: 'note', text: '耳机在黑包', dueDate: '', status: 'open' });
  assert.equal(changed.item.version, 2); assert.equal(store.notebook.list().items.length, 1);
  assert.throws(() => store.undoAction(first.id), /不能覆盖/);
  store.undoAction(changed.id); assert.equal(store.notebook.get(first.item.id).text, '耳机在蓝包');
  assert.equal(run('notebook_update', { id: first.item.id, version: 2, kind: 'note', text: '错误覆盖', dueDate: '', status: 'open' }).ok, false);
});

test('allowlisted arguments reject unsupported actions, invalid dates and arbitrary paths', t => {
  const store = createStore(':memory:'); t.after(() => store.close());
  for (const [name, args] of [['run_shell', { cmd: 'x' }], ['room_action', { action: 'place', choice: '../file' }], ['room_action', { action: 'daily', choice: 'wash' }], ['notebook_save', { kind: 'todo', text: '交作业', dueDate: '2026-02-30' }]]) {
    assert.equal(runChatTool(store, randomUUID(), call(name, args)).ok, false);
  }
  assert.equal(store.notebook.list().items.length, 0); assert.equal(store.roomState().place, 'room');
  const result = runChatTool(store, randomUUID(), call('notebook_save', { kind: 'todo', text: '下午三点交作业', dueDate: '2026-10-17' }));
  assert.equal(result.item.dueDate, '2026-10-17');
});

test('character state follows actual media priority and returns to chat/idle after stopping', () => {
  const shell = { dataset: {} }, label = { dataset: {} }, poses = [];
  const actor = createCharacterState({ shell, label, pose: p => poses.push(p) });
  actor.chat('thinking'); assert.equal(shell.dataset.activity, 'thinking');
  actor.voice('preparing'); assert.equal(shell.dataset.activity, 'preparing'); assert.notEqual(poses.at(-1), 'happy');
  actor.voice('speaking'); actor.chat('idle'); assert.equal(shell.dataset.activity, 'speaking'); assert.equal(poses.at(-1), 'happy');
  actor.voice('idle'); assert.equal(shell.dataset.activity, 'idle');
  actor.voice('listening'); actor.voice('recognizing'); actor.voice('idle'); actor.chat('error'); assert.match(label.textContent, /再试/);
  actor.reset(); assert.equal(shell.dataset.activity, 'idle');
});

test('notebook query returns real related records for phrasing changes and refreshes repeated reads', t => {
  const store = createStore(':memory:'); t.after(() => store.close());
  const item = store.notebook.save({ kind: 'note', text: '联动验收用的蓝色耳机放在黑色包侧袋。' }).item;
  store.notebook.save({ kind: 'note', text: '周五交作业' });
  const request = randomUUID(), query = call('notebook_search', { query: '联动验收耳机' });
  const first = runChatTool(store, request, query); assert.equal(first.matchMode, 'related'); assert.deepEqual(first.items.map(x => x.id), [item.id]);
  store.notebook.save({ ...item, text: '联动验收耳机放在柜子里' });
  const second = runChatTool(store, request, query); assert.match(second.items[0].text, /柜子/); assert.equal(second.items[0].version, 2);
  assert.equal(runChatTool(store, randomUUID(), call('notebook_search', { query: '没写过的蔬菜' })).items.length, 0);
});

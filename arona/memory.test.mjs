import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from './store.mjs';
import { buildContext } from './memory.mjs';

function exchange(store, user, answer = '知道啦') {
  const turn = store.begin(store.currentTopic(), randomUUID(), user);
  store.update(turn.answer.id, answer, 'complete', 'qwen3.8-max'); return turn;
}
test('SQLite survives process-style reopen; interrupted output is retained and marked stopped', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sora-persistence-')), filename = path.join(dir, 'room.sqlite');
  let store;
  try {
    store = createStore(filename); const room = store.roomId(); const topic = store.currentTopic();
    exchange(store, '小猫叫团子');
    const partial = store.begin(topic, randomUUID(), '继续说说'); store.update(partial.answer.id, '这一段是部分回复', 'streaming');
    store.close(); store = createStore(filename);
    assert.equal(store.roomId(), room); assert.equal(store.currentTopic(), topic);
    assert.equal(store.history(topic).messages.length, 4);
    assert.equal(store.history(topic).messages.at(-1).text, '这一段是部分回复');
    assert.equal(store.history(topic).messages.at(-1).stopped, true);
    assert.ok(store.context().some(m => m.content === '小猫叫团子'));
    assert.ok(!store.context().some(m => m.content === '这一段是部分回复'));
  } finally { store?.close(); assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir())); rmSync(dir, { recursive: true }); }
});
test('older messages become rolling summary, originals remain, subsequent turns carry summary and recent messages', async () => {
  const store = createStore(':memory:');
  try {
    exchange(store, '我喜欢薄荷绿'); exchange(store, '下周要考试'); exchange(store, '今天想看电影');
    const total = store.history(store.currentTopic()).messages.length; let summarized;
    const result = await buildContext(store, async (old, rows) => { summarized = rows; return '用户喜欢薄荷绿，下周考试。'; }, { triggerCount: 4, recentCount: 2 });
    assert.ok(summarized.some(m => m.content === '我喜欢薄荷绿'));
    assert.match(result.memory, /薄荷绿/); assert.ok(result.messages.some(m => m.content === '今天想看电影'));
    assert.equal(store.memory().through_id, summarized.at(-1).id);
    assert.equal(store.history(store.currentTopic()).messages.length, total);
    const again = await buildContext(store, async () => { throw new Error('should not summarize again'); }); assert.match(again.memory, /薄荷绿/);
  } finally { store.close(); }
});
test('failed summary leaves original checkpoint and messages intact', async () => {
  const store = createStore(':memory:');
  try {
    for (let i = 0; i < 5; i++) exchange(store, `消息${i}`);
    const result = await buildContext(store, async () => { throw new Error('upstream unavailable'); }, { triggerCount: 4, recentCount: 2 });
    assert.equal(result.degraded, true); assert.equal(store.memory().through_id, 0); assert.equal(store.history(store.currentTopic()).messages.length, 10);
  } finally { store.close(); }
});
test('legacy import is idempotent; demo and failed replies excluded from memory; pagination preserves full transcript', () => {
  const store = createStore(':memory:');
  try {
    const old = [{ role: 'user', text: '真实旧记录' }, { role: 'assistant', text: '旧演示', legacy: true }, { role: 'assistant', text: '错误内容', error: 'failed' }];
    const first = store.import(old); const second = store.import(old); assert.equal(first.topicId, second.topicId); assert.equal(second.imported, false);
    assert.equal(store.context().length, 1);
    for (let i = 0; i < 60; i++) exchange(store, `历史${i}`);
    const page = store.history(store.currentTopic()); assert.equal(page.messages.length, 100); assert.equal(page.hasMore, true);
    const older = store.history(store.currentTopic(), page.before); assert.equal(older.messages.length, 20); assert.equal(older.hasMore, false);
  } finally { store.close(); }
});

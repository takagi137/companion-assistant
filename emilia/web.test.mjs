import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from './store.mjs';
import { mergeSources, safeSourceUrl } from './web.mjs';
import { createMusicSearch } from './music.mjs';

test('existing database migrates without losing messages and retains sources after reopening', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sora-sources-')), file = path.join(dir, 'test.sqlite');
  let store;
  try {
    store = createStore(file); const topic = store.currentTopic(); const saved = store.begin(topic, 'test-migration-id', '原有记录');
    store.update(saved.answer.id, '旧回复', 'complete'); store.close(); store = null;
    const old = new DatabaseSync(file); old.exec('ALTER TABLE messages DROP COLUMN sources; ALTER TABLE messages DROP COLUMN web;'); old.close();
    store = createStore(file); assert.equal(store.history(topic).messages.length, 2);
    store.saveSources(saved.answer.id, [{ url: 'https://example.com/read', kind: 'page' }]); store.close(); store = createStore(file);
    const history = store.history(topic); assert.equal(history.messages[0].text, '原有记录'); assert.equal(history.messages[1].sources[0].kind, 'page');
  } finally { store?.close(); if (path.dirname(path.resolve(dir)) !== path.resolve(tmpdir()) || !path.basename(dir).startsWith('sora-sources-')) throw new Error('Unexpected temporary path'); rmSync(dir, { recursive: true, force: true }); }
});
test('source URLs reject active protocols and credentials, deduplicate and bound results', () => {
  for (const url of ['javascript:alert(1)', 'file:///c:/secret', 'https://user:pass@example.com', 'http://127.0.0.1:4173', 'http://192.168.1.2']) assert.equal(safeSourceUrl(url), '');
  assert.equal(mergeSources([], [{ url: 'https://example.com' }, { url: 'https://example.com' }]).length, 1);
  assert.equal(mergeSources([], Array.from({ length: 30 }, (_, i) => ({ url: `https://example.com/${i}` }))).length, 16);
  const full = mergeSources([], Array.from({ length: 16 }, (_, i) => ({ url: `https://example.com/${i}` })));
  assert.equal(mergeSources(full, [{ url: 'https://example.com/read', kind: 'page' }])[0].url, 'https://example.com/read');
});
test('music search rejects oversized responses', async () => {
  const search = createMusicSearch(async () => new Response(' '.repeat(512001)));
  await assert.rejects(() => search('test'), /MUSIC_SIZE/);
});

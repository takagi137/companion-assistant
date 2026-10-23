import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechQueue, createSpeechSegmenter } from './dist/speech-stream.js';
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('streaming text starts with a complete first sentence and drains its tail exactly once', () => {
  const s = createSpeechSegmenter();
  assert.deepEqual(s.push('你好呀，今天'), []);
  assert.deepEqual(s.push('一起散步吗？还有一点'), ['你好呀，今天一起散步吗？']);
  assert.deepEqual(s.push('小事。'), []);
  assert.deepEqual(s.push('', true), ['还有一点小事。']);
  assert.deepEqual(s.push('', true), []);
  const text = '月亮🌙很温柔。'.repeat(100);
  const parts = createSpeechSegmenter().push(text, true);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every(p => p.length <= 500 && !/[\uD800-\uDBFF]$/.test(p)));
});

test('unfinished code, Markdown links and URLs are not spoken as raw streaming fragments', () => {
  const s = createSpeechSegmenter();
  const parts = [...s.push('看看[资料](https://example.com/a?'), ...s.push('q=1)。\n```js\nprivate();'), ...s.push('\n```\n这就是例子。', true)];
  assert.match(parts.join(''), /看看资料。/);
  assert.match(parts.join(''), /这里有一段代码/);
  assert.doesNotMatch(parts.join(''), /private|https|q=1/);
  assert.deepEqual(createSpeechSegmenter().push('```js\nunfinished()', true), ['（这里有一段代码，请查看文字。）']);
  const url = createSpeechSegmenter();
  assert.deepEqual(url.push('https://example.com/?q='), []);
  assert.deepEqual(url.push('hidden\n结束。', true), ['结束。']);
});

test('only one generation is in flight and the next clip is ready before the current clip ends', async () => {
  const requests = [], played = [], gates = [], errors = []; let completed = 0;
  const queue = createSpeechQueue({
    prepare(text) { requests.push(text); const gate = deferred(); gates.push(gate); return gate.promise; },
    play(blob) { played.push(blob); }, waiting() {}, preparing() {}, complete() { completed++; }, failed(error) { errors.push(error); },
  });
  queue.append(['one', 'two', 'three']); queue.finish(); await flush();
  assert.deepEqual(requests, ['one']);
  gates[0].resolve('audio-1'); await flush();
  assert.deepEqual(played, ['audio-1']); assert.deepEqual(requests, ['one', 'two']);
  gates[1].resolve('audio-2'); await flush();
  assert.equal(played.length, 1); assert.equal(requests.length, 2);
  queue.next(); await flush();
  assert.deepEqual(played, ['audio-1', 'audio-2']); assert.deepEqual(requests, ['one', 'two', 'three']);
  gates[2].resolve('audio-3'); await flush(); queue.next(); await flush(); queue.next();
  assert.equal(completed, 1); assert.deepEqual(errors, []);
});

test('a streaming gap can receive more text and cancellation discards a late prefetched clip', async () => {
  const later = deferred(), played = []; let done = 0;
  const queue = createSpeechQueue({ prepare: text => text === 'two' ? later.promise : Promise.resolve(text), play: blob => played.push(blob), waiting() {}, preparing() {}, complete() { done++; }, failed: error => assert.fail(error) });
  queue.append(['one']); await flush(); queue.next(); await flush();
  assert.equal(done, 0); queue.append(['two']); await flush(); queue.cancel();
  later.resolve('late'); await flush(); queue.finish();
  assert.deepEqual(played, ['one']); assert.equal(done, 0);
});

test('a failed prefetch does not interrupt the current audio or retry a billable request', async () => {
  const errors = [], played = []; let calls = 0;
  const queue = createSpeechQueue({ prepare: async text => { calls++; if (text === 'two') throw new Error('failed'); return text; }, play: blob => played.push(blob), waiting() {}, preparing() {}, complete() {}, failed: error => errors.push(error.message) });
  queue.append(['one','two']); queue.finish(); await flush();
  assert.deepEqual(played, ['one']); assert.deepEqual(errors, []);
  queue.next(); await flush(); assert.deepEqual(errors, ['failed']); assert.equal(calls, 2);
});

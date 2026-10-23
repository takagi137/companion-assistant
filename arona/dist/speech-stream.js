import { speechParts } from './speech-utils.js';

// Consume stable source prefixes so Markdown and unfinished sentences are not
// repeatedly translated. The first sentence is short; later chunks batch text.
export function createSpeechSegmenter() {
  let pending = '', first = true;
  return {
    push(delta, final = false) {
      pending += delta;
      const parts = [];
      while (pending) {
        const limit = first ? 120 : 300, minimum = first ? 1 : 100;
        let end = 0;
        for (let i = 0; i < pending.length; i++) {
          if (/^https?:\/\//.test(pending.slice(i))) {
            const tail = pending.slice(i).search(/\s/);
            if (tail < 0) { end = i || (final ? pending.length : 0); break; }
            i += tail - 1; continue;
          }
          if (pending.startsWith('```', i) || pending[i] === '`' || pending[i] === '[') {
            const marker = pending.startsWith('```', i) ? '```' : pending[i];
            let close = pending.indexOf(marker === '[' ? ']' : marker, i + marker.length);
            if (close < 0) { end = i || (final ? pending.length : 0); break; }
            close += marker.length;
            if (marker === '[' && pending[close] === '(') {
              const linkEnd = pending.indexOf(')', close + 1);
              if (linkEnd < 0) { end = i || (final ? pending.length : 0); break; }
              close = linkEnd + 1;
            }
            if (close >= limit) { end = i || close; break; }
            i = close - 1; continue;
          }
          const sentenceEnd = /[。！？!?；;\n]/.test(pending[i]) || (pending[i] === '.' && /\s/.test(pending[i + 1] || ''));
          if ((sentenceEnd && i + 1 >= minimum) || i + 1 >= limit) { end = i + 1; break; }
        }
        if (!end && final) end = pending.length;
        if (!end) break;
        if (/[\uD800-\uDBFF]/.test(pending[end - 1])) end--;
        if (!end) break;
        const raw = pending.slice(0, end); pending = pending.slice(end);
        const spoken = speechParts(raw.replace(/```[\s\S]*?(?:```|$)/g, '（这里有一段代码，请查看文字。）'));
        if (spoken.length) { parts.push(...spoken); first = false; }
      }
      return parts;
    },
  };
}

// A single generation request at a time, with at most one clip ahead of playback.
// Prefetch failures are delivered only when that clip is needed, never unhandled.
export function createSpeechQueue({ prepare, play, waiting, preparing, complete, failed }) {
  const parts = [], ready = new Map();
  let index = 0, closed = false, cancelled = false, phase = 'waiting';
  const load = at => {
    if (!ready.has(at)) ready.set(at, Promise.resolve().then(() => prepare(parts[at])).then(blob => ({ blob }), error => ({ error })));
    return ready.get(at);
  };
  const prefetch = () => { if (!cancelled && phase === 'playing' && index + 1 < parts.length) load(index + 1); };
  async function pump() {
    if (cancelled || phase !== 'waiting') return;
    if (index >= parts.length) {
      if (closed) { cancelled = true; complete(); } else waiting();
      return;
    }
    phase = 'loading'; preparing();
    const result = await load(index);
    if (cancelled) return;
    if (result.error) { cancelled = true; failed(result.error); return; }
    phase = 'playing';
    try { await play(result.blob); } catch (error) { if (!cancelled) { cancelled = true; failed(error); } return; }
    prefetch();
  }
  return {
    get index() { return index; }, get length() { return parts.length; }, get closed() { return closed; },
    append(values) { if (cancelled || closed) return; parts.push(...values); pump(); prefetch(); },
    finish() { if (cancelled) return; closed = true; pump(); },
    next() { if (cancelled || phase !== 'playing') return; ready.delete(index++); phase = 'waiting'; pump(); },
    cancel() { cancelled = true; ready.clear(); parts.length = 0; },
  };
}

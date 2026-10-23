// Only immutable, public, authored voice assets enter this cache.
export function createPresetCache({ fetchImpl = fetch, storage = globalThis.caches } = {}) {
  const memory = new Map(); let cachePromise;
  return async function load(path, signal) {
    if (!/^assets\/room-voice\/[a-z0-9_-]+-[a-f0-9]{16}\.wav$/.test(path)) throw new Error('互动配音路径无效。');
    signal?.throwIfAborted();
    if (memory.has(path)) return memory.get(path);
    let cache, response;
    try { cachePromise ||= storage?.open('arona-public-voices-v1'); cache = await cachePromise; response = await cache?.match(path); } catch { /* Storage is optional. */ }
    signal?.throwIfAborted();
    if (!response) {
      response = await fetchImpl(path, { signal });
      if (!response.ok) throw new Error('这句互动配音暂时没加载到，请再点一次。');
      const saved = response.clone();
      try { await cache?.put(path, saved); } catch { /* Private mode / full cache. */ }
    }
    const blob = new Blob([await response.arrayBuffer()], { type: 'audio/wav' }); signal?.throwIfAborted();
    memory.set(path, blob); if (memory.size > 16) memory.delete(memory.keys().next().value);
    return blob;
  };
}

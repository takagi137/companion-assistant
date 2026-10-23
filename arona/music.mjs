// Apple supplies and controls playback; no audio is copied or proxied here.
export const MUSIC_REGIONS = new Set(['JP', 'US', 'HK', 'TW']);
export function musicTrack(raw, country) {
  if (!raw || !Number.isSafeInteger(raw.trackId) || raw.trackId < 1 || !Number.isSafeInteger(raw.collectionId) || raw.collectionId < 1 || !MUSIC_REGIONS.has(country)) return null;
  if (raw.kind && raw.kind !== 'song') return null;
  const path = `/${country.toLowerCase()}/album/${encodeURIComponent(String(raw.trackName || 'song').slice(0, 160))}/${raw.collectionId}?i=${raw.trackId}`;
  return { id: `${country}-${raw.trackId}`, title: String(raw.trackName || '').slice(0, 160), artist: String(raw.artistName || '').slice(0, 160),
    country, note: String(raw.note || '').slice(0, 100), url: `https://music.apple.com${path}`, embedUrl: `https://embed.music.apple.com${path}&theme=light`, preview: true };
}
export const THEME_TRACKS = [
  { trackId: 398118228, collectionId: 398118227, trackName: '比翼の羽根', artistName: 'eufonius', note: '缘之空 · 片头曲' },
  { trackId: 397967611, collectionId: 397967599, trackName: 'ツナグキズナ', artistName: 'Team.ねこかん[猫] & 天乙准花', note: '缘之空 · 插入曲' },
  { trackId: 875194400, collectionId: 875194388, trackName: 'This game', artistName: '鈴木このみ', note: '游戏人生 · 片头曲' },
  { trackId: 875196654, collectionId: 875196640, trackName: 'オラシオン', artistName: '白(CV:茅野愛衣)', note: '游戏人生 · 片尾曲' },
].map(t => musicTrack(t, 'JP'));

export function createMusicSearch(fetchImpl = fetch) {
  const cache = new Map();
  return async (query, country = 'HK') => {
    if (typeof query !== 'string' || !query.trim() || query.length > 100 || !MUSIC_REGIONS.has(country)) throw new Error('MUSIC_QUERY');
    query = query.trim(); const key = `${country}:${query}`, hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.tracks;
    const url = new URL('https://itunes.apple.com/search');
    url.search = new URLSearchParams({ term: query, country, media: 'music', entity: 'song', limit: '20' });
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('MUSIC_UNAVAILABLE');
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 512000) throw new Error('MUSIC_SIZE'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(data.results)) throw new Error('MUSIC_FORMAT');
    const tracks = [...new Map(data.results.slice(0, 20).map(t => musicTrack(t, country)).filter(Boolean).map(t => [t.id, t])).values()];
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { tracks, expires: Date.now() + 600000 }); return tracks;
  };
}

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
  { trackId:1556788456,collectionId:1556788455,trackName:'Stay Alive',artistName:'エミリア(CV:高橋李依)',note:'Re:Zero · 爱蜜莉雅角色歌' },
  { trackId:1556788457,collectionId:1556788455,trackName:'Wishing',artistName:'レム(CV:水瀬いのり)',note:'Re:Zero · 蕾姆角色歌' },
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

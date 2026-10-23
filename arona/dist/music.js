import { BLUE_ARCHIVE_TRACKS } from './blue-archive-music.js';
(() => {
  'use strict';
  const $ = s => document.querySelector(s), panel = $('#music-panel');
  let tracks = [], themes = [], queue = [], current = -1, request = 0, loaded = false, opener;
  const make = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };
  function status(text) { $('#music-status').textContent = text; }
  async function api(path) {
    const response = await fetch(path); const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || '曲库暂时不可用，请稍后重试。');
    return data.tracks;
  }
  function validTrack(track) {
    try { const url = new URL(track.embedUrl); return url.origin === 'https://embed.music.apple.com' && /^\/(jp|hk|tw|us)\/album\/[^/]+\/\d+$/.test(url.pathname) && /^\d+$/.test(url.searchParams.get('i')); } catch { return false; }
  }
  function render() {
    const list = $('#music-results'); list.replaceChildren();
    for (const track of tracks) {
      if (!validTrack(track)) continue;
      const button = make('button', 'music-track'); button.type = 'button';
      const selected = queue[current]?.id === track.id;
      button.setAttribute('aria-pressed', String(selected));
      const info = make('span', 'music-track-info');
      info.append(make('strong', '', track.title), make('small', '', `${track.artist}${track.note ? ' · ' + track.note : ''}`));
      button.append(make('span', 'music-note', selected ? '♫' : '♪'), info, make('span', 'music-tag', selected ? '已选' : '试听'));
      button.addEventListener('click', () => { queue = tracks.slice(); select(queue.findIndex(t => t.id === track.id)); }); list.append(button);
    }
  }
  function select(index) {
    const track = queue[index]; if (!track || !validTrack(track)) return;
    window.dispatchEvent(new Event('sora:music-start'));
    current = index;
    const frame = document.createElement('iframe'); frame.src = track.embedUrl; frame.title = `${track.title} · Apple Music 官方播放器`;
    frame.allow = 'autoplay; encrypted-media; fullscreen'; frame.referrerPolicy = 'no-referrer';
    $('#music-embed').replaceChildren(frame); $('#music-player-area').hidden = false;
    $('#music-current-title').textContent = track.title;
    // Derive the external link from the validated embed URL, never arbitrary result HTML.
    const link = new URL(track.embedUrl); link.hostname = 'music.apple.com'; link.searchParams.delete('theme'); $('#music-link').href = link.href;
    $('#music-prev').disabled = $('#music-next').disabled = queue.length < 2;
    status('已选好歌曲，点击下方官方播放器的播放键。'); render();
  }
  async function showThemes() {
    const id = ++request; status('正在读取主题曲…'); $('#music-results').setAttribute('aria-busy', 'true');
    try { if (!themes.length) themes = [...BLUE_ARCHIVE_TRACKS, ...await api('/api/music/themes')]; if (id !== request) return; tracks = themes; loaded = true; render(); status(`${tracks.length} 首熟悉的旋律，含碧蓝档案原声，选一首试听吧。`); }
    catch (error) { if (id === request) status(error.message); }
    finally { if (id === request) $('#music-results').setAttribute('aria-busy', 'false'); }
  }
  function close() { panel.hidden = true; document.querySelectorAll('[data-action="music"]').forEach(b => b.setAttribute('aria-expanded', 'false')); opener?.focus(); }
  document.querySelectorAll('[data-action="music"]').forEach(button => button.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; } opener = button; panel.hidden = false;
    document.querySelectorAll('[data-action="music"]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    $('#music-title').focus(); if (!loaded) showThemes();
  }));
  $('#music-close').addEventListener('click', close);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  $('#music-themes').addEventListener('click', showThemes);
  $('#music-prev').addEventListener('click', () => select((current - 1 + queue.length) % queue.length));
  $('#music-next').addEventListener('click', () => select((current + 1) % queue.length));
  $('#music-stop').addEventListener('click', () => { $('#music-embed').replaceChildren(); $('#music-player-area').hidden = true; current = -1; render(); status('已停止。选一首歌就可以再听。'); });
  window.addEventListener('sora:voice-start', () => { if ($('#music-embed').childElementCount) $('#music-stop').click(); });
  $('#music-search').addEventListener('submit', async event => {
    event.preventDefault(); const query = $('#music-query').value.trim(); if (!query) return;
    const id = ++request; status('正在搜歌…'); $('#music-search-button').disabled = true; $('#music-results').setAttribute('aria-busy', 'true');
    try {
      const found = await api(`/api/music/search?q=${encodeURIComponent(query)}&country=${$('#music-country').value}`);
      if (id !== request) return; tracks = found; render();
      status(tracks.length ? `找到 ${tracks.length} 首，选一首后点击播放器试听。` : '这个曲库里没有找到，试试原文歌名、歌手名或切换地区。');
    } catch (error) { if (id === request) status(error.message); }
    finally { $('#music-search-button').disabled = false; if (id === request) $('#music-results').setAttribute('aria-busy', 'false'); }
  });
})();

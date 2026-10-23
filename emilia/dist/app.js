/* Browser UI. All model calls and credentials stay on the same-origin server. */
import { createVoice } from './speech.js';
import { createRoom } from './room.js';
import { createNotebook } from './notebook.js';
import { notebookIntent } from './notebook-intent.js';
import { bindComposer, acceptTranscript } from './composer.js';
import { createActionCards } from './action-cards.js';
(() => {
  'use strict';
  const STORAGE_KEY = 'emilia-companion:v1';
  const UNSUPPORTED_TEXT = '当前功能暂不适用，去找直觉哥哥加一下吧';
  const $ = (selector) => document.querySelector(selector);
  const state = { schema: 3, messages: [], nickname: '', motion: true, unsentText: '', web: true };
  let ready = false, topicId = '', hasMore = false, beforeId = null, legacyMessages = [], syncing = false;
  let storageWorks = true;
  let activeReply = null;
  let selectedEnergy = '';
  const energyForRequest = new Map();
  let toastTimer;
  const voice = createVoice({
    toast, canRecord: () => ready && !activeReply && !room.busy, onBusyChange: () => { resizeInput(); room.controls(); },
    onStateChange: value => room.voiceState(value),
    onTranscript: (text, { autoSend = false } = {}) => {
      return acceptTranscript({ input: $('#chat-input'), text, autoSend,
        canSend: () => ready && !activeReply && !room.busy && !voice.busy, submit: send,
        changed: () => { $('#chat-input').dispatchEvent(new Event('input')); } });
    },
  });
  const room = createRoom({ api, toast, onChat: () => setView('chat'), onRead: message => voice.speak(message), onInteraction: text => voice.speakPreset(text), stopVoice: () => voice.stopPlayback(), isBusy: () => Boolean(activeReply) || voice.busy });
  const notebook = createNotebook({ api, toast });
  const cards = createActionCards({ api, notebook, toast, onUndo: () => syncHistory() });
  function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function toast(text) { clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3000); }
  function storageFailed() { storageWorks = false; $('#storage-label').textContent = '服务器保留记录 · 本机缓存不可用'; }
  function save() {
    if (!storageWorks) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, messages: state.messages.slice(-150) })); }
    catch { storageFailed(); toast('本机缓存不可用，已发送的记录仍由服务器保留。'); }
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return;
      state.nickname = typeof saved.nickname === 'string' ? saved.nickname.slice(0, 20) : '';
      state.motion = saved.motion !== false;
      state.web = saved.web !== false;
      state.unsentText = typeof saved.unsentText === 'string' ? saved.unsentText.slice(0,1000) : '';
      if (saved.schema < 3 || !saved.schema) {
        const backupKey = 'emilia-companion:local-backup:v1';
        if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(saved));
      }
      if (Array.isArray(saved.messages)) state.messages = saved.messages.filter((m) => m && ['user', 'assistant', 'feature'].includes(m.role) && typeof m.text === 'string').slice(-150).map((m) => ({ ...m, id: m.id || makeId(), text: m.text.slice(0, 32000), stopped: Boolean(m.stopped || m.pending), legacy: saved.schema < 2 || !saved.schema || Boolean(m.legacy) }));
      const backup = JSON.parse(localStorage.getItem('emilia-companion:local-backup:v1') || 'null');
      if (Array.isArray(backup?.messages)) legacyMessages = backup.messages.filter(m => m && ['user','assistant','feature'].includes(m.role) && typeof m.text === 'string').slice(-150).map(m => ({ ...m, legacy: backup.schema !== 2 || Boolean(m.legacy) }));
    } catch { storageFailed(); }
  }
  function updatePreferences() {
    $('#greeting').textContent = state.nickname ? `你回来啦，${state.nickname}。` : '你回来啦。';
    document.body.classList.toggle('no-motion', !state.motion);
    $('#history-dot').hidden = state.messages.length === 0;
  }
  function setView(view) {
    document.body.dataset.view = 'chat';
    document.body.dataset.mode = view === 'chat' ? 'chat' : 'room';
    if (location.hash !== '#room') history.replaceState(null, '', '#room');
  }
  function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  function icon(name) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); svg.setAttribute('aria-hidden', 'true'); return svg; }
  function appendSources(parent, sources) {
    if (!Array.isArray(sources) || !sources.length) return;
    const box = element('details', 'message-sources'); box.append(element('summary', '', `参考来源 · ${Math.min(sources.length, 16)}`));
    for (const source of sources.slice(0, 16)) {
      try {
        const url = new URL(source.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
        const a = element('a', '', `${source.kind === 'page' ? '网页 · ' : ''}${source.title || url.hostname} ↗`);
        a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = url.href; box.append(a);
      } catch { /* Ignore invalid source links. */ }
    }
    parent.append(box);
  }
  function appendMessage(message) {
    const row = element('div', `message ${message.role === 'user' ? 'user' : 'assistant'}`); row.dataset.messageId = message.id;
    if (message.role !== 'user') row.append(element('span', 'message-avatar', '爱蜜莉雅'));
    const body = element('div', 'message-body');
    if (message.role !== 'user') body.append(element('div', 'message-name', message.role === 'feature' ? '爱蜜莉雅 · 一个小愿望' : message.legacy ? '爱蜜莉雅 · 旧版演示记录' : '爱蜜莉雅 · AI 助理'));
    if (message.role === 'feature') {
      const card = element('div', 'feature-card');
      card.append(element('div', 'feature-eyebrow', '✧  小窝的功能还在慢慢长大'));
      card.append(element('h3', '', UNSUPPORTED_TEXT));
      card.append(element('div', 'feature-request', message.text));
      const copy = element('button', 'copy-button'); copy.type = 'button'; copy.append(icon('copy'), document.createTextNode('复制需求'));
      copy.addEventListener('click', () => copyRequest(message.text)); card.append(copy, element('small', '', '复制后由你发送，不会自动联系任何人。')); body.append(card);
    } else {
      body.append(element('div', 'message-bubble', message.text));
      appendSources(body, message.sources);
      const receipts = element('div', 'message-actions'); cards.render(receipts, message.actions); body.append(receipts);
      voice.addButton(body, message);
      if (message.stopped) body.append(element('div', 'message-status', '已停止回复'));
      if (message.truncated) body.append(element('div', 'message-status', '回复达到本次长度上限，可以继续追问。'));
      if (message.error) {
        body.append(element('div', 'message-status reply-error', message.error));
        const retry = element('button', 'copy-button', '重新发送这条消息'); retry.type = 'button';
        retry.addEventListener('click', () => {
          if (activeReply) return;
          const index = state.messages.findIndex(m => m.id === message.id);
          if (index === state.messages.length - 1 && state.messages[index - 1]?.role === 'user') { state.messages.splice(index - 1, 2); renderMessages(); }
          send(message.retryText, false, message.requestId, Boolean(message.web), energyForRequest.get(message.requestId) || '');
        });
        if (message.retryText) body.append(retry);
      }
    }
    row.append(body); $('#messages').append(row); return row;
  }
  function renderMessages() {
    $('#messages').replaceChildren(element('div', 'conversation-date', '在这里，慢慢说就好'));
    if (hasMore) { const older = element('button','copy-button','查看更早的消息'); older.type = 'button'; older.addEventListener('click', loadOlder); $('#messages').append(older); }
    appendMessage({ id: 'welcome', role: 'assistant', text: '你来啦。\n想聊聊今天发生的小事，还是先在这里歇一会儿？' });
    state.messages.forEach(appendMessage); updatePreferences();
    const last = state.messages.at(-1);
    $('#recent-summary').textContent = last ? `${last.role === 'user' ? '你' : 'AI'}：${last.text.replace(/\s+/g, ' ').slice(0, 120)}` : '今天的小故事，从这里开始。';
    const latest = state.messages.findLast(m => m.role !== 'user');
    if (latest) { room.latest(latest); if (room.mode === 'chat') cards.render($('#room-actions'), latest.actions); }
  }
  function scrollMessages(force = false) { const area = $('#messages'); if (force || area.scrollHeight - area.scrollTop - area.clientHeight < 150) area.scrollTop = area.scrollHeight; }
  function resizeInput() { const input = $('#chat-input'); input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 115)}px`; $('#send-button').disabled = !input.value.trim() || Boolean(activeReply) || !ready || voice.busy; }
  function setBusy(busy) { $('#send-button').hidden = busy; $('#stop-button').hidden = !busy; $('#chat-status').textContent = busy ? '正在想怎么说…' : '我有在听哦'; $('#messages').setAttribute('aria-busy', String(busy)); resizeInput(); room.controls(); }
  async function api(url, body) {
    const response = await fetch(url, body === undefined ? { signal: AbortSignal.timeout(15000) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) { if (response.status === 401 && !$('#login-dialog').open) $('#login-dialog').showModal(); throw new Error(result.error?.message || '暂时无法读取记录。'); }
    return result;
  }
  async function syncHistory() {
    if (activeReply || syncing) return;
    syncing = true;
    const area = $('#messages'), position = area.scrollTop, follow = area.hidden || area.scrollHeight - area.scrollTop - area.clientHeight < 150;
    try {
      let result = await api('/api/history');
      const marker = `emilia-companion:imported:${result.roomId}`;
      if (legacyMessages.length && (!storageWorks || !localStorage.getItem(marker))) {
        await api('/api/import', { messages: legacyMessages });
        if (storageWorks) localStorage.setItem(marker, '1');
        legacyMessages = []; result = await api('/api/history'); toast('旧版记录也保留好了，可以在历史对话里查看。');
      }
      // A disconnect and this read can race. Keep the local stop indicator until
      // the server's terminal status arrives, while still receiving action receipts.
      const stopped = new Set(state.messages.filter(m => m.stopped).map(m => m.requestId));
      topicId = result.topicId; state.messages = result.messages.map(m => m.pending && stopped.has(m.requestId)
        ? { ...m, pending: false, stopped: true, text: m.text === '正在回复…' ? '这次回复先停在这里。' : m.text }
        : m); hasMore = result.hasMore; beforeId = result.before;
      ready = true; $('#storage-label').textContent = '聊天记录已由服务器保留';
      renderMessages(); save(); resizeInput(); if (follow) scrollMessages(true); else area.scrollTop = position;
    } catch (error) { ready = false; $('#storage-label').textContent = '记录尚未同步 · 请刷新重试'; resizeInput(); toast(error.message || '暂时连不上服务器。'); }
    finally { syncing = false; }
  }
  async function loadOlder() {
    try {
      const result = await api(`/api/history?topic=${encodeURIComponent(topicId)}&before=${beforeId}`);
      const height = $('#messages').scrollHeight; state.messages.unshift(...result.messages); hasMore = result.hasMore; beforeId = result.before;
      renderMessages(); $('#messages').scrollTop = $('#messages').scrollHeight - height;
    } catch (error) { toast(error.message); }
  }
  async function showHistory() {
    $('#history-dialog').showModal(); const list = $('#history-list'); list.replaceChildren(element('p','','正在读取记录…'));
    try {
      const result = await api('/api/topics'); list.replaceChildren(); $('#history-content').replaceChildren();
      result.topics.forEach(topic => { const button = element('button','history-topic',`${topic.title}${topic.id === result.currentTopic ? ' · 当前' : ''}`); button.type='button'; button.append(element('small','',`${new Date(topic.created_at).toLocaleDateString('zh-CN')} · ${topic.count} 条记录`)); button.addEventListener('click', () => showArchived(topic.id)); list.append(button); });
    } catch (error) { list.replaceChildren(element('p','reply-error',error.message)); }
  }
  async function showArchived(id, before) {
    try {
      const result = await api(`/api/history?topic=${encodeURIComponent(id)}${before ? `&before=${before}` : ''}`); const box = $('#history-content'); box.replaceChildren();
      if (result.hasMore) { const older = element('button','copy-button','查看更早一页'); older.type='button'; older.addEventListener('click', () => showArchived(id,result.before)); box.append(older); }
      result.messages.forEach(m => { const item=element('div','history-message'); item.append(element('strong','',m.role==='user' ? '你' : '爱蜜莉雅'),element('p','',m.text),element('small','',m.error || (m.stopped ? '已停止' : ''))); appendSources(item, m.sources); box.append(item); });
      if (!result.messages.length) box.append(element('p','','这段对话还没有消息。'));
    } catch(error) { toast(error.message); }
  }
  function finishReply(reply) {
    if (activeReply !== reply) return;
    reply.message.pending = false; activeReply = null; setBusy(false); save(); updatePreferences();
  }
  async function send(text, forceFeature = false, requestId = makeId(), web = state.web, energy = selectedEnergy) {
    text = text.trim().slice(0, 1000); if (!text || activeReply) return;
    if (voice.busy) { toast('先结束说话或取消识别，再发送吧。'); return; }
    if (room.busy) { toast('这个小互动马上就好，稍后再发吧。'); return; }
    if (!ready) { toast('正在读取服务器记录，请稍后再发送。'); return; }
    const intent = !forceFeature && notebookIntent(text);
    if (intent && intent.type !== 'draft') {
      voice.stopPlayback();
      if (intent.type === 'draft') notebook.openDraft(intent.text, intent.kind);
      else if (intent.type === 'search') notebook.openSearch(intent.text);
      else notebook.open(intent.mode);
      return;
    }
    voice.stopPlayback();
    room.beginChat();
    cards.render($('#room-actions'), []);
    setView('chat');
    const user = { id: makeId(), requestId, role: 'user', text }; state.messages.push(user); appendMessage(user); state.unsentText = text;
    $('#chat-input').value = ''; resizeInput(); save(); updatePreferences();
    const message = { id: makeId(), requestId, role: 'assistant', text: '', pending: true, web };
    state.messages.push(message); const row = appendMessage(message); const bubble = row.querySelector('.message-bubble');
    bubble.textContent = '正在想怎么说…';
    const reply = { controller: new AbortController(), message, row }; activeReply = reply;
    energyForRequest.set(requestId, energy);
    setBusy(true); scrollMessages(true);
    room.presentChat(message, '唔……让我想一想。');
    voice.replyStarted(message);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, requestId, topicId, feature: forceFeature, web, energy }), signal: reply.controller.signal });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        if (response.status === 401) $('#login-dialog').showModal();
        throw new Error(problem.error?.message || '连接暂时失败，请稍后重试。');
      }
      if (response.headers.get('content-type')?.includes('application/json')) {
        const result = await response.json(); Object.assign(message, result.message); Object.assign(user, result.user); cards.render($('#room-actions'),message.actions||[]); state.unsentText = ''; energyForRequest.delete(requestId); return;
      }
      if (!response.body) throw new Error('浏览器未能接收回复，请刷新后重试。');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', done = false;
      while (true) {
        const chunk = await reader.read(); buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
          if (!data) continue;
          const event = JSON.parse(data);
          if (activeReply !== reply) return;
          if (event.type === 'start') { user.id = event.userId; message.id = event.messageId; state.unsentText = ''; if (selectedEnergy === energy) selectEnergy(''); save(); }
          if (event.type === 'memory_notice') toast(event.message);
          if (event.type === 'sources') message.sources = event.sources;
          if (event.type === 'action_result') {
            message.actions ||= [];
            if (!event.result.id || !message.actions.some(a => a.id === event.result.id)) message.actions.push(event.result);
            cards.render($('#room-actions'), message.actions);
            cards.render(row.querySelector('.message-actions'), message.actions);
            if (!event.replay) room.acceptAction(event.result);
          }
          if (event.type === 'tool_notice') { $('#chat-status').textContent = event.message; if (!message.text) { bubble.textContent = event.message; room.presentChat(message, event.message); } room.setActivity(event.activity || 'searching'); }
          if (event.type === 'thinking') { $('#chat-status').textContent = '正在认真想一想…'; bubble.textContent = '正在认真想一想…'; room.presentChat(message, '唔……让我认真想一想。'); }
          if (event.type === 'delta') {
            const follow = $('#messages').scrollHeight - $('#messages').scrollTop - $('#messages').clientHeight < 150;
            message.text += event.text; bubble.textContent = message.text; $('#chat-status').textContent = '正在回复…';
            room.presentChat(message);
            voice.replyProgress(message);
            if (follow) scrollMessages(true);
          }
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'done') {
            done = true; message.model = event.model; message.truncated = event.truncated;
            if (event.message) Object.assign(message, event.message);
            state.unsentText = '';
            energyForRequest.delete(requestId);
            if (message.text.trim().replace(/[。！!]+$/, '') === UNSUPPORTED_TEXT) { message.role = 'feature'; message.text = text; }
            $('#model-detail').textContent = `当前模型：${event.model} · 阿里云百炼`;
          }
        }
        if (chunk.done) break;
      }
      if (!done) throw new Error('连接中断，回复没有完整收到，可以重试。');
    } catch (error) {
      if (activeReply !== reply || reply.controller.signal.aborted) return;
      reply.controller.abort();
      message.error = error instanceof TypeError ? '网络连接失败，请检查连接后重试。' : error.message;
      message.retryText = text;
      if (!message.text) message.text = '这次没有收到回复。';
    } finally {
      if (activeReply === reply) {
        finishReply(reply); renderMessages(); room.presentChat(message); scrollMessages();
        if (room.mode === 'chat' && !room.busy) voice.replyFinished(message);
        if (!message.error) await syncHistory();
      }
      else if (reply.controller.signal.aborted && !activeReply) { await syncHistory(); await room.sync(); }
    }
  }
  function stopReply() {
    if (!activeReply) return;
    const reply = activeReply; reply.controller.abort(); reply.message.stopped = true;
    voice.stopPlayback();
    if (!reply.message.text) reply.message.text = '这次回复先停在这里。';
    finishReply(reply); renderMessages(); scrollMessages(true);
    room.presentChat(reply.message);
  }
  async function refreshStatus() {
    try {
      const response = await fetch('/api/status'); if (!response.ok) throw new Error(); const status = await response.json();
      $('#model-badge').textContent = status.configured ? '千问 AI 对话' : '等待配置模型';
      $('#model-detail').textContent = `当前模型：${status.model} · 阿里云百炼${status.configured ? '' : ' · 密钥未配置'}`;
      if (!status.authenticated && !$('#login-dialog').open) $('#login-dialog').showModal();
      if (status.authenticated) { await syncHistory(); await room.sync(); }
    } catch { $('#model-badge').textContent = '后台连接不可用'; $('#model-detail').textContent = '请通过正在运行的服务端地址打开小窝。'; }
  }
  async function copyRequest(request) {
    const text = `直觉哥哥，我想给小窝加个功能：\n${request}`;
    try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(text); toast('需求已复制，可以发给直觉哥哥啦。'); }
    catch { $('#copy-text').value = text; $('#copy-dialog').showModal(); $('#copy-text').select(); }
  }
  function showSettings() { $('#nickname').value = state.nickname; $('#motion').checked = state.motion; $('#settings-dialog').showModal(); }
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a.brand'); if (!target) return;
    if (target.matches('a.brand')) { event.preventDefault(); setView('home'); return; }
    if (target.dataset.view) setView(target.dataset.view);
    if (target.dataset.prompt) { if (activeReply) { toast('可以等这句说完，或者点停止。'); return; } send(target.dataset.prompt); }
    if (target.hasAttribute('data-close')) target.closest('dialog').close();
    if (['settings', 'about'].includes(target.dataset.action)) showSettings();
    if (target.dataset.action === 'feature') { $('#feature-dialog').showModal(); $('#feature-input').focus(); }
    if (target.dataset.action === 'clear') $('#clear-dialog').showModal();
    if (target.dataset.action === 'history') showHistory();
  });
  bindComposer({ form: $('#chat-form'), input: $('#chat-input'), button: $('#send-button'), submit: send,
    changed: () => { state.unsentText = $('#chat-input').value; resizeInput(); save(); } });
  $('#stop-button').addEventListener('click', stopReply);
  function selectEnergy(value) {
    selectedEnergy = value;
    document.querySelectorAll('[data-energy]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.energy === value)));
    const descriptions = { bright: '下一条可以多聊一点', gentle: '下一条短一点、少追问', quiet: '下一条轻轻回应，不主动追问' };
    $('#energy-hint').textContent = descriptions[value] || '可选 · 只影响下一条回复';
  }
  document.querySelectorAll('[data-energy]').forEach(button => button.addEventListener('click', () => selectEnergy(selectedEnergy === button.dataset.energy ? '' : button.dataset.energy)));
  $('#web-enabled').addEventListener('change', event => { state.web = event.target.checked; save(); });
  $('#settings-form').addEventListener('submit', (event) => { event.preventDefault(); state.nickname = $('#nickname').value.trim().slice(0, 20); state.motion = $('#motion').checked; save(); updatePreferences(); $('#settings-dialog').close(); toast('小窝设置已更新。'); });
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('#login-button'); button.disabled = true; $('#login-error').textContent = '';
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#access-password').value }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || '暂时没能进入，请稍后重试。');
      $('#access-password').value = ''; $('#login-dialog').close(); toast('欢迎回到小窝。可以继续发送消息啦。'); await refreshStatus();
    } catch (error) { $('#login-error').textContent = error instanceof TypeError ? '网络连接失败，请稍后再试。' : error.message; }
    finally { button.disabled = false; }
  });
  $('#feature-form').addEventListener('submit', (event) => { event.preventDefault(); const value = $('#feature-input').value.trim(); if (!value) return; if (activeReply) { toast('先等当前回复结束，再生成需求卡。'); return; } $('#feature-dialog').close(); $('#feature-input').value = ''; send(value, true); });
  $('#confirm-clear').addEventListener('click', async () => {
    if (activeReply) { toast('先停止当前回复，再开始新对话吧。'); return; }
    voice.suspend();
    try { await api('/api/topics', {}); $('#clear-dialog').close(); await syncHistory(); toast('旧对话已保留，我们换个话题吧。'); } catch(error) { toast(error.message); }
  });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
  window.addEventListener('pagehide', () => { if (activeReply) stopReply(); save(); });
  window.addEventListener('focus', () => { if (ready && !activeReply) { syncHistory(); room.sync(); } });
  $('#hero-character').addEventListener('error', () => { $('#hero-character').hidden = true; $('.art-fallback').hidden = false; });
  $('#hero-character').addEventListener('load', () => { $('#hero-character').hidden = false; $('.art-fallback').hidden = true; });
  if ($('#hero-character').complete && !$('#hero-character').naturalWidth) { $('#hero-character').hidden = true; $('.art-fallback').hidden = false; }
  const now = new Date(); $('#date-label').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  load(); $('#web-enabled').checked = state.web; $('#chat-input').value = state.unsentText; updatePreferences(); renderMessages(); setView(location.hash.slice(1)); resizeInput(); refreshStatus();
})();

import { NOTES } from './notes.js';
import { roomLine } from './room-lines.js';
import { createChibi } from './chibi.js';
import { OUTFITS, PLACES, readAppearance, saveAppearance, placeForAction } from './appearance.js';
import { createCharacterState } from './character-state.js';
import { OUTFIT_LINES } from './outfit-lines.js';

export function createRoom({ api, toast, onChat, onRead, onInteraction = () => {}, stopVoice, isBusy }) {
  const $ = s => document.querySelector(s), shell = $('#home-view');
  const expressions = { normal: '00', happy: '03', surprised: '02', shy: '00', worried: '04' };
  const expressionLabels = { normal: '微笑', happy: '闭眼开心', surprised: '张嘴回应', shy: '轻轻微笑', worried: '有点慌张' };
  const props = { pudding: '🍮', cookie: '🍪', tea: '☕', rock: '✊', paper: '✋', scissors: '✌' };
  let state, pending = null, acting = false, initialized = false, dialogue, latestChat, mode = 'event', menu = '', timer, bubbleTimer;
  const chibi = createChibi({ onAssetError: toast }); let interactionStarted = false, poseTimer;
  function pose(name) { clearTimeout(poseTimer); chibi.pose(name); if (name !== 'idle' && name !== 'rest') poseTimer = setTimeout(() => chibi.pose('idle'), 6500); }
  const actor = createCharacterState({ shell, label: $('#character-activity'), pose: name => { clearTimeout(poseTimer); chibi.pose(name); } });
  let bag = [], currentNote, noteSaved = {};
  const look = readAppearance(localStorage);
  let currentMood = 'normal';
  try { noteSaved = JSON.parse(localStorage.getItem('sora-companion:room:v1') || '{}') || {}; } catch { /* Optional card cache. */ }
  if (Array.isArray(noteSaved.bag)) bag = [...new Set(noteSaved.bag)].filter(id => NOTES.some(n => n.id === id));
  currentNote = NOTES.find(n => n.id === noteSaved.lastNote);
  for (const id of ['02', '03', '04']) { const preload = new Image(); preload.src = 'assets/arona/arona-' + id + '.png'; }
  function expression(name = 'normal') {
    const safe = Object.hasOwn(expressions, name) ? name : 'normal';
    currentMood = safe;
    const outfit = OUTFITS.find(x => x.id === look.outfit);
    const src = look.outfit === 'original' ? 'assets/arona/arona-' + expressions[safe] + '.png' : outfit.src;
    if ($('#hero-character').getAttribute('src') !== src) $('#hero-character').src = src;
    $('#hero-character').alt = look.outfit === 'original' ? '阿罗娜' + expressionLabels[safe] : 'Q 版阿罗娜 · ' + outfit.name;
    $('#character-frame').dataset.expression = safe;
    $('#wardrobe-current').textContent = outfit.name;
    $('#costume-option').disabled = look.outfit === 'original';
    chibi.setOutfit(look.outfit);
  }
  function renderPlace() {
    const place = PLACES.find(x => x.id === look.place);
    shell.dataset.location = place.id;
    shell.dataset.scene = place.id === 'room' ? state?.scene || 'day' : 'day';
    const bg = $('#room-background');
    if (bg.getAttribute('src') !== place.src || bg.hidden) { bg.hidden = false; bg.src = place.src; }
    $('#room-scene-caption').textContent = place.id === 'room' ? ({ day: place.caption, rain: '小雨落在窗外，你坐在这里。', night: '今晚，也有一盏灯为你亮着。' }[state?.scene || 'day']) : place.caption;
    $('#location-label').textContent = place.icon + ' ' + place.name;
    $('#return-room').hidden = place.id === 'room';
    document.querySelectorAll('[data-place]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.place === place.id)));
    document.querySelectorAll('button[data-scene]').forEach(button => button.setAttribute('aria-pressed', String(place.id === 'room' && button.dataset.scene === state?.scene)));
  }
  function changePlace(id) {
    if (!PLACES.some(x => x.id === id)) return;
    look.place = id; renderPlace();
    if (!saveAppearance(localStorage, look)) toast('本机暂时记不住外观选择，刷新后需要重新选哦。');
  }
  function visit(id) {
    if (acting || isBusy() || !state) return;
    return perform('place', id);
  }
  function wardrobe() {
    const list = $('#wardrobe-list'); list.replaceChildren();
    for (const outfit of OUTFITS) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit-card';
      button.setAttribute('aria-pressed', String(outfit.id === look.outfit));
      const img = document.createElement('img'); img.src = outfit.src; img.alt = ''; img.loading = 'lazy';
      const line = OUTFIT_LINES[outfit.id];
      const label = document.createElement('span'); label.textContent = outfit.name;
      button.append(img); button.append(label);
      const voiceLabel = document.createElement('small'); voiceLabel.className = 'outfit-voice-style'; voiceLabel.textContent = '♪ ' + line.style + '配音'; button.append(voiceLabel);
      button.addEventListener('click', () => {
        if (acting || isBusy()) { toast('先等这句话说完，再换衣服吧。'); return; }
        look.outfit = outfit.id; chibi.setStyle(outfit.id === 'original' ? 'chibi' : 'costume'); expression(currentMood);
        if (!saveAppearance(localStorage, look)) toast('这套先穿着，刷新后需要重新选哦。');
        stopVoice();
        $('#wardrobe-dialog').close(); say(line.zh, 'event', line.mood);
        choices([['出去逛逛', () => openMenu('outing')], ['再试一套', () => openMenu('wardrobe')]]);
      });
      list.append(button);
    }
    $('#wardrobe-dialog').showModal();
  }
  function say(text, kind = 'event', mood = 'normal', message, withVoice = true) {
    if (kind === 'event') { $('#room-actions').hidden = true; actor.chat('idle'); }
    mode = kind; expression(mood); $('#room-line').textContent = text;
    $('#dialogue-kind').textContent = kind === 'chat' ? 'AI 对话' : '小窝互动';
    dialogue = message || { id: 'room-' + Date.now(), role: 'assistant', text };
    $('#room-expand').hidden = kind !== 'chat' || !(text.length > 110 || message?.sources?.length || message?.error || message?.role === 'feature');
    $('#room-read').disabled = Boolean(message?.pending || message?.error || !text.trim());
    if (withVoice && kind === 'event' && interactionStarted && !document.hidden) onInteraction(text);
  }
  function choices(items = []) {
    const box = $('#room-choices'); box.replaceChildren();
    for (const [label, fn] of items) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = acting || isBusy() || !state; button.addEventListener('click', fn); box.append(button); }
  }
  function controls() {
    const blocked = acting || isBusy() || !state;
    document.querySelectorAll('[data-room-menu], #character-interaction, #letter-object, button[data-scene], [data-place], #return-room, #room-choices button').forEach(button => { button.disabled = blocked; });
    $('#room-retry').hidden = !pending || acting; $('#room-read').disabled = isBusy() || acting || !dialogue?.text || Boolean(dialogue?.error);
  }
  function renderState() {
    if (!state) return;
    look.place = PLACES.some(p => p.id === state.place) ? state.place : 'room';
    saveAppearance(localStorage, look);
    renderPlace();
    $('#affection-stage').textContent = state.stage; $('#affection-meter').max = state.next; $('#affection-meter').value = state.affection;
    $('#affection-number').textContent = state.affection + ' / ' + state.next;
    $('#affection-detail').textContent = '♡ ' + state.stage + ' · ' + state.affection + ' / 24。' + (state.teaUnlocked ? '小茶会和新的欢迎语已经解锁。' : '达到 12 点，解锁小茶会和新的欢迎语。');
    const milestones = [['初次来访', 'event:welcome', 4], ['摸摸头', 'pet', 2], ['分享布丁', 'snack:pudding', 2], ['分享饼干', 'snack:cookie', 2], ['分享热饮', 'snack:tea', 2], ['玩一局猜拳', 'rps', 3], ['桌上的信', 'event:letter', 4], ['雨天看窗外', 'event:rain', 5]];
    $('#milestone-list').replaceChildren();
    for (const [label, id, points] of milestones) { const done = state.completed.includes(id), item = document.createElement('div'); item.className = done ? 'done' : ''; item.textContent = (done ? '✓ ' : '○ ') + label + ' · ' + (done ? '已收藏' : '+' + points); $('#milestone-list').append(item); }
    $('#tea-event').disabled = !state.teaUnlocked; $('#tea-event').textContent = state.teaUnlocked ? '参加我们的小茶会 ☕' : '熟悉后解锁小茶会'; $('#keepsake').hidden = !state.keepsakeUnlocked;
    controls();
  }
  async function sync() {
    if (acting) return;
    try {
      state = await api('/api/room'); renderState();
      if (!initialized) {
        initialized = true;
        if (!state.completed.includes('event:welcome')) openMenu('welcome', false);
        else { say(state.teaUnlocked ? '你回来啦！杯子已经摆好了，今天想先做什么？' : '呀，你来啦！小窝的位置一直留着呢。', 'event', 'happy'); choices([['聊聊今天', () => openMenu('chat')], ['看看桌上的信', () => openMenu('letter')]]); }
      }
    } catch (error) { if (!initialized) { $('#room-line').textContent = '互动进度暂时没读到，连上小窝后再试一次吧。'; $('#room-retry').hidden = false; } toast(error.message); }
  }
  function effect(result) {
    clearTimeout(timer); clearTimeout(bubbleTimer); $('#wash-scene').hidden = true;
    const frame = $('#character-frame'); frame.classList.remove('reacting', 'sparkles');
    $('#character-effect').textContent = result.effect === 'sparkles' ? '✦ ✧' : '';
    $('#character-prop').textContent = props[result.prop] || '';
    if (result.effect) { void frame.offsetWidth; frame.classList.add('reacting'); if (result.effect === 'sparkles') frame.classList.add('sparkles'); }
    if (result.effect === 'wash') {
      $('#wash-scene').hidden = false;
      timer = setTimeout(() => { $('#wash-scene').hidden = true; if (mode === 'event') say('回来啦！清清爽爽的，接下来做什么呢？', 'event', 'happy'); }, 2400);
    } else timer = setTimeout(() => { frame.classList.remove('reacting', 'sparkles'); $('#character-prop').textContent = ''; }, 2400);
    const notice = result.unlocks?.[0] || (result.gain ? '♡ 好感 +' + result.gain : result.event ? '✧ ' + result.event : '✧ 收到啦');
    $('#room-bubble').textContent = notice; $('#room-bubble').hidden = false;
    bubbleTimer = setTimeout(() => { $('#room-bubble').hidden = true; }, 3300);
    for (const text of result.unlocks || []) toast(text);
  }
  async function perform(action, choice = '', retry = false) {
    if (acting || isBusy()) { toast('先等这句话说完，或点停止，再来玩吧。'); return; }
    if (!state) { await sync(); return; }
    interactionStarted = true; setLog(false); $('#room-result').hidden = true;
    if (!retry) pending = { action, choice, requestId: crypto.randomUUID() };
    if (!pending) return;
    const turn = pending; acting = true; stopVoice(); controls(); $('#chat-status').textContent = '阿罗娜准备中…';
    try {
      const result = await api('/api/room/action', turn); pending = null; state = result.state;
      $('#chat-status').textContent = '小窝互动 · 已保存';
      changePlace(state.place || placeForAction(turn.action, look.place)); renderState();
      say(result.line, 'event', result.expression, undefined, turn.action !== 'place'); effect(result);
      pose(turn.action === 'snack' && turn.choice === 'pudding' ? 'snack' : turn.action === 'daily' && turn.choice === 'rest' ? 'rest' : turn.action === 'rps' ? 'play' : 'happy');
      if (turn.action === 'letter') { drawNote(false); $('#note-dialog').showModal(); }
      if (turn.action === 'place') choices(turn.choice === 'cafe' ? [['挑一份点心', () => openMenu('snack')], ['回房间', () => visit('room')]] : turn.choice === 'room' ? [['聊聊今天', () => openMenu('chat')], ['看看桌上的信', () => openMenu('letter')]] : [['在这里猜拳', () => openMenu('rps')], ['回房间', () => visit('room')]]);
      else if (turn.action === 'rps') {
        const names = { rock: '石头', paper: '布', scissors: '剪刀' };
        $('#chat-status').textContent = '你：' + names[turn.choice] + ' · 阿罗娜：' + names[result.opponent];
        $('#room-result').hidden = false;
        $('#rps-you').textContent = props[turn.choice] + ' 你出了' + names[turn.choice];
        $('#rps-arona').textContent = props[result.opponent] + ' 阿罗娜出了' + names[result.opponent];
        $('#rps-outcome').textContent = { win:'你赢啦！', lose:'阿罗娜赢啦！', draw:'平局，再来一次？' }[result.outcome];
        choices([['再来一局', () => openMenu('rps')], ['先歇一会儿', () => openMenu('daily')]]);
      } else if (turn.action === 'scene' && state.scene === 'rain') choices([['一起看雨', () => openMenu('rain')], ['拿杯热饮', () => perform('snack', 'tea')]]);
      else if (turn.action === 'snack') choices([['换一份点心', () => openMenu('snack')], ['聊两句', () => openMenu('chat')]]);
      else if (turn.action === 'pet') choices([['再摸一下', () => perform('pet')], ['一起玩', () => openMenu('rps')]]);
      else { $('#chat-status').textContent = '小窝互动 · 已保存'; choices([['聊聊今天', () => openMenu('chat')], ['拆张小纸条', () => openMenu('letter')]]); }
    } catch (error) { $('#chat-status').textContent = error.message; toast(error.message); }
    finally { acting = false; controls(); }
  }
  function openMenu(name, userGesture = true) {
    if (acting || isBusy()) { toast('先结束当前回复或录音，再来玩吧。'); return; }
    stopVoice(); clearTimeout(timer); $('#wash-scene').hidden = true; $('#character-prop').textContent = '';
    if (userGesture) interactionStarted = true;
    setLog(false); menu = name; $('#room-result').hidden = true;
    pose(name === 'rps' ? 'play' : name === 'pet' || name === 'welcome' ? 'happy' : 'idle');
    document.querySelectorAll('[data-room-menu]').forEach(button => button.classList.toggle('selected', button.dataset.roomMenu === name));
    if (name === 'wardrobe') { wardrobe(); return; }
    if (name === 'outing') { say('小小出游计划～今天想去哪里呀？', 'event', 'happy', undefined, false); choices(PLACES.map(place => [place.icon + ' ' + place.name, () => visit(place.id)])); return; }
    if (name === 'pet') { perform('pet'); return; }
    if (name === 'chat') {
      say(roomLine('chat'), 'event', 'happy');
      const topic = (id) => { say(roomLine(id), 'event', 'happy'); choices(); onChat(); $('#chat-input').focus(); };
      choices([['今天有件开心事', () => topic('chat_happy')], ['今天有点累', () => topic('chat_tired')], ['随便聊两句', () => topic('chat_any')]]);
      onChat(); return;
    }
    if (name === 'welcome') { say('呀，你来啦！这里是阿罗娜的小窝。要坐这边吗？', 'event', 'happy'); choices([['坐在你旁边', () => perform('welcome', 'sit')], ['先参观一下', () => perform('welcome', 'look')]]); }
    if (name === 'snack') { say('今天的小点心时间！唔……选哪一个呢？', 'event', 'surprised'); choices([['🍮 布丁', () => perform('snack', 'pudding')], ['🍪 饼干', () => perform('snack', 'cookie')], ['☕ 热饮', () => perform('snack', 'tea')]]); }
    if (name === 'rps') { say('石头、剪刀、布！我已经想好要出什么啦。', 'event', 'happy'); choices([['✊ 石头', () => perform('rps', 'rock')], ['✌ 剪刀', () => perform('rps', 'scissors')], ['✋ 布', () => perform('rps', 'paper')]]); }
    if (name === 'daily') { say(roomLine('daily_menu')); choices([['☂ 看窗外', async () => { if (state?.scene !== 'rain') await perform('scene', 'rain'); if (state?.scene === 'rain') openMenu('rain'); }], ['☾ 靠一会儿', () => perform('daily', 'rest')], ['安静陪我', () => perform('daily', 'rest')]]); }
    if (name === 'rain') { say('窗外下起小雨啦。你看，玻璃上有一串小水珠。', 'event', 'shy'); choices([['一起看雨', () => perform('rain', 'watch')], ['捧杯热饮', () => perform('rain', 'tea')]]); }
    if (name === 'letter') { perform('letter', 'open'); }
    if (name === 'tea_event') { say('欢迎来到我们的小茶会！杯子也要认真选哦。', 'event', 'happy'); choices([['蓝色的杯子', () => perform('tea_event', 'blue')], ['粉色的杯子', () => perform('tea_event', 'pink')]]); }
  }
  function presentChat(message, status) {
    actor.chat(message.error ? 'error' : message.pending ? message.text ? 'replying' : 'thinking' : 'idle'); $('#room-result').hidden = true;
    latestChat = message; clearTimeout(timer); $('#wash-scene').hidden = true;
    say(message.role === 'feature' ? '当前功能暂不适用，去找直觉哥哥加一下吧' : message.text || status || '唔……让我想一想。', 'chat', message.error ? 'worried' : message.pending ? 'surprised' : 'normal', message);
    if (message.error) { $('#chat-status').textContent = message.error; setLog(true); }
    choices();
  }
  function setLog(open) {
    shell.classList.toggle('log-open', open); $('#messages').hidden = !open; $('#recent-summary').hidden = open;
    $('#toggle-log').setAttribute('aria-expanded', String(open)); $('#log-chevron').textContent = open ? '收起 ↓' : '展开 ↑';
    if (open) requestAnimationFrame(() => { $('#messages').scrollTop = $('#messages').scrollHeight; });
  }
  function persistNote() { try { localStorage.setItem('sora-companion:room:v1', JSON.stringify({ ...noteSaved, lastNote: currentNote?.id || '', bag })); } catch { $('.note-footer').textContent = '本机存储不可用，纸条仍然可以抽取。'; } }
  function drawNote(next = true) {
    if (next || !currentNote) {
      if (!bag.length) { bag = NOTES.map(n => n.id); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } if (bag.at(-1) === currentNote?.id) [bag[0], bag[bag.length - 1]] = [bag.at(-1), bag[0]]; }
      const selectedId = bag.pop();
      currentNote = NOTES.find(n => n.id === selectedId);
    }
    const n = currentNote; $('#note-number').textContent = 'LITTLE NOTE / ' + String(NOTES.indexOf(n) + 1).padStart(2, '0');
    $('#note-art').textContent = n.art; $('#note-title').textContent = n.title; $('#note-text').textContent = n.text; $('#note-kind').textContent = n.kind; $('#note-response').textContent = ''; $('#note-choices').replaceChildren();
    for (const choice of n.choices || []) { const button = document.createElement('button'); button.type = 'button'; button.textContent = choice.text; button.addEventListener('click', async () => { if (choice.scene) await perform('scene', choice.scene); $('#note-response').textContent = choice.reply; }); $('#note-choices').append(button); }
    persistNote();
  }
  document.querySelectorAll('[data-room-menu]').forEach(button => button.addEventListener('click', () => openMenu(button.dataset.roomMenu)));
  document.querySelectorAll('[data-place]').forEach(button => button.addEventListener('click', () => { $('#scene-menu').hidden = true; $('#scene-menu-button').setAttribute('aria-expanded', 'false'); visit(button.dataset.place); }));
  $('#return-room').addEventListener('click', () => visit('room'));
  $('#character-style').addEventListener('change', () => {
    if ($('#character-style').value !== 'costume') { look.outfit = 'original'; saveAppearance(localStorage, look); expression(currentMood); }
  });
  $('#character-interaction').addEventListener('click', () => perform('pet'));
  $('#letter-object').addEventListener('click', () => openMenu('letter'));
  $('#scene-menu-button').addEventListener('click', () => { $('#scene-menu').hidden = !$('#scene-menu').hidden; $('#scene-menu-button').setAttribute('aria-expanded', String(!$('#scene-menu').hidden)); });
  document.querySelectorAll('button[data-scene]').forEach(button => button.addEventListener('click', () => { $('#scene-menu').hidden = true; $('#scene-menu-button').setAttribute('aria-expanded', 'false'); perform('scene', button.dataset.scene); }));
  $('#toggle-log').addEventListener('click', () => setLog($('#messages').hidden));
  $('#room-expand').addEventListener('click', () => setLog(true));
  $('#room-read').addEventListener('click', () => { if (dialogue?.text && !acting && !isBusy()) onRead(dialogue); });
  $('#room-retry').addEventListener('click', () => pending ? perform('', '', true) : sync());
  $('#affection-button').addEventListener('click', () => { renderState(); $('#affection-dialog').showModal(); });
  $('#tea-event').addEventListener('click', () => { $('#affection-dialog').close(); openMenu('tea_event'); });
  $('#note-next').addEventListener('click', () => drawNote(true));
  $('#room-background').addEventListener('error', () => { $('#room-background').hidden = true; toast('这张背景暂时没加载出来，重新选择场景再试试吧。'); });
  $('#room-background').addEventListener('load', () => { $('#room-background').hidden = false; });
  $('#chat-options-button').addEventListener('click', () => { const open = $('#chat-options').hidden; $('#chat-options').hidden = !open; $('#chat-options-button').setAttribute('aria-expanded', String(open)); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('#scene-menu').hidden = true; $('#scene-menu-button').setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); clearTimeout(poseTimer); $('#wash-scene').hidden = true; chibi.pose('idle'); } });
  if (look.outfit !== 'original') chibi.setStyle('costume');
  expression(); renderPlace(); controls();
  actor.reset();
  return { sync, presentChat, controls,
    setActivity: value => actor.chat(value), voiceState: value => actor.voice(value),
    acceptAction(result) {
      if (!result.ok) return;
      if (result.state) { state = result.state; renderState(); expression(result.expression); effect(result); actor.reaction(result.action === 'snack' && result.choice === 'pudding' ? 'snack' : result.action === 'daily' ? 'rest' : 'happy'); }
      else if (result.item) actor.chat('noting');
    },
    get busy() { return acting; }, latest(message) { latestChat = message; }, beginChat() { mode = 'chat'; actor.reset(); actor.chat('thinking'); choices(); stopVoice(); }, get mode() { return mode; } };
}

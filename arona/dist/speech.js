import { encodeWav } from './speech-utils.js';
import { createSpeechQueue, createSpeechSegmenter } from './speech-stream.js';
import { PRESET_AUDIO } from './preset-audio.js';
import { OUTFIT_AUDIO } from './outfit-audio.js';
import { createPresetCache } from './preset-player.js';

export function createVoice({ toast, canRecord, onTranscript, onBusyChange, onStateChange = () => {} }) {
  const $ = selector => document.querySelector(selector);
  const mic = $('#mic-button'), cancel = $('#mic-cancel'), status = $('#voice-status');
  const audio = $('#voice-audio'), bar = $('#speech-player'), play = $('#speech-resume');
  let recording = null, reading = null, automatic = null, pendingText = '', presetSequence = 0;
  const loadPreset = createPresetCache();
  const interactionToggle = $('#interaction-voice'); interactionToggle.checked = true;
  try { interactionToggle.checked = localStorage.getItem('sora-companion:interaction-voice') !== 'false'; } catch { /* Optional preference. */ }
  const languageSelect = $('#speech-language'), languageKey = 'sora-companion:speech-language';
  let language = 'ja';
  try { if (localStorage.getItem(languageKey) === 'zh') language = 'zh'; } catch { /* Optional preference. */ }
  languageSelect.value = language;
  const languageName = value => value === 'ja' ? '日语' : '中文';
  try { $('#auto-speak').checked = localStorage.getItem('sora-companion:auto-speak') === 'true'; } catch { /* Optional preference. */ }
  function recordingUI() {
    onStateChange(recording?.phase === 'recording' ? 'listening' : recording?.phase === 'permission' ? 'permission' : recording ? 'recognizing' : 'idle');
    mic.setAttribute('aria-pressed', String(recording?.phase === 'recording'));
    mic.querySelector('span').textContent = recording?.phase === 'recording' ? '结束说话' : '点一下说话';
    mic.disabled = Boolean(recording && recording.phase !== 'recording'); cancel.hidden = !recording;
    $('#voice-controls').classList.toggle('is-recording', recording?.phase === 'recording'); onBusyChange();
  }
  function stopTracks(job) {
    clearInterval(job.timer); job.stream?.getTracks().forEach(track => track.stop());
  }
  function cancelRecording(quiet = false) {
    const job = recording; if (!job) return;
    recording = null; job.controller.abort(); clearInterval(job.timer);
    if (job.recorder?.state === 'recording') job.recorder.stop();
    stopTracks(job); job.chunks = []; recordingUI();
    status.textContent = quiet ? '点击开始说话，再点结束，识别后自动发送。' : '已取消，小窝不会保存这段音频。';
  }
  async function request(url, body, signal, type = 'application/json') {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body, signal });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 401 && !$('#login-dialog').open) $('#login-dialog').showModal();
      throw new Error(error.error?.message || '语音服务暂时不可用，请重试。');
    }
    return response;
  }
  async function wavFromBlob(blob, signal) {
    // Decode Safari MP4 or Chromium WebM locally; the server receives only PCM WAV.
    const Context = window.AudioContext || window.webkitAudioContext;
    const context = new Context();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer()); signal.throwIfAborted();
      if (!Number.isFinite(buffer.duration) || buffer.duration < 0.25 || buffer.duration > 61) throw new Error('每次请说 1—60 秒，再点结束。');
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offline = new Offline(1, Math.ceil(buffer.duration * 16000), 16000), source = offline.createBufferSource();
      source.buffer = buffer; source.connect(offline.destination); source.start();
      const mono = await offline.startRendering(); signal.throwIfAborted();
      return new Blob([encodeWav(mono.getChannelData(0))], { type: 'audio/wav' });
    } catch (error) {
      if (error.name === 'EncodingError' || error.name === 'NotSupportedError') throw new Error('当前浏览器无法转换这段录音，请换 Safari、Chrome 或 Edge 再试。');
      throw error;
    } finally { await context.close().catch(() => {}); }
  }
  function insertTranscript(text, autoSend = false) {
    if (typeof text !== 'string' || !text.trim()) { status.textContent = '没有听清内容，请再说一次。'; return; }
    const outcome = onTranscript(text.trim(), { autoSend });
    if (outcome) {
      pendingText = ''; $('#voice-result-box').hidden = true;
      status.textContent = outcome === 'sent' ? '已识别，正在发送…' : '已保留到草稿，点击发送即可；原有草稿不会自动发出。';
    } else {
      pendingText = text; $('#voice-result').value = text; $('#voice-result-box').hidden = false;
      status.textContent = '输入框放不下了。识别内容留在下面，整理草稿后可再次填入。';
    }
  }
  async function transcribe(job) {
    stopTracks(job); if (recording !== job) return;
    job.phase = 'recognizing'; recordingUI(); status.textContent = '正在听清你说的话…';
    const timer = setTimeout(() => job.controller.abort('timeout'), 85000);
    let transcript;
    try {
      const blob = new Blob(job.chunks, { type: job.recorder.mimeType }); job.chunks = [];
      const wav = await wavFromBlob(blob, job.controller.signal);
      const result = await (await request('/api/speech/recognize', wav, job.controller.signal, 'audio/wav')).json();
      if (recording === job && !job.controller.signal.aborted) transcript = result.text;
    } catch (error) {
      if (recording === job) status.textContent = job.controller.signal.reason === 'timeout' ? '语音识别超时了，请重试。' : error instanceof TypeError ? '网络连接失败，请重新录制。' : error.message;
    } finally {
      clearTimeout(timer); job.chunks = []; stopTracks(job);
      if (recording === job) {
        recording = null; recordingUI();
        if (!job.controller.signal.aborted && transcript !== undefined) insertTranscript(transcript, true);
      }
    }
  }
  async function startRecording() {
    if (!canRecord()) { toast('等当前回复结束、记录同步好，就可以说话啦。'); return; }
    if (pendingText) { toast('先把上一次识别的文字填入，或收起它再录音。'); return; }
    if (!window.isSecureContext) { status.textContent = '麦克风需要 HTTPS 地址。部署服务器后请使用 HTTPS 打开。'; return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !(window.AudioContext || window.webkitAudioContext) || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) {
      status.textContent = '当前浏览器不支持录音，请用 Safari、Chrome 或 Edge 打开，也可以用键盘自带的语音输入。'; return;
    }
    stopPlayback(); window.dispatchEvent(new Event('sora:voice-start'));
    const job = { phase: 'permission', controller: new AbortController(), chunks: [], size: 0 }; recording = job;
    recordingUI(); status.textContent = '请在浏览器提示里允许使用麦克风…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false });
      if (recording !== job) { stream.getTracks().forEach(track => track.stop()); return; }
      job.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      job.recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 96000 });
      job.recorder.ondataavailable = event => {
        if (recording !== job || !event.data.size) return;
        job.size += event.data.size;
        if (job.size > 6 * 1024 * 1024) { cancelRecording(); status.textContent = '这段录音太大，请缩短后再试。'; return; }
        job.chunks.push(event.data);
      };
      job.recorder.onstop = () => transcribe(job);
      job.recorder.onerror = () => { if (recording === job) { cancelRecording(); status.textContent = '录音中断了，请检查麦克风后重试。'; } };
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (recording === job && job.phase === 'recording') { cancelRecording(); status.textContent = '麦克风已断开，请重新录制。'; }
      }));
      job.recorder.start(500); job.phase = 'recording'; job.started = Date.now(); recordingUI();
      const tick = () => {
        if (recording !== job || job.phase !== 'recording') return;
        const seconds = Math.floor((Date.now() - job.started) / 1000);
        status.textContent = `正在听 · ${seconds} / 60 秒，再点一下结束。`;
        if (seconds >= 60) finishRecording();
      };
      job.timer = setInterval(tick, 250); tick();
    } catch (error) {
      if (recording !== job) return; cancelRecording();
      status.textContent = ({ NotAllowedError: '麦克风权限未开启。请在地址栏或浏览器设置里允许后重试。', NotFoundError: '没有找到麦克风，请连接设备后重试。', NotReadableError: '麦克风可能被其他应用占用，请关闭后重试。' })[error.name] || '暂时无法录音，请检查麦克风或换浏览器重试。';
    }
  }
  function finishRecording() {
    const job = recording; if (job?.phase !== 'recording') return;
    job.phase = 'recognizing'; clearInterval(job.timer); job.recorder.stop(); stopTracks(job); recordingUI();
    status.textContent = '正在整理录音…';
  }
  function updateButtons() {
    document.querySelectorAll('[data-speech-id]').forEach(button => {
      const selected = reading?.id === button.dataset.speechId;
      button.textContent = selected ? '■ 停止朗读' : '♫ 朗读'; button.setAttribute('aria-pressed', String(selected));
    });
  }
  function stopPlayback() {
    if (automatic) automatic.cancelled = true;
    const job = reading; reading = null; job?.queue.cancel(); job?.controller.abort();
    audio.pause(); audio.removeAttribute('src'); audio.load();
    if (job?.url) URL.revokeObjectURL(job.url);
    bar.hidden = true; play.hidden = true; updateButtons(); onStateChange('idle');
  }
  async function playReady(job) {
    try { await audio.play(); if (reading === job) { play.hidden = true; $('#speech-status').textContent = `阿罗娜 · 萌宝 · ${languageName(job.language)}配音 · 第 ${job.queue.index + 1} 段${job.queue.closed ? ` / 共 ${job.queue.length} 段` : ' · 边回复边朗读'}`; } }
    catch (error) {
      if (reading !== job) return;
      if (error.name === 'NotAllowedError') { play.hidden = false; onStateChange('idle'); $('#speech-status').textContent = '声音已准备好，点一下播放。'; }
      else { stopPlayback(); toast('这段声音暂时无法播放，请重试。'); }
    }
  }
  function startReading(message, presetPath) {
    window.dispatchEvent(new Event('sora:voice-start'));
    const job = { id: String(message.id), language, presetPath, started: Date.now(), controller: new AbortController() };
    // Local timing only: no text, credentials or audio are logged or persisted.
    Object.assign(bar.dataset, { firstAudioMs: '', firstAudioAfterTextMs: '', beganDuringReply: '', replyCompleteMs: '' });
    job.queue = createSpeechQueue({
      async prepare(text) {
        job.controller.signal.throwIfAborted();
        const timer = setTimeout(() => job.controller.abort('timeout'), 85000);
        try {
          return job.presetPath ? await loadPreset(job.presetPath, job.controller.signal)
            : await (await request('/api/speech/synthesize', JSON.stringify({ text, language: job.language }), job.controller.signal)).blob();
        } finally { clearTimeout(timer); }
      },
      async play(blob) {
        if (reading !== job) return;
        if (job.url) URL.revokeObjectURL(job.url);
        job.url = URL.createObjectURL(blob); audio.src = job.url; await playReady(job);
      },
      waiting() {
        if (reading !== job) return;
        onStateChange('idle'); play.hidden = true;
        $('#speech-status').textContent = job.queue.index ? '等下一句完整的话…' : '第一句话出来就开始准备配音…';
      },
      preparing() {
        if (reading !== job) return;
        onStateChange('preparing'); play.hidden = true;
        $('#speech-status').textContent = `${job.language === 'ja' && !job.presetPath ? '正在翻译并准备日语配音' : `正在准备${languageName(job.language)}配音`} · 第 ${job.queue.index + 1} 段`;
      },
      complete() { if (reading === job) stopPlayback(); },
      failed(error) {
        if (reading !== job) return;
        const timedOut = job.controller.signal.reason === 'timeout';
        stopPlayback(); toast(timedOut ? '生成声音超时了，请重试。' : error instanceof TypeError ? '朗读连接失败，请稍后重试。' : error.message);
      },
    });
    reading = job; bar.hidden = false; updateButtons(); return job;
  }
  function speak(message, { presetOnly = false } = {}) {
    if (recording) { toast('先结束说话或取消录音，再听回复吧。'); return; }
    if (reading?.id === String(message.id)) { stopPlayback(); return; }
    stopPlayback(); const presetPath = (OUTFIT_AUDIO[message.text] || PRESET_AUDIO[message.text])?.[language];
    if (presetOnly && !presetPath) { toast('这句互动配音还没准备好。'); return; }
    const parts = presetPath ? [message.text] : createSpeechSegmenter().push(message.text, true); if (!parts.length) { toast('这条回复没有可朗读的文字。'); return; }
    const job = startReading(message, presetPath); job.queue.append(parts); job.queue.finish();
  }
  const messageKey = message => message.requestId || String(message.id);
  const canAutoRead = message => $('#auto-speak').checked && !document.hidden && document.body.dataset.view === 'chat' && !recording && message.role === 'assistant' && !message.error && !message.stopped;
  function replyStarted(message) {
    stopPlayback();
    automatic = { key: messageKey(message), source: '', segmenter: createSpeechSegmenter(), cancelled: !canAutoRead(message) };
    if (!automatic.cancelled) { automatic.job = startReading(message); automatic.job.queue.append([]); }
  }
  function replyProgress(message, final = false) {
    if (!automatic || automatic.key !== messageKey(message) || automatic.cancelled) return;
    if (!canAutoRead(message) || !message.text.startsWith(automatic.source)) { stopPlayback(); return; }
    const delta = message.text.slice(automatic.source.length); automatic.source = message.text;
    if (delta.trim() && automatic.job.firstTextAt === undefined) automatic.job.firstTextAt = Date.now();
    automatic.job.id = String(message.id);
    automatic.job.queue.append(automatic.segmenter.push(delta, final));
    if (final) { bar.dataset.replyCompleteMs = String(Date.now() - automatic.job.started); automatic.job.queue.finish(); }
  }
  audio.addEventListener('playing', () => {
    if (!reading || audio.paused) return;
    if (!bar.dataset.firstAudioMs) {
      bar.dataset.firstAudioMs = String(Date.now() - reading.started);
      bar.dataset.firstAudioAfterTextMs = reading.firstTextAt === undefined ? '' : String(Date.now() - reading.firstTextAt);
      bar.dataset.beganDuringReply = String(!reading.queue.closed);
    }
    onStateChange('speaking');
  });
  audio.addEventListener('pause', () => { if (audio.paused && !recording) onStateChange('idle'); });
  audio.addEventListener('waiting', () => { if (reading) onStateChange('preparing'); });
  audio.addEventListener('ended', () => { onStateChange('idle'); reading?.queue.next(); });
  audio.addEventListener('error', () => { if (reading && audio.getAttribute('src')) { stopPlayback(); toast('声音加载失败，请重新点朗读。'); } });
  play.addEventListener('click', () => { if (reading) playReady(reading); });
  $('#speech-stop').addEventListener('click', stopPlayback);
  mic.addEventListener('click', () => recording ? finishRecording() : startRecording());
  cancel.addEventListener('click', () => cancelRecording());
  $('#voice-insert').addEventListener('click', () => { if (pendingText) insertTranscript(pendingText); });
  $('#voice-dismiss').addEventListener('click', () => { pendingText = ''; $('#voice-result').value = ''; $('#voice-result-box').hidden = true; });
  $('#auto-speak').addEventListener('change', event => {
    try { localStorage.setItem('sora-companion:auto-speak', String(event.target.checked)); } catch { /* Optional preference. */ }
    if (!event.target.checked) stopPlayback();
  });
  languageSelect.addEventListener('change', () => {
    language = languageSelect.value === 'zh' ? 'zh' : 'ja'; languageSelect.value = language;
    stopPlayback();
    try { localStorage.setItem(languageKey, language); } catch { /* Optional preference. */ }
    toast(`已切换${languageName(language)}配音，点朗读即可听到。`);
  });
  interactionToggle.addEventListener('change', () => {
    try { localStorage.setItem('sora-companion:interaction-voice', String(interactionToggle.checked)); } catch { /* Optional preference. */ }
    if (!interactionToggle.checked && reading?.presetPath) stopPlayback();
  });
  const suspend = () => { cancelRecording(true); stopPlayback(); };
  window.addEventListener('pagehide', suspend);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
  window.addEventListener('sora:music-start', suspend);
  return {
    get busy() { return Boolean(recording); }, suspend, stopPlayback, speak, replyStarted, replyProgress,
    speakPreset(text) {
      if (interactionToggle.checked && !recording && !document.hidden) speak({ id: 'preset-' + (++presetSequence), text }, { presetOnly: true });
    },
    addButton(parent, message) {
      if (message.role !== 'assistant' || message.pending || message.error || !message.text?.trim()) return;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'copy-button speech-button'; button.dataset.speechId = String(message.id);
      button.addEventListener('click', () => speak(message)); parent.append(button); updateButtonsForOne(button);
    },
    replyFinished(message) {
      if (automatic?.key === messageKey(message)) replyProgress(message, true);
      else if (canAutoRead(message)) speak(message);
    },
  };
  function updateButtonsForOne(button) { const selected = reading?.id === button.dataset.speechId; button.textContent = selected ? '■ 停止朗读' : '♫ 朗读'; button.setAttribute('aria-pressed', String(selected)); }
}

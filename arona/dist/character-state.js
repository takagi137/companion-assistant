// Playback state is driven by media events, never by model claims about speaking.
export function createCharacterState({ shell, label, pose }) {
  let chat = 'idle', voice = 'idle', mood = 'idle', last = '', timer;
  const names = { idle: '在这里陪你', permission: '等待麦克风授权', listening: '认真听你说', recognizing: '正在听清你的话', thinking: '唔，让我想一想', searching: '翻一翻小本本', noting: '认真记下来', replying: '正在回答你', preparing: '声音准备中', speaking: '正在说话', error: '这次没连上，再试一下吧' };
  function render() {
    const state = voice !== 'idle' ? voice : chat;
    shell.dataset.activity = state;
    label.textContent = names[state]; label.dataset.activity = state;
    if (state !== last) { pose(state === 'speaking' ? 'happy' : state === 'idle' ? mood : 'idle'); last = state; }
  }
  return {
    chat(value) { chat = Object.hasOwn(names, value) ? value : 'idle'; render(); },
    voice(value) { voice = Object.hasOwn(names, value) ? value : 'idle'; render(); },
    reaction(value) { clearTimeout(timer); mood = value; if (chat === 'idle' && voice === 'idle') { last = ''; render(); } timer = setTimeout(() => { mood = 'idle'; last = ''; render(); }, 5000); },
    reset() { clearTimeout(timer); chat = voice = mood = 'idle'; last = ''; render(); },
  };
}

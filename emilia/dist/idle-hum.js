import { IDLE_CLIPS } from './idle-audio.js';
import { createIdleScheduler } from './idle-scheduler.js';
import { createIdleClipPicker } from './idle-selection.js';
const $=s=>document.querySelector(s), status=$('#idle-hum-status');
const audio=new Audio();audio.preload='none';audio.volume=.28;
audio.id='idle-hum-audio';audio.hidden=true;document.body.append(audio);
let storage;try{storage=sessionStorage;}catch{}
const nextClip=createIdleClipPicker(IDLE_CLIPS,{storage});
const captions={soft:'♫ 轻轻哼～',bright:'♫ 啦啦啦～',sleepy:'♫ 困困小调～'};
function busy(){
 return document.hidden || $('#home-view').hidden || $('#home-view').dataset.activity!=='idle'
  || !$('#speech-player').hidden || $('#music-embed').childElementCount>0
  || Boolean(document.querySelector('dialog[open]'))
  || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')
  || Boolean($('#chat-input').value.trim());
}
function stop(){audio.pause();audio.removeAttribute('src');audio.load();$('#character-frame').classList.remove('idle-humming');status.hidden=true;status.textContent='';}
async function play(){
 const clip=nextClip();if(!clip)return;
 audio.dataset.clip=clip.id;audio.src=clip.src;
 await audio.play();
}
const scheduler=createIdleScheduler({canPlay:()=>!busy(),play,stop,onError:()=>{status.hidden=false;status.textContent='点一下页面，稍后再哼给你听';}});
scheduler.enable(true);
audio.addEventListener('playing',()=>{$('#character-frame').classList.add('idle-humming');status.hidden=false;status.textContent=captions[audio.dataset.clip]||'♫ 哼哼～';});
audio.addEventListener('ended',stop);
audio.addEventListener('error',()=>{if(audio.getAttribute('src'))stop();});
for(const name of ['pointerdown','keydown','input','wheel'])document.addEventListener(name,()=>scheduler.touch(),{passive:true});
document.addEventListener('visibilitychange',()=>scheduler.suspend());
window.addEventListener('pagehide',()=>scheduler.dispose());
window.addEventListener('pageshow',()=>scheduler.enable(true));
window.addEventListener('sora:music-start',()=>scheduler.suspend());
window.addEventListener('sora:voice-start',()=>scheduler.suspend());
new MutationObserver(()=>scheduler.suspend()).observe($('#home-view'),{attributes:true,attributeFilter:['data-activity','hidden']});

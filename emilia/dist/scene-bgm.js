import { SCENE_BGM } from './scene-bgm-assets.js';
import { bgmScene,bgmPolicy } from './scene-bgm-policy.js';
const $=s=>document.querySelector(s),shell=$('#home-view'),toggle=$('#scene-bgm-enabled'),slider=$('#scene-bgm-volume'),label=$('#scene-bgm-status');
const audio=$('#scene-bgm-audio');audio.loop=true;audio.preload='none';
const credits=document.createElement('details');credits.className='scene-bgm-credits';
const summary=document.createElement('summary');summary.textContent='场景曲目与来源';credits.append(summary);
for(const track of Object.values(SCENE_BGM)){
 const line=document.createElement('p'),link=document.createElement('a');
 link.href=track.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent=track.name;
 line.append(`${track.style}：`,link);credits.append(line);
}
const attribution=document.createElement('p'),license=document.createElement('a');
license.href='https://creativecommons.org/licenses/by/4.0/';license.target='_blank';license.rel='noopener noreferrer';license.textContent='CC BY 4.0';
attribution.append('音乐：Kevin MacLeod (incompetech.com) · ',license,'；原曲未改编。');credits.append(attribution);label.after(credits);
let armed=false,key='',volume=.16,version=0;
try{toggle.checked=localStorage.getItem('emilia-companion:scene-bgm')!=='false';const saved=localStorage.getItem('emilia-companion:scene-bgm-volume');if(saved!==null)volume=Math.max(0,Math.min(.5,Number(saved)||0));}catch{}
slider.value=String(Math.round(volume*100));
function sync(){
 const scene=bgmScene(shell.dataset.location,shell.dataset.scene),track=SCENE_BGM[scene];
 const title=`${track.style} · ${track.name}`;
 const policy=bgmPolicy({enabled:toggle.checked,armed,hidden:document.hidden,roomHidden:shell.hidden,externalMusic:$('#music-embed').childElementCount>0,activity:shell.dataset.activity,voiceVisible:!$('#speech-player').hidden,humming:$('#character-frame').classList.contains('idle-humming'),volume});
 audio.volume=policy.volume;
 if(key!==scene){version++;audio.pause();key=scene;audio.src=track.src;audio.dataset.scene=scene;}
 if(!policy.play){version++;audio.pause();label.textContent=toggle.checked?`${title} · ${armed?'暂歇一下':'点一下页面开始'}`:'场景音乐已关闭';return;}
 if(!audio.paused){label.textContent='♫ '+title;return;}
 const token=++version;
 audio.play().then(()=>{if(token===version)label.textContent='♫ '+title;}).catch(error=>{if(token!==version)return;armed=false;label.textContent=error.name==='NotAllowedError'?'点「播放场景音乐」开始': '场景音乐暂时没加载到，请再试一次';});
}
function arm(){armed=true;sync();}
// Touch pointerdown is too early for mobile media activation. Retry inside the
// completed gesture, even if an earlier play attempt is still being rejected.
for(const event of ['touchend','click','keydown'])document.addEventListener(event,arm,{passive:true});
toggle.addEventListener('change',()=>{armed=true;try{localStorage.setItem('emilia-companion:scene-bgm',String(toggle.checked));}catch{}sync();});
slider.addEventListener('input',()=>{volume=Number(slider.value)/100;try{localStorage.setItem('emilia-companion:scene-bgm-volume',String(volume));}catch{}sync();});
$('#scene-bgm-play').addEventListener('click',()=>{toggle.checked=true;armed=true;try{localStorage.setItem('emilia-companion:scene-bgm','true');}catch{}sync();});
const observer=new MutationObserver(sync);
observer.observe(shell,{attributes:true,attributeFilter:['data-location','data-scene','data-activity','hidden']});
observer.observe($('#music-embed'),{childList:true});observer.observe($('#speech-player'),{attributes:true,attributeFilter:['hidden']});observer.observe($('#character-frame'),{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',()=>{version++;audio.pause();});window.addEventListener('pageshow',sync);
audio.addEventListener('error',()=>{if(audio.getAttribute('src')){armed=false;label.textContent='场景音乐加载失败，点播放重试';}});
sync();

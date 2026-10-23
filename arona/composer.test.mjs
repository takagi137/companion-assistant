import test from 'node:test';
import assert from 'node:assert/strict';
import { bindComposer, acceptTranscript } from './dist/composer.js';
test('speech auto sends only a fresh draft and retains blocked or oversized text safely',()=>{
  const input={value:''},sent=[];let changes=0;
  const run=(text,canSend=true,autoSend=true)=>acceptTranscript({input,text,autoSend,canSend:()=>canSend,submit:t=>sent.push(t),changed:()=>changes++});
  assert.equal(run('你好'),'sent');assert.deepEqual(sent,['你好']);
  input.value='我还没写完';assert.equal(run('识别内容'),true);assert.equal(input.value,'我还没写完\n识别内容');assert.equal(sent.length,1);
  input.value='';assert.equal(run('等待发送',false),true);assert.equal(input.value,'等待发送');assert.equal(sent.length,1);
  input.value='a'.repeat(999);assert.equal(run('超长内容'),false);assert.equal(input.value.length,999);
  input.value='';assert.equal(run('手动填回',true,false),true);assert.equal(sent.length,1);assert.equal(changes,4);
});
test('click and Enter send the same current input and click cancels duplicate native submit', () => {
  const form=new EventTarget(),input=new EventTarget(),button=new EventTarget(),sent=[]; let changes=0;
  bindComposer({form,input,button,submit:text=>sent.push(text),changed:()=>changes++});
  input.value='鼠标发送'; const click=new Event('click',{cancelable:true}); button.dispatchEvent(click);
  assert.equal(click.defaultPrevented,true); assert.deepEqual(sent,['鼠标发送']);
  input.value='键盘发送'; const key=new Event('keydown',{cancelable:true}); Object.assign(key,{key:'Enter'}); input.dispatchEvent(key);
  assert.deepEqual(sent,['鼠标发送','键盘发送']); assert.equal(key.defaultPrevented,true);
  for (const flags of [{shiftKey:true},{isComposing:true},{repeat:true}]) {const e=new Event('keydown',{cancelable:true});Object.assign(e,{key:'Enter',...flags});input.dispatchEvent(e);}
  assert.equal(sent.length,2);
  for (const type of ['input','change','compositionend']) input.dispatchEvent(new Event(type));
  assert.equal(changes,3);
  input.value='表单发送';form.dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(sent.at(-1),'表单发送');
});

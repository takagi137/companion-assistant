// Isolated DOM substitutes only. No browser, network, audio or screenshot access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotebook } from './dist/notebook.js';
import { createLocationsPanel } from './dist/locations.js';
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
class Element extends EventTarget {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.attributes = {}; this.hidden = false; this.disabled = false; this.value = ''; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(value) { throw new Error('Untrusted HTML insertion: ' + value); }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  querySelectorAll(selector) { const tags = selector.split(','); return this.children.flatMap(c => [...(tags.includes(c.tag) ? [c] : []), ...c.querySelectorAll(selector)]); }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
function environment(t, api) {
  const root = new Element('body'), utilities = new Element('div'), input = new Element('textarea'); root.append(utilities); input.value = '耳机在蓝色包侧袋';
  const document = { body: root, createElement: tag => new Element(tag), querySelector: selector => selector === '.room-utilities' ? utilities : selector.includes('#chat-input') ? input : null };
  for (const [key, value] of Object.entries({ document, window: { confirm: () => true } })) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => prior ? Object.defineProperty(globalThis, key, prior) : delete globalThis[key]);
  }
  const toasts = [], notebook = createNotebook({ api, toast: value => toasts.push(value) });
  const all = tag => root.querySelectorAll(tag);
  const button = label => all('button').find(b => b.textContent === label);
  const editor = all('form').find(f => f.className === 'notebook-editor');
  const text = all('textarea')[0], date = all('input').find(n => n.type === 'date');
  return { notebook, root, input, toasts, all, button, editor, text, date, submit: () => editor.dispatchEvent(new Event('submit', { cancelable: true })) };
}
test('save waits for server success; failure keeps draft and request ID for manual retry', async t => {
  const requests = []; let rejectSave, resolveSave;
  const e = environment(t, (url, body) => { if (!body) return Promise.resolve({ items: [] }); requests.push(body); return new Promise((resolve, reject) => { rejectSave = reject; resolveSave = resolve; }); });
  e.notebook.openDraft('耳机在蓝色包侧袋'); e.submit();
  assert.deepEqual(e.toasts, []); assert.equal(e.button('确认保存').disabled, true);
  rejectSave(new Error('连接中断')); await settle();
  assert.equal(e.editor.hidden, false); assert.equal(e.text.value, '耳机在蓝色包侧袋'); assert.deepEqual(e.toasts, []);
  assert.match(e.root.textContent, /连接中断/); assert.equal(requests.length, 1);
  e.submit(); assert.equal(requests[0].requestId, requests[1].requestId); assert.match(requests[0].requestId, /^[0-9a-f-]{36}$/);
  resolveSave({ item: { id: 'saved' } }); await settle();
  assert.equal(e.editor.hidden, true); assert.equal(e.toasts.length, 1);
});
test('draft copies chat without clearing it; note hides and clears due date', async t => {
  const saved = []; const e = environment(t, async (url, payload) => { if (payload) saved.push(payload); return { items: [] }; });
  e.notebook.openDraft('', 'todo'); e.button('填入聊天草稿').click();
  assert.equal(e.text.value, e.input.value); assert.equal(e.input.value, '耳机在蓝色包侧袋');
  e.date.value = '2026-10-23';
  const kind = e.all('select').find(s => s.attributes['aria-label'] === '记录类型'); kind.value = 'note'; kind.dispatchEvent(new Event('change'));
  assert.equal(e.date.value, ''); assert.equal(e.editor.children.find(n => n.children.includes(e.date)).hidden, true);
  e.submit(); await settle(); assert.equal(saved[0].dueDate, ''); assert.equal(saved[0].status, 'open'); assert.equal(e.input.value, '耳机在蓝色包侧袋');
});
test('editing completed todo into a note resets status without an extra save confirmation', async t => {
  const saved = []; const item = { id: 'task', version: 3, kind: 'todo', status: 'done', text: '交材料', dueDate: '2026-10-23' };
  const e = environment(t, async (url, body) => { if (body) saved.push(body); return { items: [item] }; });
  e.notebook.open('todo'); await settle();
  assert.equal(e.all('select').find(s => s.attributes['aria-label'] === '待办状态').value, 'open');
  e.button('修改').click(); const kind = e.all('select').find(s => s.attributes['aria-label'] === '记录类型'); kind.value = 'note'; kind.dispatchEvent(new Event('change'));
  window.confirm = () => { throw new Error('unexpected confirmation'); }; e.submit(); await settle();
  assert.equal(saved[0].status, 'open'); assert.equal(saved[0].dueDate, ''); assert.equal(saved[0].version, 3); assert.equal('requestId' in saved[0], false);
});
test('history results render as text with original source and query limit, hiding old editor', async t => {
  const urls = []; const attack = '<img src=x onerror=alert(1)>';
  const e = environment(t, async url => { urls.push(url); return { messages: [{ id: 42, topic_id: 'topic-a', role: 'user', text: attack, created_at: '2026-10-16T10:00:00Z' }], hasMore: true }; });
  e.notebook.openDraft('unfinished'); e.notebook.openSearch('耳'.repeat(120)); await settle();
  assert.equal(new URL(urls[0], 'http://local').searchParams.get('q').length, 100);
  assert.equal(e.editor.hidden, true); assert.match(e.root.textContent, /来源消息 #42 · 话题 topic-a/); assert.ok(e.root.textContent.includes(attack));
  assert.match(e.root.textContent, /2026/); assert.match(e.root.textContent, /增加关键词/);
});

test('location editor keeps failed draft and request id, renders history as text',async t=>{
 const e=environment(t,async()=>({items:[]}));let attempts=[],failOnce=true;
 const item={id:'item-1',name:'钥匙',location:'玄关第二个抽屉',aliases:'家门钥匙',note:'',version:1,updatedAt:'2026-10-22T10:00:00Z'};
 const panel=createLocationsPanel({toast:()=>{},api:async(url,payload)=>{if(payload){attempts.push(payload);if(failOnce){failOnce=false;throw new Error('网络暂时中断');}return {item};}if(url.includes('/history'))return {item,history:[{location:'<img src=x onerror=alert(1)>',recordedAt:item.updatedAt,version:1}]};return {items:[item]};}});
 const root=panel.root;root.hidden=false;
 const all=tag=>root.querySelectorAll(tag),click=label=>all('button').find(b=>b.textContent===label).click();
 await panel.load();click('更新位置');
 const form=all('form').find(f=>f.className==='location-editor');
 const location=all('input').find(i=>i.attributes['aria-label']==='放在哪里');location.value='蓝色包侧袋';
 form.dispatchEvent(new Event('submit',{cancelable:true}));await settle();assert.equal(form.hidden,false);assert.match(root.textContent,/网络暂时中断/);
 form.dispatchEvent(new Event('submit',{cancelable:true}));await settle();assert.equal(attempts[0].requestId,attempts[1].requestId);assert.equal(attempts[0].version,1);assert.equal(form.hidden,true);
 await panel.openItem(item.id);assert.ok(root.textContent.includes('<img src=x onerror=alert(1)>'));
});

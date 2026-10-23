import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp, getConfig } from './server.mjs';

async function start(t, password='') {
  const server=createApp({...getConfig({}),databasePath:':memory:',password});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}`;
  return {server,url,post:(route,body,headers={})=>fetch(url+route,{method:'POST',headers:{Origin:url,'Content-Type':'application/json',...headers},body:JSON.stringify(body)})};
}
test('notebook APIs preserve auth and CSRF protection without model calls',async t=>{
  const app=await start(t,'notebook-test-only');
  assert.equal((await fetch(app.url+'/api/notebook')).status,401);
  assert.equal((await fetch(app.url+'/api/notebook/search?q=耳机')).status,401);
  assert.equal((await app.post('/api/notebook/save',{kind:'note',text:'耳机'})).status,401);
  const login=await app.post('/api/login',{password:'notebook-test-only'});
  const Cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await app.post('/api/notebook/save',{kind:'note',text:'耳机'},{Cookie,Origin:'https://example.com'})).status,403);
  const payload={kind:'note',text:'耳机在蓝色包侧袋',requestId:randomUUID()};
  const saved=await app.post('/api/notebook/save',payload,{Cookie}); assert.equal(saved.status,200); const {item}=await saved.json();
  const repeat=await (await app.post('/api/notebook/save',payload,{Cookie})).json(); assert.equal(repeat.item.id,item.id);
  const list=await (await fetch(app.url+'/api/notebook?q=耳机',{headers:{Cookie}})).json(); assert.equal(list.items.length,1);
  const edited=await app.post('/api/notebook/save',{...item,text:'耳机在书桌'},{Cookie}); assert.equal(edited.status,200);
  assert.equal((await app.post('/api/notebook/save',{...item,text:'过期修改'},{Cookie})).status,409);
  const current=(await edited.json()).item;
  assert.equal((await app.post('/api/notebook/delete',{id:current.id,version:current.version},{Cookie})).status,200);
  assert.equal((await (await fetch(app.url+'/api/notebook',{headers:{Cookie}})).json()).items.length,0);
});
test('todo due dates and history search include real source messages',async t=>{
  const app=await start(t);
  const save=await app.post('/api/notebook/save',{kind:'todo',text:'交材料',dueDate:'2026-10-23'}); assert.equal(save.status,200);
  const {item}=await save.json();
  assert.equal((await app.post('/api/notebook/save',{...item,status:'done'})).status,200);
  assert.equal((await (await fetch(app.url+'/api/notebook?kind=todo&status=open')).json()).items.length,0);
  assert.equal((await app.post('/api/notebook/save',{kind:'todo',text:'错误日期',dueDate:'2026-02-30'})).status,400);
  app.server.store.begin(app.server.store.currentTopic(),randomUUID(),'想玩星露谷');
  const found=await (await fetch(app.url+'/api/notebook/search?q=星露谷')).json();
  assert.equal(found.messages[0].text,'想玩星露谷'); assert.ok(found.messages[0].id); assert.ok(found.messages[0].created_at);
});

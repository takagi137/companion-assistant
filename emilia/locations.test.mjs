import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createStore} from './store.mjs';
import {createApp,getConfig} from './server.mjs';
import {locationIntent} from './location-intent.mjs';
import {runChatTool} from './chat-tools.mjs';

test('location phrases accept facts but exclude uncertainty, plans, quotes and questions',()=>{
 assert.deepEqual(locationIntent('钥匙放在玄关第二个抽屉。'),{type:'save',name:'钥匙',location:'玄关第二个抽屉'});
 assert.deepEqual(locationIntent('我把耳机放到了蓝色包侧袋'),{type:'save',name:'耳机',location:'蓝色包侧袋'});
 assert.deepEqual(locationIntent('钥匙在哪？'),{type:'find',name:'钥匙'});
 assert.deepEqual(locationIntent('我的钥匙放在哪里了？'),{type:'find',name:'钥匙'});
 for(const text of ['钥匙好像放在书桌','我准备把钥匙放在书桌','不要记住钥匙放在书桌','如果钥匙放在书桌呢','“钥匙放在书桌”','钥匙放在书桌吗','钥匙放在书桌还是包里','昨天钥匙放在书桌','我想把钥匙放在书桌','钥匙放在书桌会不会丢','钥匙放在书桌吧','我记得钥匙放在书桌'])assert.equal(locationIntent(text),null,text);
});
test('position updates are versioned, retries idempotent, alias search and history preserve previous facts',t=>{
 const store=createStore(':memory:');t.after(()=>store.close());
 const first={name:'钥匙',location:'玄关第二个抽屉',aliases:'家门钥匙',note:'蓝色挂件',requestId:randomUUID()};
 const a=store.locations.save(first).item;assert.equal(store.locations.save(first).item.id,a.id);
 assert.throws(()=>store.locations.save({...first,location:'书桌'}),e=>e.status===409);
 assert.throws(()=>store.locations.save({...first,requestId:randomUUID()}),e=>e.status===409);
 const b=store.locations.save({...a,location:'蓝色包侧袋',requestId:randomUUID()}).item;assert.equal(b.version,2);
 assert.throws(()=>store.locations.save({...a,location:'旧页面误写',requestId:randomUUID()}),e=>e.status===409);
 assert.equal(store.locations.list('家门').items[0].location,'蓝色包侧袋');
 assert.deepEqual(store.locations.history(a.id).history.map(x=>x.location),['蓝色包侧袋','玄关第二个抽屉']);
 store.locations.save({name:'车钥匙',location:'书桌',aliases:'钥匙',requestId:randomUUID()});assert.equal(store.locations.list('钥匙').items.length,2);
 assert.equal(store.notebook.list().items.length,0,'ordinary notes remain separate');
 const tool=runChatTool(store,randomUUID(),{name:'location_search',arguments:JSON.stringify({query:'钥匙'})});assert.equal(tool.items.length,2);
 assert.equal(runChatTool(store,randomUUID(),{name:'location_save',arguments:JSON.stringify({id:a.id,version:1,name:a.name,location:'过期',aliases:'',note:''})}).ok,false);
});
test('real HTTP location chat works without LLM, persists receipts, rejects cross-origin and protects access',async t=>{
 const server=createApp({...getConfig({}),apiKey:'',databasePath:':memory:',password:'location-test'},{fetchImpl:()=>{throw new Error('must not call model');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const origin='http://127.0.0.1:'+server.address().port;
 let Cookie='';const post=(url,data,extra={})=>fetch(origin+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie,...extra},body:JSON.stringify(data)});
 assert.equal((await fetch(origin+'/api/locations')).status,401);
 assert.equal((await post('/api/locations/save',{name:'钥匙',location:'书桌',requestId:randomUUID()})).status,401);
 Cookie=(await post('/api/login',{password:'location-test'})).headers.get('set-cookie').split(';')[0];
 assert.equal((await post('/api/locations/save',{},{Origin:'https://other.example'})).status,403);
 const turn={text:'钥匙放在玄关第二个抽屉',requestId:randomUUID(),topicId:server.store.currentTopic()};
 const saved=await post('/api/chat',turn);assert.equal(saved.status,200);const reply=await saved.json();assert.match(reply.message.text,/记好了/);assert.equal(reply.message.actions[0].type,'location_save');
 await post('/api/chat',turn);assert.equal(server.store.locations.history(reply.message.actions[0].item.id).history.length,1);
 await post('/api/chat',{...turn,requestId:randomUUID(),text:'钥匙放在蓝色包侧袋'});
 const found=await (await post('/api/chat',{...turn,requestId:randomUUID(),text:'钥匙在哪？'})).json();assert.match(found.message.text,/最后记录：钥匙在蓝色包侧袋/);assert.match(found.message.text,/记录时间/);
 const missing=await (await post('/api/chat',{...turn,requestId:randomUUID(),text:'雨伞在哪？'})).json();assert.match(missing.message.text,/还没有找到/);
 assert.equal(server.store.locations.history(reply.message.actions[0].item.id).history.length,2);
});

import {randomUUID} from 'node:crypto';
import {NotebookError} from './notebook.mjs';
const bad = (message,status=400) => { throw new NotebookError(status,message); };
const clean = (v,max,label,required=true) => { if(typeof v!=='string'||v.length>max|| (required&&!v.trim()))bad(`${label}请填写 1—${max} 字。`);return v.trim(); };
const key = s => s.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const uuid = s => typeof s==='string' && /^[0-9a-f-]{36}$/i.test(s);
const view = r => r && ({id:r.id,name:r.name,location:r.location,aliases:r.aliases,note:r.note,version:r.version,updatedAt:r.updated_at,createdAt:r.created_at});
export function createLocations(db){
 db.exec(`CREATE TABLE IF NOT EXISTS location_items(id TEXT PRIMARY KEY,name_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,location TEXT NOT NULL,aliases TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS location_history(id INTEGER PRIMARY KEY,item_id TEXT NOT NULL REFERENCES location_items(id),location TEXT NOT NULL,note TEXT NOT NULL,recorded_at TEXT NOT NULL,version INTEGER NOT NULL,UNIQUE(item_id,version));
 CREATE TABLE IF NOT EXISTS location_requests(id TEXT PRIMARY KEY,signature TEXT NOT NULL,result TEXT NOT NULL);`);
 const get = id => view(db.prepare('SELECT * FROM location_items WHERE id=?').get(id));
 const find = name => view(db.prepare('SELECT * FROM location_items WHERE name_key=?').get(key(name)));
 return {get,find,
  list(q=''){
   q=clean(q,100,'搜索词',false);const k=key(q);
   // All candidates remain visible; aliases never silently overwrite another object.
   const rows=db.prepare(`SELECT * FROM location_items WHERE ?='' OR instr(name_key,?)>0 OR instr(lower(aliases),lower(?))>0 OR instr(lower(location),lower(?))>0 ORDER BY CASE WHEN name_key=? THEN 0 ELSE 1 END,updated_at DESC,id LIMIT 201`).all(k,k,q,q,k);
   return {items:rows.slice(0,200).map(view),hasMore:rows.length>200};
  },
  history(id){if(!uuid(id)||!get(id))bad('没有找到这个物品。',404);const rows=db.prepare('SELECT location,note,recorded_at AS recordedAt,version FROM location_history WHERE item_id=? ORDER BY version DESC LIMIT 51').all(id);return {item:get(id),history:rows.slice(0,50),hasMore:rows.length>50};},
  save(body){
   if(!body||!uuid(body.requestId))bad('请求编号无效，请重试。');
   const name=clean(body.name,40,'物品名称'),location=clean(body.location,160,'位置'),aliases=clean(body.aliases??'',100,'别名',false),note=clean(body.note??'',500,'备注',false);
   if(body.id!==undefined&&!uuid(body.id))bad('物品编号无效。');
   const signature=JSON.stringify([body.id??'',body.version??0,name,location,aliases,note]);
   const prior=db.prepare('SELECT * FROM location_requests WHERE id=?').get(body.requestId);
   if(prior){if(prior.signature!==signature)bad('这次请求内容已改变，请重新保存。',409);return {...JSON.parse(prior.result),replayed:true};}
   const existing=body.id?get(body.id):find(name);
   if(body.id&&!existing)bad('这个物品不存在。',404);
   if(existing && (!body.id || body.version!==existing.version))bad('已有同名物品或位置已更新，请刷新后选择“更新位置”。',409);
   if(existing && key(existing.name)!==key(name))bad('请保留物品名称；可在别名中补充其他叫法。');
   const now=new Date().toISOString(),id=existing?.id||randomUUID(),version=(existing?.version||0)+1;
   db.exec('SAVEPOINT location_save');try{
    if(existing){const changed=db.prepare('UPDATE location_items SET location=?,aliases=?,note=?,version=?,updated_at=? WHERE id=? AND version=?').run(location,aliases,note,version,now,id,existing.version);if(!changed.changes)bad('位置已更新，请刷新后再试。',409);}
    else db.prepare('INSERT INTO location_items VALUES(?,?,?,?,?,?,?,?,?)').run(id,key(name),name,location,aliases,note,version,now,now);
    db.prepare('INSERT INTO location_history(item_id,location,note,recorded_at,version) VALUES(?,?,?,?,?)').run(id,location,note,now,version);
    const result={item:get(id)};db.prepare('INSERT INTO location_requests VALUES(?,?,?)').run(body.requestId,signature,JSON.stringify(result));db.exec('RELEASE location_save');return result;
   }catch(e){db.exec('ROLLBACK TO location_save; RELEASE location_save');throw e;}
  }
 };
}
export function locationReply(result){
 if(result.type==='location_save')return `记好了，${result.item.name}放在${result.item.location}。以后找不到时，问我就好。`;
 if(!result.items.length)return '小本本里还没有找到这个物品的位置。可以换个名字查，或者告诉我它放在哪里。';
 if(result.items.length>1)return `找到 ${result.items.length} 个相关物品，请从下面选一下，免得找错。`;
 const item=result.items[0],date=new Date(item.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
 return `最后记录：${item.name}在${item.location}。记录时间是${date}；如果后来挪过，可以告诉我更新。`;
}

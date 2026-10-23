import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNotebook } from './notebook.mjs';

test('notes and todos persist across reopen; changes use optimistic versions', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sora-notebook-'));
  let db;
  try {
    db = new DatabaseSync(path.join(dir,'test.sqlite')); let book = createNotebook(db);
    const note = book.save({kind:'note',text:'耳机在蓝色包侧袋'}).item;
    const todo = book.save({kind:'todo',text:'交材料',dueDate:'2026-10-23'}).item;
    db.close(); db = new DatabaseSync(path.join(dir,'test.sqlite')); book = createNotebook(db);
    assert.equal(book.list({q:'耳机'}).items[0].text,note.text);
    assert.equal(book.list({kind:'todo',status:'open'}).items[0].dueDate,'2026-10-23');
    const edited = book.save({...note,text:'耳机改放书桌'}).item;
    assert.equal(edited.version,2);
    assert.throws(()=>book.save({...note,text:'过期覆盖'}),e=>e.status===409);
    assert.throws(()=>book.delete(note),e=>e.status===409);
    const done = book.save({...todo,status:'done'}).item;
    assert.equal(book.list({kind:'todo',status:'open'}).items.length,0);
    assert.equal(book.list({kind:'todo',status:'done'}).items.length,1);
    book.delete(edited); book.delete(done);
    assert.equal(book.list().items.length,0);
  } finally { db?.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('invalid dates, invalid state and SQL-like searches do not corrupt records', () => {
  const db = new DatabaseSync(':memory:'); const book=createNotebook(db);
  try {
    for (const dueDate of ['2026-02-30','明天','2026-13-01']) assert.throws(()=>book.save({kind:'todo',text:'测试',dueDate}),e=>e.status===400);
    assert.throws(()=>book.save({kind:'note',text:' ',status:'open'}));
    assert.throws(()=>book.save({kind:'note',text:'记事',status:'done'}));
    assert.throws(()=>book.save({kind:'todo',text:'a'.repeat(2001)}));
    book.save({kind:'note',text:'进度100%_已记'});
    assert.equal(book.list({q:'%_'}).items.length,1);
    assert.equal(book.list({q:"' OR 1=1 --"}).items.length,0);
    assert.equal(book.list().items.length,1);
  } finally {db.close();}
});

test('history search returns source IDs across topics and excludes demos/incomplete messages',()=>{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE messages(id INTEGER PRIMARY KEY,topic_id TEXT,role TEXT,text TEXT,created_at TEXT,status TEXT,legacy INTEGER)');
  const insert=db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?)');
  insert.run(1,'first','user','想玩星露谷','2026-10-16','complete',0);
  insert.run(2,'second','assistant','星露谷介绍','2026-10-17','complete',0);
  insert.run(3,'second','assistant','星露谷演示','2026-10-17','complete',1);
  insert.run(4,'second','assistant','星露谷未完成','2026-10-17','streaming',0);
  const book=createNotebook(db);
  try {
    assert.deepEqual(book.search('星露谷').messages.map(x=>x.id),[2,1]);
    assert.equal(book.search('不存在').messages.length,0);
    assert.throws(()=>book.search(''));
    assert.equal(book.search("' OR 1=1 --").messages.length,0);
  } finally {db.close();}
});

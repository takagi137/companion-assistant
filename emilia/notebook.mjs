import { randomUUID } from 'node:crypto';

export class NotebookError extends Error {
  constructor(status, message) { super(message); this.status = status; this.code = 'NOTEBOOK'; }
}
const invalid = message => { throw new NotebookError(400, message); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function query(value = '') {
  if (typeof value !== 'string' || value.length > 100) invalid('搜索词请控制在 100 字以内。');
  return value.trim();
}
function validate(body) {
  if (!body || !['note', 'todo'].includes(body.kind) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000) invalid('请选择记事或待办，填写 1—2000 字内容。');
  const dueDate = body.dueDate ?? '', status = body.status ?? 'open';
  if (typeof dueDate !== 'string' || (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate))) invalid('请明确选择有效的日期。');
  if (!['open', 'done'].includes(status) || (body.kind === 'note' && (dueDate || status !== 'open'))) invalid('只有待办可以设置日期和完成状态。');
  if (body.id !== undefined && !uuid(body.id)) invalid('记录编号无效。');
  if (body.id !== undefined && (!Number.isSafeInteger(body.version) || body.version < 1)) invalid('记录版本无效，请刷新。');
  return { id: body.id, kind: body.kind, text: body.text.trim(), dueDate, status, version: body.version };
}
const view = row => row && ({ id: row.id, kind: row.kind, text: row.text, dueDate: row.due_date, status: row.status, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at });

// Share the existing private-room SQLite connection; never read another room or a raw file.
export function createNotebook(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS notebook_items (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('note','todo')),
    text TEXT NOT NULL, due_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),
    version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notebook_due ON notebook_items(kind,status,due_date);
    CREATE TABLE IF NOT EXISTS notebook_requests (request_id TEXT PRIMARY KEY, signature TEXT NOT NULL, item_id TEXT NOT NULL);`);
  const get = id => view(db.prepare('SELECT * FROM notebook_items WHERE id=?').get(id));
  function conflict(id) {
    if (!get(id)) throw new NotebookError(404, '这条记录已不存在，请刷新。');
    throw new NotebookError(409, '这条记录已在其他页面修改，请刷新后再操作。');
  }
  return {
    get,
    list({ q = '', kind = '', status = '' } = {}) {
      q = query(q);
      if (!['', 'note', 'todo'].includes(kind) || !['', 'open', 'done'].includes(status)) invalid('筛选条件无效。');
      const rows = db.prepare(`SELECT * FROM notebook_items WHERE (?='' OR instr(lower(text),lower(?))>0)
        AND (?='' OR kind=?) AND (?='' OR status=?)
        ORDER BY CASE WHEN kind='todo' AND status='open' THEN 0 ELSE 1 END,
        CASE WHEN due_date='' THEN '9999-12-31' ELSE due_date END, updated_at DESC, id LIMIT 201`).all(q,q,kind,kind,status,status);
      return { items: rows.slice(0,200).map(view), hasMore: rows.length > 200 };
    },
    save(body) {
      const item = validate(body), now = new Date().toISOString();
      if (item.id) {
        const result = db.prepare('UPDATE notebook_items SET kind=?,text=?,due_date=?,status=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(item.kind,item.text,item.dueDate,item.status,now,item.id,item.version);
        if (!result.changes) conflict(item.id);
      } else {
        const requestId = body.requestId;
        if (requestId !== undefined && !uuid(requestId)) invalid('请求编号无效。');
        const signature = JSON.stringify([item.kind,item.text,item.dueDate,item.status]);
        if (requestId) {
          const prior = db.prepare('SELECT * FROM notebook_requests WHERE request_id=?').get(requestId);
          if (prior) {
            if (prior.signature !== signature) throw new NotebookError(409, '这次请求内容已改变，请重新新建记录。');
            const saved = get(prior.item_id);
            if (!saved) throw new NotebookError(409, '这条记录已删除，请重新新建记录。');
            return { item: saved };
          }
        }
        item.id = randomUUID();
        db.exec('SAVEPOINT notebook_save');
        try {
          db.prepare('INSERT INTO notebook_items(id,kind,text,due_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(item.id,item.kind,item.text,item.dueDate,item.status,now,now);
          if (requestId) db.prepare('INSERT INTO notebook_requests VALUES(?,?,?)').run(requestId,signature,item.id);
          db.exec('RELEASE notebook_save');
        } catch(error) { db.exec('ROLLBACK TO notebook_save; RELEASE notebook_save'); throw error; }
      }
      return { item: get(item.id) };
    },
    delete(body) {
      if (!body || !uuid(body.id) || !Number.isSafeInteger(body.version) || body.version < 1) invalid('记录编号或版本无效。');
      const result = db.prepare('DELETE FROM notebook_items WHERE id=? AND version=?').run(body.id,body.version);
      if (!result.changes) conflict(body.id);
      return { ok: true };
    },
    search(raw) {
      const q = query(raw);
      if (!q) invalid('请输入要查找的关键词，比如“耳机”或游戏名。');
      const rows = db.prepare(`SELECT id,topic_id,role,text,created_at FROM messages
        WHERE role IN ('user','assistant') AND status='complete' AND legacy=0 AND instr(lower(text),lower(?))>0
        ORDER BY id DESC LIMIT 51`).all(q);
      return { messages: rows.slice(0,50), hasMore: rows.length > 50 };
    },
  };
}

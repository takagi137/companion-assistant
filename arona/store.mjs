import { DatabaseSync } from 'node:sqlite';
import { mergeSources } from './web.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { initialGame, applyGame, publicGame } from './game.mjs';
import { createNotebook, NotebookError } from './notebook.mjs';

// One private room for one person. All devices signed into it share this database.
export function createStore(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id TEXT NOT NULL REFERENCES topics(id),
      request_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'complete', model TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '', truncated INTEGER NOT NULL DEFAULT 0,
      legacy INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_topic ON messages(topic_id, id);
    CREATE INDEX IF NOT EXISTS messages_request ON messages(request_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS one_user_per_request ON messages(request_id) WHERE role='user';
    CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY CHECK(id=1), text TEXT NOT NULL, through_id INTEGER NOT NULL, updated_at TEXT NOT NULL);
    INSERT OR IGNORE INTO memory VALUES(1, '', 0, '');
    CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, topic_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS room_actions (request_id TEXT PRIMARY KEY, signature TEXT NOT NULL, result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_actions (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, signature TEXT NOT NULL, result TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0, UNIQUE(request_id, signature));
    UPDATE messages SET status='stopped', error='服务重启，上一条回复未完成。' WHERE status='streaming';`);
  const columns = db.prepare('PRAGMA table_info(messages)').all().map(c => c.name);
  if (!columns.includes('sources')) db.exec("ALTER TABLE messages ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'");
  if (!columns.includes('web')) db.exec('ALTER TABLE messages ADD COLUMN web INTEGER NOT NULL DEFAULT 0');
  const get = key => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
  const set = (key, value) => db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  if (!get('room_id')) set('room_id', randomUUID());
  const now = () => new Date().toISOString();
  const gameState = () => JSON.parse(get('arona_game_v1') || JSON.stringify(initialGame()));
  let transactionId = 0;
  function transaction(fn) { const name = 'tx_' + (++transactionId); db.exec(`SAVEPOINT ${name}`); try { const result = fn(); db.exec(`RELEASE ${name}`); return result; } catch (error) { db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`); throw error; } }
  const notebook = createNotebook(db);
  const actionView = row => ({ ...JSON.parse(row.result), id: row.id, undone: Boolean(row.undone) });
  const actions = requestId => db.prepare('SELECT * FROM chat_actions WHERE request_id=? ORDER BY rowid').all(requestId).map(actionView);
  function newTopic() {
    return transaction(() => { const id = randomUUID(); db.prepare('INSERT INTO topics VALUES(?,?,?)').run(id, '新的对话', now()); set('current_topic', id); return id; });
  }
  if (!get('current_topic')) newTopic();
  const insert = (topic, request, role, text = '', status = 'complete', model = '', error = '', legacy = 0) => Number(db.prepare('INSERT INTO messages(topic_id,request_id,role,text,status,model,error,legacy,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(topic, request, role, text, status, model, error, legacy, now()).lastInsertRowid);
  const message = id => db.prepare('SELECT * FROM messages WHERE id=?').get(id);
  function update(id, text, status, model = '', error = '', truncated = false) {
    db.prepare('UPDATE messages SET text=?,status=?,model=?,error=?,truncated=? WHERE id=?').run(text, status, model, error, Number(truncated), id);
  }
  function toUI(row) {
    const user = row.role === 'assistant' ? db.prepare("SELECT text FROM messages WHERE request_id=? AND role='user'").get(row.request_id) : null;
    const feature = row.role === 'assistant' && row.status === 'complete' && row.text.trim().replace(/[。！!]+$/, '') === '当前功能暂不适用，去找直觉哥哥加一下吧';
    return { id: row.id, requestId: row.request_id, role: feature ? 'feature' : row.role, text: feature ? user?.text || row.text : row.text || (row.status === 'streaming' ? '正在回复…' : '这次没有收到回复。'), model: row.model,
      sources: mergeSources([], JSON.parse(row.sources || '[]')), actions: row.role === 'assistant' ? actions(row.request_id) : [], web: Boolean(row.web), error: row.error, stopped: row.status === 'stopped', pending: row.status === 'streaming', legacy: Boolean(row.legacy), truncated: Boolean(row.truncated), retryText: user?.text || '', createdAt: row.created_at };
  }
  return {
    notebook, actions,
    chatAction(requestId, name, args, execute) {
      return transaction(() => {
        const signature = JSON.stringify([name, Object.keys(args).sort().map(k => [k, args[k]])]);
        const prior = db.prepare('SELECT * FROM chat_actions WHERE request_id=? AND signature=?').get(requestId, signature);
        if (prior) {
          if (name === 'notebook_search') { const result = execute(); db.prepare('UPDATE chat_actions SET result=? WHERE id=?').run(JSON.stringify(result), prior.id); return { ...result, id: prior.id, undone: false }; }
          return actionView(prior);
        }
        const result = execute(), id = randomUUID();
        db.prepare('INSERT INTO chat_actions(id,request_id,signature,result) VALUES(?,?,?,?)').run(id, requestId, signature, JSON.stringify(result));
        return { ...result, id, undone: false };
      });
    },
    undoAction(id) {
      return transaction(() => {
        const row = db.prepare('SELECT * FROM chat_actions WHERE id=?').get(id);
        if (!row) throw new NotebookError(404, '没有找到这次操作。');
        if (row.undone) return actionView(row);
        const result = JSON.parse(row.result);
        if (!['notebook_save', 'notebook_update'].includes(result.type)) throw new NotebookError(400, '这次操作不支持撤销。');
        const current = notebook.get(result.item.id);
        if (!current || current.version !== result.item.version) throw new NotebookError(409, '记录已经修改或删除，不能覆盖后续改动；请打开小本本查看。');
        if (result.type === 'notebook_save') notebook.delete({ id: current.id, version: current.version });
        else notebook.save({ ...result.previous, version: current.version });
        db.prepare('UPDATE chat_actions SET undone=1 WHERE id=?').run(id);
        return { ...result, id, undone: true };
      });
    },
    gameState,
    roomState: () => publicGame(gameState()),
    roomAction(turn) {
      return transaction(() => {
        const signature = `${turn.action}:${turn.choice}`, previous = db.prepare('SELECT * FROM room_actions WHERE request_id=?').get(turn.requestId);
        if (previous) {
          if (previous.signature !== signature) throw new Error('Room request ID reused for another action');
          return { ...JSON.parse(previous.result), state: publicGame(gameState()), replayed: true };
        }
        const result = applyGame(gameState(), turn); set('arona_game_v1', JSON.stringify(result.state));
        const output = { state: publicGame(result.state), ...result.response };
        db.prepare('INSERT INTO room_actions VALUES(?,?,?)').run(turn.requestId, signature, JSON.stringify(output));
        // Dedupe recent retries; one-time milestones independently prevent repeated rewards.
        db.exec('DELETE FROM room_actions WHERE rowid < (SELECT COALESCE(MAX(rowid),0)-512 FROM room_actions)');
        return output;
      });
    },
    close: () => db.close(), roomId: () => get('room_id'), currentTopic: () => get('current_topic'), newTopic,
    topics: () => db.prepare('SELECT t.*, (SELECT COUNT(*) FROM messages m WHERE m.topic_id=t.id) AS count FROM topics t ORDER BY created_at DESC').all(),
    hasTopic: id => Boolean(db.prepare('SELECT id FROM topics WHERE id=?').get(id)),
    history(topic, before = Number.MAX_SAFE_INTEGER) {
      const rows = db.prepare('SELECT * FROM messages WHERE topic_id=? AND id<? ORDER BY id DESC LIMIT 101').all(topic, before);
      const hasMore = rows.length > 100; if (hasMore) rows.pop(); rows.reverse();
      return { topicId: topic, messages: rows.map(toUI), hasMore, before: rows[0]?.id || null };
    },
    previous(requestId) { const user = db.prepare("SELECT * FROM messages WHERE request_id=? AND role='user'").get(requestId); const answer = db.prepare("SELECT * FROM messages WHERE request_id=? AND role IN ('assistant','feature') ORDER BY id DESC LIMIT 1").get(requestId); return { user, answer }; },
    begin(topic, requestId, text, feature = false, web = false) {
      return transaction(() => {
        let user = db.prepare("SELECT * FROM messages WHERE request_id=? AND role='user'").get(requestId);
        if (!user) {
          user = message(insert(topic, requestId, 'user', text));
          db.prepare("UPDATE topics SET title=? WHERE id=? AND title='新的对话'").run(text.slice(0, 30), topic);
        }
        const id = insert(topic, requestId, feature ? 'feature' : 'assistant', feature ? text : '', feature ? 'complete' : 'streaming');
        db.prepare('UPDATE messages SET web=? WHERE id IN (?,?)').run(Number(web), user.id, id);
        return { user, answer: message(id) };
      });
    },
    update, message, toUI,
    saveSources(id, sources) { db.prepare('UPDATE messages SET sources=? WHERE id=?').run(JSON.stringify(mergeSources([], sources)), id); },
    context: () => db.prepare("SELECT id,role,text AS content FROM messages WHERE id>(SELECT through_id FROM memory WHERE id=1) AND role IN ('user','assistant') AND status='complete' AND legacy=0 ORDER BY id").all(),
    memory: () => db.prepare('SELECT * FROM memory WHERE id=1').get(),
    saveMemory(text, throughId) { db.prepare('UPDATE memory SET text=?,through_id=?,updated_at=? WHERE id=1').run(text, throughId, now()); },
    import(messages) {
      const hash = createHash('sha256').update(JSON.stringify(messages)).digest('hex');
      const prior = db.prepare('SELECT topic_id FROM imports WHERE id=?').get(hash); if (prior) return { imported: false, topicId: prior.topic_id };
      return transaction(() => {
        const topic = randomUUID(); db.prepare('INSERT INTO topics VALUES(?,?,?)').run(topic, '从旧版浏览器保留的对话', now());
        let request = randomUUID();
        for (const m of messages) { if (m.role === 'user') request = randomUUID(); insert(topic, request, m.role, m.text, m.stopped ? 'stopped' : m.error ? 'error' : 'complete', m.model || '', m.error || '', Number(Boolean(m.legacy))); }
        db.prepare('INSERT INTO imports VALUES(?,?)').run(hash, topic);
        return { imported: true, topicId: topic };
      });
    },
  };
}

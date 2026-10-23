// Explicit commands only: ordinary chat is never silently turned into a saved record.
export function notebookIntent(raw) {
  const text = String(raw || '').trim();
  const note = text.match(/^(?:帮我|请帮我)(?:记住|记一下|记下|记个事)[：:，,\s]*(.+)$/s);
  if (note) return { type: 'draft', kind: 'note', text: note[1].trim() };
  const todo = text.match(/^(?:帮我|请帮我)?(?:添加待办|新增待办|记个待办)[：:，,\s]*(.+)$/s);
  if (todo) return { type: 'draft', kind: 'todo', text: todo[1].trim() };
  const search = text.match(/^(?:帮我)?(?:查旧聊天|搜索聊天记录|查聊天记录)[：:，,\s]*(.+)$/s);
  if (search) return { type: 'search', text: search[1].trim() };
  if (/^(?:看看|查看|打开|我的)?待办[。！!？?]?$/.test(text)) return { type: 'open', mode: 'todo' };
  if (/^(?:打开|看看|查看)(?:小本本|记事本)[。！!？?]?$/.test(text)) return { type: 'open', mode: 'note' };
  if (/^(?:打开|看看|查看)(?:物品位置|物品本|物品在哪)[。！!？?]?$/.test(text)) return { type:'open', mode:'locations' };
  return null;
}

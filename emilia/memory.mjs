// Keep original messages in SQLite; only the provider context is compressed.
export async function buildContext(store, summarize, { recentCount = 24, recentChars = 16000, triggerCount = 40, triggerChars = 24000 } = {}) {
  let rows = store.context(), memory = store.memory(), degraded = false;
  if (rows.length > triggerCount || rows.reduce((sum, m) => sum + m.content.length, 0) > triggerChars) {
    let chars = 0, start = rows.length;
    while (start > 0 && rows.length - start < recentCount && chars + rows[start - 1].content.length <= recentChars) { chars += rows[--start].content.length; }
    // Preserve the newest user message even after a very long assistant reply.
    if (start === rows.length) start = rows.length - 1;
    const older = rows.slice(0, start); const batch = []; let size = 0;
    for (const row of older) { if (size + row.content.length > 48000 && batch.length) break; batch.push(row); size += row.content.length; }
    if (batch.length) {
      try {
        const summary = await summarize(memory.text, batch);
        if (typeof summary !== 'string' || !summary.trim() || summary.length > 6000) throw new Error('Invalid summary');
        store.saveMemory(summary.trim(), batch.at(-1).id); memory = store.memory(); rows = store.context();
      } catch { degraded = true; }
    }
  }
  // Bound per-turn context and retry summarization on later turns if unavailable.
  const messages = []; let chars = 0;
  for (let i = rows.length - 1; i >= 0 && messages.length < 40; i--) {
    if (chars + rows[i].content.length > 24000) break;
    messages.unshift({ role: rows[i].role, content: rows[i].content }); chars += rows[i].content.length;
  }
  if (messages.length < rows.length) degraded = true;
  return { messages, memory: memory.text, degraded };
}

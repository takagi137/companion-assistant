// Normalize Alibaba's Responses stream without exposing reasoning or page contents.
export function safeSourceUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 2048) return '';
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return '';
    if (!u.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname) || u.hostname.endsWith('.local')) return '';
    return u.href;
  } catch { return ''; }
}
export function mergeSources(existing = [], incoming = []) {
  const found = new Map();
  for (const entry of [...existing, ...incoming]) {
    const url = safeSourceUrl(entry?.url); if (!url) continue;
    const old = found.get(url);
    found.set(url, { url, title: String(entry.title || old?.title || new URL(url).hostname).slice(0, 180), kind: entry.kind === 'page' || old?.kind === 'page' ? 'page' : 'search' });
  }
  // Keep explicitly read pages visible even after a long search result list.
  return [...found.values()].sort((a, b) => Number(b.kind === 'page') - Number(a.kind === 'page')).slice(0, 16);
}
function sourcesFrom(item) {
  if (item?.status === 'failed') return [];
  if (item?.type === 'web_search_call') return item.action?.sources || [];
  if (item?.type === 'web_extractor_call' && item.status === 'completed') return (item.urls || []).map(url => ({ url, kind: 'page' }));
  return [];
}
export async function* onlineEvents(events) {
  for await (const raw of events) {
    if (raw === '[DONE]') break; // Only a completed/incomplete response is success.
    const event = JSON.parse(raw);
    if (event.error || ['error', 'response.failed'].includes(event.type)) {
      yield JSON.stringify({ error: { code: event.error?.code || event.response?.error?.code || 'ONLINE_FAILED' } }); return;
    }
    if (event.type === 'response.output_text.delta') yield JSON.stringify({ choices: [{ delta: { content: event.delta } }] });
    if (event.type === 'response.reasoning_text.delta') yield JSON.stringify({ choices: [{ delta: { reasoning_content: true } }] });
    if (event.type === 'response.output_item.added' && ['web_search_call','web_extractor_call'].includes(event.item?.type)) {
      yield JSON.stringify({ toolNotice: event.item.type === 'web_extractor_call' ? '正在读取网页…' : '正在联网查资料…' });
    }
    if (event.type === 'response.output_item.done') {
      const sources = sourcesFrom(event.item); if (sources.length) yield JSON.stringify({ sources });
      if (event.item?.type === 'function_call') yield JSON.stringify({ toolCall: event.item });
    }
    if (['response.completed', 'response.incomplete'].includes(event.type)) {
      const response = event.response || {};
      if (response.error || response.status === 'failed') { yield JSON.stringify({ error: { code: response.error?.code || 'ONLINE_FAILED' } }); return; }
      if (event.type === 'response.incomplete' && response.incomplete_details?.reason !== 'max_output_tokens') { yield JSON.stringify({ error: { code: 'ONLINE_INCOMPLETE' } }); return; }
      yield JSON.stringify({ responseOutput: response.output || [] });
      for (const item of response.output || []) if (item.type === 'function_call') yield JSON.stringify({ toolCall: item });
      yield JSON.stringify({ model: response.model, sources: (response.output || []).flatMap(sourcesFrom),
        usage: response.usage && { prompt_tokens: response.usage.input_tokens, completion_tokens: response.usage.output_tokens, total_tokens: response.usage.total_tokens },
        choices: [{ delta: {}, finish_reason: event.type === 'response.incomplete' ? 'length' : 'stop' }] });
      yield '[DONE]'; return;
    }
  }
}

// Manual, billable smoke check. The key is hidden stdin; the database is in memory.
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp, getConfig, readSSE } from './server.mjs';
import { readSecret } from './secret-input.mjs';
const apiKey = await readSecret('阿里云 Key（隐藏输入，仅用于内存验收）：');
const app = createApp({ ...getConfig(), apiKey, databasePath: ':memory:' });
app.listen(0, '127.0.0.1'); await once(app, 'listening');
const origin = `http://127.0.0.1:${app.address().port}`;
try {
  for (const text of ['请实际联网查询 eufonius 演唱的《比翼の羽根》是哪部动画的主题曲，简短回答并给出来源。', '请用网页读取工具打开 https://help.aliyun.com/zh/model-studio/web-extractor ，用三点概括网页读取工具的用途和调用要求。不要只根据刚才的搜索作答。']) {
    const response = await fetch(origin + '/api/chat', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, requestId: randomUUID(), topicId: app.store.currentTopic(), web: true }) });
    let result = '', sources = [], done = false;
    for await (const line of readSSE(response.body)) { const event = JSON.parse(line); if (event.type === 'delta') result += event.text; if (event.type === 'sources') sources = event.sources; if (event.type === 'tool_notice') console.log(event.message); if (event.type === 'error') throw new Error(event.code + ': ' + event.message); if (event.type === 'done') done = true; }
    console.log(JSON.stringify({ done, reply: result.slice(0, 700), sources }));
    if (!done || !sources.length) throw new Error('No verified completion/sources');
  }
} finally { await new Promise(resolve => app.close(resolve)); }

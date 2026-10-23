import test from 'node:test';
import assert from 'node:assert/strict';
import { notebookIntent } from './dist/notebook-intent.js';
test('explicit notebook requests produce drafts, not automatic saves or reminder promises',()=>{
  assert.deepEqual(notebookIntent('帮我记一下，耳机在蓝色包侧袋'),{type:'draft',kind:'note',text:'耳机在蓝色包侧袋'});
  assert.deepEqual(notebookIntent('添加待办：周五交材料'),{type:'draft',kind:'todo',text:'周五交材料'});
  assert.deepEqual(notebookIntent('查旧聊天：星露谷'),{type:'search',text:'星露谷'});
  assert.equal(notebookIntent('提醒我明天吃药'),null);
  assert.equal(notebookIntent('你还记得我们昨天聊的吗'),null);
  assert.deepEqual(notebookIntent('看看待办'),{type:'open',mode:'todo'});
});

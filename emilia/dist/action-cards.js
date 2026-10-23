export function createActionCards({ api, notebook, toast, onUndo }) {
  const node = (tag, text) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  function render(parent, actions = []) {
    parent.replaceChildren(); parent.hidden = !actions.length;
    for (const result of actions) {
      const card = node('article'); card.className = 'action-receipt'; card.dataset.actionId = result.id || '';
      if (!result.ok) { card.classList.add('action-failed'); card.append(node('strong', '这次操作未完成'), node('p', result.message)); }
      else if (['location_save','location_search'].includes(result.type)) {
        card.append(node('strong',result.type==='location_save'?'✓ 物品位置已记录':'物品位置查询'));
        const items=result.item?[result.item]:result.items;
        for(const item of items){const b=node('button',`${item.name} · ${item.location}`);b.type='button';b.addEventListener('click',()=>notebook.openLocation(item.id));card.append(b);}
        card.append(node('small','最后记录的位置；点击查看位置历史。挪动后请更新。'));
      } else if (result.type === 'notebook_search') {
        card.append(node('strong', result.items.length ? result.matchMode === 'related' ? `找到 ${result.items.length} 条相关记录，核对一下` : `小本本找到了 ${result.items.length} 条` : '这个关键词暂无匹配，可以换个词查找'));
        if (result.items.length) card.append(node('small', '查询时的内容 · 点击查看最新记录'));
        for (const item of result.items) { const b = node('button', item.text); b.type = 'button'; b.addEventListener('click', () => notebook.openItem(item.id)); card.append(b); }
      } else if (result.item) {
        card.append(node('strong', result.undone ? '↶ 这次记录操作已撤销' : result.type === 'notebook_update' ? '✓ 小本本已更新' : '✓ 已记进小本本'), node('p', result.item.text));
        if (result.item.dueDate) card.append(node('small', `日期：${result.item.dueDate} · 不会发送提醒`));
        if (!result.undone) {
          const edit = node('button', '查看 / 修改'); edit.type = 'button'; edit.addEventListener('click', () => notebook.openItem(result.item.id));
          const undo = node('button', '撤销这次记录'); undo.type = 'button';
          undo.addEventListener('click', async () => {
            undo.disabled = true;
            try { const updated = await api('/api/chat/undo', { id: result.id }); Object.assign(result, updated); onUndo?.(updated); render(parent, actions); toast('这次记录操作已撤销。'); }
            catch (error) { toast(error.message); undo.disabled = false; }
          }); card.append(edit, undo);
        }
      } else if (result.type === 'room_action') {
        card.append(node('strong', '✓ 小窝互动已完成'), node('p', result.line));
        if (result.opponent) card.append(node('small', '爱蜜莉雅出：' + ({ rock: '石头', paper: '布', scissors: '剪刀' }[result.opponent]) + ' · ' + ({ win: '你赢啦', lose: '爱蜜莉雅赢啦', draw: '平局' }[result.outcome])));
      }
      parent.append(card);
    }
  }
  return { render };
}

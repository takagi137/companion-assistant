/* Private, explicit records. A chat reply alone never counts as a saved note. */
export function createNotebook({ api, toast = () => {} }) {
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
  const button = (text, action) => { const node = el('button', text); node.type = 'button'; node.addEventListener('click', action); return node; };
  const dialog = el('dialog', undefined, 'notebook-dialog'); dialog.setAttribute('aria-labelledby', 'notebook-title');
  const header = el('header'); const title = el('h2', '阿罗娜的小本本'); title.id = 'notebook-title';
  const close = button('关闭', () => dialog.close()); header.append(title, close);
  const intro = el('p', '想记住的事，写在这里～ 日期请明确选择；这里不会发送定时提醒。', 'notebook-muted');
  const tabs = el('nav', undefined, 'notebook-tabs'); tabs.setAttribute('aria-label', '小本本分类');
  const error = el('p', '', 'notebook-error'); error.setAttribute('role', 'alert'); error.hidden = true;
  const searchForm = el('form', undefined, 'notebook-search'); const query = el('input'); query.type = 'search'; query.maxLength = 100; query.placeholder = '输入关键词查找'; query.setAttribute('aria-label', '查找关键词');
  const search = el('button', '查找'); search.type = 'submit';
  const status = el('select'); status.setAttribute('aria-label', '待办状态');
  for (const [value, label] of [['', '全部状态'], ['open', '未完成'], ['done', '已完成']]) { const o = el('option', label); o.value = value; status.append(o); }
  status.value = 'open';
  searchForm.append(query, status, search);
  const newButton = button('＋ 帮我记住', () => edit());
  const draftButton = button('填入聊天草稿', () => { const input = document.querySelector('#chat-input, #message'); edit(null, input?.value || ''); });
  const actions = el('div', undefined, 'notebook-actions'); actions.append(newButton, draftButton);
  const editor = el('form', undefined, 'notebook-editor'); editor.hidden = true;
  const editorTitle = el('h3', '写进小本本'); const kind = el('select'); kind.setAttribute('aria-label', '记录类型');
  for (const [value, label] of [['note', '记事'], ['todo', '待办']]) { const o = el('option', label); o.value = value; kind.append(o); }
  const bodyLabel = el('label', '内容'); const body = el('textarea'); body.maxLength = 2000; body.required = true; body.rows = 4; bodyLabel.append(body);
  const dateLabel = el('label', '日期（可留空，不会自动提醒）'); const date = el('input'); date.type = 'date'; dateLabel.append(date);
  const save = el('button', '确认保存'); save.type = 'submit'; const cancel = button('取消', () => { editor.hidden = true; editing = null; });
  editor.append(editorTitle, el('p', '尚未保存，确认内容与日期后保存', 'notebook-muted'), kind, bodyLabel, dateLabel, save, cancel);
  const results = el('section', undefined, 'notebook-results'); results.setAttribute('aria-label', '查询结果'); results.setAttribute('aria-live', 'polite');
  dialog.append(header, intro, tabs, error, searchForm, actions, editor, results); document.body.append(dialog);
  let mode = 'note', editing = null, busy = false, sequence = 0, draftRequestId = '';
  const tabButtons = new Map();
  for (const [value, label] of [['note', '记事'], ['todo', '待办'], ['history', '查旧聊天']]) {
    const b = button(label, () => { if (busy) return; mode = value; editor.hidden = true; editing = null; updateMode(); load(); }); tabButtons.set(value, b); tabs.append(b);
  }
  function updateMode() {
    for (const [value, b] of tabButtons) b.setAttribute('aria-pressed', String(value === mode));
    status.hidden = mode !== 'todo'; actions.hidden = mode === 'history';
    query.placeholder = mode === 'history' ? '输入旧聊天中的关键词' : '查找小本本';
  }
  function fail(err) { error.textContent = err?.message === '接口不存在。' ? '小本本代码已准备好，当前后台还需更新；这次没有保存，请稍后再试。' : err?.message || '暂时没能完成，请稍后重试。'; error.hidden = false; }
  function clearError() { error.textContent = ''; error.hidden = true; }
  function setBusy(value) { busy = value; dialog.setAttribute('aria-busy', String(value)); for (const node of dialog.querySelectorAll('button,input,textarea,select')) node.disabled = value; close.disabled = false; }
  function edit(item = null, draft = '') {
    if (busy) return; clearError(); editing = item; draftRequestId = item ? '' : crypto.randomUUID(); kind.value = item?.kind || (mode === 'todo' ? 'todo' : 'note'); body.value = item?.text || draft.slice(0, 2000); date.value = item?.dueDate || ''; updateKind(); editorTitle.textContent = item ? '修改记录' : '写进小本本'; editor.hidden = false; body.focus();
  }
  function updateKind() { dateLabel.hidden = kind.value !== 'todo'; if (dateLabel.hidden) date.value = ''; }
  kind.addEventListener('change', updateKind);
  const dateText = value => { if (!value) return '日期未知'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('zh-CN'); };
  async function load() {
    const token = ++sequence, loadMode = mode; clearError(); results.replaceChildren(el('p', '正在翻小本本…')); setBusy(true);
    try {
      const q = query.value.trim();
      if (mode === 'history' && !q) { results.replaceChildren(el('p', '输入关键词后查找原始聊天；结果保留时间和消息编号。')); return; }
      const url = mode === 'history' ? `/api/notebook/search?q=${encodeURIComponent(q)}` : `/api/notebook?${new URLSearchParams({ q, kind: mode, ...(mode === 'todo' && status.value ? { status: status.value } : {}) })}`;
      const data = await api(url); if (token !== sequence || loadMode !== mode) return; results.replaceChildren();
      const items = mode === 'history' ? data.messages || [] : data.items || [];
      if (!items.length) results.append(el('p', mode === 'history' ? '没有找到匹配的原消息，可以换个关键词。' : '这里还没有记录。'));
      for (const item of items) {
        const card = el('article', undefined, 'notebook-card');
        if (mode === 'history') {
          card.append(el('small', `${item.role === 'user' ? '你说的' : '助手回复'} · ${dateText(item.created_at)}`), el('p', item.text), el('small', `来源消息 #${item.id} · 话题 ${item.topic_id}`));
        } else {
          card.append(el('small', `${item.kind === 'todo' ? (item.status === 'done' ? '✓ 已完成' : '○ 未完成') : '记事'}${item.dueDate ? ` · 日期 ${item.dueDate}` : ''}`), el('p', item.text), el('small', `更新于 ${dateText(item.updatedAt || item.createdAt)}`));
          const row = el('div', undefined, 'notebook-actions'); row.append(button('修改', () => edit(item)));
          if (item.kind === 'todo') row.append(button(item.status === 'done' ? '恢复待办' : '标为完成', () => mutate('/api/notebook/save', { ...pick(item), status: item.status === 'done' ? 'open' : 'done' }, '待办状态已更新～')));
          row.append(button('删除', () => { if (window.confirm(`删除这条记录？\n${item.text.slice(0, 100)}`)) mutate('/api/notebook/delete', { id: item.id, version: item.version }, '记录已删除。'); })); card.append(row);
        }
        results.append(card);
      }
      if (data.hasMore) results.append(el('p', '还有更多匹配结果，请增加关键词缩小范围。', 'notebook-muted'));
    } catch (err) { results.replaceChildren(); fail(err); }
    finally { if (token === sequence) setBusy(false); }
  }
  function pick(item) { return { id: item.id, kind: item.kind, text: item.text, dueDate: item.dueDate || '', status: item.status, version: item.version }; }
  async function mutate(url, payload, message) {
    if (busy) return; setBusy(true); clearError();
    try { await api(url, payload); editor.hidden = true; editing = null; toast(message); await load(); }
    catch (err) { fail(err); }
    finally { setBusy(false); }
  }
  editor.addEventListener('submit', event => {
    event.preventDefault(); if (busy) return;
    if (!body.value.trim()) { fail(new Error('先写一点想记住的内容吧。')); return; }
    const payload = { ...(editing ? { id: editing.id, version: editing.version } : { requestId: draftRequestId }), kind: kind.value, text: body.value.trim(), dueDate: kind.value === 'todo' ? date.value : '', status: kind.value === 'todo' ? editing?.status || 'open' : 'open' };
    mutate('/api/notebook/save', payload, '好哒，已经保存到小本本啦～');
  });
  searchForm.addEventListener('submit', event => { event.preventDefault(); if (!busy) load(); }); status.addEventListener('change', () => { if (!busy) load(); });
  const launcher = button('▤ 小本本', () => open()); launcher.className = 'room-util notebook-launcher'; launcher.setAttribute('aria-haspopup', 'dialog');
  (document.querySelector('.room-utilities') || document.querySelector('.record-toolbar') || document.body).append(launcher);
  function open(initialMode = 'note') { if (!busy) { const next = ['note', 'todo', 'history'].includes(initialMode) ? initialMode : 'note'; if (next !== mode) { editor.hidden = true; editing = null; } mode = next; updateMode(); } if (!dialog.open) dialog.showModal(); if (!busy) load(); }
  updateMode();
  function openDraft(text, draftKind = 'note') {
    if (busy) { toast('正在读取或保存，请稍后再试。'); return; }
    mode = draftKind === 'todo' ? 'todo' : 'note'; updateMode();
    results.replaceChildren();
    if (!dialog.open) dialog.showModal();
    edit(null, String(text || ''));
  }
  function openSearch(text) {
    if (busy) { toast('正在读取或保存，请稍后再试。'); return; }
    query.value = String(text || '').slice(0, 100); editor.hidden = true; editing = null; open('history');
  }
  async function openItem(id) {
    if (busy) { toast('小本本正在读取，请稍后再试。'); return; }
    if (!dialog.open) dialog.showModal(); clearError(); setBusy(true);
    try { const { item } = await api('/api/notebook/item?id=' + encodeURIComponent(id)); setBusy(false); mode = item.kind; updateMode(); results.replaceChildren(); edit(item); }
    catch (err) { fail(err); }
    finally { setBusy(false); }
  }
  return { open, openDraft, openSearch, openItem };
}

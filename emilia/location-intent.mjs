// Deliberately narrow grammar: quoted, uncertain, negative or future statements never save.
export function locationIntent(raw) {
  const text = String(raw || '').trim().replace(/[。！!]+$/u, '');
  if (!text || text.length > 240 || /[“”「」『』"\n]|如果|假如|可能|好像|也许|应该|打算|准备|明天|昨天|以前|之前|曾经|不要|别记|不在|没放|没有|不确定|忘了|记得|说过|比如|例如|会不会|合适|比较好|建议|[;；]/u.test(text)) return null;
  let m = text.match(/^(?:帮我找找|找一下|帮我查一下)?(.{1,40}?)(?:现在)?(?:放在哪(?:里|儿)?|在哪里|在哪儿|在哪|的位置)(?:了|呢|呀)?[？?]?$/u);
  if (m) return { type:'find', name:m[1].replace(/^(?:我的|我那(?:个|把|副))/, '').trim() };
  if (/[？?]|[吗吧呢]$|是不是|哪里|在哪|能不能/u.test(text)) return null;
  m = text.match(/^(?:(?:请)?帮我(?:记住|记一下|记下)[：:，,\s]*)?(?:我(?:刚刚|刚|现在)?(?:把)?)?(.{1,40}?)(?:现在|刚刚|刚)?(?:放在|放到|收在|收进)(?:了)?(.{1,160})$/u);
  if (!m || /[，,。]|你|他|她|它|是否|能|可以|要|想|不是|不想|别|的?话$/u.test(m[1]) || /[，,。]|或者|还是|要不要|应该|如果/u.test(m[2])) return null;
  const name = m[1].replace(/^我的/, '').trim(), location = m[2].replace(/了$/, '').trim();
  return name && location ? { type:'save', name, location } : null;
}

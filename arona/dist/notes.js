// Room-authored cards. Personal messages must be explicitly supplied by their author.
export const NOTES = [
  { id: 'blank', title: '发呆许可', art: '☁', kind: '一张小卡片', text: '本房间允许发呆。\n不需要提交理由，也不需要想好下一步。' },
  { id: 'weather', title: '给窗外换个天气', art: '☂', kind: '一个小选择', text: '如果今天的小窝有自己的天气，\n你想让它是什么样？', choices: [{ text: '暖暖午后', scene: 'day', reply: '好，给房间留一点柔软的光。' }, { text: '安静雨天', scene: 'rain', reply: '窗外下起小雨，屋里可以慢慢待着。' }, { text: '一片星空', scene: 'night', reply: '灯光暗下来，给星星留个位置。' }] },
  { id: 'pocket', title: '口袋里的一点开心', art: '✧', kind: '一个轻松的问题', text: '最近有没有一件很小、\n但想起来会有一点开心的事？\n不用说出来，自己想一想也很好。' },
  { id: 'seat', title: '今天坐哪儿？', art: '▱', kind: '一个小选择', text: '给想象中的自己，\n选一个舒服的位置吧。', choices: [{ text: '靠窗坐', reply: '靠着窗，看看云慢慢走。' }, { text: '窝进沙发', reply: '那就把靠垫挪过来，找个最舒服的姿势。' }] },
  { id: 'save', title: '休息，也算一页', art: '❀', kind: '一张小卡片', text: '故事里不只有冒险。\n平平常常、安安静静的一天，\n也可以留在这一页。' },
  { id: 'sky', title: '送窗外一颗星星', art: '✦', kind: '一个小选择', text: '想看看星空吗？\n这里的夜晚不用等到天黑。', choices: [{ text: '看看星空', scene: 'night', reply: '好了，今天的小窝是一页星空。' }, { text: '再晒会儿太阳', scene: 'day', reply: '那就再留一会儿午后的光。' }] },
  { id: 'drink', title: '想象中的下午茶', art: '☕', kind: '一个小选择', text: '今天的小茶单上，\n你会圈出哪一杯？', choices: [{ text: '温热的茶', reply: '是那种能捧在手心里、慢慢喝的温度。' }, { text: '冰柠檬水', reply: '想象杯壁上的小水珠，和清清爽爽的第一口。' }] },
  { id: 'small', title: '小事收藏家', art: '◇', kind: '一个轻松的问题', text: '一片漂亮的云、一句好笑的话，\n或是刚好合口味的一顿饭。\n今天有什么小事值得放进口袋？' },
  { id: 'slow', title: '允许慢半拍', art: '〰', kind: '一张小卡片', text: '这张纸条没有倒计时。\n你可以读得很慢，\n也可以先把它放在一边。' },
  { id: 'door', title: '如果门外是……', art: '⌂', kind: '一个轻松的问题', text: '如果小窝的门，今天能通往任何地方，\n你想推开门看到什么？\n海边、书店，还是一条没走过的小路？' },
  { id: 'rain', title: '把雨留在窗外', art: '☂', kind: '一个小选择', text: '要不要换一会儿雨天的颜色？\n只有画面，不会突然响起声音。', choices: [{ text: '换成雨天', scene: 'rain', reply: '小雨落下来了。可以安静地看一会儿。' }, { text: '保持现在这样', reply: '好，就保留你选的这一刻。' }] },
  { id: 'bookmark', title: '一枚空白书签', art: '▯', kind: '一张小卡片', text: '还没想好的事，可以先夹一枚书签。\n下次翻到这里，\n再接着想。' },
  { id: 'color', title: '今天是哪种颜色？', art: '✿', kind: '一个轻松的问题', text: '不是性格测试，只是随便想想：\n如果给今天选一支彩色铅笔，\n你会拿起哪一种颜色？' },
  { id: 'tiny', title: '很小的计划', art: '♡', kind: '一张小卡片', text: '今天的计划也可以很小：\n看完一页书，吃到喜欢的东西，\n或者在这里坐一会儿。' },
  { id: 'cloud', title: '云朵不赶路', art: '☁', kind: '一张小卡片', text: '看起来什么都没发生的时候，\n窗外的云也在悄悄换形状。\n不妨留一点时间，什么也不安排。' },
  { id: 'chapter', title: '这一页，先到这里', art: '✧', kind: '一张小卡片', text: '不需要每一次打开，\n都带着一件必须完成的事。\n来坐坐，就已经很好。' },
];

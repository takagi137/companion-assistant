// Small deterministic room game. Model output can never award progress.
export class GameError extends Error {
  constructor(status, message) { super(message); this.status = status; this.code = 'ROOM_ACTION'; }
}
export const SCENES = { day: '晴朗午后', rain: '窗边小雨', night: '星空夜晚' };
export const PLACES = { room: '宅邸小窝', park: '艾利欧尔森林', cafe: '王都街道', beach: '水门都市' };
export const SNACKS = { pudding: '布丁', cookie: '饼干', tea: '热饮' };
const allowed = { place: Object.keys(PLACES), pet: [''], snack: Object.keys(SNACKS), rps: ['rock', 'paper', 'scissors'], scene: Object.keys(SCENES), welcome: ['sit', 'look'], letter: ['open'], rain: ['watch', 'tea'], daily: ['rest', 'wash'], tea_event: ['blue', 'pink'] };
export function initialGame() { return { version: 1, character: 'emilia', place: 'room', scene: 'day', affection: 0, completed: [], petCount: 0, lastSnack: '', lastAction: '', updatedAt: '' }; }
export function publicGame(state) {
  return { ...state, stage: state.affection >= 12 ? '熟悉' : '初见', maximum: 24, next: state.affection >= 12 ? 24 : 12, teaUnlocked: state.affection >= 12, keepsakeUnlocked: state.affection >= 24 };
}
export function validateGameAction(body) {
  if (!body || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId) || !Object.hasOwn(allowed, body.action) || !allowed[body.action].includes(body.choice ?? '')) throw new GameError(400, '这个互动还没有准备好，请刷新后重试。');
  return { requestId: body.requestId, action: body.action, choice: body.choice ?? '' };
}
export function applyGame(previous, turn, random = Math.random) {
  validateGameAction(turn);
  const state = structuredClone(previous), { action, choice } = turn;
  let line = '', expression = 'normal', effect = '', prop = '', event = '', award = '', points = 0, opponent = '', outcome = '';
  if (['scene', 'daily', 'letter', 'rain', 'welcome'].includes(action)) state.place = 'room';
  if (['snack', 'tea_event'].includes(action)) state.place = 'cafe';
  if (action === 'place') {
    state.place = choice; expression = 'happy'; effect = 'bounce';
    line = { room: '回到宅邸啦～软软的靠垫已经给你留着啦！', park: '这里是艾利欧尔森林。雪地有点滑，我们慢慢走吧。', cafe: '到王都啦！走累了就在街边喝杯茶吧，点心分你一半。', beach: '到水门都市啦！你看桥下的倒影，要一起沿着运河散步吗？' }[choice];
    state.lastAction = `一起到了${PLACES[choice]}`;
  }
  if (action === 'pet') {
    const lines = ['诶？是在摸我的头吗……嘿嘿。', '轻一点啦，蝴蝶结要歪掉了。', '唔……再一下就好！', '头发都变成小鸟窝啦。要帮我理好哦？', '好啦好啦，我收到啦！一起做点别的吧。'];
    line = lines[state.petCount % lines.length]; state.petCount = (state.petCount + 1) % 10000;
    expression = state.petCount % 3 === 0 ? 'shy' : 'happy'; effect = 'sparkles'; award = 'pet'; points = 2;
    state.lastAction = '刚刚摸了爱蜜莉雅的头';
  }
  if (action === 'snack') {
    const lines = { pudding: ['布丁！……啊，我没有一直盯着它哦。', '又是软软的布丁！这次我会慢慢吃的。'], cookie: ['咔嚓——好香！这块形状最好看的，留给你。', '饼干小队，集合！我们一人一块。'], tea: ['呼……捧在手里暖暖的。你也有一杯！', '今天也是热乎乎的一杯。先吹一吹哦。'] };
    line = lines[choice][state.completed.includes(`snack:${choice}`) ? 1 : 0]; expression = 'happy'; effect = 'sparkles'; prop = choice;
    state.lastSnack = choice; state.lastAction = `刚刚一起分享了${SNACKS[choice]}`; award = `snack:${choice}`; points = 2;
  }
  if (action === 'rps') {
    const hands = ['rock', 'scissors', 'paper']; opponent = hands[Math.min(2, Math.floor(random() * 3))];
    outcome = choice === opponent ? 'draw' : (hands.indexOf(choice) + 1) % 3 === hands.indexOf(opponent) ? 'win' : 'lose';
    line = { win: '哇，你赢啦！……再来一局？这次我准备好了！', lose: '赢啦！嘿嘿，爱蜜莉雅今天的直觉很准呢。', draw: '一样的！我们是不是想到一起去了？' }[outcome];
    expression = outcome === 'win' ? 'surprised' : 'happy'; effect = 'bounce'; prop = opponent; award = 'rps'; points = 3;
    state.lastAction = `刚玩了一局猜拳，${{win:'用户赢了',lose:'爱蜜莉雅赢了',draw:'平局'}[outcome]}`;
  }
  if (action === 'scene') {
    state.scene = choice; expression = choice === 'night' ? 'shy' : 'normal';
    line = { day: '阳光跑进来啦！坐在这里，刚刚好。', rain: '滴答、滴答……要一起听窗外的小雨吗？', night: '看，星星亮起来了！给今晚留一点点光。' }[choice];
    state.lastAction = `把房间切换成了${SCENES[choice]}`;
  }
  if (action === 'welcome') {
    line = choice === 'sit' ? '那，这边请！小点心和空位置，都给你留好了。' : '欢迎参观！桌上的信、窗外的天气，都可以点点看哦。';
    expression = 'happy'; effect = 'sparkles'; event = '初次来访'; award = 'event:welcome'; points = 4; state.lastAction = '完成了初次来访的小事件';
  }
  if (action === 'letter') {
    line = '拆开啦！是小窝准备的小卡片。让我也看看，好不好？'; expression = 'happy'; event = '桌上的信'; award = 'event:letter'; points = 4; state.lastAction = '刚拆开了桌上的小窝原创纸条';
  }
  if (action === 'rain') {
    if (state.scene !== 'rain') throw new GameError(409, '先把窗外换成雨天，再来看看吧。');
    line = choice === 'tea' ? '杯子暖暖的，雨声轻轻的……这一小会儿，我们慢慢过。' : '那朵云像不像一只小鲸鱼？……看，它游过去啦。';
    expression = 'shy'; prop = choice === 'tea' ? 'tea' : ''; event = '雨天看窗外'; award = 'event:rain'; points = 5; state.lastAction = '刚一起在窗边看雨';
  }
  if (action === 'daily') {
    line = choice === 'rest' ? '靠垫分你一半。我们先歇一小会儿吧。' : '我去洗漱一下！小鸭子替我看一会儿房间～';
    expression = choice === 'rest' ? 'shy' : 'happy'; effect = choice === 'wash' ? 'wash' : 'rest';
    state.lastAction = choice === 'rest' ? '刚一起休息了一小会儿' : '刚触发了洗漱小过场';
  }
  if (action === 'tea_event') {
    if (state.affection < 12) throw new GameError(409, '熟悉之后，就能一起参加小茶会啦。');
    line = choice === 'blue' ? '蓝色杯子给你！我选旁边这只。今天的小茶会，开场啦～' : '粉色杯子，收到！嘿嘿，连杯子都像在说“欢迎回来”。';
    expression = 'happy'; effect = 'sparkles'; prop = 'tea'; state.lastAction = '参加了熟悉阶段解锁的小茶会';
  }
  const gain = award && !state.completed.includes(award) ? points : 0;
  if (gain) { state.completed.push(award); state.affection = Math.min(24, state.affection + gain); }
  const unlocks = [];
  if (previous.affection < 12 && state.affection >= 12) unlocks.push('熟悉啦：新的欢迎语和小茶会已解锁');
  if (previous.affection < 24 && state.affection >= 24) unlocks.push('小窝纪念卡已解锁');
  state.updatedAt = new Date().toISOString();
  return { state, response: { line, expression, effect, prop, event, gain, unlocks, opponent, outcome } };
}
export function gameContext(state) {
  return `当前角色为爱蜜莉雅；当前地点：${PLACES[state.place] || PLACES.room}；房间天气：${SCENES[state.scene] || SCENES.day}。互动阶段：${state.affection >= 12 ? '熟悉' : '初见'}（只代表游戏内容解锁进度，不是真实情感）。${state.lastSnack ? `最近一起分享了${SNACKS[state.lastSnack]}。` : ''}${state.lastAction ? `最近一次页面互动：${state.lastAction}。` : ''}可自然承接这些场景，不把预设事件当成用户现实经历、情绪或长期偏好。不自行增减好感、声称完成页面动作或解锁内容。`;
}

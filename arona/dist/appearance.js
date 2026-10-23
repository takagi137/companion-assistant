// Cosmetic preferences stay on this device; they do not change chat or affection.
export const OUTFITS = [
  { id: 'original', name: '日常 · Q版小伙伴', src: 'assets/arona/arona-00.png' },
  { id: 'jk', name: 'JK · 放学一起走', src: 'assets/wardrobe/jk-v1.png' },
  { id: 'lolita', name: '洛丽塔 · 兔兔茶会', src: 'assets/wardrobe/lolita-v1.png' },
  { id: 'sailor', name: '水手服 · 晴空来信', src: 'assets/wardrobe/sailor-v1.png' },
  { id: 'swim', name: '泳装 · 小鸭出游', src: 'assets/wardrobe/swim-v1.png' },
  { id: 'sport', name: '体操服 · 元气满格', src: 'assets/wardrobe/sport-v1.png' },
  { id: 'wedding', name: '婚纱 · 云朵礼服', src: 'assets/wardrobe/wedding-v1.png' },
];
export const PLACES = [
  { id: 'room', name: '我的小窝', icon: '🏠', src: 'assets/room-background-v1.png', caption: '给今天，留一个软软的角落。', line: '到家啦～鞋子放好，软软的靠垫已经给你留着啦！' },
  { id: 'park', name: '樱花公园', icon: '🌸', src: 'assets/scenes/park-v1.png', caption: '把今天，交给花香和微风。', line: '出发出发～花瓣落在你肩膀上啦！要不要一起慢慢走？' },
  { id: 'cafe', name: '云朵甜品店', icon: '🍮', src: 'assets/scenes/cafe-v1.png', caption: '一口甜甜的，分你一半。', line: '叮铃～到甜品店啦！靠窗的位置是我们的，今天想吃什么呀？' },
  { id: 'beach', name: '晴空海边', icon: '🐚', src: 'assets/scenes/beach-v1.png', caption: '海风把小烦恼，吹远一点。', line: '哇——是大海！快听，浪花在跟我们打招呼呢～' },
];
const KEY = 'sora-companion:appearance:v1';
export function readAppearance(storage) {
  let saved; try { saved = JSON.parse(storage.getItem(KEY) || '{}'); } catch { /* Optional preferences. */ }
  return { outfit: OUTFITS.some(x => x.id === saved?.outfit) ? saved.outfit : 'original', place: PLACES.some(x => x.id === saved?.place) ? saved.place : 'room' };
}
export function saveAppearance(storage, value) {
  try { storage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
}
export function placeForAction(action, current) {
  if (['scene', 'daily', 'letter', 'rain', 'welcome'].includes(action)) return 'room';
  if (['snack', 'tea_event'].includes(action)) return 'cafe';
  return current;
}

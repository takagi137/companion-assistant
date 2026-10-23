// Cosmetic preferences stay on this device; they do not change chat or affection.
export const OUTFITS = [
  { id: 'original', name: '日常 · 银发精灵', src: 'assets/emilia-preview/original-v1.svg' },
  { id: 'jk', name: 'JK · 放学一起走', src: 'assets/emilia-preview/jk-v1.svg' },
  { id: 'lolita', name: '洛丽塔 · 紫罗兰茶会', src: 'assets/emilia-preview/lolita-v1.svg' },
  { id: 'sailor', name: '水手服 · 晴空来信', src: 'assets/emilia-preview/sailor-v1.svg' },
  { id: 'swim', name: '泳装 · 清凉假日', src: 'assets/emilia-preview/swim-v1.svg' },
  { id: 'sport', name: '体操服 · 元气满格', src: 'assets/emilia-preview/sport-v1.svg' },
  { id: 'wedding', name: '婚纱 · 云朵礼服', src: 'assets/emilia-preview/wedding-v1.svg' },
];
export const PLACES = [
  { id: 'room', name: '宅邸小窝', icon: '🏠', src: 'assets/emilia-scenes/room-v1.png', caption: '给今天，留一个软软的角落。', line: '到家啦～鞋子放好，软软的靠垫已经给你留着啦！' },
  { id: 'park', name: '艾利欧尔森林', icon: '🌸', src: 'assets/emilia-scenes/park-v1.png', caption: '雪与精灵，把心事轻轻收藏。', line: '这里是艾利欧尔森林。雪地有点滑，我们慢慢走吧。' },
  { id: 'cafe', name: '王都街道', icon: '🍮', src: 'assets/emilia-scenes/cafe-v1.png', caption: '沿着王都街道，找一家小小的茶店。', line: '到王都啦！走累了就在街边喝杯茶吧，点心分你一半。' },
  { id: 'beach', name: '水门都市', icon: '🐚', src: 'assets/emilia-scenes/beach-v1.png', caption: '沿着水门都市的运河，听风看水。', line: '到水门都市啦！你看桥下的倒影，要一起沿着运河散步吗？' },
];
const KEY = 'emilia-companion:appearance:v1';
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

// Each unchanged PNG is a four-column, two-row transparent character atlas.
export const OUTFIT_MOTION = Object.fromEntries(['original','jk','lolita','sailor','swim','sport','wedding'].map(id => [id, {}]));
export const POSE_LABELS = { idle:'眨眼陪伴', happy:'开心招手', snack:'吃布丁', play:'准备猜拳', rest:'闭眼休息' };
export function motionFrames(outfit, pose) {
  const name = Object.hasOwn(POSE_LABELS, pose) ? pose : 'idle';
  const selected = Object.hasOwn(OUTFIT_MOTION, outfit) ? outfit : 'original';
  const start = { idle:0, rest:0, happy:2, snack:4, play:6 }[name];
  const size = 887 / 2;
  return { pose:name, outfit:selected, src:`assets/emilia-motion/${selected}-v1.png`, width:1774, height:887,
    views:[start,start+1].map(index => `${index % 4 * size} ${Math.floor(index / 4) * size} ${size} ${size}`) };
}

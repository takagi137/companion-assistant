// Original PNGs stay intact. Each viewBox selects one atlas cell without resampling.
export const OUTFIT_MOTION = {
  jk: { centers: [254.5,666.5,1104.5,1547.5,253.5,666,1105,1548.5] },
  lolita: { centers: [225.5,668.5,1115,1558,225,667.5,1114.5,1558] },
  sailor: { centers: [225.5,669,1112,1556.5,227,670,1113,1556.5] },
  sport: { centers: [224,668,1111,1555,224,668,1111,1555] },
  swim: { centers: [240.5,674,1110,1550,235,674.5,1113,1554.5] },
  wedding: { centers: [221,664.5,1108,1552,221.5,665,1108,1552] },
};
const original = {
  idle: { file: 'idle-v1.png', centers: [565,1226] },
  happy: { file: 'happy-v1.png', centers: [539,1251] },
  snack: { file: 'snack-v1.png', centers: [552,1249] },
  play: { file: 'play-v1.png', centers: [553,1291] },
};
export const POSE_LABELS = { idle:'眨眼陪伴', happy:'开心招手', snack:'吃布丁', play:'准备猜拳', rest:'闭眼休息' };
export function motionFrames(outfit, pose) {
  const name = Object.hasOwn(POSE_LABELS, pose) ? pose : 'idle';
  if (!Object.hasOwn(OUTFIT_MOTION, outfit)) {
    const selected = original[name] || original.idle;
    return { pose:name, outfit:'original', src:'assets/arona-chibi/'+selected.file, width:1774, height:887,
      views:selected.centers.map(center => `${center-280} -60 560 1000`) };
  }
  const start = { idle:0, rest:0, happy:2, snack:4, play:6 }[name];
  // Keep views inside their row to avoid a neighbouring sprite appearing at the edge.
  const height = 887 / 2, width = height * .7;
  return { pose:name, outfit, src:`assets/wardrobe-motion/${outfit}-v1.png`, width:1774, height:887,
    views:[start,start+1].map(index => `${OUTFIT_MOTION[outfit].centers[index]-width/2} ${index<4?0:height} ${width} ${height}`) };
}

import { OUTFIT_MOTION, POSE_LABELS, motionFrames } from './outfit-motion.js';

export function createChibi({ onAssetError = () => {} } = {}) {
  const $ = id => document.querySelector('#' + id), shell = $('home-view');
  let style = 'chibi', outfit = 'original', currentPose = 'idle';
  const loaded = new Set(), loading = new Map();
  try { if (localStorage.getItem('arona:character-style') === 'portrait') style = 'portrait'; } catch { /* Optional preference. */ }
  function setStyle(value) {
    style = ['portrait', 'costume'].includes(value) ? value : 'chibi'; shell.dataset.characterStyle = style;
    $('character-style').value = style;
    try { localStorage.setItem('arona:character-style', style); } catch { /* Optional preference. */ }
  }
  function render() {
    const frames = motionFrames(outfit, currentPose);
    $('chibi-character').dataset.pose = frames.pose;
    $('chibi-character').dataset.outfit = outfit;
    shell.dataset.outfitMotion = outfit === 'original' || loaded.has(outfit) ? 'ready' : 'loading';
    for (const [index, suffix] of ['a','b'].entries()) {
      $('chibi-frame-' + suffix).setAttribute('viewBox', frames.views[index]);
      const image = $('chibi-image-' + suffix);
      image.setAttribute('width', String(frames.width)); image.setAttribute('height', String(frames.height));
      image.setAttribute('href', frames.src);
    }
    $('chibi-character').setAttribute('aria-label', 'Q版阿罗娜 · ' + POSE_LABELS[frames.pose]);
  }
  function pose(name = 'idle') { currentPose = Object.hasOwn(POSE_LABELS, name) ? name : 'idle'; render(); }
  function setOutfit(id = 'original') {
    outfit = Object.hasOwn(OUTFIT_MOTION, id) ? id : 'original'; render();
    if (outfit === 'original' || loaded.has(outfit) || loading.has(outfit)) return;
    const requested = outfit, image = new Image(); loading.set(requested, image);
    image.onload = () => { loaded.add(requested); loading.delete(requested); if (outfit === requested) render(); };
    image.onerror = () => {
      loading.delete(requested);
      if (outfit === requested) { shell.dataset.outfitMotion = 'unavailable'; onAssetError('动作图片暂时没加载好，先穿这套静静陪你。重新选一次衣服可以重试。'); }
    };
    image.src = motionFrames(requested, 'idle').src;
  }
  // Only the selected costume atlas loads. Existing default sheets stay preloaded.
  for (const name of ['idle','happy','snack','play']) { const image = new Image(); image.src = motionFrames('original', name).src; }
  $('character-style').addEventListener('change', () => setStyle($('character-style').value));
  document.addEventListener('visibilitychange', () => { $('chibi-character').classList.toggle('is-paused', document.hidden); });
  setStyle(style); render(); return { pose, setStyle, setOutfit };
}

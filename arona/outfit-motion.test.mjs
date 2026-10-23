import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OUTFITS } from './dist/appearance.js';
import { motionFrames, POSE_LABELS } from './dist/outfit-motion.js';
import { createChibi } from './dist/chibi.js';

test('all six costumes provide every action with bounded frames in a transparent atlas', () => {
  for (const outfit of OUTFITS.filter(x => x.id !== 'original')) {
    const paths = new Set();
    for (const pose of Object.keys(POSE_LABELS)) {
      const frame = motionFrames(outfit.id, pose); paths.add(frame.src);
      assert.equal(frame.outfit, outfit.id); assert.equal(frame.pose, pose);
      const bytes = fs.readFileSync(new URL('./dist/'+frame.src, import.meta.url));
      assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a'); assert.equal(bytes[25],6);
      assert.equal(bytes.readUInt32BE(16),frame.width); assert.equal(bytes.readUInt32BE(20),frame.height);
      for (const view of frame.views) {
        const [x,y,w,h] = view.split(' ').map(Number);
        assert.ok(x>=0 && y>=0 && x+w<=frame.width && y+h<=frame.height);
        assert.ok(Math.floor(x/(frame.width/4))===Math.floor((x+w-1)/(frame.width/4)), 'viewport must not show adjacent figure');
      }
      if (pose==='rest') assert.deepEqual(frame.views,motionFrames(outfit.id,'idle').views);
      if (['snack','play'].includes(pose)) assert.equal(Number(frame.views[0].split(' ')[1]),frame.height/2);
    }
    assert.equal(paths.size,1,'one atlas per costume');
  }
  assert.equal(motionFrames('../unsafe','unknown').outfit,'original');
});

function setup(t) {
  const elements=new Map();
  class Element extends EventTarget { constructor(){super();this.dataset={};this.attrs={};this.classList={toggle(){}};} setAttribute(k,v){this.attrs[k]=v;} }
  for(const id of ['home-view','character-style','chibi-character','chibi-frame-a','chibi-frame-b','chibi-image-a','chibi-image-b'])elements.set(id,new Element());
  const document=new EventTarget();document.hidden=false;document.querySelector=s=>elements.get(s.slice(1));
  const images=[],errors=[],saved=new Map(), restore=[];
  const env={ document,localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},Image:class {constructor(){images.push(this);}} };
  for(const [k,v]of Object.entries(env)){const prior=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,configurable:true});restore.push(()=>prior?Object.defineProperty(globalThis,k,prior):delete globalThis[k]);}
  t.after(()=>restore.forEach(fn=>fn()));
  return { chibi:createChibi({onAssetError:e=>errors.push(e)}), images, errors,el:id=>elements.get(id) };
}

test('rapid wardrobe changes and late image loads preserve newest outfit and action', t => {
  const e=setup(t); e.chibi.setStyle('costume'); e.chibi.setOutfit('jk'); const jk=e.images.at(-1);
  e.chibi.pose('snack'); e.chibi.setOutfit('lolita'); const lolita=e.images.at(-1);
  jk.onload(); assert.equal(e.el('home-view').dataset.outfitMotion,'loading');
  assert.match(e.el('chibi-image-a').attrs.href,/lolita/); assert.equal(e.el('chibi-character').dataset.pose,'snack');
  lolita.onload();assert.equal(e.el('home-view').dataset.outfitMotion,'ready');
  const count=e.images.length;e.chibi.pose('play');e.chibi.setOutfit('lolita');assert.equal(e.images.length,count);
  assert.equal(e.el('chibi-character').dataset.pose,'play');
  e.chibi.setOutfit('original');assert.match(e.el('chibi-image-a').attrs.href,/arona-chibi\/play/);
});

test('missing atlas keeps static fallback, permits retry and cannot reset a newer outfit', t => {
  const e=setup(t);e.chibi.setOutfit('swim');e.images.at(-1).onerror();
  assert.equal(e.el('home-view').dataset.outfitMotion,'unavailable');assert.equal(e.errors.length,1);
  const count=e.images.length;e.chibi.setOutfit('swim');assert.equal(e.images.length,count+1);
  const retry=e.images.at(-1);e.chibi.setOutfit('wedding');retry.onerror();assert.equal(e.errors.length,1);
  assert.match(e.el('chibi-image-a').attrs.href,/wedding/);e.images.at(-1).onload();assert.equal(e.el('home-view').dataset.outfitMotion,'ready');
});

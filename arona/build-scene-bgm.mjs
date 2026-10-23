// Original instrumental loops synthesized locally; no third-party recordings.
import fs from 'node:fs/promises';
const RATE=24000,SECONDS=40,N=RATE*SECONDS;
const scenes=[
 ['day','窗边的午后',[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,59]],[76,74,71,67,69,72,71,67],.25],
 ['rain','雨滴慢慢落',[[45,52,55,59],[41,48,52,57],[48,55,59,64],[43,50,53,59]],[72,71,67,64,69,67,64,62],.17],
 ['night','星星也晚安',[[48,55,59,62],[45,52,55,59],[41,48,52,55],[43,50,55,62]],[67,71,74,71,64,67,69,67],.12],
 ['park','花瓣散步',[[50,57,61,66],[47,54,57,62],[43,50,54,59],[45,52,57,61]],[78,76,73,69,71,74,73,69],.28],
 ['cafe','一杯温柔',[[41,48,52,57],[38,45,48,52],[46,53,57,60],[48,55,58,62]],[69,72,76,72,67,69,65,64],.22],
 ['beach','海风的明信片',[[48,55,62,64],[41,48,55,57],[45,52,59,60],[43,50,57,59]],[76,79,74,72,69,72,74,67],.18],
];
await fs.mkdir(new URL('./dist/assets/scene-bgm/',import.meta.url),{recursive:true});
const manifest={};
for(const [id,name,chords,melody,brightness] of scenes){
 const left=new Float32Array(N),right=new Float32Array(N);
 function note(midi,start,duration,amp,pan=0,pad=false){
  const freq=440*2**((midi-69)/12),count=Math.floor(duration*RATE),at=Math.floor(start*RATE);
  for(let i=0;i<count;i++){
   const t=i/RATE,attack=pad?.7:.018,release=pad?1.3:.45;
   const env=Math.min(1,t/attack)*Math.min(1,(duration-t)/release)*(pad?1:Math.exp(-t/1.5));
   const wave=pad?Math.sin(2*Math.PI*freq*t)+.15*Math.sin(2*Math.PI*freq*1.002*t):Math.sin(2*Math.PI*freq*t)+brightness*Math.sin(2*Math.PI*freq*2*t)*Math.exp(-t*2)+.06*Math.sin(2*Math.PI*freq*3*t)*Math.exp(-t*4);
   const sample=wave*env*amp,j=(at+i)%N;
   left[j]+=sample*(1-pan*.4);right[j]+=sample*(1+pan*.4);
   // Quiet stereo echoes wrap to maintain a seamless loop.
   left[(j+Math.floor(.37*RATE))%N]+=sample*.13;
   right[(j+Math.floor(.53*RATE))%N]+=sample*.13;
  }
 }
 for(let bar=0;bar<8;bar++){
  const chord=chords[bar%4],start=bar*5;
  chord.forEach((m,k)=>note(m,start,5.5,.026,(k-1.5)/2,true));
  for(let beat=0;beat<8;beat++)note(chord[[0,2,1,3,0,1,2,3][beat]]+12,start+beat*.625,2.8,.065,beat%2?.45:-.45);
  note(melody[bar],start+.625,3.3,.10,-.12);note(melody[(bar+3)%8],start+3.125,2.8,.075,.12);
 }
 let peak=0;for(let i=0;i<N;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
 const bytes=Buffer.alloc(44+N*4);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(RATE,24);bytes.writeUInt32LE(RATE*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(N*4,40);
 for(let i=0;i<N;i++){bytes.writeInt16LE(Math.round(left[i]/peak*.65*32767),44+i*4);bytes.writeInt16LE(Math.round(right[i]/peak*.65*32767),46+i*4);}
 const src=`assets/scene-bgm/${id}-v1.wav`;await fs.writeFile(new URL('./dist/'+src,import.meta.url),bytes);manifest[id]={name,src,seconds:SECONDS};
}
await fs.writeFile(new URL('./dist/scene-bgm-assets.js',import.meta.url),'// Original locally synthesized instrumental loops.\nexport const SCENE_BGM = '+JSON.stringify(manifest,null,2)+';\n','utf8');
await fs.writeFile(new URL('./dist/assets/scene-bgm/sources.json',import.meta.url),JSON.stringify({source:'Original note arrangements and additive synthesis in build-scene-bgm.mjs; no vocals, samples, or copied music.',sampleRate:RATE,scenes:manifest},null,2),'utf8');
console.log('Created 6 original 40-second stereo instrumental loops.');

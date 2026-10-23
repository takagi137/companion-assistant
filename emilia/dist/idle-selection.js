// Shuffle each full set, without repeating at the boundary between sets.
export function createIdleClipPicker(clips,{random=Math.random,storage,key='emilia-companion:idle-hum-order'}={}){
 const ids=clips.map(clip=>clip.id),byId=new Map(clips.map(clip=>[clip.id,clip]));
 let remaining=[],last=null;
 try{
  const saved=JSON.parse(storage?.getItem(key)||'null');
  if(saved&&byId.has(saved.last)&&Array.isArray(saved.remaining)&&saved.remaining.length<ids.length
   &&new Set(saved.remaining).size===saved.remaining.length&&saved.remaining.every(id=>byId.has(id)&&id!==saved.last)){
   remaining=saved.remaining;last=saved.last;
  }
 }catch{}
 return function next(){
  if(!ids.length)return null;
  if(!remaining.length){
   remaining=[...ids];
   for(let i=remaining.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}
   if(remaining.length>1&&remaining[0]===last)[remaining[0],remaining[1]]=[remaining[1],remaining[0]];
  }
  last=remaining.shift();
  try{storage?.setItem(key,JSON.stringify({last,remaining}));}catch{}
  return byId.get(last);
 };
}

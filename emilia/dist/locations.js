export function createLocationsPanel({api,toast}) {
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 const root=el('section');root.className='locations-panel';root.hidden=true;
 root.append(el('p','告诉我“钥匙放在玄关第二个抽屉”，以后问“钥匙在哪”。这里显示最后记录的位置，挪动后记得更新。'));
 const search=el('form'),q=el('input');q.type='search';q.maxLength=100;q.placeholder='找物品、别名或房间';q.setAttribute('aria-label','找物品');
 const submit=el('button','找一找');submit.type='submit';search.append(q,submit);
 const add=button('＋ 记住物品位置',()=>edit());
 const error=el('p');error.setAttribute('role','alert');error.className='notebook-error';error.hidden=true;
 const form=el('form');form.className='location-editor';form.hidden=true;
 const heading=el('h3','记住物品位置');form.append(heading);
 const fields={};for(const [name,label,max] of [['name','物品名称',40],['location','放在哪里',160],['aliases','其他叫法（可留空）',100],['note','补充说明（可留空）',500]]){const wrap=el('label',label),input=el('input');input.maxLength=max;input.required=['name','location'].includes(name);input.setAttribute('aria-label',label);wrap.append(input);form.append(wrap);fields[name]=input;}
 const save=el('button','保存位置');save.type='submit';form.append(save,button('取消',()=>{form.hidden=true;}));
 const results=el('div');results.setAttribute('aria-live','polite');const history=el('section');history.className='location-history';history.hidden=true;
 root.append(search,add,error,form,results,history);let editing=null,requestId='',busy=false,seq=0;
 const date=s=>new Date(s).toLocaleString('zh-CN');
 function fail(e){error.textContent=e.message||'没有保存成功，请重试。';error.hidden=false;}
 function lock(value){busy=value;for(const e of root.querySelectorAll('button,input'))e.disabled=value;fields.name.disabled=value||Boolean(editing);}
 function edit(item=null){if(busy)return;editing=item;requestId=crypto.randomUUID();for(const [k,input]of Object.entries(fields))input.value=item?.[k]||'';fields.name.disabled=Boolean(item);heading.textContent=item?'更新 '+item.name+' 的位置':'记住物品位置';error.hidden=true;form.hidden=false;fields[item?'location':'name'].focus();}
 async function showHistory(id){if(busy)return;lock(true);error.hidden=true;try{const data=await api('/api/locations/history?id='+encodeURIComponent(id));history.replaceChildren(el('h3',data.item.name+' · 位置历史'));for(const entry of data.history){const row=el('article');row.append(el('strong',entry.location),el('small',date(entry.recordedAt)+(entry.version===data.item.version?' · 最后记录':'')));if(entry.note)row.append(el('p',entry.note));history.append(row);}if(data.hasMore)history.append(el('small','这里只显示最近 50 次记录。'));history.hidden=false;}catch(e){fail(e);}finally{lock(false);}}
 async function load(){const token=++seq;lock(true);error.hidden=true;history.hidden=true;try{const data=await api('/api/locations?q='+encodeURIComponent(q.value.trim()));if(token!==seq)return;results.replaceChildren();if(!data.items.length)results.append(el('p','还没找到记录。换个名字查，或记下一个新位置吧。'));for(const item of data.items){const card=el('article');card.className='notebook-card location-card';card.append(el('h3',item.name),el('strong','📍 '+item.location),el('small','最后记录于 '+date(item.updatedAt)));if(item.aliases)card.append(el('p','也叫：'+item.aliases));if(item.note)card.append(el('p',item.note));card.append(button('更新位置',()=>edit(item)),button('位置历史',()=>showHistory(item.id)));results.append(card);}if(data.hasMore)results.append(el('p','还有更多物品，请输入更具体的关键词。'));}catch(e){fail(e);}finally{if(token===seq)lock(false);}}
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const payload={requestId,...(editing?{id:editing.id,version:editing.version}:{}),...Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value.trim()]))};if(!payload.name||!payload.location){fail(new Error('请写清物品名称和放置位置。'));return;}lock(true);error.hidden=true;try{await api('/api/locations/save',payload);form.hidden=true;editing=null;q.value='';toast('位置记好了，以后可以来问我。');await load();}catch(e){fail(e);}finally{lock(false);}});
 search.addEventListener('submit',e=>{e.preventDefault();if(!busy)load();});
 return {root,load,async openItem(id){form.hidden=true;results.replaceChildren();await showHistory(id);},clear(){form.hidden=true;history.hidden=true;}};
}

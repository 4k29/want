import {readRemote,createSaveRequest,issueLink,loadCache,saveCache,loadWaiting,saveWaiting,clearWaiting,sameItems} from './sync-v2.js?v=1';
import {KEY,yen,currentMonth,monthIndex,cost,activePayment,totals,guessCategory,safeUrl,validate,readBackup,extractProduct} from './model.js?v=2';

const $=s=>document.querySelector(s);
const form=$('#item-form'),editor=$('#editor');
const field=name=>form.elements.namedItem(name);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const cached=loadCache();
let items=cached?.items||[];
let baseRevision=cached?.baseRevision??0;
let localDirty=cached?.dirty??false;
let remoteItems=[];
let revision=baseRevision;
let waiting=loadWaiting();
let ready=false,reading=false,busy=false,conflict=false,lastRead=0,pollGeneration=0;
let tab='products',editing=null,request=null,legacy=[];

if(waiting){items=waiting.items;baseRevision=waiting.baseRevision;localDirty=true;}
try{const raw=localStorage.getItem(KEY);if(raw)legacy=readBackup(raw);}catch{}

function toast(message){
  $('#toast').textContent=message;$('#toast').hidden=false;
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);
}

function persist(){
  try{saveCache(baseRevision,items,localDirty);}catch(error){toast('端末への保存に失敗しました。'+error.message);}
}

function banner(message){
  $('#sync-banner').hidden=!message;
  $('#sync-message').textContent=message||'';
  $('#migrate-local').hidden=!legacy.length;
}

function showSync(){
  const save=$('#connect-github'),discard=$('#discard-draft');
  save.disabled=false;discard.hidden=true;
  if(waiting){
    $('#save-status').textContent='GitHubの保存を確認中…';
    save.textContent='保存画面を開く';
    banner('GitHubでIssueを送信すると自動で反映を確認します。確認中はこの端末での追加・編集を止めています。');
    return;
  }
  if(conflict){
    $('#save-status').textContent='別端末の更新と競合';
    save.textContent='GitHubに保存';save.disabled=true;discard.hidden=false;
    banner('別の端末で先に更新されています。この端末の変更は残しています。必要ならバックアップしてから「この端末の変更を破棄」で最新状態へ合わせてください。');
    return;
  }
  if(localDirty){
    $('#save-status').textContent=ready?`未同期 · revision ${baseRevision}`:'端末に未同期の変更';
    save.textContent='GitHubに保存';
    discard.hidden=!ready;
    banner('この端末の変更はまだGitHubに保存されていません。');
    return;
  }
  save.textContent='GitHubに保存';save.disabled=true;
  $('#save-status').textContent=ready?`同期済み · revision ${revision}`:'GitHubを確認中…';
  banner(legacy.length?`この端末に旧版のデータが${legacy.length}点あります。必要なら追加できます。`:'');
}

async function refreshData({silent=false}={}){
  if(reading)return;
  if(editor.open){if(!silent)toast('編集を閉じてから更新してください。');return;}
  reading=true;$('#refresh-data').disabled=true;
  if(!silent){$('#refresh-data').textContent='取得中…';$('#save-status').textContent='GitHubを確認中…';}
  try{
    const result=await readRemote();
    revision=result.revision;remoteItems=result.items;lastRead=Date.now();
    let saved=false;

    if(waiting){
      const applied=result.lastRequestId===waiting.requestId||(result.recentRequestIds||[]).includes(waiting.requestId);
      if(applied){
        items=result.items;baseRevision=result.revision;localDirty=false;conflict=false;saved=true;
        clearWaiting();waiting=null;
        if($('#github-dialog').open)$('#github-dialog').close();
      }else if(result.revision>waiting.baseRevision){
        clearWaiting();waiting=null;localDirty=true;conflict=true;
      }
    }else if(!localDirty||sameItems(items,result.items)){
      items=result.items;baseRevision=result.revision;localDirty=false;conflict=false;
    }else if(result.revision===baseRevision){
      conflict=false;
    }else{
      conflict=true;
    }

    ready=true;persist();render();showSync();
    if(!silent)toast(saved?'GitHubへの保存を確認しました':`GitHubから${result.items.length}件を取得しました`);
  }catch(error){
    if(!ready)$('#save-status').textContent='GitHubを取得できません';
    banner(error.message+' この端末の内容はそのまま残しています。');
    if(!silent)toast(error.message);
  }finally{
    reading=false;$('#refresh-data').disabled=false;$('#refresh-data').textContent='最新を取得';
  }
}

async function pollSave(){
  const generation=++pollGeneration;
  for(let i=0;i<45&&waiting&&generation===pollGeneration;i++){
    if(document.visibilityState==='visible')await refreshData({silent:true});
    if(!waiting||generation!==pollGeneration)return;
    await sleep(2000);
  }
  if(waiting&&generation===pollGeneration){showSync();toast('まだ保存を確認できていません。GitHubでIssueを送信したか確認してください。');}
}

function openConnection(){
  if(conflict){toast('別端末の更新と競合しています。先に最新状態へ合わせてください。');return;}
  if(!ready){toast('GitHubの最新版を確認できるまで同期できません。');return;}
  if(!localDirty&&!waiting){toast('保存する変更はありません。');return;}
  try{
    const payload=waiting||createSaveRequest(baseRevision,items);
    if(!waiting){waiting=payload;saveWaiting(payload);}
    const link=issueLink(payload);
    $('#github-link').href=link.url;$('#manual-save').hidden=!link.manual;$('#save-payload').value=link.body;
    $('#github-error').textContent='';$('#github-dialog').showModal();showSync();
  }catch(error){toast(error.message);}
}

async function commit(next){
  if(busy)return false;
  if(waiting){toast('GitHubへの保存確認中です。完了するか保存待ちを解除してから編集してください。');return false;}
  try{
    readBackup(JSON.stringify({version:1,items:next}));
    items=next;localDirty=ready?!sameItems(items,remoteItems):true;
    if(!localDirty&&ready)baseRevision=revision;
    conflict=localDirty&&ready&&revision!==baseRevision;
    persist();render();showSync();return true;
  }catch(error){
    $('#form-error').textContent=error.message;toast('変更を保存できません。'+error.message);return false;
  }
}

function render(){
  const t=totals(items);
  $('#total').textContent=yen(t.total);$('#total-detail').textContent=`購入予定 ${t.count}点 · 手数料を含む`;
  $('#fixed').textContent=yen(t.fixed);$('#planned').innerHTML=`${yen(t.after)}<em>/ 月</em>`;
  $('#sub-total').textContent=yen(t.subscriptions);$('#active-total').textContent=yen(t.active);$('#plan-total').textContent=yen(t.planned);$('#once-total').textContent=yen(t.once);
  $('#product-count').textContent=items.filter(i=>i.kind==='product').length;$('#subscription-count').textContent=items.filter(i=>i.kind==='subscription').length;

  const categories=[...new Set(items.map(i=>i.category))].sort((a,b)=>a.localeCompare(b,'ja'));
  const selected=$('#category-filter').value;
  $('#category-filter').innerHTML='<option value="all">すべてのカテゴリー</option>'+categories.map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
  $('#category-filter').value=categories.includes(selected)?selected:'all';
  $('#categories').innerHTML=[...new Set(['ガジェット','カメラ','暮らし','ファッション','サービス','その他',...categories])].map(c=>`<option value="${escape(c)}">`).join('');

  const sort=$('#sort').value;
  let visible=items.filter(i=>i.kind===(tab==='products'?'product':'subscription')&&($('#category-filter').value==='all'||i.category===$('#category-filter').value));
  if(sort==='priority')visible.sort((a,b)=>a.priority-b.priority);
  if(sort==='price-desc')visible.sort((a,b)=>cost(b).total-cost(a).total);
  if(sort==='price-asc')visible.sort((a,b)=>cost(a).total-cost(b).total);
  if(sort==='newest')visible.sort((a,b)=>b.created-a.created);

  $('#list-summary').textContent=`${visible.length}点${$('#category-filter').value==='all'?'':' · '+$('#category-filter').value}`;
  $('#empty').hidden=visible.length>0;
  $('#empty h2').textContent=items.length?'このリストはまだ空です。':'最初のひとつを、リストに。';
  $('#empty p').innerHTML=tab==='subscriptions'?'毎月・毎年のサブスクや固定費を登録できます。':'商品のリンクから追加して、<br>価格や月々の支払いをまとめて確認できます。';

  $('#items').innerHTML=visible.map((i,index)=>{
    const c=cost(i),sub=i.kind==='subscription',installment=i.payment==='installment'&&!sub;
    let state=sub?({planned:'契約予定',active:'契約中',done:'解約済み'}[i.status]):({planned:'購入予定',active:'支払い中',done:'支払い完了'}[i.status]);
    if(installment&&i.status==='active'){
      if(activePayment(i))state=`あと${i.months-(monthIndex(currentMonth())-monthIndex(i.start))}回`;
      else state=monthIndex(currentMonth())<monthIndex(i.start)?'支払い開始前':'支払い終了';
    }
    return `<article class="item"><div class="item-icon product-image">${i.image?`<img src="${escape(i.image)}" alt="${escape(i.name)}" loading="lazy" referrerpolicy="no-referrer"><span class="image-fallback" hidden aria-hidden="true">◇</span>`:`<span aria-hidden="true">${sub?'↻':installment?'≡':'◇'}</span>`}</div><div><div class="item-name">${i.url?`<a href="${escape(i.url)}" target="_blank" rel="noopener noreferrer">${escape(i.name)} ↗</a>`:escape(i.name)}</div><div class="item-meta"><span>${escape(i.category)}</span><span class="badge ${i.priority===1?'high':''}">${['','優先度 高','優先度 普通','優先度 低'][i.priority]}</span><span>${state}</span></div>${i.note?`<div class="note">${escape(i.note)}</div>`:''}</div><div class="item-price">${yen(sub?c.monthly:c.total)}${sub?'<small>/ 月'+(i.cycle==='yearly'?' · 年払い '+yen(i.price):'')+'</small>':installment?`<small>${yen(c.monthly)} / 月 × ${i.months}回</small>`:'<small>一括払い</small>'}</div><div class="item-actions">${sort==='manual'?`<div class="move-buttons"><button class="icon-button" data-move="-1" data-id="${escape(i.id)}" ${index===0?'disabled':''} aria-label="${escape(i.name)}を上に移動">↑</button><button class="icon-button" data-move="1" data-id="${escape(i.id)}" ${index===visible.length-1?'disabled':''} aria-label="${escape(i.name)}を下に移動">↓</button></div>`:''}<button class="icon-button" data-edit="${escape(i.id)}" aria-label="${escape(i.name)}を編集">⋯</button></div></article>`;
  }).join('');

  $('#items').querySelectorAll('.product-image img').forEach(img=>{img.onerror=()=>{img.hidden=true;img.nextElementSibling.hidden=false;};});
  $('#items').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(items.find(i=>i.id===b.dataset.edit)));
  $('#items').querySelectorAll('[data-move]').forEach(b=>b.onclick=async()=>{
    const from=visible.findIndex(i=>i.id===b.dataset.id),to=from+Number(b.dataset.move);if(!visible[to])return;
    const next=[...items],a=next.findIndex(i=>i.id===visible[from].id),z=next.findIndex(i=>i.id===visible[to].id);
    [next[a],next[z]]=[next[z],next[a]];await commit(next);
  });
}

function updateFields(resetStatus=false){
  const sub=field('kind').value==='subscription',old=field('status').value;
  field('status').innerHTML=(sub?[['planned','契約予定'],['active','契約中'],['done','解約済み']]:[['planned','購入予定'],['active','支払い中'],['done','購入済み・支払い完了']]).map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
  field('status').value=resetStatus?(sub?'active':'planned'):old;
  $('#product-fields').hidden=sub;$('#subscription-fields').hidden=!sub;
  const installment=!sub&&field('payment').value==='installment';$('#installment-fields').hidden=!installment;
  for(const key of ['payment','months','feeType','fee','start'])field(key).disabled=sub||(key!=='payment'&&!installment);
  field('cycle').disabled=!sub;field('start').required=installment&&field('status').value==='active';preview();
}

function formItem(){
  return {id:editing?.id||crypto.randomUUID(),kind:field('kind').value,name:field('name').value.trim(),url:safeUrl(field('url').value.trim()),image:safeUrl(field('image').value.trim()),price:Number(field('price').value),category:field('category').value.trim(),priority:Number(field('priority').value),status:field('status').value,payment:field('payment').value,months:Number(field('months').value)||24,feeType:field('feeType').value,fee:Number(field('fee').value),start:field('start').value,cycle:field('cycle').value,note:field('note').value.trim(),created:editing?.created||Date.now()};
}

function preview(){
  try{
    const c=cost(formItem());
    $('#installment-preview').innerHTML=`月々 <strong>${yen(c.monthly)}</strong><small>支払い総額 ${yen(c.total)} · 手数料 ${yen(c.fee)}<br>毎回 ${yen(Math.floor(c.monthly))} を基準に、端数 ${yen(c.total%Number(field('months').value))} をいずれかの請求に加算。</small>`;
  }catch{$('#installment-preview').textContent='価格・回数を入力すると月額を確認できます。';}
}

function openEditor(item){
  if(busy)return;
  if(waiting){toast('GitHubへの保存確認中です。完了するか保存待ちを解除してください。');return;}
  editing=item||null;form.reset();$('#form-error').textContent='';$('#fetch-status').textContent='';$('#delete-item').hidden=!item;$('#dialog-title').textContent=item?'アイテムを編集':'アイテムを追加';
  const defaults=item||{kind:tab==='subscriptions'?'subscription':'product',status:tab==='subscriptions'?'active':'planned',priority:2,payment:'once',months:24,fee:0,feeType:'yen',cycle:'monthly',start:''};
  Object.entries(defaults).forEach(([k,v])=>{const input=field(k);if(input)input.value=String(v);});
  updateFields();updateImagePreview();editor.showModal();field('url').focus();
}

function closeEditor(){if(busy)return;request?.abort();request=null;editor.close();}

$('#add').onclick=$('#empty-add').onclick=()=>openEditor();
$('#close-editor').onclick=$('#cancel-editor').onclick=closeEditor;
editor.addEventListener('close',()=>{request?.abort();request=null;});
field('kind').onchange=()=>updateFields(true);field('payment').onchange=()=>updateFields();field('status').onchange=()=>updateFields();form.addEventListener('input',preview);

form.onsubmit=async e=>{
  e.preventDefault();
  try{
    const item=validate(formItem());
    if(await commit(editing?items.map(i=>i.id===editing.id?item:i):[...items,item])){closeEditor();toast('この端末に変更を保存しました');}
  }catch(error){$('#form-error').textContent=error.message;}
};

async function confirmAction(title,body,action){
  $('#confirm-title').textContent=title;$('#confirm-body').textContent=body;$('#confirm-ok').textContent=action;
  const d=$('#confirm-dialog');d.returnValue='';d.showModal();
  return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true}));
}

$('#delete-item').onclick=async()=>{
  if(await confirmAction('このアイテムを削除しますか？',editing.name,'削除する')){
    if(await commit(items.filter(i=>i.id!==editing.id))){closeEditor();toast('この端末から削除しました');}
  }
};

document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));render();});
document.querySelectorAll('[role=tab]').forEach(b=>b.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=[...document.querySelectorAll('[role=tab]')].find(x=>x!==b);next.click();next.focus();}}));
$('#sort').onchange=$('#category-filter').onchange=render;

$('#fetch-info').onclick=async()=>{
  let url;
  try{url=safeUrl(field('url').value.trim());if(!url)throw new Error('先にリンクを入力してください。');}
  catch(error){$('#fetch-status').textContent=error.message;return;}
  request?.abort();const controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),35000);
  $('#fetch-info').disabled=true;$('#fetch-status').textContent='商品情報を確認中…';
  try{
    const params=new URLSearchParams({url,'data.structured.selectorAll':'script[type="application/ld+json"]','data.structured.attr':'text','data.price.selector':'meta[property="product:price:amount"],meta[property="og:price:amount"],meta[itemprop="price"]','data.price.attr':'content','data.currency.selector':'meta[property="product:price:currency"],meta[property="og:price:currency"],meta[itemprop="priceCurrency"]','data.currency.attr':'content'});
    const response=await fetch('https://api.microlink.io/?'+params,{signal:controller.signal});
    if(!response.ok)throw new Error('取得制限または接続エラー');
    const result=await response.json();if(result.status!=='success')throw new Error('取得に失敗');
    if(request!==controller||!editor.open||(field('url').value.trim()!==url&&safeUrl(field('url').value.trim())!==url))return;
    const product=extractProduct(result.data||{});
    if(product.image&&!field('image').value){field('image').value=product.image;updateImagePreview();}
    if(product.name&&!field('name').value)field('name').value=product.name;
    if(product.price!==null&&!field('price').value)field('price').value=String(product.price);
    if(!field('category').value)field('category').value=guessCategory(product.name+' '+url);
    $('#fetch-status').textContent=product.price===null?'商品情報を取得しました。円の価格を確認できなかったため、価格を入力してください。':'商品情報を取得しました。構成・税込価格を確認してから保存してください。';preview();
  }catch{if(editor.open)$('#fetch-status').textContent='このページの情報を取得できませんでした。名前と価格を手入力して登録できます。';}
  finally{clearTimeout(timeout);if(request===controller){request=null;$('#fetch-info').disabled=false;}else if(!request)$('#fetch-info').disabled=false;}
};

$('#backup').onclick=()=>{
  const blob=new Blob([JSON.stringify({version:1,exported:new Date().toISOString(),items},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`wishlist-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

$('#restore').onclick=()=>$('#restore-file').click();
$('#restore-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(waiting)throw new Error('保存確認中はバックアップを読み込めません。');
    if(file.size>10000000)throw new Error('10MB以下のファイルを選んでください。');
    const next=readBackup(await file.text());
    if(await confirmAction('バックアップを読み込みますか？',`現在の${items.length}点を、バックアップの${next.length}点で置き換えます。`,'読み込む')){
      if(await commit(next))toast('バックアップを読み込みました');
    }
  }catch(error){toast(error.message);}finally{e.target.value='';}
};

function updateImagePreview(){
  const box=$('#image-preview'),img=box.querySelector('img');let url='';
  try{url=safeUrl(field('image').value.trim());}catch{}
  box.hidden=!url;$('#image-error').hidden=true;img.hidden=false;
  img.onerror=()=>{img.hidden=true;$('#image-error').hidden=false;};
  if(url)img.src=url;else img.removeAttribute('src');
}
field('image').addEventListener('change',updateImagePreview);

$('#refresh-data').onclick=()=>refreshData();
$('#connect-github').onclick=openConnection;
$('#close-github').onclick=()=>$('#github-dialog').close();
$('#github-link').onclick=()=>setTimeout(pollSave,1000);
$('#copy-save').onclick=async()=>{
  try{await navigator.clipboard.writeText($('#save-payload').value);toast('コピーしました。GitHubの本文欄に貼り付けてください。');}
  catch{$('#save-payload').focus();$('#save-payload').select();toast('本文を選択しました。コピーしてGitHubに貼り付けてください。');}
};

$('#cancel-pending').onclick=()=>{
  clearWaiting();waiting=null;pollGeneration++;$('#github-dialog').close();showSync();toast('保存待ちを解除しました。この端末の変更は残っています。');
};

$('#discard-draft').textContent='この端末の変更を破棄';
$('#discard-draft').onclick=async()=>{
  if(!ready)return;
  if(await confirmAction('この端末の変更を破棄しますか？','未同期の変更を破棄して、GitHubの最新状態に戻します。必要なら先にバックアップしてください。','破棄する')){
    clearWaiting();waiting=null;pollGeneration++;items=remoteItems;baseRevision=revision;localDirty=false;conflict=false;persist();render();showSync();toast('GitHubの最新状態に戻しました');
  }
};

$('#migrate-local').onclick=async()=>{
  if(waiting){toast('保存確認中は旧データを追加できません。');return;}
  const ids=new Set(items.map(i=>i.id)),additional=legacy.filter(i=>!ids.has(i.id));
  if(await confirmAction('端末の旧データを追加しますか？',`${additional.length}点を現在のリストへ追加します。`,'追加する')){
    if(await commit([...items,...additional])){
      try{localStorage.setItem(KEY+'-before-sync-v2',JSON.stringify({version:1,items:legacy}));localStorage.removeItem(KEY);}catch{}
      legacy=[];showSync();toast('旧データを追加しました');
    }
  }
};

editor.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
window.addEventListener('focus',()=>{
  if(waiting)pollSave();
  else if(!editor.open&&Date.now()-lastRead>15000)refreshData({silent:true});
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  if(waiting)pollSave();
  else if(!editor.open&&Date.now()-lastRead>15000)refreshData({silent:true});
});

render();showSync();refreshData();if(waiting)setTimeout(pollSave,500);

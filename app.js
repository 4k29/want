import {GitHubStore,CACHE_KEY,DRAFT_KEY,buildRequest,applyRequest,hasChanges,issueLink,refreshState} from './sync.js?v=7';
import {KEY,yen,currentMonth,monthIndex,cost,activePayment,totals,guessCategory,safeUrl,validate,readBackup,extractProduct} from './model.js?v=2';
const $=s=>document.querySelector(s),form=$('#item-form'),editor=$('#editor');
let items=[],tab='products',editing=null,loadError=false,request=null;
const github=new GitHubStore();
let ready=false,busy=false,reading=false,lastRead=0,legacy=[];
try{const raw=localStorage.getItem(KEY);if(raw)legacy=readBackup(raw);}catch{}
const field=name=>form.elements.namedItem(name);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{const raw=localStorage.getItem(CACHE_KEY);if(raw)items=readBackup(raw);}catch{}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);}
let base=[...items],pending=null,draftRaw=null;
try{localStorage.removeItem('wishlist-github-token-4k29-want-v1');}catch{}
try{
  draftRaw=localStorage.getItem(DRAFT_KEY);
  if(draftRaw){const d=JSON.parse(draftRaw);base=readBackup(JSON.stringify({version:1,items:d.base}));items=readBackup(JSON.stringify({version:1,items:d.items}));pending=d.pending||null;ready=true;}
}catch{loadError=!!draftRaw;}
function cache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({version:1,items}));}catch{}}
function persist(next=items,nextBase=base,nextPending=pending){
  if(localStorage.getItem(DRAFT_KEY)!==draftRaw)throw Error('別のタブで下書きが変更されました。このページを再読み込みしてください。');
  const raw=JSON.stringify({version:1,base:nextBase,items:next,pending:nextPending});
  localStorage.setItem(DRAFT_KEY,raw);draftRaw=raw;
}
function banner(message){$('#sync-banner').hidden=!message;$('#sync-message').textContent=message;$('#migrate-local').hidden=!legacy.length;}
function showLegacy(){
  const dirty=hasChanges(base,items);
  $('#save-status').textContent=pending?'GitHubで確定・反映待ち':dirty?'下書き · 未同期':'GitHubの最新データ';
  $('#connect-github').textContent=pending?'保存画面を開く':'GitHubに保存';
  $('#discard-draft').hidden=!dirty&&!pending;
  banner(pending?'GitHubの画面で「Submit new issue」を押した後、反映まで少し待って「最新を取得」を押してください。':dirty?'変更はこの端末の下書きです。「GitHubに保存」で他の端末にも反映できます。':legacy.length?`この端末に旧版のデータが${legacy.length}点あります。下書きに追加できます。`:'');
}
async function refreshData(){
  if(busy||reading){toast('共通データを取得中です。少しお待ちください。');return;}
  if(editor.open){toast('編集を閉じてから更新してください。');return;}
  reading=true;$('#refresh-data').disabled=true;$('#refresh-data').textContent='取得中…';$('#save-status').textContent='共通データを確認中…';
  try{
    // Adopt a newer draft from another tab before merging remote changes.
    let stored;try{stored=localStorage.getItem(DRAFT_KEY);}catch{}
    if(stored!==undefined&&stored!==draftRaw){
      if(stored){const d=JSON.parse(stored);base=readBackup(JSON.stringify({version:1,items:d.base}));items=readBackup(JSON.stringify({version:1,items:d.items}));pending=d.pending||null;ready=true;}
      draftRaw=stored;
    }
    const result=await github.read();
    if(loadError)throw Error('端末の下書きが壊れているため、上書きを止めています。');
    const state=refreshState({base,items,pending,ready},result);
    let storageWarning='';
    try{persist(state.items,state.base,state.pending);}catch(error){storageWarning='共通データは取得できましたが、端末には保存できませんでした。'+error.message;}
    items=state.items;base=state.base;pending=state.pending;
    ready=true;lastRead=Date.now();cache();render();showLegacy();
    const time=new Date(lastRead).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const message=state.saved?'GitHubへの保存を確認しました':`共通データ${result.items.length}件を取得しました`;
    $('#save-status').textContent=time+' 更新 · '+(pending?'保存の確定・反映待ち':hasChanges(base,items)?'端末に未同期の変更あり':'取得完了');
    if(storageWarning)banner(storageWarning);
    else if(pending)banner(message+'。この保存リクエストはまだ反映されていません。「保存画面を開く」からGitHubで確定してください。確定済みの場合は少し待って再取得してください。');
    else if(hasChanges(base,items))banner(message+'。端末の下書きは保持しています。他の端末への反映には「GitHubに保存」で確定してください。');
    else if(!result.items.length&&!legacy.length)banner('共通データは0件です。「最新を取得」は読み込み専用です。追加した内容は「GitHubに保存」で確定すると同期されます。');
    toast(message+(hasChanges(base,items)?'。端末の下書きは保持しています。':''));
  }catch(error){$('#save-status').textContent='取得できませんでした';banner(error.message+' 表示中の内容は変更していません。');$('#discard-draft').hidden=!ready;toast(error.message);}
  finally{reading=false;$('#refresh-data').disabled=false;$('#refresh-data').textContent='最新を取得';}
}
function openConnection(){
  if(!ready){toast('先に「最新を取得」で共通データを読み込んでください。');return;}
  if(!hasChanges(base,items)&&!pending){toast('保存する変更はありません。');return;}
  try{
    const payload=pending||{...buildRequest(base,items),localItems:items},link=issueLink(payload);
    persist(items,base,payload);pending=payload;
    $('#github-link').href=link.url;$('#manual-save').hidden=!link.manual;$('#save-payload').value=link.body;
    $('#github-error').textContent='';$('#github-dialog').showModal();showLegacy();
  }catch(error){toast(error.message);}
}
async function commit(next){
  if(busy)return false;
  try{readBackup(JSON.stringify({version:1,items:next}));persist(next);items=next;ready=true;cache();render();showLegacy();return true;}
  catch(error){$('#form-error').textContent=error.message;toast('下書きを保存できません。'+error.message);return false;}
}
function render(){
  const t=totals(items);$('#total').textContent=yen(t.total);$('#total-detail').textContent=`購入予定 ${t.count}点 · 手数料を含む`;$('#fixed').textContent=yen(t.fixed);$('#planned').innerHTML=`${yen(t.after)}<em>/ 月</em>`;
  $('#sub-total').textContent=yen(t.subscriptions);$('#active-total').textContent=yen(t.active);$('#plan-total').textContent=yen(t.planned);$('#once-total').textContent=yen(t.once);
  $('#product-count').textContent=items.filter(i=>i.kind==='product').length;$('#subscription-count').textContent=items.filter(i=>i.kind==='subscription').length;
  const categories=[...new Set(items.map(i=>i.category))].sort((a,b)=>a.localeCompare(b,'ja'));const selected=$('#category-filter').value;
  $('#category-filter').innerHTML='<option value="all">すべてのカテゴリー</option>'+categories.map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');$('#category-filter').value=categories.includes(selected)?selected:'all';
  $('#categories').innerHTML=[...new Set(['ガジェット','カメラ','暮らし','ファッション','サービス','その他',...categories])].map(c=>`<option value="${escape(c)}">`).join('');
  const sort=$('#sort').value;let visible=items.filter(i=>i.kind===(tab==='products'?'product':'subscription')&&($('#category-filter').value==='all'||i.category===$('#category-filter').value));
  if(sort==='priority')visible.sort((a,b)=>a.priority-b.priority);if(sort==='price-desc')visible.sort((a,b)=>cost(b).total-cost(a).total);if(sort==='price-asc')visible.sort((a,b)=>cost(a).total-cost(b).total);if(sort==='newest')visible.sort((a,b)=>b.created-a.created);
  $('#list-summary').textContent=`${visible.length}点${$('#category-filter').value==='all'?'':' · '+$('#category-filter').value}`;
  $('#empty').hidden=visible.length>0;$('#empty h2').textContent=items.length?'このリストはまだ空です。':'最初のひとつを、リストに。';$('#empty p').innerHTML=tab==='subscriptions'?'毎月・毎年のサブスクや固定費を登録できます。':'商品のリンクから追加して、<br>価格や月々の支払いをまとめて確認できます。';
  $('#items').innerHTML=visible.map((i,index)=>{
    const c=cost(i),sub=i.kind==='subscription',installment=i.payment==='installment'&&!sub;
    let state=sub?({planned:'契約予定',active:'契約中',done:'解約済み'}[i.status]):({planned:'購入予定',active:'支払い中',done:'支払い完了'}[i.status]);
    if(installment&&i.status==='active'){if(activePayment(i))state=`あと${i.months-(monthIndex(currentMonth())-monthIndex(i.start))}回`;else state=monthIndex(currentMonth())<monthIndex(i.start)?'支払い開始前':'支払い終了';}
    return `<article class="item"><div class="item-icon product-image">${i.image?`<img src="${escape(i.image)}" alt="${escape(i.name)}" loading="lazy" referrerpolicy="no-referrer"><span class="image-fallback" hidden aria-hidden="true">◇</span>`:`<span aria-hidden="true">${sub?'↻':installment?'≡':'◇'}</span>`}</div><div><div class="item-name">${i.url?`<a href="${escape(i.url)}" target="_blank" rel="noopener noreferrer">${escape(i.name)} ↗</a>`:escape(i.name)}</div><div class="item-meta"><span>${escape(i.category)}</span><span class="badge ${i.priority===1?'high':''}">${['','優先度 高','優先度 普通','優先度 低'][i.priority]}</span><span>${state}</span></div>${i.note?`<div class="note">${escape(i.note)}</div>`:''}</div><div class="item-price">${yen(sub?c.monthly:c.total)}${sub?'<small>/ 月'+(i.cycle==='yearly'?' · 年払い '+yen(i.price):'')+'</small>':installment?`<small>${yen(c.monthly)} / 月 × ${i.months}回</small>`:'<small>一括払い</small>'}</div><div class="item-actions">${sort==='manual'?`<div class="move-buttons"><button class="icon-button" data-move="-1" data-id="${escape(i.id)}" ${index===0?'disabled':''} aria-label="${escape(i.name)}を上に移動">↑</button><button class="icon-button" data-move="1" data-id="${escape(i.id)}" ${index===visible.length-1?'disabled':''} aria-label="${escape(i.name)}を下に移動">↓</button></div>`:''}<button class="icon-button" data-edit="${escape(i.id)}" aria-label="${escape(i.name)}を編集">⋯</button></div></article>`;
  }).join('');
  $('#items').querySelectorAll('.product-image img').forEach(img=>{img.onerror=()=>{img.hidden=true;img.nextElementSibling.hidden=false;};});
  $('#items').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(items.find(i=>i.id===b.dataset.edit)));
  $('#items').querySelectorAll('[data-move]').forEach(b=>b.onclick=async()=>{const from=visible.findIndex(i=>i.id===b.dataset.id),to=from+Number(b.dataset.move);if(!visible[to])return;const next=[...items],a=next.findIndex(i=>i.id===visible[from].id),z=next.findIndex(i=>i.id===visible[to].id);[next[a],next[z]]=[next[z],next[a]];await commit(next);});
}
function updateFields(resetStatus=false){const sub=field('kind').value==='subscription';const old=field('status').value;field('status').innerHTML=(sub?[['planned','契約予定'],['active','契約中'],['done','解約済み']]:[['planned','購入予定'],['active','支払い中'],['done','購入済み・支払い完了']]).map(([v,t])=>`<option value="${v}">${t}</option>`).join('');field('status').value=resetStatus?(sub?'active':'planned'):old;
  $('#product-fields').hidden=sub;$('#subscription-fields').hidden=!sub;const installment=!sub&&field('payment').value==='installment';$('#installment-fields').hidden=!installment;for(const key of ['payment','months','feeType','fee','start'])field(key).disabled=sub||(key!=='payment'&&!installment);field('cycle').disabled=!sub;
  field('start').required=installment&&field('status').value==='active';preview();}
function formItem(){return {id:editing?.id||crypto.randomUUID(),kind:field('kind').value,name:field('name').value.trim(),url:safeUrl(field('url').value.trim()),image:safeUrl(field('image').value.trim()),price:Number(field('price').value),category:field('category').value.trim(),priority:Number(field('priority').value),status:field('status').value,payment:field('payment').value,months:Number(field('months').value)||24,feeType:field('feeType').value,fee:Number(field('fee').value),start:field('start').value,cycle:field('cycle').value,note:field('note').value.trim(),created:editing?.created||Date.now()};}
function preview(){try{const c=cost(formItem());$('#installment-preview').innerHTML=`月々 <strong>${yen(c.monthly)}</strong><small>支払い総額 ${yen(c.total)} · 手数料 ${yen(c.fee)}<br>毎回 ${yen(Math.floor(c.monthly))} を基準に、端数 ${yen(c.total%Number(field('months').value))} をいずれかの請求に加算。</small>`;}catch{$('#installment-preview').textContent='価格・回数を入力すると月額を確認できます。';}}
function openEditor(item){if(busy)return;if(loadError){toast('保存データを読み込めなかったため、上書きを止めています。バックアップを読み込んで復旧してください。');return;}editing=item||null;form.reset();$('#form-error').textContent='';$('#fetch-status').textContent='';$('#delete-item').hidden=!item;$('#dialog-title').textContent=item?'アイテムを編集':'アイテムを追加';
  const defaults=item||{kind:tab==='subscriptions'?'subscription':'product',status:tab==='subscriptions'?'active':'planned',priority:2,payment:'once',months:24,fee:0,feeType:'yen',cycle:'monthly',start:''};Object.entries(defaults).forEach(([k,v])=>{const input=field(k);if(input)input.value=String(v);});updateFields();updateImagePreview();editor.showModal();field('url').focus();}
function closeEditor(){if(busy)return;request?.abort();request=null;editor.close();}
$('#add').onclick=$('#empty-add').onclick=()=>openEditor();$('#close-editor').onclick=$('#cancel-editor').onclick=closeEditor;editor.addEventListener('close',()=>{request?.abort();request=null;});
field('kind').onchange=()=>updateFields(true);field('payment').onchange=()=>updateFields();field('status').onchange=()=>updateFields();form.addEventListener('input',preview);
form.onsubmit=async e=>{e.preventDefault();try{const item=validate(formItem());if(await commit(editing?items.map(i=>i.id===editing.id?item:i):[...items,item])){closeEditor();toast('下書きに反映しました。「GitHubに保存」で同期できます');}}catch(error){$('#form-error').textContent=error.message;}};
async function confirmAction(title,body,action){$('#confirm-title').textContent=title;$('#confirm-body').textContent=body;$('#confirm-ok').textContent=action;const d=$('#confirm-dialog');d.returnValue='';d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true}));}
$('#delete-item').onclick=async()=>{if(await confirmAction('このアイテムを削除しますか？',editing.name,'削除する')){if(await commit(items.filter(i=>i.id!==editing.id))){closeEditor();toast('下書きから削除しました。同期には「GitHubに保存」を押してください');}}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));render();});
document.querySelectorAll('[role=tab]').forEach(b=>b.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=[...document.querySelectorAll('[role=tab]')].find(x=>x!==b);next.click();next.focus();}}));
$('#sort').onchange=$('#category-filter').onchange=render;
$('#fetch-info').onclick=async()=>{
  let url;try{url=safeUrl(field('url').value.trim());if(!url)throw new Error('先にリンクを入力してください。');}catch(e){$('#fetch-status').textContent=e.message;return;}
  request?.abort();const controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),35000);$('#fetch-info').disabled=true;$('#fetch-status').textContent='商品情報を確認中…';
  try{
    const params=new URLSearchParams({url,'data.structured.selectorAll':'script[type="application/ld+json"]','data.structured.attr':'text','data.price.selector':'meta[property="product:price:amount"],meta[property="og:price:amount"],meta[itemprop="price"]','data.price.attr':'content','data.currency.selector':'meta[property="product:price:currency"],meta[property="og:price:currency"],meta[itemprop="priceCurrency"]','data.currency.attr':'content'});
    const response=await fetch('https://api.microlink.io/?'+params,{signal:controller.signal});if(!response.ok)throw new Error('取得制限または接続エラー');const result=await response.json();if(result.status!=='success')throw new Error('取得に失敗');
    if(request!==controller||!editor.open||field('url').value.trim()!==url&&safeUrl(field('url').value.trim())!==url)return;
    const product=extractProduct(result.data||{});if(product.image&&!field('image').value){field('image').value=product.image;updateImagePreview();}if(product.name&&!field('name').value)field('name').value=product.name;if(product.price!==null&&!field('price').value)field('price').value=String(product.price);if(!field('category').value)field('category').value=guessCategory(product.name+' '+url);
    $('#fetch-status').textContent=product.price===null?'商品情報を取得しました。円の価格を確認できなかったため、価格を入力してください。':'商品情報を取得しました。構成・税込価格を確認してから保存してください。';preview();
  }catch{if(editor.open)$('#fetch-status').textContent='このページの情報を取得できませんでした。名前と価格を手入力して登録できます。';}
  finally{clearTimeout(timeout);if(request===controller){request=null;$('#fetch-info').disabled=false;}else if(!request)$('#fetch-info').disabled=false;}
};
$('#backup').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,exported:new Date().toISOString(),items},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`wishlist-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#restore').onclick=()=>$('#restore-file').click();$('#restore-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10000000)throw new Error('10MB以下のファイルを選んでください。');const next=readBackup(await file.text());if(await confirmAction('バックアップを読み込みますか？',`現在の${items.length}点を、バックアップの${next.length}点で置き換えます。`,'読み込む')){if(await commit(next))toast('バックアップを読み込みました');}}catch(error){toast(error.message);}finally{e.target.value='';}};
function updateImagePreview(){
  const box=$('#image-preview'),img=box.querySelector('img');
  let url='';try{url=safeUrl(field('image').value.trim());}catch{}
  box.hidden=!url;$('#image-error').hidden=true;img.hidden=false;
  img.onerror=()=>{img.hidden=true;$('#image-error').hidden=false;};
  if(url)img.src=url;else img.removeAttribute('src');
}
field('image').addEventListener('change',updateImagePreview);
$('#refresh-data').onclick=refreshData;
$('#connect-github').onclick=openConnection;
$('#close-github').onclick=()=>$('#github-dialog').close();
$('#copy-save').onclick=async()=>{try{await navigator.clipboard.writeText($('#save-payload').value);toast('コピーしました。GitHubの本文欄に貼り付けてください。');}catch{$('#save-payload').focus();$('#save-payload').select();toast('本文を選択しました。コピーしてGitHubに貼り付けてください。');}};
$('#cancel-pending').onclick=()=>{try{persist(items,base,null);pending=null;$('#github-dialog').close();showLegacy();toast('保存待ちを解除しました。提出済みのGitHubリクエストは取り消されません。');}catch(error){toast(error.message);}};
$('#discard-draft').onclick=async()=>{
  if(await confirmAction('端末の下書きを破棄しますか？','この端末の未同期の変更を破棄して共通データを読み直します。必要な内容は先にバックアップしてください。提出済みのGitHubリクエストは取り消されません。','下書きを破棄')){
    try{persist(base,base,null);items=base;pending=null;render();showLegacy();await refreshData();}catch(error){toast(error.message);}
  }
};
$('#migrate-local').onclick=async()=>{
  if(!ready){toast('先に「最新を取得」してください。');return;}
  const ids=new Set(items.map(i=>i.id));const additional=legacy.filter(i=>!ids.has(i.id));
  if(await confirmAction('端末のデータを下書きに追加しますか？',`${additional.length}点を追加します。「GitHubに保存」を押すまではこの端末だけに保存されます。同じIDの項目は現在の内容を優先します。`,'下書きに追加')){
    if(await commit([...items,...additional])){try{localStorage.setItem(KEY+'-before-github',JSON.stringify({version:1,items:legacy}));localStorage.removeItem(KEY);}catch{}legacy=[];showLegacy();toast('下書きに追加しました。同期には「GitHubに保存」を押してください');}
  }
};
editor.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
window.addEventListener('focus',()=>{if(!editor.open&&!$('#github-dialog').open&&Date.now()-lastRead>120000)refreshData();});

render();refreshData();

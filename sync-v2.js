import {readBackup} from './model.js?v=2';

export const CACHE_KEY='wishlist-sync-v2-cache';
export const WAITING_KEY='wishlist-sync-v2-waiting';
export const ISSUE_URL='https://github.com/4k29/want/issues/new';
const RAW_URL='https://raw.githubusercontent.com/4k29/want/main/data/wishlist.json';

function validItems(items){
  return readBackup(JSON.stringify({version:1,items}));
}

export function sameItems(a,b){return JSON.stringify(a)===JSON.stringify(b);}

export async function readRemote(fetcher=fetch){
  const urls=[RAW_URL+'?t='+Date.now(),'./data/wishlist.json?t='+Date.now()];
  let lastError;
  for(const url of urls){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetcher(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(data?.version!==2||!Number.isInteger(data.revision)||data.revision<0||typeof data.updatedAt!=='string'||!Array.isArray(data.items))throw new Error('共通データの形式が正しくありません。');
      return {
        version:2,
        revision:data.revision,
        updatedAt:data.updatedAt,
        lastRequestId:typeof data.lastRequestId==='string'?data.lastRequestId:'',
        recentRequestIds:Array.isArray(data.recentRequestIds)?data.recentRequestIds.filter(id=>typeof id==='string').slice(-100):[],
        items:validItems(data.items)
      };
    }catch(error){lastError=error;}
    finally{clearTimeout(timer);}
  }
  if(lastError?.name==='AbortError'||lastError instanceof TypeError)throw new Error('共通データを読み込めません。通信を確認してください。');
  throw new Error('共通データを読み込めません。'+(lastError?.message||''));
}

export function createSaveRequest(baseRevision,items,id=crypto.randomUUID()){
  if(!Number.isInteger(baseRevision)||baseRevision<0)throw new Error('同期元の版が不明です。最新を取得してください。');
  return {version:2,requestId:id,baseRevision,items:validItems(items)};
}

export function issueLink(payload){
  const body='Wishlist v2 の共通データを保存します。\n\n```json\n'+JSON.stringify(payload)+'\n```';
  if(body.length>60000)throw new Error('保存データが大きすぎます。アイテム数やメモを減らしてください。');
  const url=new URL(ISSUE_URL);
  url.searchParams.set('title','[Wishlist v2] Save '+payload.requestId);
  url.searchParams.set('body',body);
  const manual=url.href.length>7500;
  if(manual)url.searchParams.delete('body');
  return {url:url.href,body,manual};
}

export function loadCache(storage=localStorage){
  try{
    const raw=storage.getItem(CACHE_KEY);if(!raw)return null;
    const data=JSON.parse(raw);
    if(data.version!==2||!Number.isInteger(data.baseRevision)||data.baseRevision<0||typeof data.dirty!=='boolean')return null;
    return {baseRevision:data.baseRevision,dirty:data.dirty,items:validItems(data.items)};
  }catch{return null;}
}

export function saveCache(baseRevision,items,dirty,storage=localStorage){
  storage.setItem(CACHE_KEY,JSON.stringify({version:2,baseRevision,dirty:!!dirty,items:validItems(items)}));
}

export function loadWaiting(storage=localStorage){
  try{
    const raw=storage.getItem(WAITING_KEY);if(!raw)return null;
    const data=JSON.parse(raw);
    if(data.version!==2||typeof data.requestId!=='string'||!data.requestId||!Number.isInteger(data.baseRevision)||data.baseRevision<0||!Array.isArray(data.items))return null;
    return {version:2,requestId:data.requestId,baseRevision:data.baseRevision,items:validItems(data.items)};
  }catch{return null;}
}

export function saveWaiting(waiting,storage=localStorage){storage.setItem(WAITING_KEY,JSON.stringify(waiting));}
export function clearWaiting(storage=localStorage){storage.removeItem(WAITING_KEY);}

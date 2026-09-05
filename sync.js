import {readBackup,validate} from './model.js?v=2';
export const CACHE_KEY='wishlist-github-cache-4k29-want-v1';
export const DRAFT_KEY='wishlist-github-draft-4k29-want-v2';
export const ISSUE_URL='https://github.com/4k29/want/issues/new';
const same=(a,b)=>JSON.stringify(a,Object.keys(a||{}).sort())===JSON.stringify(b,Object.keys(b||{}).sort());
const equalOrder=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function buildRequest(base,items,id=crypto.randomUUID()){
  readBackup(JSON.stringify({version:1,items:base}));readBackup(JSON.stringify({version:1,items}));
  const b=new Map(base.map(i=>[i.id,i])),n=new Map(items.map(i=>[i.id,i]));
  return {version:1,id,changes:[...new Set([...b.keys(),...n.keys()])].filter(id=>!same(b.get(id),n.get(id))).map(id=>({id,before:b.get(id)||null,after:n.get(id)||null})),beforeOrder:base.map(i=>i.id),afterOrder:items.map(i=>i.id)};
}
export function hasChanges(base,items){const r=buildRequest(base,items,'check');return !!r.changes.length||!equalOrder(r.beforeOrder,r.afterOrder);}
export function applyRequest(payload,remote){
  if(payload?.version!==1||typeof payload.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(payload.id)||!Array.isArray(payload.changes)||payload.changes.length>10000)throw Error('保存リクエストの形式が正しくありません。');
  readBackup(JSON.stringify({version:1,items:remote}));
  for(const order of [payload.beforeOrder,payload.afterOrder])if(!Array.isArray(order)||order.length>10000||order.some(id=>typeof id!=='string'||id.length>200)||new Set(order).size!==order.length)throw Error('並び順の形式が正しくありません。');
  const before=new Set(payload.beforeOrder),after=new Set(payload.afterOrder),changed=new Set(),r=new Map(remote.map(i=>[i.id,i]));
  for(const c of payload.changes){
    if(!c||typeof c.id!=='string'||changed.has(c.id)||c.before===undefined||c.after===undefined||(!c.before&&!c.after))throw Error('変更内容の形式が正しくありません。');
    changed.add(c.id);
    for(const value of [c.before,c.after])if(value!==null){validate(value);if(value.id!==c.id)throw Error('項目IDが一致しません。');}
    if(before.has(c.id)!==!!c.before||after.has(c.id)!==!!c.after)throw Error('変更内容と並び順が一致しません。');
    if(!same(c.before,r.get(c.id)||null)&&!same(c.after,r.get(c.id)||null))throw Error('同じ項目が別の端末でも変更されています。サイトで最新を取得し、変更を調整してから保存し直してください。');
    if(c.after)r.set(c.id,c.after);else r.delete(c.id);
  }
  for(const id of new Set([...before,...after]))if(before.has(id)!==after.has(id)&&!changed.has(id))throw Error('追加・削除の内容が不足しています。');
  const common=id=>before.has(id)&&after.has(id)&&r.has(id);
  const b=payload.beforeOrder.filter(common),l=payload.afterOrder.filter(common),rr=remote.map(i=>i.id).filter(common);
  const reordered=!equalOrder(b,l);
  if(reordered&&!equalOrder(b,rr)&&!equalOrder(l,rr))throw Error('別の端末でも並び順が変更されています。最新を取得して調整してください。');
  const order=reordered?payload.afterOrder:remote.map(i=>i.id);
  const items=[...new Set([...order,...payload.afterOrder,...r.keys()])].filter(id=>r.has(id)).map(id=>r.get(id));
  readBackup(JSON.stringify({version:1,items}));return items;
}
export function issueLink(payload){
  const body='Wishlistの共通データを保存します。\n\n```json\n'+JSON.stringify(payload)+'\n```';
  if(body.length>60000)throw Error('一度の変更量が大きすぎます。変更を分けて保存してください。');
  const url=new URL(ISSUE_URL);url.searchParams.set('title','[Wishlist] 保存 '+payload.id);url.searchParams.set('body',body);
  const manual=url.href.length>7000;if(manual)url.searchParams.delete('body');
  return {url:url.href,body,manual};
}
export class GitHubStore {
  constructor(fetcher=fetch){this.fetcher=fetcher;}
  async read(){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await this.fetcher('./data/wishlist.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('共通データを取得できません（'+response.status+'）。時間を置いて「最新を取得」を押してください。');
      const raw=await response.text(),data=JSON.parse(raw);
      return {items:readBackup(raw),appliedRequests:Array.isArray(data.appliedRequests)?data.appliedRequests:[]};
    }catch(error){if(error instanceof TypeError||error.name==='AbortError')throw Error('共通データを読み込めません。通信を確認して「最新を取得」を押してください。');throw error;}
    finally{clearTimeout(timer);}
  }
}

export function refreshState(state,result){
  const saved=!!state.pending&&result.appliedRequests.includes(state.pending.id);
  return {base:result.items,items:saved||!state.ready?result.items:applyRequest(buildRequest(state.base,state.items),result.items),pending:saved?null:state.pending,saved};
}

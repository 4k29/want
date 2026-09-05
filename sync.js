import {readBackup} from './model.js?v=2';

export const DATABASE_URL='https://api.github.com/repos/4k29/want/contents/data/wishlist.json';
export const TOKEN_KEY='wishlist-github-token-4k29-want-v1';
export const CACHE_KEY='wishlist-github-cache-4k29-want-v1';
export function encodeData(items){
  const text=JSON.stringify({version:1,items},null,2)+'\n';
  if(new TextEncoder().encode(text).length>900000)throw new Error('データが大きすぎます。画像には画像URLを指定してください。');
  return btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''));
}
export function decodeData(content){return readBackup(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(content.replace(/\s/g,'')),c=>c.charCodeAt(0))));}
function same(a,b){return JSON.stringify(a,Object.keys(a||{}).sort())===JSON.stringify(b,Object.keys(b||{}).sort());}
export function mergeItems(base,local,remote){
  const b=new Map(base.map(i=>[i.id,i])),l=new Map(local.map(i=>[i.id,i])),r=new Map(remote.map(i=>[i.id,i]));
  for(const id of new Set([...b.keys(),...l.keys()])){
    if(same(b.get(id),l.get(id)))continue;
    if(!same(b.get(id),r.get(id))&&!same(l.get(id),r.get(id)))throw new Error(`「${l.get(id)?.name||b.get(id)?.name}」は別の端末でも変更されています。入力をメモに控え、編集を閉じて「最新を取得」してからやり直してください。`);
    if(l.has(id))r.set(id,l.get(id));else r.delete(id);
  }
  const baseIds=base.map(i=>i.id),existing=new Set(baseIds);
  const baseOrder=baseIds.filter(id=>l.has(id)&&r.has(id));
  const localOrder=local.map(i=>i.id).filter(id=>existing.has(id)&&r.has(id));
  const remoteOrder=remote.map(i=>i.id).filter(id=>existing.has(id)&&l.has(id));
  const reordered=JSON.stringify(baseOrder)!==JSON.stringify(localOrder);
  if(reordered&&JSON.stringify(baseOrder)!==JSON.stringify(remoteOrder)&&JSON.stringify(localOrder)!==JSON.stringify(remoteOrder))throw new Error('別の端末でも並び順が変更されています。「最新を取得」してから並べ替えてください。');
  const order=reordered?local.map(i=>i.id):remote.map(i=>i.id);
  return [...new Set([...order,...r.keys()])].filter(id=>r.has(id)).map(id=>r.get(id));
}
export class GitHubStore {
  constructor(fetcher=fetch,storage){
    this.fetcher=fetcher;this.token='';this.storage=storage;this.persisted=false;
    try{if(storage===undefined)this.storage=globalThis.localStorage;this.token=this.storage?.getItem(TOKEN_KEY)||'';this.persisted=!!this.token;}catch{}
  }
  disconnect(){this.token='';this.persisted=false;try{this.storage?.removeItem(TOKEN_KEY);}catch{throw new Error('保存したキーを削除できません。ブラウザのサイトデータを削除してください。');}}
  remember(){this.persisted=false;try{if(this.storage){this.storage.setItem(TOKEN_KEY,this.token);this.persisted=true;}}catch{}}
  headers(){return {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10',...(this.token?{Authorization:`Bearer ${this.token}`}:{})};}
  async request(url,options={}){
    let response;
    try{response=await this.fetcher(url,{...options,headers:{...this.headers(),...options.headers},cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw new Error('GitHubに接続できません。通信状況を確認してください。');}
    if(!response.ok){if(response.status===401){this.disconnect();throw new Error('接続キーが無効か、有効期限が切れています。再接続してください。');}if(response.status===409)throw new Error('保存中に別の変更が入りました。もう一度保存してください。');if(response.status===403||response.status===429)throw new Error('GitHubの権限不足、またはアクセス制限です。接続キーの権限を確認するか、時間を置いて再試行してください。');throw new Error(`GitHubへの保存・取得に失敗しました（${response.status}）。`);}
    return response.json();
  }
  async read(){const d=await this.request(DATABASE_URL+'?ref=main');if(!d.sha||d.encoding!=='base64'||typeof d.content!=='string')throw new Error('共通データの形式を確認できません。');return {items:decodeData(d.content),sha:d.sha};}
  async connect(token){
    this.token=token.trim();
    try{const repo=await this.request('https://api.github.com/repos/4k29/want');if(!repo.permissions?.push)throw new Error('wantへの書き込み権限がある接続キーを入力してください。');await this.read();this.remember();}catch(error){this.disconnect();throw error;}
  }
  async save(base,next){
    if(!this.token)throw new Error('「GitHub接続」から書き込み用の接続キーを設定してください。');
    readBackup(JSON.stringify({version:1,items:next}));
    const latest=await this.read(),merged=mergeItems(base,next,latest.items);
    const result=await this.request(DATABASE_URL,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Update wishlist data [skip ci]',content:encodeData(merged),sha:latest.sha,branch:'main'})});
    if(!result.content?.sha)throw new Error('保存結果を確認できません。「最新を取得」で確認してください。');
    return {items:merged,sha:result.content.sha};
  }
}

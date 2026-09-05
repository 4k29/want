import test from 'node:test';
import assert from 'node:assert/strict';
import {readRemote,createSaveRequest,issueLink,loadCache,saveCache,loadWaiting,saveWaiting,clearWaiting,sameItems} from '../sync-v2.js';

const item={id:'a',kind:'product',name:'MacBook',category:'ガジェット',url:'https://example.com/mac',image:'https://example.com/mac.jpg',note:'',price:100000,fee:0,feeType:'yen',months:24,payment:'once',priority:2,status:'planned',start:'',cycle:'monthly',created:1};

function memoryStorage(){
  const map=new Map();
  return {getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
}

test('v2 reads the GitHub source with revision and save receipts',async()=>{
  const db={version:2,revision:4,updatedAt:'2026-09-05T00:00:00.000Z',lastRequestId:'req-4',recentRequestIds:['req-3','req-4'],items:[item]};
  let called='';
  const result=await readRemote(async url=>{called=String(url);return new Response(JSON.stringify(db));});
  assert.match(called,/raw\.githubusercontent\.com\/4k29\/want\/main\/data\/wishlist\.json/);
  assert.equal(result.revision,4);assert.equal(result.lastRequestId,'req-4');assert.deepEqual(result.recentRequestIds,['req-3','req-4']);assert.deepEqual(result.items,[item]);
});

test('v2 falls back to the Pages copy only if the GitHub source fails',async()=>{
  const db={version:2,revision:2,updatedAt:'2026-09-05T00:00:00.000Z',lastRequestId:'',recentRequestIds:[],items:[item]};
  const urls=[];
  const result=await readRemote(async url=>{urls.push(String(url));return urls.length===1?new Response('',{status:503}):new Response(JSON.stringify(db));});
  assert.equal(urls.length,2);assert.match(urls[1],/^\.\/data\/wishlist\.json/);assert.equal(result.revision,2);
});

test('save request is one complete snapshot tied to one base revision',()=>{
  const payload=createSaveRequest(7,[item],'request-7');
  assert.deepEqual(payload,{version:2,requestId:'request-7',baseRevision:7,items:[item]});
  const link=issueLink(payload);const url=new URL(link.url);
  assert.match(url.searchParams.get('title'),/^\[Wishlist v2\] Save request-7$/);
  assert.match(url.searchParams.get('body'),/"baseRevision":7/);
});

test('cache remembers only base revision, items and whether the local copy is dirty',()=>{
  const storage=memoryStorage();saveCache(3,[item],true,storage);
  assert.deepEqual(loadCache(storage),{baseRevision:3,dirty:true,items:[item]});
  saveCache(4,[item],false,storage);assert.equal(loadCache(storage).dirty,false);
});

test('one waiting snapshot survives reload and can be cleared',()=>{
  const storage=memoryStorage(),waiting=createSaveRequest(3,[item],'wait-1');
  saveWaiting(waiting,storage);assert.deepEqual(loadWaiting(storage),waiting);
  clearWaiting(storage);assert.equal(loadWaiting(storage),null);
});

test('item equality is exact and order-sensitive',()=>{
  assert.equal(sameItems([item],[item]),true);
  assert.equal(sameItems([item],[{...item,price:1}]),false);
  assert.equal(sameItems([item,{...item,id:'b'}],[{...item,id:'b'},item]),false);
});

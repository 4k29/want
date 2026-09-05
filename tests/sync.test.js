import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubStore,encodeData,decodeData,mergeItems,DATABASE_URL,TOKEN_KEY} from '../sync.js';
import {extractProduct,validate} from '../model.js';
const item={id:'a',kind:'product',name:'カメラ 📷',category:'カメラ',url:'https://example.com/camera',image:'https://example.com/camera.jpg',note:'色：黒',price:100000,fee:0,feeType:'yen',months:24,payment:'installment',priority:2,status:'planned',start:'2026-09',cycle:'monthly',created:1};
test('connection accepts omitted optional permissions and avoids custom version header',async()=>{
 const store=new GitHubStore(async(url,options)=>{assert.equal(options.headers['X-GitHub-Api-Version'],undefined);assert.ok(options.signal instanceof AbortSignal);return new Response(JSON.stringify(url.includes('/contents/')?{sha:'s',encoding:'base64',content:encodeData([])}:{}));},null);
 await store.connect('test-only-key');assert.equal(store.token,'test-only-key');
});
test('temporary connection failure retains saved key and invalid pasted input makes no request',async()=>{
 const values=new Map([[TOKEN_KEY,'saved-test-key']]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let calls=0;const store=new GitHubStore(async()=>{calls++;throw new TypeError('Failed to fetch');},storage);
 await assert.rejects(store.connect('replacement-test-key'),/通信エラー/);assert.equal(store.token,'saved-test-key');assert.equal(values.get(TOKEN_KEY),'saved-test-key');
 await assert.rejects(store.connect('invalid\nkey'),/改行/);assert.equal(calls,1);
});
test('verified key survives reload and disconnect removes it',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const fetcher=async url=>new Response(JSON.stringify(url.includes('/contents/')?{sha:'s',encoding:'base64',content:encodeData([])}:{permissions:{push:true}}));
 const first=new GitHubStore(fetcher,storage);await first.connect('test-only-key');assert.equal(first.persisted,true);assert.equal(values.get(TOKEN_KEY),'test-only-key');
 const reloaded=new GitHubStore(fetcher,storage);assert.equal(reloaded.token,'test-only-key');reloaded.disconnect();assert.equal(new GitHubStore(fetcher,storage).token,'');
});
test('expired keys are removed and unavailable storage is reported',async()=>{
 const values=new Map([[TOKEN_KEY,'expired']]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const expired=new GitHubStore(async()=>new Response('{}',{status:401}),storage);await assert.rejects(expired.read(),/期限/);assert.equal(expired.token,'');assert.equal(values.has(TOKEN_KEY),false);
 const unavailable={getItem:()=>{throw Error();},setItem:()=>{throw Error();},removeItem:()=>{}};
 const store=new GitHubStore(async url=>new Response(JSON.stringify(url.includes('/contents/')?{sha:'s',encoding:'base64',content:encodeData([])}:{permissions:{push:true}})),unavailable);await store.connect('test');assert.equal(store.persisted,false);assert.equal(store.token,'test');
});
test('Japanese text, emoji and image URL survive GitHub encoding',()=>{assert.deepEqual(decodeData(encodeData([item])),[item]);});
test('independent device edits merge without losing changes',()=>{
 const b={...item,id:'b',name:'B'};
 assert.deepEqual(mergeItems([item,b],[{...item,price:200000},b],[item,{...b,priority:1}]),[{...item,price:200000},{...b,priority:1}]);
});
test('edit/edit and delete/edit conflicts are rejected',()=>{
 assert.throws(()=>mergeItems([item],[{...item,price:2}],[{...item,price:3}]),/別の端末/);
 assert.throws(()=>mergeItems([item],[],[{...item,price:3}]),/別の端末/);
});
test('remote deletion is not revived by unrelated local additions',()=>{
 const added={...item,id:'b'};assert.deepEqual(mergeItems([item],[item,added],[]),[added]);
});
test('reordering preserves remote additions and rejects conflicting reorder',()=>{
 const b={...item,id:'b'},c={...item,id:'c'},d={...item,id:'d'};
 assert.deepEqual(mergeItems([item,b],[b,item],[item,b,c]),[b,item,c]);
 assert.throws(()=>mergeItems([item,b,c,d],[b,item,c,d],[item,c,b,d]),/並び順/);
});
test('GitHub save uses latest file SHA and keeps token in authorization only',async()=>{
 const calls=[];const store=new GitHubStore(async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(options.method==='PUT'?{content:{sha:'new'}}:{encoding:'base64',sha:'latest',content:encodeData([item])}),{status:200});});
 store.token='test-only-token';const next={...item,price:200000};const result=await store.save([item],[next]);
 assert.equal(calls.length,2);assert.equal(calls[1].url,DATABASE_URL);const body=JSON.parse(calls[1].options.body);assert.equal(body.sha,'latest');assert.deepEqual(decodeData(body.content),[next]);assert.equal(calls[1].options.headers.Authorization,'Bearer test-only-token');assert.equal(calls[1].options.body.includes('test-only-token'),false);assert.equal(result.sha,'new');
});
test('failed or conflicting write never reports success or retries blindly',async()=>{
 let writes=0;const store=new GitHubStore(async(url,options)=>{if(options.method==='PUT'){writes++;return new Response('{}',{status:409});}return new Response(JSON.stringify({sha:'s',encoding:'base64',content:encodeData([item])}));});store.token='test';
 await assert.rejects(store.save([item],[{...item,price:4}]),/もう一度保存/);assert.equal(writes,1);
});
test('images are optional for old backups and unsafe schemes are rejected',()=>{
 const {image,...old}=item;assert.equal(validate(old),old);assert.throws(()=>validate({...item,image:'javascript:alert(1)'}));
 assert.equal(extractProduct({image:{url:'https://example.com/image.jpg'}}).image,'https://example.com/image.jpg');
 assert.equal(extractProduct({image:{url:'data:text/html,test'}}).image,'');
 assert.equal(extractProduct({structured:JSON.stringify({'@type':'Product',image:['https://example.com/product.jpg']})}).image,'https://example.com/product.jpg');
});

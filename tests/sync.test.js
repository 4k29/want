import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubStore,buildRequest,applyRequest,hasChanges,issueLink,refreshState} from '../sync.js';
import {extractProduct,validate} from '../model.js';
const item={id:'a',kind:'product',name:'カメラ 📷',category:'カメラ',url:'https://example.com/camera',image:'https://example.com/camera.jpg',note:'色：黒',price:100000,fee:0,feeType:'yen',months:24,payment:'installment',priority:2,status:'planned',start:'2026-09',cycle:'monthly',created:1};
const change=(base,next,remote=base)=>applyRequest(buildRequest(base,next,'test'),remote);
test('same-origin data read uses no authentication and returns save receipts',async()=>{
 const store=new GitHubStore(async(url,options)=>{assert.ok(url.startsWith('./data/wishlist.json?'));assert.equal(options.headers,undefined);assert.equal(options.method,undefined);return new Response(JSON.stringify({version:1,items:[item],appliedRequests:['saved']}));});
 assert.deepEqual(await store.read(),{items:[item],appliedRequests:['saved']});
});
test('failed reads reject instead of silently using an empty database',async()=>{
 await assert.rejects(new GitHubStore(async()=>new Response('',{status:404})).read(),/404/);
 await assert.rejects(new GitHubStore(async()=>{throw new TypeError('network');}).read(),/通信/);
});
test('save link roundtrips Japanese and emoji and contains changed items only',()=>{
 const b={...item,id:'b',name:'UNCHANGED'};const request=buildRequest([item,b],[{...item,price:2},b],'test');
 assert.equal(request.changes.length,1);const link=issueLink(request);assert.equal(link.manual,false);
 const body=new URL(link.url).searchParams.get('body');assert.equal(body.includes('UNCHANGED'),false);
 const parsed=JSON.parse(body.match(/```json\n([\s\S]*?)\n```/)[1]);assert.deepEqual(applyRequest(parsed,[item,b]),[{...item,price:2},b]);
});
test('long requests provide a copy-paste fallback without truncating data',()=>{
 const many=Array.from({length:15},(_,n)=>({...item,id:String(n),note:'長いメモ'.repeat(100)}));const request=buildRequest([],many,'test'),link=issueLink(request);
 assert.equal(link.manual,true);assert.equal(new URL(link.url).searchParams.has('body'),false);assert.ok(link.body.includes(many[14].note));
});
test('independent device edits merge without losing changes',()=>{
 const b={...item,id:'b',name:'B'};
 assert.deepEqual(change([item,b],[{...item,price:200000},b],[item,{...b,priority:1}]),[{...item,price:200000},{...b,priority:1}]);
});
test('conflicting edits and delete-edit conflicts reject; duplicate applications are safe',()=>{
 assert.throws(()=>change([item],[{...item,price:2}],[{...item,price:3}]),/別の端末/);
 assert.throws(()=>change([item],[],[{...item,price:3}]),/別の端末/);
 assert.deepEqual(change([item],[{...item,price:2}],[{...item,price:2}]),[{...item,price:2}]);
});
test('remote deletions are not revived by unrelated additions',()=>{const added={...item,id:'b'};assert.deepEqual(change([item],[item,added],[]),[added]);});
test('reordering preserves remote additions and rejects incompatible ordering',()=>{
 const b={...item,id:'b'},c={...item,id:'c'},d={...item,id:'d'};
 assert.deepEqual(change([item,b],[b,item],[item,b,c]),[b,item,c]);
 assert.throws(()=>change([item,b,c,d],[b,item,c,d],[item,c,b,d]),/並び順/);
 assert.equal(hasChanges([item,b],[b,item]),true);assert.equal(hasChanges([item],[item]),false);
});
test('malformed and unsafe requests cannot change data',()=>{
 const request=buildRequest([],[item],'test');request.changes[0].after={...item,image:'javascript:alert(1)'};assert.throws(()=>applyRequest(request,[]));
 const missing=buildRequest([],[item],'test');missing.changes=[];assert.throws(()=>applyRequest(missing,[]),/不足/);
 const dup=buildRequest([],[item],'test');dup.changes.push(dup.changes[0]);assert.throws(()=>applyRequest(dup,[]),/形式/);
});
test('images are optional for old backups and unsafe schemes are rejected',()=>{
 const {image,...old}=item;assert.equal(validate(old),old);assert.throws(()=>validate({...item,image:'javascript:alert(1)'}));
 assert.equal(extractProduct({image:{url:'https://example.com/image.jpg'}}).image,'https://example.com/image.jpg');
 assert.equal(extractProduct({image:{url:'data:text/html,test'}}).image,'');
});

test('refresh loads remote additions and edits while preserving unsaved local changes',()=>{
 const b={...item,id:'b'};
 const result=refreshState({base:[item],items:[{...item,price:2}],pending:null,ready:true},{items:[item,b],appliedRequests:[]});
 assert.deepEqual(result.items,[{...item,price:2},b]);assert.deepEqual(result.base,[item,b]);
});
test('refresh only clears a pending save after its receipt arrives',()=>{
 const pending=buildRequest([],[item],'pending');const state={base:[],items:[item],pending,ready:true};
 const waiting=refreshState(state,{items:[],appliedRequests:[]});assert.deepEqual(waiting.items,[item]);assert.equal(waiting.pending,pending);assert.equal(waiting.saved,false);
 const saved=refreshState(state,{items:[item],appliedRequests:['pending']});assert.equal(saved.pending,null);assert.equal(saved.saved,true);assert.deepEqual(saved.items,[item]);
});
test('refresh shows a remote deletion when there are no local edits',()=>{
 const result=refreshState({base:[item],items:[item],pending:null,ready:true},{items:[],appliedRequests:[]});assert.deepEqual(result.items,[]);
});

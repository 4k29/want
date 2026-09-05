import {readFile} from 'node:fs/promises';
import {readBackup} from '../model.js';

const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const repository=process.env.GITHUB_REPOSITORY;
const owner=repository.split('/')[0];
if(event.issue?.user?.login!==owner||process.env.GITHUB_ACTOR!==owner)throw new Error('Only the repository owner may save.');

const issue=event.issue.number;
const api='https://api.github.com/repos/'+repository;
const headers={Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'};

async function request(path,method='GET',data){
  const response=await fetch(api+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})});
  if(!response.ok){const error=new Error('GitHub API '+response.status);error.status=response.status;throw error;}
  return response.status===204?null:response.json();
}

function parsePayload(){
  const body=event.issue.body||'';
  if(body.length>60000)throw new Error('保存データが大きすぎます。');
  const match=body.match(/```json\s*\n([\s\S]*?)\n```/);
  if(!match)throw new Error('保存データが見つかりません。サイトから保存し直してください。');
  const payload=JSON.parse(match[1]);
  if(payload?.version!==2||typeof payload.requestId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(payload.requestId)||!Number.isInteger(payload.baseRevision)||payload.baseRevision<0||!Array.isArray(payload.items))throw new Error('保存データの形式が正しくありません。');
  const items=readBackup(JSON.stringify({version:1,items:payload.items}));
  return {...payload,items};
}

async function comment(body){await request('/issues/'+issue+'/comments','POST',{body});}
async function close(){await request('/issues/'+issue,'PATCH',{state:'closed',state_reason:'completed'});}

try{
  const payload=parsePayload();
  let savedRevision=null;
  let alreadyApplied=false;

  for(let attempt=0;attempt<4;attempt++){
    const current=await request('/contents/data/wishlist.json?ref=main');
    const db=JSON.parse(Buffer.from(current.content,'base64').toString('utf8'));
    if(db?.version!==2||!Number.isInteger(db.revision)||!Array.isArray(db.items))throw new Error('GitHub上の共通データが壊れています。');
    if(Array.isArray(db.recentRequestIds)&&db.recentRequestIds.includes(payload.requestId)){
      savedRevision=db.revision;alreadyApplied=true;break;
    }
    if(db.revision!==payload.baseRevision){
      throw new Error('別の端末で先に更新されています。サイトに戻って最新データを取得し、内容を確認してから保存し直してください。');
    }
    const next={
      version:2,
      revision:db.revision+1,
      updatedAt:new Date().toISOString(),
      lastRequestId:payload.requestId,
      recentRequestIds:[...(Array.isArray(db.recentRequestIds)?db.recentRequestIds:[]),payload.requestId].slice(-100),
      items:payload.items
    };
    const content=Buffer.from(JSON.stringify(next,null,2)+'\n').toString('base64');
    try{
      await request('/contents/data/wishlist.json','PUT',{message:'Save wishlist snapshot #'+issue,content,sha:current.sha,branch:'main'});
      savedRevision=next.revision;break;
    }catch(error){
      if(error.status!==409||attempt===3)throw error;
    }
  }

  if(savedRevision===null)throw new Error('保存を完了できませんでした。');
  await comment(alreadyApplied
    ?`この保存はすでに反映済みです（revision ${savedRevision}）。サイトへ戻ると自動で同期します。`
    :`保存しました（revision ${savedRevision}）。サイトへ戻ると自動で同期します。`);
  await close();
}catch(error){
  await comment('保存できませんでした。\n\n'+String(error.message).slice(0,1000));
  throw error;
}

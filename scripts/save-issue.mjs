import {readFile} from 'node:fs/promises';
import {applyRequest} from '../sync.js';
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const repository=process.env.GITHUB_REPOSITORY,owner=repository.split('/')[0];
if(event.issue?.user?.login!==owner||process.env.GITHUB_ACTOR!==owner)throw Error('Only the repository owner may save.');
const issue=event.issue.number,api='https://api.github.com/repos/'+repository;
async function request(path,method='GET',data){
 const response=await fetch(api+path,{method,headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 if(!response.ok){const error=Error('GitHub API '+response.status);error.status=response.status;throw error;}return response.status===204?null:response.json();
}
try{
 const body=event.issue.body||'';
 if(body.length>60000)throw Error('保存リクエストが大きすぎます。');
 const match=body.match(/```json\s*\n([\s\S]*?)\n```/);
 if(!match)throw Error('保存データが見つかりません。サイトからもう一度「GitHubに保存」を押してください。');
 const payload=JSON.parse(match[1]);
 for(let attempt=0;attempt<4;attempt++){
  const current=await request('/contents/data/wishlist.json?ref=main');
  const db=JSON.parse(Buffer.from(current.content,'base64').toString('utf8'));
  if(db.appliedRequests?.includes(payload.id))break;
  const items=applyRequest(payload,db.items);
  const next={version:1,items,appliedRequests:[...(db.appliedRequests||[]),payload.id].slice(-200)};
  const content=Buffer.from(JSON.stringify(next,null,2)+'\n').toString('base64');
  if(content.length>1200000)throw Error('保存データが大きすぎます。');
  try{await request('/contents/data/wishlist.json','PUT',{message:'Save wishlist from issue #'+issue,content,sha:current.sha,branch:'main'});break;}
  catch(error){if(error.status!==409||attempt===3)throw error;}
 }
 await request('/issues/'+issue+'/comments','POST',{body:'GitHubへの保存が完了しました。サイトへの反映が終わるまで少し待ってから、[Wishlist](https://4k29.github.io/want/)で「最新を取得」を押してください。'});
 await request('/issues/'+issue,'PATCH',{state:'closed',state_reason:'completed'});
}catch(error){
 await request('/issues/'+issue+'/comments','POST',{body:'保存処理を完了できませんでした。\n\n'+String(error.message).slice(0,1000)+'\n\nサイトの下書きはそのまま残ります。内容を確認して保存し直してください。'});
 throw error;
}

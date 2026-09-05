const refreshButton=document.querySelector('#refresh-data');
const githubDialog=document.querySelector('#github-dialog');
const editor=document.querySelector('#editor');
const saveStatus=document.querySelector('#save-status');
const githubLink=document.querySelector('#github-link');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let polling=false;
let stopPolling=false;

function isPending(){
  const text=saveStatus?.textContent||'';
  return text.includes('反映待ち')||text.includes('未同期')||text.includes('GitHubで確定');
}

async function refreshAndWait(){
  if(!refreshButton||refreshButton.disabled||editor?.open)return isPending();
  refreshButton.click();
  const deadline=Date.now()+25000;
  while(refreshButton.disabled&&Date.now()<deadline)await sleep(250);
  const pending=isPending();
  if(!pending&&githubDialog?.open)githubDialog.close();
  return pending;
}

async function pollUntilSynced(){
  if(polling)return;
  polling=true;
  stopPolling=false;
  const deadline=Date.now()+120000;
  while(!stopPolling&&Date.now()<deadline){
    if(document.visibilityState==='visible'){
      const pending=await refreshAndWait();
      if(!pending)break;
    }
    await sleep(5000);
  }
  polling=false;
}

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')pollUntilSynced();
});

window.addEventListener('focus',()=>pollUntilSynced());

githubLink?.addEventListener('click',()=>{
  stopPolling=true;
  setTimeout(()=>{polling=false;pollUntilSynced();},1000);
});

githubDialog?.addEventListener('close',()=>{stopPolling=true;});

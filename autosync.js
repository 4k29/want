const refreshButton=document.querySelector('#refresh-data');
const githubDialog=document.querySelector('#github-dialog');
const editor=document.querySelector('#editor');
const saveStatus=document.querySelector('#save-status');

let polling=false;

async function refreshQuietly(){
  if(!refreshButton||refreshButton.disabled||editor?.open)return;
  refreshButton.click();
  await new Promise(resolve=>setTimeout(resolve,1200));
  if(githubDialog?.open&&saveStatus&&!saveStatus.textContent.includes('保存の確定・反映待ち')&&!saveStatus.textContent.includes('GitHubで確定・反映待ち')){
    githubDialog.close();
  }
}

function startPolling(){
  if(polling)return;
  polling=true;
  const tick=async()=>{
    if(document.visibilityState==='visible')await refreshQuietly();
    if(saveStatus&&saveStatus.textContent.includes('保存')&&!saveStatus.textContent.includes('取得完了')){
      setTimeout(tick,5000);
    }else{
      polling=false;
    }
  };
  tick();
}

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){
    refreshQuietly();
    if(githubDialog?.open)startPolling();
  }
});

window.addEventListener('focus',()=>{
  refreshQuietly();
  if(githubDialog?.open)startPolling();
});

githubDialog?.addEventListener('close',()=>{polling=false;});
document.querySelector('#github-link')?.addEventListener('click',()=>setTimeout(startPolling,1500));

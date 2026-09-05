const CATEGORY_DEFAULTS=['ガジェット','カメラ','暮らし','ファッション','サービス'];
const CATEGORY_CUSTOM='__custom__';

const categoryInput=document.querySelector('input[name="category"]');
const editorDialog=document.querySelector('#editor');
const categoryFilter=document.querySelector('#category-filter');

if(categoryInput&&editorDialog){
  const label=categoryInput.closest('label');
  categoryInput.hidden=true;
  categoryInput.removeAttribute('list');
  categoryInput.removeAttribute('required');
  categoryInput.tabIndex=-1;
  categoryInput.setAttribute('aria-hidden','true');

  const picker=document.createElement('div');
  picker.className='category-picker';

  const select=document.createElement('select');
  select.className='category-select';
  select.required=true;
  select.setAttribute('aria-label','カテゴリー');

  const custom=document.createElement('input');
  custom.type='text';
  custom.maxLength=40;
  custom.placeholder='カテゴリー名を入力';
  custom.autocomplete='off';
  custom.hidden=true;
  custom.setAttribute('aria-label','その他のカテゴリー名');

  picker.append(select,custom);
  label.append(picker);

  let lastSeen='';

  function availableCategories(current=''){
    const used=[...(categoryFilter?.options||[])]
      .map(option=>option.value)
      .filter(value=>value&&value!=='all'&&value!=='その他');
    const extras=[...new Set([...used,current].filter(Boolean).filter(value=>!CATEGORY_DEFAULTS.includes(value)&&value!=='その他'))]
      .sort((a,b)=>a.localeCompare(b,'ja'));
    return [...CATEGORY_DEFAULTS,...extras];
  }

  function setHidden(value){
    categoryInput.value=value;
    lastSeen=value;
  }

  function rebuild(){
    const current=categoryInput.value.trim();
    const categories=availableCategories(current);
    select.innerHTML='<option value="">選択してください</option>'+
      categories.map(value=>`<option value="${value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}">${value.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</option>`).join('')+
      '<option value="'+CATEGORY_CUSTOM+'">その他…</option>';

    if(current&&categories.includes(current)){
      select.value=current;
      custom.hidden=true;
      custom.required=false;
      custom.value='';
    }else if(current){
      select.value=CATEGORY_CUSTOM;
      custom.hidden=false;
      custom.required=true;
      custom.value=current;
    }else{
      select.value='';
      custom.hidden=true;
      custom.required=false;
      custom.value='';
    }
    lastSeen=current;
  }

  select.addEventListener('change',()=>{
    if(select.value===CATEGORY_CUSTOM){
      custom.hidden=false;
      custom.required=true;
      setHidden(custom.value.trim());
      custom.focus();
    }else{
      custom.hidden=true;
      custom.required=false;
      custom.value='';
      setHidden(select.value);
    }
  });

  custom.addEventListener('input',()=>setHidden(custom.value));

  document.querySelector('#item-form')?.addEventListener('submit',()=>{
    if(select.value===CATEGORY_CUSTOM)setHidden(custom.value);
    else setHidden(select.value);
  },true);

  new MutationObserver(()=>{
    if(editorDialog.open)queueMicrotask(rebuild);
  }).observe(editorDialog,{attributes:true,attributeFilter:['open']});

  setInterval(()=>{
    if(!editorDialog.open)return;
    const current=categoryInput.value;
    if(current!==lastSeen)rebuild();
  },250);

  rebuild();
}

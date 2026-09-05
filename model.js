export const KEY = 'wishlist-budget-v1';
export const yen = value => new Intl.NumberFormat('ja-JP', {style:'currency',currency:'JPY',maximumFractionDigits:0}).format(value);
export const currentMonth = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
export const monthIndex = month => { const [y,m] = month.split('-').map(Number); return y*12+m-1; };
export function cost(item) {
  if(item.kind==='subscription') return {total:item.price,monthly:item.price/(item.cycle==='yearly'?12:1),fee:0};
  const fee=item.payment==='installment'?(item.feeType==='percent'?Math.round(item.price*item.fee/100):Math.round(item.fee)):0;
  const total=item.price+fee;
  return {total,fee,monthly:item.payment==='installment'?total/item.months:0};
}
export function activePayment(item, month=currentMonth()) {
  if(item.kind!=='product'||item.status!=='active'||item.payment!=='installment'||!item.start) return false;
  const offset=monthIndex(month)-monthIndex(item.start);
  return offset>=0&&offset<item.months;
}
export function totals(items,month=currentMonth()) {
  let total=0,subscriptions=0,active=0,planned=0,once=0,count=0;
  for(const item of items) {
    const c=cost(item);
    if(item.kind==='subscription'){if(item.status==='active')subscriptions+=c.monthly;continue;}
    if(item.status==='planned'){total+=c.total;count++;if(item.payment==='installment')planned+=c.monthly;else once+=c.total;}
    if(activePayment(item,month))active+=c.monthly;
  }
  return {total,subscriptions,active,planned,once,count,fixed:subscriptions+active,after:subscriptions+active+planned};
}
export function guessCategory(text) {
  if(/camera|nikon|canon|sony.*(?:α|alpha)|sigma|レンズ|カメラ|cfexpress/i.test(text))return 'カメラ';
  if(/apple|iphone|ipad|macbook|mac mini|nothing|pixel|galaxy|pc|ガジェット|airpods/i.test(text))return 'ガジェット';
  if(/spotify|netflix|youtube|icloud|chatgpt|サブスク/i.test(text))return 'サービス';
  if(/服|シャツ|靴|スニーカー|nike|adidas|uniqlo/i.test(text))return 'ファッション';
  return 'その他';
}
export function safeUrl(raw) {
  if(!raw)return '';
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('http / https の商品リンクを入力してください。');
  return url.href;
}
export function validate(item) {
  if(!item||typeof item!=='object')throw new Error('データ形式が正しくありません。');
  for(const key of ['id','name','category','url','note','start'])if(typeof item[key]!=='string')throw new Error('データ形式が正しくありません。');
  if(!item.name.trim()||item.name.length>150||!item.category.trim()||item.category.length>40||item.note.length>1000||item.url.length>4000)throw new Error('名前・カテゴリー・リンク・メモを確認してください。');
  if(!['product','subscription'].includes(item.kind)||!['planned','active','done'].includes(item.status)||!['once','installment'].includes(item.payment)||!['yen','percent'].includes(item.feeType)||!['monthly','yearly'].includes(item.cycle))throw new Error('項目の設定が正しくありません。');
  if(!Number.isInteger(item.price)||item.price<0||item.price>999999999||!Number.isFinite(item.fee)||item.fee<0||item.fee>999999999||!Number.isInteger(item.months)||item.months<2||item.months>600||![1,2,3].includes(item.priority)||!Number.isFinite(item.created))throw new Error('価格・手数料・回数を確認してください。');
  if(item.feeType==='percent'&&item.fee>1000)throw new Error('手数料の総率は1,000%以下で入力してください。');
  safeUrl(item.url);
  if(item.image!==undefined){if(typeof item.image!=='string'||item.image.length>4000)throw new Error('画像URLを確認してください。');safeUrl(item.image);}
  if(item.start&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(item.start))throw new Error('支払い開始月を確認してください。');
  if(item.kind==='product'&&item.payment==='installment'&&item.status==='active'&&!item.start)throw new Error('支払い中の分割には初回支払い月が必要です。');
  return item;
}
export function readBackup(raw) {
  const data=JSON.parse(raw);
  if(data.version!==1||!Array.isArray(data.items)||data.items.length>10000)throw new Error('Wishlistのバックアップファイルを選んでください。');
  data.items.forEach(validate);
  if(new Set(data.items.map(i=>i.id)).size!==data.items.length)throw new Error('重複するアイテムIDがあります。');
  return data.items;
}
export function extractProduct(data) {
  let name=data.title||'',price=null;
  const nodes=[];
  function visit(obj){if(!obj||typeof obj!=='object')return;if(Array.isArray(obj)){obj.forEach(visit);return;}if([obj['@type']].flat().some(t=>t==='Product'))nodes.push(obj);if(obj['@graph'])visit(obj['@graph']);}
  for(const raw of [data.structured||[]].flat()){try{visit(typeof raw==='string'?JSON.parse(raw):raw);}catch{}}
  const product=nodes[0];
  if(product){name=product.name||name;const offers=[product.offers||[]].flat();const offer=offers.find(o=>o.priceCurrency==='JPY'&&o.price!==undefined);if(offer)price=Number(String(offer.price).replace(/,/g,''));}
  if(price===null&&String(data.currency||'').trim().toUpperCase()==='JPY'&&data.price!==null&&data.price!==undefined&&data.price!=='')price=Number(String(data.price).replace(/[,¥￥\s]/g,''));
  if(!Number.isFinite(price)||price<0||price>999999999)price=null;
  if(price!==null)price=Math.round(price);
  const candidate=[product?.image||[]].flat()[0]||data.image?.url||data.image||'';
  let image='';try{image=safeUrl(typeof candidate==='string'?candidate:candidate.url||candidate.contentUrl||'');}catch{}
  return {name:String(name).slice(0,150),price,image};
}

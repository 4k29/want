import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../category-ui.js',import.meta.url),'utf8');

test('category picker has no built-in category names',()=>{
  for(const name of ['ガジェット','カメラ','暮らし','ファッション','サービス','通信','サブスク']){
    assert.doesNotMatch(source,new RegExp(name));
  }
  assert.match(source,/categoryFilter/);
  assert.match(source,/availableCategories/);
});

test('category picker supports custom category entry',()=>{
  assert.match(source,/その他…/);
  assert.match(source,/custom\.hidden=false/);
  assert.match(source,/custom\.required=true/);
});

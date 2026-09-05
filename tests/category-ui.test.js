import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../category-ui.js',import.meta.url),'utf8');

test('category picker uses shared defaults without subscription-only categories',()=>{
  assert.match(source,/ガジェット/);
  assert.match(source,/カメラ/);
  assert.match(source,/暮らし/);
  assert.match(source,/ファッション/);
  assert.match(source,/サービス/);
  assert.doesNotMatch(source,/通信/);
  assert.doesNotMatch(source,/\['サブスク'/);
});

test('category picker supports custom category entry',()=>{
  assert.match(source,/その他…/);
  assert.match(source,/custom\.hidden=false/);
  assert.match(source,/custom\.required=true/);
});

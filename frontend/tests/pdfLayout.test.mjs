import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfLayout, pageAtOffset, storedOffset } from '../src/utils/pdfLayout.ts';

test('连续页布局支持不同纸张比例，页间空隙仍属于前一页', () => {
  const boxes = pdfLayout([{ width: 600, height: 800 }, { width: 800, height: 600 }, { width: 600, height: 900 }], 300);
  assert.deepEqual(boxes, [{ top: 0, height: 400 }, { top: 416, height: 225 }, { top: 657, height: 450 }]);
  for (const [offset, page] of [[-20, 1], [410, 1], [416, 2], [640, 2], [657, 3], [2000, 3]]) assert.equal(pageAtOffset(boxes, offset), page);
});
test('缩放后按页内比例恢复位置，长论文可定位末页', () => {
  const sizes = Array.from({ length: 300 }, () => ({ width: 600, height: 800 }));
  const normal = pdfLayout(sizes, 300), zoomed = pdfLayout(sizes, 450);
  const offset = .35;
  assert.equal((zoomed[199].top + zoomed[199].height * offset - zoomed[199].top) / zoomed[199].height, offset);
  assert.equal(pageAtOffset(normal, normal[299].top), 300);
});
test('只恢复匹配页码的有效页内位置，损坏缓存不会阻止打开', () => {
  assert.equal(storedOffset('{"page":3,"offset":0.4}', 3), .4);
  assert.equal(storedOffset('{"page":3,"offset":-0.1}', 3), -.1);
  for (const raw of [null, 'bad', '{"page":2,"offset":0.4}', '{"page":3,"offset":9}', '{"page":3,"offset":"0.4"}']) assert.equal(storedOffset(raw, 3), 0);
});

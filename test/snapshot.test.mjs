import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productKey, snapshotRows } from '../dist/runs.js';

const run = (status, offers) => ({ schemaVersion:1, run:{id:'run-1',source:'mock',searchPostalCode:'T3A 1B1',startedAt:'2026-11-01T12:00:00Z',finishedAt:'2026-11-01T12:00:09Z',status,isSample:true}, offers, rejections:[] });
const offer = (id, retailer, name, cents, at = '2026-11-01T12:00:02Z') => ({ sourceOfferId:id, retailer:{sourceRetailerId:retailer.toLowerCase(),displayName:retailer}, productName:name, price:{amountCents:cents,currency:'CAD',text:`$${(cents/100).toFixed(2)}`,purchaseQuantity:1,purchaseUnit:'item'}, validFrom:null, validUntil:null, observedAt:at, isSample:true });

test('product key ignores case, accents, apostrophes and punctuation but keeps sizes', () => {
  assert.equal(productKey('Save-On-Foods', "Ben's Original Bistro Express Rice"), productKey('SAVE ON FOODS', 'BENS ORIGINAL  BISTRO EXPRESS RICE'));
  assert.equal(productKey('Costco', 'Gia Basmati Rice, 18.14 kg'), 'COSTCO|GIA BASMATI RICE 18.14 KG');
  assert.equal(productKey('Métro', 'Crème fraîche'), 'METRO|CREME FRAICHE');
  assert.notEqual(productKey('Costco', 'Rice 8 kg'), productKey('Costco', 'Rice 18 kg'));
  assert.equal(productKey('Costco', '!!!'), null);
});

test('snapshot keeps the original display names and the source offer id', () => {
  const [row] = snapshotRows(run('completed', [offer('1051760691', 'Costco', 'Gia Indian Basmati Rice, 18.14 KG', 3499)]));
  assert.equal(row.id, 'COSTCO|GIA INDIAN BASMATI RICE 18.14 KG');
  assert.equal(row.productName, 'Gia Indian Basmati Rice, 18.14 KG');
  assert.equal(row.retailer, 'Costco');
  assert.equal(row.sourceOfferId, '1051760691');
  assert.equal(row.priceCents, 3499);
  assert.equal(row.price, 34.99);
});

test('same key at the same price collapses to the latest observation', () => {
  const rows = snapshotRows(run('completed', [offer('a', 'Walmart', 'Tilda Basmati Rice', 1298, '2026-11-01T12:00:02Z'), offer('b', 'WALMART', 'TILDA BASMATI RICE', 1298, '2026-11-01T12:00:05Z')]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceOfferId, 'b');
});

test('same key at different prices is ambiguous and stays out of the snapshot', () => {
  const rows = snapshotRows(run('completed', [offer('s', 'M&M Food Market', 'Boneless Skinless Chicken Breasts', 1799), offer('l', 'M&M Food Market', 'Boneless Skinless Chicken Breasts', 3499), offer('m', 'M&M Food Market', 'Milk', 499)]));
  assert.deepEqual(rows.map(r => r.sourceOfferId), ['m']);
});

test('failed runs do not update the snapshot', () => {
  assert.deepEqual(snapshotRows(run('failed', [offer('m', 'Store', 'Milk', 499)])), []);
  assert.equal(snapshotRows(run('partial', [offer('m', 'Store', 'Milk', 499)])).length, 1);
});

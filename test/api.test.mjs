import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPage, validateOffers } from '../dist/validation.js';

const offer = { id: 'sample-milk', productName: 'Milk', retailer: 'Example Store', location: 'T2P 1J9', price: 4.99, currency: 'CAD', validUntil: '2099-12-31', collectedAt: '2026-11-01T00:00:00.000Z', provider: 'mock' };
test('accepts synthetic offers and rejects other providers', () => {
  assert.equal(validateOffers({ offers: [offer] }), true);
  assert.equal(validateOffers({ offers: [{ ...offer, provider: 'flipp' }] }), false);
  assert.equal(validateOffers({ offers: [{ ...offer, price: -1 }] }), false);
});

test('reads paging parameters and refuses invalid ones', () => {
  const page = query => readPage(new URL(`https://x.test/v1/offers${query}`));
  assert.deepEqual(page(''), { limit: 100, offset: 0 });
  assert.deepEqual(page('?limit=25&offset=50'), { limit: 25, offset: 50 });
  for (const bad of ['?limit=0', '?limit=101', '?limit=abc', '?offset=-1', '?offset=1.5', '?limit=']) assert.equal(page(bad), null);
});

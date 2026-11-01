import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOffers } from '../dist/validation.js';

const offer = { id: 'sample-milk', productName: 'Milk', retailer: 'Example Store', location: 'T2P 1J9', price: 4.99, currency: 'CAD', validUntil: '2099-12-31', collectedAt: '2026-11-01T00:00:00.000Z', provider: 'mock' };
test('accepts synthetic offers and rejects other providers', () => {
  assert.equal(validateOffers({ offers: [offer] }), true);
  assert.equal(validateOffers({ offers: [{ ...offer, provider: 'flipp' }] }), false);
  assert.equal(validateOffers({ offers: [{ ...offer, price: -1 }] }), false);
});

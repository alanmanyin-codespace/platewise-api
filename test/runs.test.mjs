import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storageLocation, validateRun } from '../dist/runs.js';

const sample = { schemaVersion:1, run:{id:'run-1',source:'mock',searchPostalCode:'T2P1J9',startedAt:'2026-11-01T12:00:00Z',finishedAt:'2026-11-01T12:00:04Z',status:'completed',isSample:true}, offers:[{sourceOfferId:'milk',retailer:{sourceRetailerId:'store',displayName:'Example Store'},productName:'Milk',price:{amountCents:499,currency:'CAD',text:'$4.99 each',purchaseQuantity:1,purchaseUnit:'item'},validFrom:'2026-11-01',validUntil:'2026-11-07',observedAt:'2026-11-01T12:00:02Z',isSample:true}], rejections:[] };
test('accepts a versioned synthetic run and rejects unsafe or malformed records', () => {
  assert.equal(validateRun(sample), true);
  assert.equal(validateRun({...sample, schemaVersion:2}), false);
  assert.equal(validateRun({...sample, run:{...sample.run,source:'flipp'}}), false);
  assert.equal(validateRun({...sample, offers:[{...sample.offers[0],price:{...sample.offers[0].price,amountCents:-1}}]}), false);
  assert.equal(validateRun({...sample, offers:[sample.offers[0],sample.offers[0]]}), false);
});

test('accepts an optional market and the postal codes that saw each offer', () => {
  const market = {...sample, run:{...sample.run,market:'calgary'}, offers:[{...sample.offers[0],seenIn:['T2P 1J9','T3A1B1']}]};
  assert.equal(validateRun(market), true);
  assert.equal(storageLocation(market.run), 'calgary');
  assert.equal(storageLocation(sample.run), 'T2P1J9');
  assert.equal(validateRun({...market, run:{...market.run,market:'Calgary City'}}), false);
  assert.equal(validateRun({...market, offers:[{...market.offers[0],seenIn:[]}]}), false);
  assert.equal(validateRun({...market, offers:[{...market.offers[0],seenIn:['nope']}]}), false);
});

test('accepts Flipp runs only when licensed imports are enabled and they are not samples', () => {
  const flipp = {...sample, run:{...sample.run,source:'flipp',isSample:false}, offers:[{...sample.offers[0],isSample:false}]};
  assert.equal(validateRun(flipp), false);
  assert.equal(validateRun(flipp, true), true);
  assert.equal(validateRun({...flipp, run:{...flipp.run,isSample:true}}, true), false);
  assert.equal(validateRun({...flipp, offers:[sample.offers[0]]}, true), false);
  assert.equal(validateRun({...flipp, run:{...flipp.run,source:'other'}}, true), false);
  assert.equal(validateRun({...sample, run:{...sample.run,isSample:false}}, true), false);
});

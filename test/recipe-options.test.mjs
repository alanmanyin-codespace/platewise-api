import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuisineOptions, ingredientOptions, proteinOptions, storeOptions } from '../dist/recipe-options.js';

export function fakeDb(rows) {
  const calls = [];
  return { calls, prepare(sql) { const call = { sql, args: [] }; calls.push(call); const stmt = { bind(...args) { call.args = args; return stmt; }, async all() { return { results: rows }; } }; return stmt; } };
}

test('maps ingredient rows', async () => {
  const db = fakeDb([{ key: 'egg', name: 'Eggs', recipeCount: 120 }, { key: 'basil', name: 'Basil', recipeCount: 30 }]);
  assert.deepEqual(await ingredientOptions(db), [{ key: 'basil', name: 'Basil', recipeCount: 30 }, { key: 'egg', name: 'Eggs', recipeCount: 120 }]);
});

test('maps cuisines and drops empty areas', async () => {
  const db = fakeDb([{ name: 'Italian', recipeCount: 60 }, { name: null, recipeCount: 3 }, { name: 'Canadian', recipeCount: 14 }]);
  assert.deepEqual(await cuisineOptions(db), [{ name: 'Canadian', recipeCount: 14 }, { name: 'Italian', recipeCount: 60 }]);
});

test('builds proteins from recipe categories, plant-based last', async () => {
  const db = fakeDb([{ category: 'Beef', recipeCount: 95 }, { category: 'Dessert', recipeCount: 168 }, { category: 'Vegetarian', recipeCount: 100 }, { category: 'Vegan', recipeCount: 7 }]);
  assert.deepEqual(await proteinOptions(db), [
    { name: 'Beef', categories: ['Beef'], recipeCount: 95 },
    { name: 'Plant-based', categories: ['Vegetarian', 'Vegan'], recipeCount: 107 }
  ]);
});

test('lists grocery stores with current offers in a market', async () => {
  const db = fakeDb([{ name: 'Walmart', offerCount: 144 }, { name: 'Chalo FreshCo ', offerCount: 82 }, { name: 'Save-On-Foods', offerCount: 146 }]);
  assert.deepEqual(await storeOptions(db, 'calgary'), [{ name: 'Save-On-Foods', offerCount: 146 }, { name: 'Walmart', offerCount: 144 }, { name: 'Chalo FreshCo', offerCount: 82 }]);
  const { sql, args } = db.calls[0];
  assert.deepEqual(args, ['calgary']);
  assert.match(sql, /JOIN retailers/i);
  assert.match(sql, /is_grocery = 1/);
  assert.match(sql, /trim\(o\.retailer\) = r\.name/i);
  assert.match(sql, /valid_until IS NULL OR o\.valid_until >= date\('now'\)/i);
});

import worker from '../dist/index.js';
const call = (path, method = 'GET', rows = [{ name: 'Italian', recipeCount: 60 }]) => worker.fetch(new Request(`https://x.test${path}`, { method }), { DB: fakeDb(rows) });

test('serves option lists publicly with a one-day cache', async () => {
  for (const [path, field] of [['/v1/recipes/ingredients', 'ingredients'], ['/v1/recipes/cuisines', 'cuisines'], ['/v1/recipes/proteins', 'proteins'], ['/v1/stores?market=calgary', 'stores']]) {
    const response = await call(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=86400');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.ok(Array.isArray((await response.json())[field]), path);
    const preflight = await call(path, 'OPTIONS');
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  }
});

test('stores need a valid market; other methods fall through', async () => {
  assert.equal((await call('/v1/stores')).status, 400);
  assert.equal((await call('/v1/stores?market=Calgary!')).status, 400);
  assert.equal((await call('/v1/recipes/ingredients', 'POST')).status, 404);
  assert.equal((await call('/v1/offers')).headers.get('Cache-Control'), 'no-store');
});

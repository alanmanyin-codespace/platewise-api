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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingredientKey, validateRecipes } from '../dist/recipes.js';

const recipe = { sourceId:'52885', title:'Bubble & Squeak', category:'Pork', area:'British', instructions:'Fry.', imageUrl:'https://x.test/a.jpg', youtubeUrl:null, sourceUrl:null, modifiedAt:null, ingredients:[{name:'Potatoes',measure:'2'}] };
const body = { source:'themealdb', recipes:[recipe] };

test('ingredient keys group singular, plural and case variants', () => {
  assert.equal(ingredientKey('Eggs'), ingredientKey('egg'));
  assert.equal(ingredientKey('Potatoes'), 'potato');
  assert.equal(ingredientKey('Red  Onions'), 'red onion');
  assert.equal(ingredientKey('Blueberries'), 'blueberry');
  assert.equal(ingredientKey('Asparagus'), 'asparagus');
  assert.equal(ingredientKey('Crème fraîche'), 'creme fraiche');
  assert.equal(ingredientKey('Glass'), 'glass');
});

test('accepts a recipe batch and rejects unsafe ones', () => {
  assert.equal(validateRecipes(body), true);
  assert.equal(validateRecipes({...body, source:'other'}), false);
  assert.equal(validateRecipes({...body, recipes:[]}), false);
  assert.equal(validateRecipes({...body, recipes:Array(26).fill(recipe).map((r,i)=>({...r,sourceId:String(i)}))}), false);
  assert.equal(validateRecipes({...body, recipes:[recipe,recipe]}), false);
  assert.equal(validateRecipes({...body, recipes:[{...recipe,title:''}]}), false);
  assert.equal(validateRecipes({...body, recipes:[{...recipe,ingredients:[{name:'',measure:null}]}]}), false);
});

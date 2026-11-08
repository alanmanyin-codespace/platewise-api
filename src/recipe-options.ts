// Option lists for the app's profile interview, read from the imported recipes and offers.
export type IngredientOption = { key: string; name: string; recipeCount: number };
export type CuisineOption = { name: string; recipeCount: number };
export type ProteinOption = { name: string; categories: string[]; recipeCount: number };
export type StoreOption = { name: string; offerCount: number };

const PROTEIN_CATEGORIES = ['Beef', 'Chicken', 'Goat', 'Lamb', 'Pork', 'Seafood'];
const PLANT_CATEGORIES = ['Vegetarian', 'Vegan'];
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

// The display name is the spelling most recipes use for that key.
export async function ingredientOptions(db: D1Database): Promise<IngredientOption[]> {
  const { results } = await db.prepare(`WITH names AS (
      SELECT ingredient_key AS key, name, COUNT(*) AS uses FROM recipe_ingredients GROUP BY ingredient_key, name),
    ranked AS (SELECT key, name, ROW_NUMBER() OVER (PARTITION BY key ORDER BY uses DESC, name) AS rank FROM names)
    SELECT r.key, r.name, (SELECT COUNT(DISTINCT source || ':' || source_id) FROM recipe_ingredients i WHERE i.ingredient_key = r.key) AS recipeCount
    FROM ranked r WHERE r.rank = 1`).all<IngredientOption>();
  return results.map(({ key, name, recipeCount }) => ({ key, name, recipeCount: Number(recipeCount) })).sort(byName);
}

export async function cuisineOptions(db: D1Database): Promise<CuisineOption[]> {
  const { results } = await db.prepare(`SELECT area AS name, COUNT(*) AS recipeCount FROM recipes
    WHERE area IS NOT NULL AND trim(area) <> '' GROUP BY area`).all<{ name: string | null; recipeCount: number }>();
  return results.filter((row): row is CuisineOption => typeof row.name === 'string' && row.name.trim() !== '')
    .map(({ name, recipeCount }) => ({ name, recipeCount: Number(recipeCount) })).sort(byName);
}

// Each meat or seafood category is one protein; vegetarian and vegan recipes form "Plant-based".
export async function proteinOptions(db: D1Database): Promise<ProteinOption[]> {
  const { results } = await db.prepare('SELECT category, COUNT(*) AS recipeCount FROM recipes WHERE category IS NOT NULL GROUP BY category')
    .all<{ category: string; recipeCount: number }>();
  const proteins = results.filter(row => PROTEIN_CATEGORIES.includes(row.category))
    .map(row => ({ name: row.category, categories: [row.category], recipeCount: Number(row.recipeCount) })).sort(byName);
  const plant = results.filter(row => PLANT_CATEGORIES.includes(row.category));
  if (plant.length) proteins.push({
    name: 'Plant-based',
    categories: PLANT_CATEGORIES.filter(category => plant.some(row => row.category === category)),
    recipeCount: plant.reduce((sum, row) => sum + Number(row.recipeCount), 0)
  });
  return proteins;
}

// Only retailers marked as grocery stores, and only while they have a current offer in the market.
export async function storeOptions(db: D1Database, market: string): Promise<StoreOption[]> {
  const { results } = await db.prepare(`SELECT r.name AS name, COUNT(*) AS offerCount FROM offers o
    JOIN retailers r ON trim(o.retailer) = r.name AND r.is_grocery = 1
    WHERE o.provider = 'flipp' AND o.location = ? AND (o.valid_until IS NULL OR o.valid_until >= date('now'))
    GROUP BY r.name`).bind(market).all<StoreOption>();
  return results.map(({ name, offerCount }) => ({ name: name.trim(), offerCount: Number(offerCount) }))
    .sort((a, b) => b.offerCount - a.offerCount || byName(a, b));
}

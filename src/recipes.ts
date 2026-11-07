type Ingredient = { name:string; measure:string|null };
export type Recipe = { sourceId:string; title:string; category:string|null; area:string|null; instructions:string|null; imageUrl:string|null; youtubeUrl:string|null; sourceUrl:string|null; modifiedAt:string|null; ingredients:Ingredient[] };
export type RecipeBatch = { source:'themealdb'; recipes:Recipe[] };

const obj = (v:unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v:unknown, max:number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const opt = (v:unknown, max:number) => v === null || str(v,max);

// Matching key only: lowercase, no accents or punctuation, last word singular. Display names are stored separately.
export function ingredientKey(name:string): string {
  const words = name.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ');
  const last = words[words.length-1];
  words[words.length-1] = last.endsWith('ies') ? `${last.slice(0,-3)}y` : last.endsWith('oes') ? last.slice(0,-2) : /[^su]s$/.test(last) ? last.slice(0,-1) : last;
  return words.join(' ');
}

export function validateRecipes(v:unknown): v is RecipeBatch {
  if (!obj(v) || v.source !== 'themealdb' || !Array.isArray(v.recipes) || v.recipes.length < 1 || v.recipes.length > 25) return false;
  const ids = new Set<string>();
  for (const r of v.recipes) {
    if (!obj(r) || !str(r.sourceId,50) || ids.has(r.sourceId) || !str(r.title,200) || !opt(r.category,100) || !opt(r.area,100) || !opt(r.instructions,20000) || !opt(r.imageUrl,1000) || !opt(r.youtubeUrl,1000) || !opt(r.sourceUrl,1000) || !opt(r.modifiedAt,50) || !Array.isArray(r.ingredients) || r.ingredients.length > 40) return false;
    ids.add(r.sourceId);
    if (!r.ingredients.every(i => obj(i) && str(i.name,200) && opt(i.measure,200))) return false;
  }
  return true;
}

export async function storeRecipes(db:D1Database, data:RecipeBatch, importedAt:string): Promise<void> {
  const statements:D1PreparedStatement[] = [];
  for (const r of data.recipes) {
    statements.push(db.prepare('DELETE FROM recipe_ingredients WHERE source = ? AND source_id = ?').bind(data.source,r.sourceId));
    statements.push(db.prepare('INSERT INTO recipes(source,source_id,title,category,area,instructions,image_url,youtube_url,source_url,modified_at,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source,source_id) DO UPDATE SET title=excluded.title,category=excluded.category,area=excluded.area,instructions=excluded.instructions,image_url=excluded.image_url,youtube_url=excluded.youtube_url,source_url=excluded.source_url,modified_at=excluded.modified_at,imported_at=excluded.imported_at').bind(data.source,r.sourceId,r.title,r.category,r.area,r.instructions,r.imageUrl,r.youtubeUrl,r.sourceUrl,r.modifiedAt,importedAt));
    r.ingredients.forEach((i,position) => statements.push(db.prepare('INSERT INTO recipe_ingredients(source,source_id,position,name,measure,ingredient_key) VALUES (?,?,?,?,?,?)').bind(data.source,r.sourceId,position,i.name,i.measure,ingredientKey(i.name))));
  }
  await db.batch(statements);
}

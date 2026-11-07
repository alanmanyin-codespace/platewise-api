-- Recipes from external catalogues, keyed by the source's own ID so re-imports update in place.
-- image_url points at the source's image; artwork is not copied.
CREATE TABLE recipes (
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  area TEXT,
  instructions TEXT,
  image_url TEXT,
  youtube_url TEXT,
  source_url TEXT,
  modified_at TEXT,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (source, source_id)
);

-- ingredient_key groups variants such as egg/eggs for matching; name keeps the display text.
CREATE TABLE recipe_ingredients (
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  measure TEXT,
  ingredient_key TEXT NOT NULL,
  PRIMARY KEY (source, source_id, position),
  FOREIGN KEY (source, source_id) REFERENCES recipes(source, source_id) ON DELETE CASCADE
);
CREATE INDEX recipe_ingredients_key ON recipe_ingredients(ingredient_key);

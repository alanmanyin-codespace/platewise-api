-- Runs now maintain the offers snapshot, one row per product.
-- Run-derived rows use id = product key (normalized retailer|product name);
-- product_name and retailer keep the source's original display text.
-- Legacy rows from /v1/ingest/offers keep their source ID as id.

-- Rebuild offers so valid_until can be NULL (run offers may have no end date).
CREATE TABLE offers_new (
  provider TEXT NOT NULL,
  id TEXT NOT NULL,
  location TEXT NOT NULL,
  product_name TEXT NOT NULL,
  retailer TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL,
  valid_until TEXT,
  collected_at TEXT NOT NULL,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  regular_price_cents INTEGER CHECK (regular_price_cents IS NULL OR regular_price_cents >= 0),
  price_text TEXT,
  quantity REAL CHECK (quantity IS NULL OR quantity > 0),
  unit TEXT,
  valid_from TEXT,
  source_flyer_id TEXT,
  image_url TEXT,
  product_key TEXT,
  source_offer_id TEXT,
  source_run_id TEXT,
  PRIMARY KEY (provider, id, location)
);
INSERT INTO offers_new (provider, id, location, product_name, retailer, price, currency, valid_until, collected_at, price_cents, regular_price_cents, price_text, quantity, unit, valid_from, source_flyer_id, image_url)
  SELECT provider, id, location, product_name, retailer, price, currency, valid_until, collected_at, price_cents, regular_price_cents, price_text, quantity, unit, valid_from, source_flyer_id, image_url FROM offers;
DROP TABLE offers;
ALTER TABLE offers_new RENAME TO offers;
CREATE INDEX offers_location_expiry ON offers(location, valid_until);

-- Group observations by product to read price trends across flyers.
ALTER TABLE offer_observations ADD COLUMN product_key TEXT;
CREATE INDEX offer_observations_product ON offer_observations(provider, location, product_key, observed_at);

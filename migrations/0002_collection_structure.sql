-- Existing offers remain the current snapshot for the v1 API.
-- Additional fields are nullable because a source may not provide them.
ALTER TABLE offers ADD COLUMN price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0);
ALTER TABLE offers ADD COLUMN regular_price_cents INTEGER CHECK (regular_price_cents IS NULL OR regular_price_cents >= 0);
ALTER TABLE offers ADD COLUMN price_text TEXT;
ALTER TABLE offers ADD COLUMN quantity REAL CHECK (quantity IS NULL OR quantity > 0);
ALTER TABLE offers ADD COLUMN unit TEXT;
ALTER TABLE offers ADD COLUMN valid_from TEXT;
ALTER TABLE offers ADD COLUMN source_flyer_id TEXT;
ALTER TABLE offers ADD COLUMN image_url TEXT;

-- Do not infer cents from legacy REAL values; future validated writes supply them.
CREATE TABLE collection_runs (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload_hash TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  CHECK ((status = 'running' AND finished_at IS NULL) OR (status != 'running' AND finished_at IS NOT NULL)),
  UNIQUE (id, provider, location)
);
CREATE INDEX collection_runs_provider_location_started ON collection_runs(provider, location, started_at DESC);

-- One snapshot per source offer in each run. A retry cannot duplicate it.
CREATE TABLE offer_observations (
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  location TEXT NOT NULL,
  product_name TEXT NOT NULL,
  retailer TEXT NOT NULL,
  source_retailer_id TEXT NOT NULL,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  regular_price_cents INTEGER CHECK (regular_price_cents IS NULL OR regular_price_cents >= 0),
  currency TEXT,
  price_text TEXT,
  quantity REAL CHECK (quantity IS NULL OR quantity > 0),
  unit TEXT,
  valid_from TEXT,
  valid_until TEXT,
  source_flyer_id TEXT,
  image_url TEXT,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (run_id, provider, offer_id, location),
  FOREIGN KEY (run_id, provider, location) REFERENCES collection_runs(id, provider, location),
  CHECK (price_cents IS NULL OR currency IS NOT NULL)
);
CREATE INDEX offer_observations_source ON offer_observations(provider, offer_id, location, observed_at DESC);

CREATE TABLE collection_rejections (
  run_id TEXT NOT NULL REFERENCES collection_runs(id),
  record_key TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  PRIMARY KEY (run_id, record_key, reason_code)
);

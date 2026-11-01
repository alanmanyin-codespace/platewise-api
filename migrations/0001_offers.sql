CREATE TABLE offers (
  provider TEXT NOT NULL,
  id TEXT NOT NULL,
  location TEXT NOT NULL,
  product_name TEXT NOT NULL,
  retailer TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (provider, id, location)
);
CREATE INDEX offers_location_expiry ON offers(location, valid_until);

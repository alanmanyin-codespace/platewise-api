-- Retailers PlateWise treats as grocery stores; flyers from other retailers are not offered as store choices.
CREATE TABLE retailers (
  name TEXT PRIMARY KEY,
  is_grocery INTEGER NOT NULL CHECK (is_grocery IN (0, 1))
);
INSERT INTO retailers (name, is_grocery) VALUES
  ('Real Canadian Superstore', 1), ('Save-On-Foods', 1), ('Walmart', 1), ('Sobeys', 1), ('Safeway', 1),
  ('No Frills', 1), ('T&T Supermarket', 1), ('Family Foods', 1), ('IGA', 1), ('FreshCo', 1),
  ('Chalo FreshCo', 1), ('H Mart', 1), ('Wholesale Club and Club Entrepôt', 1), ('Costco', 1),
  ('The Grocery People - TGP', 1), ('Calgary Co-op', 1), ('M&M Food Market', 1);

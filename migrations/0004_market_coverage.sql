-- Market runs store the market slug (for example calgary) in location.
-- This records, as a JSON array, the postal codes where a market observation was seen.
ALTER TABLE offer_observations ADD COLUMN seen_postal_codes TEXT;

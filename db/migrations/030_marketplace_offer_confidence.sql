ALTER TABLE scx_catalog_marketplace_offers
  ADD COLUMN IF NOT EXISTS package_confidence text NOT NULL DEFAULT 'confirmed'
    CHECK (package_confidence IN ('confirmed', 'estimated')),
  ADD COLUMN IF NOT EXISTS package_warning text;

ALTER TABLE scx_catalog_pricing_rules
  ADD COLUMN IF NOT EXISTS marketplace_stock_pause_threshold integer NOT NULL DEFAULT 2
  CHECK (marketplace_stock_pause_threshold >= 0);

ALTER TABLE scx_catalog_pricing_rules
  ADD COLUMN IF NOT EXISTS marketplace_low_stock_warning_threshold integer NOT NULL DEFAULT 50
  CHECK (marketplace_low_stock_warning_threshold >= 0);

ALTER TABLE scx_catalog_marketplace_offers
  ADD COLUMN IF NOT EXISTS paused_by_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_known_available_quantity integer,
  ADD COLUMN IF NOT EXISTS last_stock_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_stock_sync_error text;

CREATE INDEX IF NOT EXISTS scx_marketplace_offers_stock_sync_idx
  ON scx_catalog_marketplace_offers(channel, last_stock_sync_at)
  WHERE external_id IS NOT NULL;

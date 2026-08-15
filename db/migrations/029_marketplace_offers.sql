CREATE TABLE IF NOT EXISTS scx_catalog_marketplace_offers (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES scx_catalog_product_variants(id) ON DELETE CASCADE,
  channel text NOT NULL,
  units_per_pack integer NOT NULL CHECK (units_per_pack > 0),
  package_height_cm numeric(10,2) NOT NULL CHECK (package_height_cm > 0),
  package_width_cm numeric(10,2) NOT NULL CHECK (package_width_cm > 0),
  package_length_cm numeric(10,2) NOT NULL CHECK (package_length_cm > 0),
  package_weight_grams integer NOT NULL CHECK (package_weight_grams > 0),
  external_id text,
  external_sku text NOT NULL,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'failed', 'disabled')),
  last_synced_at timestamptz,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, channel, units_per_pack),
  UNIQUE (channel, external_sku),
  UNIQUE (channel, external_id)
);

CREATE INDEX IF NOT EXISTS scx_catalog_marketplace_offers_product_idx
  ON scx_catalog_marketplace_offers(product_id, channel, units_per_pack);

ALTER TABLE scx_catalog_marketplace_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scx_catalog_marketplace_offers FROM anon, authenticated;

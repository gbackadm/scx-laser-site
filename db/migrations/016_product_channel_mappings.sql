CREATE TABLE IF NOT EXISTS scx_catalog_product_channel_mappings (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_id text NOT NULL,
  external_sku text NOT NULL,
  supplier_sku text,
  sync_status text NOT NULL DEFAULT 'synced'
    CHECK (sync_status IN ('synced', 'pending', 'failed', 'disabled')),
  last_synced_at timestamptz,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel),
  UNIQUE (channel, external_id),
  UNIQUE (channel, external_sku)
);

CREATE INDEX IF NOT EXISTS scx_catalog_product_channel_mappings_product_idx
  ON scx_catalog_product_channel_mappings(product_id, channel);

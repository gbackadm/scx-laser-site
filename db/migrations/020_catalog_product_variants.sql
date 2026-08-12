CREATE TABLE IF NOT EXISTS scx_catalog_product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  scx_sku text NOT NULL,
  supplier_sku text NOT NULL,
  name text NOT NULL,
  price_amount_in_cents integer NOT NULL CHECK (price_amount_in_cents > 0),
  cost_amount_in_cents integer NOT NULL CHECK (cost_amount_in_cents > 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'supplier', 'system')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, scx_sku),
  UNIQUE (product_id, supplier_sku),
  CHECK (jsonb_typeof(attributes) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS scx_catalog_product_variants_scx_sku_idx
  ON scx_catalog_product_variants(upper(scx_sku));

CREATE INDEX IF NOT EXISTS scx_catalog_product_variants_product_idx
  ON scx_catalog_product_variants(product_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS scx_catalog_product_variant_images (
  id text PRIMARY KEY,
  variant_id text NOT NULL REFERENCES scx_catalog_product_variants(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, url)
);

CREATE INDEX IF NOT EXISTS scx_catalog_product_variant_images_variant_idx
  ON scx_catalog_product_variant_images(variant_id, sort_order);

CREATE TABLE IF NOT EXISTS scx_catalog_product_variant_channel_mappings (
  id text PRIMARY KEY,
  variant_id text NOT NULL REFERENCES scx_catalog_product_variants(id) ON DELETE CASCADE,
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
  UNIQUE (variant_id, channel),
  UNIQUE (channel, external_id),
  UNIQUE (channel, external_sku)
);

CREATE INDEX IF NOT EXISTS scx_catalog_product_variant_channel_idx
  ON scx_catalog_product_variant_channel_mappings(variant_id, channel);

ALTER TABLE scx_catalog_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE scx_catalog_product_variant_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE scx_catalog_product_variant_channel_mappings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE scx_catalog_product_variants FROM anon, authenticated;
REVOKE ALL ON TABLE scx_catalog_product_variant_images FROM anon, authenticated;
REVOKE ALL ON TABLE scx_catalog_product_variant_channel_mappings FROM anon, authenticated;

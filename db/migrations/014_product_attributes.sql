CREATE TABLE IF NOT EXISTS scx_catalog_product_attributes (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (
    scope IN (
      'technical',
      'fiscal',
      'logistics',
      'commercial',
      'variation',
      'supplier'
    )
  ),
  name text NOT NULL,
  slug text NOT NULL,
  value text NOT NULL,
  unit text,
  source text NOT NULL DEFAULT 'supplier'
    CHECK (source IN ('supplier', 'manual', 'ai', 'system')),
  sort_order integer NOT NULL DEFAULT 0,
  is_channel_attribute boolean NOT NULL DEFAULT true,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, scope, slug)
);

CREATE INDEX IF NOT EXISTS scx_catalog_product_attributes_product_idx
  ON scx_catalog_product_attributes(product_id, scope, sort_order);

CREATE TABLE IF NOT EXISTS scx_catalog_channel_attribute_mappings (
  id text PRIMARY KEY,
  channel text NOT NULL,
  category_id text REFERENCES scx_catalog_categories(id) ON DELETE CASCADE,
  source_attribute_slug text NOT NULL,
  target_attribute_name text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, category_id, source_attribute_slug)
);

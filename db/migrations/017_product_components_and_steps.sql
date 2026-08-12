CREATE TABLE IF NOT EXISTS scx_catalog_product_components (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  component_sku text NOT NULL,
  component_name text NOT NULL,
  quantity numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'supplier', 'system')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scx_catalog_product_components_product_idx
  ON scx_catalog_product_components(product_id, sort_order);

CREATE TABLE IF NOT EXISTS scx_catalog_product_production_steps (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'supplier', 'system')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scx_catalog_product_production_steps_product_idx
  ON scx_catalog_product_production_steps(product_id, sort_order);

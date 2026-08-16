CREATE TABLE IF NOT EXISTS scx_mercado_livre_product_settings (
  product_id text PRIMARY KEY REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  category_id text NOT NULL,
  category_name text NOT NULL,
  domain_id text NOT NULL,
  domain_name text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'prediction')),
  updated_by text REFERENCES scx_catalog_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scx_mercado_livre_product_attributes (
  product_id text NOT NULL REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  category_id text NOT NULL,
  attribute_id text NOT NULL,
  attribute_name text NOT NULL,
  value_type text NOT NULL DEFAULT 'string',
  value_id text,
  value_name text,
  is_required boolean NOT NULL DEFAULT false,
  values_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(values_json) = 'array'),
  allowed_units_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_units_json) = 'array'),
  source text NOT NULL DEFAULT 'discovered' CHECK (source IN ('discovered', 'manual', 'inferred')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS scx_ml_product_attributes_lookup_idx
  ON scx_mercado_livre_product_attributes(product_id, category_id);

ALTER TABLE scx_mercado_livre_product_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scx_mercado_livre_product_attributes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scx_mercado_livre_product_settings FROM anon, authenticated;
REVOKE ALL ON TABLE scx_mercado_livre_product_attributes FROM anon, authenticated;

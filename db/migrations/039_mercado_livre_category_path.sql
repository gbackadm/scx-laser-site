ALTER TABLE scx_mercado_livre_product_settings
  ADD COLUMN IF NOT EXISTS category_path jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(category_path) = 'array');

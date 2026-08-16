ALTER TABLE scx_mercado_livre_product_attributes
  ADD COLUMN IF NOT EXISTS attribute_scope text NOT NULL DEFAULT 'product'
  CHECK (attribute_scope IN ('product', 'variation'));

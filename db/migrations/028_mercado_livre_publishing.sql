CREATE TABLE IF NOT EXISTS scx_mercado_livre_product_drafts (
  id text PRIMARY KEY,
  product_id text NOT NULL UNIQUE REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  category_id text NOT NULL,
  domain_id text NOT NULL,
  family_name text NOT NULL,
  description text NOT NULL,
  content_source text NOT NULL DEFAULT 'rules' CHECK (content_source IN ('rules', 'ai', 'manual')),
  input_hash text NOT NULL,
  payloads jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(payloads) = 'array'),
  validation_results jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_results) = 'array'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'publishing', 'published', 'error')),
  error_message text,
  created_by text REFERENCES scx_catalog_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scx_ml_product_drafts_status_idx
  ON scx_mercado_livre_product_drafts(status, updated_at DESC);

ALTER TABLE scx_mercado_livre_product_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scx_mercado_livre_product_drafts FROM anon, authenticated;

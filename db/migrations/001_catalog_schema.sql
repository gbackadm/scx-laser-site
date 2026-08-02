CREATE TABLE IF NOT EXISTS scx_catalog_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  parent_id text REFERENCES scx_catalog_categories(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scx_catalog_supplier_products (
  id text PRIMARY KEY,
  supplier_id text NOT NULL,
  supplier_name text NOT NULL,
  external_id text NOT NULL,
  raw_name text NOT NULL,
  raw_description text,
  raw_category text,
  raw_image_urls text[] NOT NULL DEFAULT '{}',
  cost_amount_in_cents integer,
  suggested_price_amount_in_cents integer,
  stock_available integer,
  last_imported_at timestamptz NOT NULL DEFAULT now(),
  import_status text NOT NULL DEFAULT 'pending_review'
    CHECK (import_status IN ('pending_review', 'mapped', 'ignored', 'sync_error')),
  raw_payload_ref text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, external_id)
);

CREATE TABLE IF NOT EXISTS scx_catalog_products (
  id text PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  category_id text NOT NULL REFERENCES scx_catalog_categories(id),
  supplier_product_id text REFERENCES scx_catalog_supplier_products(id) ON DELETE SET NULL,
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('published', 'hidden', 'draft')),
  price_amount_in_cents integer NOT NULL CHECK (price_amount_in_cents >= 0),
  cost_amount_in_cents integer CHECK (cost_amount_in_cents >= 0),
  stock_policy text NOT NULL DEFAULT 'tracked'
    CHECK (stock_policy IN ('tracked', 'made_to_order', 'untracked')),
  stock_quantity integer NOT NULL DEFAULT 0,
  low_stock_threshold integer,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scx_catalog_product_images (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES scx_catalog_products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt_text text NOT NULL,
  source text NOT NULL DEFAULT 'local'
    CHECK (source IN ('supplier', 'local', 'curated')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scx_catalog_admin_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'seller')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scx_catalog_sync_runs (
  id text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('supplier_import', 'manual_catalog_update')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  imported_count integer NOT NULL DEFAULT 0,
  mapped_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scx_catalog_audit_log (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES scx_catalog_admin_users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action IN (
      'supplier_product_imported',
      'catalog_product_created',
      'catalog_product_updated',
      'publication_status_changed',
      'stock_adjusted',
      'sync_run_completed'
    )
  ),
  entity_type text NOT NULL CHECK (
    entity_type IN (
      'supplier_product',
      'catalog_product',
      'category',
      'sync_run',
      'user'
    )
  ),
  entity_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  changes jsonb
);

CREATE INDEX IF NOT EXISTS scx_catalog_products_category_idx
  ON scx_catalog_products(category_id);

CREATE INDEX IF NOT EXISTS scx_catalog_products_status_idx
  ON scx_catalog_products(publication_status);

CREATE INDEX IF NOT EXISTS scx_catalog_supplier_products_external_idx
  ON scx_catalog_supplier_products(supplier_id, external_id);

CREATE INDEX IF NOT EXISTS scx_catalog_audit_log_entity_idx
  ON scx_catalog_audit_log(entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS scx_catalog_sync_runs_started_idx
  ON scx_catalog_sync_runs(started_at DESC);

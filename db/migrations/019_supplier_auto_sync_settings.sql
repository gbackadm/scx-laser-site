CREATE TABLE IF NOT EXISTS scx_supplier_auto_sync_settings (
  supplier_id text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT false,
  interval_minutes integer NOT NULL DEFAULT 10 CHECK (interval_minutes >= 10),
  batch_size integer NOT NULL DEFAULT 10 CHECK (batch_size BETWEEN 1 AND 100),
  status_filter text NOT NULL DEFAULT 'all'
    CHECK (status_filter IN ('true', 'false', 'all')),
  last_auto_sync_at timestamptz,
  next_auto_sync_after timestamptz,
  updated_by text REFERENCES scx_catalog_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO scx_supplier_auto_sync_settings (
  supplier_id,
  interval_minutes,
  batch_size,
  status_filter
)
VALUES ('asia-import', 10, 10, 'all')
ON CONFLICT (supplier_id) DO NOTHING;

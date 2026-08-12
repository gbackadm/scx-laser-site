CREATE TABLE IF NOT EXISTS scx_catalog_supplier_channel_mappings (
  id text PRIMARY KEY,
  supplier_id text NOT NULL,
  supplier_name text NOT NULL,
  channel text NOT NULL,
  external_id text NOT NULL,
  external_code text,
  external_name text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, channel)
);

CREATE INDEX IF NOT EXISTS scx_catalog_supplier_channel_mappings_channel_idx
  ON scx_catalog_supplier_channel_mappings(channel, external_id);

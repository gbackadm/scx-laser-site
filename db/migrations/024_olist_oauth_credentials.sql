CREATE TABLE IF NOT EXISTS scx_olist_oauth_credentials (
  id text PRIMARY KEY DEFAULT 'default',
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  access_token_expires_at timestamptz NOT NULL,
  refresh_token_expires_at timestamptz NOT NULL,
  scope text,
  connected_by text REFERENCES scx_catalog_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scx_olist_oauth_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scx_olist_oauth_credentials FROM PUBLIC, anon, authenticated;


ALTER TABLE scx_catalog_admin_users
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE TABLE IF NOT EXISTS scx_catalog_admin_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES scx_catalog_admin_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS scx_catalog_admin_sessions_token_hash_idx
  ON scx_catalog_admin_sessions(token_hash);

CREATE INDEX IF NOT EXISTS scx_catalog_admin_sessions_user_idx
  ON scx_catalog_admin_sessions(user_id);

CREATE INDEX IF NOT EXISTS scx_catalog_admin_sessions_expires_idx
  ON scx_catalog_admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS scx_mercado_livre_oauth_states (
  state_hash text PRIMARY KEY,
  encrypted_code_verifier text NOT NULL,
  admin_user_id text REFERENCES scx_catalog_admin_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scx_ml_oauth_states_expiry_idx
  ON scx_mercado_livre_oauth_states(expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS scx_mercado_livre_accounts (
  id text PRIMARY KEY,
  mercado_livre_user_id bigint NOT NULL UNIQUE,
  nickname text,
  site_id text NOT NULL DEFAULT 'MLB',
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'bearer',
  scopes text,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_error text,
  connected_by text REFERENCES scx_catalog_admin_users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scx_mercado_livre_notifications (
  id text PRIMARY KEY,
  application_id bigint NOT NULL,
  mercado_livre_user_id bigint NOT NULL,
  topic text NOT NULL,
  resource text NOT NULL,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempts integer NOT NULL DEFAULT 1,
  sent_at timestamptz,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS scx_ml_notifications_pending_idx
  ON scx_mercado_livre_notifications(status, received_at)
  WHERE status IN ('pending', 'failed');

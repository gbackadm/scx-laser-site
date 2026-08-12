CREATE TABLE IF NOT EXISTS scx_olist_sync_settings (
  id text PRIMARY KEY DEFAULT 'default',
  is_enabled boolean NOT NULL DEFAULT false,
  default_origin text NOT NULL DEFAULT '2',
  batch_size integer NOT NULL DEFAULT 20 CHECK (batch_size BETWEEN 1 AND 20),
  batch_calls_per_minute integer NOT NULL DEFAULT 5 CHECK (batch_calls_per_minute BETWEEN 1 AND 5),
  auto_sync_enabled boolean NOT NULL DEFAULT false,
  auto_sync_interval_minutes integer NOT NULL DEFAULT 1440 CHECK (auto_sync_interval_minutes >= 60),
  auto_sync_mode text NOT NULL DEFAULT 'simulation'
    CHECK (auto_sync_mode IN ('simulation', 'send')),
  require_manual_simulation_before_send boolean NOT NULL DEFAULT true,
  last_auto_sync_at timestamptz,
  next_auto_sync_after timestamptz,
  updated_by text REFERENCES scx_catalog_admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO scx_olist_sync_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS scx_olist_sync_runs (
  id text PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('simulation', 'send')),
  trigger_source text NOT NULL CHECK (trigger_source IN ('admin', 'schedule', 'script')),
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'blocked')),
  actor_user_id text REFERENCES scx_catalog_admin_users(id) ON DELETE SET NULL,
  selected_products integer NOT NULL DEFAULT 0,
  eligible_products integer NOT NULL DEFAULT 0,
  blocked_products integer NOT NULL DEFAULT 0,
  will_be_active integer NOT NULL DEFAULT 0,
  will_be_inactive integer NOT NULL DEFAULT 0,
  creates integer NOT NULL DEFAULT 0,
  updates integer NOT NULL DEFAULT 0,
  estimated_api_calls integer NOT NULL DEFAULT 0,
  blocked_by_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scx_olist_sync_runs_created_idx
  ON scx_olist_sync_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS scx_olist_sync_runs_status_idx
  ON scx_olist_sync_runs(status, mode);

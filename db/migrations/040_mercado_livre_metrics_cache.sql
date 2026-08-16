CREATE TABLE IF NOT EXISTS scx_mercado_livre_listing_metrics (
  item_id text PRIMARY KEY,
  period_days integer NOT NULL CHECK (period_days > 0 AND period_days <= 150),
  total_visits integer NOT NULL DEFAULT 0 CHECK (total_visits >= 0),
  daily_visits jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scx_ml_listing_metrics_fetched_idx
  ON scx_mercado_livre_listing_metrics (fetched_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'scx_mercado_livre_listing_metrics_pkey'
       AND pg_get_constraintdef(oid) = 'PRIMARY KEY (item_id)'
  ) THEN
    ALTER TABLE scx_mercado_livre_listing_metrics
      DROP CONSTRAINT scx_mercado_livre_listing_metrics_pkey;
    ALTER TABLE scx_mercado_livre_listing_metrics
      ADD CONSTRAINT scx_mercado_livre_listing_metrics_pkey PRIMARY KEY (item_id, period_days);
  END IF;
END $$;

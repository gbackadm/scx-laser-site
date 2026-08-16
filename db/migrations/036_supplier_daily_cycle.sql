UPDATE scx_supplier_auto_sync_settings
SET interval_minutes = 15,
  batch_size = 10,
  next_page = CASE
    WHEN interval_minutes <> 15 OR batch_size <> 10 THEN 1
    ELSE next_page
  END,
  next_auto_sync_after = now(),
  updated_at = now()
WHERE supplier_id = 'asia-import'
  AND (interval_minutes <> 15 OR batch_size <> 10);

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'scx-asia-sync-10m',
  'scx-asia-sync-15m',
  'scx-olist-sync-10m',
  'scx-mercado-livre-stock-10m'
);

SELECT cron.schedule(
  'scx-asia-sync-15m',
  '*/15 * * * *',
  $cron$SELECT private.invoke_scx_vercel_cron('/admin/api/asia/rotina');$cron$
);

SELECT cron.schedule(
  'scx-mercado-livre-stock-10m',
  '*/10 * * * *',
  $cron$SELECT private.invoke_scx_vercel_cron('/admin/api/mercado-livre/estoque');$cron$
);

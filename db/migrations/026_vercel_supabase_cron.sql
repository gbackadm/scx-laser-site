CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.invoke_scx_vercel_cron(endpoint_path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  site_url text;
  cron_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO site_url
  FROM vault.decrypted_secrets
  WHERE name = 'scx_vercel_site_url';

  SELECT decrypted_secret
  INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'scx_vercel_cron_secret';

  IF site_url IS NULL OR cron_secret IS NULL THEN
    RAISE EXCEPTION 'Vercel scheduler secrets are not configured in Vault.';
  END IF;

  SELECT net.http_get(
    url := rtrim(site_url, '/') || endpoint_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret
    ),
    timeout_milliseconds := 300000
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_scx_vercel_cron(text) FROM PUBLIC;

SELECT cron.schedule(
  'scx-asia-sync-10m',
  '*/10 * * * *',
  $cron$SELECT private.invoke_scx_vercel_cron('/admin/api/asia/rotina');$cron$
);

SELECT cron.schedule(
  'scx-olist-sync-10m',
  '*/10 * * * *',
  $cron$SELECT private.invoke_scx_vercel_cron('/admin/api/olist/rotina');$cron$
);

ALTER TABLE scx_olist_sync_settings
  DROP CONSTRAINT IF EXISTS scx_olist_sync_settings_auto_sync_interval_minutes_check;

ALTER TABLE scx_olist_sync_settings
  ADD CONSTRAINT scx_olist_sync_settings_auto_sync_interval_minutes_check
  CHECK (auto_sync_interval_minutes >= 10);

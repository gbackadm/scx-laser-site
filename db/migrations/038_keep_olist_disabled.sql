UPDATE scx_olist_sync_settings
SET is_enabled = false,
  auto_sync_enabled = false,
  next_auto_sync_after = NULL,
  updated_at = now()
WHERE id = 'default';

ALTER TABLE scx_supplier_auto_sync_settings
  ADD COLUMN IF NOT EXISTS next_page integer NOT NULL DEFAULT 1;

UPDATE scx_supplier_auto_sync_settings
SET batch_size = LEAST(batch_size, 10),
  next_page = GREATEST(next_page, 1)
WHERE batch_size > 10
   OR next_page < 1;

ALTER TABLE scx_supplier_auto_sync_settings
  DROP CONSTRAINT IF EXISTS scx_supplier_auto_sync_settings_batch_size_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scx_supplier_auto_sync_settings_batch_size_check'
  ) THEN
    ALTER TABLE scx_supplier_auto_sync_settings
      ADD CONSTRAINT scx_supplier_auto_sync_settings_batch_size_check
      CHECK (batch_size BETWEEN 1 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scx_supplier_auto_sync_settings_next_page_check'
  ) THEN
    ALTER TABLE scx_supplier_auto_sync_settings
      ADD CONSTRAINT scx_supplier_auto_sync_settings_next_page_check
      CHECK (next_page >= 1);
  END IF;
END
$$;

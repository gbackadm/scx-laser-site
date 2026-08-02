DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
    INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'scx_catalog_audit_log'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%supplier_product_imported%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE scx_catalog_audit_log DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE scx_catalog_audit_log
  ADD CONSTRAINT scx_catalog_audit_log_action_check
  CHECK (
    action IN (
      'supplier_product_imported',
      'catalog_product_created',
      'catalog_product_updated',
      'catalog_product_deleted',
      'publication_status_changed',
      'stock_adjusted',
      'sync_run_completed',
      'admin_user_created',
      'admin_login_succeeded',
      'admin_login_failed',
      'admin_logout'
    )
  );

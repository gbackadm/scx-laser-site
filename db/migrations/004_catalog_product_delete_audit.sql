ALTER TABLE scx_catalog_audit_log
  DROP CONSTRAINT IF EXISTS scx_catalog_audit_log_action_check;

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

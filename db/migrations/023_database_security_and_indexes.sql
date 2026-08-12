REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS scx_catalog_audit_log_actor_user_idx
  ON scx_catalog_audit_log(actor_user_id);

CREATE INDEX IF NOT EXISTS scx_catalog_categories_parent_idx
  ON scx_catalog_categories(parent_id);

CREATE INDEX IF NOT EXISTS scx_catalog_channel_attribute_category_idx
  ON scx_catalog_channel_attribute_mappings(category_id);

CREATE INDEX IF NOT EXISTS scx_catalog_pricing_rules_category_idx
  ON scx_catalog_pricing_rules(category_id);

CREATE INDEX IF NOT EXISTS scx_catalog_product_images_product_idx
  ON scx_catalog_product_images(product_id, sort_order);

CREATE INDEX IF NOT EXISTS scx_catalog_products_supplier_product_idx
  ON scx_catalog_products(supplier_product_id);

CREATE INDEX IF NOT EXISTS scx_olist_sync_runs_actor_user_idx
  ON scx_olist_sync_runs(actor_user_id);

CREATE INDEX IF NOT EXISTS scx_olist_sync_settings_updated_by_idx
  ON scx_olist_sync_settings(updated_by);

CREATE INDEX IF NOT EXISTS scx_supplier_auto_sync_settings_updated_by_idx
  ON scx_supplier_auto_sync_settings(updated_by);

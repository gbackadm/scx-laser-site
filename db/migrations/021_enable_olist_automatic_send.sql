UPDATE scx_catalog_products product
SET price_amount_in_cents = round(product.cost_amount_in_cents::numeric * 2.2)::integer,
  updated_at = now()
FROM scx_catalog_supplier_products supplier
WHERE supplier.id = product.supplier_product_id
  AND supplier.supplier_id = 'asia-import'
  AND product.cost_amount_in_cents IS NOT NULL
  AND product.cost_amount_in_cents > 0
  AND product.price_amount_in_cents <= product.cost_amount_in_cents;

UPDATE scx_olist_sync_settings
SET is_enabled = true,
  auto_sync_enabled = true,
  auto_sync_mode = 'send',
  require_manual_simulation_before_send = false,
  next_auto_sync_after = now(),
  updated_at = now()
WHERE id = 'default';

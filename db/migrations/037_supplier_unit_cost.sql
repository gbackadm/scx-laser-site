UPDATE scx_catalog_supplier_products
SET cost_amount_in_cents = suggested_price_amount_in_cents,
  updated_at = now()
WHERE supplier_id = 'asia-import'
  AND suggested_price_amount_in_cents IS NOT NULL
  AND cost_amount_in_cents IS DISTINCT FROM suggested_price_amount_in_cents;

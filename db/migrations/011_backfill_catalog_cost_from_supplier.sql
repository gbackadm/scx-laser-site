UPDATE scx_catalog_products product
SET cost_amount_in_cents = supplier.suggested_price_amount_in_cents,
  updated_at = now()
FROM scx_catalog_supplier_products supplier
WHERE product.supplier_product_id = supplier.id
  AND supplier.suggested_price_amount_in_cents IS NOT NULL
  AND (
    product.cost_amount_in_cents IS NULL
    OR product.cost_amount_in_cents <> supplier.suggested_price_amount_in_cents
  );

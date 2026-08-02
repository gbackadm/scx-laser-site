UPDATE scx_catalog_supplier_products supplier_product
SET import_status = 'pending_review',
  updated_at = now()
WHERE supplier_product.import_status = 'mapped'
  AND NOT EXISTS (
    SELECT 1
    FROM scx_catalog_products catalog_product
    WHERE catalog_product.supplier_product_id = supplier_product.id
      OR catalog_product.sku = supplier_product.external_id
  );

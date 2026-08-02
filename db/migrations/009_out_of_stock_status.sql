ALTER TABLE scx_catalog_products
  DROP CONSTRAINT IF EXISTS scx_catalog_products_publication_status_check;

ALTER TABLE scx_catalog_products
  ADD CONSTRAINT scx_catalog_products_publication_status_check
  CHECK (publication_status IN ('published', 'hidden', 'draft', 'out_of_stock'));

ALTER TABLE scx_catalog_pricing_rules
  ADD COLUMN IF NOT EXISTS publication_stock_min_quantity integer NOT NULL DEFAULT 1000
    CHECK (publication_stock_min_quantity >= 0);

UPDATE scx_catalog_products
SET publication_status = 'out_of_stock',
  updated_at = now()
WHERE publication_status = 'published'
  AND stock_quantity < (
    SELECT COALESCE(publication_stock_min_quantity, 1000)
    FROM scx_catalog_pricing_rules
    WHERE scope = 'global'
      AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1
  );

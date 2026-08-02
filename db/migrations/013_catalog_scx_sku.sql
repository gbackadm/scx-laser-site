ALTER TABLE scx_catalog_products
  ADD COLUMN IF NOT EXISTS scx_sku text;

WITH product_prefixes AS (
  SELECT
    product.id,
    COALESCE(
      NULLIF(
        regexp_replace(upper(left(category.name, 3)), '[^A-Z0-9]', '', 'g'),
        ''
      ),
      'PRO'
    ) AS prefix,
    product.created_at
  FROM scx_catalog_products product
  LEFT JOIN scx_catalog_categories category
    ON category.id = product.category_id
  WHERE product.scx_sku IS NULL
    OR btrim(product.scx_sku) = ''
),
numbered_products AS (
  SELECT
    id,
    prefix,
    row_number() OVER (
      PARTITION BY prefix
      ORDER BY created_at ASC, id ASC
    ) AS sequence_number
  FROM product_prefixes
)
UPDATE scx_catalog_products product
SET scx_sku = 'SCX-' || numbered_products.prefix || '-' || lpad(numbered_products.sequence_number::text, 4, '0'),
  updated_at = now()
FROM numbered_products
WHERE product.id = numbered_products.id;

CREATE UNIQUE INDEX IF NOT EXISTS scx_catalog_products_scx_sku_idx
  ON scx_catalog_products(scx_sku)
  WHERE scx_sku IS NOT NULL;

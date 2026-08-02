UPDATE scx_catalog_supplier_products
SET raw_category = decoded.category_name,
  updated_at = now()
FROM (
  SELECT
    supplier.id,
    replace(replace(replace(replace(replace(value, '&amp;', '&'), '&quot;', '"'), '&#39;', ''''), '&lt;', '<'), '&gt;', '>') AS category_name
  FROM scx_catalog_supplier_products supplier
  CROSS JOIN LATERAL jsonb_each_text(supplier.raw_payload->'categorias') AS category_items(key, value)
  WHERE supplier.raw_category IS NULL
    AND jsonb_typeof(supplier.raw_payload->'categorias') = 'object'
    AND btrim(value) <> ''
    AND lower(btrim(value)) <> 'sem categoria'
) AS decoded
WHERE scx_catalog_supplier_products.id = decoded.id
  AND scx_catalog_supplier_products.raw_category IS NULL;

INSERT INTO scx_catalog_categories (id, name, slug, sort_order)
SELECT DISTINCT
  'cat-' || lower(trim(both '-' from regexp_replace(raw_category, '[^a-zA-Z0-9]+', '-', 'g'))) AS id,
  raw_category AS name,
  lower(trim(both '-' from regexp_replace(raw_category, '[^a-zA-Z0-9]+', '-', 'g'))) AS slug,
  500 AS sort_order
FROM scx_catalog_supplier_products
WHERE raw_category IS NOT NULL
  AND btrim(raw_category) <> ''
  AND lower(btrim(raw_category)) <> 'sem categoria'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  updated_at = now();

UPDATE scx_catalog_products product
SET category_id = category.id,
  updated_at = now()
FROM scx_catalog_supplier_products supplier
INNER JOIN scx_catalog_categories category
  ON category.slug = lower(trim(both '-' from regexp_replace(supplier.raw_category, '[^a-zA-Z0-9]+', '-', 'g')))
WHERE product.supplier_product_id = supplier.id
  AND product.category_id = 'cat-sem-categoria'
  AND supplier.raw_category IS NOT NULL;

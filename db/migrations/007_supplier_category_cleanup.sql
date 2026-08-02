INSERT INTO scx_catalog_categories (id, name, slug, sort_order)
VALUES ('cat-sem-categoria', 'Sem categoria', 'sem-categoria', 999)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  updated_at = now();

UPDATE scx_catalog_products
SET category_id = 'cat-sem-categoria',
  updated_at = now()
WHERE category_id IN (
  SELECT id
  FROM scx_catalog_categories
  WHERE lower(name) = 'asia import'
    OR slug = 'asia-import'
);

UPDATE scx_catalog_categories
SET is_active = false,
  updated_at = now()
WHERE lower(name) = 'asia import'
  OR slug = 'asia-import';

CREATE TABLE IF NOT EXISTS scx_mercado_livre_category_profiles (
  id text PRIMARY KEY,
  catalog_category_id text NOT NULL REFERENCES scx_catalog_categories(id) ON DELETE CASCADE,
  adapter text NOT NULL DEFAULT 'generic' CHECK (adapter IN ('generic', 'pens')),
  category_id text NOT NULL,
  domain_id text NOT NULL,
  variation_axes jsonb NOT NULL DEFAULT '[]'::jsonb,
  pack_quantities jsonb NOT NULL DEFAULT '[]'::jsonb,
  attribute_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('unreviewed', 'reviewed', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_category_id)
);

INSERT INTO scx_mercado_livre_category_profiles (
  id, catalog_category_id, adapter, category_id, domain_id,
  variation_axes, pack_quantities, attribute_mapping, status
)
SELECT
  'ml-profile-canetas', id, 'pens', 'MLB44014', 'MLB-PENS',
  '["Cor"]'::jsonb, '[50,100,200]'::jsonb, '{}'::jsonb, 'reviewed'
FROM scx_catalog_categories
WHERE name = 'Canetas'
ON CONFLICT (catalog_category_id) DO NOTHING;

INSERT INTO scx_mercado_livre_category_profiles (
  id, catalog_category_id, adapter, category_id, domain_id,
  variation_axes, pack_quantities, attribute_mapping, status
)
SELECT
  'ml-profile-garrafas', id, 'generic', 'MLB277958', 'MLB-SPORT_AND_BAZAAR_BOTTLES',
  '["Cor"]'::jsonb, '[10]'::jsonb,
  '[
    {"targetId":"BRAND","source":"literal","valueName":"Generica"},
    {"targetId":"MODEL","source":"supplierCode"},
    {"targetId":"SPORT_BOTTLE_CAPACITY","source":"variantAttribute","sourceKey":"Capacidade"},
    {"targetId":"BOTTLE_MATERIAL","source":"inferredMaterial"},
    {"targetId":"COLOR","source":"variantAttribute","sourceKey":"Cor"}
  ]'::jsonb,
  'reviewed'
FROM scx_catalog_categories
WHERE name = 'Garrafas'
ON CONFLICT (catalog_category_id) DO NOTHING;

ALTER TABLE scx_mercado_livre_category_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scx_mercado_livre_category_profiles FROM anon, authenticated;

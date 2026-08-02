CREATE TABLE IF NOT EXISTS scx_catalog_pricing_rules (
  id text PRIMARY KEY,
  name text NOT NULL,
  scope text NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global', 'category')),
  category_id text REFERENCES scx_catalog_categories(id) ON DELETE CASCADE,
  cost_multiplier numeric(10, 4) NOT NULL DEFAULT 2.2,
  fixed_fee_amount_in_cents integer NOT NULL DEFAULT 0
    CHECK (fixed_fee_amount_in_cents >= 0),
  loss_percentage numeric(6, 3) NOT NULL DEFAULT 0
    CHECK (loss_percentage >= 0),
  minimum_price_amount_in_cents integer NOT NULL DEFAULT 0
    CHECK (minimum_price_amount_in_cents >= 0),
  rounding_mode text NOT NULL DEFAULT 'none'
    CHECK (rounding_mode IN ('none', 'nearest_real', 'ending_90', 'ending_99')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scx_catalog_pricing_rules_global_idx
  ON scx_catalog_pricing_rules(scope)
  WHERE scope = 'global' AND is_active = true;

INSERT INTO scx_catalog_pricing_rules (
  id,
  name,
  scope,
  cost_multiplier,
  fixed_fee_amount_in_cents,
  loss_percentage,
  minimum_price_amount_in_cents,
  rounding_mode
)
VALUES (
  'global-default',
  'Regra global padrao',
  'global',
  2.2,
  0,
  0,
  0,
  'ending_90'
)
ON CONFLICT (id) DO NOTHING;

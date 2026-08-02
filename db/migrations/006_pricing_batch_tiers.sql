CREATE TABLE IF NOT EXISTS scx_catalog_pricing_batch_tiers (
  id text PRIMARY KEY,
  pricing_rule_id text NOT NULL REFERENCES scx_catalog_pricing_rules(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL CHECK (min_quantity > 0),
  discount_percentage numeric(6, 3) NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0),
  minimum_unit_price_amount_in_cents integer NOT NULL DEFAULT 0
    CHECK (minimum_unit_price_amount_in_cents >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pricing_rule_id, min_quantity)
);

INSERT INTO scx_catalog_pricing_batch_tiers (
  id,
  pricing_rule_id,
  min_quantity,
  discount_percentage,
  minimum_unit_price_amount_in_cents,
  sort_order
)
VALUES
  ('global-default-tier-1', 'global-default', 1, 0, 0, 1),
  ('global-default-tier-2', 'global-default', 2, 3, 0, 2),
  ('global-default-tier-6', 'global-default', 6, 5, 0, 6),
  ('global-default-tier-11', 'global-default', 11, 8, 0, 11),
  ('global-default-tier-21', 'global-default', 21, 10, 0, 21),
  ('global-default-tier-50', 'global-default', 50, 12, 0, 50),
  ('global-default-tier-100', 'global-default', 100, 15, 0, 100),
  ('global-default-tier-300', 'global-default', 300, 18, 0, 300),
  ('global-default-tier-500', 'global-default', 500, 22, 0, 500),
  ('global-default-tier-1000', 'global-default', 1000, 25, 0, 1000)
ON CONFLICT (pricing_rule_id, min_quantity) DO NOTHING;

ALTER TABLE scx_catalog_pricing_rules
  ADD COLUMN IF NOT EXISTS marketplace_min_profit_amount_in_cents integer NOT NULL DEFAULT 5000
    CHECK (marketplace_min_profit_amount_in_cents >= 0),
  ADD COLUMN IF NOT EXISTS marketplace_min_return_percentage numeric(7, 3) NOT NULL DEFAULT 50
    CHECK (marketplace_min_return_percentage >= 0),
  ADD COLUMN IF NOT EXISTS marketplace_max_product_cost_amount_in_cents integer NOT NULL DEFAULT 500000
    CHECK (marketplace_max_product_cost_amount_in_cents >= 0),
  ADD COLUMN IF NOT EXISTS marketplace_operational_cost_amount_in_cents integer NOT NULL DEFAULT 0
    CHECK (marketplace_operational_cost_amount_in_cents >= 0),
  ADD COLUMN IF NOT EXISTS marketplace_tax_reserve_percentage numeric(7, 3) NOT NULL DEFAULT 0
    CHECK (marketplace_tax_reserve_percentage >= 0);

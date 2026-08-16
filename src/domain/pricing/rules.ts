import "server-only";

import { getDatabasePool, isDatabaseConfigured } from "@/domain/catalog/db";

export type PricingRoundingMode =
  | "none"
  | "nearest_real"
  | "ending_90"
  | "ending_99";

export type PricingRule = {
  id: string;
  name: string;
  costMultiplier: number;
  fixedFeeAmountInCents: number;
  lossPercentage: number;
  minimumPriceAmountInCents: number;
  publicationStockMinQuantity: number;
  marketplaceMinProfitAmountInCents: number;
  marketplaceMinReturnPercentage: number;
  marketplaceMaxProductCostAmountInCents: number;
  marketplaceOperationalCostAmountInCents: number;
  marketplaceTaxReservePercentage: number;
  marketplaceStockPauseThreshold: number;
  marketplaceLowStockWarningThreshold: number;
  roundingMode: PricingRoundingMode;
};

export type PricingBatchTier = {
  id: string;
  minQuantity: number;
  discountPercentage: number;
  minimumUnitPriceAmountInCents: number;
};

export type PricingSimulationInput = {
  costAmountInCents: number;
  quantity: number;
  rule: PricingRule;
  tier?: PricingBatchTier;
};

export type PricingSimulation = {
  subtotalAmountInCents: number;
  lossAmountInCents: number;
  fixedFeeAmountInCents: number;
  discountAmountInCents: number;
  minimumApplied: boolean;
  roundedAmountInCents: number;
  unitPriceAmountInCents: number;
};

type PricingRuleRow = {
  id: string;
  name: string;
  cost_multiplier: string | number;
  fixed_fee_amount_in_cents: number;
  loss_percentage: string | number;
  minimum_price_amount_in_cents: number;
  publication_stock_min_quantity: number;
  marketplace_min_profit_amount_in_cents: number;
  marketplace_min_return_percentage: string | number;
  marketplace_max_product_cost_amount_in_cents: number;
  marketplace_operational_cost_amount_in_cents: number;
  marketplace_tax_reserve_percentage: string | number;
  marketplace_stock_pause_threshold: number;
  marketplace_low_stock_warning_threshold: number;
  rounding_mode: PricingRoundingMode;
};

type PricingBatchTierRow = {
  id: string;
  min_quantity: number;
  discount_percentage: string | number;
  minimum_unit_price_amount_in_cents: number;
};

export type PricingRuleInput = {
  costMultiplier: number;
  fixedFeeAmountInCents: number;
  lossPercentage: number;
  minimumPriceAmountInCents: number;
  publicationStockMinQuantity: number;
  marketplaceMinProfitAmountInCents: number;
  marketplaceMinReturnPercentage: number;
  marketplaceMaxProductCostAmountInCents: number;
  marketplaceOperationalCostAmountInCents: number;
  marketplaceTaxReservePercentage: number;
  marketplaceStockPauseThreshold: number;
  marketplaceLowStockWarningThreshold: number;
  roundingMode: PricingRoundingMode;
  tiers: PricingBatchTierInput[];
};

export type PricingBatchTierInput = {
  minQuantity: number;
  discountPercentage: number;
  minimumUnitPriceAmountInCents: number;
};

export const defaultPricingRule: PricingRule = {
  id: "global-default",
  name: "Regra global padrao",
  costMultiplier: 2.2,
  fixedFeeAmountInCents: 0,
  lossPercentage: 0,
  minimumPriceAmountInCents: 0,
  publicationStockMinQuantity: 1000,
  marketplaceMinProfitAmountInCents: 5000,
  marketplaceMinReturnPercentage: 50,
  marketplaceMaxProductCostAmountInCents: 500000,
  marketplaceOperationalCostAmountInCents: 0,
  marketplaceTaxReservePercentage: 0,
  marketplaceStockPauseThreshold: 2,
  marketplaceLowStockWarningThreshold: 50,
  roundingMode: "ending_90",
};

export const defaultPricingBatchTiers: PricingBatchTier[] = [
  {
    id: "global-default-tier-1",
    minQuantity: 1,
    discountPercentage: 0,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-2",
    minQuantity: 2,
    discountPercentage: 3,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-6",
    minQuantity: 6,
    discountPercentage: 5,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-11",
    minQuantity: 11,
    discountPercentage: 8,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-21",
    minQuantity: 21,
    discountPercentage: 10,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-50",
    minQuantity: 50,
    discountPercentage: 12,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-100",
    minQuantity: 100,
    discountPercentage: 15,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-300",
    minQuantity: 300,
    discountPercentage: 18,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-500",
    minQuantity: 500,
    discountPercentage: 22,
    minimumUnitPriceAmountInCents: 0,
  },
  {
    id: "global-default-tier-1000",
    minQuantity: 1000,
    discountPercentage: 25,
    minimumUnitPriceAmountInCents: 0,
  },
];

function mapPricingRule(row: PricingRuleRow): PricingRule {
  return {
    id: row.id,
    name: row.name,
    costMultiplier: Number(row.cost_multiplier),
    fixedFeeAmountInCents: row.fixed_fee_amount_in_cents,
    lossPercentage: Number(row.loss_percentage),
    minimumPriceAmountInCents: row.minimum_price_amount_in_cents,
    publicationStockMinQuantity: row.publication_stock_min_quantity ?? 1000,
    marketplaceMinProfitAmountInCents: row.marketplace_min_profit_amount_in_cents ?? 5000,
    marketplaceMinReturnPercentage: Number(row.marketplace_min_return_percentage ?? 50),
    marketplaceMaxProductCostAmountInCents: row.marketplace_max_product_cost_amount_in_cents ?? 500000,
    marketplaceOperationalCostAmountInCents: row.marketplace_operational_cost_amount_in_cents ?? 0,
    marketplaceTaxReservePercentage: Number(row.marketplace_tax_reserve_percentage ?? 0),
    marketplaceStockPauseThreshold: row.marketplace_stock_pause_threshold ?? 2,
    marketplaceLowStockWarningThreshold: row.marketplace_low_stock_warning_threshold ?? 50,
    roundingMode: row.rounding_mode,
  };
}

function mapPricingBatchTier(row: PricingBatchTierRow): PricingBatchTier {
  return {
    id: row.id,
    minQuantity: row.min_quantity,
    discountPercentage: Number(row.discount_percentage),
    minimumUnitPriceAmountInCents: row.minimum_unit_price_amount_in_cents,
  };
}

function roundPrice(amountInCents: number, mode: PricingRoundingMode) {
  if (mode === "nearest_real") {
    return Math.round(amountInCents / 100) * 100;
  }

  if (mode === "ending_90" || mode === "ending_99") {
    const ending = mode === "ending_90" ? 90 : 99;
    const lowerReais = Math.floor((amountInCents - ending) / 100);
    const lowerAmountInCents = lowerReais * 100 + ending;
    const upperAmountInCents = (lowerReais + 1) * 100 + ending;

    if (lowerAmountInCents < 0) {
      return upperAmountInCents;
    }

    return amountInCents - lowerAmountInCents <= upperAmountInCents - amountInCents
      ? lowerAmountInCents
      : upperAmountInCents;
  }

  return Math.round(amountInCents);
}

export function calculatePrice(input: PricingSimulationInput): PricingSimulation {
  const quantity = Math.max(1, Math.round(input.quantity));
  const subtotalAmountInCents = Math.round(
    input.costAmountInCents * quantity * input.rule.costMultiplier,
  );
  const lossAmountInCents = Math.round(
    subtotalAmountInCents * (input.rule.lossPercentage / 100),
  );
  const fixedFeeAmountInCents = input.rule.fixedFeeAmountInCents;
  const rawAmountInCents =
    subtotalAmountInCents + lossAmountInCents + fixedFeeAmountInCents;
  const discountAmountInCents = Math.round(
    rawAmountInCents * ((input.tier?.discountPercentage ?? 0) / 100),
  );
  const discountedAmountInCents = Math.max(
    0,
    rawAmountInCents - discountAmountInCents,
  );
  const tierMinimumTotalAmountInCents =
    (input.tier?.minimumUnitPriceAmountInCents ?? 0) * quantity;
  const minimumAmountInCents = Math.max(
    input.rule.minimumPriceAmountInCents,
    tierMinimumTotalAmountInCents,
  );
  const minimumApplied = discountedAmountInCents < minimumAmountInCents;
  const baseAmountInCents = Math.max(
    discountedAmountInCents,
    minimumAmountInCents,
  );
  const roundedAmountInCents = roundPrice(
    baseAmountInCents,
    input.rule.roundingMode,
  );

  return {
    subtotalAmountInCents,
    lossAmountInCents,
    fixedFeeAmountInCents,
    discountAmountInCents,
    minimumApplied,
    roundedAmountInCents,
    unitPriceAmountInCents: Math.round(roundedAmountInCents / quantity),
  };
}

export function calculateBatchTierPrices(
  costAmountInCents: number,
  rule: PricingRule,
  tiers: PricingBatchTier[],
) {
  return tiers.map((tier) => ({
    tier,
    simulation: calculatePrice({
      costAmountInCents,
      quantity: tier.minQuantity,
      rule,
      tier,
    }),
  }));
}

export async function getGlobalPricingRule() {
  if (!isDatabaseConfigured()) {
    return defaultPricingRule;
  }

  try {
    const result = await getDatabasePool().query<PricingRuleRow>(
      `
        SELECT *
        FROM scx_catalog_pricing_rules
        WHERE scope = 'global'
          AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    );

    return result.rows[0] ? mapPricingRule(result.rows[0]) : defaultPricingRule;
  } catch (error) {
    console.error("Nao foi possivel carregar a regra global de precos.", error);
    return defaultPricingRule;
  }
}

export async function listGlobalPricingBatchTiers() {
  if (!isDatabaseConfigured()) {
    return defaultPricingBatchTiers;
  }

  try {
    const result = await getDatabasePool().query<PricingBatchTierRow>(
      `
        SELECT *
        FROM scx_catalog_pricing_batch_tiers
        WHERE pricing_rule_id = $1
          AND is_active = true
        ORDER BY sort_order ASC, min_quantity ASC
      `,
      [defaultPricingRule.id],
    );

    return result.rows.length > 0
      ? result.rows.map(mapPricingBatchTier)
      : defaultPricingBatchTiers;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = String(error.code);

      if (code === "42P01") {
        return defaultPricingBatchTiers;
      }
    }

    console.error("Nao foi possivel carregar as faixas de preco.", error);
    return defaultPricingBatchTiers;
  }
}

export async function updateGlobalPricingRule(input: PricingRuleInput) {
  const pool = getDatabasePool();

  await pool.query("BEGIN");

  try {
    await pool.query(
      `
        INSERT INTO scx_catalog_pricing_rules (
          id,
          name,
          scope,
          cost_multiplier,
          fixed_fee_amount_in_cents,
          loss_percentage,
          minimum_price_amount_in_cents,
          publication_stock_min_quantity,
          marketplace_min_profit_amount_in_cents,
          marketplace_min_return_percentage,
          marketplace_max_product_cost_amount_in_cents,
          marketplace_operational_cost_amount_in_cents,
          marketplace_tax_reserve_percentage,
          marketplace_stock_pause_threshold,
          marketplace_low_stock_warning_threshold,
          rounding_mode,
          updated_at
        )
        VALUES ($1, 'Regra global padrao', 'global', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
        ON CONFLICT (id) DO UPDATE SET
          cost_multiplier = EXCLUDED.cost_multiplier,
          fixed_fee_amount_in_cents = EXCLUDED.fixed_fee_amount_in_cents,
          loss_percentage = EXCLUDED.loss_percentage,
          minimum_price_amount_in_cents = EXCLUDED.minimum_price_amount_in_cents,
          publication_stock_min_quantity = EXCLUDED.publication_stock_min_quantity,
          marketplace_min_profit_amount_in_cents = EXCLUDED.marketplace_min_profit_amount_in_cents,
          marketplace_min_return_percentage = EXCLUDED.marketplace_min_return_percentage,
          marketplace_max_product_cost_amount_in_cents = EXCLUDED.marketplace_max_product_cost_amount_in_cents,
          marketplace_operational_cost_amount_in_cents = EXCLUDED.marketplace_operational_cost_amount_in_cents,
          marketplace_tax_reserve_percentage = EXCLUDED.marketplace_tax_reserve_percentage,
          marketplace_stock_pause_threshold = EXCLUDED.marketplace_stock_pause_threshold,
          marketplace_low_stock_warning_threshold = EXCLUDED.marketplace_low_stock_warning_threshold,
          rounding_mode = EXCLUDED.rounding_mode,
          is_active = true,
          updated_at = now()
      `,
      [
        defaultPricingRule.id,
        input.costMultiplier,
        input.fixedFeeAmountInCents,
        input.lossPercentage,
        input.minimumPriceAmountInCents,
        input.publicationStockMinQuantity,
        input.marketplaceMinProfitAmountInCents,
        input.marketplaceMinReturnPercentage,
        input.marketplaceMaxProductCostAmountInCents,
        input.marketplaceOperationalCostAmountInCents,
        input.marketplaceTaxReservePercentage,
        input.marketplaceStockPauseThreshold,
        input.marketplaceLowStockWarningThreshold,
        input.roundingMode,
      ],
    );

    await pool.query(
      `
        UPDATE scx_catalog_pricing_batch_tiers
        SET is_active = false,
          updated_at = now()
        WHERE pricing_rule_id = $1
      `,
      [defaultPricingRule.id],
    );

    const normalizedTiers = input.tiers
      .filter((tier) => tier.minQuantity > 0)
      .sort((a, b) => a.minQuantity - b.minQuantity)
      .slice(0, 8);

    for (const [index, tier] of normalizedTiers.entries()) {
      await pool.query(
        `
          INSERT INTO scx_catalog_pricing_batch_tiers (
            id,
            pricing_rule_id,
            min_quantity,
            discount_percentage,
            minimum_unit_price_amount_in_cents,
            sort_order,
            is_active,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, true, now())
          ON CONFLICT (pricing_rule_id, min_quantity) DO UPDATE SET
            discount_percentage = EXCLUDED.discount_percentage,
            minimum_unit_price_amount_in_cents = EXCLUDED.minimum_unit_price_amount_in_cents,
            sort_order = EXCLUDED.sort_order,
            is_active = true,
            updated_at = now()
        `,
        [
          `global-default-tier-${tier.minQuantity}`,
          defaultPricingRule.id,
          tier.minQuantity,
          tier.discountPercentage,
          tier.minimumUnitPriceAmountInCents,
          (index + 1) * 10,
        ],
      );
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

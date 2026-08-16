"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/domain/auth/session";
import { parseMoneyToCents } from "@/domain/catalog/money";
import { roleCan } from "@/domain/catalog/permissions";
import {
  defaultPricingBatchTiers,
  updateGlobalPricingRule,
  type PricingRoundingMode,
} from "@/domain/pricing/rules";

function parseDecimal(value: FormDataEntryValue | null, fallback = 0) {
  const numericValue = Number(String(value ?? "").trim().replace(",", "."));

  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : fallback;
}

function parseInteger(value: FormDataEntryValue | null, fallback = 0) {
  const numericValue = Number(String(value ?? "").trim());

  return Number.isFinite(numericValue)
    ? Math.max(0, Math.round(numericValue))
    : fallback;
}

function parseRoundingMode(value: FormDataEntryValue | null): PricingRoundingMode {
  const mode = String(value ?? "none");

  if (["none", "nearest_real", "ending_90", "ending_99"].includes(mode)) {
    return mode as PricingRoundingMode;
  }

  return "none";
}

function parseBatchTiers(formData: FormData) {
  return defaultPricingBatchTiers.map((tier, index) => ({
    minQuantity: Math.max(
      1,
      Math.round(parseDecimal(formData.get(`tierQuantity${index}`), tier.minQuantity)),
    ),
    discountPercentage: parseDecimal(
      formData.get(`tierDiscount${index}`),
      tier.discountPercentage,
    ),
    minimumUnitPriceAmountInCents: parseMoneyToCents(
      formData.get(`tierMinimumUnitPrice${index}`),
    ),
  }));
}

export async function saveGlobalPricingRule(formData: FormData) {
  const session = await requireAdminSession();

  if (!roleCan(session.role, "catalog:edit")) {
    redirect("/admin/precos?erro=permissao");
  }

  await updateGlobalPricingRule({
    costMultiplier: parseDecimal(formData.get("costMultiplier"), 2.2),
    fixedFeeAmountInCents: parseMoneyToCents(formData.get("fixedFee")),
    lossPercentage: parseDecimal(formData.get("lossPercentage"), 0),
    minimumPriceAmountInCents: parseMoneyToCents(formData.get("minimumPrice")),
    publicationStockMinQuantity: parseInteger(
      formData.get("publicationStockMinQuantity"),
      1000,
    ),
    marketplaceMinProfitAmountInCents: parseMoneyToCents(formData.get("marketplaceMinProfit")),
    marketplaceMinReturnPercentage: parseDecimal(formData.get("marketplaceMinReturnPercentage"), 50),
    marketplaceMaxProductCostAmountInCents: parseMoneyToCents(formData.get("marketplaceMaxProductCost")),
    marketplaceOperationalCostAmountInCents: parseMoneyToCents(formData.get("marketplaceOperationalCost")),
    marketplaceTaxReservePercentage: parseDecimal(formData.get("marketplaceTaxReservePercentage"), 0),
    marketplaceStockPauseThreshold: parseInteger(formData.get("marketplaceStockPauseThreshold"), 2),
    marketplaceLowStockWarningThreshold: parseInteger(formData.get("marketplaceLowStockWarningThreshold"), 50),
    roundingMode: parseRoundingMode(formData.get("roundingMode")),
    tiers: parseBatchTiers(formData),
  });

  revalidatePath("/admin/precos");
  revalidatePath("/admin/catalogo");
  revalidatePath("/catalogo");
  redirect("/admin/precos?salvo=1");
}

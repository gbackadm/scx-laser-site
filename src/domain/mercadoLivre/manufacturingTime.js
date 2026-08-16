export const DEFAULT_MANUFACTURING_TIME_DAYS = 5;

export function normalizeManufacturingTimeDays(value) {
  if (value === null || value === undefined || value === "") return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    throw new Error("O prazo de producao deve ficar entre 1 e 60 dias.");
  }
  return days;
}

export function manufacturingTimeDaysFrom(saleTerms) {
  const term = Array.isArray(saleTerms)
    ? saleTerms.find((item) => item?.id === "MANUFACTURING_TIME")
    : null;
  if (!term) return null;
  const value = String(term.value_name ?? term.value_struct?.number ?? "").match(/\d+/)?.[0];
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 60 ? days : null;
}

export function withManufacturingTime(saleTerms, value) {
  const days = normalizeManufacturingTimeDays(value);
  const otherTerms = Array.isArray(saleTerms)
    ? saleTerms.filter((item) => item?.id !== "MANUFACTURING_TIME")
    : [];
  return days === null
    ? otherTerms
    : [...otherTerms, { id: "MANUFACTURING_TIME", value_name: `${days} dias` }];
}

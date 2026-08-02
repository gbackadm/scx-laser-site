export function formatMoneyInput(amountInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountInCents / 100);
}

export function parseMoneyToCents(value: unknown) {
  const rawValue = String(value ?? "")
    .trim()
    .replace(/[^\d,.-]/g, "");

  if (!rawValue) {
    return 0;
  }

  const sign = rawValue.startsWith("-") ? -1 : 1;
  const unsignedValue = rawValue.replace(/-/g, "");
  const lastComma = unsignedValue.lastIndexOf(",");
  const lastDot = unsignedValue.lastIndexOf(".");
  const decimalSeparator =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? ","
        : "."
      : lastComma >= 0
        ? ","
        : lastDot >= 0
          ? "."
          : "";

  if (decimalSeparator) {
    const separatorIndex = unsignedValue.lastIndexOf(decimalSeparator);
    const fractionalDigits = unsignedValue
      .slice(separatorIndex + 1)
      .replace(/\D/g, "");

    if (fractionalDigits.length <= 2) {
      const wholeDigits = unsignedValue.slice(0, separatorIndex).replace(/\D/g, "");
      const cents = `${fractionalDigits}00`.slice(0, 2);
      const amountInCents = Number(`${wholeDigits || "0"}${cents}`);

      return Number.isFinite(amountInCents) ? Math.max(0, sign * amountInCents) : 0;
    }
  }

  const digits = unsignedValue.replace(/\D/g, "");
  const amountInCents = Number(digits) * 100;

  return Number.isFinite(amountInCents) ? Math.max(0, sign * amountInCents) : 0;
}

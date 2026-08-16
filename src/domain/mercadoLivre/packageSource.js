function localeNumber(value) {
  const match = String(value ?? "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function dimensionsFrom(value) {
  return String(value ?? "")
    .replace(/,/g, ".")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number) ?? [];
}

export function confirmedMasterPack(rawPayload) {
  const properties = rawPayload?.propriedades ?? {};
  const dimensions = dimensionsFrom(
    properties["dimensao-caixa"]
      ?? properties["dimensao-da-caixa"]
      ?? properties["dimensao-por-caixa"],
  );
  return {
    masterUnits: Math.round(localeNumber(
      properties["quant-por-caixa"]
        ?? properties["quantidade-por-caixa"]
        ?? properties["quant-da-caixa"]
        ?? properties["quantidade-da-caixa"],
    )),
    innerUnits: Math.round(localeNumber(properties["quant-por-caixinha"] ?? properties["quantidade-por-caixinha"])),
    lengthCm: dimensions[0] ?? 0,
    widthCm: dimensions[1] ?? 0,
    heightCm: dimensions[2] ?? 0,
    weightGrams: Math.round(localeNumber(properties["peso-da-caixa"] ?? properties["peso-caixa"]) * 1000),
  };
}

export function confirmedUnitPack(rawPayload) {
  const properties = rawPayload?.propriedades ?? {};
  const dimensions = dimensionsFrom(properties["dimensao-produto"] ?? properties["dimensao-do-produto"]);
  const rawHeight = localeNumber(rawPayload?.altura);
  const rawWidth = localeNumber(rawPayload?.largura);
  const rawLength = localeNumber(rawPayload?.comprimento);
  return {
    heightCm: dimensions.length >= 2 ? dimensions[0] : rawHeight,
    widthCm: dimensions.length >= 3 ? dimensions[1] : dimensions[1] ?? rawWidth,
    lengthCm: dimensions.length >= 3 ? dimensions[2] : dimensions[1] ?? rawLength,
    weightGrams: Math.round(localeNumber(properties["peso-do-produto"] ?? rawPayload?.peso) * 1000),
  };
}

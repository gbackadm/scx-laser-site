export type RawSupplierPayload = Record<string, unknown> | null | undefined;

export function confirmedMasterPack(rawPayload: RawSupplierPayload): {
  masterUnits: number;
  innerUnits: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightGrams: number;
};

export function confirmedUnitPack(rawPayload: RawSupplierPayload): {
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightGrams: number;
};

export const DEFAULT_MANUFACTURING_TIME_DAYS: number;
export type MercadoLivreSaleTerm = {
  id?: string;
  value_name?: string | null;
  value_id?: string | null;
  value_struct?: { number?: number; unit?: string } | null;
};
export function normalizeManufacturingTimeDays(value: unknown): number | null;
export function manufacturingTimeDaysFrom(saleTerms: unknown): number | null;
export function withManufacturingTime(saleTerms: unknown, value: unknown): MercadoLivreSaleTerm[];

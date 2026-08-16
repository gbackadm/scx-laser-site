export type EditableAttributeDefinition = {
  id: string;
  name: string;
  required: boolean;
  scope?: "product" | "variation";
  valueType: string;
  values: Array<{ id?: string; name: string }>;
  allowedUnits: Array<{ id: string; name: string }>;
};

export type ListingAttribute = { id: string; value_id?: string; value_name?: string };

export function applyEditableAttributes(input: {
  existing?: ListingAttribute[];
  submitted?: ListingAttribute[];
  definitions?: EditableAttributeDefinition[];
}): { attributes: ListingAttribute[]; missing: EditableAttributeDefinition[] };

export function clearResolvedRequiredAttributeErrors(errors?: string[], attributes?: ListingAttribute[]): string[];

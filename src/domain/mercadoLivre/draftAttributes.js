function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function applyEditableAttributes({ existing = [], submitted = [], definitions = [] }) {
  const allowed = new Map(definitions.map((item) => [item.id, item]));
  const edits = new Map();
  for (const item of submitted) {
    const definition = allowed.get(item.id);
    const valueName = text(item.value_name);
    if (!definition || !valueName) continue;
    const option = definition.values?.find((value) => value.name.toLocaleLowerCase("pt-BR") === valueName.toLocaleLowerCase("pt-BR"));
    edits.set(item.id, {
      id: item.id,
      ...(option?.id ? { value_id: option.id } : {}),
      value_name: option?.name ?? valueName,
    });
  }
  const missing = definitions.filter((item) => item.required && !edits.has(item.id));
  return {
    attributes: [...existing.filter((item) => !allowed.has(item.id)), ...edits.values()],
    missing,
  };
}

export function clearResolvedRequiredAttributeErrors(errors = [], attributes = []) {
  const present = new Set(attributes.map((item) => item.id));
  return errors.filter((reason) => {
    const match = String(reason).match(/^Atributo obrigatorio ([A-Z0-9_]+) ausente\.$/);
    return !match || !present.has(match[1]);
  });
}

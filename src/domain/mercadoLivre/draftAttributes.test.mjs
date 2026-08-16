import assert from "node:assert/strict";
import test from "node:test";

import { applyEditableAttributes, clearResolvedRequiredAttributeErrors } from "./draftAttributes.js";

const ink = {
  id: "INK_COLOR", name: "Cor da tinta", required: true, valueType: "string", allowedUnits: [],
  values: [{ id: "52049", name: "Preto" }, { name: "Azul" }],
};

test("aplica parametro obrigatorio e usa o id oficial quando conhecido", () => {
  const result = applyEditableAttributes({
    existing: [{ id: "BRAND", value_name: "Generica" }],
    submitted: [{ id: "INK_COLOR", value_name: "preto" }],
    definitions: [ink],
  });
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.attributes, [
    { id: "BRAND", value_name: "Generica" },
    { id: "INK_COLOR", value_id: "52049", value_name: "Preto" },
  ]);
});

test("mantem bloqueio quando parametro obrigatorio fica vazio", () => {
  const result = applyEditableAttributes({ submitted: [], definitions: [ink] });
  assert.equal(result.missing[0].id, "INK_COLOR");
});

test("remove somente erros de atributos que foram preenchidos", () => {
  const errors = clearResolvedRequiredAttributeErrors([
    "Atributo obrigatorio INK_COLOR ausente.",
    "Embalagem do kit 50 ainda e estimada.",
  ], [{ id: "INK_COLOR", value_name: "Preto" }]);
  assert.deepEqual(errors, ["Embalagem do kit 50 ainda e estimada."]);
});

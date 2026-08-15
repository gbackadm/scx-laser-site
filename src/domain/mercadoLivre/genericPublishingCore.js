import { buildMercadoLivreFamilyTitle, orderListingPictureUrls } from "./listingQuality.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function attribute(id, valueName, valueId) {
  return {
    id,
    ...(valueId ? { value_id: valueId } : {}),
    ...(valueName ? { value_name: String(valueName) } : {}),
  };
}

export function inferMaterial(title, description = "") {
  const source = normalize(`${title} ${description}`);
  const rules = [
    { terms: ["aco inoxidavel", "aco inox", "inox"], value: "Aco inoxidavel" },
    { terms: ["aluminio"], value: "Aluminio" },
    { terms: ["vidro"], value: "Vidro" },
    { terms: ["madeira", "bambu"], value: "Madeira" },
    { terms: ["plastico", "polipropileno", "acrilico"], value: "Plastico" },
  ];
  return rules.find((rule) => rule.terms.some((term) => source.includes(term)))?.value ?? null;
}

function categoryAttributeMap(categoryAttributes) {
  return new Map((categoryAttributes ?? []).map((item) => [item.id, item]));
}

function isRequired(item) {
  return Boolean(item?.tags?.required || item?.tags?.new_required);
}

function isVariationAttribute(item) {
  return Boolean(item?.tags?.variation_attribute || item?.tags?.allow_variations || item?.tags?.defines_picture);
}

function concreteProducts(product) {
  if (Array.isArray(product.variants) && product.variants.length > 0) return product.variants;
  return [{
    id: product.id,
    sku: product.sku,
    stockQuantity: product.stockQuantity,
    images: product.images,
    attributes: {},
    offerPricesInCents: product.offerPricesInCents,
  }];
}

function mappedValue(mapping, product, variant) {
  if (mapping.source === "literal") return { name: mapping.valueName, id: mapping.valueId };
  if (mapping.source === "supplierCode") return { name: product.supplierCode };
  if (mapping.source === "variantAttribute") {
    const raw = variant.attributes?.[mapping.sourceKey];
    const mapped = mapping.values?.[raw];
    if (typeof mapped === "string") return { name: raw, id: mapped };
    if (mapped) return { name: mapped.valueName ?? raw, id: mapped.valueId };
    return { name: raw };
  }
  if (mapping.source === "inferredMaterial") return { name: inferMaterial(product.title, product.description) };
  return {};
}

function uniquePictures(variant, product, maxPictures) {
  return orderListingPictureUrls({
    variantImages: variant.images,
    productImages: product.images,
    variantAttributes: variant.attributes,
    maxPictures,
  }).map((source) => ({ source }));
}

function packageAttributes(pack) {
  return [
    attribute("SELLER_PACKAGE_HEIGHT", `${Math.ceil(pack.heightCm)} cm`),
    attribute("SELLER_PACKAGE_WIDTH", `${Math.ceil(pack.widthCm)} cm`),
    attribute("SELLER_PACKAGE_LENGTH", `${Math.ceil(pack.lengthCm)} cm`),
    attribute("SELLER_PACKAGE_WEIGHT", `${Math.ceil(pack.weightGrams)} g`),
  ];
}

function addError(errors, code, message, context = {}) {
  errors.push({ code, message, ...context });
}

function permutations(values) {
  const [a, b, c] = values;
  return [
    [a, b, c], [a, c, b], [b, a, c],
    [b, c, a], [c, a, b], [c, b, a],
  ].filter((value, index, all) => all.findIndex((candidate) => candidate.join(":") === value.join(":")) === index);
}

function estimateGridPackage(quantity, unit, master) {
  const candidates = [];
  for (const [unitHeight, unitWidth, unitLength] of permutations([unit.heightCm, unit.widthCm, unit.lengthCm])) {
    for (let heightCount = 1; heightCount <= quantity; heightCount += 1) {
      for (let widthCount = 1; widthCount <= Math.ceil(quantity / heightCount); widthCount += 1) {
        const lengthCount = Math.ceil(quantity / (heightCount * widthCount));
        const dimensions = {
          heightCm: Math.ceil(unitHeight * heightCount + 1),
          widthCm: Math.ceil(unitWidth * widthCount + 1),
          lengthCm: Math.ceil(unitLength * lengthCount + 1),
        };
        if (
          dimensions.heightCm <= master.heightCm
          && dimensions.widthCm <= master.widthCm
          && dimensions.lengthCm <= master.lengthCm
        ) {
          candidates.push({
            ...dimensions,
            volume: dimensions.heightCm * dimensions.widthCm * dimensions.lengthCm,
            longestSide: Math.max(dimensions.heightCm, dimensions.widthCm, dimensions.lengthCm),
          });
        }
      }
    }
  }
  candidates.sort((left, right) => left.volume - right.volume || left.longestSide - right.longestSide);
  return candidates[0] ?? null;
}

export function deriveProfilePacks({ desiredQuantities = [], masterPack, unit }) {
  const errors = [];
  const packs = [];
  const masterQuantity = Number(masterPack?.unitsPerPack);
  const masterComplete = masterQuantity > 0
    && [masterPack?.heightCm, masterPack?.widthCm, masterPack?.lengthCm, masterPack?.weightGrams]
      .every((value) => Number(value) > 0);
  if (!masterComplete) {
    addError(errors, "MASTER_PACKAGE_INCOMPLETE", "Caixa-mestre confirmada sem quantidade, dimensoes ou peso bruto.");
    return { packs, errors, ready: false };
  }

  const quantities = [...new Set(desiredQuantities.map(Number))]
    .filter((quantity) => Number.isInteger(quantity) && quantity > 0)
    .sort((left, right) => left - right);
  for (const unitsPerPack of quantities) {
    if (unitsPerPack > masterQuantity) {
      addError(errors, "PACK_EXCEEDS_MASTER", `Kit ${unitsPerPack} excede a caixa-mestre de ${masterQuantity} unidades.`, { unitsPerPack });
      continue;
    }
    if (unitsPerPack === masterQuantity) {
      packs.push({ ...masterPack, unitsPerPack, confidence: "confirmed", warning: null });
      continue;
    }

    const unitComplete = [unit?.heightCm, unit?.widthCm, unit?.lengthCm, unit?.weightGrams]
      .every((value) => Number(value) > 0);
    if (!unitComplete) {
      addError(errors, "UNIT_LOGISTICS_INCOMPLETE", `Kit ${unitsPerPack} nao pode ser estimado sem dimensoes e peso unitarios.`, { unitsPerPack });
      continue;
    }
    const grid = estimateGridPackage(unitsPerPack, unit, masterPack);
    if (!grid) {
      addError(errors, "PACK_GRID_NOT_READY", `Nao foi encontrada uma grade conservadora para o kit ${unitsPerPack} dentro da caixa-mestre.`, { unitsPerPack });
      continue;
    }
    const proportionalGrossWeight = masterPack.weightGrams * (unitsPerPack / masterQuantity);
    const bufferedUnitWeight = unit.weightGrams * unitsPerPack * 1.05;
    packs.push({
      unitsPerPack,
      heightCm: grid.heightCm,
      widthCm: grid.widthCm,
      lengthCm: grid.lengthCm,
      weightGrams: Math.ceil(Math.max(proportionalGrossWeight, bufferedUnitWeight)),
      confidence: "estimated",
      warning: `Embalagem estimada em grade para ${unitsPerPack} unidades; confirme antes de publicar.`,
    });
  }
  return { packs, errors, ready: errors.length === 0 };
}

export function buildGenericUserProductPayloads({ product, profile, categoryAttributes = [], packages = [] }) {
  const errors = [];
  const payloads = [];
  const attributesById = categoryAttributeMap(categoryAttributes);
  const maxPictures = Math.max(1, Number(profile?.maxPictures) || 12);

  if (profile?.status !== "reviewed") addError(errors, "PROFILE_NOT_REVIEWED", "Perfil de publicacao nao revisado.");
  if (!text(profile?.categoryId) || !text(profile?.domainId)) addError(errors, "CATEGORY_MISSING", "Categoria ou dominio ausente no perfil.");

  const axes = profile?.variationAxes ?? [];
  for (const axis of axes) {
    const mapping = (profile?.attributeMappings ?? []).find(
      (item) => item.source === "variantAttribute" && item.sourceKey === axis,
    );
    if (!mapping || !isVariationAttribute(attributesById.get(mapping.targetId))) {
      addError(errors, "VARIATION_AXIS_NOT_ALLOWED", `Eixo de variacao ${axis} nao permitido pela categoria.`, { axis });
    }
  }
  for (const mapping of profile?.attributeMappings ?? []) {
    if (mapping.source !== "variantAttribute" || axes.includes(mapping.sourceKey)) continue;
    const values = new Set(concreteProducts(product).map((variant) => text(variant.attributes?.[mapping.sourceKey])).filter(Boolean));
    if (values.size > 1) addError(errors, "NON_VARIATION_ATTRIBUTE_CONFLICT", `Atributo ${mapping.sourceKey} varia, mas nao foi aprovado como eixo.`, { axis: mapping.sourceKey });
  }

  const fatalProfileError = errors.some((item) => ["PROFILE_NOT_REVIEWED", "CATEGORY_MISSING", "VARIATION_AXIS_NOT_ALLOWED", "NON_VARIATION_ATTRIBUTE_CONFLICT"].includes(item.code));
  const variants = concreteProducts(product);
  const allowedPackages = packages.filter((pack) => profile?.packQuantities?.includes(pack.unitsPerPack));

  for (const pack of allowedPackages) {
    for (const variant of variants) {
      const offerErrors = [];
      const skuBase = text(variant.sku || product.sku);
      const sku = pack.unitsPerPack === 1 ? skuBase : `${skuBase}-K${pack.unitsPerPack}`;
      const stockQuantity = Number(variant.stockQuantity ?? product.stockQuantity ?? 0);
      const availableQuantity = Math.floor(stockQuantity / pack.unitsPerPack);
      const pictures = uniquePictures(variant, product, maxPictures);
      const priceInCents = Number(
        variant.offerPricesInCents?.[String(pack.unitsPerPack)]
          ?? product.offerPricesInCents?.[String(pack.unitsPerPack)]
          ?? 0,
      );

      if (!skuBase) addError(offerErrors, "SKU_MISSING", "SKU ausente.");
      if (pictures.length < 2) addError(offerErrors, "IMAGES_INSUFFICIENT", `Oferta ${sku || product.id} precisa de pelo menos duas imagens coerentes.`);
      if (availableQuantity < 1) addError(offerErrors, "STOCK_MISSING", `Oferta ${sku || product.id} sem estoque para o kit.`);
      for (const axis of axes) {
        if (!text(variant.attributes?.[axis])) {
          addError(offerErrors, "VARIATION_VALUE_MISSING", `Oferta ${sku || product.id} sem valor para o eixo ${axis}.`, { axis });
        }
      }
      if (pack.confidence !== "confirmed") addError(offerErrors, "PACKAGE_ESTIMATED", `Embalagem do kit ${pack.unitsPerPack} ainda e estimada.`);
      if (![pack.heightCm, pack.widthCm, pack.lengthCm, pack.weightGrams].every((value) => Number(value) > 0)) {
        addError(offerErrors, "PACKAGE_INCOMPLETE", `Embalagem do kit ${pack.unitsPerPack} incompleta.`);
      }

      const mappedAttributes = [];
      for (const mapping of profile?.attributeMappings ?? []) {
        const value = mappedValue(mapping, product, variant);
        if (text(value.name) || text(value.id)) mappedAttributes.push(attribute(mapping.targetId, value.name, value.id));
      }
      const coreAttributes = [
        ...mappedAttributes,
        ...packageAttributes(pack),
        attribute("SELLER_SKU", sku),
        attribute("ITEM_CONDITION", "Novo", "2230284"),
        attribute("EMPTY_GTIN_REASON", "O produto nao tem codigo cadastrado", "17055160"),
      ];
      const presentIds = new Set(coreAttributes.map((item) => item.id));
      for (const required of categoryAttributes.filter(isRequired)) {
        if (!presentIds.has(required.id)) {
          addError(offerErrors, "REQUIRED_ATTRIBUTE_MISSING", `Atributo obrigatorio ${required.id} ausente.`, { attributeId: required.id });
        }
      }

      const variantIdentity = axes.map((axis) => text(variant.attributes?.[axis])).filter(Boolean).join("-") || "simple";
      const familyBase = text(profile?.familyName) || text(product.title) || text(product.supplierCode) || product.id;
      const familyName = buildMercadoLivreFamilyTitle({
        title: familyBase,
        unitsPerPack: pack.unitsPerPack,
        description: product.description,
      });
      payloads.push({
        offerId: `${variant.id ?? product.id}:mercado_livre:${pack.unitsPerPack}`,
        variantId: variant.id ?? product.id,
        unitsPerPack: pack.unitsPerPack,
        sku,
        sourceVideoId: product.videoId ?? null,
        variationIdentity: variantIdentity,
        package: pack,
        errors: offerErrors,
        publishable: !fatalProfileError && offerErrors.length === 0,
        body: {
          family_name: familyName,
          category_id: profile?.categoryId,
          domain_id: profile?.domainId,
          price: priceInCents / 100,
          currency_id: profile?.currencyId ?? "BRL",
          available_quantity: availableQuantity,
          buying_mode: profile?.buyingMode ?? "buy_it_now",
          listing_type_id: profile?.listingTypeId ?? "gold_special",
          condition: "new",
          channels: ["marketplace"],
          pictures,
          attributes: coreAttributes,
        },
      });
      errors.push(...offerErrors.map((item) => ({ ...item, offerId: `${variant.id ?? product.id}:mercado_livre:${pack.unitsPerPack}` })));
    }
  }

  return { errors, payloads, publishable: payloads.length > 0 && payloads.every((item) => item.publishable) };
}

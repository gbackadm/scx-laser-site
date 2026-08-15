import { buildMarketplaceTitle } from "../catalog/marketplaceTitles.js";

const COLOR_CODES = Object.freeze({
  amarelo: ["am", "amarelo"],
  azul: ["az", "azul"],
  branco: ["br", "branco"],
  cafe: ["cf", "cafe"],
  chocolate: ["ch", "chocolate"],
  cinza: ["cz", "cinza"],
  cru: ["cr", "cru"],
  dourado: ["dr", "dourado"],
  grafite: ["gf", "grafite"],
  laranja: ["la", "laranja"],
  prata: ["pr", "prata"],
  preto: ["pt", "preto"],
  rosa: ["rs", "rosa"],
  roxo: ["rx", "roxo"],
  verde: ["vd", "verde"],
  vermelho: ["vm", "vermelho"],
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function unique(values) {
  return values.filter((value, index, all) => text(value) && all.indexOf(value) === index);
}

function colorFromUrl(url) {
  let source = normalize(url);
  try {
    source = normalize(decodeURIComponent(url));
  } catch {}
  const tokens = source.split(/[^a-z0-9]+/).filter(Boolean);
  for (const [color, aliases] of Object.entries(COLOR_CODES)) {
    if (aliases.some((alias) => tokens.includes(alias))) return color;
  }
  return null;
}

function variantColor(attributes = {}) {
  const key = Object.keys(attributes).find((item) => normalize(item) === "cor");
  return normalize(key ? attributes[key] : "") || null;
}

function imagePreference(url) {
  const source = normalize(url);
  return (source.includes("scaled") ? 20 : 0)
    + (source.includes("perfil") || source.includes("profile") ? 10 : 0);
}

export function orderListingPictureUrls({
  variantImages = [],
  productImages = [],
  variantAttributes = {},
  maxPictures = 12,
}) {
  const own = unique(variantImages);
  const parent = unique(productImages);
  const color = variantColor(variantAttributes);
  if (!color) return unique([...parent, ...own]).slice(0, maxPictures);

  const matchingParent = parent
    .filter((url) => colorFromUrl(url) === color)
    .sort((left, right) => imagePreference(left) - imagePreference(right));
  const genericParent = parent.filter((url) => colorFromUrl(url) === null);

  if (!matchingParent.length) {
    return unique([...own, ...genericParent]).slice(0, maxPictures);
  }

  return unique([
    matchingParent[0],
    ...own,
    ...matchingParent.slice(1),
    ...genericParent,
  ]).slice(0, maxPictures);
}

export function extractYoutubeVideoId(value) {
  const source = text(value);
  if (/^[\w-]{11}$/.test(source)) return source;
  try {
    const url = new URL(source);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0]?.slice(0, 11) ?? null;
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const pathId = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1];
      const queryId = url.searchParams.get("v");
      return pathId ?? (/^[\w-]{11}$/.test(queryId ?? "") ? queryId : null);
    }
  } catch {}
  return null;
}

export function buildMercadoLivreFamilyTitle({ title, unitsPerPack, description = "", maxLength = 44 }) {
  const quantity = Math.max(1, Math.round(Number(unitsPerPack) || 1));
  const cleanTitle = buildMarketplaceTitle(title, "mercado_livre", { maxLength: 50 });
  const source = normalize(`${title} ${description}`);
  const personalization = /personali|gravacao|laser/.test(source) && !normalize(cleanTitle).includes("personali")
    ? " Personalizado"
    : "";
  const candidate = `Kit ${quantity} ${cleanTitle}${personalization}`;
  return buildMarketplaceTitle(candidate, "mercado_livre", { maxLength });
}

export function evaluateListingContent({ familyName, pictures = [], videoId, description = "", attributes = [], mainPictureAccepted = null }) {
  const checks = [
    { id: "title", label: "Titulo comercial", passed: text(familyName).length >= 30 && text(familyName).length <= 44, blocking: false, points: 20 },
    { id: "pictures", label: "Duas ou mais fotos coerentes", passed: pictures.length >= 2, blocking: true, points: 15 },
    { id: "main-picture", label: "Foto principal aprovada no diagnostico ML", passed: mainPictureAccepted === true, blocking: mainPictureAccepted === false, points: 10 },
    { id: "video", label: "Video do produto", passed: Boolean(videoId), blocking: false, points: 15 },
    { id: "description", label: "Descricao detalhada", passed: text(description).length >= 180, blocking: false, points: 20 },
    { id: "attributes", label: "Ficha tecnica preenchida", passed: attributes.length >= 8, blocking: false, points: 20 },
  ];
  return {
    score: checks.reduce((total, check) => total + (check.passed ? check.points : 0), 0),
    label: "Estimativa SCX, nao e a nota oficial do Mercado Livre",
    checks: checks.map(({ points, ...check }) => check),
  };
}

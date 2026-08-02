import "server-only";

export type AsiaImportProductVariation = {
  referencia?: string;
  nome?: string;
  preco?: string | number;
  qtd_estoque?: string | number;
  ncm?: string;
  imagem?: string;
  atributos?: unknown;
};

export type AsiaImportProduct = {
  referencia?: string;
  nome?: string;
  descricao?: string;
  preco?: string | number;
  imagem?: string;
  galeria?: string[];
  video?: string;
  categorias?: string[];
  tags?: string[];
  propriedades?: unknown;
  propriedades2?: unknown;
  promocao?: string | number;
  status?: string | number;
  altura?: string | number;
  largura?: string | number;
  comprimento?: string | number;
  peso?: string | number;
  origem_faturamento?: string;
  variacoes?: AsiaImportProductVariation[];
};

export type AsiaImportListResponse = {
  pagina?: number;
  total_paginas?: number;
  por_pagina?: number;
  total_produtos?: number;
  produtos?: AsiaImportProduct[];
};

export type AsiaImportListFilters = {
  pagina?: number;
  porPagina?: number;
  nome?: string;
  referencia?: string;
  cor?: string;
  status?: "true" | "false" | "all";
};

export type AsiaImportConfigStatus = {
  baseUrl: string;
  hasApiKey: boolean;
  hasSecretKey: boolean;
  ready: boolean;
};

export function getAsiaImportConfigStatus(): AsiaImportConfigStatus {
  const baseUrl =
    process.env.ASIA_IMPORT_BASE_URL ?? "https://api.asiaimport.com.br/";
  const hasApiKey = Boolean(process.env.ASIA_IMPORT_API_KEY);
  const hasSecretKey = Boolean(process.env.ASIA_IMPORT_SECRET_KEY);

  return {
    baseUrl,
    hasApiKey,
    hasSecretKey,
    ready: hasApiKey && hasSecretKey,
  };
}

export async function listAsiaImportProducts(
  filters: AsiaImportListFilters,
): Promise<AsiaImportListResponse> {
  const status = getAsiaImportConfigStatus();

  if (!status.ready) {
    throw new Error("Credenciais da Asia Import nao configuradas.");
  }

  const body = new FormData();
  body.set("api_key", process.env.ASIA_IMPORT_API_KEY ?? "");
  body.set("secret_key", process.env.ASIA_IMPORT_SECRET_KEY ?? "");
  body.set("funcao", "listarProdutos2");
  body.set("pagina", String(filters.pagina ?? 1));
  body.set("por_pagina", String(Math.min(filters.porPagina ?? 10, 10)));

  if (filters.nome) {
    body.set("nome", filters.nome);
  }

  if (filters.referencia) {
    body.set("referencia", filters.referencia);
  }

  if (filters.cor) {
    body.set("cor", filters.cor);
  }

  if (filters.status) {
    body.set("status", filters.status);
  }

  const response = await fetch(status.baseUrl, {
    method: "POST",
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Asia Import respondeu HTTP ${response.status}.`);
  }

  return (await response.json()) as AsiaImportListResponse;
}

export function parseAsiaMoneyToCents(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return Math.round(value * 100);
  }

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

export function parseAsiaStock(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

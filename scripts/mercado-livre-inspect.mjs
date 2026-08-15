import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

import pg from "pg";

import { decryptSecret } from "../src/domain/mercadoLivre/core.js";

const { Pool } = pg;

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

async function mercadoLivreGet(path, accessToken) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} falhou (${response.status}).`);
  return body;
}

loadLocalEnv();

for (const key of ["DATABASE_URL", "MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY"]) {
  if (!process.env[key]) throw new Error(`${key} nao configurado.`);
}

const query = process.argv.slice(2).join(" ").trim() || "Caneta metalica aluminio esferografica";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const accountResult = await pool.query(
    `SELECT encrypted_access_token FROM scx_mercado_livre_accounts
      WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1`,
  );
  if (!accountResult.rows[0]) throw new Error("Conta Mercado Livre nao conectada.");
  const accessToken = decryptSecret(
    accountResult.rows[0].encrypted_access_token,
    process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY,
  );
  const user = await mercadoLivreGet("/users/me", accessToken);
  const suggestions = await mercadoLivreGet(
    `/sites/MLB/domain_discovery/search?q=${encodeURIComponent(query)}&limit=3`,
    accessToken,
  );
  const categoryId = suggestions[0]?.category_id;
  const [category, attributes] = categoryId
    ? await Promise.all([
        mercadoLivreGet(`/categories/${categoryId}`, accessToken),
        mercadoLivreGet(`/categories/${categoryId}/attributes`, accessToken),
      ])
    : [null, []];

  console.log(JSON.stringify({
    seller: {
      id: user.id,
      nickname: user.nickname,
      tags: user.tags ?? [],
      listingAllowed: user.status?.list?.allow ?? null,
      listingCodes: user.status?.list?.codes ?? [],
    },
    query,
    suggestions: suggestions.map((item) => ({
      categoryId: item.category_id,
      categoryName: item.category_name,
      domainId: item.domain_id,
      domainName: item.domain_name,
    })),
    category: category ? {
      id: category.id,
      name: category.name,
      path: category.path_from_root,
      settings: category.settings,
    } : null,
    attributes: attributes.map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      valueType: attribute.value_type,
      tags: attribute.tags,
      values: (attribute.values ?? []).slice(0, 30),
    })),
  }, null, 2));
} finally {
  await pool.end();
}

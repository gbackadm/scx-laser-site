import "server-only";

import { getDatabasePool } from "@/domain/catalog/db";

export type SiteSettings = {
  brandName: string;
  legalName?: string;
  tagline?: string;
  shortDescription?: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  email?: string;
  locationLabel?: string;
  address?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  linkedinUrl?: string;
  tiktokUrl?: string;
  googleMapsUrl?: string;
  businessHours?: string;
};

type SiteSettingsRow = {
  nome_fantasia: string;
  razao_social: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  horario_funcionamento: string | null;
  descricao: string | null;
  cnpj: string | null;
};

function onlyDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function formatBrazilWhatsapp(value: string | null | undefined) {
  const digits = onlyDigits(value);

  if (digits.startsWith("55")) {
    return digits;
  }

  return digits ? `55${digits}` : fallbackSiteSettings.whatsappNumber;
}

function formatAddress(row: SiteSettingsRow) {
  const street = [row.endereco, row.numero].filter(Boolean).join(", ");
  const districtAndCity = [row.bairro, row.cidade, row.estado]
    .filter(Boolean)
    .join(" - ");

  return [street, districtAndCity, row.cep].filter(Boolean).join(" | ");
}

function formatLocation(row: SiteSettingsRow) {
  return [row.cidade, row.estado].filter(Boolean).join(" - ");
}

function formatWhatsappDisplay(value: string | null | undefined) {
  return value?.trim() || fallbackSiteSettings.whatsappDisplay;
}

export const fallbackSiteSettings: SiteSettings = {
  brandName: "SCX Laser",
  tagline: "Gravacao a laser UV de precisao",
  shortDescription:
    "Gravacao a laser UV de alta precisao para brindes, produtos personalizados e pecas tecnicas.",
  whatsappNumber: "5547992574007",
  whatsappDisplay: "(47) 99257-4007",
  email: "contato@scxlaser.com.br",
  locationLabel: "Santa Catarina - Brasil",
};

function mapSiteSettings(row: SiteSettingsRow): SiteSettings {
  const address = formatAddress(row);
  const locationLabel = formatLocation(row);

  return {
    brandName: row.nome_fantasia,
    legalName: row.razao_social ?? undefined,
    tagline: "Gravacao a laser UV de precisao",
    shortDescription: row.descricao ?? undefined,
    whatsappNumber: formatBrazilWhatsapp(row.whatsapp ?? row.telefone),
    whatsappDisplay: formatWhatsappDisplay(row.whatsapp ?? row.telefone),
    email: row.email ?? undefined,
    locationLabel: locationLabel || fallbackSiteSettings.locationLabel,
    address: address || undefined,
    businessHours: row.horario_funcionamento ?? undefined,
  };
}

export async function getSiteSettings() {
  if (!process.env.DATABASE_URL) {
    return fallbackSiteSettings;
  }

  try {
    const result = await getDatabasePool().query<SiteSettingsRow>(
      `
        SELECT *
        FROM empresa
        WHERE ativo = true
        ORDER BY id ASC
        LIMIT 1
      `,
    );

    return result.rows[0] ? mapSiteSettings(result.rows[0]) : fallbackSiteSettings;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = String(error.code);

      if (code === "42P01") {
        return fallbackSiteSettings;
      }
    }

    throw error;
  }
}

export function siteWhatsappUrl(settings: SiteSettings, message?: string) {
  const baseUrl = `https://wa.me/${settings.whatsappNumber}`;

  if (!message) {
    return baseUrl;
  }

  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

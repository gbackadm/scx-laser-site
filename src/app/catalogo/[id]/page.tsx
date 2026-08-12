import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  ArrowLeft,
  Gauge,
  MessageCircle,
  PackageCheck,
  ShoppingBag,
  Tag,
} from "lucide-react";

import { getCatalogAccess } from "@/domain/catalog/access";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { PublicProductGallery } from "@/components/PublicProductGallery";
import { toPublicCatalogProducts } from "@/domain/catalog/publicProducts";
import type { PublicCatalogPriceTier } from "@/domain/catalog/publicTypes";
import type { CatalogProduct, Category } from "@/domain/catalog/types";
import {
  getSiteSettings,
  siteWhatsappUrl,
  type SiteSettings,
} from "@/domain/site/settings";
import {
  defaultPricingBatchTiers,
  defaultPricingRule,
  getGlobalPricingRule,
  listGlobalPricingBatchTiers,
} from "@/domain/pricing/rules";

type PublicProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function whatsappUrl(
  productTitle: string,
  sku: string,
  productUrl: string,
  intent: "retail" | "corporate",
  siteSettings: SiteSettings,
) {
  const message =
    intent === "retail"
      ? `Ola, tenho interesse em comprar poucas unidades do produto ${productTitle}. Referencia: ${sku}. Link: ${productUrl}`
      : `Ola, gostaria de um orcamento para lote do produto ${productTitle}. Referencia: ${sku}. Link: ${productUrl}`;

  return siteWhatsappUrl(siteSettings, message);
}

function PriceTierList({
  title,
  tiers,
}: {
  title: string;
  tiers: PublicCatalogPriceTier[];
}) {
  if (tiers.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-white/10 bg-black/25 p-4">
      <h2 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-400">
        {title}
      </h2>
      <div className="mt-4 grid gap-2">
        {tiers.map((tier) => (
          <div
            key={tier.label}
            className="flex items-center justify-between gap-4 rounded border border-white/8 bg-white/[0.025] px-3 py-2 text-sm"
          >
            <span className="font-bold text-zinc-300">{tier.label}</span>
            <span className="font-black text-emerald-200">
              {currencyFormatter.format(tier.unitPriceInCents / 100)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function PublicProductPage({ params }: PublicProductPageProps) {
  const { id } = await params;
  const catalogAccess = getCatalogAccess();
  const [siteSettings, adminSession] = await Promise.all([
    getSiteSettings(),
    getCurrentAdminSession(),
  ]);
  let products: CatalogProduct[] = [];
  let categories: Category[] = [];
  let pricingRule = defaultPricingRule;
  let batchTiers = defaultPricingBatchTiers;

  try {
    [products, categories, pricingRule, batchTiers] = await Promise.all([
      catalogAccess.listCatalogProducts({
        publicationStatus: "published",
        requireStock: true,
        requireImage: true,
      }),
      catalogAccess.listCategories(),
      getGlobalPricingRule(),
      listGlobalPricingBatchTiers(),
    ]);
  } catch (error) {
    console.error("Nao foi possivel carregar a pagina publica do produto.", error);
  }
  const product = toPublicCatalogProducts(
    products,
    categories,
    pricingRule,
    batchTiers,
  ).find((item) => item.id === id);

  if (!product) {
    notFound();
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const productUrl = `${protocol}://${host}/catalogo/${encodeURIComponent(product.id)}`;
  const retailTiers = product.tiers.filter((tier) => tier.profile === "retail");
  const corporateTiers = product.tiers.filter(
    (tier) => tier.profile === "corporate",
  );

  return (
    <main className="min-h-screen bg-[#050606] text-white">
      <header className="border-b border-white/10 bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <Link href="/catalogo" className="inline-flex items-center gap-3">
            <img
              src="/images/logo-scx-oficial.webp"
              alt="SCX Laser"
              width={96}
              height={64}
              className="h-12 w-[72px] object-contain object-left"
            />
            <span className="text-sm font-black uppercase tracking-[0.16em] text-zinc-200">
              Catalogo
            </span>
          </Link>
          <div className="flex flex-wrap gap-2">
            {adminSession ? (
              <Link
                href="/admin"
                className="inline-flex w-fit items-center gap-2 rounded border border-white/12 px-3 py-2 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white"
              >
                <Gauge size={16} />
                Painel
              </Link>
            ) : null}
            <Link
              href="/catalogo"
              className="inline-flex w-fit items-center gap-2 rounded border border-white/12 px-3 py-2 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              <ArrowLeft size={16} />
              Voltar
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-12">
        <PublicProductGallery
          title={product.title}
          imageUrls={product.imageUrls}
          variants={product.variants}
        />

        <div className="grid content-start gap-6">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-laser">
              <Tag size={14} />
              {product.category}
            </p>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">
              {product.title}
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              Codigo: {product.sku}
            </p>
            {product.description ? (
              <p className="mt-5 text-sm leading-7 text-zinc-300">
                {product.description}
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-white/10 bg-[#0d0f10] p-5">
            <p className="text-sm font-bold text-zinc-300">A partir de</p>
            <p className="mt-1 text-3xl font-black text-white">
              {currencyFormatter.format(product.priceInCents / 100)}
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Valores unitarios por quantidade. Personalizacao, prazo e
              disponibilidade final sao confirmados no atendimento.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                href={whatsappUrl(
                  product.title,
                  product.sku,
                  productUrl,
                  "retail",
                  siteSettings,
                )}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded border border-white/12 px-4 text-sm font-black uppercase text-zinc-200 transition hover:border-laser hover:text-white"
              >
                <ShoppingBag size={17} />
                Poucas unidades
              </a>
              <a
                href={whatsappUrl(
                  product.title,
                  product.sku,
                  productUrl,
                  "corporate",
                  siteSettings,
                )}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-4 text-sm font-black uppercase text-white"
              >
                <PackageCheck size={17} />
                Orcar lote
              </a>
            </div>
            <a
              href={whatsappUrl(
                product.title,
                product.sku,
                productUrl,
                "retail",
                siteSettings,
              )}
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-zinc-500 transition hover:text-zinc-200"
            >
              <MessageCircle size={16} />
              Tirar duvida no WhatsApp
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <PriceTierList title="Varejo / Marketplace" tiers={retailTiers} />
            <PriceTierList title="Lote / Corporativo" tiers={corporateTiers} />
          </div>
        </div>
      </section>
    </main>
  );
}

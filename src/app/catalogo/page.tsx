import Link from "next/link";
import { headers } from "next/headers";
import { Gauge } from "lucide-react";

import { PublicCatalogBrowser } from "@/components/PublicCatalogBrowser";
import { getCurrentAdminSession } from "@/domain/auth/session";
import { getCatalogAccess } from "@/domain/catalog/access";
import { toPublicCatalogProducts } from "@/domain/catalog/publicProducts";
import type { CatalogProduct, Category } from "@/domain/catalog/types";
import { getSiteSettings, siteWhatsappUrl } from "@/domain/site/settings";
import {
  defaultPricingBatchTiers,
  defaultPricingRule,
  getGlobalPricingRule,
  listGlobalPricingBatchTiers,
} from "@/domain/pricing/rules";

export const metadata = {
  title: "Catalogo | SCX Laser",
  description:
    "Catalogo publico da SCX Laser com produtos publicados para personalizacao.",
};

export const dynamic = "force-dynamic";

export default async function PublicCatalogPage() {
  const catalogAccess = getCatalogAccess();
  const [siteSettings, adminSession] = await Promise.all([
    getSiteSettings(),
    getCurrentAdminSession(),
  ]);
  const requestHeaders = await headers();
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
    console.error("Nao foi possivel carregar o catalogo publico.", error);
  }
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const siteOrigin = `${protocol}://${host}`;
  const publicProducts = toPublicCatalogProducts(
    products,
    categories,
    pricingRule,
    batchTiers,
  );
  const publicCategories = Array.from(
    new Set(publicProducts.map((product) => product.category)),
  );

  return (
    <main className="min-h-screen bg-[#050606] text-white">
      <header className="border-b border-white/10 bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <Link href="/" className="inline-flex items-center gap-3">
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
          <nav className="flex flex-wrap gap-3 text-sm">
            {adminSession ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
              >
                <Gauge size={16} />
                Painel
              </Link>
            ) : null}
            <Link
              href="/"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Inicio
            </Link>
            <a
              href={siteWhatsappUrl(siteSettings)}
              className="rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-3 py-2 font-black text-white"
            >
              Orcar
            </a>
          </nav>
        </div>
      </header>

      <section className="border-b border-white/10 bg-[#090a0b]">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-12">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
            SCX Laser
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black text-white sm:text-4xl">
            Catalogo publico
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
            Produtos revisados e publicados pela equipe SCX Laser. Itens em
            rascunho, ocultos, custos e dados de fornecedor nao aparecem aqui.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-12">
        {publicProducts.length > 0 ? (
          <PublicCatalogBrowser
            categories={publicCategories}
            products={publicProducts}
            whatsappNumber={siteSettings.whatsappNumber}
            siteOrigin={siteOrigin}
          />
        ) : (
          <div className="rounded-md border border-white/10 bg-[#0d0f10] p-6">
            <h2 className="text-xl font-black text-white">
              Nenhum produto publicado ainda
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              O catalogo publico sera preenchido quando produtos importados forem
              revisados e publicados pela area administrativa.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

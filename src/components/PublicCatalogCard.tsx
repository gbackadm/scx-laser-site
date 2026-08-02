"use client";

import { ChevronDown, MessageCircle, PackageCheck, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  PublicCatalogPriceTier,
  PublicCatalogProduct,
} from "@/domain/catalog/publicTypes";

type PublicCatalogCardProps = {
  product: PublicCatalogProduct;
  whatsappNumber: string;
  siteOrigin: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function whatsappUrl(
  product: PublicCatalogProduct,
  intent: "retail" | "corporate",
  whatsappNumber: string,
  siteOrigin: string,
) {
  const productUrl = `${siteOrigin}/catalogo/${encodeURIComponent(product.id)}`;
  const message =
    intent === "retail"
      ? `Ola, tenho interesse em comprar poucas unidades do produto ${product.title}. Referencia: ${product.sku}. Link: ${productUrl}`
      : `Ola, gostaria de um orcamento para lote do produto ${product.title}. Referencia: ${product.sku}. Link: ${productUrl}`;

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function tierByMinQuantity(
  tiers: PublicCatalogPriceTier[],
  minQuantity: number,
) {
  return tiers.find((tier) => {
    const firstNumber = Number(tier.label.match(/\d+/)?.[0] ?? 0);
    return firstNumber >= minQuantity;
  });
}

export function PublicCatalogCard({
  product,
  whatsappNumber,
  siteOrigin,
}: PublicCatalogCardProps) {
  const router = useRouter();
  const [isTableOpen, setIsTableOpen] = useState(false);
  const retailTiers = product.tiers.filter((tier) => tier.profile === "retail");
  const corporateTiers = product.tiers.filter(
    (tier) => tier.profile === "corporate",
  );
  const firstTier = retailTiers[0];
  const tenPlusTier = tierByMinQuantity(retailTiers, 6) ?? retailTiers.at(-1);

  return (
    <article
      tabIndex={0}
      role="link"
      onClick={() => router.push(`/catalogo/${encodeURIComponent(product.id)}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          router.push(`/catalogo/${encodeURIComponent(product.id)}`);
        }
      }}
      className="cursor-pointer overflow-hidden rounded-md border border-white/10 bg-[#0d0f10] transition hover:border-laser/60 hover:bg-[#111314] focus:outline-none focus:ring-2 focus:ring-laser/70"
    >
      <div className="aspect-[4/3] bg-black/35">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-zinc-500">
            Imagem em revisao
          </div>
        )}
      </div>

      <div className="grid gap-4 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
            {product.category}
          </p>
          <h2 className="mt-2 text-lg font-black text-white">{product.title}</h2>
          {product.description ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-300">
              {product.description}
            </p>
          ) : null}
        </div>

        <div>
          <p className="text-sm font-bold text-zinc-300">A partir de</p>
          <p className="mt-1 text-2xl font-black text-white">
            {currencyFormatter.format(product.priceInCents / 100)}
          </p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-emerald-200">
            Desconto para quantidades
          </p>
        </div>

        <div className="grid gap-2">
          {firstTier ? (
            <div className="flex items-center justify-between rounded border border-white/10 bg-black/25 px-3 py-2 text-sm">
              <span className="font-bold text-zinc-300">1 un.</span>
              <span className="font-black text-white">
                {currencyFormatter.format(firstTier.unitPriceInCents / 100)}
              </span>
            </div>
          ) : null}
          {tenPlusTier ? (
            <div className="flex items-center justify-between rounded border border-white/10 bg-black/25 px-3 py-2 text-sm">
              <span className="font-bold text-zinc-300">10+ un.</span>
              <span className="font-black text-white">
                {currencyFormatter.format(tenPlusTier.unitPriceInCents / 100)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded border border-white/10 bg-black/25 px-3 py-2 text-sm">
            <span className="font-bold text-zinc-300">50+ un.</span>
            <span className="font-black text-white">sob orcamento</span>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsTableOpen((current) => !current);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          className="inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-laser transition hover:text-red-200"
        >
          Ver tabela completa
          <ChevronDown
            size={15}
            className={isTableOpen ? "rotate-180 transition" : "transition"}
          />
        </button>

        {isTableOpen ? (
          <div className="grid gap-4 rounded border border-white/10 bg-black/25 p-3 text-sm">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
                Varejo / Marketplace
              </p>
              <div className="grid gap-1">
                {retailTiers.map((tier) => (
                  <div
                    key={tier.label}
                    className="flex justify-between gap-4 text-zinc-300"
                  >
                    <span>{tier.label}</span>
                    <span className="font-black text-emerald-200">
                      {currencyFormatter.format(tier.unitPriceInCents / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
                Lote / Corporativo
              </p>
              <div className="grid gap-1">
                {corporateTiers.map((tier) => (
                  <div
                    key={tier.label}
                    className="flex justify-between gap-4 text-zinc-300"
                  >
                    <span>{tier.label}</span>
                    <span className="font-black text-emerald-200">
                      {currencyFormatter.format(tier.unitPriceInCents / 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href={whatsappUrl(product, "retail", whatsappNumber, siteOrigin)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-white/12 px-3 text-xs font-black uppercase text-zinc-200 transition hover:border-laser hover:text-white"
          >
            <ShoppingBag size={16} />
            Poucas unidades
          </a>
          <a
            href={whatsappUrl(product, "corporate", whatsappNumber, siteOrigin)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-3 text-xs font-black uppercase text-white"
          >
            <PackageCheck size={16} />
            Orcar lote
          </a>
        </div>

        <a
          href={whatsappUrl(product, "retail", whatsappNumber, siteOrigin)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="inline-flex items-center justify-center gap-2 text-xs font-bold text-zinc-500 transition hover:text-zinc-200"
        >
          <MessageCircle size={14} />
          Tirar duvida no WhatsApp
        </a>
      </div>
    </article>
  );
}

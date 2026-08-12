"use client";

import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  PublicCatalogCard,
} from "@/components/PublicCatalogCard";
import type { PublicCatalogProduct } from "@/domain/catalog/publicTypes";
import { matchesSearchText } from "@/lib/search";

type PublicCatalogBrowserProps = {
  categories: string[];
  products: PublicCatalogProduct[];
  whatsappNumber: string;
  siteOrigin: string;
};

const pageSizes = ["10", "20", "30", "Todos"] as const;
const sortOptions = [
  "Nome",
  "Menor preco",
  "Maior preco",
  "Categoria",
] as const;

type PageSize = (typeof pageSizes)[number];
type SortOption = (typeof sortOptions)[number];

export function PublicCatalogBrowser({
  categories,
  products,
  whatsappNumber,
  siteOrigin,
}: PublicCatalogBrowserProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [sort, setSort] = useState<SortOption>("Nome");
  const [pageSize, setPageSize] = useState<PageSize>("10");
  const [page, setPage] = useState(1);

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesSearch = matchesSearchText(search, [
        product.title,
        product.description,
        product.category,
        product.sku,
        product.supplierSku,
      ]);
      const matchesCategory =
        category === "Todas" || product.category === category;

      return matchesSearch && matchesCategory;
    });

    return [...filtered].sort((firstProduct, secondProduct) => {
      if (sort === "Menor preco") {
        return firstProduct.priceInCents - secondProduct.priceInCents;
      }

      if (sort === "Maior preco") {
        return secondProduct.priceInCents - firstProduct.priceInCents;
      }

      if (sort === "Categoria") {
        return firstProduct.category.localeCompare(secondProduct.category, "pt-BR", {
          sensitivity: "base",
        });
      }

      return firstProduct.title.localeCompare(secondProduct.title, "pt-BR", {
        sensitivity: "base",
      });
    });
  }, [category, products, search, sort]);

  const itemsPerPage = pageSize === "Todos" ? filteredProducts.length : Number(pageSize);
  const pageCount =
    pageSize === "Todos"
      ? 1
      : Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visibleProducts =
    pageSize === "Todos"
      ? filteredProducts
      : filteredProducts.slice(
          (currentPage - 1) * itemsPerPage,
          currentPage * itemsPerPage,
        );

  function resetToFirstPage() {
    setPage(1);
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-md border border-white/10 bg-[#0d0f10] p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_190px_150px]">
          <label className="relative block">
            <span className="sr-only">Buscar produto</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetToFirstPage();
              }}
              placeholder="Buscar por produto ou descricao"
              className="h-11 w-full rounded border border-white/12 bg-black/35 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-laser"
            />
          </label>

          <label className="relative block">
            <span className="sr-only">Filtrar categoria</span>
            <SlidersHorizontal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                resetToFirstPage();
              }}
              className="h-11 w-full appearance-none rounded border border-white/12 bg-black/35 pl-10 pr-3 text-sm text-white outline-none transition focus:border-laser"
            >
              <option value="Todas">Categoria: todas</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  Categoria: {item}
                </option>
              ))}
            </select>
          </label>

          <label className="relative block">
            <span className="sr-only">Ordenar produtos</span>
            <ArrowUpDown className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortOption);
                resetToFirstPage();
              }}
              className="h-11 w-full appearance-none rounded border border-white/12 bg-black/35 pl-10 pr-3 text-sm text-white outline-none transition focus:border-laser"
            >
              {sortOptions.map((item) => (
                <option key={item} value={item}>
                  Ordenar: {item.toLowerCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="sr-only">Quantidade exibida</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(event.target.value as PageSize);
                resetToFirstPage();
              }}
              className="h-11 w-full rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none transition focus:border-laser"
            >
              {pageSizes.map((item) => (
                <option key={item} value={item}>
                  Mostrar: {item === "Todos" ? "todos" : item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
          <span>{filteredProducts.length} produto(s) encontrado(s)</span>
          <span>
            Pagina {currentPage} de {pageCount}
          </span>
        </div>
      </div>

      {visibleProducts.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => (
            <PublicCatalogCard
              key={product.id}
              product={product}
              whatsappNumber={whatsappNumber}
              siteOrigin={siteOrigin}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-white/10 bg-[#0d0f10] p-6">
          <h2 className="text-xl font-black text-white">
            Nenhum produto encontrado
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
            Ajuste a busca ou escolha outra categoria para ver mais opcoes.
          </p>
        </div>
      )}

      {pageSize !== "Todos" && filteredProducts.length > itemsPerPage ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="inline-flex min-h-11 items-center gap-2 rounded border border-white/12 px-4 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white disabled:text-zinc-600"
          >
            <ChevronLeft size={17} />
            Anterior
          </button>
          <span className="rounded border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-zinc-400">
            {currentPage} / {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            className="inline-flex min-h-11 items-center gap-2 rounded border border-white/12 px-4 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white disabled:text-zinc-600"
          >
            Proxima
            <ChevronRight size={17} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { CreateDraftButton } from "@/components/admin/CreateDraftButton";

type ImportProduct = {
  id: string;
  raw_name: string;
  raw_category: string | null;
  raw_image_urls: string[] | null;
  external_id: string;
  suggested_price_amount_in_cents: number | null;
  stock_available: number | null;
  import_status: string;
  catalog_import_status?: string | null;
  catalog_publication_status?: string | null;
  catalog_product_id?: string | null;
};

type ImportProductsTableProps = {
  canEditCatalog: boolean;
  products: ImportProduct[];
};

const pageSizes = ["10", "25", "50", "100", "Todos"] as const;

type SortKey = "product" | "category" | "purchasePrice" | "stock" | "status";
type SortDirection = "asc" | "desc";

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function importStatusLabel(status: string) {
  if (status === "mapped") {
    return "No catalogo";
  }

  if (status === "pending_review") {
    return "Pendente";
  }

  if (status === "ignored") {
    return "Ignorado";
  }

  if (status === "sync_error") {
    return "Erro";
  }

  return status;
}

function catalogStatusLabel(status: string | null | undefined) {
  if (status === "published") {
    return "Publicado";
  }

  if (status === "hidden") {
    return "Oculto";
  }

  if (status === "out_of_stock") {
    return "Sem estoque";
  }

  if (status === "draft") {
    return "Rascunho";
  }

  return null;
}

function ProductThumbnail({
  imageUrl,
  name,
}: {
  imageUrl?: string;
  name: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="h-14 w-14 rounded border border-white/10 bg-black/40 object-cover"
      />
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded border border-white/10 bg-black/40 text-[0.62rem] font-black uppercase leading-3 text-zinc-600">
      Sem
      <br />
      imagem
    </div>
  );
}

export function ImportProductsTable({
  canEditCatalog,
  products,
}: ImportProductsTableProps) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<(typeof pageSizes)[number]>("25");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  function toggleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = products.filter((product) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        product.raw_name.toLowerCase().includes(normalizedSearch) ||
        product.external_id.toLowerCase().includes(normalizedSearch);

      return matchesSearch;
    });

    if (!sortKey) {
      return filtered;
    }

    return [...filtered].sort((firstProduct, secondProduct) => {
      const directionMultiplier = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "purchasePrice") {
        return (
          ((firstProduct.suggested_price_amount_in_cents ?? 0) -
            (secondProduct.suggested_price_amount_in_cents ?? 0)) *
          directionMultiplier
        );
      }

      if (sortKey === "stock") {
        return (
          ((firstProduct.stock_available ?? 0) -
            (secondProduct.stock_available ?? 0)) *
          directionMultiplier
        );
      }

      const firstValue =
        sortKey === "product"
          ? firstProduct.raw_name
          : sortKey === "category"
            ? firstProduct.raw_category ?? "Sem categoria"
            : importStatusLabel(
                firstProduct.catalog_import_status ?? firstProduct.import_status,
              );
      const secondValue =
        sortKey === "product"
          ? secondProduct.raw_name
          : sortKey === "category"
            ? secondProduct.raw_category ?? "Sem categoria"
            : importStatusLabel(
                secondProduct.catalog_import_status ?? secondProduct.import_status,
              );

      return (
        firstValue.localeCompare(secondValue, "pt-BR", { sensitivity: "base" }) *
        directionMultiplier
      );
    });
  }, [products, search, sortDirection, sortKey]);

  const visibleProducts = useMemo(() => {
    if (pageSize === "Todos") {
      return filteredProducts;
    }

    const itemsPerPage = Number(pageSize);
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * itemsPerPage;

    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [currentPage, filteredProducts, pageSize]);
  const totalPages =
    pageSize === "Todos"
      ? 1
      : Math.max(1, Math.ceil(filteredProducts.length / Number(pageSize)));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  function SortHeader({ label, value }: { label: string; value: SortKey }) {
    const isActive = sortKey === value;

    return (
      <button
        type="button"
        onClick={() => toggleSort(value)}
        className={`inline-flex w-full items-center gap-2 font-black transition hover:text-white ${
          isActive ? "text-white" : "text-zinc-400"
        }`}
        aria-sort={
          isActive
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <span>{label}</span>
        <span className="w-3 text-[0.62rem]">
          {isActive ? (sortDirection === "asc" ? "^" : "v") : ""}
        </span>
      </button>
    );
  }

  return (
    <section className="rounded-md border border-white/10 bg-[#0d0f10] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 p-5 sm:p-6">
        <h2 className="text-xl font-black">Revisao antes de publicar</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          Produtos importados ficam como fornecedor pendente. Criar rascunho
          leva o item para o catalogo como nao publicado.
        </p>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-200">
          Lista filtrada: somente itens importados com estoque disponivel e ao
          menos uma imagem.
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_170px]">
          <label className="relative block">
            <span className="sr-only">Buscar importados</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar produto ou codigo"
              className="h-11 w-full rounded border border-white/12 bg-black/40 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-laser"
            />
          </label>
          <label className="block">
            <span className="sr-only">Quantidade exibida</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(event.target.value as (typeof pageSizes)[number]);
                setCurrentPage(1);
              }}
              className="h-11 w-full rounded border border-white/12 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-laser"
            >
              {pageSizes.map((item) => (
                <option key={item} value={item}>
                  Mostrar: {item === "Todos" ? "todos" : item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="grid gap-3 p-4 xl:hidden">
        {visibleProducts.map((product) => {
          const rowId = `produto-${String(product.id).replace(
            /[^a-zA-Z0-9_-]/g,
            "",
          )}`;
          const effectiveImportStatus =
            product.catalog_import_status ?? product.import_status;
          const productCatalogStatus = catalogStatusLabel(
            product.catalog_publication_status,
          );
          const hasCatalogProduct = Boolean(product.catalog_product_id);

          return (
            <article
              key={product.id}
              id={rowId}
              className="scroll-mt-28 rounded border border-white/10 bg-black/25 p-4"
            >
              <div className="flex gap-3">
                <ProductThumbnail
                  imageUrl={product.raw_image_urls?.[0]}
                  name={product.raw_name}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-black leading-5 text-white">
                    {product.raw_name}
                  </h2>
                  <p className="mt-1 break-all text-xs text-zinc-500">
                    {product.external_id}
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Categoria
                  </dt>
                  <dd className="mt-1 font-bold text-zinc-200">
                    {product.raw_category ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Compra
                  </dt>
                  <dd className="mt-1 font-bold text-zinc-200">
                    {formatMoney(product.suggested_price_amount_in_cents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Estoque
                  </dt>
                  <dd className="mt-1 font-bold text-zinc-200">
                    {product.stock_available ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Status
                  </dt>
                  <dd className="mt-1 grid gap-1 font-bold text-zinc-200">
                    <span>{importStatusLabel(effectiveImportStatus)}</span>
                    {productCatalogStatus ? (
                      <span className="text-[0.68rem] uppercase tracking-[0.12em] text-zinc-500">
                        Catalogo: {productCatalogStatus}
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                <CreateDraftButton
                  disabled={!canEditCatalog}
                  label={hasCatalogProduct ? "Atualizar catalogo" : "Criar rascunho"}
                  supplierProductId={product.id}
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-zinc-400">
            <tr>
              <th className="px-5 py-4 font-black"><SortHeader label="Produto" value="product" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Categoria" value="category" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Preco compra" value="purchasePrice" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Estoque" value="stock" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Status" value="status" /></th>
              <th className="px-5 py-4 text-right font-black">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {visibleProducts.map((product) => {
              const rowId = `produto-${String(product.id).replace(
                /[^a-zA-Z0-9_-]/g,
                "",
              )}`;
              const effectiveImportStatus =
                product.catalog_import_status ?? product.import_status;
              const productCatalogStatus = catalogStatusLabel(
                product.catalog_publication_status,
              );
              const hasCatalogProduct = Boolean(product.catalog_product_id);

              return (
                <tr key={product.id} id={rowId} className="scroll-mt-28">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <ProductThumbnail
                        imageUrl={product.raw_image_urls?.[0]}
                        name={product.raw_name}
                      />
                      <div>
                        <div className="font-bold text-white">
                          {product.raw_name}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {product.external_id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    {product.raw_category ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    {formatMoney(product.suggested_price_amount_in_cents)}
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    {product.stock_available ?? "-"}
                  </td>
                  <td className="px-5 py-4 text-zinc-300">
                    <div className="grid gap-1">
                      <span>{importStatusLabel(effectiveImportStatus)}</span>
                      {productCatalogStatus ? (
                        <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-zinc-500">
                          Catalogo: {productCatalogStatus}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <CreateDraftButton
                      disabled={!canEditCatalog}
                      label={
                        hasCatalogProduct ? "Atualizar catalogo" : "Criar rascunho"
                      }
                      supplierProductId={product.id}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {visibleProducts.length} de {filteredProducts.length} produto(s) importado(s)
          exibido(s).
        </div>
        {pageSize !== "Todos" ? (
          <div className="flex items-center gap-2 text-zinc-300">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage <= 1}
              className="h-8 rounded border border-white/12 px-3 font-bold transition hover:border-laser hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="min-w-24 text-center font-bold">
              Pagina {safeCurrentPage} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={safeCurrentPage >= totalPages}
              className="h-8 rounded border border-white/12 px-3 font-bold transition hover:border-laser hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Proxima
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

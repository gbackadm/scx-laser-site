"use client";

import { Edit3, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { CatalogDeleteButton } from "@/components/admin/CatalogDeleteButton";
import { CatalogEditModal } from "@/components/admin/CatalogEditModal";
import { CatalogSyncButton } from "@/components/admin/CatalogSyncButton";
import { CatalogStatusSelect } from "@/components/admin/CatalogStatusSelect";
import type {
  AdminProductBatchPrice,
  AdminProduct,
  AdminProductStatus,
} from "@/domain/catalog/viewModels";
import { publicationStatusLabel } from "@/domain/catalog/viewModels";
import { matchesSearchText } from "@/lib/search";

const statuses: Array<AdminProductStatus | "Todos"> = [
  "Todos",
  "Publicado",
  "Oculto",
  "Rascunho",
  "Sem estoque",
];

const pageSizes = ["10", "25", "50", "100", "Todos"] as const;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function rowAnchor(productId: string) {
  return `produto-${productId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function batchRangeLabel(
  minQuantity: number,
  nextMinQuantity: number | undefined,
  index: number,
) {
  if (index === 0 && minQuantity <= 1) {
    return "1 un.";
  }

  if (!nextMinQuantity) {
    return `${minQuantity}+ un.`;
  }

  return `${minQuantity}-${nextMinQuantity - 1} un.`;
}

function formatBatchPriceRange(prices: AdminProductBatchPrice[]) {
  if (prices.length === 0) {
    return "-";
  }

  const firstPrice = prices[0].unitPriceInCents;
  const lastPrice = prices[prices.length - 1].unitPriceInCents;

  return `${currencyFormatter.format(firstPrice / 100)} -> ${currencyFormatter.format(
    lastPrice / 100,
  )}`;
}

function PriceTierRows({ prices }: { prices: AdminProductBatchPrice[] }) {
  return (
    <div className="grid gap-1">
      {prices.map((batchPrice, index) => (
        <div
          key={batchPrice.minQuantity}
          className="flex min-w-44 justify-between gap-3"
        >
          <span>
            {batchRangeLabel(
              batchPrice.minQuantity,
              prices[index + 1]?.minQuantity,
              index,
            )}
          </span>
          <span className="font-black text-emerald-200">
            {currencyFormatter.format(batchPrice.unitPriceInCents / 100)}
          </span>
        </div>
      ))}
    </div>
  );
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

type CatalogPanelProps = {
  categories: string[];
  products: AdminProduct[];
  sourceLabel: string;
  canEdit: boolean;
  canPublish: boolean;
  canSync: boolean;
};

type SortKey = "product" | "category" | "supplier" | "price" | "stock" | "status";
type SortDirection = "asc" | "desc";

export function CatalogPanel({
  categories,
  products: initialProducts,
  sourceLabel,
  canEdit,
  canPublish,
  canSync,
}: CatalogPanelProps) {
  const [catalogProducts, setCatalogProducts] = useState(initialProducts);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [status, setStatus] = useState<(typeof statuses)[number]>("Todos");
  const [pageSize, setPageSize] = useState<(typeof pageSizes)[number]>("25");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [openPriceProductId, setOpenPriceProductId] = useState<string | null>(null);
  const [deletedProductIds, setDeletedProductIds] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

  const products = useMemo(() => {
    const filteredProducts = catalogProducts.filter((product) => {
      if (deletedProductIds.has(product.catalogId)) {
        return false;
      }

      const matchesSearch = matchesSearchText(search, [
        product.name,
        product.description,
        product.category,
        product.supplier,
        product.sku,
        product.scxSku,
      ]);
      const matchesCategory = category === "Todas" || product.category === category;
      const matchesStatus = status === "Todos" || product.status === status;

      return matchesSearch && matchesCategory && matchesStatus;
    });

    if (!sortKey) {
      return filteredProducts;
    }

    return [...filteredProducts].sort((firstProduct, secondProduct) => {
      const directionMultiplier = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "price") {
        return (
          ((firstProduct.costInCents ?? firstProduct.priceInCents) -
            (secondProduct.costInCents ?? secondProduct.priceInCents)) *
          directionMultiplier
        );
      }

      if (sortKey === "stock") {
        return (firstProduct.stock - secondProduct.stock) * directionMultiplier;
      }

      const firstValue =
        sortKey === "product"
          ? firstProduct.name
          : sortKey === "category"
            ? firstProduct.category
            : sortKey === "supplier"
              ? firstProduct.supplier
              : firstProduct.status;
      const secondValue =
        sortKey === "product"
          ? secondProduct.name
          : sortKey === "category"
            ? secondProduct.category
            : sortKey === "supplier"
              ? secondProduct.supplier
              : secondProduct.status;

      return (
        firstValue.localeCompare(secondValue, "pt-BR", { sensitivity: "base" }) *
        directionMultiplier
      );
    });
  }, [catalogProducts, category, deletedProductIds, search, sortDirection, sortKey, status]);

  const visibleProducts = useMemo(() => {
    if (pageSize === "Todos") {
      return products;
    }

    const itemsPerPage = Number(pageSize);
    const totalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * itemsPerPage;

    return products.slice(startIndex, startIndex + itemsPerPage);
  }, [currentPage, pageSize, products]);
  const totalPages =
    pageSize === "Todos" ? 1 : Math.max(1, Math.ceil(products.length / Number(pageSize)));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  function SortHeader({
    label,
    value,
    align = "left",
  }: {
    label: string;
    value: SortKey;
    align?: "left" | "right";
  }) {
    const isActive = sortKey === value;

    return (
      <button
        type="button"
        onClick={() => toggleSort(value)}
        className={`inline-flex w-full items-center gap-2 font-black transition hover:text-white ${
          align === "right" ? "justify-end" : "justify-start"
        } ${isActive ? "text-white" : "text-zinc-400"}`}
        aria-sort={
          isActive
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <span>{label}</span>
        <span className="w-3 text-[0.62rem]">{isActive ? (sortDirection === "asc" ? "^" : "v") : ""}</span>
      </button>
    );
  }

  return (
    <section className="rounded-md border border-white/10 bg-[#0d0f10] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
              Catalogo
            </p>
            <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
              Produtos e gravacoes
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
              Catalogo administrativo preparado para banco local, publicacao e
              futura API autenticada.
            </p>
            <p className="mt-2 max-w-2xl text-xs font-bold uppercase tracking-[0.12em] text-emerald-200">
              Lista completa para revisar produtos publicados, inativos e pendentes.
            </p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
              Origem: {sourceLabel}
            </p>
          </div>

          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <CatalogSyncButton
              disabled={!canSync}
              syncAll
              onSynced={(result) => {
                if (result.products) {
                  setCatalogProducts(result.products);
                  setDeletedProductIds(new Set());
                  if (editingProduct) {
                    const updatedEditingProduct = result.products.find(
                      (product) => product.catalogId === editingProduct.catalogId,
                    );

                    if (updatedEditingProduct) {
                      setEditingProduct(updatedEditingProduct);
                    }
                  }
                }
              }}
            />
            <a
              href="/admin/catalogo/novo"
              className={`inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/12 px-4 text-sm font-bold transition ${
                canEdit
                  ? "text-zinc-300 hover:border-laser hover:text-white"
                  : "pointer-events-none bg-white/[0.03] text-zinc-500"
              }`}
              title={canEdit ? "Criar produto manual" : "Sem permissao para criar"}
            >
              <Plus size={17} />
              Novo produto
            </a>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_190px_170px]">
          <label className="relative block">
            <span className="sr-only">Buscar produtos</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar nome, descricao, categoria, fornecedor ou codigo"
              className="h-11 w-full rounded border border-white/12 bg-black/40 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-laser"
            />
          </label>

          <label className="relative block">
            <span className="sr-only">Filtrar por categoria</span>
            <SlidersHorizontal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setCurrentPage(1);
              }}
              className="h-11 w-full appearance-none rounded border border-white/12 bg-black/40 pl-10 pr-3 text-sm text-white outline-none transition focus:border-laser"
            >
              <option value="Todas">Categoria: todas</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  Categoria: {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="sr-only">Filtrar por status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as (typeof statuses)[number]);
                setCurrentPage(1);
              }}
              className="h-11 w-full rounded border border-white/12 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-laser"
            >
              {statuses.map((item) => (
                <option key={item} value={item}>
                  Status: {item === "Todos" ? "todos" : item}
                </option>
              ))}
            </select>
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
          const anchor = rowAnchor(product.catalogId);
          const retailPrices = product.batchPrices.filter(
            (batchPrice) => batchPrice.minQuantity < 50,
          );
          const corporatePrices = product.batchPrices.filter(
            (batchPrice) => batchPrice.minQuantity >= 50,
          );
          const isPriceOpen = openPriceProductId === product.catalogId;

          return (
            <article
              key={product.catalogId}
              id={anchor}
              className="scroll-mt-28 rounded border border-white/10 bg-black/25 p-4"
            >
              <div className="flex gap-3">
                <ProductThumbnail
                  imageUrl={product.primaryImageUrl}
                  name={product.name}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-black leading-5 text-white">
                    {product.name}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Codigo SCX: {product.scxSku ?? "-"}
                  </p>
                  <p className="text-xs text-zinc-600">Fornecedor: {product.sku}</p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Categoria
                  </dt>
                  <dd className="mt-1 font-bold text-zinc-200">
                    {product.category}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Estoque
                  </dt>
                  <dd className="mt-1 font-bold text-zinc-200">{product.stock}</dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Fornecedor
                  </dt>
                  <dd className="mt-1 font-bold text-zinc-200">
                    {product.supplier}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                    Base
                  </dt>
                  <dd className="mt-1 font-bold text-zinc-100">
                    {currencyFormatter.format(product.priceInCents / 100)}
                  </dd>
                </div>
              </dl>

              {product.batchPrices.length > 0 ? (
                <div className="mt-4 rounded border border-white/10 bg-black/25 p-3 text-xs font-bold">
                  <div className="grid gap-1 text-zinc-500">
                    <div>
                      Varejo:{" "}
                      <span className="text-emerald-200">
                        {formatBatchPriceRange(retailPrices)}
                      </span>
                    </div>
                    <div>
                      Lote:{" "}
                      <span className="text-emerald-200">
                        {formatBatchPriceRange(corporatePrices)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenPriceProductId((current) =>
                        current === product.catalogId ? null : product.catalogId,
                      )
                    }
                    className="mt-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-laser"
                  >
                    {isPriceOpen ? "Ocultar faixas" : "Ver faixas"}
                  </button>
                  {isPriceOpen ? (
                    <div className="mt-3 grid gap-3 text-zinc-400">
                      <div>
                        <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                          Varejo / Marketplace
                        </p>
                        <PriceTierRows prices={retailPrices} />
                      </div>
                      <div>
                        <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                          Lote / Corporativo
                        </p>
                        <PriceTierRows prices={corporatePrices} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4">
                <CatalogStatusSelect
                  canEdit={canEdit}
                  productId={product.catalogId}
                  productName={product.name}
                  status={product.publicationStatus}
                  onChanged={(nextStatus) => {
                    setCatalogProducts((current) =>
                      current.map((item) =>
                        item.catalogId === product.catalogId
                          ? {
                              ...item,
                              publicationStatus: nextStatus,
                              status: publicationStatusLabel(nextStatus),
                            }
                          : item,
                      ),
                    );
                  }}
                />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setEditingProduct(product)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-white/12 px-3 text-xs font-bold text-zinc-300 transition hover:border-laser hover:text-white"
                  title={canEdit ? "Editar produto" : "Visualizar produto"}
                >
                  <Edit3 size={14} />
                  {canEdit ? "Editar" : "Ver"}
                </button>
                {canEdit ? (
                  <CatalogSyncButton
                    disabled={!canSync || !product.supplierProductId}
                    productId={product.catalogId}
                    onSynced={(result) => {
                      if (result.product) {
                        setCatalogProducts((current) =>
                          current.map((item) =>
                            item.catalogId === result.product?.catalogId
                              ? result.product
                              : item,
                          ),
                        );

                        if (editingProduct?.catalogId === result.product.catalogId) {
                          setEditingProduct(result.product);
                        }
                      }
                    }}
                  />
                ) : null}
                {canEdit ? (
                  <CatalogDeleteButton
                    productId={product.catalogId}
                    productName={product.name}
                    onDeleted={(productId) => {
                      setDeletedProductIds((current) => {
                        const next = new Set(current);
                        next.add(productId);
                        return next;
                      });
                    }}
                  />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-zinc-400">
            <tr>
              <th className="px-5 py-4 font-black"><SortHeader label="Produto" value="product" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Categoria" value="category" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Fornecedor" value="supplier" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Preco" value="price" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Estoque" value="stock" /></th>
              <th className="px-5 py-4 font-black"><SortHeader label="Status" value="status" /></th>
              <th className="px-5 py-4 text-right font-black">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {visibleProducts.map((product) => {
              const anchor = rowAnchor(product.catalogId);
              const retailPrices = product.batchPrices.filter(
                (batchPrice) => batchPrice.minQuantity < 50,
              );
              const corporatePrices = product.batchPrices.filter(
                (batchPrice) => batchPrice.minQuantity >= 50,
              );
              const isPriceOpen = openPriceProductId === product.catalogId;

              return (
              <tr
                key={product.catalogId}
                id={anchor}
                className="scroll-mt-28 transition hover:bg-white/[0.025]"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <ProductThumbnail
                      imageUrl={product.primaryImageUrl}
                      name={product.name}
                    />
                    <div>
                      <div className="font-bold text-white">{product.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Codigo SCX: {product.scxSku ?? "-"}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-600">
                        Fornecedor: {product.sku}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-zinc-300">{product.category}</td>
                <td className="px-5 py-4 text-zinc-300">{product.supplier}</td>
                <td className="px-5 py-4">
                  <div className="grid gap-1">
                    <div className="font-semibold text-zinc-100">
                      Base: {currencyFormatter.format(product.priceInCents / 100)}
                    </div>
                    {product.batchPrices.length > 0 ? (
                      <>
                        <div className="text-[0.68rem] font-bold text-zinc-500">
                          Varejo:{" "}
                          <span className="text-emerald-200">
                            {formatBatchPriceRange(retailPrices)}
                          </span>
                        </div>
                        <div className="text-[0.68rem] font-bold text-zinc-500">
                          Lote:{" "}
                          <span className="text-emerald-200">
                            {formatBatchPriceRange(corporatePrices)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenPriceProductId((current) =>
                              current === product.catalogId
                                ? null
                                : product.catalogId,
                            )
                          }
                          className="mt-1 w-fit text-[0.68rem] font-black uppercase tracking-[0.12em] text-laser transition hover:text-red-200"
                        >
                          {isPriceOpen ? "Ocultar faixas" : "Ver faixas"}
                        </button>
                        {isPriceOpen ? (
                          <div className="mt-2 grid gap-3 rounded border border-white/10 bg-black/35 p-3 text-[0.72rem] font-bold text-zinc-400">
                            <div>
                              <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                                Varejo / Marketplace
                              </p>
                              <PriceTierRows prices={retailPrices} />
                            </div>
                            <div>
                              <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
                                Lote / Corporativo
                              </p>
                              <PriceTierRows prices={corporatePrices} />
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </td>
                <td className="px-5 py-4 text-zinc-300">{product.stock}</td>
                <td className="px-5 py-4">
                  <CatalogStatusSelect
                    canEdit={canEdit}
                    productId={product.catalogId}
                    productName={product.name}
                    status={product.publicationStatus}
                    onChanged={(nextStatus) => {
                      setCatalogProducts((current) =>
                        current.map((item) =>
                          item.catalogId === product.catalogId
                            ? {
                                ...item,
                                publicationStatus: nextStatus,
                                status: publicationStatusLabel(nextStatus),
                              }
                            : item,
                        ),
                      );
                    }}
                  />
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingProduct(product)}
                      className="inline-flex h-9 items-center gap-2 rounded border border-white/12 px-3 text-xs font-bold text-zinc-300 transition hover:border-laser hover:text-white"
                      title={canEdit ? "Editar produto" : "Visualizar produto"}
                    >
                      <Edit3 size={14} />
                      {canEdit ? "Editar" : "Ver"}
                    </button>
                    {canEdit ? (
                      <CatalogSyncButton
                        disabled={!canSync || !product.supplierProductId}
                        productId={product.catalogId}
                        onSynced={(result) => {
                          if (result.product) {
                            setCatalogProducts((current) =>
                              current.map((item) =>
                                item.catalogId === result.product?.catalogId
                                  ? result.product
                                  : item,
                              ),
                            );

                            if (
                              editingProduct?.catalogId === result.product.catalogId
                            ) {
                              setEditingProduct(result.product);
                            }
                          }
                        }}
                      />
                    ) : null}
                    {canEdit ? (
                      <CatalogDeleteButton
                        productId={product.catalogId}
                        productName={product.name}
                        onDeleted={(productId) => {
                          setDeletedProductIds((current) => {
                            const next = new Set(current);
                            next.add(productId);
                            return next;
                          });
                        }}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {visibleProducts.length} de {products.length} item(ns) exibido(s).
          Publicacao exige papel owner ou manager; seller permanece somente leitura.
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

      {editingProduct ? (
        <CatalogEditModal
          canPublish={canPublish}
          categories={categories}
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={(updatedProduct) => {
            setCatalogProducts((current) =>
              current.map((product) =>
                product.catalogId === updatedProduct.catalogId
                  ? updatedProduct
                  : product,
              ),
            );
            setEditingProduct(null);
          }}
        />
      ) : null}
    </section>
  );
}

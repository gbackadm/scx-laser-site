import Link from "next/link";
import { notFound } from "next/navigation";

import { logoutAdmin } from "@/app/admin/actions";
import {
  publishCatalogProduct,
  unpublishCatalogProduct,
  updateCatalogProduct,
} from "@/app/admin/catalogo/actions";
import { AdminNotice } from "@/components/admin/AdminNotice";
import { CatalogSyncButton } from "@/components/admin/CatalogSyncButton";
import { requireAdminSession } from "@/domain/auth/session";
import {
  getCatalogProductForAdmin,
  getSupplierProductDetailsForAdmin,
  listCatalogCategoriesForAdmin,
} from "@/domain/catalog/adminRepository";
import { getCatalogAccess } from "@/domain/catalog/access";
import { formatMoneyInput } from "@/domain/catalog/money";
import { roleCan } from "@/domain/catalog/permissions";

export const metadata = {
  title: "Admin SCX Laser | Editar produto",
};

export const dynamic = "force-dynamic";

type EditCatalogProductPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    erro?: string;
    salvo?: string;
    publicado?: string;
    despublicado?: string;
    criado?: string;
    voltar?: string;
    sincronizado?: string;
  }>;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function statusLabel(status: string) {
  if (status === "published") {
    return "Publicado";
  }

  if (status === "hidden") {
    return "Oculto";
  }

  if (status === "out_of_stock") {
    return "Sem estoque";
  }

  return "Rascunho";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (Array.isArray(value)) {
    const items = value.map(displayValue).filter(Boolean);
    return items.length ? items.join(", ") : null;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => {
        const formatted = displayValue(item);
        return formatted ? `${key}: ${formatted}` : null;
      })
      .filter(Boolean);

    return entries.length ? entries.join(" | ") : null;
  }

  return String(value);
}

function payloadField(payload: unknown, key: string) {
  return isRecord(payload) ? displayValue(payload[key]) : null;
}

function firstVariation(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.variacoes)) {
    return null;
  }

  return isRecord(payload.variacoes[0]) ? payload.variacoes[0] : null;
}

function importedSpecs(payload: unknown) {
  const variation = firstVariation(payload);
  const specs = [
    ["Referencia fornecedor", payloadField(payload, "referencia")],
    ["Referencia variacao", variation ? displayValue(variation.referencia) : null],
    ["NCM", variation ? displayValue(variation.ncm) : null],
    ["Origem faturamento", payloadField(payload, "origem_faturamento")],
    ["Status fornecedor", payloadField(payload, "status")],
    ["Peso", payloadField(payload, "peso")],
    ["Altura", payloadField(payload, "altura")],
    ["Largura", payloadField(payload, "largura")],
    ["Comprimento", payloadField(payload, "comprimento")],
    ["Promocao", payloadField(payload, "promocao")],
    ["Tags", payloadField(payload, "tags")],
    ["Atributos", variation ? displayValue(variation.atributos) : null],
    ["Propriedades", payloadField(payload, "propriedades")],
    ["Propriedades adicionais", payloadField(payload, "propriedades2")],
  ];

  return specs.filter((item): item is [string, string] => Boolean(item[1]));
}

function ImagePreview({
  imageUrl,
  title,
}: {
  imageUrl?: string;
  title: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={title}
        className="h-full w-full rounded object-cover"
      />
    );
  }

  return (
    <div className="flex h-full min-h-[260px] items-center justify-center rounded border border-white/10 bg-black/35 text-center text-sm font-black uppercase tracking-[0.12em] text-zinc-600">
      Sem imagem
    </div>
  );
}

function feedbackMessage(params: Awaited<EditCatalogProductPageProps["searchParams"]>) {
  if (params?.erro === "permissao") {
    return "Seu usuario nao tem permissao para executar esta acao.";
  }

  if (params?.erro === "campos") {
    return "Preencha titulo e categoria antes de salvar.";
  }

  if (params?.erro === "status") {
    return "Use um status valido para salvar o produto.";
  }

  if (params?.erro === "validacao") {
    return "Revise titulo, categoria e preco antes de publicar.";
  }

  if (params?.erro === "sincronizacao") {
    return "Nao foi possivel sincronizar este produto agora.";
  }

  if (params?.salvo) {
    return "Produto salvo. Ele so aparece no catalogo publico quando for publicado.";
  }

  if (params?.publicado) {
    return "Produto publicado no catalogo publico.";
  }

  if (params?.despublicado) {
    return "Produto removido do catalogo publico e mantido oculto.";
  }

  if (params?.criado) {
    return "Rascunho criado a partir do produto importado. Revise antes de publicar.";
  }

  if (params?.sincronizado) {
    return "Produto sincronizado com o fornecedor.";
  }

  return null;
}

export default async function EditCatalogProductPage({
  params,
  searchParams,
}: EditCatalogProductPageProps) {
  const [{ id }, session, resolvedSearchParams] = await Promise.all([
    params,
    requireAdminSession(),
    searchParams,
  ]);
  const canViewCatalog = roleCan(session.role, "catalog:view");

  if (!canViewCatalog) {
    return (
      <main className="min-h-screen bg-[#050606] px-5 py-8 text-white">
        <section className="mx-auto max-w-2xl rounded-md border border-white/10 bg-[#0d0f10] p-6">
          <h1 className="text-2xl font-black">Acesso negado</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Seu usuario nao tem permissao para visualizar o catalogo.
          </p>
        </section>
      </main>
    );
  }

  const [product, categories, auditLog] = await Promise.all([
    getCatalogProductForAdmin(id),
    listCatalogCategoriesForAdmin(),
    getCatalogAccess().listAuditLog(id),
  ]);

  if (!product) {
    notFound();
  }

  const canEditCatalog = roleCan(session.role, "catalog:edit");
  const canPublishCatalog = roleCan(session.role, "catalog:publish");
  const canSyncSupplier = roleCan(session.role, "supplier:import");
  const category = categories.find((item) => item.id === product.categoryId);
  const supplierProduct = await getSupplierProductDetailsForAdmin(
    product.supplierProductId,
  );
  const message = feedbackMessage(resolvedSearchParams);
  const returnAnchor = String(resolvedSearchParams?.voltar ?? "").replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const catalogReturnHref = returnAnchor
    ? `/admin/catalogo#${returnAnchor}`
    : "/admin/catalogo";
  const allImageUrls = Array.from(
    new Set([
      ...product.images.map((image) => image.url),
      ...(supplierProduct?.rawImageUrls ?? []),
    ].filter(Boolean)),
  );
  const mainImageUrl = allImageUrls[0];
  const imageUrls = allImageUrls.join("\n");
  const specs = supplierProduct ? importedSpecs(supplierProduct.rawPayload) : [];

  return (
    <main className="min-h-screen bg-[#050606] text-white">
      <header className="border-b border-white/10 bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <Link href="/admin/catalogo" className="inline-flex items-center gap-3">
            <img
              src="/images/logo-scx-oficial.webp"
              alt="SCX Laser"
              width={96}
              height={64}
              className="h-12 w-[72px] object-contain object-left"
            />
            <span className="text-sm font-black uppercase tracking-[0.16em] text-zinc-200">
              Admin
            </span>
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm">
            <span className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-400">
              {session.name} - {session.role}
            </span>
            <Link
              href="/admin/importacao"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Importacao
            </Link>
            <Link
              href="/admin/catalogo"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Catalogo
            </Link>
            <Link
              href="/catalogo"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Catalogo publico
            </Link>
            <form action={logoutAdmin}>
              <button
                type="submit"
                className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
              >
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 sm:px-8 lg:px-12">
        <AdminNotice message={message} />

        <section className="rounded-md border border-white/10 bg-[#0d0f10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
                Revisao de produto
              </p>
              <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                {product.title}
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Codigo SCX {product.scxSku ?? "-"} - SKU fornecedor {product.sku} - Status atual: {statusLabel(product.publicationStatus)}
              </p>
            </div>
            <div className="rounded border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
              Preco atual:{" "}
              <strong className="text-white">
                {currencyFormatter.format(product.price.amountInCents / 100)}
              </strong>
            </div>
          </div>

          {!canEditCatalog ? (
            <div className="mt-5 rounded border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">
              Seu papel permite visualizar o produto, mas nao editar ou publicar.
            </div>
          ) : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
            <div>
              <div className="aspect-square overflow-hidden rounded-md border border-white/10 bg-black/30">
                <ImagePreview imageUrl={mainImageUrl} title={product.title} />
              </div>

              {allImageUrls.length > 1 ? (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {allImageUrls.slice(1, 9).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square overflow-hidden rounded border border-white/10 bg-black/30 transition hover:border-laser"
                    >
                      <img
                        src={url}
                        alt={`Referencia visual de ${product.title}`}
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid content-start gap-4">
              <div className="rounded-md border border-white/10 bg-black/25 p-4">
                <h2 className="text-lg font-black">Ficha do produto</h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      Titulo
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-100">
                      {product.title}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      Categoria
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-100">
                      {category?.name ?? "Sem categoria"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      Codigo SCX
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-100">
                      {product.scxSku ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      SKU fornecedor
                    </dt>
                    <dd className="mt-1 break-all text-sm font-bold text-zinc-100">
                      {product.sku}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      Preco de venda
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-100">
                      {currencyFormatter.format(product.price.amountInCents / 100)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      Estoque
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-100">
                      {product.stock.quantity}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      Fornecedor
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-100">
                      {supplierProduct?.supplierName ?? "Sem fornecedor vinculado"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                      ID importado
                    </dt>
                    <dd className="mt-1 break-all text-sm font-bold text-zinc-100">
                      {supplierProduct?.externalId ?? "-"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex justify-start">
                  <CatalogSyncButton
                    disabled={!supplierProduct || !canSyncSupplier}
                    productId={product.id}
                  />
                </div>
                <div className="mt-4">
                  <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                    Descricao
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-zinc-300">
                    {product.description ||
                      supplierProduct?.rawDescription ||
                      "Descricao ainda nao informada."}
                  </dd>
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-black/25 p-4">
                <h2 className="text-lg font-black">Dados importados uteis</h2>
                {specs.length > 0 ? (
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    {specs.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                          {label}
                        </dt>
                        <dd className="mt-1 break-words text-sm text-zinc-200">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    O produto importado nao trouxe especificacoes adicionais
                    aproveitaveis alem dos campos principais.
                  </p>
                )}
              </div>
            </div>
          </div>

          <form action={updateCatalogProduct} className="mt-6 grid gap-5">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="returnAnchor" value={returnAnchor} />
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Titulo comercial
                <input
                  name="title"
                  defaultValue={product.title}
                  maxLength={60}
                  disabled={!canEditCatalog}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Categoria
                <input
                  name="categoryName"
                  list="catalog-categories"
                  defaultValue={category?.name ?? ""}
                  disabled={!canEditCatalog}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                />
                <datalist id="catalog-categories">
                  {categories.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </label>
            </div>

            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Descricao
              <textarea
                name="description"
                defaultValue={product.description ?? ""}
                disabled={!canEditCatalog}
                rows={6}
                className="rounded border border-white/12 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-laser disabled:text-zinc-500"
              />
            </label>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Preco de venda
                <input
                  name="price"
                  inputMode="decimal"
                  defaultValue={formatMoneyInput(product.price.amountInCents)}
                  disabled={!canEditCatalog}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Estoque
                <input
                  name="stockQuantity"
                  type="number"
                  min={0}
                  defaultValue={product.stock.quantity}
                  disabled={!canEditCatalog}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Status interno
                <select
                  name="publicationStatus"
                  defaultValue={product.publicationStatus}
                  disabled={!canEditCatalog}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser disabled:text-zinc-500"
                >
                  <option value="draft">Rascunho</option>
                  <option value="hidden">Oculto</option>
                  <option value="out_of_stock">Sem estoque</option>
                  {canPublishCatalog || product.publicationStatus === "published" ? (
                    <option value="published">Publicado</option>
                  ) : null}
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Imagens e referencias publicas
              <textarea
                name="imageUrls"
                defaultValue={imageUrls}
                disabled={!canEditCatalog}
                rows={5}
                placeholder="Uma URL por linha"
                className="rounded border border-white/12 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-laser disabled:text-zinc-500"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!canEditCatalog}
                className="inline-flex min-h-11 items-center justify-center rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-5 text-sm font-black uppercase text-white shadow-[0_0_24px_rgba(225,18,27,0.18)] transition disabled:border-white/12 disabled:bg-white/[0.03] disabled:text-zinc-500"
              >
                Salvar revisao
              </button>
              <Link
                href={catalogReturnHref}
                className="inline-flex min-h-11 items-center justify-center rounded border border-white/12 px-5 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white"
              >
                Voltar
              </Link>
            </div>
          </form>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-md border border-white/10 bg-[#0d0f10] p-5 sm:p-6">
            <h2 className="text-xl font-black">Publicacao</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Publicar ou despublicar exige papel owner ou manager. Produtos
              importados nunca sao publicados automaticamente.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <form action={publishCatalogProduct}>
                <input type="hidden" name="productId" value={product.id} />
                <button
                  type="submit"
                  disabled={!canPublishCatalog}
                  className="rounded border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100 transition hover:border-emerald-200 disabled:border-white/12 disabled:bg-white/[0.03] disabled:text-zinc-600"
                >
                  Publicar
                </button>
              </form>
              <form action={unpublishCatalogProduct}>
                <input type="hidden" name="productId" value={product.id} />
                <button
                  type="submit"
                  disabled={!canPublishCatalog}
                  className="rounded border border-white/12 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white disabled:text-zinc-600"
                >
                  Despublicar
                </button>
              </form>
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-[#0d0f10] p-5 sm:p-6">
            <h2 className="text-xl font-black">Auditoria recente</h2>
            <div className="mt-4 grid gap-3">
              {auditLog.length > 0 ? (
                auditLog.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="rounded border border-white/10 bg-black/30 p-3">
                    <p className="text-sm font-bold text-zinc-100">{entry.summary}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {entry.action} - {new Date(entry.occurredAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-400">
                  Nenhuma alteracao registrada para este produto ainda.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

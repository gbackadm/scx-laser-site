import Link from "next/link";

import { logoutAdmin } from "@/app/admin/actions";
import { createManualCatalogProduct } from "@/app/admin/catalogo/actions";
import { AdminNotice } from "@/components/admin/AdminNotice";
import { requireAdminSession } from "@/domain/auth/session";
import { getCatalogAccess } from "@/domain/catalog/access";
import { roleCan } from "@/domain/catalog/permissions";

export const metadata = {
  title: "Admin SCX Laser | Novo produto",
};

export const dynamic = "force-dynamic";

type NewProductPageProps = {
  searchParams?: Promise<{
    erro?: string;
  }>;
};

function feedbackMessage(params: Awaited<NewProductPageProps["searchParams"]>) {
  if (params?.erro === "permissao") {
    return "Seu usuario nao tem permissao para criar produtos.";
  }

  if (params?.erro === "duplicado") {
    return "Ja existe produto com este SKU SCX ou codigo de fornecedor.";
  }

  if (params?.erro === "status") {
    return "Use um status valido.";
  }

  if (params?.erro === "salvar") {
    return "Nao foi possivel salvar o produto agora.";
  }

  if (params?.erro === "campos") {
    return "Preencha todos os campos obrigatorios marcados com asterisco.";
  }

  return null;
}

function RequiredMark() {
  return <span className="text-laser">*</span>;
}

export default async function NewCatalogProductPage({
  searchParams,
}: NewProductPageProps) {
  const [session, params, categories] = await Promise.all([
    requireAdminSession(),
    searchParams,
    getCatalogAccess().listCategories(),
  ]);
  const canEdit = roleCan(session.role, "catalog:edit");
  const canPublish = roleCan(session.role, "catalog:publish");
  const message = feedbackMessage(params);

  if (!canEdit) {
    return (
      <main className="min-h-screen bg-[#050606] px-5 py-8 text-white">
        <section className="mx-auto max-w-2xl rounded-md border border-white/10 bg-[#0d0f10] p-6">
          <h1 className="text-2xl font-black">Acesso negado</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Seu usuario nao tem permissao para criar produtos.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050606] text-white">
      <header className="border-b border-white/10 bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
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
          <nav className="flex flex-wrap gap-2 text-sm md:justify-end">
            <span className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-400">
              {session.name} - {session.role}
            </span>
            <Link
              href="/admin/catalogo"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Catalogo
            </Link>
            <Link
              href="/admin/olist"
              className="rounded border border-white/12 px-3 py-2 font-bold text-zinc-300 transition hover:border-laser hover:text-white"
            >
              Olist
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

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-8 sm:py-6 lg:px-12">
        <AdminNotice />

        {message ? (
          <div className="rounded border border-white/10 bg-[#0d0f10] px-4 py-3 text-sm font-bold text-zinc-100">
            {message}
          </div>
        ) : null}

        <section className="rounded-md border border-white/10 bg-[#0d0f10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
            Catalogo
          </p>
          <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
            Novo produto manual
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            Produtos manuais entram no banco SCX com dados tecnicos completos.
            Depois disso, a simulacao Olist valida o cadastro antes do envio.
          </p>

          <form action={createManualCatalogProduct} className="mt-6 grid gap-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                SKU SCX <RequiredMark />
                <input
                  name="scxSku"
                  required
                  placeholder="SCX-CAN-0007"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Codigo fornecedor <RequiredMark />
                <input
                  name="supplierCode"
                  required
                  placeholder="COD-FORN-001"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Status <RequiredMark />
                <select
                  name="publicationStatus"
                  defaultValue="hidden"
                  required
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                >
                  <option value="hidden">Oculto</option>
                  <option value="out_of_stock">Sem estoque</option>
                  <option value="draft">Rascunho</option>
                  {canPublish ? <option value="published">Publicado</option> : null}
                </select>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_180px]">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Nome do produto <RequiredMark />
                <input
                  name="title"
                  required
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Categoria <RequiredMark />
                <input
                  name="categoryName"
                  required
                  list="manual-product-categories"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                />
                <datalist id="manual-product-categories">
                  {categories.map((category) => (
                    <option key={category.id} value={category.name} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                NCM <RequiredMark />
                <input
                  name="ncm"
                  required
                  placeholder="9608.10.00"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Descricao
              <textarea
                name="description"
                rows={5}
                className="rounded border border-white/12 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-laser"
              />
            </label>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Fornecedor <RequiredMark />
                <input
                  name="supplierName"
                  required
                  placeholder="Fornecedor / fabrica"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200 lg:col-span-2">
                ID fornecedor no Olist/Tiny <RequiredMark />
                <input
                  name="olistSupplierId"
                  required
                  placeholder="Codigo/ID do fornecedor ja cadastrado no Olist/Tiny"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Preco de venda <RequiredMark />
                <input
                  name="price"
                  required
                  inputMode="decimal"
                  placeholder="49,90"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Custo <RequiredMark />
                <input
                  name="cost"
                  required
                  inputMode="decimal"
                  placeholder="22,00"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Estoque <RequiredMark />
                <input
                  name="stockQuantity"
                  required
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Peso kg <RequiredMark />
                <input
                  name="weightKg"
                  required
                  inputMode="decimal"
                  placeholder="0,010"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Altura cm <RequiredMark />
                <input
                  name="heightCm"
                  required
                  inputMode="decimal"
                  placeholder="14"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Largura cm <RequiredMark />
                <input
                  name="widthCm"
                  required
                  inputMode="decimal"
                  placeholder="2"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-zinc-200">
                Comprimento cm <RequiredMark />
                <input
                  name="lengthCm"
                  required
                  inputMode="decimal"
                  placeholder="2"
                  className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-laser"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Imagens, uma URL por linha <RequiredMark />
              <textarea
                name="imageUrls"
                required
                rows={5}
                className="rounded border border-white/12 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-laser"
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <Link
                href="/admin/catalogo"
                className="inline-flex min-h-11 items-center justify-center rounded border border-white/12 px-5 text-sm font-bold text-zinc-300 transition hover:border-laser hover:text-white"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-5 text-sm font-black uppercase text-white shadow-[0_0_24px_rgba(225,18,27,0.18)]"
              >
                Criar produto
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

import Image from "next/image";
import Link from "next/link";

import { logoutAdmin } from "@/app/admin/actions";
import { AdminNotice } from "@/components/admin/AdminNotice";
import { ManualProductForm } from "@/components/admin/ManualProductForm";
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
    return "Ja existe produto com um dos SKUs ou codigos informados.";
  }

  if (params?.erro === "status") {
    return "Use um status valido.";
  }

  if (params?.erro === "salvar") {
    return "Nao foi possivel salvar o produto agora.";
  }

  if (params?.erro === "campos") {
    return "Revise os campos obrigatorios, as fotos e todas as variacoes.";
  }

  return null;
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
            <Image
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
            Cadastre os dados comuns, as fotos e todas as combinacoes vendaveis
            do produto.
          </p>

          <ManualProductForm
            categories={categories.map((category) => category.name)}
            canPublish={canPublish}
          />
        </section>
      </div>
    </main>
  );
}

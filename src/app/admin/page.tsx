import { ArrowRight, Boxes, CircleAlert, PackageCheck, Store, Truck } from "lucide-react";
import Link from "next/link";

import { requireAdminSession } from "@/domain/auth/session";
import { getAdminDashboardSnapshot } from "@/domain/admin/dashboard";
import { roleCan } from "@/domain/catalog/permissions";

export const metadata = { title: "Admin SCX Laser | Visao geral" };
export const dynamic = "force-dynamic";

function formatDate(value?: string) {
  if (!value) return "Ainda nao executado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export default async function AdminIndex() {
  const session = await requireAdminSession();
  const snapshot = await getAdminDashboardSnapshot();
  const canEdit = roleCan(session.role, "catalog:edit");
  const canIntegrate = roleCan(session.role, "supplier:import");

  const metrics = [
    { label: "Produtos", value: snapshot.catalog.total, detail: `${snapshot.catalog.published} publicados`, icon: Boxes },
    { label: "Variacoes", value: snapshot.catalog.variants, detail: `${snapshot.catalog.variantsWithoutImages} sem imagem`, icon: PackageCheck },
    { label: "Inativos", value: snapshot.catalog.inactive, detail: `${snapshot.catalog.drafts} rascunhos`, icon: CircleAlert },
    { label: "No Olist", value: snapshot.olist.mapped, detail: `${snapshot.olist.pending} pendentes`, icon: Store },
  ];

  return (
    <main className="min-h-screen bg-[#050606] px-4 py-6 text-white sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-laser">Operacao SCX</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">Visao geral</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Ola, {session.name}. Estes dados refletem o banco atual.
            </p>
          </div>
          {canEdit ? (
            <Link
              href="/admin/catalogo/novo"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-laser px-4 text-sm font-black text-white transition hover:bg-red-600"
            >
              Novo produto
              <ArrowRight size={17} />
            </Link>
          ) : null}
        </div>

        <section className="grid border-b border-white/10 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="border-b border-white/10 px-1 py-5 sm:px-5 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:first:pl-1 xl:last:border-r-0">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-bold text-zinc-400">{metric.label}</p>
                  <Icon size={18} className="text-zinc-600" />
                </div>
                <p className="mt-3 text-3xl font-black text-white">{metric.value}</p>
                <p className="mt-1 text-xs text-zinc-500">{metric.detail}</p>
              </div>
            );
          })}
        </section>

        <div className="grid gap-8 py-7 xl:grid-cols-[1.15fr_0.85fr]">
          <section>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-black">Integracoes</h2>
              {canIntegrate ? (
                <Link href="/admin/importacao" className="text-sm font-bold text-zinc-400 transition hover:text-white">
                  Configurar
                </Link>
              ) : null}
            </div>
            <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
              <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex items-start gap-3">
                  <Truck size={19} className="mt-0.5 text-zinc-500" />
                  <div>
                    <p className="font-bold">Asia Import</p>
                    <p className="mt-1 text-xs text-zinc-500">Ultima execucao: {formatDate(snapshot.supplier.lastSyncAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className={snapshot.supplier.enabled ? "text-emerald-300" : "text-zinc-500"}>
                    {snapshot.supplier.enabled ? `Ativa a cada ${snapshot.supplier.intervalMinutes} min` : "Desativada"}
                  </span>
                  <span className="text-zinc-600">Pagina {snapshot.supplier.nextPage}</span>
                </div>
              </div>
              <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex items-start gap-3">
                  <Store size={19} className="mt-0.5 text-zinc-500" />
                  <div>
                    <p className="font-bold">Olist</p>
                    <p className="mt-1 text-xs text-zinc-500">Ultima execucao: {formatDate(snapshot.olist.lastSyncAt)}</p>
                  </div>
                </div>
                <span className={snapshot.olist.enabled ? "text-sm text-emerald-300" : "text-sm text-zinc-500"}>
                  {snapshot.olist.enabled
                    ? snapshot.olist.automaticEnabled ? "Ativa e automatica" : "Ativa, envio manual"
                    : "Desativada"}
                </span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black">Atencao</h2>
            <dl className="mt-4 divide-y divide-white/10 border-y border-white/10 text-sm">
              <div className="flex items-center justify-between gap-4 py-4">
                <dt className="text-zinc-400">Produtos bloqueados na origem</dt>
                <dd className="font-black text-amber-200">{snapshot.supplier.blocked}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <dt className="text-zinc-400">Variacoes sem imagem</dt>
                <dd className={snapshot.catalog.variantsWithoutImages ? "font-black text-amber-200" : "font-black text-emerald-300"}>
                  {snapshot.catalog.variantsWithoutImages}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-4">
                <dt className="text-zinc-400">Registros da Asia</dt>
                <dd className="font-black text-white">{snapshot.supplier.total}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}

import { ArrowRight, BarChart3, CheckCircle2, KeyRound, ListChecks, PackagePlus, Radio, Siren } from "lucide-react";
import Link from "next/link";

import { MercadoLivrePublishPanel } from "@/components/admin/MercadoLivrePublishPanel";
import { MercadoLivreListingsPanel } from "@/components/admin/MercadoLivreListingsPanel";
import { MercadoLivreMetricsPanel } from "@/components/admin/MercadoLivreMetricsPanel";
import { MercadoLivreOperationsPanel } from "@/components/admin/MercadoLivreOperationsPanel";
import { AdminNotice } from "@/components/admin/AdminNotice";
import { requireAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import {
  getMercadoLivreSyncOverview,
  getMercadoLivreConnection,
} from "@/domain/mercadoLivre/repository";
import {
  getMercadoLivreDraft,
  listMercadoLivreCandidates,
} from "@/domain/mercadoLivre/publishingRepository";
import { getMercadoLivreMetrics, listManagedMercadoLivreListings } from "@/domain/mercadoLivre/listingsRepository";
import { getGlobalPricingRule } from "@/domain/pricing/rules";

export const metadata = { title: "Admin SCX Laser | Mercado Livre" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ conectado?: string; erro?: string; testada?: string; aba?: string; productId?: string; periodo?: string }>;
};

const metricPeriods = new Set([7, 30, 60, 90, 150]);

function formatDate(value: string | null) {
  if (!value) return "Nao registrado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

const errorMessages: Record<string, string> = {
  permissao: "Seu usuario nao tem permissao para conectar marketplaces.",
  autorizacao_negada: "A autorizacao foi cancelada no Mercado Livre.",
  callback_invalido: "O retorno do Mercado Livre chegou incompleto.",
  estado_invalido: "A tentativa expirou ou ja foi usada. Inicie a conexao novamente.",
  troca_token: "O Mercado Livre nao concluiu a conexao. Tente novamente.",
  teste_conexao: "A conta nao respondeu ao teste. Reconecte para renovar a autorizacao.",
};

export default async function MercadoLivrePage({ searchParams }: PageProps) {
  const [session, params, connection, syncOverview, candidates, pricingRule] = await Promise.all([
    requireAdminSession(),
    searchParams,
    getMercadoLivreConnection(),
    getMercadoLivreSyncOverview(),
    listMercadoLivreCandidates(),
    getGlobalPricingRule(),
  ]);
  const canConnect = roleCan(session.role, "supplier:import");
  const configured = Boolean(
    process.env.MERCADO_LIVRE_CLIENT_ID &&
    process.env.MERCADO_LIVRE_CLIENT_SECRET &&
    process.env.MERCADO_LIVRE_REDIRECT_URI &&
    process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY,
  );
  const expired = connection?.expiresAt ? new Date(connection.expiresAt) <= new Date() : false;
  const syncFailures = syncOverview.failedEvents + syncOverview.failedOffers;
  const activeTab = params?.aba === "anuncios" ? "anuncios" : params?.aba === "metricas" ? "metricas" : params?.aba === "operacao" ? "operacao" : "publicar";
  const requestedPeriod = Number(params?.periodo ?? 30);
  const metricPeriod = activeTab === "metricas" && metricPeriods.has(requestedPeriod) ? requestedPeriod : 30;
  const requestedProduct = candidates.find((candidate) => candidate.id === params?.productId);
  const pilot = requestedProduct ?? candidates.find((candidate) => candidate.profileStatus === "reviewed") ?? candidates[0];
  const canPublish = Boolean(connection && roleCan(session.role, "catalog:publish"));
  const [initialDraft, listings, metrics] = await Promise.all([
    activeTab === "publicar" && pilot ? getMercadoLivreDraft(pilot.id) : null,
    activeTab === "anuncios" && canPublish ? listManagedMercadoLivreListings() : [],
    (activeTab === "metricas" || activeTab === "operacao") && canPublish ? getMercadoLivreMetrics(metricPeriod) : null,
  ]);

  return (
    <main className="min-h-screen min-w-0 bg-[#050606] px-4 py-6 text-white sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto min-w-0 max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-laser">Marketplace direto</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">Mercado Livre</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Conta, autorizacao e eventos da integracao oficial da SCX.
            </p>
          </div>
          {canConnect && configured ? (
            <div className="flex flex-wrap gap-2">
              {connection ? (
                <Link
                  href="/admin/api/mercado-livre/conexao"
                  prefetch={false}
                  className="inline-flex min-h-11 items-center justify-center rounded border border-white/15 px-4 text-sm font-black text-zinc-200 transition hover:border-white/30 hover:text-white"
                >
                  Testar conexao
                </Link>
              ) : null}
              <Link
                href="/admin/api/mercado-livre/oauth/connect"
                prefetch={false}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-laser px-4 text-sm font-black text-white transition hover:bg-red-600"
              >
                {connection ? "Reconectar conta" : "Conectar conta"}
                <ArrowRight size={17} />
              </Link>
            </div>
          ) : null}
        </div>

        <AdminNotice
          message={params?.conectado ? "Conta conectada com seguranca." : params?.testada ? "Conexao testada com sucesso." : params?.erro ? errorMessages[params.erro] ?? "Nao foi possivel concluir a operacao." : null}
          tone={params?.erro ? "error" : "success"}
        />

        <section className="mt-7 grid border-y border-white/10 md:grid-cols-3">
          <div className="border-b border-white/10 px-1 py-5 md:border-b-0 md:border-r md:px-5 md:first:pl-1">
            <KeyRound size={18} className="text-zinc-500" />
            <p className="mt-3 text-sm font-bold text-zinc-400">Aplicacao</p>
            <p className={`mt-1 font-black ${configured ? "text-emerald-300" : "text-amber-200"}`}>
              {configured ? "Configurada" : "Configuracao incompleta"}
            </p>
          </div>
          <div className="border-b border-white/10 px-1 py-5 md:border-b-0 md:border-r md:px-5">
            <CheckCircle2 size={18} className="text-zinc-500" />
            <p className="mt-3 text-sm font-bold text-zinc-400">Conta</p>
            <p className={`mt-1 font-black ${connection && !expired ? "text-emerald-300" : "text-zinc-300"}`}>
              {connection ? connection.nickname ?? `Usuario ${connection.userId}` : "Ainda nao conectada"}
            </p>
          </div>
          <div className="px-1 py-5 md:px-5">
            <Radio size={18} className="text-zinc-500" />
            <p className="mt-3 text-sm font-bold text-zinc-400">Sincronizacao</p>
            <p className={`mt-1 font-black ${syncFailures ? "text-red-300" : "text-emerald-300"}`}>
              {syncFailures ? `${syncFailures} falha(s) para revisar` : "Automatica e em dia"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {syncOverview.lastStockSyncAt
                ? `Ultima conferencia: ${formatDate(syncOverview.lastStockSyncAt)}`
                : "Primeira conferencia ainda nao concluida"}
            </p>
          </div>
        </section>

        <section className="py-7">
          <h2 className="text-lg font-black">Estado da conexao</h2>
          <dl className="mt-4 divide-y divide-white/10 border-y border-white/10 text-sm">
            <div className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr]">
              <dt className="text-zinc-500">Status</dt>
              <dd className="font-bold text-zinc-100">
                {!connection ? "Aguardando autorizacao" : expired ? "Token expirado, renovacao pendente" : "Autorizada"}
              </dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr]">
              <dt className="text-zinc-500">Conta Mercado Livre</dt>
              <dd className="font-bold text-zinc-100">{connection?.userId ?? "Nao identificada"}</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr]">
              <dt className="text-zinc-500">Conectada em</dt>
              <dd className="font-bold text-zinc-100">{formatDate(connection?.connectedAt ?? null)}</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr]">
              <dt className="text-zinc-500">Token atual valido ate</dt>
              <dd className="font-bold text-zinc-100">{formatDate(connection?.expiresAt ?? null)}</dd>
            </div>
          </dl>
        </section>
        {canPublish ? (
          <>
            <nav id="painel-ml" className="mb-7 flex w-full max-w-full scroll-mt-4 gap-1 overflow-x-auto border-b border-white/10" aria-label="Mercado Livre">
              <Link href="/admin/mercado-livre#painel-ml" className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-black transition ${activeTab === "publicar" ? "border-laser text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}><PackagePlus size={17} /> Preparar publicacao</Link>
              <Link href="/admin/mercado-livre?aba=anuncios#painel-ml" className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-black transition ${activeTab === "anuncios" ? "border-laser text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}><ListChecks size={17} /> Anuncios publicados</Link>
              <Link href="/admin/mercado-livre?aba=metricas#painel-ml" className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-black transition ${activeTab === "metricas" ? "border-laser text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}><BarChart3 size={17} /> Metricas</Link>
              <Link href="/admin/mercado-livre?aba=operacao#painel-ml" className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-black transition ${activeTab === "operacao" ? "border-laser text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}><Siren size={17} /> Operacao</Link>
            </nav>
            {activeTab === "publicar" ? (
              <MercadoLivrePublishPanel candidates={candidates} initialDraft={initialDraft} initialProductId={pilot?.id} commercialRules={{
                minProfitInCents: pricingRule.marketplaceMinProfitAmountInCents,
                minReturnPercentage: pricingRule.marketplaceMinReturnPercentage,
                maxProductCostInCents: pricingRule.marketplaceMaxProductCostAmountInCents,
                operationalCostInCents: pricingRule.marketplaceOperationalCostAmountInCents,
                taxReservePercentage: pricingRule.marketplaceTaxReservePercentage,
                lowStockWarningThreshold: pricingRule.marketplaceLowStockWarningThreshold,
              }} />
            ) : activeTab === "anuncios" ? <MercadoLivreListingsPanel listings={listings} /> : activeTab === "operacao" && metrics ? <MercadoLivreOperationsPanel metrics={metrics} syncOverview={syncOverview} /> : metrics ? <MercadoLivreMetricsPanel metrics={metrics} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

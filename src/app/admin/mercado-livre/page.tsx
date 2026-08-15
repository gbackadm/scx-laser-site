import { ArrowRight, CheckCircle2, CircleAlert, KeyRound, Radio } from "lucide-react";
import Link from "next/link";

import { requireAdminSession } from "@/domain/auth/session";
import { roleCan } from "@/domain/catalog/permissions";
import {
  countPendingMercadoLivreNotifications,
  getMercadoLivreConnection,
} from "@/domain/mercadoLivre/repository";

export const metadata = { title: "Admin SCX Laser | Mercado Livre" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ conectado?: string; erro?: string; testada?: string }>;
};

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
  const [session, params, connection, pending] = await Promise.all([
    requireAdminSession(),
    searchParams,
    getMercadoLivreConnection(),
    countPendingMercadoLivreNotifications(),
  ]);
  const canConnect = roleCan(session.role, "supplier:import");
  const configured = Boolean(
    process.env.MERCADO_LIVRE_CLIENT_ID &&
    process.env.MERCADO_LIVRE_CLIENT_SECRET &&
    process.env.MERCADO_LIVRE_REDIRECT_URI &&
    process.env.MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY,
  );
  const expired = connection?.expiresAt ? new Date(connection.expiresAt) <= new Date() : false;

  return (
    <main className="min-h-screen bg-[#050606] px-4 py-6 text-white sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-5xl">
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
                  className="inline-flex min-h-11 items-center justify-center rounded border border-white/15 px-4 text-sm font-black text-zinc-200 transition hover:border-white/30 hover:text-white"
                >
                  Testar conexao
                </Link>
              ) : null}
              <Link
                href="/admin/api/mercado-livre/oauth/connect"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-laser px-4 text-sm font-black text-white transition hover:bg-red-600"
              >
                {connection ? "Reconectar conta" : "Conectar conta"}
                <ArrowRight size={17} />
              </Link>
            </div>
          ) : null}
        </div>

        {params?.conectado ? (
          <div className="mt-5 flex items-center gap-3 border-y border-emerald-400/25 bg-emerald-950/20 px-4 py-3 text-sm font-bold text-emerald-200">
            <CheckCircle2 size={18} /> Conta conectada com seguranca.
          </div>
        ) : null}
        {params?.testada ? (
          <div className="mt-5 flex items-center gap-3 border-y border-emerald-400/25 bg-emerald-950/20 px-4 py-3 text-sm font-bold text-emerald-200">
            <CheckCircle2 size={18} /> Conexao testada com sucesso.
          </div>
        ) : null}
        {params?.erro ? (
          <div className="mt-5 flex items-center gap-3 border-y border-red-400/25 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-200">
            <CircleAlert size={18} /> {errorMessages[params.erro] ?? "Nao foi possivel concluir a operacao."}
          </div>
        ) : null}

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
            <p className="mt-3 text-sm font-bold text-zinc-400">Eventos aguardando</p>
            <p className="mt-1 font-black text-white">{pending}</p>
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
      </div>
    </main>
  );
}

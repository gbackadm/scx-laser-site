"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  PlayCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import { useState, useTransition } from "react";

import { saveOlistSettings } from "@/app/admin/olist/actions";
import type {
  AdminOlistRun,
  AdminOlistSettings,
  AdminOlistSimulation,
} from "@/domain/olist/repository";

function formatDateTime(value?: string) {
  if (!value) return "Nao agendada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

const runStatusLabels: Record<string, string> = {
  completed: "Concluido",
  failed: "Falhou",
  running: "Em andamento",
};

const triggerLabels: Record<string, string> = {
  admin: "Painel",
  schedule: "Rotina",
  script: "Sistema",
};

type OlistSimulationResult = {
  ok?: boolean;
  message?: string;
  simulation?: AdminOlistSimulation;
};

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "warn";
}) {
  const valueColor =
    tone === "good"
      ? "text-emerald-200"
      : tone === "warn"
        ? "text-amber-200"
        : "text-white";

  return (
    <div className="rounded border border-white/10 bg-black/25 p-4">
      <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </dt>
      <dd className={`mt-2 text-2xl font-black ${valueColor}`}>{value}</dd>
    </div>
  );
}

export function OlistSimulationPanel({
  settings,
  runs,
}: {
  settings: AdminOlistSettings;
  runs: AdminOlistRun[];
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<AdminOlistSimulation | null>(null);

  return (
    <section className="grid gap-5">
      <details className="group order-2 rounded-md border border-white/10 bg-[#0d0f10] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
              Configuracao
            </p>
            <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
              Regras do conector
            </h2>
          </div>
          <span className="flex items-center gap-3">
            <span className={settings.isEnabled ? "text-sm font-bold text-emerald-300" : "text-sm font-bold text-zinc-500"}>
              {settings.isEnabled ? "Ativo" : "Desativado"}
            </span>
            <ChevronDown size={18} className="text-zinc-500 transition group-open:rotate-180" />
          </span>
        </summary>
        <form action={saveOlistSettings} className="grid gap-5 border-t border-white/10 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Origem fiscal
              <input
                name="defaultOrigin"
                defaultValue={settings.defaultOrigin}
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Produtos por chamada
              <input
                name="batchSize"
                type="number"
                min={1}
                max={20}
                defaultValue={settings.batchSize}
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Chamadas por minuto
              <input
                name="batchCallsPerMinute"
                type="number"
                min={1}
                max={5}
                defaultValue={settings.batchCallsPerMinute}
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Intervalo automatico
              <select
                name="autoSyncIntervalMinutes"
                defaultValue={settings.autoSyncIntervalMinutes}
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
              >
                <option value={60}>A cada hora</option>
                <option value={360}>A cada 6 horas</option>
                <option value={720}>A cada 12 horas</option>
                <option value={1440}>Diario</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex min-h-11 items-center gap-3 rounded border border-white/10 bg-black/25 px-3 text-sm font-bold text-zinc-200">
              <input
                name="isEnabled"
                type="checkbox"
                defaultChecked={settings.isEnabled}
                className="h-4 w-4 accent-red-600"
              />
              Conector Olist ativo
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded border border-white/10 bg-black/25 px-3 text-sm font-bold text-zinc-200">
              <input
                name="autoSyncEnabled"
                type="checkbox"
                defaultChecked={settings.autoSyncEnabled}
                className="h-4 w-4 accent-red-600"
              />
              Rotina automatica
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded border border-white/10 bg-black/25 px-3 text-sm font-bold text-zinc-200">
              <input
                name="requireManualSimulationBeforeSend"
                type="checkbox"
                defaultChecked={settings.requireManualSimulationBeforeSend}
                className="h-4 w-4 accent-red-600"
              />
              Exigir simulacao antes do envio manual
            </label>
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Acao automatica
              <select
                name="autoSyncMode"
                defaultValue={settings.autoSyncMode}
                className="h-11 rounded border border-white/12 bg-black/35 px-3 text-sm text-white outline-none focus:border-laser"
              >
                <option value="simulation">Simular e registrar</option>
                <option value="send">Enviar automaticamente</option>
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              Proxima rotina: {formatDateTime(settings.nextAutoSyncAfter)}
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-5 text-sm font-black uppercase text-white shadow-[0_0_24px_rgba(225,18,27,0.18)]"
            >
              Salvar configuracao
            </button>
          </div>
        </form>
      </details>

      <div className="order-1 rounded-md border border-white/10 bg-[#0d0f10] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
              Olist / Tiny
            </p>
            <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
              Envio de produtos
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              A simulacao mostra o lote e os bloqueios. O envio manual e a
              rotina automatica usam exatamente as mesmas validacoes.
            </p>
          </div>

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                try {
                  const response = await fetch("/admin/api/olist/simular", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({}),
                  });
                  const result = (await response.json().catch(() => null)) as
                    | OlistSimulationResult
                    | null;

                  setMessage(
                    result?.message ??
                      `Nao foi possivel simular. Codigo ${response.status}.`,
                  );

                  if (response.ok && result?.ok && result.simulation) {
                    setSimulation(result.simulation);
                  }
                } catch {
                  setMessage("Nao foi possivel simular agora.");
                }
              });
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-emerald-300/35 px-4 text-sm font-black text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-400/10 disabled:border-white/12 disabled:text-zinc-600"
          >
            {isPending ? (
              <RefreshCw size={17} className="animate-spin" />
            ) : (
              <PlayCircle size={17} />
            )}
            {isPending ? "Simulando..." : "Simular envio"}
          </button>
        </div>

        {message ? (
          <div className="mt-4 rounded border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-zinc-200">
            {message}
          </div>
        ) : null}
      </div>

      {simulation ? (
        <div className="grid gap-5 p-5 sm:p-6">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Avaliados" value={simulation.selectedProducts} />
            <Metric
              label="Elegiveis"
              value={simulation.eligibleProducts}
              tone="good"
            />
            <Metric
              label="Bloqueados"
              value={simulation.blockedProducts}
              tone={simulation.blockedProducts > 0 ? "warn" : "good"}
            />
            <Metric label="Chamadas" value={simulation.estimatedApiCalls} />
            <Metric label="Criar" value={simulation.creates} />
            <Metric label="Atualizar" value={simulation.updates} />
            <Metric
              label="Ativos"
              value={simulation.willBeActive}
              tone="good"
            />
            <Metric
              label="Inativos"
              value={simulation.willBeInactive}
              tone="warn"
            />
          </dl>

          <div className="rounded border border-white/10 bg-black/25 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={17} className="text-emerald-200" />
              <h2 className="text-lg font-black">Regra de estoque</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Minimo para ficar ativo no canal:{" "}
              <span className="font-black text-white">
                {simulation.stockMinQuantity} un.
              </span>{" "}
              Produtos abaixo disso entram no Olist como inativos.
            </p>
          </div>

          {Object.keys(simulation.blockedByReason).length > 0 ? (
            <div className="rounded border border-amber-300/20 bg-amber-400/5 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={17} className="text-amber-200" />
                <h2 className="text-lg font-black">Bloqueios</h2>
              </div>
              <div className="mt-3 grid gap-2 text-sm font-bold text-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(simulation.blockedByReason).map(([reason, count]) => (
                  <div
                    key={reason}
                    className="flex justify-between gap-3 rounded border border-white/10 bg-black/25 px-3 py-2"
                  >
                    <span>{reason}</span>
                    <span className="text-amber-200">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded border border-white/10 bg-black/25 p-4">
              <h2 className="text-lg font-black">Amostra de elegiveis</h2>
              <div className="mt-3 grid gap-2 text-sm">
                {simulation.eligibleSamples.map((product) => (
                  <div
                    key={product.id}
                    className="rounded border border-white/10 bg-black/25 p-3"
                  >
                    <div className="font-bold text-white">{product.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {product.scxSku} | Estoque {product.stockQuantity} |{" "}
                      {product.variationCount} variacao(oes) |{" "}
                      {product.olistProductId ? "Atualizar" : "Criar"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border border-white/10 bg-black/25 p-4">
              <h2 className="text-lg font-black">Amostra de bloqueados</h2>
              <div className="mt-3 grid gap-2 text-sm">
                {simulation.blockedSamples.length > 0 ? (
                  simulation.blockedSamples.map((product) => (
                    <div
                      key={product.id}
                      className="rounded border border-white/10 bg-black/25 p-3"
                    >
                      <div className="font-bold text-white">{product.title}</div>
                      <div className="mt-1 text-xs text-amber-200">
                        {product.reasons.join(", ")}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm font-bold text-emerald-200">
                    Nenhum produto bloqueado na simulacao.
                  </p>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={isPending || simulation.eligibleProducts === 0}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                try {
                  const response = await fetch("/admin/api/olist/enviar", {
                    method: "POST",
                  });
                  const result = (await response.json().catch(() => null)) as
                    | OlistSimulationResult
                    | null;

                  setMessage(
                    result?.message ??
                      `Nao foi possivel enviar. Codigo ${response.status}.`,
                  );
                } catch {
                  setMessage("Nao foi possivel enviar os produtos agora.");
                }
              });
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-red-300/45 bg-[linear-gradient(180deg,#ed1b23_0%,#b80f16_100%)] px-4 text-sm font-black text-white transition disabled:border-white/12 disabled:bg-white/[0.03] disabled:text-zinc-500 sm:w-fit"
          >
            {isPending ? <RefreshCw size={17} className="animate-spin" /> : <Send size={17} />}
            {isPending ? "Processando..." : "Enviar elegiveis"}
          </button>
        </div>
      ) : (
        <div className="p-5 text-sm font-bold text-zinc-500 sm:p-6">
          Rode uma simulacao para ver o lote antes de liberar qualquer envio.
        </div>
      )}
      </div>

      <div className="order-3 rounded-md border border-white/10 bg-[#0d0f10] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-laser">
          Historico
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">
          Ultimas execucoes
        </h2>
        <div className="mt-4 grid gap-2">
          {runs.length > 0 ? (
            runs.map((run) => (
              <div
                key={run.id}
                className="grid gap-3 rounded border border-white/10 bg-black/25 p-3 text-sm lg:grid-cols-[1fr_120px_120px_120px_160px]"
              >
                <div>
                  <div className="font-bold text-white">
                    {run.mode === "simulation" ? "Simulacao" : "Envio"} |{" "}
                    {triggerLabels[run.triggerSource] ?? run.triggerSource}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatDateTime(run.createdAt)}
                  </div>
                </div>
                <div className="font-bold text-zinc-300">
                  Elegiveis: {run.eligibleProducts}
                </div>
                <div className="font-bold text-zinc-300">
                  Bloqueados: {run.blockedProducts}
                </div>
                <div className="font-bold text-zinc-300">
                  Ativos: {run.willBeActive}
                </div>
                <div className="font-bold text-zinc-300">
                  Status: {runStatusLabels[run.status] ?? run.status}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm font-bold text-zinc-500">
              Nenhuma execucao registrada ainda.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

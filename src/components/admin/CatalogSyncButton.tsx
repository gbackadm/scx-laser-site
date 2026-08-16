"use client";

import { CircleAlert, RefreshCw, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { AdminNotice } from "@/components/admin/AdminNotice";
import type { AdminProduct } from "@/domain/catalog/viewModels";

export type CatalogSyncResult = {
  ok?: boolean;
  message?: string;
  product?: AdminProduct | null;
  products?: AdminProduct[];
  done?: boolean;
  page?: number;
  totalPages?: number;
  totalCount?: number;
  syncedCount?: number;
  errorCount?: number;
  errors?: string[];
};

type CatalogSyncButtonProps = {
  disabled?: boolean;
  productId?: string;
  syncAll?: boolean;
  onSynced?: (result: CatalogSyncResult) => void;
  compact?: boolean;
};

export function CatalogSyncButton({
  disabled = false,
  productId,
  syncAll = false,
  onSynced,
  compact = false,
}: CatalogSyncButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number; synced: number; failed: number; note?: string } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [showFailures, setShowFailures] = useState(false);

  useEffect(() => {
    if (!syncAll) return;
    fetch("/admin/api/catalogo/sincronizar")
      .then((response) => response.ok ? response.json() : null)
      .then((result: CatalogSyncResult | null) => setFailures(result?.errors ?? []))
      .catch(() => undefined);
  }, [syncAll]);

  return (
    <div className="grid justify-items-stretch gap-1 sm:justify-items-end">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          setMessage(null);
          setFailures([]);
          setShowFailures(false);
          setProgress(syncAll ? { processed: 0, total: 0, synced: 0, failed: 0 } : null);
          startTransition(async () => {
            try {
              let page = 1;
              let totalPages = 1;
              let synced = 0;
              let failed = 0;
              let totalProducts = 0;
              const failureDetails: string[] = [];
              let finalResult: CatalogSyncResult | null = null;

              do {
                let result: CatalogSyncResult | null = null;
                let batchError = `Falha no lote ${page}.`;

                for (let attempt = 1; attempt <= 3 && !result; attempt += 1) {
                  try {
                    const response = await fetch("/admin/api/catalogo/sincronizar", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(syncAll ? { syncAll: true, page } : { productId }),
                    });
                    const responseBody = (await response.json().catch(() => null)) as CatalogSyncResult | null;
                    if (response.ok && responseBody?.ok) {
                      result = responseBody;
                      break;
                    }
                    batchError = responseBody?.message ?? `Falha no lote ${page}.`;
                  } catch (error) {
                    batchError = error instanceof Error ? error.message : `Falha no lote ${page}.`;
                  }

                  if (attempt < 3) {
                    const waitSeconds = attempt * 15;
                    setProgress((current) => current ? { ...current, note: `Lote ${page}: nova tentativa em ${waitSeconds}s` } : current);
                    await new Promise((resolve) => window.setTimeout(resolve, waitSeconds * 1000));
                  }
                }

                if (!result) {
                  if (!syncAll || totalProducts === 0) throw new Error(batchError);
                  const skipped = Math.max(0, Math.min(10, totalProducts - (page - 1) * 10));
                  failed += skipped;
                  failureDetails.push(`Lote ${page}: ${batchError}`);
                  setFailures([...failureDetails]);
                  setProgress({ processed: Math.min(page * 10, totalProducts), total: totalProducts, synced, failed, note: `Lote ${page} nao respondeu; seguindo para o proximo.` });
                  page += 1;
                  continue;
                }
                finalResult = result;

                if (!syncAll) break;
                totalPages = Math.max(1, result.totalPages ?? 1);
                totalProducts = result.totalCount ?? totalPages * 10;
                synced += result.syncedCount ?? 0;
                failed += result.errorCount ?? 0;
                failureDetails.push(...(result.errors ?? []));
                setFailures([...failureDetails]);
                setProgress({ processed: Math.min(page * 10, totalProducts), total: totalProducts, synced, failed });
                page += 1;
              } while (page <= totalPages);

              if (finalResult) {
                if (syncAll) {
                  const persistedResponse = await fetch("/admin/api/catalogo/sincronizar");
                  const persisted = (await persistedResponse.json().catch(() => null)) as CatalogSyncResult | null;
                  const communicationFailures = failureDetails.filter((item) => item.startsWith("Lote "));
                  setFailures([...(persisted?.errors ?? failureDetails), ...communicationFailures]);
                }
                setMessage(syncAll
                  ? `Catalogo atualizado: ${synced} produto(s), ${failed} falha(s).`
                  : finalResult.message ?? "Produto sincronizado.");
                onSynced?.(finalResult);
              }
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Nao foi possivel sincronizar agora.");
            } finally {
              setProgress(null);
            }
          });
        }}
        className={`inline-flex h-9 items-center justify-center gap-2 rounded border border-emerald-300/25 text-xs font-bold text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-400/10 disabled:border-white/12 disabled:text-zinc-600 ${compact ? "w-9 px-0" : "px-3"}`}
        title={syncAll ? "Sincronizar todos os produtos" : "Sincronizar produto"}
      >
        <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
        <span className={compact ? "sr-only" : undefined}>{isPending
          ? progress?.total ? `Sincronizando ${progress.processed}/${progress.total}` : "Preparando..."
          : syncAll
            ? "Sincronizar todos"
            : "Sincronizar"}</span>
      </button>
      {syncAll && progress?.total ? (
        <div className="w-full min-w-48" aria-label={`Sincronizacao: ${progress.processed} de ${progress.total}`}>
          <div className="h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${Math.min(100, (progress.processed / progress.total) * 100)}%` }} /></div>
          <p className="mt-1 text-right text-[0.68rem] font-bold text-zinc-500">{progress.note ?? `${progress.synced} atualizados · ${progress.failed} falhas`}</p>
        </div>
      ) : null}
      {syncAll && failures.length ? (
        <button type="button" onClick={() => setShowFailures(true)} className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded border border-amber-300/35 px-2 text-xs font-black text-amber-200">
          <CircleAlert size={14} /> Ver {failures.length} falha(s)
        </button>
      ) : null}
      <AdminNotice message={message} />
      {showFailures ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="catalog-sync-errors-title">
          <div className="w-full max-w-2xl rounded border border-white/15 bg-[#0d0f10] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase text-amber-300">Sincronizacao do catalogo</p><h2 id="catalog-sync-errors-title" className="mt-2 text-xl font-black text-white">{failures.length} falha(s) registrada(s)</h2></div>
              <button type="button" onClick={() => setShowFailures(false)} title="Fechar" aria-label="Fechar" className="inline-flex h-9 w-9 items-center justify-center rounded border border-white/10 text-zinc-400"><X size={17} /></button>
            </div>
            <div className="mt-5 max-h-[60vh] overflow-y-auto border-y border-white/10">
              {failures.map((failure, index) => <p key={`${failure}-${index}`} className="border-b border-white/10 py-3 text-sm leading-6 text-zinc-300 last:border-b-0">{failure}</p>)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

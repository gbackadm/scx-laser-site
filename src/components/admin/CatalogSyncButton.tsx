"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import type { AdminProduct } from "@/domain/catalog/viewModels";

export type CatalogSyncResult = {
  ok?: boolean;
  message?: string;
  product?: AdminProduct | null;
  products?: AdminProduct[];
};

type CatalogSyncButtonProps = {
  disabled?: boolean;
  productId?: string;
  syncAll?: boolean;
  onSynced?: (result: CatalogSyncResult) => void;
};

export function CatalogSyncButton({
  disabled = false,
  productId,
  syncAll = false,
  onSynced,
}: CatalogSyncButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid justify-items-stretch gap-1 sm:justify-items-end">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const response = await fetch("/admin/api/catalogo/sincronizar", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(syncAll ? { syncAll: true } : { productId }),
              });
              const result = (await response.json().catch(() => null)) as
                | CatalogSyncResult
                | null;

              setMessage(
                result?.message ??
                  `Nao foi possivel sincronizar. Codigo ${response.status}.`,
              );

              if (response.ok && result?.ok) {
                onSynced?.(result);
              }
            } catch {
              setMessage("Nao foi possivel sincronizar agora.");
            }
          });
        }}
        className="inline-flex h-9 items-center justify-center gap-2 rounded border border-emerald-300/25 px-3 text-xs font-bold text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-400/10 disabled:border-white/12 disabled:text-zinc-600"
        title={syncAll ? "Sincronizar todos os produtos" : "Sincronizar produto"}
      >
        <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
        {isPending
          ? "Sincronizando..."
          : syncAll
            ? "Sincronizar todos"
            : "Sincronizar"}
      </button>
      {message ? (
        <span className="max-w-48 text-right text-[0.68rem] font-bold text-zinc-400">
          {message}
        </span>
      ) : null}
    </div>
  );
}

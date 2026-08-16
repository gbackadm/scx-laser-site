"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { AdminNotice } from "@/components/admin/AdminNotice";

type CatalogDeleteButtonProps = {
  productId: string;
  productName: string;
  onDeleted: (productId: string) => void;
  compact?: boolean;
};

export function CatalogDeleteButton({
  productId,
  productName,
  onDeleted,
  compact = false,
}: CatalogDeleteButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid justify-items-stretch gap-1 sm:justify-items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              `Excluir "${productName}" do catalogo? Esta acao nao pode ser desfeita.`,
            )
          ) {
            return;
          }

          setMessage(null);
          startTransition(async () => {
            try {
              const response = await fetch("/admin/api/catalogo/excluir", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ productId }),
              });
              const result = (await response.json().catch(() => null)) as {
                ok?: boolean;
                message?: string;
              } | null;

              if (response.ok && result?.ok) {
                setMessage(result.message ?? "Produto excluido.");
                onDeleted(productId);
                return;
              }

              setMessage(
                result?.message ??
                  `Nao foi possivel excluir agora. Codigo ${response.status}.`,
              );
            } catch {
              setMessage("Nao foi possivel excluir agora.");
            }
          });
        }}
        className={`inline-flex h-9 items-center justify-center gap-2 rounded border border-red-300/25 text-xs font-bold text-red-100 transition hover:border-red-200 hover:bg-red-400/10 disabled:text-zinc-600 ${compact ? "w-9 px-0" : "px-3"}`}
        title="Excluir produto"
      >
        <Trash2 size={14} />
        <span className={compact ? "sr-only" : undefined}>{isPending ? "Excluindo..." : "Excluir"}</span>
      </button>
      <AdminNotice message={message} />
    </div>
  );
}

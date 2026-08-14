"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";

export function OlistProductSyncButton({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid justify-items-stretch gap-1 sm:justify-items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const response = await fetch("/admin/api/olist/produto", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId }),
              });
              const result = (await response.json().catch(() => null)) as
                | { message?: string }
                | null;
              setMessage(
                result?.message ??
                  `Nao foi possivel enviar ao Olist. Codigo ${response.status}.`,
              );
            } catch {
              setMessage("Nao foi possivel enviar ao Olist agora.");
            }
          });
        }}
        className="inline-flex h-9 items-center justify-center gap-2 rounded border border-sky-300/25 px-3 text-xs font-bold text-sky-100 transition hover:border-sky-200 hover:bg-sky-400/10 disabled:border-white/12 disabled:text-zinc-600"
        title="Enviar produto e imagens ao Olist"
      >
        <Send size={14} className={isPending ? "animate-pulse" : ""} />
        {isPending ? "Enviando..." : "Olist"}
      </button>
      {message ? (
        <span className="max-w-48 text-right text-[0.68rem] font-bold text-zinc-400">
          {message}
        </span>
      ) : null}
    </div>
  );
}

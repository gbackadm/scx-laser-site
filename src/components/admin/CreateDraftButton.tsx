"use client";

import { useState, useTransition } from "react";

import { createDraftFromAsiaImportInline } from "@/app/admin/importacao/actions";

type CreateDraftButtonProps = {
  disabled: boolean;
  label?: string;
  supplierProductId: string;
};

export function CreateDraftButton({
  disabled,
  label = "Criar rascunho",
  supplierProductId,
}: CreateDraftButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="grid justify-items-stretch gap-2 sm:justify-items-end">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result =
              await createDraftFromAsiaImportInline(supplierProductId);

            setMessage(result.message);
          });
        }}
        className="rounded border border-white/12 px-3 py-2 text-center text-xs font-bold text-zinc-300 transition hover:border-laser hover:text-white disabled:text-zinc-600"
      >
        {isPending ? "Atualizando..." : label}
      </button>
      {message ? (
        <span className="text-right text-[0.68rem] font-bold text-emerald-200">
          {message}
        </span>
      ) : null}
    </div>
  );
}

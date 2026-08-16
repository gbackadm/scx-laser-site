"use client";

import { useEffect, useState, useTransition } from "react";

import { AdminNotice } from "@/components/admin/AdminNotice";
import type { CatalogPublicationStatus } from "@/domain/catalog/types";

type CatalogStatusSelectProps = {
  canEdit: boolean;
  productId: string;
  productName: string;
  status: CatalogPublicationStatus;
  onChanged?: (status: CatalogPublicationStatus) => void;
};

const statusLabels: Record<CatalogPublicationStatus, string> = {
  draft: "Rascunho",
  hidden: "Oculto",
  out_of_stock: "Sem estoque",
  published: "Publicado",
};

const statusDescriptions: Record<CatalogPublicationStatus, string> = {
  draft: "Rascunho: ainda nao esta visivel nem pronto para envio.",
  hidden: "Oculto: retirado da venda manualmente.",
  out_of_stock: "Sem estoque: inativo pela regra minima de disponibilidade.",
  published: "Publicado: visivel no catalogo; integracoes ainda aplicam validacoes.",
};

function statusDotClass(status: CatalogPublicationStatus) {
  if (status === "published") return "bg-emerald-400 ring-emerald-300/25";
  if (status === "draft") return "bg-amber-400 ring-amber-300/25";
  if (status === "out_of_stock") return "bg-red-400 ring-red-300/25";
  return "bg-zinc-400 ring-zinc-300/20";
}

function statusClass(status: CatalogPublicationStatus) {
  if (status === "published") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100 focus:border-emerald-200";
  }

  if (status === "draft") {
    return "border-amber-300/25 bg-amber-400/10 text-amber-100 focus:border-amber-200";
  }

  if (status === "out_of_stock") {
    return "border-red-300/25 bg-red-400/10 text-red-100 focus:border-red-200";
  }

  return "border-zinc-400/20 bg-zinc-400/10 text-zinc-200 focus:border-laser";
}

export function CatalogStatusSelect({
  canEdit,
  productId,
  productName,
  status,
  onChanged,
}: CatalogStatusSelectProps) {
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [lastSavedStatus, setLastSavedStatus] = useState(status);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedStatus(status);
    setLastSavedStatus(status);
  }, [status]);

  return (
    <div className="grid gap-1">
      <label className="block">
        <span className="sr-only">Alterar status de {productName}</span>
        <span className="flex items-center gap-2">
          <span className="group/status relative inline-flex shrink-0">
            <span
              tabIndex={0}
              role="img"
              title={statusDescriptions[selectedStatus]}
              aria-label={statusDescriptions[selectedStatus]}
              className={`h-2.5 w-2.5 rounded-full ring-4 outline-none ${statusDotClass(
                selectedStatus,
              )}`}
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-30 mb-3 w-64 rounded border border-white/12 bg-zinc-950 px-3 py-2 text-left text-xs font-semibold leading-5 text-zinc-200 opacity-0 shadow-xl transition group-hover/status:opacity-100 group-focus-within/status:opacity-100"
            >
              {statusDescriptions[selectedStatus]}
            </span>
          </span>
          <select
            value={selectedStatus}
            disabled={!canEdit || isPending}
            onChange={(event) => {
              const nextStatus = event.target.value as CatalogPublicationStatus;
              setSelectedStatus(nextStatus);
              setMessage(null);

              startTransition(async () => {
                const response = await fetch("/admin/catalogo/status", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    productId,
                    publicationStatus: nextStatus,
                  }),
                });
                const result = (await response.json()) as {
                  ok: boolean;
                  message: string;
                  publicationStatus?: CatalogPublicationStatus;
                };

                setMessage(result.message);

                if (result.ok) {
                  const savedStatus = result.publicationStatus ?? nextStatus;
                  setSelectedStatus(savedStatus);
                  setLastSavedStatus(savedStatus);
                  onChanged?.(savedStatus);
                } else {
                  setSelectedStatus(lastSavedStatus);
                }
              });
            }}
            className={`h-9 min-w-0 flex-1 rounded border px-3 text-xs font-bold outline-none transition disabled:text-zinc-600 sm:w-auto sm:min-w-32 sm:flex-none ${statusClass(
              selectedStatus,
            )}`}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </span>
      </label>
      <AdminNotice message={message} />
    </div>
  );
}

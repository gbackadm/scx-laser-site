"use client";

import { useEffect, useState, useTransition } from "react";

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
          className={`h-9 w-full rounded-full border px-3 text-xs font-bold outline-none transition disabled:text-zinc-600 sm:w-auto sm:min-w-32 ${statusClass(
            selectedStatus,
          )}`}
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {message ? (
        <span className="text-[0.68rem] font-bold text-zinc-400">
          {message}
        </span>
      ) : null}
    </div>
  );
}
